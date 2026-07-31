import { fileSlug } from './quotation.js';

export async function exportQuotationElementToPdf(element, quotation) {
  if (!element) throw new Error('Không tìm thấy nội dung báo giá để xuất PDF.');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  await document.fonts?.ready;
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const imageWidth = pageWidth;
  const imageHeight = canvas.height * imageWidth / canvas.width;
  let remainingHeight = imageHeight;
  let offsetY = 0;

  pdf.addImage(canvas, 'PNG', 0, offsetY, imageWidth, imageHeight, undefined, 'FAST');
  remainingHeight -= pageHeight;
  while (remainingHeight > 0) {
    offsetY = remainingHeight - imageHeight;
    pdf.addPage();
    pdf.addImage(canvas, 'PNG', 0, offsetY, imageWidth, imageHeight, undefined, 'FAST');
    remainingHeight -= pageHeight;
  }

  const filename = `Bao-gia-${fileSlug(quotation.quotation_no)}-${fileSlug(quotation.customer_name)}.pdf`;
  pdf.save(filename);
  return filename;
}
