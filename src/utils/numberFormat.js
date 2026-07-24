/**
 * Format a number into Vietnamese currency style.
 * @param {number|string} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const numericValue = Number(value) || 0;
  return new Intl.NumberFormat('vi-VN').format(Math.round(numericValue));
}

/**
 * Parse a formatted currency string into a safe integer.
 * @param {string|number} value
 * @returns {number}
 */
export function parseCurrency(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  const cleaned = String(value || '')
    .replace(/[^\d-]/g, '')
    .trim();

  if (!cleaned) {
    return 0;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Format a numeric field that should stay integer-based.
 * @param {number|string} value
 * @returns {string}
 */
export function formatInteger(value) {
  const numericValue = Number(value) || 0;
  return Number.isFinite(numericValue) ? String(Math.round(numericValue)) : '0';
}

