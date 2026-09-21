const DEFAULT_MAX_DIMENSION = 320;
const DEFAULT_QUALITY = 0.72;

/**
 * Draws a File/Blob image onto a small canvas and returns an object URL for
 * the downscaled JPEG. Keeps thumbnail rendering (grids, drag handles) from
 * having to decode full-resolution source photos.
 *
 * @param {File | Blob} file
 * @param {number} maxDimension
 * @param {number} quality
 * @returns {Promise<string>} object URL of the thumbnail blob
 */
export async function createThumbnailUrl(file, maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY) {
  let bitmap = null;
  let tempUrl = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      tempUrl = URL.createObjectURL(file);
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Không thể đọc ảnh.'));
        img.src = tempUrl;
      });
    }

    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Không thể tạo ảnh thu nhỏ.'))),
        'image/jpeg',
        quality,
      );
    });

    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('[imageThumbnail] createThumbnailUrl failed, falling back to original file', error);
    return URL.createObjectURL(file);
  } finally {
    bitmap?.close?.();
    if (tempUrl) {
      URL.revokeObjectURL(tempUrl);
    }
  }
}

/**
 * Generates thumbnails for a batch of files with a limited number of
 * concurrent decodes, calling `onThumbnailReady` as each one finishes so the
 * UI can progressively fill in instead of blocking on the whole batch.
 *
 * @param {File[]} files
 * @param {{ maxDimension?: number, quality?: number, concurrency?: number, onThumbnailReady?: (index: number, url: string) => void }} options
 */
export async function generateThumbnails(files, {
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY,
  concurrency = 4,
  onThumbnailReady,
  shouldContinue = () => true,
} = {}) {
  let cursor = 0;

  async function worker() {
    while (cursor < files.length && shouldContinue()) {
      const index = cursor;
      cursor += 1;
      const url = await createThumbnailUrl(files[index], maxDimension, quality);
      onThumbnailReady?.(index, url);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, files.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
}
