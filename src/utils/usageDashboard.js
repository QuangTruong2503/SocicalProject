/**
 * Time ranges, formatting and labels for /admin/usage. Timestamps are stored in
 * UTC; days are always Vietnam days, whatever time zone the admin's computer
 * uses. Ranges are half-open [from, to), matching the SQL.
 */
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
// Asia/Ho_Chi_Minh has been UTC+7 all year since 1975 (no DST).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 400;

export const RANGE_PRESETS = [
  { value: 'today', label: 'Hôm nay', days: 1 },
  { value: '7d', label: '7 ngày', days: 7 },
  { value: '30d', label: '30 ngày', days: 30 },
  { value: '90d', label: '90 ngày', days: 90 },
  { value: 'custom', label: 'Tùy chọn', days: null },
];

/** "YYYY-MM-DD" of the Vietnam calendar day containing `date`. */
export function vnDateKey(date) {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 in Vietnam on day `key` ("YYYY-MM-DD"), or NaN. */
export function vnDayStart(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return Number.NaN;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return vnDateKey(new Date(time)) === key ? time - VN_OFFSET_MS : Number.NaN;
}

/** Last `days` Vietnam days including today: [00:00 first day, 00:00 tomorrow). */
export function presetRange(preset, now = new Date()) {
  const days = RANGE_PRESETS.find((item) => item.value === preset)?.days || 30;
  const tomorrow = vnDayStart(vnDateKey(now)) + DAY_MS;
  return { from: new Date(tomorrow - days * DAY_MS).toISOString(), to: new Date(tomorrow).toISOString() };
}

/** Inclusive Vietnam days from…to → [from 00:00, day after `to` 00:00). */
export function customRange(fromKey, toKey) {
  const from = vnDayStart(fromKey);
  const toStart = vnDayStart(toKey);
  if (Number.isNaN(from) || Number.isNaN(toStart)) return { error: 'Chọn đủ ngày bắt đầu và ngày kết thúc.' };
  if (toStart < from) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
  if ((toStart - from) / DAY_MS + 1 > MAX_RANGE_DAYS) return { error: `Khoảng thời gian tối đa ${MAX_RANGE_DAYS} ngày.` };
  return { from: new Date(from).toISOString(), to: new Date(toStart + DAY_MS).toISOString() };
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TIMEZONE, dateStyle: 'short', timeStyle: 'medium' });
const numberFormatter = new Intl.NumberFormat('vi-VN');

export function formatVnDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateTimeFormatter.format(date) : '—';
}

/** null/undefined → "—" (unknown is never shown as 0). */
export function formatCount(value) {
  return value === null || value === undefined || value === '' ? '—' : numberFormatter.format(Number(value) || 0);
}

/** Estimated USD; small amounts keep enough decimals to be meaningful. Rounded for display only. */
export function formatUsd(value) {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  if (amount === 0) return '$0';
  const digits = Math.abs(amount) >= 1 ? 2 : Math.abs(amount) >= 0.01 ? 4 : 6;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Converted with the admin-configured rate: an indication, not an invoice amount. */
export function formatVnd(usd, rate) {
  const amount = Number(usd) * Number(rate);
  if (!rate || !Number.isFinite(amount)) return null;
  return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}

export function formatPercent(numerator, denominator) {
  const top = Number(numerator);
  const bottom = Number(denominator);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) return '—';
  return `${(Math.round((top / bottom) * 1000) / 10).toLocaleString('vi-VN')}%`;
}

export function formatDuration(ms) {
  const value = Number(ms);
  if (ms === null || ms === undefined || !Number.isFinite(value)) return '—';
  return value >= 1000 ? `${(value / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} s` : `${Math.round(value)} ms`;
}

export const ACTION_LABELS = {
  'image.create': 'Tạo ảnh watermark',
  'image.download': 'Tải ảnh',
  'ai.naming.apply': 'Áp dụng tên AI',
};

export const FEATURE_LABELS = {
  watermark: 'Watermark',
  ai_image_naming: 'Đặt tên ảnh bằng AI',
};

export const ACTIVITY_STATUS_LABELS = {
  succeeded: 'Thành công',
  partial: 'Một phần',
  failed: 'Lỗi',
  cancelled: 'Đã hủy',
};

export const REQUEST_STATUS_LABELS = {
  running: 'Đang chạy',
  succeeded: 'Thành công',
  partial: 'Một phần',
  failed: 'Thất bại',
  rejected: 'Bị từ chối',
  unknown: 'Không xác định',
};

export const ATTEMPT_STATUS_LABELS = {
  running: 'Đang chạy',
  succeeded: 'Provider trả 200',
  failed: 'Provider trả lỗi',
  unknown: 'Không có phản hồi',
};

export const USAGE_STATUS_LABELS = {
  reported: 'Có usage',
  missing: 'Phản hồi không có usage',
  unknown: 'Chưa biết (có thể đã tính phí)',
  not_called: 'Không gọi provider',
};

export const COST_STATUS_LABELS = {
  estimated: 'Đã ước tính',
  unpriced: 'Chưa có giá',
  unknown: 'Chưa biết usage',
  not_applicable: 'Không áp dụng',
};

export const METHOD_LABELS = { single: 'Từng ảnh', direct: 'Lần lượt', zip: 'ZIP' };
export const DELIVERY_LABELS = { browser_handoff: 'Đã gửi tới trình duyệt', file_written: 'Đã ghi file' };

export const ERROR_LABELS = {
  AI_NAMING_ACCESS_DENIED: 'Không đủ quyền (gói)',
  AI_QUOTA_EXCEEDED: 'Vượt hạn mức',
  AI_USAGE_PAUSED: 'Đang tạm dừng',
  IDEMPOTENCY_CONFLICT: 'Trùng mã, khác dữ liệu',
  invalid_request: 'Dữ liệu không hợp lệ',
  payload_too_large: 'Dữ liệu quá lớn',
  not_configured: 'Chưa cấu hình',
  rate_limited: 'Giới hạn tần suất',
  too_many_concurrent: 'Quá nhiều yêu cầu đồng thời',
  lease_expired: 'Mất kết quả (quá thời gian)',
  missing: 'Thiếu kết quả cho ảnh',
  upstream_incomplete: 'Kết quả bị cắt',
  upstream_refused: 'Model từ chối',
  upstream_invalid_output: 'Kết quả sai định dạng',
  upstream_invalid_body: 'Phản hồi không đọc được',
  upstream_quota: 'Hết hạn mức OpenAI',
  upstream_auth: 'Lỗi khóa OpenAI',
  upstream_rate_limited: 'OpenAI giới hạn tần suất',
  upstream_timeout: 'Hết thời gian chờ',
  upstream_unreachable: 'Lỗi kết nối',
  upstream_rejected: 'OpenAI từ chối yêu cầu',
  upstream_error: 'Lỗi máy chủ OpenAI',
  internal_error: 'Lỗi máy chủ',
  picker_cancelled: 'Hủy chọn nơi lưu',
  prepare_failed: 'Lỗi chuẩn bị ảnh',
  pack_failed: 'Lỗi đóng gói ZIP',
  write_failed: 'Lỗi ghi file',
  unexpected: 'Lỗi không mong muốn',
};

export const labelOf = (labels, value) => (value ? labels[value] || value : '—');
