import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateKnmTotals, toGrossUnitPrice, toNetUnitPrice } from './knmQuotation.js';
import { parseKnmProductRows, parseKnmProductImportFile } from './knmQuotationImport.js';

const headers = ['Tên sản phẩm', 'Mô tả', 'Thương hiệu', 'Số lượng', 'ĐVT', 'Đơn giá'];

test('VAT conversion preserves entered gross prices, including 101, after serialization', () => {
  for (const rate of [0, 5, 8, 10]) {
    for (let gross = 0; gross <= 10000; gross++) {
      const net = JSON.parse(JSON.stringify(toNetUnitPrice(gross, rate)));
      assert.equal(toGrossUnitPrice(net, rate), gross);
      assert.equal(calculateKnmTotals([{ quantity: 1, unitPrice: net }], rate).total, gross);
    }
  }
});

test('totals retain gross values for multiple quantities and products', () => {
  const totals = calculateKnmTotals([
    { quantity: 3, unitPrice: toNetUnitPrice(101, 8) },
    { quantity: 2, unitPrice: toNetUnitPrice(107, 8) },
  ], 8);
  assert.equal(totals.total, 517);
  assert.equal(totals.subtotal + totals.vatAmount, totals.total);
  assert.deepEqual(calculateKnmTotals([{ quantity: 2, unitPrice: 100000 }], 8), {
    subtotal: 200000, vatAmount: 16000, total: 216000,
  });
  assert.deepEqual(calculateKnmTotals([], 8), { subtotal: 0, vatAmount: 0, total: 0 });
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
