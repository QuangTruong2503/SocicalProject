import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

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
