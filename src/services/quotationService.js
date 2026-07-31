import { supabase } from '../lib/supabase.js';

const quotationSelect = '*, quotation_items(*)';

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Không thể xử lý dữ liệu báo giá.');
  return data;
}

export async function getNextQuotationNumber(date) {
  return unwrap(await supabase.rpc('next_quotation_number', { p_date: date }));
}

export async function saveQuotation(payload) {
  return unwrap(await supabase.rpc('save_quotation', { p_payload: payload }));
}

export async function getQuotation(id) {
  return unwrap(await supabase.from('quotations').select(quotationSelect).eq('id', id).is('deleted_at', null).single());
}

export async function listQuotations(filters = {}) {
  let query = supabase.from('quotations')
    .select('id,quotation_no,quotation_date,customer_name,contact_name,phone,total,prepared_by_name,status,created_at,deleted_at', { count: 'exact' })
    .is('deleted_at', null).order('created_at', { ascending: false }).range(0, 199);
  const safeSearch = String(filters.search || '').replace(/[%(),.]/g, ' ').trim();
  if (safeSearch) query = query.or(`quotation_no.ilike.%${safeSearch}%,customer_name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('quotation_date', filters.from);
  if (filters.to) query = query.lte('quotation_date', filters.to);
  if (filters.staff) query = query.eq('prepared_by', filters.staff);
  return unwrap(await query);
}

export async function listCustomers(search = '') {
  let query = supabase.from('quotation_customers').select('*').is('deleted_at', null).order('name').limit(20);
  const safeSearch = String(search).replace(/[%(),.]/g, ' ').trim();
  if (safeSearch) query = query.or(`name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,tax_code.ilike.%${safeSearch}%`);
  return unwrap(await query);
}

export async function createCustomer(customer, userId) {
  return unwrap(await supabase.from('quotation_customers').insert({
    name: customer.customer_name.trim(), contact_name: customer.contact_name || null,
    phone: customer.phone || null, email: customer.email || null, address: customer.address || null,
    tax_code: customer.tax_code || null, created_by: userId,
  }).select().single());
}

export async function setQuotationStatus(id, status) {
  const update = { status, updated_at: new Date().toISOString() };
  if (status === 'cancelled') update.cancelled_at = new Date().toISOString();
  return unwrap(await supabase.from('quotations').update(update).eq('id', id).select().single());
}

export async function softDeleteDraft(id) {
  return unwrap(await supabase.from('quotations').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('status', 'draft').select().single());
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
