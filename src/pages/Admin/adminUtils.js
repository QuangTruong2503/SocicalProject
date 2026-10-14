// Formatting and export helpers shared by the admin pages.

export { formatDateTime, formatNumber, formatRelative } from '../../utils/formatters.js';
export { downloadCsv } from '../../utils/csv.js';

export function shortId(value) {
  return value ? `${value.slice(0, 8)}…` : '—';
}
