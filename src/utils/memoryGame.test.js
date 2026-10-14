import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_THEMES, PAIR_COUNTS, MISMATCH_DELAY, createGame, dailyGameFromServer,
  emptyDocument, formatDuration, gameReducer, gameSnapshot, isBetterScore,
  matchedPairs, mergeDocuments, modelReducer, normalizeDocument, scoreKey, validateSnapshot, vietnamDay,
} from './memoryGame.js';
import { normalizeMemoryCards, preloadMemoryImage, prepareMemoryImages } from './memoryCardSources.js';
import { memoryStorageKey, readMemoryDocument, writeMemoryDocument } from './memoryGameStorage.js';

const choose = (game, index, now = 1000) => gameReducer(game, { type: 'choose', index, now });
function pairIndices(game) {
  return [...new Set(game.cards.map((card) => card.pairId))].map((id) => game.cards.flatMap((card, index) => card.pairId === id ? [index] : []));
}
function finish(model, start = 1000) {
  let now = start;
  for (const pair of pairIndices(model.game)) for (const index of pair) {
    model = modelReducer(model, { type: 'choose', index, now: now += 100 });
  }
  return model;
}

test('all themes and difficulties have exactly two distinct copies per face', () => {
  for (const theme of Object.keys(CARD_THEMES)) for (const pairCount of PAIR_COUNTS) {
    const game = createGame({ theme, pairCount });
    assert.equal(game.cards.length, pairCount * 2);
    assert.equal(new Set(game.cards.map((card) => card.key)).size, pairCount * 2);
    assert.equal(pairIndices(game).length, pairCount);
    assert.ok(pairIndices(game).every((pair) => pair.length === 2));
  }
  assert.throws(() => createGame({ source: [{ id: 1 }] }), /đủ ảnh/);
});

test('same card and third choice cannot consume a turn; mismatches lock until timeout', () => {
  let game = createGame();
  const first = 0;
  const second = game.cards.findIndex((card) => card.pairId !== game.cards[first].pairId);
  game = choose(game, first);
  assert.equal(choose(game, first), game);
  game = choose(game, second, 1100);
  assert.equal(game.turns, 1);
  assert.equal(choose(game, 7, 1200), game);
  assert.equal(gameReducer(game, { type: 'clear', gameId: game.id, now: 1100 + MISMATCH_DELAY - 1 }), game);
  game = gameReducer(game, { type: 'clear', gameId: game.id, now: 1100 + MISMATCH_DELAY });
  assert.equal(game.first, null);
  assert.equal(game.second, null);
});

test('a restarted board resets all counters and rejects an old timer', () => {
  let game = createGame();
  for (const index of pairIndices(game)[0]) game = choose(game, index);
  const oldId = game.id;
  const fresh = createGame();
  game = gameReducer(game, { type: 'new', game: fresh });
  assert.equal(game.turns, 0);
  assert.equal(matchedPairs(game), 0);
  assert.equal(game.first, null);
  assert.equal(gameReducer(game, { type: 'clear', gameId: oldId, now: 100000 }), game);
});

test('winning requires every card matched and records each completion once', () => {
  const initial = { game: createGame(), document: emptyDocument(), newRecord: false };
  const pairs = pairIndices(initial.game);
  let model = initial;
  for (const pair of pairs.slice(0, 3)) for (const index of pair) model = modelReducer(model, { type: 'choose', index, now: 1000 });
  assert.equal(model.game.status, 'playing');
  assert.equal(model.document.history.length, 0);
  for (const index of pairs[3]) model = modelReducer(model, { type: 'choose', index, now: 2000 });
  assert.equal(model.game.status, 'won');
  assert.equal(model.game.cards.filter((card) => card.matched).length, 8);
  assert.equal(model.document.history.length, 1);
  assert.equal(model.document.active, null);
  assert.equal(modelReducer(model, { type: 'choose', index: 0, now: 3000 }), model);
});

test('records distinguish theme, difficulty and verified daily mode; exact ties are not new records', () => {
  const result = { turns: 4, elapsedMs: 1000 };
  assert.equal(isBetterScore(result, result), false);
  assert.equal(isBetterScore({ turns: 4, elapsedMs: 999 }, result), true);
  assert.equal(isBetterScore({ turns: 5, elapsedMs: 100 }, result), false);
  assert.notEqual(scoreKey({ mode: 'daily', theme: 'animals', pairCount: 6, verified: true }), scoreKey({ mode: 'daily', theme: 'animals', pairCount: 6, verified: false }));
  let model = finish({ game: createGame(), document: emptyDocument(), newRecord: false });
  assert.equal(model.newRecord, true);
  model = modelReducer(model, { type: 'new', game: createGame(), now: 0 });
  model = finish(model);
  assert.equal(model.newRecord, false);
  assert.equal(model.document.history.length, 2);
});

test('timer starts at first choice and excludes paused or hidden time', () => {
  let game = createGame();
  assert.equal(gameReducer(game, { type: 'tick', now: 9000 }).elapsedMs, 0);
  game = choose(game, 0, 10000);
  game = gameReducer(game, { type: 'pause', now: 11500 });
  assert.equal(game.elapsedMs, 1500);
  game = gameReducer(game, { type: 'tick', now: 20000 });
  assert.equal(game.elapsedMs, 1500);
  game = gameReducer(game, { type: 'resume', now: 20000 });
  game = gameReducer(game, { type: 'tick', now: 21000 });
  assert.equal(game.elapsedMs, 2500);
  assert.equal(formatDuration(game.elapsedMs), '00:02');
});

