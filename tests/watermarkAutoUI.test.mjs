// The real /watermark/auto page in jsdom: folder picking, permission, start/stop/resume,
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

globalThis.FileReader = dom.window.FileReader;
globalThis.localStorage = dom.window.localStorage;
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
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

async function render() {
  root = createRoot(document.querySelector('#root'));
  await act(async () => {
    root.render(React.createElement(HelmetProvider, null,
      React.createElement(ThemeProvider, null,
        React.createElement(AuthContext.Provider, { value: USER },
          React.createElement(MemoryRouter, { initialEntries: ['/watermark/auto'] },
            React.createElement(Routes, null,
              React.createElement(Route, { path: '/watermark/auto', element: React.createElement(WatermarkAuto) }),
              React.createElement(Route, { path: '/watermark', element: React.createElement('h1', null, 'Trang watermark') }),
            ))))));
  });
  await settle(60);
}

/** AI fixture: one name per image, unless the test overrides `respond`. */
const describe = (body) => ({
  items: body.images.map((image) => ({ imageId: image.id, suggestedName: `${body.productName === 'Máy khoan' ? 'may-khoan' : 'may-mai'}-goc-${image.position}`, needsReview: image.position === 2 })),
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

test('unsupported browser: explains the limit, no ZIP pretending to create Named', async () => {
  delete dom.window.showDirectoryPicker;
  await render();
  assert.match(text(), /Watermark tự động/);
  assert.match(text(), /Chrome hoặc Edge/);
  assert.match(text(), /không tạo file ZIP thay thế/);
  assert.equal(button('Thêm thư mục sản phẩm').disabled, true);
  assert.equal(button('Bắt đầu xử lý').disabled, true);
  assert.equal(document.querySelector('a[href="/watermark"]').textContent, '← Quay lại Watermark');
});

test('parent folder → AI names per folder → files in each Named, with summary and report', async () => {
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
  assert.equal(fetchCalls[0].body.productName, 'Máy khoan');
  assert.equal(fetchCalls[1].body.productName, 'Máy mài');
  assert.deepEqual(fetchCalls[0].body.images.map((image) => image.position), [1, 2]);
  assert.equal(fetchCalls[0].body.model, 'gpt-6-luna');

  const named = (folder) => [...sanPham.file(folder).handle.file('Named').handle.children.keys()].sort();
  assert.deepEqual(named('Máy khoan'), ['may-khoan-goc-1.jpg', 'may-khoan-goc-2.jpg']);
  assert.deepEqual(named('Máy mài'), ['may-mai-goc-1.jpg']);
  assert.ok(globalThis.__autoEngine.renders.every((call) => call.overrides.maxDimension === 4096));
  assert.deepEqual(globalThis.__autoEngine.resizes, [[800, 600], [800, 600], [800, 600]]);
  assert.equal(document.querySelector('.wma-summary p').textContent,
    'Hoàn tất. Đã lưu 3/3 ảnh trong Named của 2 sản phẩm; 0 ảnh lỗi; 1 ảnh cần kiểm tra.');

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
  assert.match(report, /IMG_002\.png,SanPham\/Máy khoan\/Named\/may-khoan-goc-2\.jpg,Đã lưu,Có/);

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

test('missing permission blocks start until the folder is granted from its button', async () => {
  const folder = makeTree('Máy khoan', imagesSpec(1));
  folder.fs.permission = 'prompt';
  picks.push(folder);
  await render();
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
  await click(button('Thêm thư mục sản phẩm'));
  await waitFor(() => !button('Bắt đầu xử lý').disabled, 'ready');
  await select(document.querySelector('.wma-config select'), 'original');
  await click(button('Bắt đầu xử lý'));
  await waitFor(() => fetchCalls.length === 2, 'second batch in flight');
  assert.ok(document.querySelector('.wma-config').hasAttribute('inert'), 'configuration locked');
  assert.equal(button('Thêm thư mục sản phẩm').disabled, true);
  await click(button('Dừng'));
  await waitFor(() => /Đã dừng/.test(text()), 'stopped');
  release();
  assert.equal([...folder.file('Named').handle.children.keys()].length, 6);
  assert.match(text(), /Còn chờ2/);

  // Changing the size now does not change the paused run.
  await select(document.querySelector('.wma-config select'), '800x600');
  await click(button('Tiếp tục phần còn lại (2)'));
  await waitFor(() => /Hoàn tất/.test(document.querySelector('.wma-summary')?.textContent || ''), 'finished');
  assert.equal([...folder.file('Named').handle.children.keys()].length, 8);
  assert.ok(globalThis.__autoEngine.renders.every((call) => call.overrides.maxDimension === 0), 'original size kept on resume');
  assert.equal(globalThis.__autoEngine.resizes.length, 0);
  assert.equal(fetchCalls.length, 3);
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
