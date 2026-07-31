import * as XLSX from 'xlsx';

export function downloadWorkbook(workbook, fileName) {
  XLSX.writeFile(workbook, fileName, {
    bookType: 'xlsx',
  });
}

export function saveAs(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
