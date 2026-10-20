// Rules for a new avatar picture (Dashboard → Avatar). The file is compressed in
// the browser before upload, so the limit only keeps compression reasonably fast.

export const AVATAR_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_UPLOAD_ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
export const AVATAR_UPLOAD_LIMIT = 10 * 1024 * 1024;
export const AVATAR_UPLOAD_HINT = 'JPG, PNG hoặc WebP · tối đa 10 MB';

/** @returns {string} A Vietnamese error, or '' when the file can be used. */
export function validateAvatarFile(file) {
  if (!file) return 'Hãy chọn một ảnh.';
  if (!AVATAR_UPLOAD_TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (!file.size) return 'File ảnh trống. Hãy chọn ảnh khác.';
  if (file.size > AVATAR_UPLOAD_LIMIT) return 'Ảnh lớn hơn 10 MB. Hãy chọn ảnh nhỏ hơn.';
  return '';
}

export const AVATAR_SOURCE_LABELS = {
  upload: 'Ảnh tải lên gần nhất',
  profile: 'Ảnh trong hồ sơ',
  provider: 'Ảnh từ tài khoản đăng nhập',
  none: 'Chữ viết tắt (chưa có ảnh)',
};
