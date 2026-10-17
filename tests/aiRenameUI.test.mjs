import { dom } from './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.FileReader = dom.window.FileReader;
globalThis.localStorage = dom.window.localStorage;
const { default: WatermarkGallery } = await import('../src/components/watermark/WatermarkGallery.jsx');
const { DEFAULT_IMAGE_NAME_PROMPT } = await import('../src/utils/aiImageNaming.js');
const { AuthContext } = await import('../src/context/authContext.js');
const { useAiNamingAccess } = await import('../src/hooks/useAiNamingAccess.js');

const PRODUCT = 'Máy khoan Bosch GSB 13 RE';
const PRO_USER = { user: { id: 'user-1' }, profile: { id: 'user-1', role: 'user', plan: 'pro', status: 'active' }, isInitializing: false };
let root;
let fetchQueue;
let fetchCalls;
let renameCalls;
let manualRenames;
let loginRequests;
let setResultsFromTest;
let setAuthFromTest;

const makeResults = (count, prefix = 'res', start = 1) => Array.from({ length: count }, (_, index) => ({
  id: `${prefix}-${start + index}`,
  fileName: `may-khoan_0${start + index}.jpg`,
  url: `blob:result-${prefix}-${start + index}`,
  thumb: `blob:thumb-${prefix}-${start + index}`,
  blob: new dom.window.Blob(['watermarked'], { type: 'image/jpeg' }),
  sourceFile: { name: `source-${start + index}` },
}));

// Real useAiNamingAccess hook, as on the page; only Supabase is mocked.
function Gallery({ initial }) {
  const [results, setResults] = useState(initial);
  const aiAccess = useAiNamingAccess();
  setResultsFromTest = setResults;
  return React.createElement('div', { className: 'wm-page' }, React.createElement(WatermarkGallery, {
    results,
    productName: PRODUCT,
    aiAccess,
    onRequestAiLogin() { loginRequests.push('/watermark'); },
    onClear() {},
    onDownloadAll() {},
    onRemoveResult() {},
    onRenameFile(index, fileName) {
      manualRenames.push([index, fileName]);
      setResults((current) => current.map((result, i) => (i === index ? { ...result, fileName } : result)));
    },
    // Same contract as Watermark.jsx: only IDs that still exist are renamed.
    onRenameById(namesById) {
      renameCalls.push(namesById);
      setResults((current) => current.map((result) => (namesById[result.id] ? { ...result, fileName: namesById[result.id] } : result)));
    },
  }));
}

function Harness({ initial, auth }) {
  const [authValue, setAuthValue] = useState(auth);
  setAuthFromTest = setAuthValue;
  return React.createElement(AuthContext.Provider, { value: authValue }, React.createElement(Gallery, { initial }));
}

async function render(results, auth = PRO_USER) {
  root ??= createRoot(document.querySelector('#root'));
  await act(async () => { root.render(React.createElement(Harness, { initial: results, auth })); });
  await settle();
}
async function settle(ms = 20) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); }
const dialog = () => document.querySelector('[role="dialog"]');
const button = (text, scope = document) => [...scope.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(text));
const nameInput = (id) => document.getElementById(`wm-ai-name-${id}`);
async function click(element) { assert.ok(element, 'control exists'); await act(async () => { element.click(); }); await settle(); }
async function type(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function openAiDialog() {
  const trigger = document.querySelector('.wm-ai-rename-button');
  assert.match(trigger.textContent, /Đặt tên bằng AI/);
  await click(trigger);
  assert.ok(dialog(), 'AI dialog open');
}
async function generate() { await click(button('Tạo', dialog()) || button('Thử lại', dialog())); await settle(30); }
const respond = (status, body, headers) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const ok = (items, failed = []) => respond(200, { items, failed, model: 'gpt-6-luna' });

test.beforeEach(async () => {
  fetchQueue = [];
  fetchCalls = [];
  renameCalls = [];
  manualRenames = [];
  loginRequests = [];
  globalThis.__aiThumbnailCalls = [];
  globalThis.__aiRenameSession = undefined;
  globalThis.__aiAccessRpc = undefined;
  globalThis.__aiRpcCalls = [];
  localStorage.clear();
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, headers: init.headers, body: JSON.parse(init.body), signal: init.signal });
    const next = fetchQueue.shift();
    if (!next) throw new TypeError('Failed to fetch');
    return next(init);
  };
  if (root) await act(async () => { root.unmount(); });
  root = null;
});

