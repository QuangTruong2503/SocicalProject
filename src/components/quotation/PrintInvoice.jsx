import { forwardRef } from 'react';
import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';
import { quotationCompany } from '../../data/quotationCompany.js';
import productStyles from '../../pages/Quotation/QuotationProduct.module.css';

const PrintInvoice = forwardRef(function PrintInvoice({ quotation, summary, preview = false }, ref) {
  return <div ref={ref} className={`${styles.printSheet} ${preview ? styles.previewSheet : ''}`}>
    <header className={styles.printHeader}>
      <img src={quotationCompany.logo} alt="Logo công ty"/>
      <div><h1>{quotationCompany.name}</h1><p>{quotationCompany.address}</p><p>MST: {quotationCompany.taxCode} · Điện thoại: {quotationCompany.phone} · {quotationCompany.email}</p></div>
    </header>
    <div className={styles.printMeta}>
      <div>
        <p><b>To:</b> {quotation.customer_name}</p>
        {quotation.tax_code && <p><b>Mã số thuế:</b> {quotation.tax_code}</p>}
        {quotation.address && <p><b>Địa chỉ:</b> {quotation.address}</p>}
        <p><b>Attn:</b> {quotation.contact_name || 'Anh/Chị mua hàng'}</p>
        <p><b>H/P:</b> {quotation.phone || '—'}</p>
      </div>
      <div><p><b>From:</b> {quotation.prepared_by_name || '—'}</p><p><b>Tel:</b> {quotation.prepared_by_phone || '—'}</p><p><b>Date:</b> {dayjs(quotation.quotation_date).format('DD/MM/YYYY')}</p><p><b>No:</b> {quotation.quotation_no}</p></div>
    </div>
    <p>Trước hết Công ty chúng tôi xin chân thành cảm ơn sự quan tâm quý báu của Quý khách hàng về sản phẩm của chúng tôi.</p>
    <p>Công ty chúng tôi xin trân trọng thông báo tới Quý khách hàng bảng báo giá các sản phẩm của Công ty:</p>
    <table className={styles.printTable}><thead><tr><th>STT</th><th>MÔ TẢ SẢN PHẨM</th><th>THƯƠNG HIỆU</th><th>SỐ LƯỢNG</th><th>ĐVT</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead><tbody>{quotation.items.map((item, index) => <tr key={item.key || item.id}><td>{index + 1}</td><td className={productStyles.printDescription}><strong>{item.product_name || item.description}</strong>{item.description && <><br/><span>{item.description}</span></>}</td><td>{item.brand}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{formatCurrency(item.unit_price)}</td><td>{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td></tr>)}</tbody><tfoot><tr><th colSpan="6">TỔNG CỘNG Đã gồm VAT</th><th>{formatCurrency(summary.total)}</th></tr></tfoot></table>
    <div className={styles.printTerms}><p><b>Ghi chú:</b> {quotation.terms?.note}</p><p><b>Địa điểm giao hàng:</b> {quotation.terms?.deliveryPlace}</p><p><b>Thời gian giao hàng:</b> {quotation.terms?.deliveryTime}</p><p><b>Phương thức thanh toán:</b> {quotation.terms?.payment}</p><p><b>Chất lượng hàng hóa:</b> {quotation.terms?.quality}</p><p><b>Hiệu lực báo giá:</b> {quotation.terms?.validity}</p></div>
    <p>Trân trọng kính chào Quý khách hàng</p>
    <footer><div>NGƯỜI LẬP BÁO GIÁ<br/><b>{quotation.prepared_by_name}</b></div><div>{quotationCompany.name}</div></footer>
  </div>;
});
export default PrintInvoice;
