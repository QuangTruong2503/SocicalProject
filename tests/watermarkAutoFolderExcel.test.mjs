import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createFolderNameWorkbook, parseFolderNameFile, FOLDER_EXCEL_HEADERS } from '../src/utils/watermarkAutoFolderExcel.js';
import { prepareFolderNameChanges } from '../src/utils/watermarkAutoFolderNames.js';

const products = [
  { id: 'p1', excelId: 'session-a-folder-1', folderName: 'Máy khoan', relativePath: 'Cha 1/Máy khoan' },
  { id: 'p2', excelId: 'session-a-folder-2', folderName: 'Máy khoan', relativePath: 'Cha 2/Máy khoan' },
  { id: 'p3', excelId: 'session-a-folder-3', folderName: '=123', relativePath: 'Cha 2/=123', outputFolderName: 'Máy mài mới' },
];
const fileFrom = (workbook, name = 'Folders.xlsx') => ({
  name,
  arrayBuffer: async () => XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }),
});
const workbookFrom = (rows) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Folders');
  return workbook;
};

test('Excel roundtrip preserves unique text IDs, source paths, current names and names starting with =', async () => {
  const workbook = createFolderNameWorkbook(products);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  assert.deepEqual(values[0], FOLDER_EXCEL_HEADERS);
  assert.deepEqual(values[1], ['session-a-folder-1', 'Cha 1/Máy khoan', 'Máy khoan', 'Máy khoan']);
  assert.equal(values[3][3], 'Máy mài mới');
  const formulaName = createFolderNameWorkbook([{ ...products[2], outputFolderName: undefined }]);
  assert.equal(formulaName.Sheets[formulaName.SheetNames[0]].D2.t, 's');
  assert.equal(formulaName.Sheets[formulaName.SheetNames[0]].D2.f, undefined);
  const parsed = await parseFolderNameFile(fileFrom(workbook));
  assert.equal(prepareFolderNameChanges(parsed, products)[2].folderName, 'Máy mài mới');
  assert.throws(() => createFolderNameWorkbook([]), /Chưa có/);
});

test('AI Excel roundtrip writes only column D and rejects any blank, unsafe or overlong value', async () => {
  const names = new Map(products.map(({ excelId }, index) => [excelId, ['Tên mới', 'a'.repeat(40), '=123'][index]]));
  const workbook = createFolderNameWorkbook(products, names);
  assert.deepEqual(workbook.SheetNames, ['Ten folder san pham']);
  const serialized = XLSX.read(await fileFrom(workbook).arrayBuffer(), { type: 'array' });
  const sheet = serialized.Sheets[serialized.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const original = XLSX.utils.sheet_to_json(createFolderNameWorkbook(products).Sheets['Ten folder san pham'], { header: 1 });
  assert.deepEqual(rows.map((row) => row.slice(0, 3)), original.map((row) => row.slice(0, 3)));
  assert.deepEqual(rows.slice(1).map((row) => row[3]), [...names.values()]);
  assert.equal(sheet.D4.f, undefined);
  for (const badName of ['', 'a'.repeat(41), 'a/b', 'COM¹.txt']) {
    const bad = new Map(names).set(products[0].excelId, badName);
    assert.throws(() => createFolderNameWorkbook(products, bad), /Dòng 2/);
  }
});

test('sorted rows, reordered columns, partial imports and blank rows match by ID rather than name or position', async () => {
  const workbook = workbookFrom([
    ['Tên folder mới', 'ID folder'],
    ['Tên máy thứ hai', products[1].excelId],
    [],
    ['Tên máy thứ nhất', products[0].excelId],
  ]);
  const rows = await parseFolderNameFile(fileFrom(workbook));
  const changes = prepareFolderNameChanges(rows, products);
  assert.deepEqual(changes.map(({ product, folderName }) => [product.id, folderName]), [['p2', 'Tên máy thứ hai'], ['p1', 'Tên máy thứ nhất']]);
  assert.deepEqual(rows.map((row) => row.rowNumber), [2, 4]);
});

test('rejects duplicate, unknown, missing IDs and invalid names without changing products', () => {
  const before = structuredClone(products);
  const valid = { id: products[0].excelId, name: 'Tên hợp lệ', rowNumber: 2 };
  const badRows = [
    { ...valid, id: 'session-b-folder-1' }, { ...valid, id: '' }, valid,
    ...['', '../abc', 'con.txt', 'NUL', 'x/y', 'x\\y', 'a:b', 'abc.', 'Result', 'NAMED', 'a\u0000b', 'a'.repeat(301)].map((name) => ({ ...valid, id: products[1].excelId, name })),
  ];
  for (const bad of badRows) assert.throws(() => prepareFolderNameChanges([valid, bad], products), /Dòng/);
  assert.throws(() => prepareFolderNameChanges([], products), /chưa có/);
  assert.deepEqual(products, before);
});

test('rejects formulas, missing headers, duplicate headers, empty workbooks and unsupported files', async () => {
  const workbook = workbookFrom([FOLDER_EXCEL_HEADERS, [products[0].excelId, 'path', 'old', 'new']]);
  workbook.Sheets.Folders.D2 = { t: 's', v: 'cached name', f: 'A2' };
  await assert.rejects(parseFolderNameFile(fileFrom(workbook)), /không dùng công thức/);
  for (const rows of [[['ID', 'Name']], [['ID folder', 'Tên folder mới', 'ID folder']], []]) {
    await assert.rejects(parseFolderNameFile(fileFrom(workbookFrom(rows))), /cột|sheet/);
  }
  await assert.rejects(parseFolderNameFile({ name: 'data.csv' }), /\.xlsx/);
});
