import { supabase } from '../lib/supabase.js';
import { pickCompanyInfo } from '../utils/knmStorage.js';

const TABLE = 'knm_quotations';
const listSelect = 'id,quotation_no,quotation_date,customer_name,customer_contact,customer_phone,customer_tax_code,total,created_at,updated_at';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Không thể xử lý dữ liệu báo giá KNM.');
  return data;
}

function toRow({ id, company, quotation, totals }) {
  const customer = quotation.customer || {};
  return {
    ...(id ? { id } : {}),
    quotation_no: quotation.quotationNo,
    quotation_date: quotation.quotationDate,
    customer_name: customer.name.trim(),
    customer_contact: customer.contact || null,
    customer_phone: customer.phone || null,
    customer_email: customer.email || null,
    customer_tax_code: customer.taxCode || null,
    customer_address: customer.address || null,
    subtotal: totals.subtotal,
    vat_rate: quotation.vatRate,
    vat_amount: totals.vatAmount,
    total: totals.total,
    company: pickCompanyInfo(company),
    quotation: {
      quotationNo: quotation.quotationNo,
      quotationDate: quotation.quotationDate,
      validityDays: quotation.validityDays,
      vatRate: quotation.vatRate,
      vatInclusiveInput: quotation.vatInclusiveInput,
      customer,
      items: quotation.items,
      terms: quotation.terms,
    },
  };
}

export async function saveKnmQuotation({ id, company, quotation, totals }) {
  const row = toRow({ id, company, quotation, totals });
  const data = unwrap(
    id
      ? await supabase.from(TABLE).update(row).eq('id', id).select().single()
      : await supabase.from(TABLE).insert(row).select().single(),
  );
  return data;
}

export async function getKnmQuotation(id) {
  return unwrap(await supabase.from(TABLE).select('*').eq('id', id).single());
}

export async function listKnmQuotations(filters = {}) {
  let query = supabase.from(TABLE).select(listSelect, { count: 'exact' })
    .order('created_at', { ascending: false }).range(0, 199);
  const safeSearch = String(filters.search || '').replace(/[%(),.]/g, ' ').trim();
  if (safeSearch) {
    query = query.or(
      `customer_name.ilike.%${safeSearch}%,customer_phone.ilike.%${safeSearch}%,customer_tax_code.ilike.%${safeSearch}%,quotation_no.ilike.%${safeSearch}%`,
    );
  }
  return unwrap(await query);
}

export async function deleteKnmQuotation(id) {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message || 'Không thể xóa báo giá.');
}
