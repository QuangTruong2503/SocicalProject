import { ACCESS_LEVEL_OPTIONS } from '../../services/productLinkService.js';

export const USER_TABS = [
  { id: 'list', label: 'Danh sách người dùng' },
  { id: 'permissions', label: 'Phân quyền công cụ' },
  { id: 'audit', label: 'Nhật ký quản trị' },
];
export const USER_SECTIONS = [
  { id: 'overview', label: 'Tổng quan' }, { id: 'permissions', label: 'Quyền công cụ' },
  { id: 'quota', label: 'Gói & hạn mức' }, { id: 'history', label: 'Lịch sử' },
];
export const LEVEL_FILTERS = [
  { value: '', label: 'Tất cả quyền Link ảnh' }, { value: 'granted', label: 'Có quyền hiệu lực' },
  { value: 'none', label: 'Không có quyền hiệu lực' },
  ...ACCESS_LEVEL_OPTIONS.filter((option) => option.value), { value: 'admin', label: 'Kế thừa admin' },
];
export function levelLabel(level) {
  if (level === 'admin') return 'Toàn quyền';
  return ACCESS_LEVEL_OPTIONS.find((option) => option.value === (level || ''))?.label || level;
}
export function sourceLabel(profile) {
  return ({ blocked: 'Bị chặn do tài khoản đã khóa', admin: 'Kế thừa từ vai trò Quản trị viên',
    direct: 'Cấp trực tiếp', none: 'Chưa được cấp quyền' })[profile.permission_source] || 'Chưa tải được quyền';
}
export function activityLabel(profile, format) {
  if (!Object.hasOwn(profile, 'last_active_at')) return 'Chưa thu thập';
  return profile.last_active_at ? format(profile.last_active_at) : 'Chưa có bản ghi';
}
export const HISTORY_ACTIONS = {
  update_profile: 'Cập nhật tài khoản', grant: 'Cấp / đổi quyền', revoke: 'Thu hồi quyền',
  'user_quota.upsert': 'Đổi ngoại lệ AI', 'user_quota.delete': 'Xóa ngoại lệ AI',
  check: 'Đánh dấu', uncheck: 'Bỏ đánh dấu', pin: 'Ghim', unpin: 'Bỏ ghim', note: 'Ghi chú',
  create: 'Thêm sản phẩm', update: 'Sửa dữ liệu', delete: 'Xóa sản phẩm', import: 'Nhập file', copy: 'Sao chép link',
};
export const TOOL_LABELS = { account: 'Tài khoản', 'product-links': 'Link ảnh SP', ai: 'Hạn mức AI', ai_image_naming: 'Đặt tên AI', watermark: 'Watermark' };
