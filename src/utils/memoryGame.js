export const PAIR_COUNTS = [4, 6, 8];
export const MISMATCH_DELAY = 850;
export const HISTORY_LIMIT = 50;

const makeSymbols = (theme, entries) => entries.map(([symbol, name], index) => ({
  id: `${theme}-${index}`, symbol, name,
}));

export const CARD_THEMES = {
  animals: { name: 'Động vật', icon: '🐼', cards: makeSymbols('animals', [
    ['🐶', 'Chó'], ['🐱', 'Mèo'], ['🐼', 'Gấu trúc'], ['🦊', 'Cáo'],
    ['🐸', 'Ếch'], ['🦁', 'Sư tử'], ['🐵', 'Khỉ'], ['🐰', 'Thỏ'],
    ['🐨', 'Gấu túi'], ['🐯', 'Hổ'], ['🐷', 'Heo'], ['🐮', 'Bò'],
    ['🐙', 'Bạch tuộc'], ['🦋', 'Bướm'], ['🐢', 'Rùa'], ['🐧', 'Chim cánh cụt'],
  ]) },
  fruit: { name: 'Trái cây', icon: '🍓', cards: makeSymbols('fruit', [
    ['🍎', 'Táo'], ['🍐', 'Lê'], ['🍊', 'Cam'], ['🍋', 'Chanh'],
    ['🍌', 'Chuối'], ['🍉', 'Dưa hấu'], ['🍇', 'Nho'], ['🍓', 'Dâu tây'],
    ['🫐', 'Việt quất'], ['🍒', 'Anh đào'], ['🍑', 'Đào'], ['🥝', 'Kiwi'],
    ['🍍', 'Dứa'], ['🥭', 'Xoài'], ['🥥', 'Dừa'], ['🥑', 'Bơ'],
  ]) },
  travel: { name: 'Khám phá', icon: '🚀', cards: makeSymbols('travel', [
    ['🚀', 'Tên lửa'], ['🚲', 'Xe đạp'], ['🚗', 'Ô tô'], ['✈️', 'Máy bay'],
    ['🚁', 'Trực thăng'], ['⛵', 'Thuyền buồm'], ['🚂', 'Tàu hỏa'], ['🚌', 'Xe buýt'],
    ['🏰', 'Lâu đài'], ['⛺', 'Lều'], ['🗼', 'Tháp'], ['🏝️', 'Đảo'],
    ['🌋', 'Núi lửa'], ['🎡', 'Vòng quay'], ['🛸', 'Đĩa bay'], ['🌈', 'Cầu vồng'],
  ]) },
};

export function vietnamDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// Stable daily practice board. Ranked boards are generated and held by the server.
export function seededRandom(seed) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createGame({ theme = 'animals', pairCount = 4, source, mode = 'free', day = vietnamDay(), random = Math.random } = {}) {
  if (!PAIR_COUNTS.includes(pairCount)) throw new Error('Độ khó không hợp lệ.');
  const pool = source ?? CARD_THEMES[theme]?.cards;
  if (!pool || pool.length < pairCount) throw new Error('Chủ đề này chưa có đủ ảnh cho độ khó đã chọn.');
  const rng = mode === 'daily' ? seededRandom(`memory-v2:${day}`) : random;
  const selected = shuffle(pool, rng).slice(0, pairCount);
  const cards = shuffle(selected.flatMap((card) => [0, 1].map((copy) => ({
    ...card, pairId: String(card.id), key: `${card.id}:${copy}`, matched: false,
  }))), rng);
  return {
    version: 2, id: crypto.randomUUID(), theme, pairCount, mode,
    day: mode === 'daily' ? day : null, verified: false, cards,
    status: 'ready', turns: 0, first: null, second: null, lockUntil: 0,
    elapsedMs: 0, lastTick: null, event: null, completedAt: null,
  };
}

export function matchedPairs(game) {
  return game.cards.filter((card) => card.matched).length / 2;
}

function advanceTime(game, now) {
  if (game.status !== 'playing') return game;
  return { ...game, elapsedMs: game.elapsedMs + Math.max(0, now - (game.lastTick ?? now)), lastTick: now };
}

