import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const PROFILE_SELECT = [
  'id',
  'username',
  'email',
  'full_name',
  'avatar_url',
  'phone',
  'bio',
  'date_of_birth',
  'gender',
  'country',
  'city',
  'address',
  'role',
  'status',
  'is_verified',
  'plan',
  'credits',
  'preferences',
  'social_links',
  'last_login_at',
  'created_at',
  'updated_at',
].join(', ');
const SAFE_PROFILE_UPDATE_FIELDS = new Set([
  'username',
  'email',
  'full_name',
  'avatar_url',
  'phone',
  'bio',
  'date_of_birth',
  'gender',
  'country',
  'city',
  'address',
  'preferences',
  'social_links',
]);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getUserMetadata(user) {
  return user?.user_metadata ?? {};
}

function getFallbackUsername(user, { unique = false } = {}) {
  const metadata = getUserMetadata(user);
  const baseUsername = (
    cleanString(metadata.user_name)
    || cleanString(metadata.preferred_username)
    || cleanString(metadata.username)
    || cleanString(user?.email?.split('@')[0])
    || 'user'
  );

  if (!unique) {
    return baseUsername;
  }

  return `${baseUsername}-${user.id.slice(0, 8)}`;
}

function getFullName(user) {
  const metadata = getUserMetadata(user);
  return cleanString(metadata.full_name) || cleanString(metadata.name);
}

function getAvatarUrl(user) {
  const metadata = getUserMetadata(user);
  return cleanString(metadata.avatar_url) || cleanString(metadata.picture);
}

function buildProfilePayload(user, overrides = {}) {
  return {
    id: user.id,
    email: cleanString(overrides.email) || cleanString(user.email) || '',
    username: cleanString(overrides.username) || getFallbackUsername(user),
    full_name: cleanString(overrides.full_name) || getFullName(user),
    avatar_url: cleanString(overrides.avatar_url) || getAvatarUrl(user),
  };
}

function buildMissingProfileUpdates(profile, user) {
  const candidate = buildProfilePayload(user);
  const updates = {};

  for (const key of ['email', 'username', 'full_name', 'avatar_url']) {
    if (!cleanString(profile?.[key]) && cleanString(candidate[key])) {
      updates[key] = candidate[key];
    }
  }

  return updates;
}

/**
 * @param {string} userId
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Object>>}
 */
export async function getProfile(userId) {
  try {
    console.debug('[profileService] getProfile start', { userId });

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[profileService] getProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải hồ sơ người dùng.'));
    }

    console.debug('[profileService] getProfile success', { userId, found: Boolean(data) });
    return createServiceResult(data ?? null);
  } catch (error) {
    const message = normalizeServiceError(error, 'Không thể tải hồ sơ người dùng.');
    console.error('[profileService] getProfile exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ username?: string | null, email?: string | null, full_name?: string | null, avatar_url?: string | null }} [overrides]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Object>>}
 */
export async function createProfile(user, overrides = {}) {
  try {
    const payload = buildProfilePayload(user, overrides);

    console.debug('[profileService] createProfile start', {
      userId: user.id,
      email: payload.email,
    });

    const { data, error } = await supabase
      .from('profiles')
      .insert(payload)
      .select(PROFILE_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        const existingProfileResult = await getProfile(user.id);

        if (existingProfileResult.data || existingProfileResult.error) {
          return existingProfileResult;
        }

        const retryPayload = {
          ...payload,
          username: getFallbackUsername(user, { unique: true }),
        };

        const { data: retryData, error: retryError } = await supabase
          .from('profiles')
          .insert(retryPayload)
          .select(PROFILE_SELECT)
          .single();

        if (!retryError) {
          return createServiceResult(retryData);
        }
      }

      console.error('[profileService] createProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tạo hồ sơ người dùng.'));
    }

    console.debug('[profileService] createProfile success', { userId: user.id });
    return createServiceResult(data);
  } catch (error) {
    const message = normalizeServiceError(error, 'Không thể tạo hồ sơ người dùng.');
    console.error('[profileService] createProfile exception', error);
    return createServiceResult(null, message);
  }
}

/**
 * @param {import('@supabase/supabase-js').User} user
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Object>>}
 */
export async function ensureProfile(user) {
  const profileResult = await getProfile(user.id);

  if (profileResult.error) {
    return profileResult;
  }

  if (!profileResult.data) {
    console.debug('[profileService] ensureProfile creating missing row', { userId: user.id });
    return createProfile(user);
  }

  const missingUpdates = buildMissingProfileUpdates(profileResult.data, user);

  if (Object.keys(missingUpdates).length === 0) {
    return profileResult;
  }

  console.debug('[profileService] ensureProfile filling empty fields', {
    userId: user.id,
    fields: Object.keys(missingUpdates),
  });

  return updateProfile(user.id, missingUpdates);
}

/**
 * @param {string} userId
 * @param {{ username?: string | null, email?: string | null, full_name?: string | null, avatar_url?: string | null }} updates
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Object>>}
 */
export async function updateProfile(userId, updates) {
  try {
    const safeUpdates = Object.entries(updates ?? {}).reduce((nextUpdates, [key, value]) => {
      if (SAFE_PROFILE_UPDATE_FIELDS.has(key)) {
        nextUpdates[key] = typeof value === 'string' ? cleanString(value) : value;
      }

      return nextUpdates;
    }, {});

    if (Object.keys(safeUpdates).length === 0) {
      return getProfile(userId);
    }

    console.debug('[profileService] updateProfile start', {
      userId,
      fields: Object.keys(safeUpdates),
    });

    const { data, error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .single();

    if (error) {
      console.error('[profileService] updateProfile failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể cập nhật hồ sơ người dùng.'));
    }

    console.debug('[profileService] updateProfile success', { userId });
    return createServiceResult(data);
  } catch (error) {
    const message = normalizeServiceError(error, 'Không thể cập nhật hồ sơ người dùng.');
    console.error('[profileService] updateProfile exception', error);
    return createServiceResult(null, message);
  }
}
