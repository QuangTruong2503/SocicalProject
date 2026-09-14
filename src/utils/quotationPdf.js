import dayjs from 'dayjs';
import { quotationCompany } from '../data/quotationCompany.js';
import { formatCurrency } from './numberFormat.js';
import { fileSlug, TERM_LABELS } from './quotation.js';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_REGULAR = '/fonts/NotoSans-Regular.ttf';
const FONT_BOLD = '/fonts/NotoSans-Bold.ttf';

const COLOR_GREEN = [28, 122, 73];
const COLOR_GREEN_DARK = [20, 108, 58];
const COLOR_GREEN_TINT = [234, 246, 238];
const COLOR_GREEN_BORDER = [215, 236, 223];
const COLOR_FOOTER_TOP = [27, 107, 65];
const COLOR_FOOTER_BOTTOM = [18, 63, 40];
const COLOR_FOOTER_TEXT = [191, 232, 207];
const COLOR_TEXT_DARK = [17, 24, 39];
const COLOR_TEXT_BODY = [55, 65, 81];
const COLOR_TEXT_MUTED = [107, 114, 128];
const COLOR_ROW_BORDER = [233, 243, 236];
const COLOR_TOTAL_BG = [244, 250, 246];

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

async function loadImageAsDataUrl(url) {
  const buffer = await loadAsset(url);
  const type = url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${arrayBufferToBase64(buffer)}`;
}

function loadImageSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Không thể đọc kích thước ảnh dấu mộc.'));
    image.src = dataUrl;
  });
}

function computeValidUntil(quotation) {
  const match = String(quotation.terms?.validity || '').match(/(\d+)\s*ngày/i);
  if (!match) return null;
  const days = Number(match[1]);
  return { date: dayjs(quotation.quotation_date).add(days, 'day').format('DD/MM/YYYY'), days };
}

function drawWrappedText(pdf, text, x, y, width, options = {}) {
  const { font = 'normal', size = 9, lineHeight = 4.2, align = 'left', color = COLOR_TEXT_DARK } = options;
  pdf.setFont('NotoSans', font);
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(String(text ?? ''), width);
  pdf.text(lines, x, y, { align, baseline: 'top' });
  return Math.max(1, lines.length) * lineHeight;
}

function addPage(pdf) {
  pdf.addPage();
  return MARGIN;
}

function ensureSpace(pdf, y, height) {
  return y + height <= PAGE_HEIGHT - MARGIN ? y : addPage(pdf);
}

function drawRoundedBorder(pdf, x, y, width, height, color = COLOR_GREEN_BORDER, radius = 2) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, width, height, radius, radius, 'S');
}

function drawTableRow(pdf, y, cells, widths, options = {}) {
  const { header = false, product = false, height } = options;
  const rowHeightValue = height ?? Math.max(8, ...cells.map((value, index) => {
    const lines = String(value ?? '').split('\n');
    const count = lines.reduce((total, line) => total + Math.max(1, pdf.splitTextToSize(line, widths[index] - 3).length), 0);
    return 3 + count * (product && index === 1 ? 4.2 : 4);
  }));
  let x = MARGIN;
  if (header) {
    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(x, y, CONTENT_WIDTH, rowHeightValue, 'F');
  }
  cells.forEach((value, index) => {
    const width = widths[index];
    pdf.setDrawColor(...COLOR_ROW_BORDER);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, width, rowHeightValue);
    const centered = index !== 1;
    const textX = centered ? x + width / 2 : x + 1.5;
    const textColor = header ? [255, 255, 255] : COLOR_TEXT_DARK;
    if (product && index === 1 && !header) {
      const [name, ...description] = String(value ?? '').split('\n');
      let textY = y + 1.8;
      textY += drawWrappedText(pdf, name, textX, textY, width - 3, { font: 'bold', size: 8, lineHeight: 4, color: COLOR_TEXT_DARK });
      if (description.length) {
        drawWrappedText(pdf, description.join('\n'), textX, textY, width - 3, { size: 7.5, lineHeight: 3.8, color: COLOR_TEXT_BODY });
      }
    } else {
      drawWrappedText(pdf, value, textX, y + 2.2, width - 3, {
        font: header ? 'bold' : 'normal', size: header ? 7.5 : 8, lineHeight: 3.8,
        align: centered ? 'center' : 'left', color: textColor,
      });
    }
    x += width;
  });
  return y + rowHeightValue;
}

export async function exportQuotationToPdf(quotation, summary, stamp, stampPosition) {
  const assetJobs = [import('jspdf'), loadAsset(FONT_REGULAR), loadAsset(FONT_BOLD), loadImageAsDataUrl(quotationCompany.logo)];
  const [{ jsPDF }, regularFont, boldFont, logoData] = await Promise.all(assetJobs);
  let stampData = null;
  let stampAspect = 1;
  if (stamp?.url) {
    try {
      const blob = await (await fetch(stamp.url)).blob();
      stampData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Không thể đọc ảnh dấu mộc.'));
        reader.readAsDataURL(blob);
      });
      const { width, height } = await loadImageSize(stampData);
      if (width && height) stampAspect = width / height;
    } catch {
      stampData = null;
    }
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.addFileToVFS('NotoSans-Regular.ttf', arrayBufferToBase64(regularFont));
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  pdf.addFileToVFS('NotoSans-Bold.ttf', arrayBufferToBase64(boldFont));
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
  pdf.setFont('NotoSans', 'normal');

  // Header: logo + company block + tagline box
  pdf.addImage(logoData, 'PNG', MARGIN, MARGIN, 18, 18, undefined, 'FAST');
  drawWrappedText(pdf, quotationCompany.name, MARGIN + 22, MARGIN + 1, 118, { font: 'bold', size: 12.5, lineHeight: 5, color: COLOR_GREEN_DARK });
  drawWrappedText(pdf, quotationCompany.address, MARGIN + 22, MARGIN + 7, 118, { size: 7.5, lineHeight: 3.6, color: COLOR_TEXT_BODY });
  drawWrappedText(pdf, `MST: ${quotationCompany.taxCode}   |   Điện thoại: ${quotationCompany.phone}`, MARGIN + 22, MARGIN + 11, 118, { size: 7.5, lineHeight: 3.6, color: COLOR_TEXT_BODY });
  drawWrappedText(pdf, `Email: ${quotationCompany.email}`, MARGIN + 22, MARGIN + 15, 118, { size: 7.5, lineHeight: 3.6, color: COLOR_TEXT_BODY });

  const taglineWidth = 58;
  const taglineX = PAGE_WIDTH - MARGIN - taglineWidth;
  pdf.setFillColor(...COLOR_GREEN_TINT);
  pdf.roundedRect(taglineX, MARGIN, taglineWidth, 17, 2, 2, 'F');
  const taglineLines = quotationCompany.tagline.split('\n');
  taglineLines.forEach((line, index) => {
    pdf.setFont('NotoSans', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLOR_GREEN_DARK);
    pdf.text(line, taglineX + taglineWidth / 2, MARGIN + 6.5 + index * 4.2, { align: 'center', baseline: 'middle' });
  });

  pdf.setDrawColor(...[219, 231, 222]);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, MARGIN + 21, PAGE_WIDTH - MARGIN, MARGIN + 21);

  // Title row: BÁO GIÁ + subtitle, meta panel
  let y = MARGIN + 27;
  drawWrappedText(pdf, 'BÁO GIÁ', MARGIN, y, 100, { font: 'bold', size: 22, lineHeight: 8, color: COLOR_TEXT_DARK });
  drawWrappedText(pdf, 'Cảm ơn Quý khách đã quan tâm đến sản phẩm của chúng tôi.\nChúng tôi xin trân trọng gửi đến Quý khách bảng báo giá chi tiết như sau:', MARGIN, y + 10, 112, { size: 7.5, lineHeight: 3.8, color: COLOR_TEXT_BODY });

  const metaWidth = 62;
  const metaX = PAGE_WIDTH - MARGIN - metaWidth;
  const metaHeight = 22;
  drawRoundedBorder(pdf, metaX, y, metaWidth, metaHeight);
  const validUntil = computeValidUntil(quotation);
  const metaRows = [
    ['Số báo giá', quotation.quotation_no],
    ['Ngày báo giá', dayjs(quotation.quotation_date).format('DD/MM/YYYY')],
    ['Hiệu lực đến', validUntil ? `${validUntil.date} (${validUntil.days} ngày)` : (quotation.terms?.validity || '—')],
  ];
  metaRows.forEach(([label, value], index) => {
    const rowY = y + 3 + index * 7;
    drawWrappedText(pdf, label, metaX + 3, rowY, 26, { size: 7.5, color: COLOR_TEXT_MUTED });
    drawWrappedText(pdf, value, metaX + metaWidth - 3, rowY, 34, { font: 'bold', size: 7.5, align: 'right', color: COLOR_GREEN_DARK });
    if (index < metaRows.length - 1) {
      pdf.setDrawColor(229, 231, 235);
      pdf.setLineWidth(0.15);
      pdf.line(metaX + 2, rowY + 5.6, metaX + metaWidth - 2, rowY + 5.6);
    }
  });
  y += metaHeight + 6;

  // Two info cards: customer info + quotation info
  const cardGap = 6;
  const cardWidth = (CONTENT_WIDTH - cardGap) / 2;
  const cardHeaderHeight = 6.5;
  const customerRows = [
    ['Tên công ty', quotation.customer_name || '—'],
    ['Mã số thuế', quotation.tax_code || '—'],
    ['Địa chỉ', quotation.address || '—'],
    ['Người liên hệ', quotation.contact_name || 'Anh/Chị mua hàng'],
    ['Điện thoại', quotation.phone || '—'],
    ['Email', quotation.email || '—'],
  ];
  const quoteRows = [
    ['Người lập', quotation.prepared_by_name || '—'],
    ['Điện thoại', quotation.prepared_by_phone || '—'],
    ['Ngày báo giá', dayjs(quotation.quotation_date).format('DD/MM/YYYY')],
    ['Số báo giá', quotation.quotation_no || ''],
  ];
  const rowLineHeight = 5;
  const cardHeight = cardHeaderHeight + Math.max(customerRows.length, quoteRows.length) * rowLineHeight + 3;

  y = ensureSpace(pdf, y, cardHeight);
  [
    { x: MARGIN, title: 'THÔNG TIN KHÁCH HÀNG', rows: customerRows },
    { x: MARGIN + cardWidth + cardGap, title: 'THÔNG TIN BÁO GIÁ', rows: quoteRows },
  ].forEach(({ x, title, rows }) => {
    drawRoundedBorder(pdf, x, y, cardWidth, cardHeight);
    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(x + 0.3, y + 0.3, cardWidth - 0.6, cardHeaderHeight - 0.3, 'F');
    drawWrappedText(pdf, title, x + 3, y + 1.8, cardWidth - 6, { font: 'bold', size: 8, color: [255, 255, 255] });
    rows.forEach(([label, value], index) => {
      const rowY = y + cardHeaderHeight + 2 + index * rowLineHeight;
      drawWrappedText(pdf, label, x + 3, rowY, 26, { size: 7.5, color: COLOR_TEXT_MUTED });
      drawWrappedText(pdf, value, x + 30, rowY, cardWidth - 33, { font: 'bold', size: 7.5, color: COLOR_TEXT_DARK });
    });
  });
  y += cardHeight + 5;

  // Product table
  const widths = [9, 63, 25, 17, 14, 27, 27];
  const headers = ['STT', 'MÔ TẢ SẢN PHẨM', 'THƯƠNG HIỆU', 'SỐ LƯỢNG', 'ĐVT', 'ĐƠN GIÁ (VND)', 'THÀNH TIỀN (VND)'];
  y = ensureSpace(pdf, y, 12);
  y = drawTableRow(pdf, y, headers, widths, { header: true, height: 9 });
  for (const [index, item] of (quotation.items || []).entries()) {
    const productText = [item.product_name || item.description || '', item.product_name ? item.description : ''].filter(Boolean).join('\n');
    const cells = [index + 1, productText, item.brand || '', item.quantity, item.unit || '', formatCurrency(item.unit_price), formatCurrency(Number(item.quantity) * Number(item.unit_price))];
    const height = Math.max(8, ...cells.map((value, cellIndex) => {
      const lines = String(value ?? '').split('\n');
      const count = lines.reduce((total, line) => total + Math.max(1, pdf.splitTextToSize(line, widths[cellIndex] - 3).length), 0);
      return 3 + count * (cellIndex === 1 ? 4.2 : 4);
    }));
    if (y + height > PAGE_HEIGHT - MARGIN) {
      y = addPage(pdf);
      y = drawTableRow(pdf, y, headers, widths, { header: true, height: 9 });
    }
    y = drawTableRow(pdf, y, cells, widths, { product: true, height });
  }
  y = ensureSpace(pdf, y, 10);
  const totalLabelWidth = widths.slice(0, 6).reduce((sum, w) => sum + w, 0);
  const totalValueWidth = widths[6];
  pdf.setFillColor(...COLOR_TOTAL_BG);
  pdf.rect(MARGIN, y, totalLabelWidth, 9, 'F');
  pdf.setDrawColor(...COLOR_ROW_BORDER);
  pdf.rect(MARGIN, y, totalLabelWidth, 9);
  drawWrappedText(pdf, 'TỔNG CỘNG ĐÃ GỒM VAT', MARGIN + totalLabelWidth - 3, y + 2.5, totalLabelWidth - 6, { font: 'bold', size: 8, align: 'right', color: COLOR_TEXT_DARK });
  pdf.setFillColor(...COLOR_GREEN_DARK);
  pdf.rect(MARGIN + totalLabelWidth, y, totalValueWidth, 9, 'F');
  drawWrappedText(pdf, formatCurrency(summary.total), MARGIN + totalLabelWidth + totalValueWidth / 2, y + 2.5, totalValueWidth - 2, { font: 'bold', size: 8, align: 'center', color: [255, 255, 255] });
  y += 9 + 6;

  // Terms with numbered badges
  y = ensureSpace(pdf, y, 12);
  drawWrappedText(pdf, 'ĐIỀU KHOẢN & THÔNG TIN BỔ SUNG', MARGIN, y, CONTENT_WIDTH, { font: 'bold', size: 9.5, color: COLOR_TEXT_DARK });
  y += 6;
  Object.entries(TERM_LABELS).forEach(([key, label], index) => {
    const value = quotation.terms?.[key] || '—';
    const line = `${label}: ${value}`;
    const textWidth = CONTENT_WIDTH - 9;
    const lineCount = pdf.splitTextToSize(line, textWidth).length;
    const rowHeightValue = Math.max(5, lineCount * 3.8);
    y = ensureSpace(pdf, y, rowHeightValue + 1.5);
    pdf.setFillColor(...COLOR_GREEN);
    pdf.circle(MARGIN + 2, y + 2, 2, 'F');
    pdf.setFont('NotoSans', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(index + 1), MARGIN + 2, y + 2, { align: 'center', baseline: 'middle' });
    pdf.setFont('NotoSans', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLOR_TEXT_DARK);
    const labelWidth = pdf.getTextWidth(`${label}: `);
    pdf.text(`${label}:`, MARGIN + 6, y + 0.3, { baseline: 'top' });
    drawWrappedText(pdf, ` ${value}`, MARGIN + 6 + labelWidth, y, textWidth - labelWidth, { size: 7.5, lineHeight: 3.8, color: COLOR_TEXT_BODY });
    y += rowHeightValue + 1.5;
  });
  y += 4;

  y = ensureSpace(pdf, y, 6);
  y += drawWrappedText(pdf, 'Trân trọng kính chào Quý khách hàng!', MARGIN, y, CONTENT_WIDTH, { size: 8, color: COLOR_TEXT_BODY }) + 8;

  // Signature blocks
  y = ensureSpace(pdf, y, 46);
  const signatureTop = y;
  const signatureColWidth = 80;
  const leftColCenter = MARGIN + signatureColWidth / 2;
  const rightColX = PAGE_WIDTH - MARGIN - signatureColWidth;
  const rightColCenter = rightColX + signatureColWidth / 2;
  drawWrappedText(pdf, 'NGƯỜI LẬP BÁO GIÁ', leftColCenter, signatureTop, signatureColWidth, { font: 'bold', size: 8, align: 'center', color: COLOR_TEXT_DARK });
  drawWrappedText(pdf, quotation.prepared_by_name || '', leftColCenter, signatureTop + 5, signatureColWidth, { font: 'bold', size: 8, align: 'center', color: COLOR_TEXT_DARK });
  pdf.setDrawColor(156, 163, 175);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN + 12, signatureTop + 34, MARGIN + 68, signatureTop + 34);
  drawWrappedText(pdf, '(Ký, ghi rõ họ tên)', leftColCenter, signatureTop + 36, signatureColWidth, { size: 7, align: 'center', color: COLOR_TEXT_MUTED });

  drawWrappedText(pdf, quotationCompany.name, rightColCenter, signatureTop, signatureColWidth, { font: 'bold', size: 8, align: 'center', color: COLOR_TEXT_DARK });
  if (stampData) {
    const maxSize = 26 * (Number(stampPosition?.scale) || 1);
    const stampWidth = stampAspect >= 1 ? maxSize : maxSize * stampAspect;
    const stampHeight = stampAspect >= 1 ? maxSize / stampAspect : maxSize;
    pdf.addImage(stampData, rightColCenter - stampWidth / 2, signatureTop + 6, stampWidth, stampHeight, undefined, 'FAST');
  }
  pdf.line(rightColX + 12, signatureTop + 34, rightColX + 68, signatureTop + 34);
  drawWrappedText(pdf, '(Ký, đóng dấu)', rightColCenter, signatureTop + 36, signatureColWidth, { size: 7, align: 'center', color: COLOR_TEXT_MUTED });
  y = signatureTop + 42;

  // Footer bars (full bleed to page edges)
  y = ensureSpace(pdf, y, 16);
  const footerY = Math.max(y, PAGE_HEIGHT - 16);
  pdf.setFillColor(...COLOR_FOOTER_TOP);
  pdf.rect(0, footerY, PAGE_WIDTH, 10, 'F');
  const contactLine = `${quotationCompany.phone}   |   ${quotationCompany.email}   |   ${quotationCompany.website}   |   ${quotationCompany.address}`;
  drawWrappedText(pdf, contactLine, PAGE_WIDTH / 2, footerY + 3, PAGE_WIDTH - 20, { size: 6.8, align: 'center', font: 'bold', color: [255, 255, 255] });
  pdf.setFillColor(...COLOR_FOOTER_BOTTOM);
  pdf.rect(0, footerY + 10, PAGE_WIDTH, 6, 'F');
  drawWrappedText(pdf, `—— ${quotationCompany.footerTagline} ——`, PAGE_WIDTH / 2, footerY + 12, PAGE_WIDTH - 20, { size: 6.5, align: 'center', font: 'bold', color: COLOR_FOOTER_TEXT });

  const filename = `Bao-gia-${fileSlug(quotation.quotation_no)}-${fileSlug(quotation.customer_name)}.pdf`;
  pdf.save(filename);
  return filename;
}
