import { dom } from './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { directoryHandle, fileHandle } from './fixtures/clearVideoFs.mjs';

globalThis.location = dom.window.location;
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
window.FileSystemHandle = class { requestPermission() {} };
window.FileSystemDirectoryHandle = class { removeEntry() {} };
const { default: ToolsPage } = await import('../src/pages/Tools/ToolsPage.jsx');
const { default: ClearVideoPage } = await import('../src/pages/Tools/ClearVideoPage.jsx');
const originalCreateElement = document.createElement.bind(document);
document.createElement = (tag, ...args) => {
  const node = originalCreateElement(tag, ...args);
  if (tag === 'video') {
    Object.defineProperties(node, {
      videoWidth: { value: 640 }, videoHeight: { value: 480 },
      src: { set() { queueMicrotask(() => node.onloadedmetadata?.()); } },
    });
    node.load = () => {};
  }
  return node;
};
URL.createObjectURL = () => 'blob:test-video';
URL.revokeObjectURL = () => {};
let reactRoot;
let folder;
let pickError;
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const button = (text) => [...document.querySelectorAll('button')].find((node) => node.textContent.includes(text));
const reviewButton = () => button('Xem lại & xóa');
const chosenFile = () => document.querySelector('input[aria-label="Chọn a.mp4"]');
async function click(node) { assert(node, 'Expected an element to click'); await act(async () => { node.click(); await tick(); }); }
async function type(node, text) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, text);
    node.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function mount(Component) {
  await act(async () => reactRoot.render(React.createElement(React.StrictMode, null,
    React.createElement(HelmetProvider, null, React.createElement(MemoryRouter, null, React.createElement(Component))))));
}
async function scanFolder() { await click(button('Chọn thư mục')); await click(button('Quét video')); }
async function confirmForm() {
  await click(chosenFile()); await click(reviewButton());
  const dialog = document.querySelector('[role="dialog"]');
  await click(dialog.querySelector('input[type="checkbox"]'));
  await type(document.getElementById('clear-video-confirm'), 'XÓA 1');
}

test.beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  reactRoot = createRoot(document.getElementById('root'));
  folder = directoryHandle('Test videos', [fileHandle('a.mp4'), fileHandle('keep.jpg')]);
  pickError = null;
  window.showDirectoryPicker = async () => { if (pickError) throw pickError; return folder; };
});
test.afterEach(async () => { if (reactRoot) await act(async () => reactRoot.unmount()); });

test('directory links to Clear Video, searches and resets empty results', async () => {
  await mount(ToolsPage);
  assert(document.querySelector('a[href="/tools/clear-video"]'));
  assert(document.querySelector('a[href="/tools/watermark"]'));
  assert(document.querySelector('a[href="/tools/chuyen-doi-file"]'));
  assert.equal(document.querySelectorAll('a[aria-label^="Mở "]').length, 3);
  const input = document.querySelector('input[type="search"]');
  await type(input, 'không tồn tại');
  assert.match(document.body.textContent, /Chưa tìm thấy công cụ/);
  assert.equal(document.querySelector('a[href="/tools/clear-video"]'), null);
  assert.equal(document.querySelector('a[href="/tools/watermark"]'), null);
  assert.equal(document.querySelector('a[href="/tools/chuyen-doi-file"]'), null);
  await click(button('Xóa bộ lọc'));
  assert(document.querySelector('a[href="/tools/clear-video"]'));
  await type(input, 'pdf');
  assert(document.querySelector('a[href="/tools/chuyen-doi-file"]'));
  assert.equal(document.querySelectorAll('a[aria-label^="Mở "]').length, 1);
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
  assert.equal(document.activeElement, input);
});

test('image category finds Watermark with its own preview and canonical link', async () => {
  await mount(ToolsPage);
  await click([...document.querySelectorAll('[aria-label="Danh mục công cụ"] button')].find((node) => node.textContent === 'Ảnh'));
  assert.equal(document.querySelector('a[href="/tools/clear-video"]'), null);
  assert.equal(document.querySelector('a[href="/tools/chuyen-doi-file"]'), null);
  const card = document.querySelector('a[href="/tools/watermark"]');
  assert(card);
  assert.match(card.textContent, /Ảnh của bạn, dấu ấn riêng/);
  assert.match(card.textContent, /Cần đăng nhập/);
  assert.doesNotMatch(card.textContent, /Dọn video/);
});

test('confirmation requires selected files, acknowledgment, exact phrase and write permission', async () => {
  await mount(ClearVideoPage);
  assert(button('Quét video').disabled);
  assert(reviewButton().disabled);
  await scanFolder();
  assert.deepEqual(folder.permissions, ['read']);
  assert.equal(chosenFile().checked, false);
  assert(reviewButton().disabled);
  await click(chosenFile()); await click(reviewButton());
  const confirm = button('Cấp quyền & xóa');
  assert(confirm.disabled);
  await type(document.getElementById('clear-video-confirm'), 'XÓA 1');
  assert(confirm.disabled);
  await click(document.querySelector('[role="dialog"] input[type="checkbox"]'));
  assert.equal(confirm.disabled, false);
  folder.permission = 'denied';
  await click(confirm);
  assert.deepEqual(folder.removed, []);
  assert(document.querySelector('[role="dialog"]'));
  assert.match(document.body.textContent, /Chưa được cấp quyền ghi\/xóa/);
  folder.permission = 'granted';
  await click(button('Cấp quyền & xóa'));
  assert.deepEqual(folder.removed, ['a.mp4']);
  assert(folder.children.has('keep.jpg'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert(reviewButton().disabled);
  assert.match(document.body.textContent, /đã xóa 1\/1/);
  assert(button('Tải báo cáo JSON'));
});

test('changing scope invalidates selection and requires a new scan', async () => {
  await mount(ClearVideoPage); await scanFolder(); await click(chosenFile());
  assert.equal(reviewButton().disabled, false);
  const scope = [...document.querySelectorAll('label')].find((label) => label.textContent.includes('Bao gồm tất cả thư mục con')).querySelector('input');
  await click(scope);
  assert.equal(chosenFile(), null);
  assert(reviewButton().disabled);
  assert.match(document.body.textContent, /Đã đổi phạm vi/);
  assert.equal(button('Tải báo cáo JSON'), undefined);
});

test('unsupported browsers disable file actions and explain the requirement', async () => {
  window.showDirectoryPicker = undefined;
  await mount(ClearVideoPage);
  assert(button('Chọn thư mục').disabled);
  assert(button('Quét video').disabled);
  assert.match(document.querySelector('[role="alert"]').textContent, /Chrome hoặc Edge/);
});

test('cancelling the directory picker preserves the previous selection', async () => {
  await mount(ClearVideoPage); await scanFolder();
  pickError = new DOMException('Cancelled', 'AbortError');
  await click(button('Đổi thư mục'));
  assert(chosenFile());
  assert.match(document.body.textContent, /Lựa chọn trước đó được giữ nguyên/);
  assert.deepEqual(folder.removed, []);
});

test('leaving while write permission is pending prevents deletion after permission resolves', async () => {
  await mount(ClearVideoPage); await scanFolder(); await confirmForm();
  let grant;
  folder.requestPermission = () => new Promise((resolve) => { grant = resolve; });
  await click(button('Cấp quyền & xóa'));
  assert(grant);
  await act(async () => reactRoot.unmount()); reactRoot = null;
  await act(async () => { grant('granted'); await tick(); });
  assert.deepEqual(folder.removed, []);
});
