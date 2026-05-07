import * as XLSX from 'xlsx';

export function downloadWorkbook(workbook, fileName) {
  XLSX.writeFile(workbook, fileName, {
    bookType: 'xlsx',
  });
}

