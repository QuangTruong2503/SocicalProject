import { supabase } from '../lib/supabase.js';
import { pickCompanyInfo } from '../utils/knmStorage.js';
import { calculateKnmTotals, finalizeKnmQuotation } from '../utils/knmQuotation.js';

// Tables, RPCs and the "knm-assets" bucket live in supabase_knm_quotations_v2.sql.
const TABLE = 'knm_quotations';
const ASSET_BUCKET = 'knm-assets';
const MISSING_RPC_MESSAGE = 'Chưa cập nhật SQL báo giá KNM trên Supabase. Hãy chạy supabase_knm_quotations_v2.sql.';
// Errors raised on purpose by the RPCs carry a Vietnamese message meant for the UI.
const USER_FACING_CODES = new Set(['40001', '42501', '22023', 'P0002']);

export const KNM_ASSET_KINDS = ['logo', 'stamp', 'bank_qr'];
const ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ASSET_MAX_BYTES = 2 * 1024 * 1024;

/** Error with a machine-readable `code`; 'conflict' means someone else saved first. */
export class KnmQuotationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'KnmQuotationError';
    this.code = code;
  }
}

function toError(error, fallback) {
  if (error?.code === 'PGRST202' || error?.code === '42P01') return new KnmQuotationError(MISSING_RPC_MESSAGE, 'missing_rpc');
  if (error?.code === '40001') return new KnmQuotationError(error.message, 'conflict');
  if (USER_FACING_CODES.has(error?.code) && error?.message) return new KnmQuotationError(error.message, error.code);
  return new KnmQuotationError(error?.message || fallback, error?.code || 'unknown');
}

async function call(request, fallback) {
  const { data, error } = await request;
  if (error) throw toError(error, fallback);
  return data;
}

function toPayload({ id, company, quotation }) {
  const finalQuotation = finalizeKnmQuotation(quotation);
  const totals = calculateKnmTotals(finalQuotation);
  const customer = finalQuotation.customer || {};
  return {
    id: id || null,
    quotation_date: finalQuotation.quotationDate,
    customer_name: (customer.name || '').trim(),
    customer_contact: customer.contact || null,
    customer_phone: customer.phone || null,
    customer_email: customer.email || null,
    customer_tax_code: customer.taxCode || null,
    customer_address: customer.address || null,
    subtotal: totals.subtotal,
    vat_rate: finalQuotation.vatMode === 'common' ? finalQuotation.vatRate : 0,
    vat_amount: totals.vatAmount,
    total: totals.total,
    company: pickCompanyInfo(company),
    quotation: {
      quotationNo: finalQuotation.quotationNo || '',
      quotationDate: finalQuotation.quotationDate,
      validityDays: finalQuotation.validityDays,
      vatMode: finalQuotation.vatMode,
      vatRate: finalQuotation.vatRate,
      autoSplitVat: Boolean(finalQuotation.autoSplitVat),
      customer,
      items: finalQuotation.items,
      terms: finalQuotation.terms,
    },
  };
}

/**
 * Create (no id) or update. The number is assigned by the server on first save.
 * Pass the `updated_at` you loaded to detect concurrent edits; null overwrites on purpose.
 * @returns {Promise<{ id: string, quotation_no: string, quotation_date: string, created_by: string,
 *   created_by_name: string | null, updated_by_name: string | null, created_at: string, updated_at: string }>}
 */
export function saveKnmQuotation({ id, company, quotation }, expectedUpdatedAt = null) {
  return call(
    supabase.rpc('save_knm_quotation', { p_payload: toPayload({ id, company, quotation }), p_expected_updated_at: expectedUpdatedAt }),
    'Không thể lưu báo giá.',
  );
}

export async function getKnmQuotation(id) {
  const data = await call(
    supabase.from(TABLE).select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    'Không thể tải báo giá.',
  );
  if (!data) throw new KnmQuotationError('Không tìm thấy báo giá (có thể đã bị xóa).', 'P0002');
  return data;
}

