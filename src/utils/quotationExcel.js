import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

/**
 * Build a safe filename segment.
 * @param {string} value
 * @returns {string}
 */
function toSafeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create the filename for a quotation export.
 * @param {{ shortName?: string, name?: string, documentNo?: string, date?: string }} company
 * @returns {string}
 */
export function buildQuotationExcelFileName(company = {}, customer = {}) {
  const companySegment = toSafeSegment(company.shortName || company.name || 'quotation');
  const documentNo = toSafeSegment(customer.documentNo || '');
  const date = dayjs(customer.date || undefined).format('YYYYMMDD');
  const docPart = documentNo ? `-${documentNo}` : '';

  return `quotation-${companySegment}${docPart}-${date}.xlsx`;
}

/**
 * Export a quotation snapshot to an Excel file.
 * @param {{
 *   company: { name?: string, shortName?: string, taxCode?: string, taxAddress?: string, phone?: string, email?: string, bankName?: string, bankAccount?: string, representative?: string },
 *   customer: object,
 *   products: Array<{
 *     id?: string|number,
 *     code?: string,
 *     name?: string,
 *     unit?: string,
 *     quantity?: number,
 *     price?: number,
 *     vat?: number,
 *     total?: number,
 *     subtotal?: number,
 *     vatAmount?: number,
 *   }>,
 *   summary: { subtotal: number, vatAmount: number, total: number, totalInWords: string }
 * }} payload
 * @returns {string} Generated filename
 */
export function exportQuotationToExcel({ company, customer, products = [], summary }) {
  const headerRows = [
    ['PHIẾU BÁO GIÁ / ĐƠN HÀNG'],
    ['Đơn vị phát hành', company?.name || ''],
    ['Địa chỉ', company?.taxAddress || ''],
    ['Mã số thuế', company?.taxCode || ''],
    ['Điện thoại', company?.phone || ''],
    ['Email', company?.email || ''],
    ['Ngân hàng', company?.bankName || ''],
    ['Số tài khoản', company?.bankAccount || ''],
    ['Người đại diện', company?.representative || ''],
    [],
    ['Khách hàng', customer?.companyName || ''],
    ['Mã số thuế KH', customer?.taxCode || ''],
    ['Địa chỉ thuế KH', customer?.taxAddress || ''],
    ['Số điện thoại KH', customer?.phone || ''],
    ['Địa chỉ giao hàng', customer?.shippingAddress || ''],
    ['Ngày báo giá', customer?.date ? dayjs(customer.date).format('DD/MM/YYYY') : ''],
    ['Số chứng từ', customer?.documentNo || ''],
    ['Ghi chú', customer?.note || ''],
    [],
    ['STT', 'Mã SP', 'Tên hàng', 'ĐVT', 'SL', 'Đơn giá', 'VAT %', 'Thành tiền', 'VAT tiền'],
  ];

  const productRows = products.map((product, index) => [
    index + 1,
    product.code || '',
    product.name || '',
    product.unit || '',
    Number(product.quantity) || 0,
    Number(product.price) || 0,
    Number(product.vat) || 0,
    Number(product.total) || 0,
    Number(product.vatAmount) || 0,
  ]);

  const footerRows = [
    [],
    ['Tổng tiền trước VAT', '', '', '', '', '', '', Number(summary?.subtotal) || 0, ''],
    ['Tổng VAT', '', '', '', '', '', '', Number(summary?.vatAmount) || 0, ''],
    ['Tổng thanh toán', '', '', '', '', '', '', Number(summary?.total) || 0, ''],
    ['Số tiền bằng chữ', summary?.totalInWords || ''],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([
    ...headerRows,
    ...productRows,
    ...footerRows,
  ]);

  const tableHeaderRowIndex = headerRows.length;
  const productStartRowIndex = tableHeaderRowIndex + 1;
  const productEndRowIndex = productStartRowIndex + productRows.length - 1;
  const subtotalRowIndex = productEndRowIndex + 2;
  const vatRowIndex = productEndRowIndex + 3;
  const totalRowIndex = productEndRowIndex + 4;

  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 34 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 16 },
  ];

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 1 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 1 }, e: { r: 2, c: 8 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 8 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 8 } },
    { s: { r: 5, c: 1 }, e: { r: 5, c: 8 } },
    { s: { r: 6, c: 1 }, e: { r: 6, c: 8 } },
    { s: { r: 7, c: 1 }, e: { r: 7, c: 8 } },
    { s: { r: 8, c: 1 }, e: { r: 8, c: 8 } },
    { s: { r: 9, c: 1 }, e: { r: 9, c: 8 } },
    { s: { r: 10, c: 1 }, e: { r: 10, c: 8 } },
    { s: { r: 11, c: 1 }, e: { r: 11, c: 8 } },
    { s: { r: 12, c: 1 }, e: { r: 12, c: 8 } },
    { s: { r: 13, c: 1 }, e: { r: 13, c: 8 } },
    { s: { r: 14, c: 1 }, e: { r: 14, c: 8 } },
    { s: { r: 15, c: 1 }, e: { r: 15, c: 8 } },
    { s: { r: 16, c: 1 }, e: { r: 16, c: 8 } },
    { s: { r: 17, c: 1 }, e: { r: 17, c: 8 } },
    { s: { r: 18, c: 1 }, e: { r: 18, c: 8 } },
    { s: { r: subtotalRowIndex, c: 0 }, e: { r: subtotalRowIndex, c: 6 } },
    { s: { r: vatRowIndex, c: 0 }, e: { r: vatRowIndex, c: 6 } },
    { s: { r: totalRowIndex, c: 0 }, e: { r: totalRowIndex, c: 6 } },
  ];

  const currencyColumns = ['F', 'H', 'I'];
  for (let rowIndex = productStartRowIndex; rowIndex <= productEndRowIndex; rowIndex += 1) {
    currencyColumns.forEach((column) => {
      const cellAddress = `${column}${rowIndex + 1}`;
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].z = '#,##0';
      }
    });
  }

  ['H', 'H', 'H'].forEach((column, index) => {
    const rowIndex = [subtotalRowIndex, vatRowIndex, totalRowIndex][index] + 1;
    const cellAddress = `${column}${rowIndex}`;
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].z = '#,##0';
    }
  });

  worksheet['A1'].s = { font: { bold: true, sz: 16 } };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'BaoGia');

  const fileName = buildQuotationExcelFileName(company, customer);
  XLSX.writeFile(workbook, fileName, { compression: true });
  return fileName;
}