test('suggests names by ID, retries only failed images, applies edits, downloads with new names', async () => {
  await render(makeResults(3));
  await openAiDialog();

  const productInput = document.getElementById('wm-ai-product-name');
  assert.equal(productInput.value, PRODUCT);
  assert.equal(document.activeElement, productInput, 'focus starts in the dialog');
  assert.match(dialog().textContent, /3 ảnh sẽ được xử lý/);
  assert.match(document.getElementById('wm-ai-rename-privacy').textContent, /OpenAI/);
  assert.equal(button('Áp dụng tên', dialog()).disabled, true);

  // Shuffled answer with one image missing.
  fetchQueue.push(ok([
    { imageId: 'res-3', suggestedName: 'may-khoan-bosch-gsb-13-re-phu-kien', needsReview: false },
    { imageId: 'res-1', suggestedName: 'may-khoan-bosch-gsb-13-re-toan-canh', needsReview: false },
  ], [{ imageId: 'res-2', code: 'missing' }]));
  await generate();

  assert.equal(fetchCalls.length, 1);
  const [call] = fetchCalls;
  assert.equal(call.url, 'https://project.supabase.co/functions/v1/suggest-image-names');
  assert.equal(call.headers.Authorization, 'Bearer user-jwt');
  assert.ok(!JSON.stringify(call).includes('sk-'), 'no OpenAI key in the browser request');
  assert.equal(call.body.productName, PRODUCT);
  assert.equal(call.body.prompt, DEFAULT_IMAGE_NAME_PROMPT);
  assert.deepEqual(call.body.images.map(({ id, position }) => [id, position]), [['res-1', 1], ['res-2', 2], ['res-3', 3]]);
  assert.ok(call.body.images.every((image) => image.dataUrl.startsWith('data:image/jpeg;base64,')));
  // The original (no logo) was downscaled to 512px; the exported blob was not touched.
  assert.deepEqual(globalThis.__aiThumbnailCalls.map((entry) => [entry.source.name, entry.maxDimension]), [['source-1', 512], ['source-2', 512], ['source-3', 512]]);

  assert.equal(nameInput('res-1').value, 'may-khoan-bosch-gsb-13-re-toan-canh');
  assert.equal(nameInput('res-3').value, 'may-khoan-bosch-gsb-13-re-phu-kien');
  assert.equal(nameInput('res-2').value, '');
  assert.match(dialog().textContent, /AI chưa đặt được tên cho ảnh này/);
  assert.equal(renameCalls.length, 0, 'nothing renamed before "Áp dụng tên"');

  fetchQueue.push(ok([{ imageId: 'res-2', suggestedName: 'may-khoan-bosch-gsb-13-re-dau-kep', needsReview: true }]));
  await generate();
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(fetchCalls[1].body.images.map((image) => image.id), ['res-2'], 'retry sends only the failed image');
  assert.equal(nameInput('res-2').value, 'may-khoan-bosch-gsb-13-re-dau-kep');
  assert.match(dialog().textContent, /Cần kiểm tra/);

  // Editing re-normalizes locally and never calls the API.
  await type(nameInput('res-2'), 'Đầu kẹp  MỚI!!');
  assert.match(dialog().textContent, /→ dau-kep-moi\.jpg/);
  await type(nameInput('res-3'), 'may-khoan-bosch-gsb-13-re-toan-canh');
  assert.match(dialog().textContent, /→ may-khoan-bosch-gsb-13-re-toan-canh-2\.jpg/, 'duplicate gets a suffix');
  assert.equal(fetchCalls.length, 2);

  await click(button('Áp dụng tên (3)', dialog()));
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(renameCalls, [{
    'res-1': 'may-khoan-bosch-gsb-13-re-toan-canh.jpg',
    'res-2': 'dau-kep-moi.jpg',
    'res-3': 'may-khoan-bosch-gsb-13-re-toan-canh-2.jpg',
  }]);
  assert.equal(dialog(), null);

  // Single download uses the new (unique) name.
  const downloads = [];
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function captureDownload() { downloads.push(this.download); };
  try {
    const cards = [...document.querySelectorAll('.wm-result-card')];
    await click(cards[1].querySelector('.wm-result-dl-btn'));
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
  assert.deepEqual(downloads, ['dau-kep-moi.jpg']);
});

test('cancel does not rename; suggestions survive reopening without a new API call', async () => {
  await render(makeResults(2));
  await openAiDialog();
  fetchQueue.push(ok([
    { imageId: 'res-1', suggestedName: 'may-khoan-toan-canh', needsReview: false },
    { imageId: 'res-2', suggestedName: 'may-khoan-mat-sau', needsReview: false },
  ]));
  await generate();
  await click(button('Hủy', dialog()));

  assert.equal(dialog(), null);
  assert.equal(renameCalls.length, 0);
  assert.deepEqual([...document.querySelectorAll('.wm-result-name')].map((node) => node.textContent), ['may-khoan_01.jpg', 'may-khoan_02.jpg']);

  await openAiDialog();
  assert.equal(nameInput('res-1').value, 'may-khoan-toan-canh');
  assert.equal(fetchCalls.length, 1);
  assert.equal(button('Tạo lại tất cả', dialog()).textContent.trim(), 'Tạo lại tất cả');
});

test('a response arriving after the dialog closed is ignored', async () => {
  await render(makeResults(2));
  await openAiDialog();
  let resolveLate;
  fetchQueue.push(() => new Promise((resolve) => { resolveLate = resolve; }));
  await generate();
  assert.match(button('Đang phân tích', dialog()).textContent, /0\/2/);
  assert.equal(button('Áp dụng tên', dialog()).disabled, true, 'apply is locked while running');

  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(dialog(), null, 'Escape closes the dialog');
  assert.equal(fetchCalls[0].signal.aborted, true, 'in-flight request is aborted');

  await act(async () => { resolveLate(ok([{ imageId: 'res-1', suggestedName: 'late-name', needsReview: false }])()); });
  await settle(30);
  assert.equal(renameCalls.length, 0);
  await openAiDialog();
  assert.equal(nameInput('res-1').value, '');
});

test('a response for a replaced result set never renames the new images', async () => {
  await render(makeResults(2));
  await openAiDialog();
  let resolveLate;
  fetchQueue.push(() => new Promise((resolve) => { resolveLate = resolve; }));
  await generate();

  await act(async () => { setResultsFromTest(makeResults(2, 'new', 10)); });
  await act(async () => { resolveLate(ok([
    { imageId: 'res-1', suggestedName: 'old-a', needsReview: false },
    { imageId: 'res-2', suggestedName: 'old-b', needsReview: false },
  ])()); });
  await settle(30);

  assert.equal(nameInput('new-10').value, '');
  assert.equal(nameInput('new-11').value, '');
  assert.equal(button('Áp dụng tên', dialog()).disabled, true);
});

test('missing API key: clear message, manual names still work', async () => {
  await render(makeResults(2));
  await openAiDialog();
  fetchQueue.push(respond(503, { error: { code: 'not_configured', message: 'server text' } }));
  await generate();

  const alert = [...dialog().querySelectorAll('[role="alert"]')].map((node) => node.textContent).join(' ');
  assert.match(alert, /chưa được cấu hình/);
  assert.equal(fetchCalls.length, 1, 'fatal error stops further requests');
  assert.equal(button('Áp dụng tên', dialog()).disabled, true);

  await type(nameInput('res-1'), 'Tên tự nhập');
  await click(button('Áp dụng tên (1)', dialog()));
  assert.deepEqual(renameCalls, [{ 'res-1': 'ten-tu-nhap.jpg' }]);
});

test('rate limit, timeout, network and session errors have specific messages', async () => {
  const scenarios = [
    [respond(429, { error: { code: 'rate_limited', message: 'x', retryAfterSeconds: 120 } }), /quá nhiều yêu cầu.*khoảng 2 phút/],
    [respond(429, { error: { code: 'upstream_rate_limited', message: 'x' } }), /OpenAI đang giới hạn tần suất/],
    [respond(504, { error: { code: 'upstream_timeout', message: 'x' } }), /AI phản hồi quá lâu/],
    [null, /Không kết nối được dịch vụ AI/],
    [respond(404, {}), /Không tìm thấy dịch vụ AI/],
  ];
  for (const [response, message] of scenarios) {
    await render(makeResults(1));
    await openAiDialog();
    if (response) fetchQueue.push(response);
    await generate();
    assert.match(dialog().textContent, message);
    await click(button('Hủy', dialog()));
    await act(async () => { root.unmount(); });
    root = null;
  }

  globalThis.__aiRenameSession = null;
  await render(makeResults(1));
  await openAiDialog();
  await generate();
  assert.match(dialog().textContent, /Phiên đăng nhập đã hết hạn/);
  assert.equal(fetchCalls.length, scenarios.length, 'no request without a session');
});

test('large sets are split into ≤6-image requests with at most 2 in flight', async () => {
  await render(makeResults(13));
  await openAiDialog();
  let inFlight = 0;
  let peak = 0;
  const answer = (init) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    const ids = JSON.parse(init.body).images.map((image) => image.id);
    return new Promise((resolve) => setTimeout(() => {
      inFlight -= 1;
      resolve(ok(ids.map((imageId) => ({ imageId, suggestedName: `kim-${imageId}`, needsReview: false })))());
    }, 10));
  };
  fetchQueue.push(answer, answer, answer);
  await generate();
  await settle(60);

  assert.deepEqual(fetchCalls.map((call) => call.body.images.length), [6, 6, 1]);
  assert.ok(peak <= 2);
  assert.equal(button('Áp dụng tên (13)', dialog()).disabled, false);
});

