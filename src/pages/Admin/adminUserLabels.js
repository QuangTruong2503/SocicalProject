// Labels shared by the admin user list, edit modal and detail panel.
import { PLAN_OPTIONS, getPlanLabel } from '../../utils/userProfile.js';

export const ROLE_OPTIONS = [
  { value: 'user', label: 'Người dùng' },
  { value: 'admin', label: 'Quản trị viên' },
];

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'suspended', label: 'Đã khóa' },
];

export { PLAN_OPTIONS, getPlanLabel };

export const MAX_CREDITS = 1000000;

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((option) => [option.value, option.label]));
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label]));

const CHANGE_FIELD_LABELS = {
  role: 'Vai trò',
  status: 'Trạng thái',
  is_verified: 'Xác minh',
  plan: 'Gói',
  credits: 'Credits',
};

export function getRoleLabel(role) {
  return ROLE_LABELS[role || 'user'] || role;
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status || 'active'] || status;
}

export function getProfileName(profile) {
  return profile?.full_name || profile?.username || profile?.email || 'Người dùng';
}

export function getInitials(profile) {
  const parts = getProfileName(profile).split(/\s+/).filter(Boolean);

  if (parts.length > 1) {
    return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  }

  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

export function getChangeFieldLabel(field) {
  return CHANGE_FIELD_LABELS[field] || field;
}

export function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (field === 'role') return getRoleLabel(value);
  if (field === 'status') return getStatusLabel(value);
  if (field === 'plan') return getPlanLabel(value);
  if (field === 'is_verified') return value ? 'Đã xác minh' : 'Chưa xác minh';

  return String(value);
}

/** Changes that need an explicit confirmation before they are saved. */
export function isSensitiveChange(profile, updates) {
  return (updates.role !== undefined && updates.role !== (profile.role || 'user'))
    || updates.status === 'suspended';
}
