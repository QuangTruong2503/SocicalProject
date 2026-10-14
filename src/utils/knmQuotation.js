import dayjs from 'dayjs';

export const KNM_UNITS = ['Cái', 'Bộ', 'Máy', 'Chiếc', 'Hộp', 'Thùng', 'Cuộn', 'Mét', 'Kg', 'Bình', 'Cặp', 'Khác'];

export const KNM_VAT_OPTIONS = [
  { value: 0, label: 'Không VAT' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 10, label: '10%' },
];

// included = Gồm VAT (đơn giá đã gồm VAT); common = Chia VAT (một mức VAT chung, quotation.vatRate);
// per_item = Chia VAT từng sản phẩm (mỗi item.vatRate riêng).
export const KNM_VAT_MODES = [
  { value: 'included', label: 'Gồm VAT' },
  { value: 'common', label: 'Chia VAT' },
  { value: 'per_item', label: 'Chia VAT từng sản phẩm' },
];

export const KNM_DEFAULT_ITEM_VAT_RATE = 8;

export const KNM_DEFAULT_VALIDITY_DAYS = 7;

export const KNM_DEFAULT_TERMS = [
  'Báo giá có hiệu lực trong 07 ngày kể từ ngày phát hành.',
  'Thời gian giao hàng được xác nhận theo tình trạng hàng thực tế.',
  'Bảo hành áp dụng theo chính sách của nhà sản xuất hoặc nhà cung cấp đối với từng sản phẩm.',
  'Điều kiện thanh toán được hai bên xác nhận khi chốt đơn hàng.',
].map((line, index) => `${index + 1}. ${line}`).join('\n');

export const KNM_DEFAULT_COMPANY = {
  name: 'CÔNG TY CỔ PHẦN ĐẦU TƯ QUỐC TẾ KỶ NGUYÊN MỚI',
  taxCode: '0314608832',
  address: '18 Đường số 77, Phường Tân Hưng, TP Hồ Chí Minh, Việt Nam',
  hotline: '0888.571.179',
  email: 'himarketvn@gmail.com',
  website: 'himarket.vn',
  bankName: 'Ngân hàng TMCP Ngoại thương Việt Nam - Chi nhánh TP.Hồ Chí Minh',
  bankAccountNumber: '1051617979',
  bankAccountHolder: 'CÔNG TY CP ĐẦU TƯ QUỐC TẾ KỶ NGUYÊN MỚI',
  preparerName: '',
  preparerTitle: '',
  showStamp: true,
  showLogo: true,
  logo: '',
  logoName: '',
  stamp: '',
  stampName: '',
  bankQr: '',
  bankQrName: '',
};

export function newKnmItem() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    description: '',
    brand: '',
    quantity: 1,
    unit: 'Cái',
    customUnit: '',
    unitPrice: 0,
    // Set when the price was typed VAT-inclusive with "Tự động chia VAT": the net price is derived from it.
    grossUnitPrice: null,
    vatRate: KNM_DEFAULT_ITEM_VAT_RATE,
  };
}

export function emptyKnmCustomer() {
  return { name: '', contact: '', phone: '', email: '', taxCode: '', address: '' };
}

export function createDraftKnmQuotation() {
  const today = dayjs().format('YYYY-MM-DD');
  return {
    quotationNo: '',
    quotationDate: today,
    validityDays: KNM_DEFAULT_VALIDITY_DAYS,
    vatMode: 'included',
    vatRate: 8,
    autoSplitVat: false,
    customer: emptyKnmCustomer(),
    items: [newKnmItem()],
    terms: KNM_DEFAULT_TERMS,
  };
}

// Báo giá lưu trước khi có vatMode luôn lưu đơn giá chưa VAT + một mức VAT chung → mở lại ở chế độ 'common'.
export function normalizeKnmQuotation(saved) {
  if (!saved || typeof saved !== 'object') return {};
  const rest = { ...saved };
  delete rest.vatInclusiveInput;
  rest.vatMode = KNM_VAT_MODES.some((mode) => mode.value === rest.vatMode) ? rest.vatMode : 'common';
  if (Array.isArray(rest.items)) rest.items = rest.items.map((item) => ({ ...item, vatRate: knmItemVatRate(item) }));
  return rest;
}