test('product name is required; prompt is editable and restorable', async () => {
  await render(makeResults(1));
  await openAiDialog();
  await type(document.getElementById('wm-ai-product-name'), '   ');
  await generate();
  assert.equal(fetchCalls.length, 0);
  assert.match(dialog().querySelector('[role="alert"]').textContent, /Vui lòng nhập tên sản phẩm/);
  assert.equal(document.getElementById('wm-ai-product-name').getAttribute('aria-invalid'), 'true');

  await type(document.getElementById('wm-ai-product-name'), 'Kìm điện');
  const prompt = document.getElementById('wm-ai-prompt');
  await type(prompt, 'Prompt riêng cho {{productName}}');
  assert.equal(button('Khôi phục mặc định', dialog()).disabled, false);
  fetchQueue.push(ok([{ imageId: 'res-1', suggestedName: 'kim-dien-toan-canh', needsReview: false }]));
  await generate();
  assert.equal(fetchCalls[0].body.prompt, 'Prompt riêng cho {{productName}}');
  assert.equal(fetchCalls[0].body.productName, 'Kìm điện');

  await click(button('Khôi phục mặc định', dialog()));
  assert.equal(prompt.value, DEFAULT_IMAGE_NAME_PROMPT);
  // Every editable name has an accessible label.
  assert.ok(document.querySelector('label[for="wm-ai-name-res-1"]'));
});

