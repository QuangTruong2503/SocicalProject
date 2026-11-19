// The real /tools/watermark/auto page in jsdom: folder picking, permission, start/stop/resume,
// the AI request sent through the production service (fetch mocked) and the files written.
// Run with: node --import ./tests/watermarkAutoLoader.mjs --test tests/watermarkAutoUI.test.mjs
import { dom } from './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { JPEG, imagesSpec, makeTree } from './fixtures/fakeFileSystem.mjs';
import * as XLSX from 'xlsx';

globalThis.FileReader = dom.window.FileReader;
globalThis.localStorage = dom.window.localStorage;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open'); };
const { default: WatermarkAuto } = await import('../src/pages/WatermarkAuto.jsx');
const { AuthContext } = await import('../src/context/authContext.js');
const { ThemeProvider } = await import('../src/context/ThemeContext.jsx');

const USER = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' }, profile: { role: 'user', plan: 'pro', status: 'active' }, isInitializing: false, isAuthenticated: true };
let root;
let picks;
let fetchCalls;
let respond;

async function settle(ms = 30) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); }
const text = () => document.body.textContent;
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(label));
async function click(element) { assert.ok(element, 'control exists'); await act(async () => { element.click(); }); await settle(); }
async function chooseResultRoot(folder = makeTree('Output', {})) {
  picks.unshift(folder);
  await click(button('Chọn nơi lưu Result') ?? button('Đổi nơi lưu Result'));
  return folder;
}
async function dropFolders(items) {
  const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { items } });
  await act(async () => {
    document.querySelector('.wma-folder-drop').dispatchEvent(event);
  });
  assert.equal(event.defaultPrevented, true, 'prevent the browser from opening dropped files');
  await settle();
}
const droppedItem = (handle) => ({ kind: 'file', getAsFileSystemHandle: async () => handle });
async function waitFor(predicate, message, timeout = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) assert.fail(message);
    await settle(20);
  }
}
async function select(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await settle();
}

async function edit(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle();
}

async function render() {
  root = createRoot(document.querySelector('#root'));
  await act(async () => {
    root.render(React.createElement(HelmetProvider, null,
      React.createElement(ThemeProvider, null,
        React.createElement(AuthContext.Provider, { value: USER },
          React.createElement(MemoryRouter, { initialEntries: ['/tools/watermark/auto'] },
            React.createElement(Routes, null,
              React.createElement(Route, { path: '/tools/watermark/auto', element: React.createElement(WatermarkAuto) }),
              React.createElement(Route, { path: '/tools/watermark', element: React.createElement('h1', null, 'Trang watermark') }),
            ))))));
  });
  await settle(60);
}

/** AI fixture: one name per image, unless the test overrides `respond`. */
const describe = (body) => ({
  items: body.images.map((image) => ({ imageId: image.id, suggestedName: `${body.productName === 'Máy khoan' ? 'may-khoan' : 'may-mai'}-goc-${image.position}`, needsReview: image.position === 2 })),
  failed: [],
});

const folderReply = (folders) => Response.json({
  items: folders.map(({ id, name }) => ({ folderId: id, suggestedName: `Máy khoan ${name}`, issues: [] })),
  failed: [],
});

test.beforeEach(() => {
  picks = [];
  fetchCalls = [];
  respond = async (body) => new Response(JSON.stringify(describe(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.__autoEngine = { logos: [], renders: [], resizes: [], disposed: 0 };
  globalThis.__autoLogo = { url: 'blob:logo', name: 'logo.png', blob: new Blob(['logo']) };
  globalThis.__aiAccessRpc = undefined;
  globalThis.__aiRpcCalls = [];
  globalThis.__aiRenameSession = undefined;
  globalThis.__watermarkCountRows = undefined;
  globalThis.__folderNamingDrafts = new Map();
  localStorage.clear();
  dom.window.isSecureContext = true;
  dom.window.showDirectoryPicker = async () => {
    const next = picks.shift();
    if (!next) throw new DOMException('closed', 'AbortError');
    return next;
  };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push({ url, headers: init.headers, body, signal: init.signal });
    return respond(body, init);
  };
});

test.afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  root = null;
});

test('unsupported browser: explains the limit, no ZIP pretending to create Result', async () => {
  delete dom.window.showDirectoryPicker;
  await render();
  assert.match(text(), /Watermark tự động/);
  assert.match(text(), /Chrome hoặc Edge/);
  assert.match(text(), /không tạo file ZIP thay thế/);
  assert.equal(button('Thêm thư mục sản phẩm').disabled, true);
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.equal(document.querySelector('a[href="/tools/watermark"]').textContent, '← Quay lại Watermark');
});