export function resolveValidUntil(quotationDate, validityDays) {
  const days = Math.max(0, Number(validityDays) || 0);
  return dayjs(quotationDate).add(days, 'day').format('YYYY-MM-DD');
}

export function resolveKnmUnit(item) {
  return item.unit === 'Khác' ? (item.customUnit || '').trim() : item.unit;
}

const isKnmVatRate = (rate) => KNM_VAT_OPTIONS.some((option) => option.value === rate);

export function knmItemVatRate(item) {
  const rate = Number(item?.vatRate);
  return item?.vatRate !== '' && item?.vatRate != null && isKnmVatRate(rate) ? rate : KNM_DEFAULT_ITEM_VAT_RATE;
}

/** VAT rate that applies to this item under the quotation's VAT mode (0 for "Gồm VAT"). */
export function knmItemRate(item, quotation) {
  const vatMode = quotation?.vatMode || 'included';
  if (vatMode === 'per_item') return knmItemVatRate(item);
  if (vatMode === 'common') return Math.max(0, Number(quotation?.vatRate) || 0);
  return 0;
}

const hasGross = (item) => item?.grossUnitPrice !== null && item?.grossUnitPrice !== undefined && item.grossUnitPrice !== ''
  && Number.isFinite(Number(item.grossUnitPrice));

/**
 * Price shown in the "Đơn giá" column: the net price in the split modes, the
 * VAT-inclusive price in "Gồm VAT". Items typed VAT-inclusive keep that price as
 * the source of truth, so changing the rate re-derives the net price — rounded to
 * whole đồng, so đơn giá × số lượng = thành tiền on the quotation.
 */
export function knmUnitPrice(item, quotation) {
  if (!hasGross(item)) return Math.max(0, Number(item?.unitPrice) || 0);
  const gross = Math.max(0, Number(item.grossUnitPrice));
  const rate = knmItemRate(item, quotation);
  return rate ? Math.round(gross / (1 + rate / 100)) : gross;
}

/** VAT-inclusive unit price (what "Tự động chia VAT" lets the user type). */
export function knmGrossUnitPrice(item, quotation) {
  if (hasGross(item)) return Math.max(0, Number(item.grossUnitPrice));
  const rate = knmItemRate(item, quotation);
  return Math.max(0, Number(item?.unitPrice) || 0) * (1 + rate / 100);
}

export function knmLineAmount(item, quotation) {
  const amount = Math.max(0, Number(item?.quantity) || 0) * knmUnitPrice(item, quotation);
  return hasGross(item) ? Math.round(amount) : amount;
}

/**
 * @returns {{ vatMode: string, subtotal: number, vatLines: { rate: number, base: number, amount: number }[],
 *   vatAmount: number, total: number }} vatLines: một dòng "VAT x%" cho mỗi thuế suất, giảm dần.
 */
export function calculateKnmTotals(quotation) {
  const vatMode = quotation?.vatMode || 'included';
  // Per rate: amounts typed without VAT, and items typed VAT-inclusive ("Tự động chia VAT"):
  // their rounded net lines go into the subtotal and their VAT is what is left of the typed
  // total, so the quotation ends on the very total the user entered.
  const groups = new Map();
  (quotation?.items || []).forEach((item) => {
    const rate = knmItemRate(item, quotation);
    const group = groups.get(rate) || { net: 0, grossLines: 0, grossTotal: 0 };
    const quantity = Math.max(0, Number(item.quantity) || 0);
    if (hasGross(item)) {
      group.grossLines += knmLineAmount(item, quotation);
      // Rounded per line like the net line, so VAT is never negative (e.g. VAT 0%, half quantities).
      group.grossTotal += Math.round(quantity * Math.max(0, Number(item.grossUnitPrice)));
    } else {
      group.net += quantity * Math.max(0, Number(item.unitPrice) || 0);
    }
    groups.set(rate, group);
  });
  // Làm tròn theo từng nhóm thuế suất: VAT = round(tổng gồm VAT) − round(tổng chưa VAT).
  const lines = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([rate, { net, grossLines, grossTotal }]) => {
    const netBase = Math.round(net);
    const netVat = Math.round(net * (1 + rate / 100)) - netBase;
    return { rate, base: netBase + grossLines, amount: netVat + grossTotal - grossLines };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.base, 0);
  const vatLines = vatMode === 'included' ? [] : lines;
  const vatAmount = vatLines.reduce((sum, line) => sum + line.amount, 0);
  if (vatMode === 'common' && !vatLines.length) vatLines.push({ rate: Math.max(0, Number(quotation.vatRate) || 0), base: 0, amount: 0 });
  return { vatMode, subtotal, vatLines, vatAmount, total: subtotal + vatAmount };
}

