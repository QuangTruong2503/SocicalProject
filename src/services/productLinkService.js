import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

// Tables/RPCs are defined in supabase_product_links.sql.
const ITEMS = 'product_link_items';
const LOGS = 'product_link_logs';
const ITEM_SELECT = 'id, company_id, seq, code, links, note, is_done, done_by, done_by_name, done_at, is_pinned, pinned_by, pinned_by_name, pinned_at, created_by, created_at, updated_at';
const LOG_SELECT = 'id, company_id, user_id, actor_name, action, item_id, item_code, details, created_at';
const PAGE_SIZE = 1000;

export const ACCESS_LEVELS = {
  none: 0,
  viewer: 1,
  checker: 2,
  editor: 3,
};

export const ACCESS_LEVEL_OPTIONS = [
  { value: '', label: 'Không có quyền', hint: 'Không thấy trang' },
  { value: 'viewer', label: 'Xem & copy', hint: 'Xem danh sách, copy link' },
  { value: 'checker', label: 'Đánh dấu hoàn thành', hint: '+ Tick đã làm, ghim, sửa ghi chú' },
  { value: 'editor', label: 'Quản lý dữ liệu', hint: '+ Nhập file, thêm/sửa/xóa sản phẩm' },
];

function failure(error, fallback, scope) {
  console.error(`[productLinkService] ${scope} failed`, error);

  if (scope === 'listCompanies' && ['PGRST205', '42P01', '42703'].includes(error?.code)) {
    return createServiceResult(null, 'Chưa cập nhật dữ liệu công ty. Vui lòng liên hệ quản trị viên.');
  }
  if (error?.code === '23505') {
    return createServiceResult(null, 'Mã sản phẩm này đã tồn tại.');
  }
  if (error?.code === '42501') {
    return createServiceResult(null, error.message || 'Bạn không có quyền thực hiện thao tác này.');
  }
  // Validation errors raised on purpose by the RPCs carry a message meant for the UI.
  if (error?.code === '22023' && error.message) {
    return createServiceResult(null, error.message);
  }
  if (error?.code === 'PGRST202') {
    if (scope === 'import') return createServiceResult(null, 'Chưa cập nhật chức năng nhập dữ liệu theo công ty. Vui lòng liên hệ quản trị viên.');
    return createServiceResult(null, 'Chưa tạo RPC quản trị Link ảnh trên Supabase. Hãy chạy supabase_product_links_admin.sql.');
  }

  return createServiceResult(null, normalizeServiceError(error, fallback));
}

async function run(scope, fallback, request) {
  try {
    const { data, error } = await request();
    if (error) return failure(error, fallback, scope);
    return createServiceResult(data ?? null);
  } catch (error) {
    return failure(error, fallback, scope);
  }
}

/** @returns {Promise<import('./serviceHelpers.js').ServiceResult<number>>} 0 none … 3 editor */
export function getMyProductLinkLevel() {
  return run('getMyLevel', 'Không thể kiểm tra quyền truy cập.', () => supabase.rpc('product_links_level'));
}

export function listProductLinkCompanies() {
  return run('listCompanies', 'Không thể tải danh sách công ty.', () => supabase
    .from('product_link_companies').select('id, name, created_at').order('created_at').order('id'));
}

export function createProductLinkCompany(name) {
  return run('createCompany', 'Không thể thêm công ty.', async () => {
    const result = await supabase.from('product_link_companies')
      .insert({ name: name.trim().replace(/\s+/g, ' ') }).select('id, name, created_at').single();
    if (result.error?.code === '23505') return { data: null, error: { code: '22023', message: 'Tên công ty này đã tồn tại.' } };
    return result;
  });
}

export async function listProductLinkItems(companyId) {
  if (!companyId) return createServiceResult(null, 'Vui lòng chọn công ty.');
  try {
    const rows = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(ITEMS)
        .select(ITEM_SELECT)
        .eq('company_id', companyId)
        .order('seq', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) return failure(error, 'Không thể tải danh sách sản phẩm.', 'listItems');
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    return createServiceResult(rows);
  } catch (error) {
    return failure(error, 'Không thể tải danh sách sản phẩm.', 'listItems');
  }
}

export function setProductLinkDone(id, isDone) {
  return run('setDone', 'Không thể cập nhật trạng thái.', () => supabase
    .from(ITEMS).update({ is_done: isDone }).eq('id', id).select(ITEM_SELECT).single());
}

export function setProductLinkPinned(id, isPinned) {
  return run('setPinned', 'Không thể ghim sản phẩm.', () => supabase
    .from(ITEMS).update({ is_pinned: isPinned }).eq('id', id).select(ITEM_SELECT).single());
}

export function updateProductLinkNote(id, note) {
  return run('updateNote', 'Không thể lưu ghi chú.', () => supabase
    .from(ITEMS).update({ note: note?.trim() || null }).eq('id', id).select(ITEM_SELECT).single());
}

export function createProductLinkItem({ code, links, note, companyId }) {
  return run('createItem', 'Không thể thêm sản phẩm.', () => supabase
    .from(ITEMS).insert({ company_id: companyId, code, links, note: note?.trim() || null }).select(ITEM_SELECT).single());
}

export function updateProductLinkItem(id, { code, links, note }) {
  return run('updateItem', 'Không thể lưu sản phẩm.', () => supabase
    .from(ITEMS).update({ code, links, note: note?.trim() || null }).eq('id', id).select(ITEM_SELECT).single());
}

export function deleteProductLinkItem(id) {
  return run('deleteItem', 'Không thể xóa sản phẩm.', () => supabase.from(ITEMS).delete().eq('id', id));
}

