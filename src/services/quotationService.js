import { supabase } from '../lib/supabase.js';

// RPCs and policies live in supabase_quotation_v2.sql.
const quotationSelect = '*, quotation_items(*)';

const MISSING_RPC_MESSAGE = 'Chưa cập nhật SQL báo giá trên Supabase. Hãy chạy supabase_quotation_v2.sql.';
// Errors raised on purpose by the RPCs carry a Vietnamese message meant for the UI.
const USER_FACING_CODES = new Set(['40001', '42501', '22023', '23505', 'P0002']);

/** Error with a machine-readable `code`; 'conflict' means someone else saved first. */
export class QuotationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'QuotationError';
    this.code = code;
  }
}

function toError(error, fallback) {
  if (error?.code === 'PGRST202') return new QuotationError(MISSING_RPC_MESSAGE, 'missing_rpc');
  if (error?.code === '40001') return new QuotationError(error.message, 'conflict');
  if (USER_FACING_CODES.has(error?.code) && error?.message) return new QuotationError(error.message, error.code);
  return new QuotationError(error?.message || fallback, error?.code || 'unknown');
}

async function call(request, fallback) {
  const { data, error } = await request;
  if (error) throw toError(error, fallback);
  return data;
}

/**
 * Create (no id) or update a quotation. The number is assigned by the server on
 * first save. Pass the `updated_at` you loaded to detect concurrent edits; pass
 * null to overwrite on purpose.
 * @returns {Promise<{ id: string, quotation_no: string, quotation_date: string, status: string, updated_at: string, customer_id: string | null }>}
 */
export function saveQuotation(payload, expectedUpdatedAt = null) {
  return call(
    supabase.rpc('save_quotation_v2', { p_payload: payload, p_expected_updated_at: expectedUpdatedAt }),
    'Không thể lưu báo giá.',
  );
}

export function getQuotation(id) {
  return call(
    supabase.from('quotations').select(quotationSelect).eq('id', id).is('deleted_at', null).single(),
    'Không thể tải báo giá.',
  );
}

/**
 * @param {{ search?: string, status?: string, from?: string, to?: string, mine?: boolean, sort?: string, desc?: boolean, limit?: number, offset?: number }} [filters]
 * @returns {Promise<{ rows: Array<Object>, totalCount: number }>}
 */
export async function listQuotations({
  search = '', status = '', from = '', to = '', mine = false,
  sort = 'created_at', desc = true, limit = 50, offset = 0,
} = {}) {
  const rows = await call(supabase.rpc('list_quotations', {
    p_search: search.trim() || null,
    p_status: status || null,
    p_from: from || null,
    p_to: to || null,
    p_mine: mine,
    p_sort: sort,
    p_desc: desc,
    p_limit: limit,
    p_offset: offset,
  }), 'Không thể tải danh sách báo giá.');

  return { rows: rows ?? [], totalCount: Number(rows?.[0]?.total_count) || 0 };
}

export function getQuotationStats(mine = false) {
  return call(supabase.rpc('quotation_stats', { p_mine: mine }), 'Không thể tải thống kê báo giá.');
}

/** Any status → any status (owner/admin only). Recorded in the history. */
export function setQuotationStatus(id, status) {
  return call(supabase.rpc('set_quotation_status', { p_id: id, p_status: status }), 'Không thể đổi trạng thái báo giá.');
}

/** Soft-deletes a draft (owner/admin only). Other statuses must be cancelled instead. */
export function deleteQuotationDraft(id) {
  return call(supabase.rpc('delete_quotation_draft', { p_id: id }), 'Không thể xóa bản nháp.');
}

export async function searchCustomers(search) {
  if (String(search || '').trim().length < 2) return [];
  return (await call(supabase.rpc('search_quotation_customers', { p_search: search }), 'Không thể tìm khách hàng.')) ?? [];
}

export async function listQuotationHistory(id, limit = 30) {
  return (await call(
    supabase.from('quotation_audit_log')
      .select('id, actor_name, action, changes, created_at')
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })
      .limit(limit),
    'Không thể tải lịch sử thay đổi.',
  )) ?? [];
}

export function normalizeQuotation(record) {
  return {
    ...record,
    items: (record.quotation_items || []).sort((a, b) => a.position - b.position)
      .map((item) => ({
        ...item,
        product_name: item.product_name || item.description || '',
        description: item.product_name ? (item.description || '') : '',
        key: item.id,
      })),
  };
}
