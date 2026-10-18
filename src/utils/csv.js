function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Text that a spreadsheet would read as a formula (=, +, -, @, tab, CR) gets a
 * leading apostrophe, so data typed by users can never run as a formula.
 * Numbers are left as numbers.
 */
export function neutralizeCsvFormula(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Download rows as a CSV file Excel opens correctly (UTF-8 with BOM).
 * @param {string[]} header
 * @param {Array<Array<unknown>>} rows
 * @param {string} fileName
 * @param {{ neutralizeFormulas?: boolean }} [options]
 */
export function downloadCsv(header, rows, fileName, { neutralizeFormulas = false } = {}) {
  const BOM = String.fromCharCode(0xfeff);
  const cell = neutralizeFormulas ? (value) => escapeCsv(neutralizeCsvFormula(value)) : escapeCsv;
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  const blob = new Blob([BOM, lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
