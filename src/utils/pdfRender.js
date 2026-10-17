/* global __PDFJS_ASSET_VERSION__ -- injected by the pdfjs-assets plugin in vite.config.js */
import { assertFileKind } from './fileConvertChecks.js';

// Largest canvas iOS Safari will allocate; bigger renders come back blank.
export const MAX_CANVAS_PIXELS = 16_777_216;
export const MAX_CANVAS_SIDE = 8192;

let pdfjsPromise = null;

/**
 * Loads PDF.js on first use. The legacy build carries polyfills for the
 * Map/Promise helpers the modern build expects, so older mobile browsers work.
 */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      pdfjsPromise = null;
      throw new Error('Không tải được thư viện đọc PDF. Hãy kiểm tra kết nối và tải lại trang.', { cause: error });
    });
  }
  return pdfjsPromise;
}

/**
 * Readable message for a PDF.js load failure.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describePdfError(error) {
  const name = error?.name || '';
  if (name === 'PasswordException') return 'PDF được đặt mật khẩu mở. Hãy gỡ mật khẩu bằng trình đọc PDF rồi thử lại.';
  if (name === 'InvalidPDFException') return 'File PDF bị hỏng hoặc không đúng định dạng.';
  if (name === 'ResponseException' || name === 'UnknownErrorException') return 'Không đọc được nội dung PDF. File có thể bị hỏng.';
  return error?.message || 'Không mở được file PDF.';
}

/**
 * Opens a PDF for preview/rendering. Call `destroy()` when done; it ends the
 * worker and frees every page.
 *
 * @param {File} file
 * @returns {Promise<{ doc: import('pdfjs-dist').PDFDocumentProxy, numPages: number, encrypted: boolean, destroy: () => Promise<void> }>}
 */
export async function openPdf(file) {
  await assertFileKind(file, ['pdf']);
  const pdfjs = await loadPdfjs();
  let data;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error('Không đọc được file. File có thể đã bị di chuyển hoặc bị khóa.');
  }

  const assets = `${import.meta.env.BASE_URL}pdfjs/${__PDFJS_ASSET_VERSION__}/`;
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
    wasmUrl: `${assets}wasm/`,
    iccUrl: `${assets}iccs/`,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy().catch(() => {});
    throw new Error(describePdfError(error), { cause: error });
  }

  if (doc.numPages < 1) {
    await task.destroy().catch(() => {});
    throw new Error('PDF không có trang nào.');
  }

  let encrypted = false;
  try {
    const { info } = await doc.getMetadata();
    encrypted = Boolean(info?.EncryptFilterName);
  } catch {
    // Metadata is optional; a missing info dictionary is not an error.
  }

  return { doc, numPages: doc.numPages, encrypted, destroy: () => task.destroy().catch(() => {}) };
}

/**
 * Lowers `scale` until the canvas fits the browser's size limits.
 *
 * @param {number} width page width at scale 1 (pt)
 * @param {number} height page height at scale 1 (pt)
 * @param {number} scale requested scale
 * @returns {{ scale: number, limited: boolean }}
 */
export function fitRenderScale(width, height, scale, maxPixels = MAX_CANVAS_PIXELS, maxSide = MAX_CANVAS_SIDE) {
  const byArea = Math.sqrt(maxPixels / (width * height));
  const bySide = maxSide / Math.max(width, height);
  const limit = Math.min(byArea, bySide);
  return scale > limit ? { scale: Math.floor(limit * 1000) / 1000, limited: true } : { scale, limited: false };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Không đủ bộ nhớ để tạo ảnh. Hãy giảm độ phân giải.'))), type, quality);
  });
}

/**
 * Renders one page to an image Blob.
 *
 * @param {import('pdfjs-dist').PDFDocumentProxy} doc
 * @param {number} pageNumber 1-based
 * @param {{ scale?: number, width?: number, type?: 'image/png' | 'image/jpeg', quality?: number, signal?: AbortSignal }} options
 *   `width` fits the page to that many pixels instead of using `scale`.
 * @returns {Promise<{ blob: Blob, width: number, height: number, limited: boolean }>}
 */
export async function renderPageToBlob(doc, pageNumber, { scale = 1, width, type = 'image/png', quality = 0.92, signal } = {}) {
  signal?.throwIfAborted();
  const page = await doc.getPage(pageNumber);
  const canvas = document.createElement('canvas');
  try {
    const base = page.getViewport({ scale: 1 });
    const requested = width ? width / base.width : scale;
    const fitted = fitRenderScale(base.width, base.height, requested);
    const viewport = page.getViewport({ scale: fitted.scale });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const task = page.render({ canvas, viewport, background: '#ffffff' });
    const cancel = () => task.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
    signal?.throwIfAborted();

    const blob = await canvasToBlob(canvas, type, quality);
    return { blob, width: canvas.width, height: canvas.height, limited: fitted.limited };
  } catch (error) {
    if (error?.name === 'RenderingCancelledException') throw new DOMException('Đã hủy', 'AbortError');
    throw error;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}

/**
 * Runs async tasks one at a time. `clear()` drops tasks that have not
 * started; their promises resolve to `null`.
 */
export function createSerialQueue() {
  let pending = [];
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    while (pending.length) {
      const { task, resolve, reject } = pending.shift();
      try {
        resolve(await task());
      } catch (error) {
        reject(error);
      }
    }
    running = false;
  }

  return {
    push(task) {
      return new Promise((resolve, reject) => {
        pending.push({ task, resolve, reject });
        void drain();
      });
    },
    clear() {
      const dropped = pending;
      pending = [];
      dropped.forEach(({ resolve }) => resolve(null));
    },
  };
}
