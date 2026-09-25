import * as XLSX from 'xlsx';
import { KNM_UNITS, newKnmItem } from './knmQuotation.js';

const HEADERS = ['Tên sản phẩm', 'Mô tả', 'Thương hiệu', 'Số lượng', 'ĐVT', 'Đơn giá'];
const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('vi');

function readNumber(value, rowNumber, label, fallback) {
  if (String(value).trim() === '') return fallback;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Dòng ${rowNumber}: ${label} phải là số không âm. Hãy nhập ô dạng số trong Excel, không kèm ký hiệu tiền tệ.`);
  }
  return number;
}

export function parseKnmProductRows(rows) {
  if (!HEADERS.every((header, index) => normalize(rows[0]?.[index]) === normalize(header))) {
    throw new Error('Các cột không đúng mẫu. Vui lòng tải file mẫu và giữ nguyên hàng tiêu đề.');
  }
  const items = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every((cell) => String(cell ?? '').trim() === '')) return;
    const rowNumber = index + 2;
    const name = String(row[0] ?? '').trim();
    if (!name) throw new Error(`Dòng ${rowNumber}: thiếu Tên sản phẩm.`);
    const description = String(row[1] ?? '').trim();
    const enteredUnit = String(row[4] ?? '').trim() || 'Cái';
    const unit = KNM_UNITS.find((candidate) => normalize(candidate) === normalize(enteredUnit));
    items.push({
      ...newKnmItem(),
      description: [name, description].filter(Boolean).join('\n'),
      brand: String(row[2] ?? '').trim(),
      quantity: readNumber(row[3] ?? '', rowNumber, 'Số lượng', 1),
      unit: unit || 'Khác',
      customUnit: unit ? '' : enteredUnit,
      unitPrice: readNumber(row[5] ?? '', rowNumber, 'Đơn giá', 0),
    });
  });
  if (!items.length) throw new Error('Không tìm thấy sản phẩm trong file.');
  return items;
}

export async function parseKnmProductImportFile(file) {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error('Vui lòng chọn file Excel .xlsx hoặc .xls.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Không tìm thấy sheet dữ liệu trong file.');
  return parseKnmProductRows(XLSX.utils.sheet_to_json(sheet, {
    header: 1, blankrows: true, defval: '', raw: true, range: 0,
  }));
}
