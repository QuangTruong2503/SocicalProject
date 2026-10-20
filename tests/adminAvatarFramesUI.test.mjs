import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { pngBytes, svgBytes, webpBytes } from './fixtures/frameImages.mjs';
import { createAvatarFrameInspectHandler } from '../supabase/functions/avatar-frame-inspect/handler.js';

// Run with: node --import ./tests/avatarFramesLoader.mjs --test tests/adminAvatarFramesUI.test.mjs
// The admin page, its services and the real avatar-frame-inspect handler run
// together; Supabase Storage/RPC are an in-memory transport fixture.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/admin/avatar-frames', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let objectUrls = 0;
URL.createObjectURL = () => `blob:preview-${++objectUrls}`;
URL.revokeObjectURL = () => {};
console.error = () => {};

const { createRoot } = await import('react-dom/client');
const { HelmetProvider } = await import('react-helmet-async');
const { MemoryRouter } = await import('react-router-dom');
const { default: Page } = await import('../src/pages/Admin/AdminAvatarFramesPage.jsx');
HelmetProvider.canUseDOM = true;

const h = React.createElement;
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OLD_PATH = 'frames/11111111-1111-4111-8111-111111111111.png';
const OLD_FALLBACK = 'frames/22222222-2222-4222-8222-222222222222.png';
const APNG = () => pngBytes({ delays: Array(30).fill(80) });
const FRAMES = [
  { id: 'laurel', name: 'Vòng nguyệt quế', image_source: 'builtin', image_path: 'laurel.svg', image_format: 'svg', frame_type: 'static', frame_count: 1, sort_order: 1, is_active: true, usage_count: 3, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' },
  { id: 'frame-0123456789abcdef', name: 'Khung động', image_source: 'storage', image_path: OLD_PATH, fallback_path: OLD_FALLBACK, image_format: 'apng', frame_type: 'animated', frame_count: 30, duration_ms: 2400, width: 256, height: 256, file_size: 4000, sort_order: 2, is_active: false, usage_count: 0, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' },
];

let root;
let calls;
let rpcHandler;
let serverRejects;
const stored = new Map();

function install() {
  calls = { rpc: [], storage: [], recorded: [] };
  stored.clear();
  serverRejects = null;
  rpcHandler = (name, args) => {
    if (name === 'admin_list_avatar_frames') return { data: FRAMES, error: null };
    if (name === 'admin_save_avatar_frame') {
      const current = FRAMES.find((frame) => frame.id === args.p_id);
      return { data: { frame: { ...(current ?? FRAMES[1]), name: args.p_document.name }, removed_paths: [] }, error: null };
    }
    if (name === 'admin_delete_avatar_frame') return { data: { id: args.p_id, affected_users: 3, removed_paths: [] }, error: null };
    if (name === 'admin_reorder_avatar_frames') return { data: 2, error: null };
    return { data: null, error: { code: 'PGRST202' } };
  };
  globalThis.__framesSession = { user: { id: ADMIN_ID }, access_token: 'admin-token' };
  globalThis.__framesRpc = (name, args) => { calls.rpc.push([name, args]); return rpcHandler(name, args); };
  globalThis.__framesStorage = async (request) => {
    calls.storage.push(request);
    if (request.operation === 'upload') stored.set(request.path, new Uint8Array(await request.file.arrayBuffer()));
    if (request.operation === 'remove') request.paths.forEach((path) => stored.delete(path));
    return { data: {}, error: null };
  };
  globalThis.__framesTable = () => ({ data: [], error: null });

  // The real Edge Function handler, reading what the page uploaded.
  const handler = createAvatarFrameInspectHandler({
    getEnv: (name) => ({ SUPABASE_URL: 'https://project.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' })[name],
    logger: { warn() {}, error() {} },
    fetchImpl: async (url, init = {}) => {
      if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: ADMIN_ID }));
      if (url.endsWith('/rpc/avatar_frames_require_admin')) return new Response('null');
      if (url.includes('/object/authenticated/avatar-frames/')) {
        const bytes = stored.get(url.split('/avatar-frames/')[1]);
        return bytes ? new Response(serverRejects ?? bytes) : new Response('{}', { status: 404 });
      }
      if (init.method === 'DELETE') {
        JSON.parse(init.body).prefixes.forEach((path) => { stored.delete(path); calls.storage.push({ operation: 'server-remove', paths: [path] }); });
        return new Response('[]');
      }
      if (url.endsWith('/rpc/avatar_frame_record_upload')) { calls.recorded.push(JSON.parse(init.body)); return new Response('{}'); }
      return new Response('{}', { status: 500 });
    },
  });
  globalThis.fetch = (url, init) => handler(new Request(url, init));
}

