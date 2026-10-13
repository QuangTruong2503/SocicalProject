// Formatting and export helpers shared by the admin pages.

export { formatDateTime, formatNumber, formatRelative } from '../../utils/formatters.js';

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
