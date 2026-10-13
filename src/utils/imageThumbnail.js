const DEFAULT_MAX_DIMENSION = 320;
const DEFAULT_QUALITY = 0.72;

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return { image: await createImageBitmap(file, { imageOrientation: 'from-image' }), release: (image) => image.close?.() };
    } catch {
      // Fall through to <img>, which can decode a few formats createImageBitmap cannot (e.g. SVG).
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không thể đọc ảnh.'));
      img.src = url;
    });
    return { image, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscaled JPEG of a File/Blob. Throws when the browser cannot decode the
 * image (e.g. HEIC outside Safari), so callers can flag it early.
 *
 * @param {File | Blob} file
 * @param {number} maxDimension
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
export async function createThumbnailBlob(file, maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY) {
  const { image, release } = await decodeImage(file);

  try {
    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Không thể đọc kích thước ảnh.');
    }

    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Thiết bị không đủ bộ nhớ để tạo ảnh thu nhỏ.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    try {
      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error('Không thể tạo ảnh thu nhỏ.'))),
          'image/jpeg',
          quality,
        );
      });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    release(image);
  }
}

/**
 * Generates thumbnails for a batch of files with a limited number of
 * concurrent decodes, reporting each one as it finishes so the UI can fill in
 * progressively. Files the browser cannot decode go to `onThumbnailError`.
 *
 * @param {File[]} files
 * @param {{
 *   maxDimension?: number, quality?: number, concurrency?: number,
 *   onThumbnailReady?: (index: number, url: string) => void,
 *   onThumbnailError?: (index: number, error: Error) => void,
 *   shouldContinue?: () => boolean,
 * }} options
 */
export async function generateThumbnails(files, {
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY,
  concurrency = 4,
  onThumbnailReady,
  onThumbnailError,
  shouldContinue = () => true,
} = {}) {
  let cursor = 0;

  async function worker() {
    while (cursor < files.length && shouldContinue()) {
      const index = cursor;
      cursor += 1;

      try {
        const blob = await createThumbnailBlob(files[index], maxDimension, quality);
        onThumbnailReady?.(index, URL.createObjectURL(blob));
      } catch (error) {
        onThumbnailError?.(index, error);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, files.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
}
