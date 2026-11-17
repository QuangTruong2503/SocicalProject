import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

async function rpc(name, params) {
  try {
    const { data, error } = await supabase.rpc(name, params);
    if (!error) return createServiceResult(data);
    if (['PGRST202', '42883', '42P01'].includes(error.code)) {
      return createServiceResult(null, 'Chưa cập nhật trung tâm Người dùng trên máy chủ. Cần áp dụng migration unified_user_management.');
    }
    if (['42501', '22023', 'P0002', '40001', '23514'].includes(error.code)) {
      return { ...createServiceResult(null, error.message), conflict: error.code === '40001' };
    }
    return createServiceResult(null, normalizeServiceError(error, 'Không tải hoặc lưu được dữ liệu người dùng.'));
  } catch (error) {
    return createServiceResult(null, normalizeServiceError(error, 'Không kết nối được máy chủ. Vui lòng thử lại.'));
  }
}

export function listManagedUsers({ limit = 50, offset = 0, ...filters } = {}) {
  return rpc('admin_user_directory', { p_filters: filters, p_limit: limit, p_offset: offset });
}
export const getManagedUser = (userId) => rpc('admin_user_detail', { p_user_id: userId });
export const getUserCenterStats = () => rpc('admin_user_center_stats', {});
export const listUserHistory = ({ limit = 50, offset = 0, ...filters } = {}) =>
  rpc('admin_user_history', { p_filters: filters, p_limit: limit, p_offset: offset });

export function permissionSnapshot(profile) {
  return {
    id: profile.id, role: profile.role || 'user', status: profile.status || 'active',
    direct_level: profile.direct_level || null, access_updated_at: profile.access_updated_at || null,
  };
}
export const saveUserPermissions = (profiles, level, note) => rpc('admin_user_set_access', {
  p_targets: profiles.map(permissionSnapshot), p_level: level || null, p_note: note.trim() || null,
});
export const saveUserQuota = (userId, expected, value) => rpc('admin_user_set_quota', {
  p_user_id: userId, p_expected: expected ?? null, p_value: value,
});
export function accountSnapshot(profile) {
  return Object.fromEntries(['role','status','is_verified','plan','credits','direct_level','access_updated_at'].map((key) => [key, profile[key] ?? null]));
}
export const saveManagedProfile = (profile, updates) => rpc('admin_user_update_profile', {
  p_user_id: profile.id,
  p_expected: accountSnapshot(profile),
  p_updates: updates,
});
export const saveUserStatuses = (profiles,status) => rpc('admin_user_bulk_status', {
  p_targets:profiles.map((profile) => ({ id:profile.id,...accountSnapshot(profile) })),p_status:status,
});
