import dayjs from 'dayjs';
import { quotationCompany } from '../data/quotationCompany.js';
import { formatCurrency } from './numberFormat.js';
import { fileSlug } from './quotation.js';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_REGULAR = '/fonts/NotoSans-Regular.ttf';
const FONT_BOLD = '/fonts/NotoSans-Bold.ttf';

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

async function loadAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không thể tải tài nguyên PDF: ${url}`);
  return response.arrayBuffer();
}

function drawWrappedText(pdf, text, x, y, width, options = {}) {
  const { font = 'normal', size = 9, lineHeight = 4.2, align = 'left' } = options;
  pdf.setFont('NotoSans', font);
  pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(String(text ?? ''), width);
  pdf.text(lines, x, y, { align, baseline: 'top' });
  return Math.max(1, lines.length) * lineHeight;
}

function addPage(pdf) {
  pdf.addPage();
  pdf.setDrawColor(45, 62, 80);
  return MARGIN;
}

function ensureSpace(pdf, y, height) {
  return y + height <= PAGE_HEIGHT - MARGIN ? y : addPage(pdf);
}

function rowHeight(pdf, cells, widths, boldFirstLine = false) {
  return Math.max(8, ...cells.map((value, index) => {
    const lines = String(value ?? '').split('\n');
    const count = lines.reduce((total, line) => total + Math.max(1, pdf.splitTextToSize(line, widths[index] - 3).length), 0);
    return 3 + count * (boldFirstLine && index === 1 ? 4.2 : 4);
  }));
}

function drawTableRow(pdf, y, cells, widths, options = {}) {
  const { header = false, product = false, height = rowHeight(pdf, cells, widths, product) } = options;
  let x = MARGIN;
  if (header) {
    pdf.setFillColor(217, 229, 245);
    pdf.rect(x, y, CONTENT_WIDTH, height, 'F');
  }
  cells.forEach((value, index) => {
    const width = widths[index];
    pdf.setDrawColor(34, 34, 34);
    pdf.rect(x, y, width, height);
    const centered = index !== 1;
    const textX = centered ? x + width / 2 : x + 1.5;
    if (product && index === 1) {
      const [name, ...description] = String(value ?? '').split('\n');
      let textY = y + 1.5;
      textY += drawWrappedText(pdf, name, textX, textY, width - 3, { font: 'bold', size: 8, lineHeight: 4 });
      if (description.length) drawWrappedText(pdf, description.join('\n'), textX, textY, width - 3, { size: 8, lineHeight: 4 });
    } else {
      drawWrappedText(pdf, value, textX, y + 2, width - 3, {
        font: header ? 'bold' : 'normal', size: header ? 7 : 8, lineHeight: 3.8,
        align: centered ? 'center' : 'left',
      });
    }
    x += width;
  });
  return y + height;
}

export async function exportQuotationToPdf(quotation, summary) {
  const [{ jsPDF }, regularFont, boldFont, logoBuffer] = await Promise.all([
    import('jspdf'), loadAsset(FONT_REGULAR), loadAsset(FONT_BOLD), loadAsset(quotationCompany.logo),
  ]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', arrayBufferToBase64(regularFont));
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', arrayBufferToBase64(boldFont));
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  pdf.setFont('NotoSans', 'normal');

  const logoData = `data:image/png;base64,${arrayBufferToBase64(logoBuffer)}`;
  pdf.addImage(logoData, 'PNG', MARGIN, MARGIN, 22, 18, undefined, 'FAST');
  pdf.setTextColor(29, 61, 120);
  drawWrappedText(pdf, quotationCompany.name, 39, MARGIN, 150, { font: 'bold', size: 14, lineHeight: 6 });
  pdf.setTextColor(25, 25, 25);
  drawWrappedText(pdf, quotationCompany.address, 39, 21, 150, { size: 8 });
  drawWrappedText(pdf, `MST: ${quotationCompany.taxCode} · Điện thoại: ${quotationCompany.phone} · ${quotationCompany.email}`, 39, 26, 150, { size: 8 });
  pdf.setDrawColor(29, 61, 120);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, 34, PAGE_WIDTH - MARGIN, 34);

  let y = 39;
  const leftMeta = [
    `To: ${quotation.customer_name || ''}`,
    quotation.tax_code ? `Mã số thuế: ${quotation.tax_code}` : '',
    quotation.address ? `Địa chỉ: ${quotation.address}` : '',
    `Attn: ${quotation.contact_name || 'Anh/Chị mua hàng'}`,
    `H/P: ${quotation.phone || '—'}`,
  ].filter(Boolean).join('\n');
  const rightMeta = [
    `From: ${quotation.prepared_by_name || '—'}`,
    `Tel: ${quotation.prepared_by_phone || '—'}`,
    `Date: ${dayjs(quotation.quotation_date).format('DD/MM/YYYY')}`,
    `No: ${quotation.quotation_no || ''}`,
  ].join('\n');
  const metaHeight = Math.max(
    drawWrappedText(pdf, leftMeta, MARGIN, y, 88, { size: 9, lineHeight: 4.4 }),
    drawWrappedText(pdf, rightMeta, 112, y, 84, { size: 9, lineHeight: 4.4 }),
  );
  y += metaHeight + 3;
  y += drawWrappedText(pdf, 'Trước hết Công ty chúng tôi xin chân thành cảm ơn sự quan tâm quý báu của Quý khách hàng về sản phẩm của chúng tôi.', MARGIN, y, CONTENT_WIDTH, { size: 9 });
  y += drawWrappedText(pdf, 'Công ty chúng tôi xin trân trọng thông báo tới Quý khách hàng bảng báo giá các sản phẩm của Công ty:', MARGIN, y + 1, CONTENT_WIDTH, { size: 9 }) + 3;

  const widths = [9, 60, 24, 16, 14, 28, 31];
  const headers = ['STT', 'MÔ TẢ SẢN PHẨM', 'THƯƠNG HIỆU', 'SỐ LƯỢNG', 'ĐVT', 'ĐƠN GIÁ', 'THÀNH TIỀN'];
  y = drawTableRow(pdf, y, headers, widths, { header: true, height: 10 });
  for (const [index, item] of (quotation.items || []).entries()) {
    const productText = [item.product_name || item.description || '', item.product_name ? item.description : ''].filter(Boolean).join('\n');
    const cells = [index + 1, productText, item.brand || '', item.quantity, item.unit || '', formatCurrency(item.unit_price), formatCurrency(Number(item.quantity) * Number(item.unit_price))];
    const height = rowHeight(pdf, cells, widths, true);
    if (y + height > PAGE_HEIGHT - MARGIN) {
      y = addPage(pdf);
      y = drawTableRow(pdf, y, headers, widths, { header: true, height: 10 });
    }
    y = drawTableRow(pdf, y, cells, widths, { product: true, height });
  }
  y = ensureSpace(pdf, y, 11);
  y = drawTableRow(pdf, y, ['TỔNG CỘNG Đã gồm VAT', formatCurrency(summary.total)], [151, 31], { header: true, height: 10 });

  const terms = [
    ['Ghi chú', quotation.terms?.note], ['Địa điểm giao hàng', quotation.terms?.deliveryPlace],
    ['Thời gian giao hàng', quotation.terms?.deliveryTime], ['Phương thức thanh toán', quotation.terms?.payment],
    ['Chất lượng hàng hóa', quotation.terms?.quality], ['Hiệu lực báo giá', quotation.terms?.validity],
  ];
  y += 4;
  for (const [label, value] of terms) {
    const line = `${label}: ${value || ''}`;
    const height = Math.max(4.2, pdf.splitTextToSize(line, CONTENT_WIDTH).length * 4.2);
    y = ensureSpace(pdf, y, height + 1);
    y += drawWrappedText(pdf, line, MARGIN, y, CONTENT_WIDTH, { size: 9, lineHeight: 4.2 }) + 1;
  }
  y = ensureSpace(pdf, y, 30);
  y += drawWrappedText(pdf, 'Trân trọng kính chào Quý khách hàng', MARGIN, y + 2, CONTENT_WIDTH, { size: 9 }) + 8;
  drawWrappedText(pdf, `NGƯỜI LẬP BÁO GIÁ\n${quotation.prepared_by_name || ''}`, 53, y, 55, { font: 'bold', size: 9, lineHeight: 5, align: 'center' });
  drawWrappedText(pdf, quotationCompany.name, 150, y, 70, { font: 'bold', size: 9, lineHeight: 5, align: 'center' });

  const filename = `Bao-gia-${fileSlug(quotation.quotation_no)}-${fileSlug(quotation.customer_name)}.pdf`;
  pdf.save(filename);
  return filename;
}
