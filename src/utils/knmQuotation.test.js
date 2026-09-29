import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateKnmTotals, createDraftKnmQuotation, normalizeKnmQuotation } from './knmQuotation.js';
import { parseKnmProductRows, parseKnmProductImportFile } from './knmQuotationImport.js';

const headers = ['Tên sản phẩm', 'Mô tả', 'Thương hiệu', 'Số lượng', 'ĐVT', 'Đơn giá'];

test('Gồm VAT: total equals entered prices, no VAT lines', () => {
  const totals = calculateKnmTotals({ vatMode: 'included', vatRate: 8, items: [{ quantity: 2, unitPrice: 108000 }] });
  assert.deepEqual(totals, { vatMode: 'included', subtotal: 216000, vatLines: [], vatAmount: 0, total: 216000 });
  assert.equal(createDraftKnmQuotation().vatMode, 'included');
});

test('Chia VAT: one common rate added on top of net prices', () => {
  const totals = calculateKnmTotals({ vatMode: 'common', vatRate: 8, items: [{ quantity: 2, unitPrice: 100000 }] });
  assert.equal(totals.subtotal, 200000);
  assert.deepEqual(totals.vatLines, [{ rate: 8, base: 200000, amount: 16000 }]);
  assert.equal(totals.total, 216000);
  assert.deepEqual(calculateKnmTotals({ vatMode: 'common', vatRate: 8, items: [] }).vatLines, [{ rate: 8, base: 0, amount: 0 }]);
});

test('Chia VAT từng sản phẩm: one VAT line per rate, highest first, default 8%', () => {
  const totals = calculateKnmTotals({
    vatMode: 'per_item',
    vatRate: 10,
    items: [
      { quantity: 2, unitPrice: 100000, vatRate: 8 },
      { quantity: 1, unitPrice: 300000, vatRate: 5 },
      { quantity: 1, unitPrice: 50000 },
    ],
  });
  assert.equal(totals.subtotal, 550000);
  assert.deepEqual(totals.vatLines, [
    { rate: 8, base: 250000, amount: 20000 },
    { rate: 5, base: 300000, amount: 15000 },
  ]);
  assert.equal(totals.vatAmount, 35000);
  assert.equal(totals.total, 585000);
});

test('legacy saved quotations reopen as Chia VAT with the same total', () => {
  const legacy = { vatRate: 8, vatInclusiveInput: true, items: [{ quantity: 3, unitPrice: 101 / 1.08 }] };
  const normalized = normalizeKnmQuotation(legacy);
  assert.equal(normalized.vatMode, 'common');
  assert.equal('vatInclusiveInput' in normalized, false);
  assert.equal(normalized.items[0].vatRate, 8);
  assert.equal(calculateKnmTotals(normalized).total, 303);
  assert.deepEqual(normalizeKnmQuotation(undefined), {});
});

test('Excel rows preserve numeric data, descriptions, custom units and unique ids', () => {
  const rows = parseKnmProductRows([headers,
    ['Máy khoan', 'Thông số\nBảo hành', 'Bosch', 2, 'Bộ', 101],
    ['', '', '', '', '', ''],
    ['Dây', '', '', 1.5, 'Sợi', 12500.5],
    ['Quà tặng', '', '', 0, '', 0],
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].description, 'Máy khoan\nThông số\nBảo hành');
  assert.equal(rows[0].unitPrice, 101);
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].unit, 'Bộ');
  assert.equal(rows[1].unit, 'Khác');
  assert.equal(rows[1].customUnit, 'Sợi');
  assert.equal(rows[1].quantity, 1.5);
  assert.equal(rows[1].unitPrice, 12500.5);
  assert.equal(rows[2].quantity, 0);
  assert.equal(new Set(rows.map((row) => row.id)).size, 3);
});

test('Excel import rejects invalid files/rows without silently dropping products', async () => {
  assert.throws(() => parseKnmProductRows([]), /tiêu đề/);
  assert.throws(() => parseKnmProductRows([headers]), /Không tìm thấy/);
  assert.throws(() => parseKnmProductRows([headers, [], ['', '', 'Bosch']]), /Dòng 3.*thiếu/);
  for (const invalid of [-1, 'abc', '100.000 ₫', Infinity]) {
    assert.throws(() => parseKnmProductRows([headers, ['Máy', '', '', 1, 'Cái', invalid]]), /Dòng 2.*Đơn giá/);
  }
  assert.throws(() => parseKnmProductRows([headers, ['Máy', '', '', -2]]), /Số lượng/);
  await assert.rejects(parseKnmProductImportFile({ name: 'data.txt' }), /Excel/);
});
