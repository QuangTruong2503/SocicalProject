import { emptyDocument, normalizeDocument } from './memoryGame.js';

export const memoryStorageKey = (userId) => `memory-game:v2:${userId}`;

export function readMemoryDocument(userId, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return normalizeDocument(JSON.parse(target.getItem(memoryStorageKey(userId)) ?? 'null'));
  } catch {
    return emptyDocument();
  }
}

export function writeMemoryDocument(userId, document, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    target.setItem(memoryStorageKey(userId), JSON.stringify(document));
    return true;
  } catch {
    return false;
  }
}
