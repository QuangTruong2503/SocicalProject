import { sniffFileKind } from './fileConvertChecks.js';

export const A4_MM = { width: 210, height: 297 };
// Pages sized to the image use 96 px per inch, so a 1920 px photo becomes a ~508 mm page.
const PX_TO_MM = 25.4 / 96;
// PDF viewers reject pages larger than 14 400 pt (200 in).
const MAX_PAGE_MM = 5080;

/**
 * EXIF Orientation (1–8) of a JPEG, or 1 when absent/unreadable.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function readJpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts: no EXIF before it
    const length = view.getUint16(offset + 2);
    if (length < 2) return 1;

    const isExif = marker === 0xe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0;
    if (isExif) {
      const tiff = offset + 10;
      const end = Math.min(offset + 2 + length, view.byteLength);
      if (tiff + 8 > end) return 1;
      const byteOrder = view.getUint16(tiff);
      if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1;
      const little = byteOrder === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > end) return 1;
      const entries = view.getUint16(ifd, little);
      for (let index = 0; index < entries; index += 1) {
        const entry = ifd + 2 + index * 12;
        if (entry + 12 > end) return 1;
        if (view.getUint16(entry, little) === 0x0112) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

/**
 * Page size and image box (all in mm) for one image.
 *
 * @param {{ width: number, height: number }} image pixel size, already upright
 * @param {{ pageSize: 'a4' | 'image', orientation: 'auto' | 'portrait' | 'landscape', marginMm: number }} options
 * @returns {{ pageWidth: number, pageHeight: number, orientation: 'p' | 'l', x: number, y: number, width: number, height: number }}
 */
export function computeImagePageLayout(image, { pageSize, orientation, marginMm }) {
  const margin = Math.max(0, Number(marginMm) || 0);
  let pageWidth;
  let pageHeight;
  let width;
  let height;

  if (pageSize === 'image') {
    width = image.width * PX_TO_MM;
    height = image.height * PX_TO_MM;
    const scale = Math.min(1, (MAX_PAGE_MM - margin * 2) / width, (MAX_PAGE_MM - margin * 2) / height);
    width *= scale;
    height *= scale;
    pageWidth = width + margin * 2;
    pageHeight = height + margin * 2;
  } else {
    const landscape = orientation === 'landscape' || (orientation === 'auto' && image.width > image.height);
    pageWidth = landscape ? A4_MM.height : A4_MM.width;
    pageHeight = landscape ? A4_MM.width : A4_MM.height;
    const boxWidth = Math.max(1, pageWidth - margin * 2);
    const boxHeight = Math.max(1, pageHeight - margin * 2);
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    width = image.width * scale;
    height = image.height * scale;
  }

  return {
    pageWidth,
    pageHeight,
    orientation: pageWidth > pageHeight ? 'l' : 'p',
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Builds a PDF with one image per page. Items are loaded one at a time so
 * only the image being embedded is decoded.
 *
 * @param {{ load: () => Promise<{ bytes: Uint8Array, format: 'JPEG' | 'PNG', width: number, height: number }>, name: string }[]} items
 * @param {{ pageSize: 'a4' | 'image', orientation: 'auto' | 'portrait' | 'landscape', marginMm: number }} options
 * @param {{ onProgress?: (done: number, total: number) => void, signal?: AbortSignal }} [hooks]
 * @returns {Promise<Blob>}
 */
export async function buildImagesPdf(items, options, { onProgress, signal } = {}) {
  if (!items.length) throw new Error('Chưa có ảnh nào.');
  const { jsPDF } = await import('jspdf');
  let doc = null;

  for (let index = 0; index < items.length; index += 1) {
    signal?.throwIfAborted();
    const item = items[index];
    let image;
    try {
      image = await item.load();
    } catch (error) {
      throw new Error(`Ảnh “${item.name}”: ${error.message}`, { cause: error });
    }
    const layout = computeImagePageLayout(image, options);
    const format = [layout.pageWidth, layout.pageHeight];

    if (!doc) doc = new jsPDF({ unit: 'mm', format, orientation: layout.orientation, compress: true });
    else doc.addPage(format, layout.orientation);

    try {
      doc.addImage(image.bytes, image.format, layout.x, layout.y, layout.width, layout.height, `img${index}`, 'FAST');
    } catch (error) {
      throw new Error(`Ảnh “${item.name}” không nhúng được vào PDF. Hãy thử lưu lại ảnh ở định dạng JPG.`, { cause: error });
    }
    onProgress?.(index + 1, items.length);
    // Let the progress bar paint between images.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  signal?.throwIfAborted();
  return doc.output('blob');
}

function canvasToBytes(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Không đủ bộ nhớ để xử lý ảnh này.'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality);
  });
}

/**
 * Browser-only: small upright JPEG preview plus the image's upright size.
 * Fails for files the browser cannot decode, so bad images are caught early.
 *
 * @param {File} file
 * @param {number} [maxSide]
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function createImagePreview(file, maxSide = 240) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Ảnh bị hỏng hoặc trình duyệt không giải mã được.');
  }
  const canvas = document.createElement('canvas');
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không đủ bộ nhớ để xem trước ảnh.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Không tạo được ảnh xem trước.'))), 'image/jpeg', 0.8);
    });
    return { blob, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    bitmap.close();
  }
}

/**
 * Browser-only: reads an image file into what `buildImagesPdf` embeds.
 * Original bytes are kept when possible; a JPEG with an EXIF rotation is
 * redrawn upright because PDF viewers ignore EXIF.
 *
 * @param {File} file
 * @returns {Promise<{ bytes: Uint8Array, format: 'JPEG' | 'PNG', width: number, height: number }>}
 */
export async function prepareImageForPdf(file) {
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error('không đọc được file.');
  }
  const kind = sniffFileKind(bytes);
  if (kind !== 'jpeg' && kind !== 'png') throw new Error('nội dung không phải JPG hoặc PNG.');

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('ảnh bị hỏng hoặc trình duyệt không giải mã được.');
  }

  try {
    const { width, height } = bitmap;
    if (kind === 'png') return { bytes, format: 'PNG', width, height };
    if (readJpegOrientation(bytes) === 1) return { bytes, format: 'JPEG', width, height };

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('không đủ bộ nhớ để xoay ảnh.');
    context.drawImage(bitmap, 0, 0);
    try {
      return { bytes: await canvasToBytes(canvas, 'image/jpeg', 0.92), format: 'JPEG', width, height };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}
