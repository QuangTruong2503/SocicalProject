import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/admin/users', pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const { createRoot } = await import('react-dom/client');
const { HelmetProvider } = await import('react-helmet-async');
const { MemoryRouter } = await import('react-router-dom');
const { AuthContext } = await import('../src/context/authContext.js');
const { AuthProvider } = await import('../src/context/AuthContext.jsx');
const { default: Page } = await import('../src/pages/Admin/AdminUsersPage.jsx');
const { formatDateTime } = await import('../src/utils/formatters.js');
HelmetProvider.canUseDOM = true;

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const LAST_ACTIVE = '2026-11-17T02:30:00.000Z';
const rows = [
  { id: USER, full_name: 'Người đang hoạt động', email: 'active@test.invalid', role: 'user', status: 'active', plan: 'free', last_login_at: '2026-11-01T00:00:00Z', last_active_at: LAST_ACTIVE, total_count: 2 },
  { id: ADMIN, full_name: 'Chưa hoạt động', email: 'admin@test.invalid', role: 'admin', status: 'active', last_active_at: null, total_count: 2 },
];
const settle = () => act(async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});
const click = async (element) => {
  assert.ok(element, 'click target exists');
  await act(async () => element.click());
  await settle();
};

test('admin users shows activity in the list/detail, sorts server-side and exports CSV', async (t) => {
  const calls = [];
  globalThis.__framesRpc = (name, args) => {
    calls.push({ name, args });
    if (name === 'admin_user_directory') return { data: { rows,totalCount:rows.length }, error: null };
    if (name === 'admin_user_center_stats') return { data: { total: 2 }, error: null };
    if (name === 'admin_user_detail') return { data: { profile:rows.find((row) => row.id===args.p_user_id) },error:null };
    if (name === 'admin_user_activity') return { data: {}, error: null };
    return { data: null, error: null };
  };
  globalThis.__framesTable = ({ table, filters }) => ({ data: table === 'profiles' ? rows.find((row) => row.id === filters.id) : [], error: null });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); });
  await act(async () => root.render(React.createElement(HelmetProvider, null,
    React.createElement(MemoryRouter, null, React.createElement(AuthContext.Provider, { value: { user: { id: ADMIN } } }, React.createElement(Page))),
  )));
  await settle();

  const headers = [...document.querySelectorAll('thead th')];
  assert.equal(headers.length, 8);
  const activityHeader = headers.find((cell) => cell.textContent.includes('Hoạt động gần nhất'));
  const activityColumn = headers.indexOf(activityHeader);
  const listRows = [...document.querySelectorAll('tbody tr')];
  const activityCell = listRows[0].cells[activityColumn];
  assert.equal(activityCell.querySelector('time').dateTime, LAST_ACTIVE);
  assert.equal(activityCell.querySelector('small').textContent, formatDateTime(LAST_ACTIVE));
  assert.equal(listRows[1].cells[activityColumn].textContent, 'Chưa có bản ghi');
  await click(activityHeader.querySelector('button'));
  assert.equal(calls.filter((call) => call.name === 'admin_user_directory').at(-1).args.p_filters.sort, 'last_active_at');
  await click(activityHeader.querySelector('button'));
  assert.equal(calls.filter((call) => call.name === 'admin_user_directory').at(-1).args.p_filters.desc, false);

  await click(document.querySelector('[aria-label="Xem chi tiết Người đang hoạt động"]'));
  const label = [...document.querySelectorAll('[role="dialog"] dt')].find((item) => item.textContent === 'Hoạt động gần nhất');
  assert.ok(label.nextElementSibling.textContent.includes(formatDateTime(LAST_ACTIVE)));
  await click(document.querySelector('[aria-label="Đóng"]'));

  let exported;
  t.mock.method(URL, 'createObjectURL', (blob) => { exported = blob; return 'blob:csv'; });
  t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', () => {});
  await click([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Xuất CSV')));
  const csv = await exported.text();
  assert.ok(csv.includes('Đăng nhập gần nhất,Hoạt động gần nhất,Tham gia'));
  assert.ok(csv.includes(LAST_ACTIVE));
});

test('AuthProvider records only a signed-in active user and cleans up on signout', async (t) => {
  t.mock.method(console, 'debug', () => {});
  const calls = [];
  globalThis.__framesRpc = (name) => { calls.push(name); return { data: null, error: null }; };
  globalThis.__framesTable = ({ table }) => ({ data: table === 'profiles' ? rows[0] : null, error: null });
  const root = createRoot(document.getElementById('root'));
  let context;
  function Probe() { context = React.useContext(AuthContext); return null; }
  t.after(async () => { await act(async () => root.unmount()); });
  await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(Probe))));
  await settle();
  assert.equal(calls.length, 0, 'guests are not tracked');

  globalThis.__framesSession = { user: { id: USER, email: rows[0].email } };
  await act(async () => { await context.refreshSession(); });
  await settle();
  assert.deepEqual(calls, ['record_user_activity']);

  globalThis.__framesSession = null;
  await act(async () => { await context.refreshSession(); });
  await settle();
  await act(async () => document.dispatchEvent(new dom.window.Event('pointerdown')));
  assert.deepEqual(calls, ['record_user_activity']);

  globalThis.__framesTable = ({ table }) => ({ data: table === 'profiles' ? { ...rows[0], status: 'suspended' } : null, error: null });
  globalThis.__framesSession = { user: { id: USER, email: rows[0].email } };
  await act(async () => { await context.refreshSession(); });
  await settle();
  assert.deepEqual(calls, ['record_user_activity'], 'suspended users are not tracked');
});

test('profiles remain available while optional schema migrations await deployment', async (t) => {
  t.mock.method(console, 'debug', () => {});
  t.mock.method(console, 'warn', () => {});
  const { getProfile } = await import('../src/services/profileService.js');
  const selects = [];
  globalThis.__framesTable = ({ select }) => {
    selects.push(select);
    const missing = ['last_active_at', 'avatar_frame_id'].find((column) => select.includes(column));
    return missing
      ? { data: null, error: { code: '42703', message: `column profiles.${missing} does not exist` } }
      : { data: rows[0], error: null };
  };
  const result = await getProfile(USER);
  assert.equal(result.error, null);
  assert.equal(result.data.id, USER);
  assert.equal(selects.length, 3);
  assert.ok(!selects.at(-1).includes('last_active_at'));
  assert.ok(!selects.at(-1).includes('avatar_frame_id'));
});
