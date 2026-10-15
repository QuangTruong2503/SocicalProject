export const MEMORY_IMAGE_LIMIT = 10 * 1024 * 1024;
export const MEMORY_UPLOAD_BATCH = 20;
export function validateMemoryImage(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) return 'Chọn ảnh JPG, PNG hoặc WebP.';
  if (!file.size || file.size > MEMORY_IMAGE_LIMIT) return 'Mỗi ảnh cần có dung lượng từ 1 byte đến 10 MB.';
  return '';
}
export async function prepareMemoryUpload(file, {
  decode = (value) => createImageBitmap(value, { imageOrientation:'from-image' }),
  createCanvas = () => document.createElement('canvas'),
} = {}) {
  const error = validateMemoryImage(file);
  if (error) throw new Error(error);
  let bitmap;
  try {
    bitmap = await decode(file);
    if (Math.min(bitmap.width,bitmap.height) < 64 || bitmap.width * bitmap.height > 40000000) throw new Error('Ảnh cần tối thiểu 64 × 64px và tối đa 40 triệu điểm ảnh.');
    const scale = Math.min(1,1024 / Math.max(bitmap.width,bitmap.height));
    const canvas = createCanvas();
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt chưa hỗ trợ xử lý ảnh.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve,'image/webp',0.86));
    if (!blob || !['image/webp','image/png','image/jpeg'].includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error('Không thể tối ưu ảnh xuống dưới 5 MB.');
    return {blob,width:canvas.width,height:canvas.height,originalSize:file.size};
  } catch (error) {
    if (error instanceof Error && /^(Ảnh cần|Không thể tối ưu|Trình duyệt)/.test(error.message)) throw error;
    throw new Error('Không đọc được ảnh. Hãy chọn file JPG, PNG hoặc WebP hợp lệ.');
  } finally { bitmap?.close?.(); }
}
export function memoryStorageReference(image, config, bucket = config.uploadBucket) {
  try {
    const url = new URL(image); const origin = new URL(config.url).origin;
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (url.origin !== origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!/^memory-cards\/[a-zA-Z0-9._-]+$/.test(path) || path.includes('..')) return null;
    return path;
  } catch { return null; }
}
export function memoryCardName(row) { return row.name?.trim() || `Ảnh số ${row.id}`; }
export function memoryCardImage(row) { return /^https?:\/\//.test(row.image ?? '') ? row.image : ''; }