test('folder Excel export → reorder and edit → import updates AI and Result names, retaining source folders', async () => {
  globalThis.__aiRenameSession = { access_token: 'user-jwt', user: { id: USER.user.id } };
  const parent = makeTree('SanPham', { 'Máy khoan': imagesSpec(1), 'Máy mài': imagesSpec(1), 'Trống': {} });
  picks.push(parent);
  await render();
  assert.equal(button('Xuất Excel tên folder'), undefined);
  await click(button('Chọn thư mục cha'));
  await waitFor(() => document.querySelectorAll('.wma-product').length === 3, 'folders added');
  let downloaded;
  const originalCreate = URL.createObjectURL;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:folder-excel'; };
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    await click(button('Xuất Excel tên folder'));
    await waitFor(() => Boolean(downloaded), 'Excel exported');
  } finally {
    URL.createObjectURL = originalCreate;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
  const workbook = XLSX.read(await downloaded.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  assert.equal(rows.length, 4, 'exports unselected empty folders too');
  assert.equal(new Set(rows.slice(1).map((row) => row[0])).size, 3);
  assert.ok(rows.slice(1).every((row) => text().includes(row[0])), 'IDs visible in product list');
  const updated = [rows[0], ...rows.slice(1).reverse().map((row) => [...row.slice(0, 3), `${row[2]} đã sửa`])];
  const upload = async (data) => {
    workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet(data);
    const file = { name: 'Folders.xlsx', arrayBuffer: async () => XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) };
    const input = document.querySelector('input[aria-label="File Excel tên folder"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
    await waitFor(() => !button('Nhập Excel tên folder').disabled, 'Excel import finished');
  };
  const bad = updated.map((row) => [...row]);
  bad[2][0] = 'wrong-session-id';
  await upload(bad);
  assert.match(document.querySelector('[role="alert"]').textContent, /ID folder/);
  assert.deepEqual([...document.querySelectorAll('.wma-product-title label')].map((label) => label.textContent), ['Máy khoan', 'Máy mài', 'Trống']);
  await upload(updated);
  assert.deepEqual([...document.querySelectorAll('.wma-product-title label')].map((label) => label.textContent), ['Máy khoan đã sửa', 'Máy mài đã sửa', 'Trống đã sửa']);
  assert.match(text(), /SanPham\/Máy khoan/);
  assert.equal(document.querySelector('.wma-row-error[role="alert"]'), null);
  await waitFor(() => !button('Bắt đầu xử lý').disabled, 'ready to start');
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => /Hoàn tất/.test(document.querySelector('.wma-summary')?.textContent || ''), 'finished');
  assert.deepEqual(fetchCalls.map((call) => call.body.productName).sort(), ['Máy khoan đã sửa', 'Máy mài đã sửa']);
  assert.ok(parent.file('Result').handle.file('Máy khoan đã sửa'));
  assert.ok(parent.file('Result').handle.file('Máy mài đã sửa'));
  assert.ok(parent.file('Máy khoan').handle.file('IMG_1.jpg'));
  assert.equal(parent.file('Máy khoan đã sửa'), undefined);
  // Flush this run's delayed telemetry before the next test resets its mock log.
  await settle(1700);
});

test('folder AI stops after the first batch if the server only supports image naming', async () => {
  globalThis.__aiRenameSession = { access_token: 'user-jwt', user: { id: USER.user.id } };
  picks.push(makeTree('SanPham', Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`Model ${index + 1}`, {}]))));
  respond = async () => Response.json({ error: { code: 'invalid_request', message: 'Vui lòng nhập tên sản phẩm.' } }, { status: 400 });
  await render();
  await click(button('Chọn thư mục cha'));
  await waitFor(() => document.querySelectorAll('.wma-product').length === 12, 'folders added');
  await click(button('Đặt tên folder bằng AI'));
  await click(button('Tra cứu và tạo tên'));
  const dialog = document.querySelector('dialog[open]');
  assert.match(dialog.querySelector('[role="alert"]').textContent, /cập nhật Edge Function suggest-image-names/);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].body.kind, 'folders');
  assert.equal(button('Tra cứu phần còn lại').disabled, false);
});

