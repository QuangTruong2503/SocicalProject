import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../src/context/authContext.js';
import AdminRoute from '../src/components/AdminRoute.jsx';

// Run with: node --import ./tests/memoryGameLoader.mjs --test tests/adminRouteUI.test.mjs
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/admin' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');

const admin = {
  user: { id: 'admin-a' },
  profile: { id: 'admin-a', role: 'admin', status: 'active' },
  isAuthenticated: true,
  isInitializing: false,
  isProfileLoading: false,
  logout: async () => {},
};
let root;
let mounts;
let unmounts;

function AdminDraft() {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    mounts += 1;
    return () => { unmounts += 1; };
  }, []);
  return React.createElement('button', { onClick: () => setDraft('Thông báo đang soạn') }, draft || 'Soạn thông báo');
}

async function render(overrides = {}) {
  await act(async () => {
    root.render(React.createElement(MemoryRouter, null,
      React.createElement(AuthContext.Provider, { value: { ...admin, ...overrides } },
        React.createElement(AdminRoute, null, React.createElement(AdminDraft)))));
  });
}

test.beforeEach(() => {
  mounts = 0;
  unmounts = 0;
  root = createRoot(document.querySelector('#root'));
});
test.afterEach(async () => { await act(async () => root.unmount()); });
test.after(() => dom.window.close());

test('tab refocus and token refresh preserve the mounted admin page and unsaved draft', async () => {
  await render();
  const editor = document.querySelector('button');
  await act(async () => editor.click());

  for (const lastAuthEvent of ['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_IN']) {
    await render({ isProfileLoading: true, lastAuthEvent });
    assert.equal(document.querySelector('button'), editor);
    assert.equal(editor.textContent, 'Thông báo đang soạn');
    assert.equal(document.querySelector('.auth-loading-screen'), null);
    await render({ profile: { ...admin.profile }, lastAuthEvent });
    assert.equal(document.querySelector('button'), editor);
    assert.equal(editor.textContent, 'Thông báo đang soạn');
  }
  assert.equal(mounts, 1);
  assert.equal(unmounts, 0);
});

test('initial access waits for session and profile verification', async () => {
  await render({ isInitializing: true });
  assert.ok(document.querySelector('.auth-loading-screen'));
  await render({ profile: null, isProfileLoading: true });
  assert.ok(document.querySelector('.auth-loading-screen'));
  assert.equal(mounts, 0);
  await render();
  assert.equal(mounts, 1);
});

test('switching accounts cannot reuse the previous admin profile', async () => {
  await render();
  await render({ user: { id: 'user-b' }, isProfileLoading: true });
  assert.ok(document.querySelector('.auth-loading-screen'));
  assert.equal(unmounts, 1);
  await render({ user: { id: 'user-b' } });
  assert.match(document.querySelector('[role="dialog"]').textContent, /Bạn không có quyền/);
  assert.equal(mounts, 1);
});

for (const [name, overrides, message] of [
  ['revoked admin role', { profile: { ...admin.profile, role: 'user' } }, /Bạn không có quyền/],
  ['suspended account', { profile: { ...admin.profile, status: 'suspended' } }, /đã bị khóa/],
  ['failed profile refresh', { profile: null, profileError: 'offline' }, /Bạn không có quyền/],
  ['sign out', { user: null, profile: null, isAuthenticated: false }, /cần đăng nhập/],
]) {
  test(`${name} still removes admin access after background verification`, async () => {
    await render();
    await render({ isProfileLoading: true });
    assert.equal(unmounts, 0);
    await render(overrides);
    assert.match(document.querySelector('[role="dialog"]').textContent, message);
    assert.equal(unmounts, 1);
  });
}
