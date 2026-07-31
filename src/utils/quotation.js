import dayjs from 'dayjs';
import { numberToVietnamese } from './numberToVietnamese.js';

export const QUOTATION_STATUSES = {
  draft: 'Bản nháp',
  created: 'Đã tạo',
  sent: 'Đã gửi khách',
  confirmed: 'Khách đã xác nhận',
  cancelled: 'Đã hủy',
};

export const UNITS = ['Cái', 'Bộ', 'Máy', 'Chiếc', 'Hộp', 'Thùng', 'Cuộn', 'Mét', 'Kg', 'Gói', 'Cặp', 'Chai', 'Can', 'Bộ sản phẩm', 'Dịch vụ'];
export const DEFAULT_TERMS = {
  note: 'Giá đã bao gồm thuế VAT.',
  deliveryPlace: 'Chưa gồm phí vận chuyển nếu có.',
  deliveryTime: 'Giao hàng trong vòng 5–7 ngày kể từ ngày nhận đơn đặt hàng.',
  payment: 'Chuyển khoản. Thanh toán 100% ngay sau khi nhận được thông báo giao hàng.',
  quality: 'Hàng mới 100%.',
  validity: 'Trong vòng 10 ngày kể từ ngày báo giá.',
};

export const newItem = () => ({
  key: globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  product_id: '', product_code: '', product_name: '', description: '',
  brand: '', quantity: 1, unit: 'Cái', unit_price: 0,
});

export function emptyQuotation(profile = {}, user = {}) {
  const safeProfile = profile || {};
  const safeUser = user || {};
  return {
    id: '', quotation_no: '', quotation_date: dayjs().format('YYYY-MM-DD'),
    customer_id: '', customer_name: '', contact_name: '', phone: '', email: '',
    address: '', tax_code: '', note: '', discount_type: 'amount', discount_value: 0,
    shipping_fee: 0, vat_mode: 'included', status: 'draft', items: [newItem()],
    terms: { ...DEFAULT_TERMS },
    prepared_by_name: safeProfile.full_name || safeProfile.username || safeUser.email || '',
    prepared_by_phone: safeProfile.phone || '',
    prepared_by_email: safeProfile.email || safeUser.email || '',
  };
}

export function normalizeLocalQuotation(value, profile = {}, user = {}) {
  const base = emptyQuotation(profile, user);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const sourceItems = Array.isArray(value.items) && value.items.length ? value.items : base.items;
  return {
    ...base,
    ...value,
    terms: { ...DEFAULT_TERMS, ...(value.terms && typeof value.terms === 'object' ? value.terms : {}) },
    items: sourceItems.map((item) => ({
      ...newItem(),
      ...(item && typeof item === 'object' ? item : {}),
    })),
  };
}

export function calculateQuotation(data) {
  const vat = 0;
  const subtotal = (data.items || []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const price = Math.max(0, Number(item.unit_price) || 0);
    const lineSubtotal = quantity * price;
    return sum + lineSubtotal;
  }, 0);
  const rawDiscount = data.discount_type === 'percent'
    ? subtotal * Math.min(100, Math.max(0, Number(data.discount_value) || 0)) / 100
    : Math.max(0, Number(data.discount_value) || 0);
  const discount = Math.min(subtotal, rawDiscount);
  const shipping = Math.max(0, Number(data.shipping_fee) || 0);
  const total = Math.round(Math.max(0, subtotal + vat - discount + shipping));
  return { subtotal: Math.round(subtotal), discount: Math.round(discount), shipping: Math.round(shipping), vat: Math.round(vat), total, words: numberToVietnamese(total) };
}

export function validateQuotation(data, draft = false) {
  const errors = {};
  if (!data.customer_name?.trim()) errors.customer_name = 'Tên khách hàng là bắt buộc.';
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Email không đúng định dạng.';
  if (data.phone && !/^[+()0-9.\s-]{7,20}$/.test(data.phone)) errors.phone = 'Số điện thoại không đúng định dạng.';
  if (!/^BG-\d{8}-\d{4,}$/.test(data.quotation_no || '')) errors.quotation_no = 'Số báo giá phải theo dạng BG-YYYYMMDD-XXXX.';
  if (!draft && !(data.items || []).length) errors.items = 'Cần ít nhất một sản phẩm.';
  (data.items || []).forEach((item, index) => {
    if (!draft && !item.product_name?.trim()) errors[`item_${index}_product_name`] = 'Bắt buộc.';
    if (Number(item.quantity) <= 0) errors[`item_${index}_quantity`] = 'Phải > 0.';
    if (Number(item.unit_price) < 0) errors[`item_${index}_unit_price`] = 'Không được âm.';
  });
  return errors;
}

export function quotationPayload(data, status) {
  return {
    ...data, status,
    items: (data.items || []).filter((item) => item.product_name?.trim() || item.description?.trim()).map((item, index) => ({
      product_id: item.product_id || '', product_code: item.product_code || '',
      product_name: (item.product_name || item.description || '').trim(),
      description: (item.description || '').trim(), brand: item.brand || '', quantity: Number(item.quantity),
      unit: item.unit || 'Cái', unit_price: Number(item.unit_price), position: index + 1,
    })),
  };
}

export function fileSlug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}
