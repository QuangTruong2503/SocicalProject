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

/**
 * @returns {{ vatMode: string, subtotal: number, vatLines: { rate: number, base: number, amount: number }[],
 *   vatAmount: number, total: number }} vatLines: một dòng "VAT x%" cho mỗi thuế suất, giảm dần.
 */
export function calculateKnmTotals(quotation) {
  const vatMode = quotation?.vatMode || 'included';
  const bases = new Map();
  (quotation?.items || []).forEach((item) => {
    const amount = Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0);
    const rate = vatMode === 'per_item' ? knmItemVatRate(item)
      : vatMode === 'common' ? Math.max(0, Number(quotation.vatRate) || 0) : 0;
    bases.set(rate, (bases.get(rate) || 0) + amount);
  });
  // Làm tròn theo từng nhóm thuế suất: VAT = round(base × (1 + r)) − round(base).
  const groups = [...bases.entries()].sort((a, b) => b[0] - a[0]).map(([rate, base]) => {
    const roundedBase = Math.round(base);
    return { rate, base: roundedBase, amount: Math.round(base * (1 + rate / 100)) - roundedBase };
  });
  const subtotal = groups.reduce((sum, group) => sum + group.base, 0);
  const vatLines = vatMode === 'included' ? [] : groups;
  const vatAmount = vatLines.reduce((sum, line) => sum + line.amount, 0);
  if (vatMode === 'common' && !vatLines.length) vatLines.push({ rate: Math.max(0, Number(quotation.vatRate) || 0), base: 0, amount: 0 });
  return { vatMode, subtotal, vatLines, vatAmount, total: subtotal + vatAmount };
}

const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

export function knmFileSlug(value) {
  return String(value || '').normalize('NFD').replace(DIACRITIC_MARKS, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
}
