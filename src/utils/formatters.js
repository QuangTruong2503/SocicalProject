// Vietnamese number / date formatting shared across pages.

const numberFormatter = new Intl.NumberFormat('vi-VN');
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
const RELATIVE_UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

export function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

/** "3 giờ trước", "hôm qua"… */
export function formatRelative(value) {
  const date = parseDate(value);

  if (!date) {
    return '—';
  }

  const diffSeconds = (date.getTime() - Date.now()) / 1000;

  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return relativeFormatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return 'vừa xong';
}
