import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/numberFormat.js';
import { numberToVietnamese } from '../../utils/numberToVietnamese.js';
import { resolveKnmUnit, resolveValidUntil } from '../../utils/knmQuotation.js';
import styles from './QuotePreview.module.css';

export default function QuotePreview({ company, quotation }) {
  const { subtotal, vatAmount, total } = quotation.totals;
  const validUntil = resolveValidUntil(quotation.quotationDate, quotation.validityDays);
  const hasBankText = company.bankName && company.bankAccountNumber && company.bankAccountHolder;
  const hasBankQr = !!company.bankQr;

  return (
    <div className={styles.sheet}>
      <header className={styles.docHeader}>
        {company.logo
          ? <img className={styles.logo} src={company.logo} alt={`Logo ${company.name}`} />
          : <div className={styles.logoFallback}>KNM</div>}
        <div className={styles.companyInfo}>
          <h2>{company.name}</h2>
          <p>MST: {company.taxCode}</p>
          <p>Địa chỉ: {company.address}</p>
          <p>Hotline: {company.hotline} · Email: {company.email}{company.website ? ` · ${company.website}` : ''}</p>
        </div>
      </header>

      <div className={styles.titleBlock}>
        <h1>BÁO GIÁ</h1>
        <p className={styles.meta}>
          Số báo giá: <b>{quotation.quotationNo}</b> &nbsp;·&nbsp;
          Ngày báo giá: <b>{dayjs(quotation.quotationDate).format('DD/MM/YYYY')}</b> &nbsp;·&nbsp;
          Hiệu lực đến: <b>{dayjs(validUntil).format('DD/MM/YYYY')}</b>
        </p>
      </div>

      <section className={styles.customerBox}>
        <h3>THÔNG TIN KHÁCH HÀNG</h3>
        <div className={styles.customerGrid}>
          <p><b>Khách hàng / Công ty:</b> {quotation.customer.name || '—'}</p>
          <p><b>Người liên hệ:</b> {quotation.customer.contact || '—'}</p>
          <p><b>Điện thoại:</b> {quotation.customer.phone || '—'}</p>
          <p><b>Email:</b> {quotation.customer.email || '—'}</p>
          <p><b>Mã số thuế:</b> {quotation.customer.taxCode || '—'}</p>
          <p><b>Địa chỉ:</b> {quotation.customer.address || '—'}</p>
        </div>
      </section>

      <p className={styles.greeting}><b>Kính gửi Quý khách hàng,</b></p>
      <p className={styles.greeting}>
        {company.name} trân trọng gửi đến Quý khách bảng báo giá như sau:
      </p>

      <table className={styles.productTable}>
        <thead>
          <tr>
            <th className={styles.center}>STT</th>
            <th>Tên và mô tả sản phẩm</th>
            <th className={styles.center}>Thương hiệu</th>
            <th className={styles.center}>Số lượng</th>
            <th className={styles.center}>ĐVT</th>
            <th className={styles.right}>Đơn giá</th>
            <th className={styles.right}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item, index) => (
            <tr key={item.id}>
              <td className={styles.center}>{index + 1}</td>
              <td className={styles.left}>{item.description}</td>
              <td className={styles.center}>{item.brand}</td>
              <td className={styles.center}>{item.quantity}</td>
              <td className={styles.center}>{resolveKnmUnit(item)}</td>
              <td className={styles.right}>{formatCurrency(item.unitPrice)} ₫</td>
              <td className={styles.right}>{formatCurrency(Number(item.quantity) * Number(item.unitPrice))} ₫</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.totalsBlock}>
        <div className={styles.totalsRow}><span>Tạm tính</span><b>{formatCurrency(subtotal)} ₫</b></div>
        <div className={styles.totalsRow}><span>VAT {quotation.vatRate}%</span><b>{formatCurrency(vatAmount)} ₫</b></div>
        <div className={styles.totalsGrand}><span>TỔNG THANH TOÁN</span><b>{formatCurrency(total)} ₫</b></div>
        <p className={styles.words}>Bằng chữ: {numberToVietnamese(total)}</p>
      </div>

      <section className={styles.terms}>
        <h3>ĐIỀU KHOẢN &amp; GHI CHÚ</h3>
        <div className={styles.termsBody}>{quotation.terms}</div>
      </section>

      {(hasBankText || hasBankQr) && (
        <section className={styles.bankInfo}>
          <h3>THÔNG TIN NGÂN HÀNG</h3>
          <div className={styles.bankInfoRow}>
            {hasBankText && (
              <p>Ngân hàng: {company.bankName} · Số tài khoản: {company.bankAccountNumber} · Chủ tài khoản: {company.bankAccountHolder}</p>
            )}
            {hasBankQr && <img className={styles.bankQr} src={company.bankQr} alt="QR chuyển khoản ngân hàng" />}
          </div>
        </section>
      )}

      <p className={styles.closing}>Trân trọng kính chào Quý khách hàng.</p>

      <footer className={styles.signatures}>
        <div>
          <b>ĐẠI DIỆN KHÁCH HÀNG</b>
          <span>(Ký và ghi rõ họ tên)</span>
        </div>
        <div>
          <b>ĐẠI DIỆN CÔNG TY</b>
          <span>(Ký, ghi rõ họ tên và đóng dấu)</span>
          {company.showStamp && company.stamp && (
            <img className={styles.stamp} src={company.stamp} alt="Dấu mộc công ty" />
          )}
          {company.preparerName && (
            <em>{company.preparerName}{company.preparerTitle ? ` – ${company.preparerTitle}` : ''}</em>
          )}
        </div>
      </footer>
    </div>
  );
}
