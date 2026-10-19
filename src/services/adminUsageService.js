import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

const MIGRATION_MISSING_MESSAGE = 'Chưa áp dụng migration theo dõi sử dụng và phân quyền model (usage_ledger.sql, usage_admin.sql, ai_naming_plan_models.sql).';

/**
 * PGRST202: RPC not found (migration not applied). 42501: not an admin.
 * 22023/P0002 carry a Vietnamese validation message from the server.
 */
function toUsageError(error, fallbackMessage) {
  if (error?.code === 'PGRST202' || error?.code === '42883') return MIGRATION_MISSING_MESSAGE;
  if (error?.code === '42501') return 'Chỉ quản trị viên mới xem hoặc thay đổi được dữ liệu sử dụng.';
  if ((error?.code === '22023' || error?.code === 'P0002' || error?.code === '23514') && typeof error.message === 'string') {
    return error.code === '23514' ? 'Giá trị nằm ngoài giới hạn cho phép.' : error.message;
  }
  return normalizeServiceError(error, fallbackMessage);
}

async function callRpc(name, params, fallbackMessage) {
  try {
    const { data, error } = await supabase.rpc(name, params);
    if (error) {
      console.error(`[adminUsageService] ${name} error`, { code: error.code });
      return createServiceResult(null, toUsageError(error, fallbackMessage));
    }
    return createServiceResult(data);
  } catch (error) {
    console.error(`[adminUsageService] ${name} exception`, { name: error?.name });
    return createServiceResult(null, normalizeServiceError(error, fallbackMessage));
  }
}

/** Server-side filters: user (ID or email), visitor, feature, action, status, model, keyAlias, environment, requestId, operation. */
function cleanFilters(filters = {}) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, value.trim()]));
}

export function getUsageOverview({ from, to, filters }) {
  return callRpc('admin_usage_overview', { p_from: from, p_to: to, p_filters: cleanFilters(filters) }, 'Không tải được tổng quan sử dụng.');
}

export function listUsageActivity({ from, to, filters, cursor = null, limit = 50 }) {
  return callRpc('admin_usage_activity', { p_from: from, p_to: to, p_filters: cleanFilters(filters), p_cursor: cursor, p_limit: limit },
    'Không tải được nhật ký hoạt động.');
}

export function listAiUsageRequests({ from, to, filters, cursor = null, limit = 50 }) {
  return callRpc('admin_usage_requests', { p_from: from, p_to: to, p_filters: cleanFilters(filters), p_cursor: cursor, p_limit: limit },
    'Không tải được danh sách yêu cầu AI.');
}

export function getAiUsageRequestDetail(requestId) {
  return callRpc('admin_usage_request_detail', { p_request_id: requestId }, 'Không tải được chi tiết yêu cầu.');
}

export function getUsageOperation(id) {
  return callRpc('admin_usage_operation', { p_id: id }, 'Không tải được chi tiết thao tác.');
}

export function getUsageConfig() {
  return callRpc('admin_usage_config', {}, 'Không tải được cấu hình.');
}

/** settings.update, plan_models.update, plan_quota.upsert, user_quota.upsert/delete, budget.upsert/delete, price.add — audited server-side. */
export function changeUsageConfig(action, payload) {
  return callRpc('admin_usage_config_change', { p_action: action, p_payload: payload }, 'Không lưu được thay đổi.');
}

export function sweepStaleUsage() {
  return callRpc('admin_usage_sweep', {}, 'Không cập nhật được các yêu cầu treo.');
}
