import JSZip from 'jszip';
import { saveAs } from './fileSaver.js';
import { fileSlug } from './quotation.js';

const TEMPLATE_URL = '/templates/bao-gia-minh-triet.xlsx';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function escapeXml(value) {
  const xmlSafeValue = Array.from(String(value ?? ''))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === 9 || codePoint === 10 || codePoint === 13 || codePoint >= 32;
    })
    .join('');
  return xmlSafeValue.replace(/\r\n?/g, '\n').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineCell(ref, style, value, numeric = false, formula = '') {
  const styleAttr = style ? ` s="${style}"` : '';
  if (formula) return `<c r="${ref}"${styleAttr}><f>${escapeXml(formula)}</f><v>${Number(value) || 0}</v></c>`;
  if (numeric) return `<c r="${ref}"${styleAttr}><v>${Number(value) || 0}</v></c>`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function replaceCell(rowXml, column, row, value, { numeric = false, formula = '' } = {}) {
  const pattern = new RegExp(`<c\\s+([^>]*\\br="${column}${row}"[^>]*)\\/>|<c\\s+([^>]*\\br="${column}${row}"[^>]*)>[\\s\\S]*?<\\/c>`);
  const found = rowXml.match(pattern);
  const attrs = found?.[1] || found?.[2] || '';
  const style = attrs.match(/\bs="([^"]+)"/)?.[1] || '';
  const cell = inlineCell(`${column}${row}`, style, value, numeric, formula);
  if (found) return rowXml.replace(pattern, cell);
  return rowXml.replace('</row>', `${cell}</row>`);
}

function replaceProductTextCell(rowXml, column, row, productName, description) {
  const pattern = new RegExp(`<c\\s+([^>]*\\br="${column}${row}"[^>]*)\\/>|<c\\s+([^>]*\\br="${column}${row}"[^>]*)>[\\s\\S]*?<\\/c>`);
  const found = rowXml.match(pattern);
  const attrs = found?.[1] || found?.[2] || '';
  const style = attrs.match(/\bs="([^"]+)"/)?.[1] || '';
  const styleAttr = style ? ` s="${style}"` : '';
  const name = escapeXml(productName);
  const details = escapeXml(description);
  const richText = [
    `<c r="${column}${row}"${styleAttr} t="inlineStr"><is>`,
    '<r><rPr><rFont val="Times New Roman"/><family val="1"/><b/><sz val="11"/></rPr>',
    `<t xml:space="preserve">${name}</t></r>`,
    details
      ? `<r><rPr><rFont val="Times New Roman"/><family val="1"/><sz val="11"/></rPr><t xml:space="preserve">\n${details}</t></r>`
      : '',
    '</is></c>',
  ].join('');
  if (found) return rowXml.replace(pattern, richText);
  return rowXml.replace('</row>', `${richText}</row>`);
}

function setProductRowHeight(rowXml, productName, description) {
  const countLines = (value) => String(value || '').replace(/\r\n?/g, '\n').split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(Array.from(line).length / 42)), 0);
  const lineCount = countLines(productName) + (description ? countLines(description) : 0);
  const height = Math.min(180, Math.max(24, lineCount * 15.75 + 4));
  return rowXml.replace(/<row\s+([^>]*)>/, (match, attrs) => {
    const withoutHeight = attrs.replace(/\sht="[^"]*"/, '').replace(/\scustomHeight="[^"]*"/, '');
    return `<row ${withoutHeight} ht="${height}" customHeight="1">`;
  });
}

function shiftRow(rowXml, oldRow, newRow) {
  return rowXml.replace(new RegExp(`r="${oldRow}"`, 'g'), `r="${newRow}"`)
    .replace(new RegExp(`([A-Z]+)${oldRow}(?=[":<])`, 'g'), `$1${newRow}`);
}

function setTemplateValue(xml, ref, value, options) {
  const row = Number(ref.match(/\d+/)[0]);
  const column = ref.match(/[A-Z]+/)[0];
  const rowPattern = new RegExp(`<row\\s+[^>]*\\br="${row}"[\\s\\S]*?<\\/row>`);
  return xml.replace(rowPattern, (rowXml) => replaceCell(rowXml, column, row, value, options));
}

