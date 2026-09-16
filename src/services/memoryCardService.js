import { supabase, supabaseConfig } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const MEMORY_CARDS_STORAGE_PREFIX = 'memory-cards';

/**
 * @typedef {Object} MemoryCard
 * @property {number} id
 * @property {string} image
 * @property {string} name
 * @property {string | null} created_at
 */

/**
 * @param {Array<{ id?: number, image?: string, created_at?: string | null, name?: string | null, title?: string | null }>} cards
 * @returns {MemoryCard[]}
 */
export function normalizeMemoryCards(cards) {
  return (cards ?? [])
    .filter((card) => card?.image)
    .map((card, index) => ({
      id: Number(card.id ?? index + 1),
      image: card.image,
      name: card.name ?? card.title ?? `memory-card-${card.id ?? index + 1}`,
      created_at: card.created_at ?? null,
    }));
}

/**
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<MemoryCard[]>>}
 */
export async function fetchPublicMemoryCards() {
  try {
    console.debug('[memoryCardService] fetchPublicMemoryCards start');

    const { data, error } = await supabase
      .from('memory_cards')
      .select('id, image, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[memoryCardService] fetchPublicMemoryCards failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to fetch public memory cards.'));
    }

    const normalizedCards = normalizeMemoryCards(data);
    console.debug('[memoryCardService] fetchPublicMemoryCards success', {
      count: normalizedCards.length,
    });

    return createServiceResult(normalizedCards);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to fetch public memory cards.');
    console.error('[memoryCardService] fetchPublicMemoryCards exception', error);
    return createServiceResult(null, message);
  }
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildMemoryCardStoragePath(fileName) {
  return `${MEMORY_CARDS_STORAGE_PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFileName(fileName)}`;
}

/**
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<MemoryCard[]>>}
 */
export async function listMemoryCardsAdmin() {
  try {
    const { data, error } = await supabase
      .from('memory_cards')
      .select('id, image, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[memoryCardService] listMemoryCardsAdmin failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to fetch memory cards.'));
    }

    return createServiceResult(normalizeMemoryCards(data));
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to fetch memory cards.');
    console.error('[memoryCardService] listMemoryCardsAdmin exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * Uploads a source image to storage and registers it as a memory card.
 * @param {{ file: File }} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<MemoryCard>>}
 */
export async function uploadMemoryCard({ file }) {
  let storagePath = null;

  try {
    if (!file) {
      return createServiceResult(null, 'Chua chon anh de tai len.');
    }

    storagePath = buildMemoryCardStoragePath(file.name);

    const { error: uploadError } = await supabase.storage
      .from(supabaseConfig.uploadBucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[memoryCardService] uploadMemoryCard storage upload failed', uploadError);
      return createServiceResult(null, normalizeServiceError(uploadError, 'Khong the tai anh len.'));
    }

    const { data: publicUrlData } = supabase.storage
      .from(supabaseConfig.uploadBucket)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    const { data, error } = await supabase
      .from('memory_cards')
      .insert({ image: imageUrl })
      .select('id, image, created_at')
      .single();

    if (error) {
      console.error('[memoryCardService] uploadMemoryCard insert failed', error);

      await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);

      return createServiceResult(null, normalizeServiceError(error, 'Khong the luu the bai vao he thong.'));
    }

    return createServiceResult(normalizeMemoryCards([data])[0]);
  } catch (error) {
    const message = normalizeServiceError(error, 'Khong the tai anh len.');
    console.error('[memoryCardService] uploadMemoryCard exception', error);

    if (storagePath) {
      await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);
    }

    return createServiceResult(null, message);
  }
}

function extractMemoryCardStoragePath(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${supabaseConfig.uploadBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch (error) {
    console.warn('[memoryCardService] Unable to parse storage path from image URL', { imageUrl, error });
    return null;
  }
}

/**
 * @param {{ id: number, image: string }} payload
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<null>>}
 */
export async function deleteMemoryCard({ id, image }) {
  try {
    if (!id) {
      return createServiceResult(null, 'Thieu id cua the bai can xoa.');
    }

    const { error } = await supabase
      .from('memory_cards')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[memoryCardService] deleteMemoryCard failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Khong the xoa the bai.'));
    }

    const storagePath = image ? extractMemoryCardStoragePath(image) : null;
    let warning = null;

    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from(supabaseConfig.uploadBucket)
        .remove([storagePath]);

      if (storageError) {
        warning = normalizeServiceError(storageError, 'Da xoa the bai, nhung khong the xoa anh trong storage.');
        console.warn('[memoryCardService] deleteMemoryCard storage cleanup warning', { id, storagePath, warning });
      }
    }

    return createServiceResult(null, null, warning);
  } catch (error) {
    const message = normalizeServiceError(error, 'Khong the xoa the bai.');
    console.error('[memoryCardService] deleteMemoryCard exception', error);
    return createServiceResult(null, message);
  }
}
