import * as XLSX from 'xlsx';
import { downloadWorkbook } from './fileSaver.js';

const TEMPLATE_HEADERS = ['Tên sản phẩm', 'Mô tả', 'Thương hiệu', 'Số lượng', 'ĐVT', 'Đơn giá'];
const TEMPLATE_EXAMPLE = ['Máy khoan bê tông Bosch GBH 2-26', 'Công suất 830W, kèm phụ kiện', 'Bosch', 1, 'Cái', 2500000];

export function downloadProductImportTemplate() {
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
  sheet['!cols'] = [{ wch: 42 }, { wch: 42 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'San pham');
  downloadWorkbook(workbook, 'Mau-nhap-san-pham.xlsx');
}

export async function parseProductImportFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Không tìm thấy sheet dữ liệu trong file.');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  const items = rows.slice(1)
    .map((row) => ({
      product_name: String(row[0] || '').trim(),
      description: String(row[1] || '').trim(),
      brand: String(row[2] || '').trim(),
      quantity: Number(row[3]) || 1,
      unit: String(row[4] || '').trim() || 'Cái',
      unit_price: Number(row[5]) || 0,
    }))
    .filter((item) => item.product_name);

  if (!items.length) {
    throw new Error('Không tìm thấy sản phẩm hợp lệ trong file (cột A cần có Tên sản phẩm).');
  }
  return items;
}
