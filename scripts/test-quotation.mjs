import assert from 'node:assert/strict';
import fs from 'node:fs';
import JSZip from 'jszip';
import { buildQuotationWorkbook } from '../src/utils/quotationExcel.js';
import { calculateQuotation, DEFAULT_TERMS, emptyQuotation, normalizeLocalQuotation, validateQuotation } from '../src/utils/quotation.js';

const makeData = (count = 1) => ({
  quotation_no: 'BG-20260731-0001', quotation_date: '2026-07-31',
  customer_name: 'Công ty Ánh Dương', contact_name: 'Nguyễn Văn A', phone: '0938.880.628',
  tax_code: '0312345678', address: '123 Đường Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
  prepared_by_name: 'Nhân viên kiểm thử', prepared_by_phone: '0900000000',
  discount_type: 'percent', discount_value: 10, shipping_fee: 50000, vat_mode: 'included',
  terms: DEFAULT_TERMS,
  items: Array.from({ length: count }, (_, index) => ({
    product_name: `Sản phẩm kiểm thử số ${index + 1}`,
    description: `Dòng mô tả thứ nhất có dấu tiếng Việt\nDòng mô tả thứ hai tự động xuống dòng`,
    brand: 'Minh Triết', quantity: index + 1, unit: 'Cái', unit_price: 1100000,
  })),
});

const one = makeData(1);
const oneSummary = calculateQuotation(one);
assert.equal(oneSummary.subtotal, 1100000);
assert.equal(oneSummary.discount, 110000);
assert.equal(oneSummary.vat, 0);
assert.equal(oneSummary.total, 1040000);
const excludedSummary = calculateQuotation({ ...one, vat_mode: '10' });
assert.equal(excludedSummary.vatExcluded, true);
assert.equal(excludedSummary.preVat, 1040000);
assert.equal(excludedSummary.vat, 104000);
assert.equal(excludedSummary.total, 1144000);
const mixed = calculateQuotation({
  ...one, vat_mode: 'per_item', discount_value: 0, shipping_fee: 0,
  items: [
    { product_name: 'A', quantity: 2, unit_price: 100000, vat_rate: 8 },
    { product_name: 'B', quantity: 1, unit_price: 300000, vat_rate: '5.00' },
    { product_name: 'C', quantity: 1, unit_price: 50000 },
  ],
});
assert.equal(mixed.preVat, 550000);
assert.deepEqual(mixed.vatLines.map((line) => [line.rate, line.base, line.amount]), [[8, 250000, 20000], [5, 300000, 15000]]);
assert.equal(mixed.vat, 35000);
assert.equal(mixed.total, 585000);
assert.equal(calculateQuotation({ ...one, vat_mode: 'bogus' }).vat, 0);
assert.deepEqual(validateQuotation(one, false), {});
assert.ok(validateQuotation({ ...one, customer_name: '' }).customer_name);
assert.ok(validateQuotation({ ...one, items: [{ ...one.items[0], quantity: 0 }] }).item_0_quantity);
assert.ok(validateQuotation({ ...one, items: [{ ...one.items[0], unit_price: -1 }] }).item_0_unit_price);
assert.ok(validateQuotation({ ...one, items: [{ ...one.items[0], product_name: '' }] }).item_0_product_name);
assert.equal(normalizeLocalQuotation({ items: null, terms: null }).items.length, 1);
assert.equal(normalizeLocalQuotation({ items: [{}], terms: {} }).items[0].unit, 'Cái');
assert.equal(emptyQuotation(null, null).prepared_by_name, '');
assert.equal(normalizeLocalQuotation({}, null, null).items.length, 1);