test('folder AI keeps the active batch through Escape, pauses after that batch and resumes only missing folders', async () => {
  const parent = makeTree('SanPham', { A: {}, B: {}, C: {}, D: {}, E: {} });
  picks.push(parent);
  let completeFirst;
  respond = ({ folders }) => fetchCalls.length === 1
    ? new Promise((resolve) => { completeFirst = () => resolve(folderReply(folders)); })
    : Promise.resolve(folderReply(folders));
  await render();
  await click(button('Chọn thư mục cha'));
  await click(button('Đặt tên folder bằng AI'));
  await click(button('Tra cứu và tạo tên'));
  await waitFor(() => Boolean(completeFirst), 'first batch in flight');

  const escape = new dom.window.Event('cancel', { bubbles: true, cancelable: true });
  await act(async () => document.querySelector('dialog[open]').dispatchEvent(escape));
  await waitFor(() => !document.querySelector('dialog[open]'), 'dialog minimized');
  assert.equal(fetchCalls[0].signal.aborted, false);
  assert.match(document.querySelector('.wma-folder-picker-draft').textContent, /Đang tra cứu/);
  assert.equal(button('Xóa danh sách').disabled, true);
  await click(button('Mở bản nháp đặt tên AI'));
  await click(button('Tạm dừng sau lô này'));
  assert.equal(fetchCalls[0].signal.aborted, false);
  await act(async () => completeFirst());
  await waitFor(() => button('Tra cứu phần còn lại') && !button('Tra cứu phần còn lại').disabled, 'lookup paused');
  assert.equal(fetchCalls.length, 1);
  assert.match(document.querySelector('dialog[open]').textContent, /4\/5 folder có kết quả/);

  const firstName = () => document.querySelector('dialog[open] input[aria-label="Tên mới dòng 2"]');
  await edit(firstName(), 'Máy khoan A do tôi sửa');
  await click(document.querySelector('[aria-label="Đóng đặt tên folder"]'));
  await click(button('Mở bản nháp đặt tên AI'));
  assert.equal(firstName().value, 'Máy khoan A do tôi sửa');
  assert.equal(fetchCalls.length, 1);
  await click(button('Tra cứu phần còn lại'));
  await waitFor(() => /5\/5 folder có kết quả/.test(document.querySelector('dialog[open]').textContent), 'lookup completed');
  assert.deepEqual(fetchCalls[1].body.folders.map(({ name }) => name), ['E']);
  assert.equal(firstName().value, 'Máy khoan A do tôi sửa');

  await click(button('Tra cứu lại tất cả'));
  assert.equal(fetchCalls.length, 2, 'regeneration asks before sending');
  assert.match(document.querySelector('[aria-label="Xác nhận tra cứu lại"]').textContent, /phát sinh chi phí/);
  await click(button('Giữ bản nháp'));
  assert.equal(fetchCalls.length, 2);
});

test('folder AI restores completed work across reload and recovers the last batch with the original request ID', async () => {
  const folders = { A: {}, B: {}, C: {}, D: {}, E: {}, F: {}, G: {}, H: {}, I: {} };
  const parent = makeTree('SanPham', folders);
  picks.push(parent);
  let releaseLast;
  respond = async ({ folders }, { signal }) => {
    if (fetchCalls.length === 1) return folderReply(folders);
    return new Promise((resolve) => {
      releaseLast = () => resolve(folderReply(folders));
      signal.addEventListener('abort', releaseLast, { once: true });
    });
  };
  await render();
  await click(button('Chọn thư mục cha'));
  await click(button('Đặt tên folder bằng AI'));
  await click(button('Tra cứu và tạo tên'));
  await waitFor(() => Boolean(releaseLast), 'last batch in flight');
  const previous = fetchCalls[1].body;
  assert.equal(globalThis.__folderNamingDrafts.get(USER.user.id).suggestions.size, 4);

  await act(async () => root.unmount());
  picks.push(parent);
  respond = async ({ folders }) => folderReply(folders);
  await render();
  await click(button('Chọn thư mục cha'));
  await click(button('Đặt tên folder bằng AI'));
  await waitFor(() => Boolean(button('Kiểm tra yêu cầu đã gửi')), 'saved request restored');
  assert.equal(fetchCalls.length, 2, 'opening the restored draft does not send another request');
  assert.match(document.querySelector('dialog[open]').textContent, /4\/9 folder có kết quả/);
  await click(button('Kiểm tra yêu cầu đã gửi'));
  await waitFor(() => /8\/9 folder có kết quả/.test(document.querySelector('dialog[open]').textContent), 'restored batch completed');
  assert.deepEqual(fetchCalls[2].body, previous, 'recovery sends the same idempotent request and input IDs');
  assert.equal(fetchCalls.length, 3, 'recovery does not send a new batch for the ninth folder');
  assert.equal(button('Tra cứu phần còn lại').disabled, false);

  const field = document.querySelector('dialog[open] input[aria-label="Tên mới dòng 2"]');
  await edit(field, 'Máy khoan A do tôi sửa');
  await act(async () => root.unmount());
  picks.push(parent);
  await render();
  await click(button('Chọn thư mục cha'));
  await click(button('Đặt tên folder bằng AI'));
  assert.equal(document.querySelector('dialog[open] input[aria-label="Tên mới dòng 2"]').value, 'Máy khoan A do tôi sửa');
  assert.equal(fetchCalls.length, 3);

  await click(document.querySelector('[aria-label="Đóng đặt tên folder"]'));
  await click(button('Xóa danh sách'));
  picks.push(makeTree('SanPham', folders));
  await click(button('Chọn thư mục cha'));
  await click(button('Đặt tên folder bằng AI'));
  assert.match(document.querySelector('dialog[open]').textContent, /0\/9 folder có kết quả/);
  assert.equal(document.querySelector('dialog[open] input[aria-label="Tên mới dòng 2"]'), null);
  assert.equal(fetchCalls.length, 3, 'separate folders with equal names do not receive the saved draft');
});

