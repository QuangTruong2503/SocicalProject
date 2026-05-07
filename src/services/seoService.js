import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const SEO_TABLE = 'seo_histories';

function normalizeSeoTags(seoTags) {
  if (!Array.isArray(seoTags)) {
    return [];
  }

  return seoTags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

export async function createSeoHistory({
  userId,
  title,
  seoCount,
  seoTags,
}) {
  console.debug('[seoService] createSeoHistory start', {
    userId,
    title,
    seoCount,
    seoTagsLength: Array.isArray(seoTags) ? seoTags.length : 0,
  });

  try {
    if (!userId) {
      return createServiceResult(null, 'Missing userId while creating SEO history.');
    }

    const payload = {
      user_id: userId,
      title: typeof title === 'string' ? title.trim() : '',
      seo_count: Number.isFinite(seoCount) ? seoCount : normalizeSeoTags(seoTags).length,
      seo_tags: normalizeSeoTags(seoTags),
    };

    if (!payload.title) {
      return createServiceResult(null, 'SEO history title is required.');
    }

    const { data, error } = await supabase
      .from(SEO_TABLE)
      .insert([payload])
      .select('id, user_id, title, seo_count, seo_tags, created_at')
      .single();

    if (error) {
      console.error('[seoService] createSeoHistory error', { error, payload });
      return createServiceResult(null, normalizeServiceError(error, 'Unable to save SEO history.'));
    }

    console.debug('[seoService] createSeoHistory success', { id: data?.id ?? null });
    return createServiceResult(data);
  } catch (error) {
    console.error('[seoService] createSeoHistory exception', { error });
    return createServiceResult(null, normalizeServiceError(error, 'Unable to save SEO history.'));
  }
}

export async function getSeoHistories({ userId, limit = 100, offset = 0 } = {}) {
  console.debug('[seoService] getSeoHistories start', { userId, limit, offset });

  try {
    if (!userId) {
      return createServiceResult([]);
    }

    const { data, error } = await supabase
      .from(SEO_TABLE)
      .select('id, user_id, title, seo_count, seo_tags, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[seoService] getSeoHistories error', { error, userId });
      return createServiceResult(null, normalizeServiceError(error, 'Unable to load SEO history.'));
    }

    console.debug('[seoService] getSeoHistories success', {
      userId,
      count: data?.length ?? 0,
    });
    return createServiceResult(data || []);
  } catch (error) {
    console.error('[seoService] getSeoHistories exception', { error, userId });
    return createServiceResult(null, normalizeServiceError(error, 'Unable to load SEO history.'));
  }
}

export async function deleteSeoHistory({ historyId, userId }) {
  console.debug('[seoService] deleteSeoHistory start', { historyId, userId });

  try {
    if (!historyId) {
      return createServiceResult(null, 'Missing historyId.');
    }

    if (!userId) {
      return createServiceResult(null, 'Missing userId.');
    }

    const { data, error } = await supabase
      .from(SEO_TABLE)
      .delete()
      .eq('id', historyId)
      .eq('user_id', userId)
      .select('id, user_id, title, seo_count, seo_tags, created_at')
      .single();

    if (error) {
      console.error('[seoService] deleteSeoHistory error', { error, historyId, userId });
      return createServiceResult(null, normalizeServiceError(error, 'Unable to delete SEO history.'));
    }

    console.debug('[seoService] deleteSeoHistory success', { historyId });
    return createServiceResult(data);
  } catch (error) {
    console.error('[seoService] deleteSeoHistory exception', { error, historyId, userId });
    return createServiceResult(null, normalizeServiceError(error, 'Unable to delete SEO history.'));
  }
}
