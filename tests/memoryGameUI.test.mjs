import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import { AuthContext } from '../src/context/authContext.js';
import { emptyDocument, createGame, gameReducer, gameSnapshot, scoreKey } from '../src/utils/memoryGame.js';
import { memoryStorageKey } from '../src/utils/memoryGameStorage.js';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/memory-game', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
class LoadedImage {
  naturalWidth = 20; naturalHeight = 20;
  set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
}
globalThis.Image = LoadedImage;
HelmetProvider.canUseDOM = true;
const { default: MemoryGame } = await import('../src/pages/MemoryGame.jsx');
const USER = '11111111-1111-4111-8111-111111111111';
let root;
const noBackend = () => Promise.resolve({ data: null, error: { code: 'PGRST202' } });
const cards = () => [...document.querySelectorAll('.mg-card')];
const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
const labelButton = (label) => document.querySelector(`button[aria-label="${label}"]`);
async function click(element) { assert.ok(element); await act(async () => { element.click(); }); }
async function render(userId = USER, strict = false) {
  root ??= createRoot(document.querySelector('#root'));
  await act(async () => {
    const component = React.createElement(HelmetProvider, null,
      React.createElement(AuthContext.Provider, { value: { user: { id: userId } } }, React.createElement(MemoryGame)));
    root.render(strict ? React.createElement(React.StrictMode, null, component) : component);
  });
}
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
function findPairs() {
  const found = new Map();
  cards().forEach((card, index) => {
    const face = card.querySelector('.mg-card-symbol')?.textContent;
    found.set(face, [...(found.get(face) ?? []), index]);
  });
  return [...found.values()];
}
async function matchPair(pair) { await click(cards()[pair[0]]); await click(cards()[pair[1]]); }

test.beforeEach(() => {
  localStorage.clear();
  globalThis.__memoryRpc = noBackend;
  globalThis.__memoryCards = () => Promise.resolve({ data: [], error: null });
});
test.afterEach(unmount);
test.after(() => dom.window.close());

test('late image catalog never replaces a board or counters, including StrictMode', async () => {
  let finish;
  globalThis.__memoryCards = () => new Promise((resolve) => { finish = resolve; });
  await render(USER, true);
  const original = cards().map((item) => item.querySelector('.mg-card-symbol').textContent);
  await matchPair(findPairs()[0]);
  assert.equal(document.querySelector('.mg-stats strong').textContent, '1');
  await act(async () => finish({ data: Array.from({ length: 8 }, (_, id) => ({ id: id + 1, image: `https://example.com/${id}.png` })), error: null }));
  assert.deepEqual(cards().map((item) => item.querySelector('.mg-card-symbol').textContent), original);
  assert.equal(cards().filter((item) => item.classList.contains('is-matched')).length, 2);
  assert.equal(document.querySelector('.mg-stats strong').textContent, '1');
  assert.equal(document.querySelector('option[value="photos"]').disabled, false);
  for (const pair of findPairs().filter((indices) => !cards()[indices[0]].disabled)) await matchPair(pair);
  assert.equal(cards().filter((item) => item.classList.contains('is-matched')).length, 8);
  assert.match(document.querySelector('dialog').textContent, /hoàn thành/);
});

test('dialogs focus controls, wrap Tab and restore focus; cancel preserves the current board', async () => {
  await render();
  await click(cards()[0]);
  const original = cards().map((item) => item.querySelector('.mg-card-symbol').textContent);
  const newButton = button('Ván mới'); newButton.focus();
  await click(newButton);
  const dialog = document.querySelector('dialog');
  assert.ok(dialog.open);
  assert.equal(document.activeElement, button('Giữ ván hiện tại'));
  const last = button('Tiếp tục'); last.focus();
  await act(async () => last.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, button('Giữ ván hiện tại'));
  await act(async () => dialog.dispatchEvent(new dom.window.Event('cancel', { bubbles: false, cancelable: true })));
  assert.equal(document.querySelector('dialog'), null);
  assert.deepEqual(cards().map((item) => item.querySelector('.mg-card-symbol').textContent), original);
  assert.equal(document.activeElement, newButton);
  assert.equal(document.querySelector('.mg-pause-panel'), null);
});

