export function normalizeMemoryCards(cards) {
  const seenIds = new Set();
  const seenImages = new Set();
  if (!Array.isArray(cards)) return [];
  return cards.flatMap((card, index) => {
    const id = Number(card?.id ?? index + 1);
    const image = typeof card?.image === 'string' ? card.image.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !/^https?:\/\//.test(image)
      || seenIds.has(id) || seenImages.has(image)) return [];
    seenIds.add(id);
    seenImages.add(image);
    return [{
      id, image, name: String(card.name || card.title || `Ảnh số ${id}`).slice(0, 200),
      created_at: card.created_at ?? null,
    }];
  });
}

export function preloadMemoryImage(src, { signal, timeout = 5000, ImageClass = globalThis.Image } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted || !ImageClass) return resolve(false);
    const image = new ImageClass();
    let timer;
    const finish = (valid) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      image.onload = image.onerror = null;
      if (!valid) image.src = '';
      resolve(valid);
    };
    const abort = () => finish(false);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(false), timeout);
    image.src = src;
  });
}

export async function prepareMemoryImages(cards, options = {}) {
  const normalized = normalizeMemoryCards(cards);
  const valid = [];
  // Bound concurrent image requests; loading only updates the next-game catalog.
  for (let offset = 0; offset < normalized.length && !options.signal?.aborted; offset += 8) {
    const batch = normalized.slice(offset, offset + 8);
    const checks = await Promise.all(batch.map((card) => preloadMemoryImage(card.image, options)));
    batch.forEach((card, index) => { if (checks[index]) valid.push(card); });
  }
  return valid;
}