/**
 * @param {Array<{ code: string, links: string[] }>} items
 * @param {'merge' | 'replace' | 'skip'} mode
 */
export function importProductLinks(items, mode, companyId) {
  return run('import', 'Không thể nhập dữ liệu.', () => supabase.rpc('product_links_import', {
    p_items: items,
    p_mode: mode,
    p_company_id: companyId,
  }));
}

/**
 * Activity feed for the product links page. Admin search/filters use adminListProductLinkLogs.
 * @param {{ limit?: number, beforeId?: number, action?: string, userId?: string }} [options]
 */
export function listProductLinkLogs({ companyId, limit = 50, beforeId, action, userId } = {}) {
  if (!companyId) return Promise.resolve(createServiceResult(null, 'Vui lòng chọn công ty.'));
  return run('listLogs', 'Không thể tải nhật ký.', () => {
    let query = supabase.from(LOGS).select(LOG_SELECT).eq('company_id', companyId).order('id', { ascending: false }).limit(limit);
    if (beforeId) query = query.lt('id', beforeId);
    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);

    return query;
  });
}

/** Best-effort: a failed copy log must never block copying. */
export async function logProductLinkCopy({ userId, actorName, item, details }) {
  const { error } = await supabase.from(LOGS).insert({
    user_id: userId,
    actor_name: actorName,
    action: 'copy',
    item_id: item.id,
    company_id: item.company_id,
    item_code: item.code,
    details,
  });
  if (error) console.warn('[productLinkService] logCopy failed', error);
}

/**
 * Live changes from other users. Returns an unsubscribe function.
 * @param {{ onItem: (event: string, row: Object) => void, onLog: (row: Object) => void }} handlers
 */
export function subscribeProductLinks({ companyId, onItem, onLog }) {
  const channel = supabase
    .channel(`product-links-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: ITEMS }, (payload) => {
      const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (payload.eventType === 'DELETE' || row.company_id === companyId) onItem(payload.eventType, row);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: LOGS }, (payload) => {
      if (payload.new.company_id === companyId) onLog(payload.new);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * New log entries only (for the admin log view). Returns an unsubscribe function.
 * @param {(row: Object) => void} onLog
 */
export function subscribeProductLinkLogs(onLog) {
  const channel = supabase
    .channel(`product-link-logs-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: LOGS }, (payload) => onLog(payload.new))
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Admin (RPCs in supabase_product_links_admin.sql) ─────────────────

/**
 * Users with their access level, filtered/sorted/paged server-side.
 * @param {{ search?: string, level?: string, status?: string, sort?: 'name' | 'level' | 'updated_at', desc?: boolean, limit?: number, offset?: number }} [options]
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<{ rows: Array<Object>, totalCount: number }>>}
 */
export async function adminListProductLinkAccess({
  search = '',
  level = '',
  status = '',
  sort = 'name',
  desc = false,
  limit = 50,
  offset = 0,
} = {}) {
  const result = await run('adminListAccess', 'Không thể tải danh sách phân quyền.', () => supabase.rpc('admin_product_link_access_list', {
    p_search: search.trim() || null,
    p_level: level || null,
    p_status: status || null,
    p_sort: sort,
    p_desc: desc,
    p_limit: limit,
    p_offset: offset,
  }));

  if (result.error) return result;

  const rows = result.data ?? [];
  return createServiceResult({ rows, totalCount: Number(rows[0]?.total_count) || 0 });
}

/**
 * Grant, change or revoke ('' level) access for one or many users. Admins are skipped server-side.
 * @param {string[]} userIds
 * @param {'' | 'viewer' | 'checker' | 'editor'} level
 * @returns {Promise<import('./serviceHelpers.js').ServiceResult<Array<{ user_id: string, level: string | null, granted_by: string | null, granted_by_name: string | null, updated_at: string | null }>>>}
 */
export function adminSetProductLinkAccess(userIds, level) {
  return run(
    'adminSetAccess',
    level ? 'Không thể cấp quyền.' : 'Không thể thu hồi quyền.',
    () => supabase.rpc('admin_product_link_set_access', { p_user_ids: userIds, p_level: level || null }),
  );
}

export function getAdminProductLinkStats() {
  return run('adminStats', 'Không thể tải thống kê.', () => supabase.rpc('admin_product_link_stats'));
}

/**
 * @param {{ search?: string, action?: string, userId?: string, from?: string | null, hideCopy?: boolean, beforeId?: number | null, limit?: number }} [options]
 */
export function adminListProductLinkLogs({
  search = '',
  action = '',
  userId = '',
  from = null,
  hideCopy = false,
  beforeId = null,
  limit = 50,
} = {}) {
  return run('adminListLogs', 'Không thể tải nhật ký.', () => supabase.rpc('admin_product_link_logs', {
    p_search: search.trim() || null,
    p_action: action || null,
    p_user_id: userId || null,
    p_from: from,
    p_hide_copy: hideCopy,
    p_before_id: beforeId,
    p_limit: limit,
  }));
}

/** People who acted in the last 90 days, newest first. */
export function adminListProductLinkLogActors() {
  return run('adminLogActors', 'Không thể tải danh sách người thực hiện.', () => supabase.rpc('admin_product_link_log_actors'));
}

/** Deletes "copy" log entries older than the 14-day retention. Returns the number removed. */
export function adminPurgeProductLinkCopyLogs() {
  return run('adminPurgeCopyLogs', 'Không thể dọn nhật ký.', () => supabase.rpc('admin_product_link_purge_copy_logs'));
}