export function gameReducer(state, action) {
  if (action.type === 'new') return action.game;
  if (action.type === 'server') return action.game;
  if (action.type === 'restore') return { ...action.game, status: action.game.status === 'won' ? 'won' : 'paused', lastTick: null, first: null, second: null, lockUntil: 0 };
  if (action.type === 'image-error') {
    const pairIds = [...new Set(state.cards.map((card) => card.pairId))];
    const replacement = CARD_THEMES.animals.cards[pairIds.indexOf(action.pairId)];
    if (!replacement || !state.cards.some((card) => card.pairId === action.pairId && card.image)) return state;
    return { ...state, cards: state.cards.map((card) => card.pairId === action.pairId ? {
      ...card, image: undefined, symbol: replacement.symbol, name: replacement.name,
    } : card), event: { id: `image:${action.pairId}`, type: 'info', message: 'Một ảnh không tải được. Cả hai thẻ trong cặp đã được thay bằng cùng một biểu tượng.' } };
  }
  if (action.type === 'resume' && state.status === 'paused') return { ...state, status: 'playing', lastTick: action.now };
  if (action.type === 'pause' && state.status === 'playing') {
    return { ...advanceTime(state, action.now), status: 'paused', lastTick: null, first: null, second: null, lockUntil: 0 };
  }
  if (action.type === 'tick') {
    if (state.verified) return state;
    return advanceTime(state, action.now);
  }
  if (action.type === 'clear') {
    if (action.gameId !== state.id || state.second === null || !state.lockUntil || action.now < state.lockUntil) return state;
    return { ...state, first: null, second: null, lockUntil: 0 };
  }
  if (action.type !== 'choose' || state.verified || !['ready', 'playing'].includes(state.status)) return state;
  const card = state.cards[action.index];
  if (!card || card.matched || state.first === action.index || state.second !== null) return state;
  let next = advanceTime(state, action.now);
  if (next.status === 'ready') next = { ...next, status: 'playing', lastTick: action.now };
  if (next.first === null) return { ...next, first: action.index, event: null };
  const first = next.cards[next.first];
  const matched = first.pairId === card.pairId;
  next = { ...next, turns: next.turns + 1, second: action.index };
  if (!matched) return { ...next, lockUntil: action.now + MISMATCH_DELAY, event: { id: next.turns, type: 'mismatch', message: 'Chưa khớp. Hãy nhớ vị trí hai thẻ này.' } };
  const cards = next.cards.map((item, index) => index === next.first || index === action.index ? { ...item, matched: true } : item);
  const won = cards.every((item) => item.matched);
  return {
    ...next, cards, first: null, second: null, lockUntil: 0,
    status: won ? 'won' : 'playing', lastTick: won ? null : next.lastTick,
    completedAt: won ? new Date(action.now).toISOString() : null,
    event: { id: next.turns, type: won ? 'win' : 'match', message: won ? 'Bạn đã tìm được tất cả các cặp!' : `Đã ghép ${cards.filter((item) => item.matched).length / 2}/${next.pairCount} cặp.` },
  };
}

export function scoreKey(game) {
  const mode = game.mode === 'daily' ? (game.verified ? 'ranked' : 'practice') : 'free';
  return `${mode}:${game.theme}:${game.pairCount}`;
}

export function isBetterScore(result, previous) {
  return !previous || result.turns < previous.turns || (result.turns === previous.turns && result.elapsedMs < previous.elapsedMs);
}

export function formatDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function gameResult(game) {
  return {
    id: game.id, theme: game.theme, pairCount: game.pairCount, mode: game.mode,
    day: game.day, verified: game.verified, turns: game.turns,
    elapsedMs: Math.round(game.elapsedMs), completedAt: game.completedAt,
  };
}

export function addResult(document, result) {
  if (document.history.some((item) => item.id === result.id)) return document;
  const key = scoreKey(result);
  const records = { ...document.records };
  if (isBetterScore(result, records[key])) records[key] = result;
  return { ...document, records, history: [result, ...document.history].slice(0, HISTORY_LIMIT) };
}

export function gameSnapshot(game) {
  // Daily competitive sessions are restored from the server, never from a client board.
  if (game.verified || game.status === 'won' || game.status === 'ready') return null;
  return { ...game, status: 'paused', lastTick: null, first: null, second: null, lockUntil: 0, event: null };
}

export function emptyDocument() {
  return { version: 2, records: {}, history: [], active: null, sound: false, updatedAt: 0 };
}

export function modelReducer(model, action) {
  if (action.type === 'document') return { ...model, document: action.document };
  if (action.type === 'merge-document') return { ...model, document: {
    ...mergeDocuments(model.document, action.document, model.document.active ?? action.document.active),
    updatedAt: Math.max(model.document.updatedAt, action.document.updatedAt) + 1,
  } };
  if (action.type === 'sound') return { ...model, document: { ...model.document, sound: action.value, updatedAt: Math.max(action.now, model.document.updatedAt + 1) } };
  const game = gameReducer(model.game, action);
  if (game === model.game) return model;
  let document = model.document;
  const newWin = game.status === 'won' && !document.history.some((item) => item.id === game.id);
  const newRecord = newWin && isBetterScore(gameResult(game), document.records[scoreKey(game)]);
  if (newWin) document = addResult(document, gameResult(game));
  // Keep a regular resumable game while viewing a competitive daily session.
  const active = game.verified ? document.active : gameSnapshot(game);
  document = { ...document, active, updatedAt: Math.max(action.now ?? Date.now(), document.updatedAt + 1) };
  return { game, document, newRecord: newWin ? newRecord : game.id === model.game.id ? model.newRecord : false };
}

