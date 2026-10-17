import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { buildKnmQuotationPdf } from '../src/utils/knmQuotationPdf.js';
import { createDraftKnmQuotation, KNM_DEFAULT_COMPANY, knmEditableSnapshot, knmStampScale, newKnmItem } from '../src/utils/knmQuotation.js';
import { pickCompanyInfo } from '../src/utils/knmStorage.js';

const originalFetch = globalThis.fetch;
const originalFileReader = globalThis.FileReader;
globalThis.fetch = async (url, ...args) => {
  if (String(url).startsWith('/fonts/')) {
    return new Response(await readFile(new URL(`../public${url}`, import.meta.url)));
  }
  return originalFetch(url, ...args);
};
globalThis.FileReader = class {
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onload();
  }
};
after(() => { globalThis.fetch = originalFetch; globalThis.FileReader = originalFileReader; });

const image = `data:image/png;base64,${(await readFile(new URL('../public/templates/minh-triet-logo.png', import.meta.url))).toString('base64')}`;
const company = { ...KNM_DEFAULT_COMPANY, logo: image, stamp: image, bankQr: image, preparerName: 'Nguyễn Văn An', preparerTitle: 'Kinh doanh' };
function quotation(count, vatMode = 'included') {
  return {
    ...createDraftKnmQuotation(), quotationNo: 'KNM-20261017-001', vatMode,
    customer: { name: 'Công ty Ánh Dương', address: '123 Nguyễn Huệ, Thành phố Hồ Chí Minh', contact: 'Nguyễn Văn Bình' },
    items: Array.from({ length: count }, (_, i) => ({
      ...newKnmItem(), description: `Máy khoan số ${i + 1}\nThông số kỹ thuật: 220V – 750W`,
      brand: 'Makita', quantity: i + 1, unitPrice: 1200000, vatRate: i % 2 ? 5 : 8,
    })),
  };
}

for (const vatMode of ['included', 'common', 'per_item']) {
  test(`short ${vatMode} quote keeps stamp, bank QR and signatures on one A4 page`, async () => {
    const pdf = await buildKnmQuotationPdf(company, quotation(3, vatMode));
    const document = await PDFDocument.load(pdf.output('arraybuffer'));
    assert.equal(document.getPageCount(), 1);
    assert.ok(Math.abs(document.getPage(0).getWidth() - 595.28) < 0.1);
    const content = pdf.internal.pages[1].join('\n');
    // Logo, QR and stamp must all be embedded, even when using the same source image.
    assert.equal((content.match(/\/I\d+ Do/g) || []).length, 3);
    const imageTransforms = [...content.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s+\/I\d+ Do/g)];
    assert.equal(imageTransforms.length, 3);
    for (const [, width, height, , bottom] of imageTransforms) {
      assert.ok(Number(width) <= 38 * 72 / 25.4 + 0.1);
      assert.ok(Number(height) <= 30 * 72 / 25.4 + 0.1);
      assert.ok(Number(bottom) >= 14 * 72 / 25.4);
    }
  });
}

test('long quote paginates with a repeated table heading and no content below the page margin', async () => {
  const pdf = await buildKnmQuotationPdf(company, quotation(40, 'per_item'));
  assert.ok(pdf.getNumberOfPages() > 1);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(pdf.output('arraybuffer')), useSystemFonts: true });
  const document = await task.promise;
  const pages = [];
  for (let i = 1; i <= document.numPages; i += 1) {
    const content = await (await document.getPage(i)).getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
    for (const item of content.items) {
      assert.ok(item.transform[5] > 25, `text clipped at page bottom: ${item.str}`);
    }
  }
  assert.match(pages.join(' '), /Máy khoan số 40/);
  assert.match(pages.at(-1), /ĐẠI DIỆN CÔNG TY/);
  assert.match(pages.at(-1), /Nguyễn Văn An/);
  assert.ok(pages.filter((text) => text.includes('Tên và mô tả')).length > 1);
  await task.destroy();
});

test('description taller than one page is continued without losing its final line', async () => {
  const data = quotation(1);
  data.items[0].description = Array.from({ length: 100 }, (_, i) => `Thông số kỹ thuật dòng ${i + 1}`).join('\n');
  const pdf = await buildKnmQuotationPdf(company, data);
  assert.ok(pdf.getNumberOfPages() > 1);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(pdf.output('arraybuffer')), useSystemFonts: true });
  const document = await task.promise;
  let text = '';
  for (let i = 1; i <= document.numPages; i += 1) {
    const content = await (await document.getPage(i)).getTextContent();
    text += content.items.map((item) => item.str).join(' ');
  }
  assert.match(text, /Thông số kỹ thuật dòng 100/);
  await task.destroy();
});

test('stamp scale is saved and contributes to the unsaved-change snapshot', () => {
  const scaled = { ...company, stampScale: 1.5 };
  assert.equal(pickCompanyInfo(scaled).stampScale, 1.5);
  assert.notEqual(knmEditableSnapshot(company, quotation(1)), knmEditableSnapshot(scaled, quotation(1)));
  assert.equal(knmStampScale(undefined), 1);
  assert.equal(knmStampScale('invalid'), 1);
  assert.equal(knmStampScale(0.1), 0.5);
  assert.equal(knmStampScale(3), 2);
});

test('PDF stamp scales proportionally, remains centered and stays inside page margins', async () => {
  const dimensions = [];
  for (const stampScale of [0.5, 1, 2]) {
    const pdf = await buildKnmQuotationPdf({ ...company, stampScale }, quotation(3, 'per_item'));
    const content = pdf.internal.pages.slice(1).map((page) => page.join('\n')).join('\n');
    const transforms = [...content.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s+\/I\d+ Do/g)];
    const [, width, height, left, bottom] = transforms.at(-1).map(Number);
    assert.ok(Math.abs(left + width / 2 - 151 * 72 / 25.4) < 0.1);
    assert.ok(bottom >= 14 * 72 / 25.4);
    assert.ok(bottom + height < (297 - 14) * 72 / 25.4);
    dimensions.push([width, height]);
  }
  assert.ok(Math.abs(dimensions[0][0] * 2 - dimensions[1][0]) < 0.1);
  assert.ok(Math.abs(dimensions[1][1] * 2 - dimensions[2][1]) < 0.1);
});

test('missing company image reports failure rather than downloading a PDF without the stamp', async () => {
  globalThis.fetch = async (url, ...args) => url === 'https://example.invalid/stamp.png'
    ? new Response(null, { status: 404 }) : originalFetch(url, ...args);
  // Retain local font loading while replacing only the image request.
  const missingImageFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...args) => String(url).startsWith('/fonts/')
    ? new Response(await readFile(new URL(`../public${url}`, import.meta.url))) : missingImageFetch(url, ...args);
  await assert.rejects(buildKnmQuotationPdf({ ...company, stamp: 'https://example.invalid/stamp.png' }, quotation(1)), /Không tải được/);
});