const template = fs.readFileSync(new URL('../public/templates/bao-gia-minh-triet.xlsx', import.meta.url));
for (const count of [1, 20]) {
  const data = makeData(count);
  const blob = await buildQuotationWorkbook(template, data, calculateQuotation(data));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet, new RegExp(`<dimension ref="A1:J${26 + count}"`));
  assert.match(sheet, new RegExp(`<c r="H${17 + count}"[^>]*><v>${calculateQuotation(data).total}<\\/v>`));
  assert.match(sheet, /<c r="H17"[^>]*><v>1100000<\/v>/);
  assert.doesNotMatch(sheet, /<c r="H17"[^>]*><f>/);
  assert.match(sheet, /<b\/>[\s\S]*Sản phẩm kiểm thử số 1[\s\S]*\nDòng mô tả thứ nhất/);
  assert.match(sheet, /Công ty Ánh Dương\nMã số thuế: 0312345678\nĐịa chỉ: 123 Đường Nguyễn Huệ/);
  assert.match(sheet, /<row r="17"[^>]*ht="[4-9]\d(?:\.\d+)?"[^>]*customHeight="1"/);
  assert.doesNotMatch(sheet, /<c r="[A-Z]+\d{7,}"/);
  assert.doesNotMatch(sheet, /\[object Object\]/);
  assert.match(sheet, new RegExp(`r="D${26 + count}"`));
  assert.doesNotMatch(sheet, /#REF!|#VALUE!|#DIV\/0!/);
  if (count === 20) {
    const drawing = await zip.file('xl/drawings/drawing1.xml').async('string');
    assert.match(drawing, /<xdr:row>46<\/xdr:row>/);
  }
  fs.mkdirSync(new URL('../output/quotation-tests/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL(`../output/quotation-tests/bao-gia-${count}-san-pham.xlsx`, import.meta.url), Buffer.from(await blob.arrayBuffer()));
}
for (const count of [1, 20]) {
  const data = { ...makeData(count), vat_mode: '8' };
  const summary = calculateQuotation(data);
  const blob = await buildQuotationWorkbook(template, data, summary);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const first = 17 + count;
  assert.match(sheet, new RegExp(`<dimension ref="A1:J${28 + count}"`));
  assert.match(sheet, new RegExp(`<c r="B${first}"[^>]*>[\\s\\S]*?TỔNG TIỀN`));
  assert.match(sheet, new RegExp(`<c r="H${first}"[^>]*><v>${summary.preVat}<\\/v>`));
  assert.match(sheet, new RegExp(`<c r="B${first + 1}"[^>]*>[\\s\\S]*?VAT 8%`));
  assert.match(sheet, new RegExp(`<c r="H${first + 1}"[^>]*><v>${summary.vat}<\\/v>`));
  assert.match(sheet, new RegExp(`<c r="H${first + 2}"[^>]*><v>${summary.total}<\\/v>`));
  assert.match(sheet, new RegExp(`<mergeCell ref="B${first + 2}:G${first + 2}"/>`));
  assert.match(sheet, new RegExp(`r="D${28 + count}"`));
  const merges = [...sheet.matchAll(/<mergeCell ref=/g)].length;
  assert.match(sheet, new RegExp(`<mergeCells count="${merges}">`));
  fs.writeFileSync(new URL(`../output/quotation-tests/bao-gia-chua-vat-${count}-san-pham.xlsx`, import.meta.url), Buffer.from(await blob.arrayBuffer()));
}
{
  const data = { ...makeData(2), vat_mode: 'per_item' };
  data.items[1] = { ...data.items[1], vat_rate: 5 };
  const summary = calculateQuotation(data);
  assert.equal(summary.vatLines.length, 2);
  const blob = await buildQuotationWorkbook(template, data, summary);
  const sheet = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('xl/worksheets/sheet1.xml').async('string');
  // 2 sản phẩm (dòng 17-18) + Tổng tiền (19) + VAT 8% (20) + VAT 5% (21) + Tổng đã gồm VAT (22).
  assert.match(sheet, /<dimension ref="A1:J31"/);
  assert.match(sheet, /<c r="B21"[^>]*>[\s\S]*?VAT 5%/);
  assert.match(sheet, new RegExp(`<c r="H22"[^>]*><v>${summary.total}<\\/v>`));
  assert.match(sheet, /\nVAT 5%<\/t>/);
  fs.writeFileSync(new URL('../output/quotation-tests/bao-gia-vat-tung-san-pham.xlsx', import.meta.url), Buffer.from(await blob.arrayBuffer()));
}
console.log('PASS: calculation, validation, Vietnamese data, 1-product and 20-product template exports (VAT included and excluded).');
