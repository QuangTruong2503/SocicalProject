export function safeNotificationUrl(value, image = false) {
  if (!value) return '';
  const text = String(value).trim();
  if (text.length > 2048 || /[\s\\]/.test(text)) return '';
  if (!image && /^\/(?!\/)/.test(text)) return text;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname ? text : '';
  } catch { return ''; }
}

export function validateNotification(document) {
  if (!document.title.trim() || document.title.trim().length > 160) return 'Tiêu đề cần từ 1 đến 160 ký tự.';
  if (!document.body.trim() || document.body.trim().length > 10000) return 'Nội dung cần từ 1 đến 10.000 ký tự.';
  if (document.image_url.trim() && !safeNotificationUrl(document.image_url, true)) return 'Ảnh cần đường dẫn HTTPS hợp lệ.';
  if (document.action_url.trim() && !safeNotificationUrl(document.action_url)) return 'Liên kết cần đường dẫn nội bộ hoặc HTTPS hợp lệ.';
  if (Boolean(document.action_url.trim()) !== Boolean(document.action_label.trim())) return 'Hãy nhập cả liên kết và nhãn nút.';
  if (document.action_label.trim().length > 80) return 'Nhãn nút tối đa 80 ký tự.';
  if (document.audience === 'selected' && !document.target_user_ids.length) return 'Hãy chọn ít nhất một người nhận.';
  return '';
}

export function notificationDate(value) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Chưa gửi';
}
