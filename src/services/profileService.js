import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const PROFILE_BASE_SELECT = [
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
// avatar_frame_id comes from the avatar_frames migration. Until it is applied the
// column is missing, so profile queries fall back to the base list instead of failing.
let hasAvatarFrameColumn = true;
// avatar_frame_id is not listed: users change it through set_my_avatar_frame().
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

function getProfileSelect() {
  return hasAvatarFrameColumn ? `${PROFILE_BASE_SELECT}, avatar_frame_id` : PROFILE_BASE_SELECT;
}

function isMissingAvatarFrameColumn(error) {
  return ['42703', 'PGRST204'].includes(error?.code) && String(error?.message ?? '').includes('avatar_frame_id');
}

/**
 * Runs a profiles query with the current select list, retrying once without
 * avatar_frame_id when that column does not exist yet. Postgres rejects such a
 * statement before running it, so retrying an insert/update is safe.
 * @param {(select: string) => PromiseLike<{ data: any, error: any }>} run
 */
async function withProfileSelect(run) {
  const result = await run(getProfileSelect());

  if (hasAvatarFrameColumn && isMissingAvatarFrameColumn(result.error)) {
    console.warn('[profileService] profiles.avatar_frame_id is missing; apply the avatar_frames migration.');
    hasAvatarFrameColumn = false;
    return run(getProfileSelect());
  }

  return result;
}

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

    const { data, error } = await withProfileSelect((select) => supabase
      .from('profiles')
      .select(select)
      .eq('id', userId)
      .maybeSingle());

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

    const { data, error } = await withProfileSelect((select) => supabase
      .from('profiles')
      .insert(payload)
      .select(select)
      .single());

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

        const { data: retryData, error: retryError } = await withProfileSelect((select) => supabase
          .from('profiles')
          .insert(retryPayload)
          .select(select)
          .single());

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

const ADMIN_RPC_MISSING_MESSAGE = 'Chưa cập nhật RPC quản trị trên Supabase. Hãy chạy lại supabase_admin_profiles_policies.sql.';
// Errors raised on purpose by the admin RPCs carry a Vietnamese message meant for the UI.
const ADMIN_RPC_USER_ERROR_CODES = new Set(['42501', '22023', 'P0002']);

function toAdminError(error, fallbackMessage) {
  if (error?.code === 'PGRST202') {
    return ADMIN_RPC_MISSING_MESSAGE;
  }

  if (ADMIN_RPC_USER_ERROR_CODES.has(error?.code) && error?.message) {
    return error.message;
  }

  return normalizeServiceError(error, fallbackMessage);
}

async function callAdminRpc(name, params, fallbackMessage) {
  try {
    const { data, error } = await supabase.rpc(name, params);

    if (error) {
      console.error(`[profileService] ${name} failed`, error);
      return createServiceResult(null, toAdminError(error, fallbackMessage));
    }

    return createServiceResult(data);
  } catch (error) {
    console.error(`[profileService] ${name} exception`, error);
    return createServiceResult(null, normalizeServiceError(error, fallbackMessage));
  }
}

/**
 * Admin-only: search, filter, sort and page profiles server-side.
 * Returns only the columns the admin table needs, plus the total match count.
 * @param {{
 *   search?: string, role?: string, status?: string, verified?: boolean | null, plan?: string,
 *   sort?: 'created_at' | 'last_login_at' | 'name' | 'email', desc?: boolean, limit?: number, offset?: number,
 * }} [options]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ rows: Array<Object>, totalCount: number }>>}
 */
export async function adminListProfiles({
  search = '',
  role = '',
  status = '',
  verified = null,
  plan = '',
  sort = 'created_at',
  desc = true,
  limit = 50,
  offset = 0,
} = {}) {
  const result = await callAdminRpc('admin_list_profiles', {
    p_search: String(search || '').trim() || null,
    p_role: role || null,
    p_status: status || null,
    p_verified: typeof verified === 'boolean' ? verified : null,
    // Sent only when set, so the list keeps working against an RPC without p_plan.
    ...(plan ? { p_plan: plan } : {}),
    p_sort: sort,
    p_desc: desc,
    p_limit: limit,
    p_offset: offset,
  }, 'Không thể tải danh sách người dùng.');

  if (result.error) {
    return result;
  }

  const rows = result.data ?? [];
  return createServiceResult({ rows, totalCount: Number(rows[0]?.total_count) || 0 });
}

/**
 * Admin-only: list profiles with search/role/status filters (first 1000 matches).
 * @param {{ search?: string, role?: string, status?: string }} [filters]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Array<Object>>>}
 */
export async function listProfiles(filters = {}) {
  const result = await adminListProfiles({ ...filters, limit: 1000 });
  return result.error ? result : createServiceResult(result.data.rows);
}

/**
 * Admin-only: counters for the summary tiles.
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ total: number, admins: number, suspended: number, verified: number, new_7d: number, active_7d: number }>>}
 */
export function getAdminProfileStats() {
  return callAdminRpc('admin_profile_stats', {}, 'Không thể tải thống kê người dùng.');
}

/**
 * Admin-only: lock/unlock many users at once (the caller is skipped server-side).
 * @param {string[]} userIds
 * @param {'active' | 'suspended'} status
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<number>>}
 */
export function adminBulkUpdateStatus(userIds, status) {
  return callAdminRpc('admin_bulk_update_status', {
    p_user_ids: userIds,
    p_status: status,
  }, 'Không thể cập nhật hàng loạt người dùng.');
}

/**
 * Admin-only: full profile of one user, for the detail panel.
 * @param {string} userId
 */
export async function getAdminProfileDetail(userId) {
  try {
    const { data, error } = await withProfileSelect((select) => supabase
      .from('profiles')
      .select(select)
      .eq('id', userId)
      .maybeSingle());

    if (error) {
      console.error('[profileService] getAdminProfileDetail failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải hồ sơ người dùng.'));
    }

    return createServiceResult(data);
  } catch (error) {
    console.error('[profileService] getAdminProfileDetail exception', error);
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải hồ sơ người dùng.'));
  }
}