test('unreadable original falls back to the exported image', async () => {
  const [result] = makeResults(1);
  result.sourceFile = { name: 'broken' };
  await render([result]);
  await openAiDialog();
  fetchQueue.push(ok([{ imageId: 'res-1', suggestedName: 'kim-toan-canh', needsReview: false }]));
  await generate();
  assert.deepEqual(globalThis.__aiThumbnailCalls.map((entry) => entry.source.name ?? 'exported-blob'), ['broken', 'exported-blob']);
  assert.equal(fetchCalls.length, 1);
});

// ── Access control in the UI (the backend decision is tested separately)

const aiButton = () => document.querySelector('.wm-ai-rename-button');
const DENIED = 'Đặt tên AI dành cho tài khoản Pro trở lên.';

test('while access is loading the AI button is disabled and nothing can be sent', async () => {
  let resolveAccess;
  globalThis.__aiAccessRpc = () => new Promise((resolve) => { resolveAccess = resolve; });
  await render(makeResults(1));
  assert.equal(aiButton().disabled, true);
  assert.equal(aiButton().getAttribute('aria-busy'), 'true');
  await act(async () => { aiButton().click(); });
  assert.equal(dialog(), null);

  await act(async () => { resolveAccess({ data: true, error: null }); });
  await settle();
  assert.equal(aiButton().disabled, false);
  assert.deepEqual(globalThis.__aiRpcCalls.map((call) => call.name), ['can_use_ai_naming']);
});

test('below Pro: explanation instead of the AI dialog, no request, manual rename still works', async () => {
  globalThis.__aiAccessRpc = () => ({ data: false, error: null });
  await render(makeResults(2), { ...PRO_USER, profile: { ...PRO_USER.profile, plan: 'free' } });
  assert.match(aiButton().textContent, /Pro/, 'button stays visible with a Pro hint');
  await click(aiButton());

  assert.equal(document.getElementById('wm-ai-access-message').textContent, DENIED);
  assert.equal(document.getElementById('wm-ai-product-name'), null, 'AI dialog not opened');
  assert.equal(dialog().querySelector('a'), null, 'no upgrade/payment link (project has no upgrade page)');
  await click(button('Đã hiểu', dialog()));
  assert.equal(dialog(), null);
  assert.equal(fetchCalls.length, 0);

  // Existing features are untouched.
  await type(document.querySelectorAll('.wm-result-name-input')[0], 'ten-tu-dat');
  assert.deepEqual(manualRenames.at(-1), [0, 'ten-tu-dat']);
  const bulkRename = document.querySelector('.wm-bulk-rename-button:not(.wm-ai-rename-button):not(.wm-haravan-link-button)');
  assert.match(bulkRename.textContent, /Thêm tên ảnh hàng loạt/);
  assert.equal(bulkRename.disabled, false);
});

