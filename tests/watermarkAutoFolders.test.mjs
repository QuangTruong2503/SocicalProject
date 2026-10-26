// /watermark/auto: folder scanning, "Named" writer and naming rules, on in-memory handles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JPEG, PNG, WEBP, makeTree } from './fixtures/fakeFileSystem.mjs';
import {
  classifyFileError,
  createNamedFolderWriter,
  getFolderAccessSupport,
  getWritePermission,
  isSameFolder,
  pickDirectory,
  readSourceFile,
  scanParentFolder,
  scanProductFolder,
} from '../src/utils/productFolderAccess.js';
import {
  fallbackBaseName,
  nextAvailableFileName,
  normalizeProductName,
  outputBaseName,
  validateProductName,
} from '../src/utils/watermarkAutoNaming.js';

const blob = (text = 'jpeg') => new Blob([text], { type: 'image/jpeg' });

test('product scan: direct images only, natural order, Named and nested folders skipped, broken files counted', async () => {
  const root = makeTree('SanPham', {
    'Máy khoan': {
      'IMG_10.jpg': JPEG, 'IMG_2.JPG': JPEG, 'IMG_1.png': PNG, 'b.webp': WEBP,
      'fake.jpg': [1, 2, 3, 4], 'empty.png': [], 'notes.txt': [65], 'clip.heic': JPEG, 'Thumbs.db': [0], '.DS_Store': [0],
      named: { 'old.jpg': JPEG }, 'Phụ kiện': { 'IMG_99.jpg': JPEG },
    },
  });
  const scan = await scanProductFolder(root.file('Máy khoan').handle, { relativePath: 'SanPham/Máy khoan' });
  assert.deepEqual(scan.images.map((image) => image.name), ['b.webp', 'IMG_1.png', 'IMG_2.JPG', 'IMG_10.jpg']);
  assert.equal(scan.unsupported, 2, 'txt + heic');
  assert.equal(scan.invalid, 2, 'wrong signature + empty file');
  assert.equal(scan.nestedFolders, 1);
  assert.equal(scan.namedHandle?.name, 'named', 'existing lowercase result folder is reused, not read');
  assert.equal(scan.namedIsFile, false);
  assert.equal(scan.relativePath, 'SanPham/Máy khoan');
  assert.ok(scan.images.every((image) => image.size > 0 && Number.isFinite(image.lastModified)));
});

test('parent scan: every direct sub-folder is a product; root images and Named are skipped', async () => {
  const root = makeTree('SanPham', {
    'Máy mài 10': { 'a.jpg': JPEG }, 'Máy mài 2': { 'a.jpg': JPEG }, Named: { 'x.jpg': JPEG }, Trống: {},
    'root-1.jpg': JPEG, 'root-2.png': PNG, 'readme.txt': [65],
  });
  const result = await scanParentFolder(root);
  assert.deepEqual(result.products.map((product) => product.folderName), ['Máy mài 2', 'Máy mài 10', 'Trống']);
  assert.deepEqual(result.products.map((product) => product.relativePath), ['SanPham/Máy mài 2', 'SanPham/Máy mài 10', 'SanPham/Trống']);
  assert.equal(result.rootImages, 2);
  assert.equal(result.namedSkipped, 1);
  assert.equal(result.products[2].images.length, 0);
});

test('a file called "Named" is reported and blocks creating the result folder', async () => {
  const root = makeTree('P', { 'a.jpg': JPEG, Named: [1, 2] });
  const scan = await scanProductFolder(root);
  assert.equal(scan.namedIsFile, true);
  const writer = createNamedFolderWriter(root);
  await assert.rejects(writer.write('p-a', blob()), (error) => classifyFileError(error) === 'named_is_file');
});

test('writer: creates Named only on the first save, never overwrites, suffixes case-insensitively across batches', async () => {
  const root = makeTree('Máy khoan', { 'a.jpg': JPEG });
  const writer = createNamedFolderWriter(root);
  assert.equal(root.file('Named'), undefined, 'nothing created before a save');
  assert.equal(await writer.write('may-khoan-mat-truoc', blob('1')), 'may-khoan-mat-truoc.jpg');
  assert.equal(await writer.write('may-khoan-mat-truoc', blob('2')), 'may-khoan-mat-truoc-2.jpg');
  // Another program creates the next name between two saves: the writer re-checks right before creating.
  root.file('Named').handle.addFile('MAY-KHOAN-MAT-TRUOC-3.JPG', JPEG);
  assert.equal(await writer.write('may-khoan-mat-truoc', blob('3')), 'may-khoan-mat-truoc-4.jpg');
  const named = root.file('Named').handle;
  assert.deepEqual([...named.children.keys()].sort(), ['MAY-KHOAN-MAT-TRUOC-3.JPG', 'may-khoan-mat-truoc-2.jpg', 'may-khoan-mat-truoc-4.jpg', 'may-khoan-mat-truoc.jpg']);
  assert.equal(await named.file('may-khoan-mat-truoc.jpg').data.text(), '1', 'first file kept');
});