test('folder AI generates editable Excel names, remembers its own prompt and asks about labels and model suffixes', async () => {
  globalThis.__aiRenameSession = { access_token: 'user-jwt', user: { id: USER.user.id } };
  const parent = makeTree('SanPham', { 'Bosch GSK 190 mới': imagesSpec(1), 'Kingtony 883524M1': imagesSpec(1), 'Chưa rõ': {} });
  picks.push(parent);
  respond = async ({ folders }) => Response.json({
    items: folders.map(({ id, name }) => name.startsWith('Bosch')
      ? { folderId: id, suggestedName: 'Máy cưa đĩa Bosch GKS 190', issues: ['corrected_model'], note: 'GSK 190 → GKS 190', sourceUrls: ['https://bosch.example/gks-190'] }
      : name.startsWith('Kingtony')
        ? { folderId: id, suggestedName: 'Đầu tuýp Kingtony 883524M', issues: ['unusual_suffix'] }
        : { folderId: id, suggestedName: '', issues: ['not_found'] }).reverse(),
    failed: [],
  });
  await render();
  await click(button('Chọn thư mục cha'));
  await waitFor(() => document.querySelectorAll('.wma-product').length === 3, 'folders added');
  await click(button('Đặt tên folder bằng AI'));
  const dialog = () => document.querySelector('dialog[open]');
  assert.ok(dialog());
  const prompt = () => dialog().querySelector('[aria-label="Prompt đặt tên folder"]');
  assert.match(prompt().value, /40 ký tự/);
  await click(dialog().querySelector('summary'));
  await edit(prompt(), 'Prompt SEO đã tùy chỉnh');
  await click(dialog().querySelector('[aria-label="Đóng đặt tên folder"]'));
  await click(button('Đặt tên folder bằng AI'));
  assert.equal(prompt().value, 'Prompt SEO đã tùy chỉnh');
  await click(button('Tra cứu và tạo tên'));
  await waitFor(() => dialog().textContent.includes('3/3'), 'search resolved');
  assert.equal(fetchCalls[0].body.prompt, 'Prompt SEO đã tùy chỉnh');
  assert.equal(fetchCalls[0].body.kind, 'folders');
  assert.ok(fetchCalls[0].body.folders.every((folder) => Object.keys(folder).sort().join() === 'id,name'));
  assert.ok(dialog().querySelector('a[href="https://bosch.example/gks-190"]'));
  for (const message of ['Cần kiểm tra', 'GSK 190 → GKS 190', 'Không tìm thấy']) assert.ok(dialog().textContent.includes(message));
  assert.equal(button('Áp dụng tên folder').disabled, true);
  const label = dialog().querySelector('[aria-label^="Nhãn tên cũ dòng"]');
  await select(label, 'remove');
  await select(dialog().querySelector('[aria-label^="Hậu tố mã dòng"]'), 'suggested');
  const firstName = label.closest('td').querySelector('input');
  await edit(firstName, 'a'.repeat(41));
  assert.equal(button('Xuất Excel với tên AI').disabled, true);
  await edit(firstName, 'Máy cưa Bosch GKS 190');

  let downloaded;
  const originalCreate = URL.createObjectURL;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => { downloaded = blob; return 'blob:ai-folder-excel'; };
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    await click(button('Xuất Excel với tên AI'));
    await waitFor(() => Boolean(downloaded), 'AI workbook exported');
  } finally {
    URL.createObjectURL = originalCreate;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
  const workbook = XLSX.read(await downloaded.arrayBuffer(), { type: 'array' });
  const cells = XLSX.utils.sheet_to_json(workbook.Sheets['Ten folder san pham'], { header: 1 });
  assert.deepEqual(Object.fromEntries(cells.slice(1).map((row) => row.slice(2))), {
    'Bosch GSK 190 mới': 'Máy cưa Bosch GKS 190', 'Kingtony 883524M1': 'Đầu tuýp Kingtony 883524M', 'Chưa rõ': 'Chưa rõ',
  });
  await click(button('Áp dụng tên folder'));
  assert.equal(dialog(), null);
  assert.deepEqual(new Set([...document.querySelectorAll('.wma-product-title label')].map((label) => label.textContent)), new Set(['Máy cưa Bosch GKS 190', 'Đầu tuýp Kingtony 883524M', 'Chưa rõ']));
  assert.ok(parent.file('Bosch GSK 190 mới'));
  assert.equal(parent.file('Máy cưa Bosch GKS 190'), undefined);
});

