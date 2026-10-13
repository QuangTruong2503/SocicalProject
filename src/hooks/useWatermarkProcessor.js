/**
 * Main-thread canvas processing. Used directly for previews of the logo and as
 * the fallback of src/utils/watermarkEngine.js when Web Workers / OffscreenCanvas
 * are unavailable. Drawing itself lives in src/utils/watermarkRender.js.
 */
import { drawLetterboxed, drawWatermark, fitWithin } from '../utils/watermarkRender.js';

export function loadWatermarkImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error('Đọc ảnh quá thời gian. Hãy thử ảnh khác.')), 30000);
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('Không thể đọc ảnh. Hãy chọn một ảnh hợp lệ.'));
    image.src = url;
  });
}

async function exportCanvas(canvas, draw, quality = 0.92) {
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thiết bị không đủ bộ nhớ để xử lý ảnh này.');
    draw(context);
    return await new Promise((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Không thể xuất ảnh. Hãy thử ảnh nhỏ hơn.')),
      'image/jpeg', quality,
    ));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * @param {File | Blob} sourceFile
 * @param {string | HTMLImageElement | HTMLCanvasElement | ImageBitmap | null} logo URL or decoded image
 * @param {{ maxDimension?: number, quality?: number } & Record<string, unknown>} options
 */
export async function processWatermark(sourceFile, logo, options = {}) {
  const sourceUrl = URL.createObjectURL(sourceFile);
  try {
    const img = await loadWatermarkImage(sourceUrl);
    const logoImage = typeof logo === 'string' ? await loadWatermarkImage(logo) : logo;
    const canvas = document.createElement('canvas');
    const size = fitWithin(img.naturalWidth, img.naturalHeight, options.maxDimension);
    canvas.width = size.width;
    canvas.height = size.height;
    return await exportCanvas(
      canvas,
      (ctx) => drawWatermark(ctx, img, logoImage, options, size.width, size.height),
      options.quality ?? 0.92,
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Resize with white letterboxing, preserving the source aspect ratio. */
export async function resizeBlob(blob, width = 800, height = 600) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadWatermarkImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return await exportCanvas(canvas, (ctx) => drawLetterboxed(ctx, img, width, height), 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function normalizeImageName(value, fallback = 'image') {
  const base = String(value || '').trim().replace(/\.(jpe?g|png|webp|gif|svg|avif|bmp|heic|tiff?)$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '').slice(0, 180);
  return `${base || fallback}.jpg`;
}

export function buildFileName(baseName, index, total) {
  const name = normalizeImageName(baseName).slice(0, -4);
  return total === 1 ? `${name}.jpg` : `${name}_${String(index + 1).padStart(2, '0')}.jpg`;
}

/**
 * Final download names for a list of results: normalized, with "-2", "-3"…
 * appended to case-insensitive duplicates. ZIP entries, single downloads and
 * Haravan links all use this so they always agree.
 * @param {Array<{ fileName: string }>} results
 * @returns {string[]}
 */
export function getUniqueFileNames(results) {
  const used = new Set();

  return results.map((result) => {
    const normalized = normalizeImageName(result.fileName);
    let candidate = normalized;
    let suffix = 2;

    while (used.has(candidate.toLocaleLowerCase('vi'))) {
      candidate = normalized.replace(/\.jpg$/i, `-${suffix}.jpg`);
      suffix += 1;
    }

    used.add(candidate.toLocaleLowerCase('vi'));
    return candidate;
  });
}