test('writer: reuses an existing "named" folder and avoids names already on disk', async () => {
  const root = makeTree('P', { 'a.jpg': JPEG, named: { 'p-toan-canh.jpg': JPEG, 'P-TOAN-CANH-2.jpg': JPEG } });
  const scan = await scanProductFolder(root);
  const writer = createNamedFolderWriter(root, { namedHandle: scan.namedHandle });
  assert.equal(await writer.write('p-toan-canh', blob()), 'p-toan-canh-3.jpg');
  assert.equal(root.children.size, 2, 'no second result folder');
  assert.equal(writer.folderName, 'named');
  // Even without the scanned handle the writer finds it.
  const late = createNamedFolderWriter(root);
  assert.equal(await late.write('p-toan-canh', blob()), 'p-toan-canh-4.jpg');
});

test('writer: a failed write removes only its own unfinished file and a retry may reuse the name', async () => {
  const root = makeTree('P', { 'a.jpg': JPEG, Named: { 'keep.jpg': JPEG } });
  const writer = createNamedFolderWriter(root);
  root.fs.failClose = (name) => (name === 'p-a.jpg' ? new DOMException('disk', 'QuotaExceededError') : null);
  const error = await writer.write('p-a', blob()).catch((caught) => caught);
  assert.equal(classifyFileError(error), 'disk_full');
  assert.equal(error.attemptedName, 'p-a.jpg');
  const named = root.file('Named').handle;
  assert.deepEqual([...named.children.keys()], ['keep.jpg'], 'unfinished file removed, existing file untouched');
  root.fs.failClose = null;
  assert.equal(await writer.write('p-a', blob(), { preferredName: error.attemptedName }), 'p-a.jpg');
  // A name this writer did not reserve is never forced.
  assert.equal(await writer.write('keep', blob(), { preferredName: 'keep.jpg' }), 'keep-2.jpg');
});

test('writer rejects unsafe names instead of writing outside Named', async () => {
  const root = makeTree('P', {});
  const writer = createNamedFolderWriter(root);
  for (const base of ['../evil', 'a/b', '..', 'Có Dấu']) {
    await assert.rejects(writer.write(base, blob()), /Tên file không hợp lệ/);
  }
  assert.equal(root.fs.writes.length, 0);
});

test('source snapshot: edited or deleted files are reported as changed', async () => {
  const root = makeTree('P', { 'a.jpg': JPEG });
  const [image] = (await scanProductFolder(root)).images;
  assert.equal((await readSourceFile(image)).name, 'a.jpg');
  root.addFile('a.jpg', [...JPEG, 1]);
  await assert.rejects(readSourceFile(image), (error) => error.code === 'source_changed');
  root.children.clear();
  await assert.rejects(readSourceFile(image), (error) => error.code === 'source_changed');
});

test('permissions: query without prompting, request only when asked, errors count as denied', async () => {
  const root = makeTree('P', {});
  root.fs.permission = 'prompt';
  assert.equal(await getWritePermission(root), 'prompt');
  assert.deepEqual(root.fs.requests, []);
  root.fs.grantOnRequest = true;
  assert.equal(await getWritePermission(root, { request: true }), 'granted');
  assert.deepEqual(root.fs.requests, ['P']);
  assert.equal(await getWritePermission({ queryPermission: async () => { throw new Error('x'); } }), 'denied');
});

test('folder identity uses isSameEntry; equal names are different folders', async () => {
  const root = makeTree('R', { A: { Máy: {} }, B: { Máy: {} } });
  const a = root.file('A').handle.file('Máy').handle;
  const b = root.file('B').handle.file('Máy').handle;
  assert.equal(await isSameFolder(a, a), true);
  assert.equal(await isSameFolder(a, b), false);
});

test('support detection and picker cancel', async () => {
  assert.deepEqual(getFolderAccessSupport({ isSecureContext: false, showDirectoryPicker() {} }), { supported: false, reason: 'insecure' });
  assert.deepEqual(getFolderAccessSupport({ isSecureContext: true }), { supported: false, reason: 'no_picker' });
  assert.deepEqual(getFolderAccessSupport({ isSecureContext: true, showDirectoryPicker() {} }), { supported: true, reason: null });
  const calls = [];
  const win = { showDirectoryPicker: async (options) => { calls.push(options); throw new DOMException('closed', 'AbortError'); } };
  assert.equal(await pickDirectory(win), null);
  assert.equal(calls[0].mode, 'readwrite');
});

test('naming: folder names are sent as written, limits are explicit, files are Windows-safe slugs', () => {
  assert.equal(normalizeProductName('  Máy khoan\tBosch   GSB 13 RE  '), 'Máy khoan Bosch GSB 13 RE');
  assert.equal(normalizeProductName('Máy'), 'Máy', 'NFC');
  assert.equal(validateProductName('Máy khoan'), null);
  assert.match(validateProductName('x'.repeat(151)), /tối đa 150/);
  assert.match(validateProductName('!!!'), /chữ cái hoặc chữ số/);
  assert.equal(outputBaseName('may-khoan-bosch-goc-nhin-mat-truoc', 'Máy khoan Bosch', 1), 'may-khoan-bosch-goc-nhin-mat-truoc');
  assert.equal(outputBaseName('may-khoan-bosch-7', 'Máy khoan Bosch', 7), 'may-khoan-bosch-007', 'server fallback becomes padded');
  assert.equal(outputBaseName('', 'Máy khoan Bosch', 12), 'may-khoan-bosch-012');
  assert.equal(outputBaseName('con', 'Con', 1), 'con-anh');
  assert.equal(fallbackBaseName('!!!', 3), 'anh-san-pham-003');
  assert.equal(nextAvailableFileName('a', new Set(['a.jpg', 'a-2.jpg'])), 'a-3.jpg');
});