test('parent folder → AI names per folder → files in Result/product, with summary and report', async () => {
  const sanPham = makeTree('SanPham', {
    'Máy khoan': { 'IMG_001.jpg': JPEG, 'IMG_002.png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0] },
    'Máy mài': { 'IMG_003.jpg': JPEG },
    'cover.jpg': JPEG,
  });
  picks.push(sanPham);
  // Telemetry is only sent under the account signed in now.
  globalThis.__aiRenameSession = { access_token: 'user-jwt', user: { id: USER.user.id } };
  globalThis.__watermarkCountRows = [];
  await render();
  assert.match(text(), /Chọn logo|Cần cấp quyền|Chọn ít nhất một sản phẩm/);
  await click(button('Chọn thư mục cha'));
  await waitFor(() => /Đã thêm 2 sản phẩm/.test(text()), 'products added');
  assert.match(text(), /Bỏ qua 1 ảnh nằm ngay trong thư mục cha/);
  assert.match(text(), /2 sản phẩm · 3 ảnh đã chọn/);
  assert.match(text(), /SanPham\/Máy khoan/);
  assert.match(text(), /Ảnh được xử lý trên máy\. Bản ảnh nhỏ được gửi tới dịch vụ AI để đặt tên\./);
  assert.match(text(), /Ảnh xuất dạng JPG\. 800 × 600 giữ tỷ lệ và thêm nền trắng khi cần\./);
  assert.equal(document.querySelector('.wm-controls input[type="text"]'), null, 'no shared export-name field');

  const start = button('Bắt đầu xử lý');
  await waitFor(() => !start.disabled, `start enabled (blockers: ${document.querySelector('.wma-blockers')?.textContent})`);
  await click(start);
  await waitFor(() => /Hoàn tất/.test(document.querySelector('.wma-summary')?.textContent || ''), 'run finished');

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://project.supabase.co/functions/v1/suggest-image-names');
  assert.equal(fetchCalls[0].headers.Authorization, 'Bearer user-jwt');
  assert.deepEqual(fetchCalls.map((call) => call.body.productName).sort(), ['Máy khoan', 'Máy mài']);
  assert.deepEqual(fetchCalls.find((call) => call.body.productName === 'Máy khoan').body.images.map((image) => image.position), [1, 2]);
  assert.equal(fetchCalls[0].body.model, 'gpt-6-luna');

  const named = (folder) => [...sanPham.file('Result').handle.file(folder).handle.children.keys()].sort();
  assert.deepEqual(named('Máy khoan'), ['may-khoan-goc-1.jpg', 'may-khoan-goc-2.jpg']);
  assert.deepEqual(named('Máy mài'), ['may-mai-goc-1.jpg']);
  assert.ok(globalThis.__autoEngine.renders.every((call) => call.overrides.maxDimension === 4096));
  assert.deepEqual(globalThis.__autoEngine.resizes, [[800, 600], [800, 600], [800, 600]]);
  assert.equal(document.querySelector('.wma-summary p').textContent,
    'Hoàn tất. Đã lưu 3/3 ảnh trong Result của 2 sản phẩm; 0 ảnh lỗi; 1 ảnh cần kiểm tra.');

  // Report: local file only, with source → result mapping.
  let csv = null;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => { csv = blob; return 'blob:report'; };
  const anchorClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    await click(button('Tải CSV'));
  } finally {
    URL.createObjectURL = originalCreate;
    dom.window.HTMLAnchorElement.prototype.click = anchorClick;
  }
  const report = await csv.text();
  assert.match(report, /IMG_002\.png,SanPham\/Result\/Máy khoan\/may-khoan-goc-2\.jpg,Đã lưu,Có/);
  assert.equal(sanPham.file('Máy khoan').handle.file('Named'), undefined);

  // Telemetry: counts and codes only, under the new source page.
  await settle(1700);
  const sent = globalThis.__aiRpcCalls.filter((call) => call.name === 'usage_log_activity').flatMap((call) => call.params.p_events);
  assert.ok(sent.length >= 3, 'create + download + apply events');
  assert.ok(sent.every((event) => event.sourcePage === 'watermark/auto'));
  const download = sent.find((event) => event.action === 'image.download');
  assert.deepEqual([download.downloadMethod, download.imageSize, download.delivery, download.succeededCount], ['direct', '800x600', 'file_written', 3]);
  assert.deepEqual(globalThis.__watermarkCountRows.map((row) => [row.source_page, row.image_count]), [['watermark/auto', 3]]);
  const serialized = JSON.stringify(sent);
  for (const secret of ['Máy', 'IMG_', 'may-khoan', 'SanPham', 'Prompt']) assert.ok(!serialized.includes(secret), `no ${secret} in telemetry`);
});

test('drop multiple folders: deduplicate by handle, retain equal names, grant write access and save distinct Result products', async () => {
  const first = makeTree('Máy khoan', imagesSpec(1));
  const second = makeTree('Máy khoan', imagesSpec(1));
  second.fs.permission = 'prompt';
  const unreadable = makeTree('Không đọc được', {});
  unreadable.values = async function* () { throw new DOMException('lost', 'NotFoundError'); };
  picks.push(first);
  await render();
  const resultRoot = await chooseResultRoot();
  await click(button('Thêm thư mục sản phẩm'));
  await dropFolders([
    droppedItem(first), droppedItem(second), droppedItem(second),
    droppedItem(makeTree('Named', imagesSpec(1))),
    droppedItem(first.file('IMG_1.jpg').handle), droppedItem(unreadable),
    { kind: 'file', getAsFileSystemHandle: async () => { throw new Error('unreadable'); } },
  ]);
  await waitFor(() => /2 sản phẩm · 2 ảnh đã chọn/.test(text()), 'both distinct folders selected');
  assert.equal(document.querySelectorAll('.wma-product').length, 2);
  assert.match(text(), /2 thư mục đã có trong danh sách/);
  assert.match(text(), /Bỏ qua 1 thư mục kết quả/);
  assert.match(text(), /Bỏ qua 1 file được thả riêng/);
  assert.match(text(), /Không đọc được thư mục “Không đọc được”/);
  assert.match(text(), /Không đọc được 1 mục kéo thả/);
  assert.equal(button('Bắt đầu xử lý').disabled, true, 'dropped read-only handle must be granted');
  assert.deepEqual(second.fs.requests, [], 'never prompt from a background scan');
  second.fs.grantOnRequest = true;
  await click(button('Cấp quyền'));
  await waitFor(() => !button('Bắt đầu xử lý').disabled, 'granted');
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => /Hoàn tất/.test(document.querySelector('.wma-summary')?.textContent || ''), 'finished');
  assert.equal(resultRoot.file('Result').handle.file('Máy khoan').handle.children.size, 1);
  assert.equal(resultRoot.file('Result').handle.file('Máy khoan (2)').handle.children.size, 1);
  assert.equal(first.file('Named'), undefined);
  assert.equal(second.file('Named'), undefined);
  assert.equal(fetchCalls.length, 2);
});

