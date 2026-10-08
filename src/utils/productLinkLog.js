const LEVEL_LABELS = {
  viewer: 'Xem & copy',
  checker: 'Đánh dấu hoàn thành',
  editor: 'Quản lý dữ liệu',
};

export const LOG_ACTION_OPTIONS = [
  { value: 'check', label: 'Đánh dấu hoàn thành' },
  { value: 'uncheck', label: 'Bỏ đánh dấu' },
  { value: 'copy', label: 'Copy link' },
  { value: 'import', label: 'Nhập dữ liệu' },
  { value: 'create', label: 'Thêm sản phẩm' },
  { value: 'update', label: 'Sửa sản phẩm' },
  { value: 'note', label: 'Sửa ghi chú' },
  { value: 'delete', label: 'Xóa sản phẩm' },
  { value: 'grant', label: 'Cấp quyền' },
  { value: 'revoke', label: 'Thu hồi quyền' },
];

/** Visual tone per action, used for the dot/badge color. */
export const LOG_ACTION_TONE = {
  check: 'success',
  uncheck: 'warning',
  copy: 'neutral',
  import: 'primary',
  create: 'primary',
  update: 'primary',
  note: 'neutral',
  delete: 'danger',
  grant: 'primary',
  revoke: 'danger',
};

/**
 * @param {Object} log row from product_link_logs
 * @returns {{ verb: string, target: string | null, extra: string | null }}
 */
export function describeProductLinkLog(log) {
  const d = log?.details ?? {};
  const target = log?.item_code ?? null;

  switch (log?.action) {
    case 'check':
      return { verb: 'đã hoàn thành', target, extra: null };
    case 'uncheck':
      return { verb: 'đã bỏ đánh dấu', target, extra: null };
    case 'copy':
      if (d.kind === 'code') return { verb: 'đã copy mã', target, extra: null };
      if (d.kind === 'all') return { verb: `đã copy tất cả ${d.count ?? ''} link`.replace(/\s+/g, ' '), target, extra: null };
      return { verb: 'đã copy link', target, extra: d.label ?? null };
    case 'create':
      return { verb: 'đã thêm', target, extra: `${d.link_count ?? 0} link` };
    case 'update': {
      const parts = [];
      if (d.old_code) parts.push(`đổi tên từ "${d.old_code}"`);
      if (d.link_count_before !== d.link_count_after) parts.push(`${d.link_count_before} → ${d.link_count_after} link`);
      return { verb: 'đã sửa', target, extra: parts.join(', ') || null };
    }
    case 'note':
      return { verb: 'đã sửa ghi chú', target, extra: d.note || '(xóa ghi chú)' };
    case 'delete':
      return { verb: 'đã xóa', target, extra: `${d.link_count ?? 0} link` };
    case 'import': {
      const parts = [`${d.created ?? 0} mới`, `${d.updated ?? 0} cập nhật`];
      if (d.skipped) parts.push(`${d.skipped} bỏ qua`);
      if (d.links_added) parts.push(`+${d.links_added} link`);
      return { verb: 'đã nhập dữ liệu', target: null, extra: parts.join(' · ') };
    }
    case 'grant':
      return { verb: `đã cấp quyền "${LEVEL_LABELS[d.level] ?? d.level}" cho`, target: d.target_name ?? 'người dùng', extra: d.previous_level ? `trước đó: ${LEVEL_LABELS[d.previous_level] ?? d.previous_level}` : null };
    case 'revoke':
      return { verb: 'đã thu hồi quyền của', target: d.target_name ?? 'người dùng', extra: null };
    default:
      return { verb: log?.action ?? '', target, extra: null };
  }
}

export function formatRelativeTime(value, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';

  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return 'vừa xong';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return formatDateTime(value);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
