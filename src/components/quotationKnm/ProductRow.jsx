import { useState } from 'react';
import { FaChevronDown, FaChevronUp, FaCopy, FaGripVertical, FaTrash } from 'react-icons/fa6';
import MoneyInput from '../quotation/MoneyInput.jsx';
import { formatCurrency } from '../../utils/numberFormat.js';
import {
  KNM_UNITS, KNM_VAT_OPTIONS, knmGrossUnitPrice, knmItemRate, knmItemVatRate, knmLineAmount, knmUnitPrice,
} from '../../utils/knmQuotation.js';

/** Quantity that can be cleared and typed as a decimal ("1,5") without snapping to 0 mid-edit. */
function QuantityInput({ value, onChange, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={draft ?? String(value ?? '').replace('.', ',')}
      onChange={(e) => {
        const text = e.target.value.replace(',', '.').replace(/\s/g, '');
        if (!/^\d*\.?\d{0,3}$/.test(text)) return;
        setDraft(e.target.value);
        onChange(text === '' || text === '.' ? 0 : Number(text));
      }}
      onBlur={() => setDraft(null)}
      {...rest}
    />
  );
}

/**
 * "Đơn giá" cell. With "Tự động chia VAT" the user types the VAT-inclusive price; once
 * they leave the cell it shows the net price, with the entered price noted below.
 */
function PriceInput({ item, quotation, autoSplit, onChange, index, styles }) {
  const [editing, setEditing] = useState(false);
  const rate = knmItemRate(item, quotation);
  const typingGross = autoSplit && editing;
  const value = Math.round(typingGross ? knmGrossUnitPrice(item, quotation) : knmUnitPrice(item, quotation));
  const showGrossNote = quotation.vatMode !== 'included' && item.grossUnitPrice != null && item.grossUnitPrice !== '';

  return (
    <>
      <MoneyInput
        className={styles.priceInput}
        value={value}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(price) => onChange(autoSplit
          ? { ...item, grossUnitPrice: price, unitPrice: Math.round(price / (1 + rate / 100)) }
          : { ...item, unitPrice: price, grossUnitPrice: null })}
        aria-label={`${typingGross ? 'Đơn giá gồm VAT' : 'Đơn giá'} sản phẩm ${index + 1}`}
      />
      {typingGross && <small className={`${styles.priceNote} ${styles.priceNoteEditing}`}>Giá gồm VAT {rate}%</small>}
      {!typingGross && showGrossNote && <small className={styles.priceNote}>Gồm VAT: {formatCurrency(item.grossUnitPrice)}</small>}
    </>
  );
}

export default function ProductRow({
  item, index, quotation, autoSplit, error, readOnly, canDelete, canMoveUp, canMoveDown, perItemVat, onChange, onDuplicate,
  onDelete, onMoveUp, onMoveDown, onDragStart, onDragEnd, onDragOver, onDrop, isDragging, isDragOver, styles,
}) {
  const patch = (name, value) => onChange({ ...item, [name]: value });
  const vatSplit = quotation.vatMode !== 'included';
  const number = index + 1;

  const rowClassName = [isDragging && styles.rowDragging, isDragOver && styles.rowDragOver, error && styles.rowError]
    .filter(Boolean).join(' ') || undefined;

  return (
    <tr className={rowClassName} onDragOver={onDragOver} onDrop={onDrop} data-item-id={item.id}>
      <td className={styles.stt}>
        <span className={styles.sttInner}>
          {!readOnly && (
            <span
              className={styles.dragHandle}
              draggable
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              aria-hidden="true"
              title="Kéo để đổi thứ tự"
            >
              <FaGripVertical />
            </span>
          )}
          {number}
        </span>
      </td>
      <td className={styles.descCell} data-label="Tên và mô tả sản phẩm">
        <textarea
          placeholder={'Tên máy móc/ thiết bị\nThông số, mô tả chi tiết (có thể nhiều dòng)'}
          value={item.description}
          onChange={(e) => patch('description', e.target.value)}
          aria-label={`Tên và mô tả sản phẩm ${number}`}
          aria-invalid={Boolean(error)}
        />
        {error && <span className={styles.rowErrorText}>{error}</span>}
      </td>
      <td data-label="Thương hiệu">
        <input placeholder="Thương hiệu" value={item.brand} onChange={(e) => patch('brand', e.target.value)} aria-label={`Thương hiệu sản phẩm ${number}`} />
      </td>
      <td data-label="Số lượng">
        <QuantityInput value={item.quantity} onChange={(quantity) => patch('quantity', quantity)} aria-label={`Số lượng sản phẩm ${number}`} />
      </td>
      <td data-label="ĐVT">
        <select value={item.unit} onChange={(e) => patch('unit', e.target.value)} aria-label={`Đơn vị tính sản phẩm ${number}`}>
          {KNM_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        {item.unit === 'Khác' && (
          <input
            className={styles.customUnit}
            placeholder="Nhập ĐVT"
            value={item.customUnit}
            onChange={(e) => patch('customUnit', e.target.value)}
            aria-label={`Đơn vị tính khác sản phẩm ${number}`}
          />
        )}
      </td>
      <td data-label={vatSplit ? 'Đơn giá chưa VAT' : 'Đơn giá'} className={styles.priceCell}>
        <PriceInput item={item} quotation={quotation} autoSplit={autoSplit} onChange={onChange} index={index} styles={styles} />
      </td>
      <td className={styles.money} data-label={vatSplit ? 'Thành tiền chưa VAT' : 'Thành tiền'}>
        {formatCurrency(knmLineAmount(item, quotation))} ₫
      </td>
      {perItemVat && (
        <td data-label="VAT">
          <select aria-label={`VAT sản phẩm ${number}`} value={knmItemVatRate(item)} onChange={(e) => patch('vatRate', Number(e.target.value))}>
            {KNM_VAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </td>
      )}
      <td className={styles.actionsCell}>
        {!readOnly && (
          <div className={styles.rowActions}>
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Di chuyển sản phẩm ${number} lên`} title="Lên"><FaChevronUp /></button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Di chuyển sản phẩm ${number} xuống`} title="Xuống"><FaChevronDown /></button>
            <button type="button" onClick={onDuplicate} aria-label={`Nhân bản sản phẩm ${number}`} title="Nhân bản"><FaCopy /></button>
            <button type="button" className={styles.danger} onClick={onDelete} disabled={!canDelete} aria-label={`Xóa sản phẩm ${number}`} title="Xóa"><FaTrash /></button>
          </div>
        )}
      </td>
    </tr>
  );
}
