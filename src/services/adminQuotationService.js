import { supabase } from '../lib/supabase.js';
import { deleteQuotationDraft, getQuotation, listQuotations, setQuotationStatus } from './quotationService.js';
import { deleteKnmQuotation, getKnmQuotation, listKnmQuotations } from './knmQuotationService.js';

export class AdminQuotationError extends Error {
  constructor(message, code) { super(message); this.name = 'AdminQuotationError'; this.code = code; }
}
const missingRpc = (error) => ['PGRST202','42883'].includes(error?.code);
function asError(error) {
  const messages = {
    '42501': 'Bạn không còn quyền quản trị đang hoạt động. Hãy kiểm tra lại tài khoản.',
    '40001': 'Báo giá đã thay đổi ở phiên khác. Hãy làm mới danh sách rồi kiểm tra lại.',
    'P0002': 'Không tìm thấy báo giá. Có thể báo giá đã được xóa ở phiên khác.',
    '22023': 'Thao tác hoặc bộ lọc không còn hợp lệ. Hãy kiểm tra và thử lại.',
  };
  return new AdminQuotationError(messages[error?.code] ?? 'Không thể kết nối dữ liệu báo giá. Hãy thử lại.', error?.code ?? 'network');
}
async function rpc(name, args, signal) {
  try {
    const request = supabase.rpc(name, args);
    return await (signal ? request.abortSignal(signal) : request);
  } catch (error) { throw asError(error); }
}
async function legacyRequest(request) {
  try { return await request(); } catch (error) { throw asError(error); }
}
export function normalizeAdminRow(row, kind) {
  return { ...row, kind, contact_name: row.contact_name ?? row.customer_contact ?? '',
    phone: row.phone ?? row.customer_phone ?? '', email: row.email ?? row.customer_email ?? '',
    tax_code: row.tax_code ?? row.customer_tax_code ?? '', creator_id: row.creator_id ?? row.prepared_by ?? row.created_by,
    creator_name: row.creator_name ?? row.prepared_by_name ?? row.created_by_name ?? '' };
}

export async function listAdminQuotations(filters, signal) {
  const { kind, search = '', status = '', from = '', to = '', creator = '', deleted = false,
    sort = 'created_at', desc = true, limit = 50, offset = 0 } = filters;
  const { data, error } = await rpc('admin_list_quotations', {
    p_kind: kind, p_search: search.trim() || null, p_status: kind === 'standard' ? status || null : null,
    p_from: from || null, p_to: to || null, p_creator: creator || null, p_deleted: deleted,
    p_sort: sort, p_desc: desc, p_limit: limit, p_offset: offset,
  }, signal);
  if (!error) return { rows: (data.rows ?? []).map((row) => normalizeAdminRow(row, kind)), totalCount: Number(data.total_count) || 0,
    summary: data.summary, creators: data.creators ?? [], enhanced: true };
  if (!missingRpc(error)) throw asError(error);
  // Existing installations remain usable before the additive migration is applied.
  // Never emulate creator/trash filters by filtering only one page on the client.
  if (deleted || creator || (kind === 'standard' && sort === 'customer_name')) throw new AdminQuotationError('Bộ lọc hoặc cách sắp xếp này chưa sẵn sàng. Hãy quay về danh sách đang dùng hoặc bỏ bộ lọc.', 'unsupported');
  const list = kind === 'standard' ? listQuotations : listKnmQuotations;
  const params = { search, status, from, to, sort: sort === 'deleted_at' ? 'created_at' : sort, desc, limit, offset, signal };
  let result = await legacyRequest(() => list(params));
  if (!result.rows.length && offset > 0) {
    const first = await legacyRequest(() => list({ ...params, limit: 1, offset: 0 }));
    result = { ...result, totalCount: first.totalCount };
  }
  return { ...result, rows: result.rows.map((row) => normalizeAdminRow(row, kind)), summary: null, creators: [], enhanced: false };
}

export async function getAdminQuotation(kind, id, signal) {
  const { data, error } = await rpc('admin_get_quotation', { p_kind: kind, p_id: id }, signal);
  if (!error) return data;
  if (!missingRpc(error)) throw asError(error);
  const record = await legacyRequest(() => kind === 'standard' ? getQuotation(id) : getKnmQuotation(id));
  const historyResult = await legacyRequest(() => supabase.from(kind === 'standard' ? 'quotation_audit_log' : 'knm_quotation_audit_log')
    .select('id,actor_name,action,changes,created_at').eq('quotation_id', id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50));
  return { record, history: historyResult.error ? [] : historyResult.data ?? [], historyError: Boolean(historyResult.error) };
}

export async function changeAdminQuotation(row, action, status, signal) {
  const { data, error } = await rpc('admin_change_quotation', {
    p_kind: row.kind, p_id: row.id, p_action: action, p_expected_updated_at: row.updated_at, p_status: status ?? null,
  }, signal);
  if (!error) return data;
  if (!missingRpc(error)) throw asError(error);
  if (action === 'restore') throw new AdminQuotationError('Khôi phục chưa sẵn sàng. Hãy thử lại sau.', 'unsupported');
  if (row.kind === 'knm') return legacyRequest(() => deleteKnmQuotation(row.id));
  return legacyRequest(() => action === 'delete' ? deleteQuotationDraft(row.id) : setQuotationStatus(row.id, status));
}
