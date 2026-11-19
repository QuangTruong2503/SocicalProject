import * as XLSX from 'xlsx';
import { saveAs } from './fileSaver.js';
import { getOutputFolderName } from './watermarkAutoFolderNames.js';
import { getAiFolderNameError, normalizeFolderName } from '../../supabase/functions/suggest-image-names/folderNaming.js';

export const FOLDER_EXCEL_HEADERS = ['ID folder', 'Đường dẫn nguồn', 'Tên folder hiện tại', 'Tên folder mới'];
const SHEET_NAME = 'Ten folder san pham';

export function createFolderNameWorkbook(products, aiNamesById) {
  if (!products.length) throw new Error('Chưa có thư mục sản phẩm để xuất Excel.');
  const rows = products.map((product) => {
    const currentName = getOutputFolderName(product);
    const newName = aiNamesById ? normalizeFolderName(aiNamesById.get(product.excelId)) : currentName;
    return [product.excelId, product.relativePath, currentName, newName];
  });
  const sheet = XLSX.utils.aoa_to_sheet([FOLDER_EXCEL_HEADERS, ...rows]);
  if (aiNamesById) {
    rows.forEach((_, index) => {
      const rowNumber = index + 2;
      const cell = sheet[`D${rowNumber}`];
      const error = getAiFolderNameError(cell?.v);
      if (error || cell?.t !== 's') throw new Error(`Dòng ${rowNumber}: ${error || 'Tên folder phải là văn bản.'}`);
    });
  }
  sheet['!cols'] = [{ wch: 40 }, { wch: 60 }, { wch: 45 }, { wch: 45 }];
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  return workbook;
}

export function exportFolderNamesToExcel(products, aiNamesById) {
  const data = XLSX.write(createFolderNameWorkbook(products, aiNamesById), { type: 'array', bookType: 'xlsx' });
  saveAs(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'Watermark-ten-folder-san-pham.xlsx');
}

export async function parseFolderNameFile(file) {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error('Vui lòng chọn file Excel .xlsx hoặc .xls.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = workbook.Sheets[SHEET_NAME] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('Không tìm thấy sheet dữ liệu trong Excel.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value).trim());
  const idColumn = headers.indexOf(FOLDER_EXCEL_HEADERS[0]);
  const nameColumn = headers.indexOf(FOLDER_EXCEL_HEADERS[3]);
  if (idColumn < 0 || nameColumn < 0
    || headers.lastIndexOf(FOLDER_EXCEL_HEADERS[0]) !== idColumn
    || headers.lastIndexOf(FOLDER_EXCEL_HEADERS[3]) !== nameColumn) {
    throw new Error('Excel cần có đúng một cột “ID folder” và một cột “Tên folder mới”. Hãy dùng file đã xuất từ trang này.');
  }
  const start = XLSX.utils.decode_range(sheet['!ref']).s;
  return rows.slice(1).flatMap((row, index) => {
    if (row.every((value) => String(value).trim() === '')) return [];
    const rowIndex = start.r + index + 1;
    for (const column of [idColumn, nameColumn]) {
      if (sheet[XLSX.utils.encode_cell({ r: rowIndex, c: start.c + column })]?.f) {
        throw new Error(`Dòng ${rowIndex + 1}: ID và tên folder phải là văn bản, không dùng công thức.`);
      }
    }
    return [{ id: String(row[idColumn] ?? '').trim(), name: String(row[nameColumn] ?? ''), rowNumber: rowIndex + 1 }];
  });
}
