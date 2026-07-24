import React, { forwardRef } from 'react';
import dayjs from 'dayjs';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';

const PrintInvoice = forwardRef(function PrintInvoice(
  { company, customer, products, summary },
  ref,
  ) {
  return (
    <div ref={ref} className={styles.quotationPrintSheet}>
      <header className={styles.quotationPrintHeader}>
        <div className={styles.quotationPrintIssuer}>
          <p className={styles.quotationPrintKicker}>Đơn vị phát hành</p>
          <h1>{company?.name || 'Công ty chưa được chọn'}</h1>
          <p className={styles.quotationPrintSubtitle}>{company?.taxAddress || '---'}</p>
          <div className={styles.quotationPrintIssuerMeta}>
            <span>MST: {company?.taxCode || '---'}</span>
            <span>ĐT: {company?.phone || '---'}</span>
            <span>Email: {company?.email || '---'}</span>
          </div>
        </div>

        <div className={styles.quotationPrintCode}>
          <p className={styles.quotationPrintKicker}>Phiếu báo giá / Đơn hàng</p>
          <span>Số chứng từ</span>
          <strong>{customer?.documentNo || '---'}</strong>
          <p className={styles.quotationPrintSubtitle}>
            Ngày lập: {customer?.date ? dayjs(customer.date).format('DD/MM/YYYY') : '...'}
          </p>
        </div>
      </header>

      <section className={styles.quotationPrintCompanyBlock}>
        <div>
          <span>Người đại diện</span>
          <strong>{company?.representative || '---'}</strong>
        </div>
        <div>
          <span>Ngân hàng</span>
          <strong>{company?.bankName || '---'}</strong>
        </div>
        <div>
          <span>Số tài khoản</span>
          <strong>{company?.bankAccount || '---'}</strong>
        </div>
      </section>

      <section className={styles.quotationPrintCustomer}>
        <div>
          <span>Khách hàng</span>
          <strong>{customer?.companyName || '---'}</strong>
        </div>
        <div>
          <span>MST</span>
          <strong>{customer?.taxCode || '---'}</strong>
        </div>
        <div>
          <span>Địa chỉ thuế</span>
          <strong>{customer?.taxAddress || '---'}</strong>
        </div>
        <div>
          <span>Số điện thoại</span>
          <strong>{customer?.phone || '---'}</strong>
        </div>
        <div>
          <span>Địa chỉ giao hàng</span>
          <strong>{customer?.shippingAddress || '---'}</strong>
        </div>
      </section>

      <table className={styles.quotationPrintTable}>
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã SP</th>
            <th>Tên hàng</th>
            <th>ĐVT</th>
            <th>SL</th>
            <th>Đơn giá</th>
            <th>VAT %</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr key={product.id}>
              <td>{index + 1}</td>
              <td>{product.code || '---'}</td>
              <td className={styles.quotationPrintAlignLeft}>{product.name || '---'}</td>
              <td>{product.unit || '---'}</td>
              <td>{product.quantity}</td>
              <td className={styles.quotationPrintAlignRight}>{formatCurrency(product.price)}</td>
              <td>{product.vat}</td>
              <td className={styles.quotationPrintAlignRight}>{formatCurrency(product.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className={styles.quotationPrintSummary}>
        <div>
          <span>Tổng tiền trước VAT</span>
          <strong>{formatCurrency(summary.subtotal)}</strong>
        </div>
        <div>
          <span>Tổng VAT</span>
          <strong>{formatCurrency(summary.vatAmount)}</strong>
        </div>
        <div className={styles['quotationPrintSummary--total']}>
          <span>Tổng thanh toán</span>
          <strong>{formatCurrency(summary.total)}</strong>
        </div>
      </section>

      <section className={styles.quotationPrintWords}>
        <span>Số tiền bằng chữ:</span>
        <strong>{summary.totalInWords}</strong>
      </section>

      <footer className={styles.quotationPrintFooter}>
        <div>
          <span>Người lập</span>
          <strong>______________________</strong>
        </div>
        <div>
          <span>Khách hàng</span>
          <strong>______________________</strong>
        </div>
      </footer>

      {customer?.note ? (
        <section className={styles.quotationPrintNote}>
          <span>Ghi chú</span>
          <p>{customer.note}</p>
        </section>
      ) : null}
    </div>
  );
});

export default React.memo(PrintInvoice);
