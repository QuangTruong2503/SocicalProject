import { supabase } from '../lib/supabase.js';

export const NOTIFICATION_IMAGE_BUCKET = 'notification-images';
export const NOTIFICATION_IMAGE_LIMIT = 5 * 1024 * 1024;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export function validateNotificationImage(file) {
  if (!file || !extensions[file.type]) return 'Chọn ảnh JPG, PNG, WebP hoặc GIF.';
  if (!file.size || file.size > NOTIFICATION_IMAGE_LIMIT) return 'Ảnh cần có dung lượng từ 1 byte đến 5 MB.';
  return '';
}

export async function uploadNotificationImage(file, userId) {
  const error = validateNotificationImage(file);
  if (error) return { data: null, error };
  if (!userId) return { data: null, error: 'Vui lòng đăng nhập để tải ảnh.' };
  try {
    const path = `${userId}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const { error: failure } = await supabase.storage.from(NOTIFICATION_IMAGE_BUCKET).upload(path, file, {
      contentType: file.type, cacheControl: '300', upsert: false,
    });
    if (failure) return { data: null, error: 'Không thể tải ảnh lên. Kiểm tra kết nối và cấu hình Storage, rồi thử lại.' };
    return { data: { path }, error: null };
  } catch { return { data: null, error: 'Không thể kết nối để tải ảnh. Vui lòng thử lại.' }; }
}

export async function removeNotificationImage(path) {
  if (!path) return { error: null };
  try {
    const { error } = await supabase.storage.from(NOTIFICATION_IMAGE_BUCKET).remove([path]);
    return { error: error ? 'Chưa thể dọn ảnh cũ trên Storage.' : null };
  } catch { return { error: 'Chưa thể dọn ảnh cũ trên Storage.' }; }
}

export async function signNotificationImage(path) {
  try {
    const { data, error } = await supabase.storage.from(NOTIFICATION_IMAGE_BUCKET).createSignedUrl(path, 300);
    return { data: error ? null : data?.signedUrl, error: error || !data?.signedUrl ? 'Không tải được ảnh thông báo.' : null };
  } catch { return { data: null, error: 'Không tải được ảnh thông báo.' }; }
}
