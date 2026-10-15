const KINDS = ['standard','knm'];
const STATUSES = ['draft','created','sent','confirmed','cancelled'];
const SORTS = ['created_at','quotation_date','quotation_no','customer_name','total','deleted_at'];
export function readAdminQuotationFilters(params) {
  const kind = KINDS.includes(params.get('kind')) ? params.get('kind') : 'standard';
  const date = (key) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(key) ?? '') ? params.get(key) : '';
  const creator = params.get('creator') ?? '';
  return {
    kind, search: (params.get('q') ?? '').slice(0,200), status: kind === 'standard' && STATUSES.includes(params.get('status')) ? params.get('status') : '',
    from: date('from'), to: date('to'), creator: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creator) ? creator : '',
    deleted: params.get('view') === 'trash', sort: SORTS.includes(params.get('sort')) ? params.get('sort') : 'created_at',
    desc: params.get('dir') !== 'asc', page: Math.min(1000000, Math.max(0, parseInt(params.get('page'),10) - 1 || 0)),
  };
}
export function formatQuotationDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
}
export function quotationHref(row) {
  return row.kind === 'knm' ? `/bao-gia-knm/${row.id}/chinh-sua` : `/bao-gia-minh-triet/${row.id}/chinh-sua`;
}
export function adminQuotationReturnPath(value, fallback) {
  return typeof value === 'string' && /^\/admin\/quotations(?:\?[^#]*)?$/.test(value) ? value : fallback;
}
export function safeCsvText(value) {
  const text = String(value ?? '');
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}
export function csvQuotationRows(rows, statusLabels) {
  return rows.map((row) => [row.quotation_no,formatQuotationDate(row.quotation_date),row.customer_name,row.contact_name,row.phone,
    Number(row.total) || 0,row.creator_name,row.kind === 'knm' ? 'Không áp dụng' : statusLabels[row.status] ?? row.status,
    row.deleted_at ?? '',row.created_at].map((value) => typeof value === 'number' ? value : safeCsvText(value)));
}
