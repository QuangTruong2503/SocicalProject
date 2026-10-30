import * as XLSX from 'xlsx';
import { downloadWorkbook } from './fileSaver.js';

export function createProductLinkWorkbook(items) {
  if (!items.length) throw new Error('Chưa có sản phẩm nào để tải Excel.');

  const linkCount = items.reduce((max, item) => Math.max(max, item.links.length), 1);
  const headers = ['Mã sản phẩm', ...Array.from({ length: linkCount }, (_, index) => `Link ảnh ${index + 1}`)];
  const rows = items.map((item) => [String(item.code), ...item.links]);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = [{ wch: 36 }, ...Array.from({ length: linkCount }, () => ({ wch: 70 }))];
  sheet['!autofilter'] = { ref: sheet['!ref'] };

  items.forEach((item, rowIndex) => {
    item.links.forEach((link, columnIndex) => {
      if (/^https?:\/\//i.test(link)) {
        sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex + 1 })].l = { Target: link };
      }
    });
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Link anh san pham');
  return workbook;
}

export function exportProductLinksToExcel(items, companyName) {
  const workbook = createProductLinkWorkbook(items);
  const name = Array.from(String(companyName)).filter((char) => char.charCodeAt(0) >= 32)
    .join('').replace(/[<>:"/\\|?*]/g, '-').trim() || 'Cong-ty';
  downloadWorkbook(workbook, `Link-anh-san-pham-${name}.xlsx`);
}