test('paused grids are inert; saved games resume after remount and do not leak across accounts', async () => {
  await render();
  await matchPair(findPairs()[0]);
  const original = cards().map((item) => item.querySelector('.mg-card-symbol').textContent);
  await click(button('Tạm dừng'));
  assert.ok(document.querySelector('.mg-grid').hasAttribute('inert'));
  await unmount();
  await render();
  await click(button('Tiếp tục ván đã lưu'));
  assert.deepEqual(cards().map((item) => item.querySelector('.mg-card-symbol').textContent), original);
  assert.equal(cards().filter((item) => item.disabled).length, 2);
  await click(button('Chơi tiếp'));
  assert.equal(document.querySelector('.mg-grid').hasAttribute('inert'), false);
  await render('22222222-2222-4222-8222-222222222222');
  assert.equal(button('Tiếp tục ván đã lưu'), undefined);
  assert.equal(document.querySelector('.mg-stats strong').textContent, '0');
  assert.equal(document.querySelector('.mg-history-list'), null);
});

test('finishing reports result once and an existing better record does not trigger a new-record banner', async () => {
  const saved = emptyDocument();
  const previous = { id: 'previous', theme: 'animals', pairCount: 4, mode: 'free', verified: false, day: null, turns: 4, elapsedMs: 0, completedAt: '2026-10-14T00:00:00Z' };
  saved.records[scoreKey(previous)] = previous;
  localStorage.setItem(memoryStorageKey(USER), JSON.stringify(saved));
  await render();
  for (const pair of findPairs()) await matchPair(pair);
  assert.equal(document.querySelector('.mg-record'), null);
  assert.equal(document.querySelectorAll('.mg-history-list li').length, 1);
  await click(button('Xem lại bàn'));
  assert.equal(document.querySelector('dialog'), null);
  await click(button('Xem kết quả ván chơi'));
  assert.equal(document.querySelectorAll('.mg-history-list li').length, 1);
});

test('late cloud data merges history without replacing an ongoing local board', async () => {
  let finishLoad;
  let saveCount = 0;
  const remote = emptyDocument();
  remote.active = gameSnapshot(gameReducer(createGame({ theme: 'fruit' }), { type: 'choose', index: 0, now: 1000 }));
  globalThis.__memoryRpc = (name) => name === 'memory_game_load'
    ? new Promise((resolve) => { finishLoad = resolve; })
    : name === 'memory_game_save' ? (saveCount++, Promise.resolve({ data: { version: 2 }, error: null })) : noBackend();
  await render();
  await matchPair(findPairs()[0]);
  const original = cards().map((item) => item.querySelector('.mg-card-symbol').textContent);
  await act(async () => finishLoad({ data: { version: 1, document: remote }, error: null }));
  assert.deepEqual(cards().map((item) => item.querySelector('.mg-card-symbol').textContent), original);
  assert.equal(cards().filter((item) => item.disabled).length, 2);
  assert.match(document.querySelector('.mg-account').textContent, /thiết bị khác/);
  assert.equal(saveCount, 0);
  await click(button('Giữ ván trên thiết bị này'));
  assert.equal(saveCount, 1);
});

test('unavailable daily backend uses clearly marked practice and no leaderboard submission', async () => {
  const calls = [];
  globalThis.__memoryRpc = (name) => { calls.push(name); return noBackend(); };
  await render();
  await click(button('Chơi thử thách hôm nay'));
  assert.equal(cards().length, 12);
  assert.match(document.querySelector('.mg-notice').textContent, /luyện tập/);
  for (const pair of findPairs()) await matchPair(pair);
  assert.equal(calls.includes('memory_game_daily_reveal'), false);
  assert.equal(document.querySelectorAll('.mg-history-list li').length, 1);
});

test('competitive cards only reveal server faces, serialize requests and reconcile lost responses', async () => {
  const session = { id: 'daily-session', day: '2026-10-14', pair_count: 6, status: 'ready', turns: 0, matched: [], revealed: [], first: null, second: null, elapsed_ms: 0, lock_ms: 0 };
  let finishReveal; let reveals = 0;
  globalThis.__memoryRpc = (name) => {
    if (name === 'memory_game_daily_start') return Promise.resolve({ data: session, error: null });
    if (name === 'memory_game_daily_reveal') { reveals++; return new Promise((resolve) => { finishReveal = resolve; }); }
    return noBackend();
  };
  await render();
  await click(button('Chơi thử thách hôm nay'));
  assert.equal(cards().filter((item) => item.querySelector('.mg-card-symbol')?.textContent).length, 0);
  await click(cards()[0]);
  await click(cards()[1]);
  assert.equal(reveals, 1);
  Object.assign(session, { status: 'playing', first: 0, revealed: [{ index: 0, symbol_id: 2 }] });
  await act(async () => finishReveal({ data: null, error: { code: 'NETWORK' } }));
  assert.match(cards()[0].getAttribute('aria-label'), /Gấu trúc/);
  assert.equal(document.querySelector('.mg-stats strong').textContent, '0');
  assert.equal(document.querySelector('.mg-error'), null);
});
