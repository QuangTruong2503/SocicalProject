import { FaChevronDown, FaChevronUp, FaCopy, FaGripVertical, FaTrash } from 'react-icons/fa6';
import { formatCurrency, parseCurrency } from '../../utils/numberFormat.js';
import { KNM_UNITS, toGrossUnitPrice, toNetUnitPrice } from '../../utils/knmQuotation.js';

export default function ProductRow({
  item, index, canDelete, canMoveUp, canMoveDown, vatRate, vatInclusiveInput, onChange, onDuplicate, onDelete,
  onMoveUp, onMoveDown, onDragStart, onDragEnd, onDragOver, onDrop, isDragging, isDragOver, styles,
}) {
  const patch = (name, value) => onChange({ ...item, [name]: value });
  const displayPrice = vatInclusiveInput ? toGrossUnitPrice(item.unitPrice, vatRate) : item.unitPrice;
  const handlePriceChange = (e) => {
    const entered = parseCurrency(e.target.value);
    patch('unitPrice', vatInclusiveInput ? toNetUnitPrice(entered, vatRate) : entered);
  };

  const rowClassName = [isDragging && styles.rowDragging, isDragOver && styles.rowDragOver].filter(Boolean).join(' ') || undefined;

  return (
    <tr className={rowClassName} onDragOver={onDragOver} onDrop={onDrop}>
      <td className={styles.stt}>
        <span className={styles.sttInner}>
          <span
            className={styles.dragHandle}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            aria-label="Kéo để đổi thứ tự sản phẩm"
            title="Kéo để đổi thứ tự"
          >
            <FaGripVertical />
          </span>
          {index + 1}
        </span>
      </td>
      <td>
        <textarea
          placeholder={'Tên máy móc/ thiết bị\nThông số, mô tả chi tiết (có thể nhiều dòng)'}
          value={item.description}
          onChange={(e) => patch('description', e.target.value)}
        />
      </td>
      <td>
        <input placeholder="Thương hiệu" value={item.brand} onChange={(e) => patch('brand', e.target.value)} />
      </td>
      <td>
        <input
          type="number"
          min="0"
          step="1"
          value={item.quantity}
          onChange={(e) => patch('quantity', Math.max(0, Number(e.target.value) || 0))}
        />
      </td>
      <td>
        <select value={item.unit} onChange={(e) => patch('unit', e.target.value)}>
          {KNM_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        {item.unit === 'Khác' && (
          <input
            className={styles.customUnit}
            placeholder="Nhập ĐVT"
            value={item.customUnit}
            onChange={(e) => patch('customUnit', e.target.value)}
          />
        )}
      </td>
      <td>
        <input inputMode="numeric" value={formatCurrency(displayPrice)} onChange={handlePriceChange} />
        {vatInclusiveInput && <small className={styles.priceHint}>Chưa VAT: {formatCurrency(item.unitPrice)} ₫</small>}
      </td>
      <td className={styles.money}>{formatCurrency(Number(item.quantity) * Number(item.unitPrice))} ₫</td>
      <td>
        <div className={styles.rowActions}>
          <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label="Di chuyển sản phẩm lên"><FaChevronUp /></button>
          <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label="Di chuyển sản phẩm xuống"><FaChevronDown /></button>
          <button type="button" onClick={onDuplicate} aria-label="Nhân bản sản phẩm"><FaCopy /></button>
          <button type="button" className={styles.danger} onClick={onDelete} disabled={!canDelete} aria-label="Xóa sản phẩm"><FaTrash /></button>
        </div>
      </td>
    </tr>
  );
}