test('unsupported or file-only drops keep existing folders and leave the picker usable', async () => {
  const folder = makeTree('Máy khoan', imagesSpec(1));
  picks.push(folder);
  await render();
  await click(button('Thêm thư mục sản phẩm'));
  await dropFolders([{ kind: 'file' }]);
  assert.match(text(), /Không đọc được thư mục kéo thả trên trình duyệt này/);
  assert.equal(document.querySelectorAll('.wma-product').length, 1);
  assert.equal(button('Thêm thư mục sản phẩm').disabled, false);
  await dropFolders([droppedItem(folder.file('IMG_1.jpg').handle)]);
  assert.match(text(), /Bỏ qua 1 file được thả riêng/);
  assert.equal(document.querySelectorAll('.wma-product').length, 1);
});

test('missing permission blocks start until the folder is granted from its button', async () => {
  const folder = makeTree('Máy khoan', imagesSpec(1));
  folder.fs.permission = 'prompt';
  picks.push(folder);
  await render();
  await chooseResultRoot();
  await click(button('Thêm thư mục sản phẩm'));
  await waitFor(() => /Quyền ghi: chưa cấp/.test(text()), 'permission shown');
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.match(document.querySelector('.wma-blockers').textContent, /Cần cấp quyền ghi cho: Máy khoan/);
  folder.fs.grantOnRequest = true;
  await click(button('Cấp quyền'));
  await waitFor(() => /Quyền ghi: đã cấp/.test(text()), 'granted');
  assert.deepEqual(folder.fs.requests, ['Máy khoan']);
  assert.equal(button('Bắt đầu xử lý').disabled, false);
});

