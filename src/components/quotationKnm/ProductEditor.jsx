import { useRef, useState } from 'react';
import { FaDownload, FaFileExcel, FaPlus, FaTrash } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import ConfirmDialog from '../dialog/ConfirmDialog.jsx';
import { downloadProductImportTemplate } from '../../utils/quotationImport.js';
import { parseKnmProductImportFile } from '../../utils/knmQuotationImport.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { numberToVietnamese } from '../../utils/numberToVietnamese.js';
import { newKnmItem } from '../../utils/knmQuotation.js';
import ProductRow from './ProductRow.jsx';

export default function ProductEditor({ quotation, totals, errors = {}, readOnly, onChange, onImport, styles }) {
  const { items } = quotation;
  const perItemVat = totals.vatMode === 'per_item';
  const vatSplit = totals.vatMode !== 'included';
  const autoSplit = vatSplit && Boolean(quotation.autoSplitVat);
  const fileInput = useRef(null);
  const [importing, setImporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const imported = await parseKnmProductImportFile(file);
      // With "Tự động chia VAT" the prices in the file are VAT-inclusive, like the ones typed by hand.
      onImport(autoSplit ? imported.map((item) => ({ ...item, grossUnitPrice: item.unitPrice })) : imported);
      toast.success(`Đã nhập ${imported.length} sản phẩm từ Excel.`);
    } catch (error) {
      toast.error(error.message || 'Không thể đọc file Excel.');
    } finally {
      setImporting(false);
    }
  };

  const updateItem = (index, next) => onChange(items.map((item, i) => (i === index ? next : item)));
  const addItem = () => onChange([...items, newKnmItem()]);
  const duplicateItem = (index) => onChange([
    ...items.slice(0, index + 1),
    { ...items[index], id: newKnmItem().id },
    ...items.slice(index + 1),
  ]);
  const deleteItem = (index) => onChange(items.length > 1 ? items.filter((_, i) => i !== index) : items);
  const moveItem = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const priceHint = !vatSplit
    ? 'Đơn giá trong file được hiểu là giá đã gồm VAT.'
    : autoSplit
      ? 'Đang bật Tự động chia VAT: đơn giá trong file được hiểu là giá đã gồm VAT và sẽ được tách VAT.'
      : `Đơn giá trong file được hiểu là giá chưa VAT${perItemVat ? ', VAT từng sản phẩm mặc định 8%' : ''}.`;

  return (
    <section className={styles.card}>
      <h2>Danh sách sản phẩm</h2>
      {!readOnly && (
        <>
          <div className={styles.productToolbar}>
            <input ref={fileInput} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={importing}>
              <FaFileExcel /> {importing ? 'Đang nhập…' : 'Nhập Excel'}
            </button>
            <button type="button" onClick={downloadProductImportTemplate}><FaDownload /> Tải file mẫu</button>
            <button type="button" className={styles.danger} onClick={() => setConfirmClear(true)} disabled={importing}>
              <FaTrash /> Xóa tất cả sản phẩm
            </button>
          </div>
          <p className={styles.importHint}>
            Nhập từ sheet đầu tiên, thêm vào danh sách hiện tại. {priceHint} Xóa dòng ví dụ trước khi nhập dữ liệu của bạn.
          </p>
        </>
      )}
      {errors.items && <p className={styles.formError} role="alert">{errors.items}</p>}
      <div className={`${styles.tableWrap} ${styles.itemsWrap}`}>
        <table className={perItemVat ? `${styles.itemsTable} ${styles.perItemVat}` : styles.itemsTable}>
          <thead>
            <tr>
              <th>STT</th>
              <th>Tên và mô tả sản phẩm</th>
              <th>Thương hiệu</th>
              <th>Số lượng</th>
              <th>ĐVT</th>
              <th>{vatSplit ? (autoSplit ? 'Đơn giá chưa VAT (nhập gồm VAT)' : 'Đơn giá chưa VAT') : 'Đơn giá'}</th>
              <th>{vatSplit ? 'Thành tiền chưa VAT' : 'Thành tiền'}</th>
              {perItemVat && <th>VAT</th>}
              <th><span className={styles.srOnly}>Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <ProductRow
                key={item.id}
                item={item}
                index={index}
                quotation={quotation}
                autoSplit={autoSplit}
                error={errors.itemErrors?.[item.id]}
                readOnly={readOnly}
                canDelete={items.length > 1}
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index && dragIndex !== null && dragIndex !== index}
                perItemVat={perItemVat}
                onChange={(next) => updateItem(index, next)}
                onDuplicate={() => duplicateItem(index)}
                onDelete={() => deleteItem(index)}
                onMoveUp={() => moveItem(index, index - 1)}
                onMoveDown={() => moveItem(index, index + 1)}
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                onDragOver={(e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  setDragOverIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) moveItem(dragIndex, index);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                styles={styles}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <button type="button" className={styles.addRow} onClick={addItem}><FaPlus /> Thêm sản phẩm</button>}

      <div className={styles.summary}>
        {vatSplit ? (<>
          <div className={styles.summaryRow}><span>Cộng tiền hàng (chưa VAT)</span><b>{formatCurrency(totals.subtotal)} ₫</b></div>
          {totals.vatLines.map((line) => (
            <div key={line.rate} className={styles.summaryRow}><span>VAT {line.rate}%</span><b>{formatCurrency(line.amount)} ₫</b></div>
          ))}
          <div className={styles.summaryTotal}><span>TỔNG TIỀN ĐÃ GỒM VAT</span><span data-testid="knm-total">{formatCurrency(totals.total)} ₫</span></div>
        </>) : (<>
          <div className={styles.summaryRow}><span>VAT</span><b>Đã bao gồm</b></div>
          <div className={styles.summaryTotal}><span>TỔNG THANH TOÁN</span><span data-testid="knm-total">{formatCurrency(totals.total)} ₫</span></div>
        </>)}
        <p className={styles.summaryWords}>{numberToVietnamese(totals.total)}</p>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Xóa tất cả sản phẩm?"
          message="Toàn bộ dòng sản phẩm trong báo giá đang soạn sẽ bị xóa. Báo giá đã lưu chỉ thay đổi khi bạn bấm Lưu."
          confirmLabel="Xóa tất cả"
          danger
          onConfirm={() => { setConfirmClear(false); onChange([newKnmItem()]); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </section>
  );
}
