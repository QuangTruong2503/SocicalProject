import dayjs from 'dayjs';
import { KNM_VAT_MODES, KNM_VAT_OPTIONS, resolveValidUntil } from '../../utils/knmQuotation.js';

const VAT_MODE_HINTS = {
  included: 'Đơn giá đã bao gồm VAT.',
  common: 'Đơn giá chưa VAT, áp dụng một mức VAT cho tất cả sản phẩm.',
  per_item: 'Đơn giá chưa VAT, chọn mức VAT ở từng sản phẩm.',
};

export default function QuoteMetaForm({ quotation, onChange, styles }) {
  const patch = (name, value) => onChange({ ...quotation, [name]: value });
  const validUntil = resolveValidUntil(quotation.quotationDate, quotation.validityDays);

  return (
    <section className={styles.card}>
      <h2>Thông tin báo giá</h2>
      <div className={styles.grid}>
        <label className={styles.field}>
          Số báo giá
          <input value={quotation.quotationNo} onChange={(e) => patch('quotationNo', e.target.value)} />
        </label>
        <label className={styles.field}>
          Ngày báo giá
          <input type="date" value={quotation.quotationDate} onChange={(e) => patch('quotationDate', e.target.value)} />
        </label>
        <label className={styles.field}>
          Hiệu lực (số ngày)
          <input
            type="number"
            min="0"
            value={quotation.validityDays}
            onChange={(e) => patch('validityDays', Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className={styles.field}>
          Cách tính VAT
          <select value={quotation.vatMode} onChange={(e) => patch('vatMode', e.target.value)}>
            {KNM_VAT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>
        {quotation.vatMode === 'common' && (
          <label className={styles.field}>
            VAT chung
            <select value={quotation.vatRate} onChange={(e) => patch('vatRate', Number(e.target.value))}>
              {KNM_VAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className={styles.hint}>{VAT_MODE_HINTS[quotation.vatMode]}</p>
      <p className={styles.hint}>Hiệu lực đến ngày: <b>{dayjs(validUntil).format('DD/MM/YYYY')}</b></p>
    </section>
  );
}