/**
 * @param {{ search?: string, from?: string, to?: string, mine?: boolean, sort?: string, desc?: boolean, limit?: number, offset?: number }} [filters]
 * @returns {Promise<{ rows: Array<Object>, totalCount: number }>}
 */
export async function listKnmQuotations({
  search = '', from = '', to = '', mine = false, sort = 'created_at', desc = true, limit = 50, offset = 0,
} = {}) {
  const rows = await call(supabase.rpc('list_knm_quotations', {
    p_search: search.trim() || null,
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

/** @returns {Promise<{ total: number, mine: number, month_count: number, month_value: number }>} */
export function getKnmQuotationStats() {
  return call(supabase.rpc('knm_quotation_stats'), 'Không thể tải thống kê báo giá.');
}

/** Soft delete (creator or admin). */
export function deleteKnmQuotation(id) {
  return call(supabase.rpc('delete_knm_quotation', { p_id: id }), 'Không thể xóa báo giá.');
}

// ─── Shared company assets ───────────────────────────────────────────────────

const assetCache = new Map(); // path → Promise<{ url, name }>

/**
 * Logo / stamp / bank QR shared by everyone. Images are downloaded with the user's
 * session (the bucket is private) and turned into object URLs, cached per path.
 * @returns {Promise<Record<'logo' | 'stamp' | 'bank_qr', { url: string, name: string, path: string } | null>>}
 */
export async function loadKnmCompanyAssets() {
  const rows = await call(supabase.from('knm_company_assets').select('kind, path, file_name'), 'Không thể tải logo, dấu mộc.');
  const result = { logo: null, stamp: null, bank_qr: null };
  await Promise.all((rows ?? []).map(async (row) => {
    if (!assetCache.has(row.path)) {
      assetCache.set(row.path, supabase.storage.from(ASSET_BUCKET).download(row.path).then(({ data, error }) => {
        if (error || !data) throw new KnmQuotationError('Không tải được ảnh công ty.', 'download');
        return URL.createObjectURL(data);
      }));
    }
    try {
      result[row.kind] = { url: await assetCache.get(row.path), name: row.file_name || '', path: row.path };
    } catch {
      assetCache.delete(row.path);
    }
  }));
  return result;
}

function extensionOf(file) {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(file.name || '')?.[1];
  return (fromName || file.type.split('/')[1] || 'png').toLowerCase();
}

/** Admin only: upload a new image and point the asset at it; the previous file is removed. */
export async function uploadKnmCompanyAsset(kind, file) {
  if (!KNM_ASSET_KINDS.includes(kind)) throw new KnmQuotationError('Loại ảnh không hợp lệ.', '22023');
  if (!ASSET_TYPES.includes(file.type)) throw new KnmQuotationError('Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF.', '22023');
  if (file.size > ASSET_MAX_BYTES) throw new KnmQuotationError('Ảnh tối đa 2MB.', '22023');

  const path = `${kind}/${globalThis.crypto?.randomUUID?.() || Date.now()}.${extensionOf(file)}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    throw new KnmQuotationError(
      /row-level security|unauthorized|403/i.test(error.message || '') ? 'Chỉ quản trị viên được đổi ảnh công ty.' : (error.message || 'Không tải được ảnh lên.'),
      'upload',
    );
  }
  let previous;
  try {
    previous = await call(supabase.rpc('set_knm_company_asset', { p_kind: kind, p_path: path, p_file_name: file.name || null }), 'Không lưu được ảnh.');
  } catch (setError) {
    await supabase.storage.from(ASSET_BUCKET).remove([path]);
    throw setError;
  }
  if (previous) await supabase.storage.from(ASSET_BUCKET).remove([previous]);
}

/** Admin only: remove the asset (the quotation then prints without it). */
export async function clearKnmCompanyAsset(kind) {
  const previous = await call(supabase.rpc('set_knm_company_asset', { p_kind: kind, p_path: null }), 'Không xóa được ảnh.');
  if (previous) await supabase.storage.from(ASSET_BUCKET).remove([previous]);
}
