// Formatting and export helpers shared by the admin pages.

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

export function shortId(value) {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Download rows as a CSV file Excel opens correctly (UTF-8 with BOM).
 * @param {string[]} header
 * @param {Array<Array<unknown>>} rows
 * @param {string} fileName
 */
export function downloadCsv(header, rows, fileName) {
  const BOM = String.fromCharCode(0xfeff);
  const lines = [header, ...rows].map((row) => row.map(escapeCsv).join(','));
  const blob = new Blob([BOM, lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
