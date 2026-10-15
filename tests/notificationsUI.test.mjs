import { dom } from './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthContext } from '../src/context/authContext.js';
import { safeNotificationUrl } from '../src/utils/notifications.js';

HelmetProvider.canUseDOM = true;
const { default: NotificationProvider } = await import('../src/context/NotificationProvider.jsx');
const { default: NotificationBell } = await import('../src/components/notifications/NotificationBell.jsx');
const { default: NotificationsPage } = await import('../src/pages/NotificationsPage.jsx');
const { default: AdminNotificationsPage } = await import('../src/pages/Admin/AdminNotificationsPage.jsx');
const { useNotifications } = await import('../src/hooks/useNotifications.js');
const USER_A = '22222222-2222-4222-8222-222222222222';
let root; let records; let calls; let failAcknowledgement;
const notification = (id, priority = 'normal') => ({ id, title: `Thông báo ${id}`, body: 'Nội dung đầy đủ\nDòng thứ hai', priority, sent_at: '2026-10-15T02:00:00Z', read_at: null, acknowledged_at: null });
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
async function click(element) { assert.ok(element, 'control exists'); await act(async () => { element.click(); }); }
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)); }); }
function Probe() {
  const context = useNotifications();
  return React.createElement('button', { onClick: () => context.refresh(), 'data-testid': 'refresh' }, 'Refresh test');
}
async function render(child = NotificationBell, userId = USER_A, strict = false) {
  root ??= createRoot(document.querySelector('#root'));
  await act(async () => {
    const app = React.createElement(HelmetProvider, null, React.createElement(MemoryRouter, null,
      React.createElement(AuthContext.Provider, { value: { user: userId ? { id: userId } : null, profile: { status: 'active' }, isInitializing: false } },
        React.createElement(NotificationProvider, null, React.createElement(child), React.createElement(Probe)))));
    root.render(strict ? React.createElement(React.StrictMode, null, app) : app);
  });
  await settle();
}
async function input(labelText, value) {
  const label = [...document.querySelectorAll('label')].find((item) => item.firstChild.textContent === labelText);
  const element = label.querySelector('input, textarea, select');
  await act(async () => {
    const type = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement : element.tagName === 'SELECT' ? dom.window.HTMLSelectElement : dom.window.HTMLInputElement;
    Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
test.beforeEach(() => {
  records = []; calls = []; failAcknowledgement = false;
  globalThis.__notificationRpc = async (name, payload) => {
    calls.push({ name, payload });
    if (name === 'notification_inbox') {
      const items = records.filter((item) => !payload.p_unread_only || !item.read_at);
      return { data: { items: items.slice(payload.p_offset, payload.p_offset + payload.p_limit), total_count: items.length,
        unread_count: records.filter((item) => !item.read_at).length,
        pending: records.find((item) => item.priority === 'important' && !item.acknowledged_at) || null }, error: null };
    }
    if (name === 'notification_detail') return { data: records.find((item) => item.id === payload.p_id) || null, error: null };
    if (name === 'notification_mark_read') {
      if (failAcknowledgement && payload.p_acknowledge) return { data: null, error: { code: 'network', message: 'offline' } };
      records = records.map((item) => (payload.p_id ? item.id === payload.p_id : item.priority === 'normal')
        ? { ...item, read_at: 'now', acknowledged_at: payload.p_acknowledge ? 'now' : item.acknowledged_at } : item);
      return { data: null, error: null };
    }
    if (name === 'admin_notification_list') return { data: { items: [], total_count: 0 }, error: null };
    if (name === 'admin_list_profiles') return { data: [{ id: USER_A, full_name: 'Nguyễn An', email: 'an@example.com', total_count: 1 }], error: null };
    if (name === 'admin_notification_save') return { data: 'draft-id', error: null };
    if (name === 'admin_notification_publish') return { data: 1, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  };
});
test.afterEach(async () => { if (root) { await act(async () => root.unmount()); root = null; } });
test.after(() => dom.window.close());

test('normal notifications only appear in the bell; reading updates badge and detail preserves line breaks', async () => {
  records = [notification('one')];
  await render(NotificationBell, USER_A, true);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(document.querySelector('button[aria-controls="notification-dropdown"]'));
  await click([...document.querySelectorAll('button')].find((item) => item.textContent.startsWith('Thông báo one')));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Nội dung đầy đủ\nDòng thứ hai/);
  assert.ok(document.querySelector('button[aria-label="Thông báo, 0 chưa đọc"]'));
});

test('important modals queue on entry, survive Escape and failed acknowledgement, and disappear only after success', async () => {
  records = [notification('first', 'important'), notification('second', 'important'), notification('normal')];
  await render();
  assert.match(document.querySelector('[role="dialog"]').textContent, /Thông báo first/);
  assert.equal(document.activeElement, button('Đã hiểu'));
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(document.querySelector('[role="dialog"]'));
  failAcknowledgement = true; await click(button('Đã hiểu'));
  assert.ok(document.querySelector('[role="alert"]'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Thông báo first/);
  failAcknowledgement = false; await click(button('Đã hiểu'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Thông báo second/);
  await click(button('Đã hiểu'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await click(document.querySelector('[data-testid="refresh"]'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(document.querySelector('button[aria-label="Thông báo, 1 chưa đọc"]'));
});

test('history bulk read only marks normal notifications and filter remains usable', async () => {
  records = [notification('one'), notification('two')];
  await render(NotificationsPage);
  await click(button('Đọc tất cả thông báo thường'));
  assert.equal(calls.find((item) => item.name === 'notification_mark_read').payload.p_acknowledge, false);
  assert.ok(records.every((item) => item.read_at));
  await click(button('Chưa đọc'));
  assert.match(document.body.textContent, /Không có thông báo chưa đọc/);
  await click(button('Tất cả'));
  assert.match(document.body.textContent, /Thông báo one/);
});

test('admin can preview a targeted important notice and confirm sending without publishing the preview', async () => {
  await render(AdminNotificationsPage);
  await input('Tiêu đề', 'Bảo trì hệ thống');
  await input('Nội dung', 'Bảo trì lúc 22 giờ.');
  await input('Mức độ', 'important');
  await input('Người nhận', 'selected');
  await settle();
  await click(document.querySelector('input[type="checkbox"]'));
  await click(button('Xem trước'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Bảo trì hệ thống/);
  assert.equal(calls.filter((item) => item.name === 'admin_notification_publish').length, 0);
  await click(document.querySelector('button[aria-label="Đóng"]'));
  await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  await click(button('Gửi ngay'));
  const saved = calls.find((item) => item.name === 'admin_notification_save').payload.p_document;
  assert.equal(saved.priority, 'important'); assert.deepEqual(saved.target_user_ids, [USER_A]);
  assert.equal(calls.filter((item) => item.name === 'admin_notification_publish').length, 1);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('account changes clear previous user pending modals and anonymous sessions never fetch an inbox', async () => {
  records = [notification('private', 'important')];
  await render(); assert.ok(document.querySelector('[role="dialog"]'));
  records = [];
  await render(NotificationBell, 'other-user');
  assert.equal(document.querySelector('[role="dialog"]'), null);
  calls = [];
  await render(NotificationBell, null);
  assert.equal(calls.length, 0);
});

test('pending modals survive refresh failures and close after revocation is received', async () => {
  records = [notification('important', 'important')];
  await render();
  const transport = globalThis.__notificationRpc;
  globalThis.__notificationRpc = async () => { throw new Error('offline'); };
  await click(document.querySelector('[data-testid="refresh"]'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /Thông báo important/);
  globalThis.__notificationRpc = transport;
  records = [];
  await click(document.querySelector('[data-testid="refresh"]'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('a revoked notice disappears from a detail modal that is already open', async () => {
  records = [notification('one')];
  await render();
  await click(document.querySelector('button[aria-controls="notification-dropdown"]'));
  await click([...document.querySelectorAll('button')].find((item) => item.textContent.startsWith('Thông báo one')));
  records = [];
  await click(document.querySelector('[data-testid="refresh"]'));
  assert.match(document.querySelector('[role="dialog"]').textContent, /đã được thu hồi/);
  assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /Nội dung đầy đủ/);
});

test('notification action URLs reject scripts and redirects through network-path references', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', 'http://example.com']) {
    assert.equal(safeNotificationUrl(url), '');
  }
  assert.equal(safeNotificationUrl('/notifications'), '/notifications');
  assert.equal(safeNotificationUrl('https://example.com/path'), 'https://example.com/path');
});
