import { FaPlus } from 'react-icons/fa6';
import { formatCurrency } from '../../utils/numberFormat.js';
import { numberToVietnamese } from '../../utils/numberToVietnamese.js';
import { newKnmItem } from '../../utils/knmQuotation.js';
import ProductRow from './ProductRow.jsx';

export default function ProductEditor({ items, totals, vatRate, vatInclusiveInput, error, onChange, styles }) {
  const updateItem = (index, next) => onChange(items.map((item, i) => (i === index ? next : item)));
  const addItem = () => onChange([...items, newKnmItem()]);
  const duplicateItem = (index) => onChange([
    ...items.slice(0, index + 1),
    { ...items[index], id: newKnmItem().id },
    ...items.slice(index + 1),
  ]);
  const deleteItem = (index) => onChange(items.length > 1 ? items.filter((_, i) => i !== index) : items);

  return (
    <section className={styles.card}>
      <h2>Danh sách sản phẩm</h2>
      {error && <p className={styles.field}><small>{error}</small></p>}
      <div className={styles.tableWrap}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên và mô tả sản phẩm</th>
              <th>Thương hiệu</th>
              <th>Số lượng</th>
              <th>ĐVT</th>
              <th>Đơn giá</th>
              <th>Thành tiền</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <ProductRow
                key={item.id}
                item={item}
                index={index}
                canDelete={items.length > 1}
                vatRate={vatRate}
                vatInclusiveInput={vatInclusiveInput}
                onChange={(next) => updateItem(index, next)}
                onDuplicate={() => duplicateItem(index)}
                onDelete={() => deleteItem(index)}
                styles={styles}
              />
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={styles.addRow} onClick={addItem}><FaPlus /> Thêm sản phẩm</button>

      <div className={styles.summary}>
        <div className={styles.summaryRow}><span>Tạm tính</span><b>{formatCurrency(totals.subtotal)} ₫</b></div>
        <div className={styles.summaryRow}><span>VAT {vatRate}%</span><b>{formatCurrency(totals.vatAmount)} ₫</b></div>
        <div className={styles.summaryTotal}><span>TỔNG THANH TOÁN</span><span>{formatCurrency(totals.total)} ₫</span></div>
        <p className={styles.summaryWords}>{numberToVietnamese(totals.total)}</p>
      </div>
    </section>
  );
}
