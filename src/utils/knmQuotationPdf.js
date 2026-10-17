import dayjs from 'dayjs';
import { formatCurrency } from './numberFormat.js';
import { numberToVietnamese } from './numberToVietnamese.js';
import {
  calculateKnmTotals, finalizeKnmQuotation, knmFileSlug, knmItemVatRate,
  knmLineAmount, knmStampScale, knmUnitPrice, resolveKnmUnit, resolveValidUntil,
} from './knmQuotation.js';

const MARGIN = 14;
const WIDTH = 182;
const BOTTOM = 283;
const LINE = 4;
const BLUE = [7, 62, 104];
const quantityFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

function base64(buffer) {
  let value = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(value);
}

async function loadFont(name) {
  const response = await fetch(`/fonts/NotoSans-${name}.ttf`);
  if (!response.ok) throw new Error('Không tải được phông chữ PDF. Vui lòng thử lại.');
  return base64(await response.arrayBuffer());
}

async function loadImage(url) {
  if (!url) return null;
  // Load before creating the document: an unavailable stamp/QR must not silently disappear.
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không tải được logo, dấu mộc hoặc QR để xuất PDF.');
  const blob = await response.blob();
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được ảnh để xuất PDF.'));
    reader.readAsDataURL(blob);
  });
  return data;
}