function validResult(item) {
  return item && typeof item.id === 'string' && item.id.length <= 100
    && ['animals', 'fruit', 'travel', 'photos'].includes(item.theme)
    && ['free', 'daily'].includes(item.mode) && PAIR_COUNTS.includes(item.pairCount)
    && Number.isSafeInteger(item.turns) && item.turns >= item.pairCount && item.turns <= 10000
    && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs <= 604800000
    && Number.isFinite(Date.parse(item.completedAt));
}

export function validateSnapshot(value) {
  if (!value || value.version !== 2 || value.verified || !['free', 'daily'].includes(value.mode)
    || !PAIR_COUNTS.includes(value.pairCount) || !['animals', 'fruit', 'travel', 'photos'].includes(value.theme)
    || !Array.isArray(value.cards) || value.cards.length !== value.pairCount * 2
    || typeof value.id !== 'string' || value.id.length > 100
    || !Number.isSafeInteger(value.turns) || value.turns < 0 || value.turns > 10000
    || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || value.elapsedMs > 604800000) return null;
  const keys = new Set();
  const pairs = new Map();
  for (const card of value.cards) {
    if (!card || typeof card.key !== 'string' || card.key.length > 200 || keys.has(card.key)
      || typeof card.pairId !== 'string' || card.pairId.length > 100
      || typeof card.name !== 'string' || card.name.length > 200 || typeof card.matched !== 'boolean'
      || (card.symbol !== undefined && (typeof card.symbol !== 'string' || card.symbol.length > 16))
      || (card.image !== undefined && (typeof card.image !== 'string' || card.image.length > 2000))
      || (!card.symbol && !/^https?:\/\//.test(card.image ?? ''))) return null;
    keys.add(card.key);
    const pair = pairs.get(card.pairId) ?? [];
    pair.push(card);
    pairs.set(card.pairId, pair);
  }
  if (pairs.size !== value.pairCount || [...pairs.values()].some((pair) => pair.length !== 2
    || pair[0].matched !== pair[1].matched || pair[0].symbol !== pair[1].symbol || pair[0].image !== pair[1].image)) return null;
  if (matchedPairs(value) > value.turns || value.cards.every((card) => card.matched)) return null;
  return { ...value, status: 'paused', first: null, second: null, lockUntil: 0, lastTick: null, event: null };
}

export function normalizeDocument(value) {
  const result = emptyDocument();
  if (!value || value.version !== 2) return result;
  result.sound = value.sound === true;
  result.updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
  result.active = validateSnapshot(value.active);
  const history = Array.isArray(value.history) ? value.history : [];
  result.history = [...new Map(history.filter(validResult).map((item) => [item.id, gameResult(item)])).values()]
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)).slice(0, HISTORY_LIMIT);
  for (const item of [...Object.values(value.records ?? {}), ...result.history].filter(validResult)) {
    const key = scoreKey(item);
    if (isBetterScore(item, result.records[key])) result.records[key] = gameResult(item);
  }
  return result;
}

export function mergeDocuments(local, remote, active = local.active) {
  const combined = normalizeDocument({
    ...local, history: [...local.history, ...remote.history],
    records: { ...local.records }, active,
  });
  for (const [key, record] of Object.entries(remote.records)) {
    if (isBetterScore(record, combined.records[key])) combined.records[key] = record;
  }
  return combined;
}

export function dailyGameFromServer(payload, now = Date.now()) {
  const faces = new Map((payload.revealed ?? []).map((face) => [face.index, CARD_THEMES.animals.cards[face.symbol_id]]));
  const cards = Array.from({ length: payload.pair_count * 2 }, (_, index) => ({
    key: `${payload.id}:${index}`, pairId: faces.get(index)?.id ?? null,
    ...faces.get(index), matched: payload.matched.includes(index),
  }));
  const won = payload.status === 'won';
  return {
    version: 2, id: payload.id, theme: 'animals', pairCount: payload.pair_count,
    mode: 'daily', day: payload.day, verified: true, cards,
    status: payload.status, turns: payload.turns, first: payload.first,
    second: payload.second, lockUntil: payload.lock_ms ? now + payload.lock_ms : 0,
    elapsedMs: payload.elapsed_ms, lastTick: won ? null : now,
    completedAt: payload.completed_at,
    event: payload.outcome ? { id: `${payload.turns}:${payload.first}:${payload.second}:${payload.outcome}`, type: payload.outcome, message: won ? 'Bạn đã hoàn thành thử thách hôm nay!' : payload.outcome === 'match' ? `Đã ghép ${payload.matched.length / 2}/${payload.pair_count} cặp.` : 'Chưa khớp. Hãy nhớ vị trí hai thẻ này.' } : null,
  };
}
