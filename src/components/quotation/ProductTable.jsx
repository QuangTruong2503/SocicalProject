import React from 'react';
import { FaCirclePlus } from 'react-icons/fa6';
import ProductRow from './ProductRow.jsx';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';

function ProductTable({
  control,
  fields,
  errors,
  products,
  summary,
  searchState,
  onAddProduct,
  onRemoveProduct,
  onSearchProduct,
  onHideSuggestions,
  onSelectSuggestion,
  onEnterAdvance,
}) {
  return (
    <section className={styles.quotationCard} aria-labelledby="quotation-products-title">
      <div className={`${styles['quotationCard__header']} ${styles['quotationCard__header--stacked']}`}>
        <div>
          <span className={styles.quotationKicker}>Bảng sản phẩm</span>
          <h2 id="quotation-products-title">Danh sách hàng hóa</h2>
        </div>
        <button className={`${styles.quotationBtn} ${styles['quotationBtn--secondary']}`} type="button" onClick={onAddProduct}>
          <FaCirclePlus aria-hidden="true" />
          Thêm sản phẩm
        </button>
      </div>

      <div className={styles.quotationTableWrap}>
        <table className={styles.quotationTable}>
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
              <th>Xóa</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => (
              <ProductRow
                key={field.fieldKey}
                index={index}
                control={control}
                errors={errors}
                onRemove={onRemoveProduct}
                onSearchProduct={onSearchProduct}
                onHideSuggestions={onHideSuggestions}
                onSelectSuggestion={onSelectSuggestion}
                suggestions={searchState[index]}
                onEnterAdvance={onEnterAdvance}
                onAddProduct={onAddProduct}
                canRemove={fields.length > 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.quotationSummaryStrip}>
        <div className={styles.quotationSummaryStrip__item}>
          <span>Tổng tiền trước VAT</span>
          <strong>{formatCurrency(summary.subtotal)}</strong>
        </div>
        <div className={styles.quotationSummaryStrip__item}>
          <span>Tổng VAT</span>
          <strong>{formatCurrency(summary.vatAmount)}</strong>
        </div>
        <div className={`${styles.quotationSummaryStrip__item} ${styles['quotationSummaryStrip__item--total']}`}>
          <span>Tổng thanh toán</span>
          <strong>{formatCurrency(summary.total)}</strong>
        </div>
      </div>

      <div className={styles.quotationSummaryWording}>
        <span>Số tiền bằng chữ:</span>
        <strong>{summary.totalInWords}</strong>
      </div>

      <div className={styles.quotationTableFootnote}>
        {products.length} dòng sản phẩm đang hoạt động
      </div>
    </section>
  );
}

export default React.memo(ProductTable);