function buildSheetXml(source, quotation, summary) {
  const itemCount = quotation.items.length;
  const delta = Math.max(0, itemCount - 1);
  const rows = [...source.matchAll(/<row[\s\S]*?<\/row>/g)].map((match) => match[0]);
  const templateProduct = rows.find((row) => /\br="17"/.test(row));
  const rebuilt = [];

  for (const row of rows) {
    const oldRow = Number(row.match(/\br="(\d+)"/)?.[1]);
    if (oldRow === 17) {
      quotation.items.forEach((item, index) => {
        const rowNumber = 17 + index;
        let productRow = shiftRow(templateProduct, 17, rowNumber)
          .replace(/<f[\s\S]*?<\/f>/g, '');
        productRow = replaceCell(productRow, 'B', rowNumber, index + 1, { numeric: true });
        productRow = replaceProductTextCell(
          productRow,
          'C',
          rowNumber,
          item.product_name || item.description || '',
          item.product_name ? (item.description || '') : '',
        );
        productRow = replaceCell(productRow, 'D', rowNumber, item.brand || '');
        productRow = replaceCell(productRow, 'E', rowNumber, item.quantity, { numeric: true });
        productRow = replaceCell(productRow, 'F', rowNumber, item.unit);
        productRow = replaceCell(productRow, 'G', rowNumber, item.unit_price, { numeric: true });
        productRow = replaceCell(
          productRow,
          'H',
          rowNumber,
          Number(item.quantity) * Number(item.unit_price),
          { numeric: true },
        );
        productRow = setProductRowHeight(
          productRow,
          item.product_name || item.description || '',
          item.product_name ? (item.description || '') : '',
        );
        rebuilt.push(productRow);
      });
    } else if (oldRow >= 18) {
      rebuilt.push(shiftRow(row, oldRow, oldRow + delta));
    } else {
      rebuilt.push(row);
    }
  }

  let xml = source.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${rebuilt.join('')}</sheetData>`);
  const totalRow = 18 + delta;
  const customerLines = [
    quotation.customer_name,
    quotation.tax_code ? `Mã số thuế: ${quotation.tax_code}` : '',
    quotation.address ? `Địa chỉ: ${quotation.address}` : '',
  ].filter(Boolean);
  xml = setTemplateValue(xml, 'C7', customerLines.join('\n'));
  xml = setTemplateValue(xml, 'C8', quotation.contact_name || '');
  xml = setTemplateValue(xml, 'C9', quotation.phone || '');
  xml = setTemplateValue(xml, 'H7', quotation.prepared_by_name || '');
  xml = setTemplateValue(xml, 'H8', quotation.prepared_by_phone || '');
  const excelDate = Math.floor((new Date(`${quotation.quotation_date}T00:00:00Z`).getTime() - Date.UTC(1899, 11, 30)) / 86400000);
  xml = setTemplateValue(xml, 'H9', excelDate, { numeric: true });
  xml = setTemplateValue(xml, 'H10', quotation.quotation_no);
  xml = setTemplateValue(xml, `H${totalRow}`, summary.total, { numeric: true });

  const terms = quotation.terms || {};
  [
    [19, `Ghi chú: ${terms.note || ''}`],
    [20, `Địa điểm giao hàng: ${terms.deliveryPlace || ''}`],
    [21, `Thời gian giao hàng: ${terms.deliveryTime || ''}`],
    [22, `Phương thức thanh toán: ${terms.payment || ''}`],
    [23, `Chất lượng hàng hóa: ${terms.quality || ''}`],
    [24, `Hiệu lực báo giá: ${terms.validity || ''}`],
  ].forEach(([baseRow, value]) => { xml = setTemplateValue(xml, `B${baseRow + delta}`, value); });

  xml = xml.replace(/<dimension ref="A1:J\d+"\/>/, `<dimension ref="A1:J${27 + delta}"/>`);
  xml = xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (match, c1, r1, c2, r2) => {
    const start = Number(r1) >= 18 ? Number(r1) + delta : Number(r1);
    const end = Number(r2) >= 18 ? Number(r2) + delta : Number(r2);
    return `<mergeCell ref="${c1}${start}:${c2}${end}"/>`;
  });
  return xml;
}

async function createQuotationWorkbook(quotation, summary) {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error('Không tải được file Excel mẫu.');
  const blob = await buildQuotationWorkbook(await response.arrayBuffer(), quotation, summary);
  const filename = `Bao-gia-${fileSlug(quotation.quotation_no)}-${fileSlug(quotation.customer_name)}.xlsx`;
  return { blob, filename };
}

export async function exportQuotationToExcel(quotation, summary) {
  const { blob, filename } = await createQuotationWorkbook(quotation, summary);
  saveAs(blob, filename);
  return filename;
}

export async function buildQuotationWorkbook(templateBuffer, quotation, summary) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const delta = Math.max(0, quotation.items.length - 1);
  zip.file(sheetPath, buildSheetXml(await zip.file(sheetPath).async('string'), quotation, summary));
  const drawingPath = 'xl/drawings/drawing1.xml';
  if (delta && zip.file(drawingPath)) {
    let drawing = await zip.file(drawingPath).async('string');
    drawing = drawing.replace(/<xdr:twoCellAnchor[\s\S]*?name="Picture 2"[\s\S]*?<\/xdr:twoCellAnchor>/, (anchor) =>
      anchor.replace(/<xdr:row>(\d+)<\/xdr:row>/g, (_, row) => `<xdr:row>${Number(row) + delta}</xdr:row>`));
    zip.file(drawingPath, drawing);
  }

  const workbookPath = 'xl/workbook.xml';
  let workbookXml = await zip.file(workbookPath).async('string');
  const lastRow = 27 + delta;
  workbookXml = workbookXml.replace(/(localSheetId="0">[^<]*!\\?\$A\\?\$1:)[^<]+(<\/definedName>)/, `$1\\$H\\$${lastRow}$2`);
  workbookXml = workbookXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');
  zip.file(workbookPath, workbookXml);
  zip.remove('xl/calcChain.xml');
  const contentTypesPath = '[Content_Types].xml';
  zip.file(contentTypesPath, (await zip.file(contentTypesPath).async('string'))
    .replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ''));
  const relsPath = 'xl/_rels/workbook.xml.rels';
  zip.file(relsPath, (await zip.file(relsPath).async('string'))
    .replace(/<Relationship[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/calcChain"[^>]*\/>/, ''));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