test('entry and folder selection never show an app permission modal, including with an old declined decision', async () => {
  localStorage.setItem('watermark_auto_write_consent', 'denied');
  const folder = makeTree('Máy khoan', imagesSpec(1));
  picks.push(folder);
  await render();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(picks.length, 1, 'no native picker opens on entry');
  await click(button('Thêm thư mục sản phẩm'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await chooseResultRoot();
  assert.equal(button('Bắt đầu xử lý').disabled, false, 'old consent storage cannot block actual directory access');
  assert.deepEqual(folder.fs.requests, []);
});

test('bulk permission replaces individual buttons, skips granted or ineligible folders, and enables processing', async () => {
  const folders = ['Máy khoan', 'Máy mài', 'Đã cấp quyền', 'Trống'].map((name) => makeTree(name, name === 'Trống' ? {} : imagesSpec(1)));
  for (const folder of folders) {
    folder.fs.permission = folder.name === 'Đã cấp quyền' ? 'granted' : 'prompt';
    folder.fs.grantOnRequest = true;
  }
  await render();
  await chooseResultRoot();
  assert.equal(button('Cấp quyền toàn bộ'), undefined);
  await dropFolders(folders.map(droppedItem));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(button('Cấp quyền toàn bộ'));
  assert.equal([...document.querySelectorAll('.wma-product-actions button')].filter((item) => item.textContent.trim() === 'Cấp quyền').length, 0);
  assert.ok(folders.every((folder) => folder.fs.requests.length === 0), 'scanning never requests write access');
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  await click(button('Cấp quyền toàn bộ'));
  assert.equal(button('Cấp quyền toàn bộ'), undefined);
  assert.equal(button('Bắt đầu xử lý').disabled, false);
  assert.match(text(), /Đã cấp quyền ghi cho 2\/2 thư mục/);
  assert.deepEqual(folders.map((folder) => folder.fs.requests.length), [1, 1, 0, 0]);
});

test('bulk permission isolates refusals and errors, retries only missing grants, then falls back to one folder button', async () => {
  const folders = ['A', 'B', 'C'].map((name) => makeTree(name, imagesSpec(1)));
  for (const folder of folders) folder.fs.permission = 'prompt';
  folders[0].fs.grantOnRequest = true;
  const originalRequest = folders[2].requestPermission;
  folders[2].requestPermission = async () => { throw new DOMException('blocked', 'SecurityError'); };
  await render();
  await chooseResultRoot();
  await dropFolders(folders.map(droppedItem));
  await click(button('Cấp quyền toàn bộ'));
  assert.match(text(), /Đã cấp quyền ghi cho 1\/3 thư mục/);
  assert.match(text(), /Còn 2 thư mục chưa được cấp quyền ghi/);
  assert.ok(button('Cấp quyền toàn bộ'));
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  folders[1].fs.grantOnRequest = true;
  await click(button('Cấp quyền toàn bộ'));
  assert.equal(button('Cấp quyền toàn bộ'), undefined, 'only one folder remains');
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.deepEqual(folders[0].fs.requests, ['A'], 'granted folders are not requested again');
  folders[2].requestPermission = originalRequest;
  folders[2].fs.grantOnRequest = true;
  await click(button('Cấp quyền'));
  assert.equal(button('Bắt đầu xử lý').disabled, false);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('bulk permission shows progress and locks folder actions until native prompts finish', async () => {
  const folders = ['A', 'B'].map((name) => makeTree(name, imagesSpec(1)));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  for (const folder of folders) {
    folder.fs.permission = 'prompt';
    folder.requestPermission = async () => {
      await gate;
      folder.permission = 'granted';
      return 'granted';
    };
  }
  await render();
  await chooseResultRoot();
  await dropFolders(folders.map(droppedItem));
  await click(button('Cấp quyền toàn bộ'));
  try {
    assert.equal(button('Đang cấp quyền…').disabled, true);
    assert.equal(button('Thêm thư mục sản phẩm').disabled, true);
    assert.equal(button('Xóa danh sách').disabled, true);
    assert.equal(button('Bắt đầu xử lý').disabled, true);
    assert.equal(document.querySelector('.wma-folder-drop').getAttribute('aria-disabled'), 'true');
  } finally {
    await act(async () => release());
    await settle();
  }
  assert.equal(button('Thêm thư mục sản phẩm').disabled, false);
  assert.equal(button('Bắt đầu xử lý').disabled, false);
});

test('stop while AI is working, then resume with the captured configuration; config locked while running', async () => {
  const folder = makeTree('Máy khoan', imagesSpec(8));
  picks.push(folder);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  respond = async (body, init) => {
    if (fetchCalls.length === 2) {
      await new Promise((resolve, reject) => {
        gate.then(resolve);
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return new Response(JSON.stringify(describe(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await render();
  const resultRoot = await chooseResultRoot();
  await click(button('Thêm thư mục sản phẩm'));
  await waitFor(() => !button('Bắt đầu xử lý').disabled, 'ready');
  await select(document.querySelector('.wma-config select'), 'original');
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => fetchCalls.length === 2, 'second batch in flight');
  assert.ok(document.querySelector('.wma-config').hasAttribute('inert'), 'configuration locked');
  assert.equal(button('Thêm thư mục sản phẩm').disabled, true);
  assert.equal(document.querySelector('.wma-folder-drop').getAttribute('aria-disabled'), 'true');
  await dropFolders([droppedItem(makeTree('Không thêm khi đang chạy', imagesSpec(1)))]);
  assert.equal(document.querySelectorAll('.wma-product').length, 1);
  await click(button('Dừng'));
  await waitFor(() => /Đã dừng/.test(text()), 'stopped');
  release();
  assert.equal(resultRoot.file('Result').handle.file('Máy khoan').handle.children.size, 6);
  assert.match(text(), /Còn chờ2/);

  // Changing the size now does not change the paused run.
  await select(document.querySelector('.wma-config select'), '800x600');
  await click(button('Tiếp tục phần còn lại (2)'));
  await waitFor(() => /Hoàn tất/.test(document.querySelector('.wma-summary')?.textContent || ''), 'finished');
  assert.equal(resultRoot.file('Result').handle.file('Máy khoan').handle.children.size, 8);
  assert.ok(globalThis.__autoEngine.renders.every((call) => call.overrides.maxDimension === 0), 'original size kept on resume');
  assert.equal(globalThis.__autoEngine.resizes.length, 0);
  assert.equal(fetchCalls.length, 3);
});

test('parallel products show individual progress and stopping waits for all active requests', async (t) => {
  const folder = makeTree('SanPham', { 'Máy khoan': imagesSpec(1), 'Máy mài': imagesSpec(1), 'Máy cưa': imagesSpec(1) });
  picks.push(folder);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  respond = async (body) => {
    await gate;
    return new Response(JSON.stringify(describe(body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await render();
  assert.match(text(), /Tối đa 2 sản phẩm chạy song song/);
  await click(button('Chọn thư mục cha'));
  await waitFor(() => !button('Bắt đầu xử lý').disabled, 'start enabled');
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => fetchCalls.length === 2 && document.querySelectorAll('.wma-current').length === 2, 'two products running');
  const activeNames = [...document.querySelectorAll('.wma-current strong')].map((element) => element.textContent);
  assert.equal(new Set(activeNames).size, 2);
  assert.ok([...document.querySelectorAll('.wma-current')].every((element) => /Đang đặt tên AI/.test(element.textContent)));
  await click(button('Dừng'));
  release();
  await waitFor(() => button('Tiếp tục phần còn lại (3)'), 'all concurrent workers stopped');
  assert.equal(folder.fs.writes.length, 0);
  assert.equal(fetchCalls.length, 2, 'third product was queued');
  assert.equal(document.querySelectorAll('.wma-current').length, 0);
  await click(button('Tiếp tục phần còn lại (3)'));
  await waitFor(() => /Hoàn tất\./.test(document.querySelector('.wma-summary')?.textContent || ''), 'all products finished');
  assert.equal(folder.fs.writes.length, 3, 'one Result file per image');
});

test('no AI permission: start stays disabled and explains why', async () => {
  globalThis.__aiAccessRpc = () => ({ data: [], error: null });
  picks.push(makeTree('Máy khoan', imagesSpec(1)));
  await render();
  await click(button('Thêm thư mục sản phẩm'));
  await waitFor(() => /1 ảnh đã chọn/.test(text()), 'added');
  assert.match(text(), /chưa được cấp quyền Đặt tên AI/);
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.equal(fetchCalls.length, 0);
});

test('individual product needs a Result destination; permission is granted by click before AI runs', async () => {
  const source = makeTree('Máy khoan', imagesSpec(1));
  const output = makeTree('Output', {});
  output.fs.permission = 'prompt';
  picks.push(source);
  await render();
  await click(button('Thêm thư mục sản phẩm'));
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.match(document.querySelector('.wma-blockers').textContent, /Chọn nơi lưu Result/);
  await click(button('Chọn nơi lưu Result')); // cancelled picker
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  await chooseResultRoot(output);
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(output.fs.requests, []);
  output.fs.grantOnRequest = true;
  await click(button('Cấp quyền lưu Result'));
  assert.deepEqual(output.fs.requests, ['Output']);
  assert.equal(button('Bắt đầu xử lý').disabled, false);
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => /Hoàn tất\./.test(document.querySelector('.wma-summary')?.textContent || ''), 'Result saved');
  assert.equal(output.file('Result').handle.file('Máy khoan').handle.children.size, 1);
  assert.equal(source.fs.writes.length, 0);
  assert.equal(source.file('Named'), undefined);
  assert.match(document.querySelector('.wma-detail-path').textContent, /Output\/Result\/Máy khoan/);
});

test('a missing logo blocks the run', async () => {
  globalThis.__autoLogo = null;
  picks.push(makeTree('Máy khoan', imagesSpec(1)));
  await render();
  await click(button('Thêm thư mục sản phẩm'));
  await waitFor(() => /1 ảnh đã chọn/.test(text()), 'added');
  assert.match(document.querySelector('.wma-blockers').textContent, /Chọn logo/);
  assert.equal(button('Bắt đầu xử lý').disabled, true);
});

test('only admins and Pro+ plans pass the /watermark/auto gate', async () => {
  const { default: ProPlanRoute } = await import('../src/components/ProPlanRoute.jsx');
  const { hasProAccess } = await import('../src/utils/userProfile.js');
  const id = USER.user.id;
  const cases = [
    [{ role: 'user', plan: 'free', status: 'active' }, false],
    [{ role: 'user', plan: null, status: 'active' }, false],
    [{ role: 'user', plan: 'pro', status: 'active' }, true],
    [{ role: 'user', plan: 'enterprise', status: 'active' }, true],
    [{ role: 'admin', plan: 'free', status: 'active' }, true],
    [{ role: 'user', plan: 'pro', status: 'suspended' }, false],
    [{ role: 'admin', plan: 'pro', status: 'suspended' }, false],
  ];
  for (const [profile, allowed] of cases) {
    assert.equal(hasProAccess({ id, ...profile }), allowed, JSON.stringify(profile));
    root = createRoot(document.querySelector('#root'));
    await act(async () => {
      root.render(React.createElement(AuthContext.Provider, { value: { ...USER, profile: { id, ...profile }, isProfileLoading: false } },
        React.createElement(MemoryRouter, { initialEntries: ['/watermark/auto'] },
          React.createElement(Routes, null,
            React.createElement(Route, { path: '/watermark/auto', element: React.createElement(ProPlanRoute, { title: 'Cần gói Pro.', description: 'x', backTo: '/watermark', backLabel: 'Quay lại Watermark' }, React.createElement('h1', null, 'Trang tự động')) }),
            React.createElement(Route, { path: '/watermark', element: React.createElement('h1', null, 'Trang watermark') }),
          ))));
    });
    assert.equal(/Trang tự động/.test(text()), allowed, JSON.stringify(profile));
    if (!allowed) {
      assert.match(text(), /Cần gói Pro/);
      await click(button('Quay lại Watermark'));
      assert.match(text(), /Trang watermark/);
    }
    await act(async () => { root.unmount(); });
    root = null;
  }
});