/** Build separately from download so pagination and document contents can be verified. */
export async function buildKnmQuotationPdf(company, source) {
  const quotation = finalizeKnmQuotation(source);
  const totals = calculateKnmTotals(quotation);
  const [{ jsPDF }, regular, bold, logo, stamp, qr] = await Promise.all([
    import('jspdf'), loadFont('Regular'), loadFont('Bold'),
    loadImage(company.showLogo !== false ? company.logo : null),
    loadImage(company.showStamp ? company.stamp : null), loadImage(company.bankQr),
  ]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', regular);
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', bold);
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  pdf.setProperties({ title: `Báo giá ${quotation.quotationNo || 'KNM'}`, author: company.name });
  let y = MARGIN;

  function font(boldText = false, size = 8) {
    pdf.setFont('NotoSans', boldText ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(31, 41, 55);
  }
  function lines(value, width = WIDTH, boldText = false, size = 8) {
    font(boldText, size);
    return pdf.splitTextToSize(String(value ?? ''), width);
  }
  function paint(value, x, top, { bold: boldText = false, size = 8, align = 'left' } = {}) {
    font(boldText, size);
    pdf.text(value, x, top, { baseline: 'top', align, lineHeightFactor: LINE / (size * 25.4 / 72) });
  }
  function page() { pdf.addPage(); y = MARGIN; }
  function ensure(height) { if (y + height > BOTTOM) page(); }
  function text(value, { width = WIDTH, x = MARGIN, bold: boldText = false, size = 8 } = {}) {
    for (const line of lines(value, width, boldText, size)) {
      ensure(LINE);
      paint(line, x, y, { bold: boldText, size });
      y += LINE;
    }
  }
  function image(data, x, top, maxWidth, maxHeight) {
    const props = pdf.getImageProperties(data);
    const ratio = Math.min(maxWidth / props.width, maxHeight / props.height);
    const width = props.width * ratio;
    const height = props.height * ratio;
    pdf.addImage(data, x + (maxWidth - width) / 2, top, width, height, undefined, 'FAST');
  }
  function heading(value) { ensure(9); text(value, { bold: true, size: 9 }); y += 2; }

  const headerTop = y;
  if (logo) image(logo, MARGIN, y, 22, 22);
  const headerX = MARGIN + (logo ? 26 : 0);
  const headerWidth = WIDTH - (logo ? 26 : 0);
  text(company.name, { x: headerX, width: headerWidth, bold: true, size: 10 });
  text(`MST: ${company.taxCode}`, { x: headerX, width: headerWidth });
  text(`Địa chỉ: ${company.address}`, { x: headerX, width: headerWidth });
  text(`Hotline: ${company.hotline} · Email: ${company.email}${company.website ? ` · ${company.website}` : ''}`, { x: headerX, width: headerWidth });
  y = Math.max(y, headerTop + (logo ? 22 : 0)) + 3;
  pdf.setDrawColor(...BLUE);
  pdf.line(MARGIN, y, MARGIN + WIDTH, y);
  y += 5;
  paint('BÁO GIÁ', 105, y, { bold: true, size: 20, align: 'center' });
  y += 14;
  text(`Số báo giá: ${quotation.quotationNo || 'Chưa cấp số'} · Ngày: ${dayjs(quotation.quotationDate).format('DD/MM/YYYY')} · Hiệu lực đến: ${dayjs(resolveValidUntil(quotation.quotationDate, quotation.validityDays)).format('DD/MM/YYYY')}`);
  y += 3;
  heading('THÔNG TIN KHÁCH HÀNG');
  const customer = quotation.customer || {};
  for (const [label, value] of [
    ['Khách hàng / Công ty', customer.name], ['Người liên hệ', customer.contact],
    ['Điện thoại', customer.phone], ['Email', customer.email],
    ['Mã số thuế', customer.taxCode], ['Địa chỉ', customer.address],
  ]) text(`${label}: ${value || '—'}`);
  y += 3;
  text('Kính gửi Quý khách hàng,', { bold: true });
  text(`${company.name} trân trọng gửi đến Quý khách bảng báo giá như sau:`);
  y += 3;

  const perItem = totals.vatMode === 'per_item';
  const splitVat = totals.vatMode !== 'included';
  const widths = perItem ? [8, 54, 22, 13, 12, 25, 12, 36] : [8, 62, 23, 14, 13, 27, 35];
  const headers = ['STT', 'Tên và mô tả sản phẩm', 'Thương hiệu', 'SL', 'ĐVT', splitVat ? 'Đơn giá chưa VAT' : 'Đơn giá', ...(perItem ? ['VAT'] : []), splitVat ? 'Thành tiền chưa VAT' : 'Thành tiền'];
  function cells(values, boldText = false) { return values.map((value, i) => lines(value, widths[i] - 3, boldText, 7)); }
  function row(content, count, header = false) {
    const height = count * LINE + 3;
    let x = MARGIN;
    content.forEach((cell, index) => {
      pdf.setDrawColor(199, 212, 220);
      if (header) pdf.setFillColor(220, 232, 240);
      pdf.rect(x, y, widths[index], height, header ? 'FD' : 'S');
      const align = index === 1 ? 'left' : index >= 5 ? 'right' : 'center';
      const textX = align === 'left' ? x + 1.5 : align === 'right' ? x + widths[index] - 1.5 : x + widths[index] / 2;
      if (cell.length) paint(cell, textX, y + 1.5, { bold: header, size: 7, align });
      x += widths[index];
    });
    y += height;
  }
  const headerCells = cells(headers, true);
  const headerCount = Math.max(...headerCells.map((cell) => cell.length));
  const headerHeight = headerCount * LINE + 3;
  function tablePage() { page(); row(headerCells, headerCount, true); }
  ensure(headerHeight + 11);
  row(headerCells, headerCount, true);
  quotation.items.forEach((item, index) => {
    const content = cells([index + 1, item.description, item.brand, quantityFormat.format(Number(item.quantity) || 0),
      resolveKnmUnit(item), `${formatCurrency(knmUnitPrice(item, quotation))} ₫`,
      ...(perItem ? [`${knmItemVatRate(item)}%`] : []), `${formatCurrency(knmLineAmount(item, quotation))} ₫`]);
    const count = Math.max(...content.map((cell) => cell.length));
    if (y + count * LINE + 3 > BOTTOM && count * LINE + 3 <= BOTTOM - MARGIN - headerHeight) tablePage();
    // Unusually long descriptions can span pages without clipping or dropping text.
    let offset = 0;
    while (offset < count) {
      const available = Math.floor((BOTTOM - y - 3) / LINE);
      if (available < 1) { tablePage(); continue; }
      const take = Math.min(available, count - offset);
      row(content.map((cell) => cell.slice(offset, offset + take)), take);
      offset += take;
      if (offset < count) tablePage();
    }
  });
  y += 5;

  // Terms and totals share vertical space, keeping short quotations compact.
  const termLines = lines(quotation.terms || '—', 94);
  const totalRows = splitVat
    ? [['Cộng tiền hàng (chưa VAT)', `${formatCurrency(totals.subtotal)} ₫`], ...totals.vatLines.map((line) => [`VAT ${line.rate}%`, `${formatCurrency(line.amount)} ₫`])]
    : [['VAT', 'Đã bao gồm']];
  totalRows.push([splitVat ? 'TỔNG TIỀN ĐÃ GỒM VAT' : 'TỔNG THANH TOÁN', `${formatCurrency(totals.total)} ₫`]);
  const totalLines = totalRows.flatMap(([label, value]) => {
    const labelLines = lines(label, 43, true);
    const valueLines = lines(value, 33, true);
    return Array.from({ length: Math.max(labelLines.length, valueLines.length) }, (_, i) => ({ label: labelLines[i], value: valueLines[i] }));
  });
  totalLines.push(...lines(`Bằng chữ: ${numberToVietnamese(totals.total)}`, 78).map((line) => ({ words: line })));
  ensure(18);
  paint('ĐIỀU KHOẢN & GHI CHÚ', MARGIN, y, { bold: true });
  y += 6;
  for (let i = 0; i < Math.max(termLines.length, totalLines.length); i += 1) {
    ensure(LINE);
    if (termLines[i]) paint(termLines[i], MARGIN, y);
    if (totalLines[i]?.label) paint(totalLines[i].label, 118, y, { bold: true });
    if (totalLines[i]?.value) paint(totalLines[i].value, 196, y, { bold: true, align: 'right' });
    if (totalLines[i]?.words) paint(totalLines[i].words, 118, y);
    y += LINE;
  }
  y += 4;

  const hasBankText = company.bankName && company.bankAccountNumber && company.bankAccountHolder;
  if (hasBankText || qr) {
    const bankLines = hasBankText ? lines(`Ngân hàng: ${company.bankName}\nSố tài khoản: ${company.bankAccountNumber}\nChủ tài khoản: ${company.bankAccountHolder}`, qr ? 151 : WIDTH) : [];
    ensure(6 + Math.max(qr ? 25 : 0, Math.min(bankLines.length * LINE, 40)));
    heading('THÔNG TIN NGÂN HÀNG');
    const top = y;
    if (qr) image(qr, 171, top, 25, 25);
    for (const line of bankLines) { ensure(LINE); paint(line, MARGIN, y); y += LINE; }
    y = Math.max(y, top + (qr ? 25 : 0)) + 4;
  }

  // Keep the closing, signature labels, bounded stamp and preparer together.
  const preparer = company.preparerName
    ? lines(`${company.preparerName}${company.preparerTitle ? ` – ${company.preparerTitle}` : ''}`, 86, true) : [];
  const closing = lines('Trân trọng kính chào Quý khách hàng.');
  const stampScale = knmStampScale(company.stampScale);
  const stampWidth = 38 * stampScale;
  const stampHeight = stamp ? 30 * stampScale : 20;
  ensure(closing.length * LINE + 15 + stampHeight + preparer.length * LINE);
  text('Trân trọng kính chào Quý khách hàng.');
  y += 5;
  paint('ĐẠI DIỆN KHÁCH HÀNG', 59, y, { bold: true, align: 'center' });
  paint('ĐẠI DIỆN CÔNG TY', 151, y, { bold: true, align: 'center' });
  y += 5;
  paint('(Ký và ghi rõ họ tên)', 59, y, { size: 7, align: 'center' });
  paint('(Ký, ghi rõ họ tên và đóng dấu)', 151, y, { size: 7, align: 'center' });
  y += 5;
  if (stamp) image(stamp, 151 - stampWidth / 2, y, stampWidth, stampHeight);
  y += stampHeight;
  if (preparer.length) paint(preparer, 151, y, { bold: true, align: 'center' });
  return pdf;
}

export async function exportKnmQuotationToPdf(company, quotation) {
  const pdf = await buildKnmQuotationPdf(company, quotation);
  const filename = ['Bao-gia', knmFileSlug(quotation.quotationNo), knmFileSlug(quotation.customer?.name)].filter(Boolean).join('-') + '.pdf';
  await pdf.save(filename, { returnPromise: true });
  return filename;
}