test('saved games preserve the board, matches and turns while closing unpaired cards', () => {
  let game = createGame();
  for (const index of pairIndices(game)[0]) game = choose(game, index);
  game = choose(game, game.cards.findIndex((card) => !card.matched));
  const snapshot = gameSnapshot(game);
  const restored = validateSnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.status, 'paused');
  assert.equal(restored.first, null);
  assert.equal(restored.turns, 1);
  assert.equal(matchedPairs(restored), 1);
  assert.deepEqual(restored.cards, game.cards);
  const damaged = structuredClone(snapshot);
  damaged.cards[0].matched = !damaged.cards[0].matched;
  assert.equal(validateSnapshot(damaged), null);
  assert.equal(validateSnapshot({ ...snapshot, turns: NaN }), null);
});

test('storage is scoped to accounts and corrupt/blocked storage never breaks the game', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const document = finish({ game: createGame(), document: emptyDocument() }).document;
  assert.equal(writeMemoryDocument('one', document, storage), true);
  assert.equal(readMemoryDocument('one', storage).history.length, 1);
  assert.equal(readMemoryDocument('two', storage).history.length, 0);
  data.set(memoryStorageKey('one'), '{broken');
  assert.deepEqual(readMemoryDocument('one', storage), emptyDocument());
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readMemoryDocument('one', blocked), emptyDocument());
  assert.equal(writeMemoryDocument('one', document, blocked), false);
});

test('normalization discards invalid scores and merging retains both histories and the best score', () => {
  const a = finish({ game: createGame(), document: emptyDocument() }).document;
  const b = finish({ game: createGame(), document: emptyDocument() }, 5000).document;
  b.history[0].turns = 5;
  b.records[scoreKey(b.history[0])].turns = 5;
  const active = choose(createGame(), 0);
  a.active = gameSnapshot(active);
  const merged = mergeDocuments(a, b);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.active.id, active.id);
  assert.equal(Object.values(merged.records)[0].turns, 4);
  assert.equal(normalizeDocument({ ...a, records: { junk: { turns: 0 } }, history: [{ turns: NaN }] }).history.length, 0);
});

test('a delayed cloud merge retains a result committed after the request began', () => {
  const initial = { game: createGame(), document: emptyDocument(), newRecord: false };
  const stale = structuredClone(initial.document);
  let model = finish(initial);
  model = modelReducer(model, { type: 'merge-document', document: stale });
  assert.equal(model.document.history.length, 1);
  assert.equal(model.game.status, 'won');
  assert.equal(model.document.active, null);
});

test('image catalog rejects duplicate IDs/images, invalid IDs and unsafe URL schemes', () => {
  const cards = normalizeMemoryCards([
    { id: 1, image: 'https://example.com/a' }, { id: 1, image: 'https://example.com/b' },
    { id: 2, image: 'https://example.com/a' }, { id: 'abc', image: 'https://example.com/c' },
    { id: 3, image: 'javascript:alert(1)' }, { id: 4, image: 'https://example.com/d' },
  ]);
  assert.deepEqual(cards.map((card) => card.id), [1, 4]);
  assert.deepEqual(normalizeMemoryCards({}), []);
});

test('failed photos replace both cards with a distinct offline face without changing matches', () => {
  const source = Array.from({ length: 4 }, (_, id) => ({ id, image: `https://example.com/${id}`, name: `Photo ${id}` }));
  let game = createGame({ theme: 'photos', source });
  const pair = pairIndices(game)[0];
  game = choose(game, pair[0]);
  const firstId = game.cards[pair[0]].pairId;
  game = gameReducer(game, { type: 'image-error', pairId: firstId });
  assert.equal(game.cards[pair[0]].symbol, game.cards[pair[1]].symbol);
  assert.equal(game.cards[pair[0]].image, undefined);
  assert.equal(game.turns, 0);
  game = choose(game, pair[1]);
  assert.equal(matchedPairs(game), 1);
});

test('preloading rejects failed, hanging and aborted images', async () => {
  class FakeImage {
    naturalWidth = 20; naturalHeight = 20;
    set src(value) { if (!value) return; queueMicrotask(() => value.includes('good') ? this.onload?.() : value.includes('bad') ? this.onerror?.() : null); }
  }
  assert.equal(await preloadMemoryImage('good', { ImageClass: FakeImage }), true);
  assert.equal(await preloadMemoryImage('bad', { ImageClass: FakeImage }), false);
  assert.equal(await preloadMemoryImage('hang', { ImageClass: FakeImage, timeout: 5 }), false);
  const controller = new AbortController(); controller.abort();
  assert.equal(await preloadMemoryImage('good', { signal: controller.signal, ImageClass: FakeImage }), false);
  const checked = await prepareMemoryImages([{ id: 1, image: 'https://good' }, { id: 2, image: 'https://bad' }], { ImageClass: FakeImage });
  assert.equal(checked.length, 1);
});

test('daily practice is deterministic, uses Vietnam date and cannot be promoted to a ranked result', () => {
  assert.equal(vietnamDay(new Date('2026-10-14T18:00:00Z')), '2026-10-15');
  const first = createGame({ mode: 'daily', day: '2026-10-14', pairCount: 6 });
  const second = createGame({ mode: 'daily', day: '2026-10-14', pairCount: 6 });
  assert.deepEqual(first.cards.map((card) => card.key), second.cards.map((card) => card.key));
  assert.equal(first.verified, false);
  const ranked = dailyGameFromServer({ id: 'session', day: '2026-10-14', pair_count: 6, status: 'ready', turns: 0, matched: [], revealed: [], first: null, second: null, elapsed_ms: 0 });
  assert.equal(ranked.cards.some((card) => card.symbol), false);
  assert.equal(choose(ranked, 0), ranked);
  assert.equal(gameSnapshot(ranked), null);
});
