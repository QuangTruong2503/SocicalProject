import dayjs from 'dayjs';
import { KNM_VAT_OPTIONS, resolveValidUntil } from '../../utils/knmQuotation.js';

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
          VAT
          <select value={quotation.vatRate} onChange={(e) => patch('vatRate', Number(e.target.value))}>
            {KNM_VAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={quotation.vatInclusiveInput}
          onChange={(e) => patch('vatInclusiveInput', e.target.checked)}
        />
        Đơn giá nhập vào đã gồm VAT (tự động tách thành đơn giá chưa VAT)
      </label>
      <p className={styles.hint}>Hiệu lực đến ngày: <b>{dayjs(validUntil).format('DD/MM/YYYY')}</b></p>
    </section>
  );
}
