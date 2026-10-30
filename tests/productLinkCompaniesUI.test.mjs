import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { HelmetProvider } from 'react-helmet-async';

const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost/link-anh-san-pham', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
HelmetProvider.canUseDOM = true;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, useLocation } = await import('react-router-dom');
const { AuthContext } = await import('../src/context/authContext.js');
const { default: Page } = await import('../src/pages/ProductLinks/ProductLinks.jsx');
const service = await import('../src/services/productLinkService.js');
const companies = [{ id: 'triet', name: 'Minh Triết' }, { id: 'tam', name: 'Minh Tâm' }];
const item = (company = 'triet', code = 'SKU-1') => ({ id: `item-${company}`, company_id: company, code, seq: 1, links: ['https://image.test/a'], is_done: false, is_pinned: false });
let root;
let requests;
function Probe() { const location = useLocation(); return React.createElement('output', null, location.search); }
async function render(path = '/link-anh-san-pham', role = 'admin') {
  root = createRoot(document.querySelector('#root'));
  const auth = { user: { id: 'user' }, profile: { role, status: 'active', full_name: 'User' } };
  await act(async () => root.render(React.createElement(HelmetProvider, null,
    React.createElement(AuthContext.Provider, { value: auth },
      React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Probe), React.createElement(Page)),
    ),
  )));
}
const button = (text) => [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === text);
async function click(element) { assert.ok(element); await act(async () => element.click()); }
async function fill(element, value) {
  assert.ok(element);
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const selector = () => document.querySelector('select[aria-label="Chọn công ty"]');

test.beforeEach(() => {
  requests = [];
  globalThis.__productChannels = [];
  globalThis.__productRpc = () => ({ data: 3, error: null });
  globalThis.__productTable = (query) => {
    requests.push(query);
    if (query.table === 'product_link_companies') return { data: companies, error: null };
    if (query.table === 'product_link_items') return { data: [item(query.filters.company_id)], error: null };
    return { data: [], error: null };
  };
});
test.afterEach(async () => { if (root) { await act(async () => root.unmount()); root = null; } });
test.after(() => dom.window.close());

test('URL selects the company and switching resets search and scopes both products and logs', async () => {
  await render('/link-anh-san-pham?company=tam');
  assert.equal(selector().value, 'tam');
  assert.match(document.querySelector('h1').textContent, /Minh Tâm/);
  assert.ok(requests.filter((q) => q.table !== 'product_link_companies').every((q) => q.filters.company_id === 'tam'));
  await fill(document.querySelector('input[type="search"]'), 'No match');
  await fill(selector(), 'triet');
  assert.equal(document.querySelector('input[type="search"]').value, '');
  assert.match(document.querySelector('output').textContent, /company=triet/);
  assert.equal(globalThis.__productChannels[0].removed, true);
  assert.ok(requests.filter((q) => q.table === 'product_link_logs').some((q) => q.filters.company_id === 'triet'));
});

test('late product requests and realtime from another company do not contaminate the active workspace', async () => {
  let finish;
  const transport = globalThis.__productTable;
  globalThis.__productTable = (query) => query.table === 'product_link_items' && query.filters.company_id === 'triet'
    ? new Promise((resolve) => { finish = resolve; }) : transport(query);
  await render();
  await fill(selector(), 'tam');
  await act(async () => finish({ data: [item('triet', 'LATE-TRIET')], error: null }));
  const channel = globalThis.__productChannels.at(-1);
  const emit = (table, payload) => channel.listeners.find((entry) => entry.filter.table === table).callback(payload);
  await act(async () => emit('product_link_items', { eventType: 'INSERT', new: item('triet', 'OTHER-COMPANY') }));
  await act(async () => emit('product_link_logs', { new: { id: 1, company_id: 'triet', action: 'create', item_code: 'OTHER-LOG' } }));
  assert.doesNotMatch(document.body.textContent, /LATE-TRIET|OTHER-COMPANY|OTHER-LOG/);
  await act(async () => emit('product_link_items', { eventType: 'INSERT', new: { ...item('tam', 'TAM-NEW'), id: 'new' } }));
  assert.match(document.body.textContent, /TAM-NEW/);
});

test('admin creates a company, duplicate errors keep the form open, and success selects it', async () => {
  let duplicate = true;
  const transport = globalThis.__productTable;
  globalThis.__productTable = (query) => {
    if (query.table === 'product_link_companies' && query.operation === 'insert') {
      requests.push(query);
      return duplicate ? { error: { code: '23505' } } : { data: { id: 'new-company', name: query.value.name }, error: null };
    }
    return transport(query);
  };
  await render();
  await click(button('Thêm công ty'));
  await fill(document.querySelector('[role="dialog"] input'), '  Công ty   mới  ');
  await click(button('Tạo công ty'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Tên công ty này đã tồn tại/);
  duplicate = false;
  await click(button('Tạo công ty'));
  assert.equal(selector().value, 'new-company');
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(requests.find((q) => q.operation === 'insert').value.name, 'Công ty mới');
});

test('editor cannot see company creation; missing schema shows an error and retry recovers', async () => {
  let missing = true;
  const transport = globalThis.__productTable;
  globalThis.__productTable = (query) => missing && query.table === 'product_link_companies'
    ? { error: { code: 'PGRST205' } } : transport(query);
  await render('/link-anh-san-pham', 'user');
  assert.match(document.querySelector('[role="alert"]').textContent, /Chưa cập nhật dữ liệu công ty/);
  missing = false;
  await click(button('Thử lại'));
  assert.ok(selector());
  assert.equal(button('Thêm công ty'), undefined);
});

test('viewer can export the selected company even when search hides every product', async () => {
  globalThis.__productRpc = () => ({ data: 1, error: null });
  await render('/link-anh-san-pham?company=tam', 'user');
  assert.equal(button('Tải Excel').disabled, false);
  assert.match(button('Tải Excel').title, /Minh Tâm/);
  await fill(document.querySelector('input[type="search"]'), 'No match');
  assert.equal(button('Tải Excel').disabled, false);
  await fill(selector(), 'triet');
  assert.match(button('Tải Excel').title, /Minh Triết/);
});

test('export is disabled for an empty company or failed product request', async () => {
  const transport = globalThis.__productTable;
  globalThis.__productTable = (query) => query.table === 'product_link_items'
    ? query.filters.company_id === 'triet' ? { data: [], error: null } : { data: null, error: { message: 'Load failed' } }
    : transport(query);
  await render();
  assert.equal(button('Tải Excel').disabled, true);
  await fill(selector(), 'tam');
  assert.equal(button('Tải Excel').disabled, true);
});

test('creating and importing products pass the selected company to the database', async () => {
  let query;
  globalThis.__productTable = (value) => { query = value; return { data: item('tam'), error: null }; };
  await service.createProductLinkItem({ companyId: 'tam', code: 'SKU', links: [] });
  assert.equal(query.value.company_id, 'tam');
  let args;
  globalThis.__productRpc = (name, value) => { args = value; return { data: {}, error: null }; };
  await service.importProductLinks([{ code: 'SKU', links: [] }], 'replace', 'tam');
  assert.equal(args.p_company_id, 'tam');
  await service.logProductLinkCopy({ userId: 'user', actorName: 'User', item: item('tam'), details: {} });
  assert.equal(query.value.company_id, 'tam');
});
