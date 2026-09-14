import { forwardRef, useRef } from 'react';
import dayjs from 'dayjs';
import { FaEnvelope, FaGlobe, FaLocationDot, FaPhone } from 'react-icons/fa6';
import { formatCurrency } from '../../utils/numberFormat.js';
import { TERM_LABELS } from '../../utils/quotation.js';
import styles from '../../pages/Quotation/Quotation.module.css';
import { quotationCompany } from '../../data/quotationCompany.js';
import productStyles from '../../pages/Quotation/QuotationProduct.module.css';

function setRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

function computeValidUntil(quotation) {
  const match = String(quotation.terms?.validity || '').match(/(\d+)\s*ngày/i);
  if (!match) return null;
  const days = Number(match[1]);
  return { date: dayjs(quotation.quotation_date).add(days, 'day').format('DD/MM/YYYY'), days };
}

const PrintInvoice = forwardRef(function PrintInvoice({
  quotation, summary, preview = false,
  stamp, stampPosition, stampEditable = false, onStampDrag, onStampDragEnd,
}, ref) {
  const containerRef = useRef(null);
  const footerRef = useRef(null);
  const draggingRef = useRef(false);

  const handlePointerDown = (event) => {
    if (!stampEditable) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!draggingRef.current || !footerRef.current) return;
    const rect = footerRef.current.getBoundingClientRect();
    const x = Math.min(150, Math.max(-50, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(400, Math.max(-200, ((event.clientY - rect.top) / rect.height) * 100));
    onStampDrag?.({ x, y });
  };

  const handlePointerUp = (event) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onStampDragEnd?.();
  };

  const validUntil = computeValidUntil(quotation);
  const quotationDateText = dayjs(quotation.quotation_date).format('DD/MM/YYYY');

  return <div
    ref={(node) => { containerRef.current = node; setRef(ref, node); }}
    className={`${styles.printSheet} ${preview ? styles.previewSheet : ''}`}
  >
    <header className={styles.invoiceHeader}>
      <div className={styles.invoiceHeaderLeft}>
        <img className={styles.invoiceLogo} src={quotationCompany.logo} alt="Logo công ty"/>
        <div className={styles.invoiceCompanyBlock}>
          <h1>{quotationCompany.name}</h1>
          <p>{quotationCompany.address}</p>
          <p>MST: {quotationCompany.taxCode} &nbsp;|&nbsp; Điện thoại: {quotationCompany.phone}</p>
          <p>Email: {quotationCompany.email}</p>
        </div>
      </div>
      <div className={styles.invoiceTagline}>
        {quotationCompany.tagline.split('\n').map((line) => <div key={line}>{line}</div>)}
      </div>
    </header>

    <div className={styles.invoiceTitleRow}>
      <div className={styles.invoiceTitleBlock}>
        <h2 className={styles.invoiceTitle}>BÁO GIÁ</h2>
        <p>
          Cảm ơn Quý khách đã quan tâm đến sản phẩm của chúng tôi.<br/>
          Chúng tôi xin trân trọng gửi đến Quý khách bảng báo giá chi tiết như sau:
        </p>
      </div>
      <div className={styles.invoiceMetaPanel}>
        <div className={styles.invoiceMetaRow}><span>Số báo giá</span><b>{quotation.quotation_no}</b></div>
        <div className={styles.invoiceMetaRow}><span>Ngày báo giá</span><b>{quotationDateText}</b></div>
        <div className={styles.invoiceMetaRow}>
          <span>Hiệu lực đến</span>
          <b>{validUntil ? `${validUntil.date} (${validUntil.days} ngày)` : (quotation.terms?.validity || '—')}</b>
        </div>
      </div>
    </div>

    <div className={styles.invoiceInfoGrid}>
      <div className={styles.infoCard}>
        <div className={styles.infoCardHeader}>THÔNG TIN KHÁCH HÀNG</div>
        <div className={styles.infoCardBody}>
          <div className={styles.infoRow}><span>Tên công ty</span><b>{quotation.customer_name}</b></div>
          <div className={styles.infoRow}><span>Mã số thuế</span><b>{quotation.tax_code || '—'}</b></div>
          <div className={styles.infoRow}><span>Địa chỉ</span><b>{quotation.address || '—'}</b></div>
          <div className={styles.infoRow}><span>Người liên hệ</span><b>{quotation.contact_name || 'Anh/Chị mua hàng'}</b></div>
          <div className={styles.infoRow}><span>Điện thoại</span><b>{quotation.phone || '—'}</b></div>
          <div className={styles.infoRow}><span>Email</span><b>{quotation.email || '—'}</b></div>
        </div>
      </div>
      <div className={styles.infoCard}>
        <div className={styles.infoCardHeader}>THÔNG TIN BÁO GIÁ</div>
        <div className={styles.infoCardBody}>
          <div className={styles.infoRow}><span>Người lập</span><b>{quotation.prepared_by_name || '—'}</b></div>
          <div className={styles.infoRow}><span>Điện thoại</span><b>{quotation.prepared_by_phone || '—'}</b></div>
          <div className={styles.infoRow}><span>Ngày báo giá</span><b>{quotationDateText}</b></div>
          <div className={styles.infoRow}><span>Số báo giá</span><b>{quotation.quotation_no}</b></div>
        </div>
      </div>
    </div>

    <div className={styles.invoiceTableWrap}>
      <table className={styles.invoiceTable}>
        <thead>
          <tr>
            <th>STT</th><th>MÔ TẢ SẢN PHẨM</th><th>THƯƠNG HIỆU</th><th>SỐ LƯỢNG</th><th>ĐVT</th>
            <th>ĐƠN GIÁ (VND)</th><th>THÀNH TIỀN (VND)</th>
          </tr>
        </thead>
        <tbody>
          {quotation.items.map((item, index) => <tr key={item.key || item.id}>
            <td>{index + 1}</td>
            <td className={productStyles.printDescription}>
              <strong>{item.product_name || item.description}</strong>
              {item.description && <><br/><span>{item.description}</span></>}
            </td>
            <td>{item.brand}</td>
            <td>{item.quantity}</td>
            <td>{item.unit}</td>
            <td>{formatCurrency(item.unit_price)}</td>
            <td>{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan="6" className={styles.invoiceTotalLabel}>TỔNG CỘNG ĐÃ GỒM VAT</td>
            <td className={styles.invoiceTotalValue}>{formatCurrency(summary.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div className={styles.invoiceTermsSection}>
      <h3>ĐIỀU KHOẢN &amp; THÔNG TIN BỔ SUNG</h3>
      <ol className={styles.invoiceTermsList}>
        {Object.entries(TERM_LABELS).map(([key, label], index) => (
          <li key={key}>
            <span className={styles.termBadge}>{index + 1}</span>
            <div><b>{label}:</b> {quotation.terms?.[key] || '—'}</div>
          </li>
        ))}
      </ol>
    </div>

    <p className={styles.invoiceClosing}>Trân trọng kính chào Quý khách hàng!</p>

    <div className={styles.invoiceSignatureRow} ref={footerRef}>
      <div className={styles.invoiceSignatureBlock}>
        <b>NGƯỜI LẬP BÁO GIÁ</b>
        <div className={styles.invoiceSignatureName}>{quotation.prepared_by_name}</div>
        <div className={styles.signatureLine}/>
        <span className={styles.signatureCaption}>(Ký, ghi rõ họ tên)</span>
      </div>
      <div className={styles.invoiceSignatureBlock}>
        <b>{quotationCompany.name}</b>
        {stamp?.url && (
          <img
            src={stamp.url}
            alt="Dấu mộc công ty"
            draggable={false}
            className={`${styles.stampImage} ${stampEditable ? styles.stampImageEditable : ''}`}
            style={{
              left: `${stampPosition?.x ?? 78}%`,
              top: `${stampPosition?.y ?? 60}%`,
              width: `${110 * (stampPosition?.scale ?? 1)}px`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        )}
        <div className={styles.signatureLine}/>
        <span className={styles.signatureCaption}>(Ký, đóng dấu)</span>
      </div>
    </div>

    <div className={styles.invoiceFooter}>
      <div className={styles.invoiceFooterContacts}>
        <span><FaPhone/> {quotationCompany.phone}</span>
        <span><FaEnvelope/> {quotationCompany.email}</span>
        <span><FaGlobe/> {quotationCompany.website}</span>
        <span><FaLocationDot/> {quotationCompany.address}</span>
      </div>
      <div className={styles.invoiceFooterTagline}>—— {quotationCompany.footerTagline} ——</div>
    </div>
  </div>;
});
export default PrintInvoice;
