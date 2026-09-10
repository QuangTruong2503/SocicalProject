import dayjs from 'dayjs';

export const KNM_UNITS = ['Cái', 'Bộ', 'Máy', 'Chiếc', 'Hộp', 'Thùng', 'Cuộn', 'Mét', 'Kg', 'Bình', 'Cặp', 'Khác'];

export const KNM_VAT_OPTIONS = [
  { value: 0, label: 'Không VAT' },
  { value: 5, label: '5%' },
  { value: 8, label: '8%' },
  { value: 10, label: '10%' },
];

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
  website: '',
  bankName: '',
  bankAccountNumber: '',
  bankAccountHolder: '',
  preparerName: '',
  preparerTitle: '',
  showStamp: true,
  logo: '',
  logoName: '',
  stamp: '',
  stampName: '',
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
    vatRate: 8,
    vatInclusiveInput: true,
    customer: emptyKnmCustomer(),
    items: [newKnmItem()],
    terms: KNM_DEFAULT_TERMS,
  };
}

export function resolveValidUntil(quotationDate, validityDays) {
  const days = Math.max(0, Number(validityDays) || 0);
  return dayjs(quotationDate).add(days, 'day').format('YYYY-MM-DD');
}

export function resolveKnmUnit(item) {
  return item.unit === 'Khác' ? (item.customUnit || '').trim() : item.unit;
}

export function toGrossUnitPrice(netPrice, vatRate) {
  const rate = Math.max(0, Number(vatRate) || 0);
  return Math.round((Math.max(0, Number(netPrice) || 0)) * (1 + rate / 100));
}

export function toNetUnitPrice(grossPrice, vatRate) {
  const rate = Math.max(0, Number(vatRate) || 0);
  return Math.round((Math.max(0, Number(grossPrice) || 0)) / (1 + rate / 100));
}

export function calculateKnmTotals(items, vatRate) {
  const subtotal = (items || []).reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    return sum + quantity * unitPrice;
  }, 0);
  const roundedSubtotal = Math.round(subtotal);
  const vatAmount = Math.round(roundedSubtotal * (Math.max(0, Number(vatRate) || 0) / 100));
  const total = roundedSubtotal + vatAmount;
  return { subtotal: roundedSubtotal, vatAmount, total };
}

const DIACRITIC_MARKS = new RegExp('[̀-ͯ]', 'g');

export function knmFileSlug(value) {
  return String(value || '').normalize('NFD').replace(DIACRITIC_MARKS, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
}
