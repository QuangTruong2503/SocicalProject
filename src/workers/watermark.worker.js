// Renders watermarked JPEGs off the main thread with OffscreenCanvas.
// Protocol (all replies carry the request `id`):
//   { type: 'ping' }                                   → { type: 'pong', ok }
//   { type: 'logo', id, bitmap | null }                → { type: 'done', id }
//   { type: 'render', id, file, options, maxDimension, thumbDimension, quality }
//                                                      → { type: 'done', id, blob, thumbBlob } | { type: 'done', id, error }
//   { type: 'resize', id, blob, width, height, quality } → { type: 'done', id, blob } | { type: 'done', id, error }
import { drawLetterboxed, drawWatermark, fitWithin } from '../utils/watermarkRender.js';

let logo = null;

function canRender() {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    return Boolean(canvas.getContext('2d')) && typeof canvas.convertToBlob === 'function' && typeof createImageBitmap === 'function';
  } catch {
    return false;
  }
}

function getContext(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Thiết bị không đủ bộ nhớ để xử lý ảnh này.');
  return ctx;
}

async function render({ file, options, maxDimension, thumbDimension, quality }) {
  const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let canvas = null;
  let thumbCanvas = null;

  try {
    const size = fitWithin(source.width, source.height, maxDimension);
    canvas = new OffscreenCanvas(size.width, size.height);
    drawWatermark(getContext(canvas), source, logo, options, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

    const thumbSize = fitWithin(size.width, size.height, thumbDimension);
    thumbCanvas = new OffscreenCanvas(thumbSize.width, thumbSize.height);
    getContext(thumbCanvas).drawImage(canvas, 0, 0, thumbSize.width, thumbSize.height);
    const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.72 });

    return { blob, thumbBlob };
  } finally {
    source.close();
    // Release the backing stores right away; batches can be hundreds of images.
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (thumbCanvas) { thumbCanvas.width = 0; thumbCanvas.height = 0; }
  }
}

async function resize({ blob, width, height, quality }) {
  const source = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(width, height);

  try {
    drawLetterboxed(getContext(canvas), source, width, height);
    return { blob: await canvas.convertToBlob({ type: 'image/jpeg', quality }) };
  } finally {
    source.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

self.onmessage = async (event) => {
  const message = event.data;

  if (message.type === 'ping') {
    self.postMessage({ type: 'pong', ok: canRender() });
    return;
  }

  try {
    if (message.type === 'logo') {
      logo?.close?.();
      logo = message.bitmap || null;
      self.postMessage({ type: 'done', id: message.id });
      return;
    }

    if (message.type === 'render') {
      self.postMessage({ type: 'done', id: message.id, ...(await render(message)) });
      return;
    }

    if (message.type === 'resize') {
      self.postMessage({ type: 'done', id: message.id, ...(await resize(message)) });
    }
  } catch (error) {
    self.postMessage({ type: 'done', id: message.id, error: error?.message || 'Không thể xử lý ảnh.' });
  }
};
