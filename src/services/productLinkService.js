import { supabase } from '../lib/supabase.js';
import { createServiceResult, normalizeServiceError } from './serviceHelpers.js';

// Tables/RPCs are defined in supabase_product_links.sql.
const ITEMS = 'product_link_items';
const LOGS = 'product_link_logs';
const ACCESS = 'product_link_access';
const ITEM_SELECT = 'id, seq, code, links, note, is_done, done_by, done_by_name, done_at, created_by, created_at, updated_at';
const LOG_SELECT = 'id, user_id, actor_name, action, item_id, item_code, details, created_at';
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
  { value: 'checker', label: 'Đánh dấu hoàn thành', hint: '+ Tick đã làm, sửa ghi chú' },
  { value: 'editor', label: 'Quản lý dữ liệu', hint: '+ Nhập file, thêm/sửa/xóa sản phẩm' },
];

function failure(error, fallback, scope) {
  console.error(`[productLinkService] ${scope} failed`, error);

  if (error?.code === '23505') {
    return createServiceResult(null, 'Mã sản phẩm này đã tồn tại.');
  }
  if (error?.code === '42501') {
    return createServiceResult(null, error.message || 'Bạn không có quyền thực hiện thao tác này.');
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

export async function listProductLinkItems() {
  try {
    const rows = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from(ITEMS)
        .select(ITEM_SELECT)
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

export function updateProductLinkNote(id, note) {
  return run('updateNote', 'Không thể lưu ghi chú.', () => supabase
    .from(ITEMS).update({ note: note?.trim() || null }).eq('id', id).select(ITEM_SELECT).single());
}

export function createProductLinkItem({ code, links, note }) {
  return run('createItem', 'Không thể thêm sản phẩm.', () => supabase
    .from(ITEMS).insert({ code, links, note: note?.trim() || null }).select(ITEM_SELECT).single());
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
export function importProductLinks(items, mode) {
  return run('import', 'Không thể nhập dữ liệu.', () => supabase.rpc('product_links_import', {
    p_items: items,
    p_mode: mode,
  }));
}

/**
 * @param {{ limit?: number, beforeId?: number, action?: string, userId?: string, search?: string }} [options]
 */
export function listProductLinkLogs({ limit = 50, beforeId, action, userId, search } = {}) {
  return run('listLogs', 'Không thể tải nhật ký.', () => {
    let query = supabase.from(LOGS).select(LOG_SELECT).order('id', { ascending: false }).limit(limit);
    if (beforeId) query = query.lt('id', beforeId);
    if (action) query = query.eq('action', action);
    if (userId) query = query.eq('user_id', userId);

    const safeSearch = String(search || '').replace(/[%(),.]/g, ' ').trim();
    if (safeSearch) query = query.or(`item_code.ilike.%${safeSearch}%,actor_name.ilike.%${safeSearch}%`);

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
    item_code: item.code,
    details,
  });
  if (error) console.warn('[productLinkService] logCopy failed', error);
}

/**
 * Live changes from other users. Returns an unsubscribe function.
 * @param {{ onItem: (event: string, row: Object) => void, onLog: (row: Object) => void }} handlers
 */
export function subscribeProductLinks({ onItem, onLog }) {
  const channel = supabase
    .channel(`product-links-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: ITEMS }, (payload) => {
      onItem(payload.eventType, payload.eventType === 'DELETE' ? payload.old : payload.new);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: LOGS }, (payload) => {
      onLog(payload.new);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Admin ────────────────────────────────────────────────────────────

export function listProductLinkAccess() {
  return run('listAccess', 'Không thể tải danh sách phân quyền.', () => supabase
    .from(ACCESS).select('user_id, level, granted_by, updated_at'));
}

/** @param {string} userId @param {'' | 'viewer' | 'checker' | 'editor'} level '' revokes access */
export function setProductLinkAccess(userId, level, grantedBy) {
  if (!level) {
    return run('revokeAccess', 'Không thể thu hồi quyền.', () => supabase.from(ACCESS).delete().eq('user_id', userId));
  }

  return run('grantAccess', 'Không thể cấp quyền.', () => supabase
    .from(ACCESS)
    .upsert({ user_id: userId, level, granted_by: grantedBy, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('user_id, level, granted_by, updated_at')
    .single());
}
