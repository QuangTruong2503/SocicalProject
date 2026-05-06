import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string | null} username
 * @property {string | null} email
 * @property {string | null} created_at
 */

/**
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ username?: string | null, email?: string | null }} [overrides]
 * @returns {{ id: string, username: string, email: string, created_at: string }}
 */
function buildProfilePayload(user, overrides = {}) {
  const fallbackUsername = user.user_metadata?.username || user.email?.split('@')[0] || 'user';

  return {
    id: user.id,
    username: overrides.username ?? fallbackUsername,
    email: overrides.email ?? user.email ?? '',
    created_at: user.created_at || new Date().toISOString(),
  };
}

/**
 * @param {string} userId
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Profile>>}
 */
export async function getProfile(userId) {
  try {
    console.debug('[profileService] getProfile start', { userId });

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[profileService] getProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to fetch the profile.'));
    }

    console.debug('[profileService] getProfile success', { userId, found: Boolean(data) });
    return createServiceResult(data ?? null);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to fetch the profile.');
    console.error('[profileService] getProfile exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ username?: string | null, email?: string | null }} [overrides]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Profile>>}
 */
export async function upsertProfile(user, overrides = {}) {
  try {
    const payload = buildProfilePayload(user, overrides);

    console.debug('[profileService] upsertProfile start', {
      userId: user.id,
      username: payload.username,
    });

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select('id, username, email, created_at')
      .single();

    if (error) {
      console.error('[profileService] upsertProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to save the profile.'));
    }

    console.debug('[profileService] upsertProfile success', { userId: user.id });
    return createServiceResult(data);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to save the profile.');
    console.error('[profileService] upsertProfile exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {import('@supabase/supabase-js').User} user
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Profile>>}
 */
export async function ensureProfile(user) {
  const profileResult = await getProfile(user.id);

  if (profileResult.error) {
    return profileResult;
  }

  if (profileResult.data) {
    return profileResult;
  }

  console.debug('[profileService] ensureProfile creating missing row', { userId: user.id });
  return upsertProfile(user);
}

/**
 * @param {string} userId
 * @param {{ username?: string | null, email?: string | null }} updates
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Profile>>}
 */
export async function updateProfile(userId, updates) {
  try {
    console.debug('[profileService] updateProfile start', { userId, updates });

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('id, username, email, created_at')
      .single();

    if (error) {
      console.error('[profileService] updateProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Unable to update the profile.'));
    }

    console.debug('[profileService] updateProfile success', { userId });
    return createServiceResult(data);
  } catch (error) {
    const message = normalizeServiceError(error, 'Unable to update the profile.');
    console.error('[profileService] updateProfile exception', error);
    return createServiceResult(null, message);
  }
}
