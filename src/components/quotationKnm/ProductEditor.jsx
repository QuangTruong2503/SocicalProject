import { useRef, useState } from 'react';
import { FaDownload, FaFileExcel, FaPlus, FaTrash } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import { downloadProductImportTemplate } from '../../utils/quotationImport.js';
import { parseKnmProductImportFile } from '../../utils/knmQuotationImport.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { numberToVietnamese } from '../../utils/numberToVietnamese.js';
import { newKnmItem } from '../../utils/knmQuotation.js';
import ProductRow from './ProductRow.jsx';

export default function ProductEditor({ items, totals, vatRate, vatInclusiveInput, error, onChange, onImport, styles }) {
  const fileInput = useRef(null);
  const [importing, setImporting] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const imported = await parseKnmProductImportFile(file);
      onImport(imported);
      toast.success(`Đã nhập ${imported.length} sản phẩm từ Excel.`);
    } catch (error) {
      toast.error(error.message || 'Không thể đọc file Excel.');
    } finally {
      setImporting(false);
    }
  };

  const clearItems = () => {
    if (window.confirm('Xóa tất cả sản phẩm trong báo giá hiện tại? Thao tác này không thể hoàn tác.')) {
      onChange([newKnmItem()]);
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

  return (
    <section className={styles.card}>
      <h2>Danh sách sản phẩm</h2>
      <div className={styles.productToolbar}>
        <input ref={fileInput} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={importing}>
          <FaFileExcel /> {importing ? 'Đang nhập…' : 'Nhập Excel'}
        </button>
        <button type="button" onClick={downloadProductImportTemplate}><FaDownload /> Tải file mẫu</button>
        <button type="button" className={styles.danger} onClick={clearItems} disabled={importing}><FaTrash /> Xóa tất cả sản phẩm</button>
      </div>
      <p className={styles.importHint}>
        Nhập từ sheet đầu tiên, thêm vào danh sách hiện tại. Đơn giá trong file {vatInclusiveInput ? 'đã gồm' : 'chưa gồm'} VAT ({vatRate}%) theo cài đặt báo giá. Xóa dòng ví dụ trước khi nhập dữ liệu của bạn.
      </p>
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
                canMoveUp={index > 0}
                canMoveDown={index < items.length - 1}
                isDragging={dragIndex === index}
                isDragOver={dragOverIndex === index && dragIndex !== null && dragIndex !== index}
                vatRate={vatRate}
                vatInclusiveInput={vatInclusiveInput}
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
