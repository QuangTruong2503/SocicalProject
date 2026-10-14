import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateKnmTotals, copyKnmQuotationForNew, createDraftKnmQuotation, finalizeKnmQuotation, isBlankKnmItem,
  knmEditableSnapshot, knmGrossUnitPrice, knmLineAmount, knmUnitPrice, newKnmItem, normalizeKnmQuotation,
  validateKnmQuotation,
} from './knmQuotation.js';
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

test('Tự động chia VAT: total equals the VAT-inclusive prices typed, net price rounded to đồng', () => {
  const quotation = {
    vatMode: 'common', vatRate: 8, autoSplitVat: true,
    items: [{ quantity: 10, unitPrice: 0, grossUnitPrice: 1000000 }, { quantity: 3, unitPrice: 0, grossUnitPrice: 333333 }],
  };
  const totals = calculateKnmTotals(quotation);
  assert.equal(totals.total, 10000000 + 999999);
  assert.equal(totals.subtotal + totals.vatAmount, totals.total);
  assert.equal(knmUnitPrice(quotation.items[0], quotation), 925926);
  assert.equal(knmLineAmount(quotation.items[0], quotation), 9259260);
  assert.equal(knmLineAmount(quotation.items[1], quotation), 3 * 308642);
  // Lines add up to the subtotal; VAT is what is left of the typed total.
  assert.equal(totals.subtotal, 9259260 + 925926);
  assert.deepEqual(totals.vatLines, [{ rate: 8, base: 10185186, amount: 814813 }]);
  assert.equal(knmGrossUnitPrice(quotation.items[0], quotation), 1000000);
  // Changing the rate keeps the typed VAT-inclusive price and re-derives the net one.
  const at10 = { ...quotation, vatRate: 10 };
  assert.equal(calculateKnmTotals(at10).total, 10999999);
  assert.equal(knmUnitPrice(quotation.items[0], at10), 909091);
  // "Gồm VAT" shows the typed price as is.
  const included = { ...quotation, vatMode: 'included' };
  assert.equal(knmUnitPrice(quotation.items[0], included), 1000000);
  assert.equal(calculateKnmTotals(included).total, 10999999);
});

test('mixed net and VAT-inclusive items per rate', () => {
  const quotation = {
    vatMode: 'per_item',
    items: [
      { quantity: 1, unitPrice: 100000, vatRate: 8 },
      { quantity: 1, unitPrice: 0, grossUnitPrice: 108000, vatRate: 8 },
      { quantity: 2, unitPrice: 0, grossUnitPrice: 105000, vatRate: 5 },
    ],
  };
  const totals = calculateKnmTotals(quotation);
  assert.deepEqual(totals.vatLines, [{ rate: 8, base: 200000, amount: 16000 }, { rate: 5, base: 200000, amount: 10000 }]);
  assert.equal(totals.total, 426000);
  assert.equal(knmGrossUnitPrice({ unitPrice: 100000, vatRate: 8 }, quotation), 108000);
});

test('blank rows are ignored by validation, snapshots and the saved copy', () => {
  const draft = createDraftKnmQuotation();
  assert.equal(isBlankKnmItem(draft.items[0]), true);
  assert.deepEqual(validateKnmQuotation(draft), { customerName: 'Tên khách hàng là bắt buộc.', items: 'Cần ít nhất một sản phẩm có tên.' });

  const filled = { ...draft, customer: { ...draft.customer, name: 'KH', email: 'sai@' }, items: [
    { ...newKnmItem(), description: 'Máy', unitPrice: 5 },
    { ...newKnmItem(), unitPrice: 7 },
    { ...newKnmItem(), description: 'Không SL', quantity: 0 },
    { ...newKnmItem(), description: 'ĐVT', unit: 'Khác' },
    newKnmItem(),
  ] };
  const errors = validateKnmQuotation(filled);
  assert.equal(errors.customerEmail, 'Email chưa đúng định dạng.');
  assert.deepEqual(Object.values(errors.itemErrors), ['Thiếu tên sản phẩm.', 'Số lượng phải lớn hơn 0.', 'Nhập đơn vị tính.']);
  assert.equal(finalizeKnmQuotation(filled).items.length, 4);

  const company = { name: 'KNM', showLogo: true };
  const withBlank = { ...filled, items: [...filled.items, newKnmItem()] };
  assert.equal(knmEditableSnapshot(company, withBlank), knmEditableSnapshot(company, filled));
  assert.notEqual(knmEditableSnapshot({ ...company, showLogo: false }, filled), knmEditableSnapshot(company, filled));
  assert.equal(knmEditableSnapshot(company, { ...filled, quotationNo: 'BG-1' }), knmEditableSnapshot(company, filled));
});

test('saved copy keeps the derived net price; copies get new ids and no number', () => {
  const quotation = { vatMode: 'common', vatRate: 8, items: [{ id: 'a', description: 'X', quantity: 1, unitPrice: 0, grossUnitPrice: 100000 }] };
  assert.equal(finalizeKnmQuotation(quotation).items[0].unitPrice, 92593);
  const copy = copyKnmQuotationForNew({ ...quotation, quotationNo: 'BG-1', quotationDate: '2020-01-01' });
  assert.equal(copy.quotationNo, '');
  assert.notEqual(copy.items[0].id, 'a');
  assert.notEqual(copy.quotationDate, '2020-01-01');
  assert.equal(copy.items[0].grossUnitPrice, 100000);
});

test('Tự động chia VAT: đơn giá × số lượng = thành tiền, lines = subtotal, total = typed (random cases)', () => {
  let seed = 7;
  const random = (max) => { seed = (seed * 48271) % 2147483647; return seed % max; };
  for (let run = 0; run < 500; run += 1) {
    const vatMode = random(2) ? 'common' : 'per_item';
    const items = Array.from({ length: 1 + random(6) }, () => ({
      quantity: random(4) ? 1 + random(40) : (1 + random(30)) / 2,
      unitPrice: 0,
      grossUnitPrice: 1000 + random(50000000),
      vatRate: [0, 5, 8, 10][random(4)],
    }));
    const quotation = { vatMode, vatRate: [0, 5, 8, 10][random(4)], items };
    const totals = calculateKnmTotals(quotation);
    let lines = 0;
    let typed = 0;
    items.forEach((item) => {
      const line = knmLineAmount(item, quotation);
      assert.equal(line, Math.round(item.quantity * knmUnitPrice(item, quotation)));
      assert.ok(Number.isInteger(knmUnitPrice(item, quotation)));
      lines += line;
      typed += Math.round(item.quantity * item.grossUnitPrice);
    });
    assert.equal(totals.subtotal, lines);
    // Half quantities can leave half a đồng: each line's VAT-inclusive amount is rounded.
    assert.equal(totals.total, typed);
    totals.vatLines.forEach((line) => assert.ok(line.amount >= 0));
  }
});