/** A row nobody filled in (left over from "Thêm sản phẩm"): skipped on save, print and validation. */
export function isBlankKnmItem(item) {
  return !String(item?.description || '').trim() && !String(item?.brand || '').trim()
    && !(Number(item?.unitPrice) > 0) && !(Number(item?.grossUnitPrice) > 0);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @returns {{ customerName?: string, customerEmail?: string, items?: string, itemErrors?: Record<string, string> }}
 */
export function validateKnmQuotation(quotation) {
  const errors = {};
  const customer = quotation?.customer || {};
  if (!String(customer.name || '').trim()) errors.customerName = 'Tên khách hàng là bắt buộc.';
  if (String(customer.email || '').trim() && !EMAIL_PATTERN.test(String(customer.email).trim())) {
    errors.customerEmail = 'Email chưa đúng định dạng.';
  }
  const items = (quotation?.items || []).filter((item) => !isBlankKnmItem(item));
  if (!items.length) errors.items = 'Cần ít nhất một sản phẩm có tên.';
  const itemErrors = {};
  items.forEach((item) => {
    if (!String(item.description || '').trim()) itemErrors[item.id] = 'Thiếu tên sản phẩm.';
    else if (!(Number(item.quantity) > 0)) itemErrors[item.id] = 'Số lượng phải lớn hơn 0.';
    else if (item.unit === 'Khác' && !String(item.customUnit || '').trim()) itemErrors[item.id] = 'Nhập đơn vị tính.';
  });
  if (Object.keys(itemErrors).length) errors.itemErrors = itemErrors;
  return errors;
}

/** The quotation as it is stored and printed: blank rows dropped, net price kept in sync. */
export function finalizeKnmQuotation(quotation) {
  return {
    ...quotation,
    items: (quotation.items || []).filter((item) => !isBlankKnmItem(item)).map((item) => ({
      ...item,
      unitPrice: hasGross(item) ? knmUnitPrice(item, quotation) : item.unitPrice,
    })),
  };
}

const KNM_SNAPSHOT_COMPANY_FIELDS = [
  'name', 'taxCode', 'address', 'hotline', 'email', 'website', 'bankName', 'bankAccountNumber', 'bankAccountHolder',
  'preparerName', 'preparerTitle', 'showStamp', 'showLogo',
];

/** Comparable snapshot of what the user can change (for the "Chưa lưu" state and backups). */
export function knmEditableSnapshot(company, quotation) {
  const pickedCompany = {};
  KNM_SNAPSHOT_COMPANY_FIELDS.forEach((field) => { pickedCompany[field] = company?.[field] ?? ''; });
  // Blank rows and derived net prices don't count as changes.
  const items = (quotation?.items || []).filter((item) => !isBlankKnmItem(item))
    .map((item) => (hasGross(item) ? { ...item, unitPrice: undefined } : item));
  return JSON.stringify({ company: pickedCompany, quotation: { ...quotation, quotationNo: undefined, items } });
}

/** "Sao chép": same content, new ids, today's date, no number. */
export function copyKnmQuotationForNew(quotation) {
  return {
    ...quotation,
    quotationNo: '',
    quotationDate: dayjs().format('YYYY-MM-DD'),
    items: (quotation.items || []).map((item) => ({ ...item, id: newKnmItem().id })),
  };
}

const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

export function knmFileSlug(value) {
  return String(value || '').normalize('NFD').replace(DIACRITIC_MARKS, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
}
