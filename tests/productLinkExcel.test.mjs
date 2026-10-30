import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { createProductLinkWorkbook } from '../src/utils/productLinkExcel.js';

test('Excel preserves all products, text codes and every clickable image link after serialization', async () => {
  const items = Array.from({ length: 45 }, (_, index) => ({
    code: index === 0 ? '00123' : index === 1 ? '=1+1' : `Sản phẩm ${index}`,
    links: index === 2 ? [] : [
      `https://example.com/${index}.jpg?size=large&v=1`,
      `https://example.com/${index}-2.png`,
    ],
    is_done: index % 2 === 0,
  }));
  const workbook = createProductLinkWorkbook(items);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const saved = XLSX.read(buffer, { type: 'buffer' });
  const zip = await JSZip.loadAsync(buffer);
  const relationships = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
  const sheet = saved.Sheets[saved.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  assert.deepEqual(rows[0], ['Mã sản phẩm', 'Link ảnh 1', 'Link ảnh 2']);
  assert.equal(rows.length, 46);
  items.forEach((item, index) => {
    assert.deepEqual(rows[index + 1], [item.code, item.links[0] || '', item.links[1] || '']);
    item.links.forEach((link, column) => {
      const cell = XLSX.utils.encode_cell({ r: index + 1, c: column + 1 });
      assert.equal(workbook.Sheets[workbook.SheetNames[0]][cell].l.Target, link);
      assert.ok(relationships.includes(`Target="${link.replaceAll('&', '&amp;')}"`));
    });
  });
  assert.equal(sheet.A2.t, 's');
  assert.equal(sheet.A3.f, undefined);
  assert.equal(sheet.A3.v, '=1+1');
  assert.equal(sheet['!autofilter'].ref, 'A1:C46');
});

test('Excel handles products without images and rejects an empty list', () => {
  const workbook = createProductLinkWorkbook([{ code: 'Chưa có ảnh', links: [] }]);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }), [
    ['Mã sản phẩm', 'Link ảnh 1'], ['Chưa có ảnh', ''],
  ]);
  assert.throws(() => createProductLinkWorkbook([]), /Chưa có sản phẩm/);
});
