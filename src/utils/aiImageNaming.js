import {
  IMAGE_NAME_LIMITS,
  matchItemsById,
  slugifyFileName,
} from '../../supabase/functions/suggest-image-names/imageNaming.js';
import { getUniqueFileNames, normalizeImageName } from '../hooks/useWatermarkProcessor.js';
import { createThumbnailBlob } from './imageThumbnail.js';

export {
  DEFAULT_IMAGE_NAME_PROMPT,
  IMAGE_NAME_LIMITS,
  slugifyFileName,
} from '../../supabase/functions/suggest-image-names/imageNaming.js';

/** Images analysed per click; the rest wait for the next click. Matches the server's per-user window. */
export const AI_NAMING_RUN_LIMIT = 60;
export const AI_REQUEST_CONCURRENCY = 2;
/** Long edge of the copy sent to OpenAI. Fits "low" detail, so each image costs a few hundred tokens. */
export const AI_IMAGE_MAX_DIMENSION = 512;
const AI_IMAGE_QUALITY = 0.8;

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Extension of an exported result; the watermark engine writes JPEG. */
export function extensionForMimeType(type) {
  return EXTENSIONS[String(type || '').toLowerCase()] || 'jpg';
}

export function chunkArray(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const next = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, next));
}

/**
 * Re-validates a server response against the IDs that were sent: unknown and
 * duplicate IDs are ignored, IDs without a usable name count as failed.
 *
 * @param {string[]} requestedIds
 * @param {unknown} payload
 * @returns {{ suggestions: Map<string, { name: string, needsReview: boolean }>, failedIds: string[] }}
 */
export function parseSuggestionResponse(requestedIds, payload) {
  const { matched } = matchItemsById(requestedIds, payload?.items);
  const suggestions = new Map();

  for (const [id, item] of matched) {
    const name = slugifyFileName(typeof item.suggestedName === 'string' ? item.suggestedName : '');
    if (name) suggestions.set(id, { name, needsReview: item.needsReview === true });
  }

  return { suggestions, failedIds: requestedIds.filter((id) => !suggestions.has(id)) };
}

/**
 * Final file names for the results that get a new name: slug + extension of
 * the exported file, never empty, never equal to another result's name
 * (case-insensitive) — "-2", "-3"… are appended in result order.
 *
 * @param {Array<{ id: string, fileName: string, blob?: Blob }>} results
 * @param {Record<string, string>} draftNamesById base names typed/suggested in the dialog
 * @param {{ productName?: string }} [options]
 * @returns {Map<string, string>} result id → file name
 */
export function buildFinalFileNames(results, draftNamesById, { productName = '' } = {}) {
  const isRenamed = (result) => typeof draftNamesById[result.id] === 'string';
  const used = new Set(getUniqueFileNames(results.filter((result) => !isRenamed(result)))
    .map((name) => name.toLocaleLowerCase('vi')));
  const productSlug = slugifyFileName(productName, IMAGE_NAME_LIMITS.maxProductSlugLength) || 'anh-san-pham';
  const names = new Map();

  results.forEach((result, index) => {
    if (!isRenamed(result)) return;
    const extension = extensionForMimeType(result.blob?.type);
    const base = slugifyFileName(draftNamesById[result.id]) || `${productSlug}-${index + 1}`;
    let candidate = base;
    for (let suffix = 2; used.has(`${candidate}.${extension}`); suffix += 1) candidate = `${base}-${suffix}`;
    used.add(`${candidate}.${extension}`);
    names.set(result.id, `${candidate}.${extension}`);
  });

  return names;
}

/** The base name (without extension) shown in the "current name" column. */
export function currentBaseName(fileName) {
  return normalizeImageName(fileName).replace(/\.jpg$/i, '');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Không thể đọc ảnh.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Small JPEG data URL for analysis. Prefers the original (no logo covering the
 * product), falls back to the exported image. The exported file is untouched.
 *
 * @param {{ sourceFile?: Blob, blob?: Blob }} result
 */
export async function createAiImageDataUrl(result) {
  for (const source of [result.sourceFile, result.blob]) {
    if (!source) continue;
    try {
      return await blobToDataUrl(await createThumbnailBlob(source, AI_IMAGE_MAX_DIMENSION, AI_IMAGE_QUALITY));
    } catch {
      // Try the next source (e.g. HEIC originals outside Safari).
    }
  }
  throw new Error('Không đọc được ảnh để gửi phân tích.');
}

/**
 * What "Áp dụng tên" applied, per AI run (null = names typed without AI):
 * names kept exactly as suggested vs edited. Only for usage analytics — no API call.
 */
export function summarizeAppliedNames(ids, entries) {
  const groups = new Map();
  for (const id of ids) {
    const entry = entries[id];
    const runId = entry?.aiRunId || null;
    const group = groups.get(runId) || { aiRunId: runId, applied: 0, aiUnchanged: 0, edited: 0 };
    group.applied += 1;
    if (runId && entry.name === entry.aiName) group.aiUnchanged += 1;
    else group.edited += 1;
    groups.set(runId, group);
  }
  return [...groups.values()];
}
