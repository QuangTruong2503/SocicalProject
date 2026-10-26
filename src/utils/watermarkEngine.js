import { loadWatermarkImage, processWatermark, resizeBlob } from '../hooks/useWatermarkProcessor.js';
import { createThumbnailBlob } from './imageThumbnail.js';
import { MAX_OUTPUT_DIMENSION } from './watermarkRender.js';

const THUMB_DIMENSION = 360;
const JPEG_QUALITY = 0.92;
const WORKER_HANDSHAKE_MS = 3000;
// Logos are rasterized once (SVG included) and capped so the bitmap stays small.
const MAX_LOGO_DIMENSION = 2048;

function supportsWorkerRendering() {
  return typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap === 'function';
}

/** Decode a logo URL once into a canvas (works for SVG, which workers cannot decode). */
async function rasterizeLogo(url) {
  const image = await loadWatermarkImage(url);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('Logo không có kích thước hợp lệ. Hãy dùng PNG hoặc SVG có kích thước.');
  }

  const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Renders watermarked images in a Web Worker (OffscreenCanvas), falling back to
 * the main thread when the browser lacks support, the worker crashes, or a
 * single image cannot be decoded inside the worker.
 *
 *   const engine = createWatermarkEngine();
 *   await engine.setLogo(url);
 *   const { blob, thumbBlob } = await engine.render(file, options);
 *   engine.dispose();
 */
export function createWatermarkEngine() {
  let worker = null;
  let workerReady = null;
  let nextId = 0;
  const pending = new Map();
  let logoCanvas = null;
  let logoTask = Promise.resolve();
  let disposed = false;

  function rejectAll(error) {
    pending.forEach(({ reject }) => reject(error));
    pending.clear();
  }

  function shutdownWorker(error) {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerReady = Promise.resolve(false);
    rejectAll(Object.assign(error || new Error('Worker stopped.'), { workerCrashed: true }));
  }

  function ensureWorker() {
    if (workerReady) return workerReady;

    if (!supportsWorkerRendering()) {
      workerReady = Promise.resolve(false);
      return workerReady;
    }

    workerReady = new Promise((resolve) => {
      try {
        worker = new Worker(new URL('../workers/watermark.worker.js', import.meta.url), { type: 'module' });
      } catch {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => resolve(false), WORKER_HANDSHAKE_MS);

      worker.onmessage = (event) => {
        const message = event.data;

        if (message.type === 'pong') {
          clearTimeout(timeout);
          resolve(Boolean(message.ok));
          return;
        }

        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);

        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message);
      };

      worker.onerror = (event) => {
        clearTimeout(timeout);
        event.preventDefault?.();
        resolve(false);
        shutdownWorker(new Error(event.message || 'Worker error.'));
      };

      worker.postMessage({ type: 'ping' });
    }).then((ok) => {
      if (!ok && worker) {
        worker.terminate();
        worker = null;
      }
      return ok;
    });

    return workerReady;
  }

  function callWorker(message, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  async function renderOnMainThread(file, options, maxDimension) {
    const blob = await processWatermark(file, logoCanvas, { ...options, maxDimension, quality: JPEG_QUALITY });
    const thumbBlob = await createThumbnailBlob(blob, THUMB_DIMENSION);
    return { blob, thumbBlob, engine: 'main' };
  }

  return {
    /** Resolves to true when rendering happens off the main thread. */
    usesWorker: () => ensureWorker(),

    /** Set (url) or clear (null) the logo for every following render. */
    setLogo(url) {
      logoTask = logoTask.catch(() => {}).then(async () => {
        logoCanvas = url ? await rasterizeLogo(url) : null;

        if (await ensureWorker()) {
          const bitmap = logoCanvas ? await createImageBitmap(logoCanvas) : null;
          await callWorker({ type: 'logo', bitmap }, bitmap ? [bitmap] : []);
        }
      });
      return logoTask;
    },

    /**
     * @param {File | Blob} file
     * @param {Record<string, unknown>} options watermark options (size, opacity, tiled, logoPosition, margin)
     * @param {{ maxDimension?: number }} [overrides] e.g. a smaller size for previews. Omitted → MAX_OUTPUT_DIMENSION;
     *   KEEP_ORIGINAL_SIZE (0) → no downscaling at all, in the worker and in the fallback alike.
     * @returns {Promise<{ blob: Blob, thumbBlob: Blob, engine: 'worker' | 'main' }>}
     */
    async render(file, options, overrides = {}) {
      if (disposed) throw new Error('Engine disposed.');
      // A failed logo update is reported by setLogo(); rendering continues with what is loaded.
      await logoTask.catch(() => {});
      const maxDimension = overrides.maxDimension ?? MAX_OUTPUT_DIMENSION;

      if (await ensureWorker()) {
        try {
          const result = await callWorker({
            type: 'render',
            file,
            options,
            maxDimension,
            thumbDimension: THUMB_DIMENSION,
            quality: JPEG_QUALITY,
          });
          return { blob: result.blob, thumbBlob: result.thumbBlob, engine: 'worker' };
        } catch (error) {
          if (disposed) throw error;
          // Decode failures in the worker (or a crash) get one more try on the main thread.
          console.warn('[watermarkEngine] worker render failed, retrying on main thread', error);
        }
      }

      return renderOnMainThread(file, options, maxDimension);
    },

    /** Letterboxed resize (e.g. 800×600) for downloads. */
    async resize(blob, width, height) {
      if (await ensureWorker()) {
        try {
          const result = await callWorker({ type: 'resize', blob, width, height, quality: 0.9 });
          return result.blob;
        } catch (error) {
          console.warn('[watermarkEngine] worker resize failed, retrying on main thread', error);
        }
      }
      return resizeBlob(blob, width, height);
    },

    dispose() {
      disposed = true;
      shutdownWorker(new Error('Engine disposed.'));
    },
  };
}
