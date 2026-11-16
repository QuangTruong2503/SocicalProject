import './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthContext } from '../src/context/authContext.js';
import { ThemeContext } from '../src/context/theme.js';

const USER = { id: 'test-user' };
const MEMBER = { user: USER, profile: { id: USER.id, role: 'user', plan: 'free', status: 'active' }, isAuthenticated: true, isInitializing: false, isProfileLoading: false };
const ANONYMOUS = { user: null, profile: null, isAuthenticated: false, isInitializing: false };
let root;
function LocationState() {
  const location = useLocation();
  const type = useNavigationType();
  return React.createElement('output', { id: 'route-state' }, JSON.stringify({ ...location, type }));
}
const routeState = () => JSON.parse(document.getElementById('route-state').textContent);
async function render(entry, auth = MEMBER) {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(ThemeContext.Provider, { value: { theme: 'light' } },
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(MemoryRouter, { initialEntries: [entry] }, React.createElement(LocationState), React.createElement(App))))));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
}
async function click(text) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent === text);
  assert(button);
  await act(async () => button.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
}
test.beforeEach(() => { document.body.innerHTML = '<div id="root"></div>'; });
test.afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('legacy watermark URL replaces history and keeps query, fragment and location state', async () => {
  await render({ pathname: '/watermark', search: '?source=bookmark', hash: '#results', state: { example: true } });
  assert.equal(routeState().pathname, '/tools/watermark');
  assert.equal(routeState().search, '?source=bookmark');
  assert.equal(routeState().hash, '#results');
  assert.deepEqual(routeState().state, { example: true });
  assert.equal(routeState().type, 'REPLACE');
  assert.match(document.body.textContent, /Watermark content/);
});

test('legacy automatic watermark URL reaches the new Pro route', async () => {
  await render('/watermark/auto?source=old#folders', { ...MEMBER, profile: { ...MEMBER.profile, plan: 'pro' } });
  assert.equal(routeState().pathname, '/tools/watermark/auto');
  assert.equal(routeState().search, '?source=old');
  assert.equal(routeState().hash, '#folders');
  assert.equal(routeState().type, 'REPLACE');
  assert.match(document.body.textContent, /Automatic watermark content/);
});

test('signed-out legacy visitors log in with the canonical return URL', async () => {
  await render('/watermark?mode=test#preview', ANONYMOUS);
  assert.equal(routeState().pathname, '/tools/watermark');
  assert.doesNotMatch(document.getElementById('root').textContent, /Watermark content/);
  await click('Đăng nhập để mở Watermark');
  assert.equal(routeState().pathname, '/auth');
  assert.equal(routeState().state.from, '/tools/watermark?mode=test#preview');
});

test('direct canonical watermark URL still requires login', async () => {
  await render('/tools/watermark', ANONYMOUS);
  assert.match(document.body.textContent, /Watermark Tool cần đăng nhập/);
  assert.doesNotMatch(document.getElementById('root').textContent, /Watermark content/);
});

test('automatic watermark keeps its Pro gate and returns Free users to the canonical page', async () => {
  await render('/tools/watermark/auto');
  assert.match(document.body.textContent, /dành cho gói Pro/);
  assert.doesNotMatch(document.getElementById('root').textContent, /Automatic watermark content/);
  await click('Quay lại Watermark');
  assert.equal(routeState().pathname, '/tools/watermark');
  assert.match(document.body.textContent, /Watermark content/);
});

test('legacy file conversion URL keeps the selected tool and fragment when replacing history', async () => {
  await render({ pathname: '/chuyen-doi-file', search: '?cong-cu=tach-pdf', hash: '#pages', state: { source: 'bookmark' } }, ANONYMOUS);
  assert.equal(routeState().pathname, '/tools/chuyen-doi-file');
  assert.equal(routeState().search, '?cong-cu=tach-pdf');
  assert.equal(routeState().hash, '#pages');
  assert.deepEqual(routeState().state, { source: 'bookmark' });
  assert.equal(routeState().type, 'REPLACE');
  assert.match(document.body.textContent, /File conversion content/);
});

test('canonical file conversion URL remains available without login', async () => {
  await render('/tools/chuyen-doi-file?cong-cu=gop-pdf', ANONYMOUS);
  assert.equal(routeState().pathname, '/tools/chuyen-doi-file');
  assert.equal(routeState().search, '?cong-cu=gop-pdf');
  assert.match(document.body.textContent, /File conversion content/);
});