const settle = () => act(async () => {
  for (let i = 0; i < 12; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

async function render() {
  root = createRoot(document.querySelector('#root'));
  await act(async () => root.render(h(HelmetProvider, null, h(MemoryRouter, null, h(Page)))));
  await settle();
}

const button = (text, scope = document) => [...scope.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
const byLabel = (label) => document.querySelector(`button[aria-label="${label}"]`);
const dialog = () => document.querySelector('[role="dialog"]');
const saveButton = () => dialog().querySelector('button[type="submit"]');
async function click(node) {
  assert.ok(node, 'element exists');
  await act(async () => node.click());
  await settle();
}
async function choose(role, bytes, name) {
  const input = dialog().querySelector(`input[data-role="${role}"]`);
  Object.defineProperty(input, 'files', { value: [new File([bytes], name, { type: 'image/png' })], configurable: true });
  await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
  await settle();
}
async function typeName(value) {
  const input = dialog().querySelector('input[type="text"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
const uploads = () => calls.storage.filter((request) => request.operation === 'upload');
const removed = () => calls.storage.filter((request) => request.operation === 'remove').flatMap((request) => request.paths);
const lastSave = () => calls.rpc.filter(([name]) => name === 'admin_save_avatar_frame').at(-1)?.[1];

test.beforeEach(install);
test.afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
test.after(() => dom.window.close());

test('list shows type, format, frames and cycle; animated rows preview their still; reorder sends the full order', async () => {
  await render();
  const rows = [...document.querySelectorAll('li.row')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Vòng nguyệt quế.*Đang bật.*Khung mẫu · SVG.*3 tài khoản/);
  assert.match(rows[1].textContent, /Khung động.*Đã tắt.*Động.*Ảnh tải lên · APNG · 30 frame · 2,4 giây/);
  assert.match(rows[1].querySelector('[data-avatar-frame]').getAttribute('src'), /22222222-2222-4222-8222-222222222222\.png$/, 'still fallback, not the animation');
  assert.match(document.querySelector('.statGrid').textContent, /Khung động1/);

  await click(byLabel('Đưa Vòng nguyệt quế xuống'));
  assert.deepEqual(calls.rpc.find(([name]) => name === 'admin_reorder_avatar_frames')[1], { p_ids: ['frame-0123456789abcdef', 'laurel'] });
});

test('a static PNG is checked in the browser, verified by the server, then saved without a fallback', async () => {
  await render();
  await click(button('Thêm khung'));
  assert.match(dialog().textContent, /APNG, WebP động.*128 × 128 đến 512 × 512px, tối đa 2 MB.*tối đa 120 frame.*1 đến 10 giây/);
  await typeName('Khung Tết');
  assert.equal(saveButton().disabled, true, 'a new frame needs an image');

  await choose('frame-image', svgBytes(), 'fake.png');
  assert.match(dialog().querySelector('[role="alert"]').textContent, /không phải PNG, APNG hoặc WebP/);
  await choose('frame-image', pngBytes({ width: 1024, height: 1024 }), 'big.png');
  assert.match(dialog().querySelector('[role="alert"]').textContent, /128 đến 512/);
  assert.equal(uploads().length, 0, 'invalid files never reach Storage');

  await choose('frame-image', pngBytes({ width: 256, height: 256 }), 'tet.png');
  assert.match(dialog().textContent, /Đã xác thực trên máy chủ.*Loại.*Tĩnh.*Định dạng.*PNG.*256 × 256px/);
  assert.equal(calls.recorded.length, 1, 'the server recorded the inspected file');
  assert.equal(dialog().textContent.includes('Ảnh tĩnh dự phòng'), false);
  const [upload] = uploads();
  assert.match(upload.path, /^frames\/[0-9a-f-]{36}\.png$/);
  await click(saveButton());
  assert.deepEqual(lastSave(), { p_id: null, p_document: { name: 'Khung Tết', is_active: true, image_path: upload.path } });
  assert.equal(dialog(), null);
  assert.deepEqual(removed(), [], 'the saved file is kept');
});

test('an animation without a fallback can only be saved switched off; adding a static fallback allows enabling it', async () => {
  await render();
  await click(button('Thêm khung'));
  await typeName('Sao bay');
  await choose('frame-image', webpBytes({ width: 256, height: 256, delays: Array(24).fill(100) }), 'sao.webp');
  assert.match(dialog().textContent, /Loại.*Động.*WebP động.*Số frame.*24.*Chu kỳ.*2,4 giây/);
  // jsdom cannot decode images, so the still cannot be generated automatically here.
  assert.match(dialog().textContent, /Không tự tạo được ảnh dự phòng/);
  const checkbox = dialog().querySelector('input[type="checkbox"]');
  assert.deepEqual([checkbox.checked, checkbox.disabled], [false, true]);

  await choose('frame-fallback', APNG(), 'dong.png');
  assert.match(dialog().textContent, /Ảnh dự phòng phải là ảnh PNG hoặc WebP tĩnh/);
  await choose('frame-fallback', pngBytes(), 'tinh.png');
  assert.match(dialog().textContent, /tinh\.png đã được máy chủ kiểm tra/);
  assert.equal(dialog().querySelector('input[type="checkbox"]').checked, true);

  // Preview: playing shows the animation, pause shows the still, and the still can be viewed directly.
  const states = () => [...dialog().querySelectorAll('[data-avatar-frame]')].map((node) => node.dataset.frameState);
  assert.ok(states().every((state) => state === 'animated'));
  await click(button('Tạm dừng', dialog()));
  assert.ok(states().every((state) => state === 'still'));
  await click(button('Phát', dialog()));
  await click(button('Xem ảnh dự phòng', dialog()));
  assert.ok(states().every((state) => state === 'static'));

  const [image, fallback] = uploads().map((request) => request.path);
  await click(saveButton());
  assert.deepEqual(lastSave().p_document, { name: 'Sao bay', is_active: true, image_path: image, fallback_path: fallback });
});

test('files the server refuses are removed; unused uploads are dropped when replaced or when the dialog closes', async () => {
  await render();
  await click(button('Thêm khung'));
  serverRejects = svgBytes();
  await choose('frame-image', pngBytes(), 'a.png');
  assert.match(dialog().querySelector('[role="alert"]').textContent, /không phải PNG, APNG hoặc WebP/);
  assert.equal(stored.size, 0, 'the server deleted the refused file');
  assert.equal(calls.recorded.length, 0);

  serverRejects = null;
  const baseline = removed().length;
  await choose('frame-image', pngBytes(), 'b.png');
  const first = uploads().at(-1).path;
  await choose('frame-image', pngBytes({ width: 300, height: 300 }), 'c.png');
  assert.deepEqual(removed().slice(baseline), [first], 'the replaced upload is removed');
  const second = uploads().at(-1).path;
  await click(button('Hủy', dialog()));
  assert.equal(dialog(), null);
  assert.ok(removed().includes(second), 'closing drops the unsaved upload');
  assert.equal(stored.size, 0);
});

test('saving an edit removes the files the server reports as no longer used', async () => {
  await render();
  rpcHandler = (name, args) => name === 'admin_list_avatar_frames'
    ? { data: FRAMES, error: null }
    : { data: { frame: { ...FRAMES[1], ...args.p_document }, removed_paths: [OLD_PATH, OLD_FALLBACK] }, error: null };
  await click(byLabel('Sửa Khung động'));
  assert.match(dialog().textContent, /Thông tin đã lưu.*Động.*APNG.*30.*2,4 giây/);
  assert.match(dialog().textContent, /Đang dùng ảnh dự phòng đã lưu/);
  await choose('frame-image', pngBytes(), 'tinh.png');
  assert.equal(dialog().textContent.includes('Ảnh tĩnh dự phòng'), false, 'a static image needs no fallback');
  await click(saveButton());
  assert.equal(lastSave().p_document.fallback_path, undefined);
  assert.deepEqual(removed().sort(), [OLD_FALLBACK, OLD_PATH].sort());
});

test('delete explains the impact, blocks double submits and removes both files of an animated frame', async () => {
  await render();
  await click(byLabel('Xóa Khung động'));
  assert.match(dialog().textContent, /Ảnh động và ảnh dự phòng sẽ được xóa khỏi Storage/);
  let finish;
  rpcHandler = (name, args) => name === 'admin_list_avatar_frames'
    ? { data: FRAMES, error: null }
    : new Promise((resolve) => { finish = () => resolve({ data: { id: args.p_id, affected_users: 0, removed_paths: [OLD_PATH, OLD_FALLBACK] }, error: null }); });
  await click(button('Xóa khung'));
  await click(button('Đang xử lý...'));
  assert.equal(calls.rpc.filter(([name]) => name === 'admin_delete_avatar_frame').length, 1);
  await act(async () => finish());
  await settle();
  assert.equal(dialog(), null);
  assert.deepEqual(removed().sort(), [OLD_FALLBACK, OLD_PATH].sort());
});

test('toggling sends the flipped state; a refused activation is shown', async () => {
  await render();
  await click(byLabel('Tắt Vòng nguyệt quế'));
  assert.deepEqual(lastSave(), { p_id: 'laurel', p_document: { name: 'Vòng nguyệt quế', is_active: false } });
  rpcHandler = (name) => name === 'admin_list_avatar_frames'
    ? { data: FRAMES, error: null }
    : { data: null, error: { code: '22023', message: 'Khung động cần ảnh tĩnh dự phòng trước khi bật.' } };
  await click(byLabel('Bật Khung động'));
  assert.equal(lastSave().p_document.is_active, true);
});

test('list failure shows a retry; permission errors are worded for the admin', async () => {
  let fail = true;
  rpcHandler = () => (fail ? { data: null, error: { code: '42501', message: 'Chỉ quản trị viên mới được quản lý khung avatar.' } } : { data: FRAMES, error: null });
  await render();
  assert.match(document.querySelector('[role="alert"]').textContent, /Chỉ quản trị viên/);
  fail = false;
  await click(button('Thử lại'));
  assert.equal(document.querySelectorAll('li.row').length, 2);
});