test('signed out: login prompt using the existing login flow', async () => {
  await render(makeResults(1), { user: null, profile: null, isInitializing: false });
  assert.equal(globalThis.__aiRpcCalls.length, 0, 'no entitlement call without a session');
  await click(aiButton());
  assert.match(dialog().textContent, /Đăng nhập để dùng Đặt tên AI/);
  assert.match(dialog().textContent, /sẽ mất khi chuyển sang trang đăng nhập/);
  await click(button('Đăng nhập', dialog()));
  assert.deepEqual(loginRequests, ['/watermark']);
  assert.equal(fetchCalls.length, 0);
});

test('entitlement lookup error: retry, and the AI dialog opens once allowed', async () => {
  globalThis.__aiAccessRpc = () => ({ data: null, error: { message: 'boom' } });
  await render(makeResults(1));
  await click(aiButton());
  assert.match(dialog().textContent, /Không kiểm tra được quyền sử dụng/);
  globalThis.__aiAccessRpc = () => ({ data: true, error: null });
  await click(button('Thử lại', dialog()));
  await settle();
  assert.ok(document.getElementById('wm-ai-product-name'), 'AI dialog replaced the explanation');
});

test('spoofed role/plan in the profile or localStorage do not unlock the feature', async () => {
  localStorage.setItem('plan', 'enterprise');
  localStorage.setItem('role', 'admin');
  localStorage.setItem('canUseAiNaming', 'true');
  globalThis.__aiAccessRpc = () => ({ data: false, error: null }); // what the server decides
  await render(makeResults(1), { ...PRO_USER, profile: { ...PRO_USER.profile, role: 'admin', plan: 'enterprise' } });
  await click(aiButton());
  assert.equal(document.getElementById('wm-ai-access-message').textContent, DENIED);
  assert.equal(fetchCalls.length, 0);
});

test('backend 403 while the dialog is open: generation locks, names are kept and can be applied', async () => {
  await render(makeResults(2));
  await openAiDialog();
  fetchQueue.push(ok([{ imageId: 'res-1', suggestedName: 'may-khoan-toan-canh', needsReview: false }], [{ imageId: 'res-2', code: 'missing' }]));
  await generate();
  await type(nameInput('res-2'), 'ten-dang-sua');
  await type(nameInput('res-2'), '');
  // Plan removed by an admin before the retry.
  globalThis.__aiAccessRpc = () => ({ data: false, error: null });
  fetchQueue.push(respond(403, { error: { code: 'AI_NAMING_ACCESS_DENIED', message: DENIED } }));
  await generate();

  assert.equal(document.getElementById('wm-ai-access-notice').querySelector('strong').textContent, DENIED);
  assert.equal(button('Thử lại', dialog())?.disabled ?? button('Tạo', dialog()).disabled, true);
  assert.equal(nameInput('res-1').value, 'may-khoan-toan-canh', 'earlier suggestion kept');
  await type(nameInput('res-2'), 'tu-dat-ten');
  await click(button('Áp dụng tên (2)', dialog()));
  assert.deepEqual(renameCalls, [{ 'res-1': 'may-khoan-toan-canh.jpg', 'res-2': 'tu-dat-ten.jpg' }]);
  assert.equal(fetchCalls.length, 2);
});

test('backend 401 while the dialog is open: login prompt in place, edits kept', async () => {
  await render(makeResults(1));
  await openAiDialog();
  await type(nameInput('res-1'), 'ten-giu-lai');
  await type(nameInput('res-1'), '');
  fetchQueue.push(respond(401, { code: 401, message: 'Invalid JWT' })); // gateway shape, no error.code
  await generate();
  const notice = document.getElementById('wm-ai-access-notice');
  assert.match(notice.textContent, /Đăng nhập để dùng Đặt tên AI/);
  await click(button('Đăng nhập', notice));
  assert.deepEqual(loginRequests, ['/watermark']);
  assert.ok(dialog(), 'dialog stays open');
});

test('a profile change (e.g. admin grants Pro) triggers a new server check', async () => {
  globalThis.__aiAccessRpc = () => ({ data: false, error: null });
  await render(makeResults(1), { ...PRO_USER, profile: { ...PRO_USER.profile, plan: 'free' } });
  globalThis.__aiAccessRpc = () => ({ data: true, error: null });
  await act(async () => { setAuthFromTest(PRO_USER); });
  await settle();
  assert.equal(globalThis.__aiRpcCalls.length, 2);
  await openAiDialog();
  assert.ok(document.getElementById('wm-ai-product-name'));
});
