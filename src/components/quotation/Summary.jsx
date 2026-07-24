import React from 'react';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';

function Summary({ summary }) {
  return (
    <aside className={styles.quotationSummaryCard} aria-labelledby="quotation-summary-title">
      <div className={styles.quotationCard__header}>
        <div>
          <span className={styles.quotationKicker}>Tổng hợp</span>
          <h2 id="quotation-summary-title">Tóm tắt báo giá</h2>
        </div>
      </div>

      <div className={styles.quotationSummaryList}>
        <div className={styles.quotationSummaryItem}>
          <span>Tổng tiền trước VAT</span>
          <strong>{formatCurrency(summary.subtotal)}</strong>
        </div>
        <div className={styles.quotationSummaryItem}>
          <span>Tổng VAT</span>
          <strong>{formatCurrency(summary.vatAmount)}</strong>
        </div>
        <div className={`${styles.quotationSummaryItem} ${styles['quotationSummaryItem--emphasis']}`}>
          <span>Tổng thanh toán</span>
          <strong>{formatCurrency(summary.total)}</strong>
        </div>
      </div>

      <div className={styles.quotationSummaryWords}>
        <span>Số tiền bằng chữ</span>
        <p>{summary.totalInWords}</p>
      </div>
    </aside>
  );
}

export default React.memo(Summary);