/**
 * Admin-only: watermark / quotation / product-link usage of one user.
 * @param {string} userId
 */
export function getAdminUserActivity(userId) {
  return callAdminRpc('admin_user_activity', { p_user_id: userId }, 'Không thể tải hoạt động người dùng.');
}

/**
 * Admin-only: change history of one user from admin_audit_log.
 * @param {string} userId
 * @param {number} [limit]
 */
export async function listAdminAuditLog(userId, limit = 20) {
  try {
    const { data, error } = await supabase
      .from('admin_audit_log')
      .select('id, actor_id, actor_email, action, changes, created_at')
      .eq('target_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[profileService] listAdminAuditLog failed', error);
      return createServiceResult(null, normalizeServiceError(error, 'Không thể tải lịch sử thay đổi.'));
    }

    return createServiceResult(data ?? []);
  } catch (error) {
    console.error('[profileService] listAdminAuditLog exception', error);
    return createServiceResult(null, normalizeServiceError(error, 'Không thể tải lịch sử thay đổi.'));
  }
}

/**
 * Admin-only: change another user's role/status/is_verified/plan/credits via the
 * `admin_update_profile` RPC (regular table UPDATE is blocked for these columns by RLS).
 * @param {string} userId
 * @param {{ role?: string, status?: string, is_verified?: boolean, plan?: string, credits?: number }} updates
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Object>>}
 */
export function adminUpdateProfile(userId, updates = {}) {
  return callAdminRpc('admin_update_profile', {
    p_user_id: userId,
    p_role: updates.role ?? null,
    p_status: updates.status ?? null,
    p_is_verified: updates.is_verified ?? null,
    p_plan: updates.plan ?? null,
    p_credits: updates.credits ?? null,
  }, 'Không thể cập nhật người dùng.');
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

    const { data, error } = await withProfileSelect((select) => supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', userId)
      .select(select)
      .single());

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
