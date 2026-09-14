import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { FaCopy, FaEye, FaFileArrowDown, FaFileArrowUp, FaFileExcel, FaFilePdf, FaFloppyDisk, FaPlus, FaPrint, FaTrash, FaXmark } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth.js';
import { calculateQuotation, emptyQuotation, newItem, normalizeLocalQuotation, QUOTATION_STATUSES, TERM_LABELS, UNITS, validateQuotation, quotationPayload } from '../../utils/quotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import { exportQuotationToPdf } from '../../utils/quotationPdf.js';
import { getNextQuotationNumber, getQuotation, normalizeQuotation, saveQuotation } from '../../services/quotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { isLikelyTaxCode, lookupBusinessByTaxCode } from '../../utils/taxLookup.js';
import {
  DEFAULT_STAMP_POSITION, clearStampAsset, loadStampAsset, loadStampPosition,
  saveStampAsset, saveStampPosition,
} from '../../utils/quotationAssets.js';
import { downloadProductImportTemplate, parseProductImportFile } from '../../utils/quotationImport.js';
import PrintInvoice from '../../components/quotation/PrintInvoice.jsx';
import styles from './Quotation.module.css';
import productStyles from './QuotationProduct.module.css';

export default function Quotation() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const printRef = useRef(null);
  const previewRef = useRef(null);
  const automaticPdfStarted = useRef(false);
  const storageKey = `quotation:draft:${user?.id || 'anonymous'}:${id || 'new'}`;
  const [data, setData] = useState(() => emptyQuotation(profile, user));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [taxLookupState, setTaxLookupState] = useState('idle');
  const [preview, setPreview] = useState(false);
  const [stamp, setStamp] = useState(null);
  const [stampPosition, setStampPositionState] = useState(DEFAULT_STAMP_POSITION);
  const stampPositionRef = useRef(DEFAULT_STAMP_POSITION);
  const setStampPosition = (position) => { stampPositionRef.current = position; setStampPositionState(position); };
  const [ready, setReady] = useState(false);
  const summary = useMemo(() => calculateQuotation(data), [data]);

  const print = useReactToPrint({ contentRef: printRef, documentTitle: `Bao-gia-${data.quotation_no}` });
  const patch = (name, value) => setData((current) => ({ ...current, [name]: value }));
  const patchItem = (index, name, value) => setData((current) => ({
    ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item),
  }));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (id) {
          let restored = null;
          const saved = window.localStorage.getItem(storageKey);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed && parsed.id === id) restored = normalizeLocalQuotation(parsed, profile, user);
            } catch {
              window.localStorage.removeItem(storageKey);
            }
          }
          const record = restored || normalizeQuotation(await getQuotation(id));
          if (active) setData(record);
        } else {
          let restored = null;
          const saved = window.localStorage.getItem(storageKey);
          if (saved) {
            try {
              restored = normalizeLocalQuotation(JSON.parse(saved), profile, user);
            } catch {
              window.localStorage.removeItem(storageKey);
            }
          }
          const next = restored || emptyQuotation(profile, user);
          const today = dayjs().format('YYYY-MM-DD');
          if (next.quotation_date !== today) {
            next.quotation_date = today;
            next.quotation_no = await getNextQuotationNumber(today);
          } else if (!next.quotation_no) {
            next.quotation_no = await getNextQuotationNumber(today);
          }
          if (active) setData(next);
        }
      } catch (error) { toast.error(error.message); }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, [id, profile, storageKey, user]);

  useEffect(() => {
    loadStampAsset().then((asset) => { if (asset) setStamp(asset); });
    loadStampPosition().then((position) => { if (position) setStampPosition(position); });
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      toast.error('Không thể lưu bản nháp trên trình duyệt.');
    }
  }, [data, ready, storageKey]);

  const handleTaxCodeBlur = async () => {
    const taxCode = (data.tax_code || '').trim();
    if (!isLikelyTaxCode(taxCode)) {
      setTaxLookupState('idle');
      return;
    }
    setTaxLookupState('loading');
    try {
      const info = await lookupBusinessByTaxCode(taxCode);
      setData((current) => ({
        ...current,
        customer_name: info.name || current.customer_name,
        address: info.address || current.address,
      }));
      setTaxLookupState('done');
    } catch (error) {
      setTaxLookupState('error');
      toast.error(error.message || 'Không tìm thấy thông tin doanh nghiệp với mã số thuế này.');
    }
  };

  const handleStampUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await saveStampAsset(file);
      setStamp(await loadStampAsset());
      toast.success('Đã lưu dấu mộc vào trình duyệt này.');
    } catch (error) {
      toast.error(error.message || 'Không thể lưu dấu mộc.');
    }
  };

  const handleStampClear = async () => {
    try {
      await clearStampAsset();
      setStamp(null);
    } catch (error) {
      toast.error(error.message || 'Không thể xóa dấu mộc.');
    }
  };

  const handleStampDragEnd = () => {
    saveStampPosition(stampPositionRef.current).catch(() => {});
  };

  const handleStampScaleChange = (event) => {
    const next = { ...stampPositionRef.current, scale: Number(event.target.value) };
    setStampPosition(next);
    saveStampPosition(next).catch(() => {});
  };

  const handleImportProducts = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = await parseProductImportFile(file);
      setData((current) => ({
        ...current,
        items: [
          ...current.items.filter((item) => item.product_name?.trim() || item.description?.trim()),
          ...imported.map((item) => ({ ...newItem(), ...item })),
        ],
      }));
      toast.success(`Đã nhập ${imported.length} sản phẩm từ file Excel.`);
    } catch (error) {
      toast.error(error.message || 'Không thể đọc file Excel.');
    }
  };

  const validate = (draft) => {
    const next = validateQuotation(data, draft);
    setErrors(next);
    if (Object.keys(next).length) toast.error('Vui lòng kiểm tra các trường được đánh dấu.');
    return !Object.keys(next).length;
  };

  const handleSave = async (status) => {
    const draft = status === 'draft';
    if (!validate(draft)) return;
    setBusy(status);
    try {
      const savedId = await saveQuotation(quotationPayload(data, status));
      toast.success(draft ? 'Đã lưu bản nháp.' : 'Đã lưu báo giá.');
      if (!draft) window.localStorage.removeItem(storageKey);
      if (!id) navigate(`/admin/bao-gia/${savedId}/chinh-sua`, { replace: true });
      else patch('status', status);
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const persistQuotation = useCallback(async () => {
    if (Object.keys(validateQuotation(data, true)).length) return;
    try {
      const savedId = await saveQuotation(quotationPayload(data, data.status || 'draft'));
      if (savedId && !data.id) {
        setData((current) => ({ ...current, id: savedId }));
        window.localStorage.removeItem(storageKey);
      }
    } catch (error) {
      toast.error(error.message || 'Không thể lưu báo giá vào cơ sở dữ liệu.');
    }
  }, [data, storageKey]);

  const handleExport = async () => {
    if (!validate(false)) return;
    setBusy('excel');
    persistQuotation();
    try { await exportQuotationToExcel(data, summary); toast.success('Đã xuất Excel theo mẫu công ty.'); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const handleExportPdf = async () => {
    if (!validate(false)) return;
    setBusy('pdf');
    persistQuotation();
    try {
      await exportQuotationToPdf(data, summary, stamp, stampPosition);
      toast.success('Đã tạo PDF tại trình duyệt và tải xuống.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const handlePreview = () => {
    setPreview(true);
    persistQuotation();
  };

  const handleCopyPreviewImage = async () => {
    if (!previewRef.current) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      toast.error('Trình duyệt này chưa hỗ trợ sao chép hình vào clipboard.');
      return;
    }
    setBusy('copy-image');
    try {
      const { default: html2canvas } = await import('html2canvas');
      await document.fonts?.ready;
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
      });
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error('Không thể tạo hình báo giá.')),
        'image/png',
      ));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast.success('Đã sao chép hình báo giá vào clipboard.');
    } catch (error) {
      toast.error(error.message || 'Không thể sao chép hình báo giá.');
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!ready || searchParams.get('pdf') !== '1' || automaticPdfStarted.current) return;
    automaticPdfStarted.current = true;
    setBusy('pdf');
    persistQuotation();
    exportQuotationToPdf(data, summary, stamp, stampPosition)
      .then(() => toast.success('Đã tạo PDF tại trình duyệt và tải xuống.'))
      .catch((error) => toast.error(error.message))
      .finally(() => setBusy(''));
  }, [data, persistQuotation, ready, searchParams, stamp, stampPosition, summary]);

  const duplicate = useCallback(async () => {
    setBusy('copy');
    try {
      const quotation_no = await getNextQuotationNumber(data.quotation_date);
      setData((current) => ({ ...current, id: '', quotation_no, status: 'draft' }));
      navigate('/admin/bao-gia/tao-moi', { replace: true });
      toast.success('Đã tạo bản sao với số báo giá mới. Hãy lưu để hoàn tất.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }, [data.quotation_date, navigate]);

  const handleReset = useCallback(async () => {
    if (!window.confirm('Tạo báo giá mới sẽ xóa thông tin khách hàng và sản phẩm đang nhập. Tiếp tục?')) return;
    setBusy('reset');
    try {
      window.localStorage.removeItem(storageKey);
      const today = dayjs().format('YYYY-MM-DD');
      const quotation_no = await getNextQuotationNumber(today);
      setData({ ...emptyQuotation(profile, user), quotation_date: today, quotation_no });
      setErrors({});
      setTaxLookupState('idle');
      toast.success('Đã làm mới thông tin để tạo báo giá mới.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  }, [profile, storageKey, user]);

  return (
    <>
      <Helmet><title>{id ? 'Chỉnh sửa' : 'Tạo'} báo giá</title></Helmet>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div><span>QUẢN LÝ BÁO GIÁ</span><h1>{id ? 'CHỈNH SỬA BÁO GIÁ' : 'TẠO BÁO GIÁ'}</h1></div>
          <div className={styles.actions}>
            {id ? (
              <button className={styles.secondaryAction} onClick={() => handleSave('draft')} disabled={!!busy}><FaFloppyDisk/> Lưu nháp</button>
            ) : (
              <button className={styles.secondaryAction} onClick={handleReset} disabled={!!busy}><FaPlus/> Tạo báo giá mới</button>
            )}
            <button className={styles.primary} onClick={() => handleSave('created')} disabled={!!busy}><FaFloppyDisk/> Lưu báo giá</button>
            <button className={styles.previewAction} onClick={handlePreview}><FaEye/> Xem trước</button>
            <button className={styles.excelAction} onClick={handleExport} disabled={!!busy}><FaFileExcel/> {busy === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
            <button className={styles.pdfAction} onClick={handleExportPdf} disabled={!!busy}><FaFilePdf/> {busy === 'pdf' ? 'Đang chuyển PDF...' : 'Xuất PDF'}</button>
            <button onClick={print}><FaPrint/> In</button>
            {id && <button onClick={duplicate} disabled={!!busy}><FaCopy/> Tạo bản sao</button>}
            <button onClick={() => navigate('/admin/bao-gia')}><FaXmark/> Hủy</button>
          </div>
        </header>

        <section className={styles.card}>
          <h2>Thông tin khách hàng</h2>
          <div className={styles.formGrid}>
            <label>Mã số thuế<input placeholder="Nhập MST để tự động điền tên & địa chỉ" value={data.tax_code || ''} onChange={(e) => { patch('tax_code', e.target.value); setTaxLookupState('idle'); }} onBlur={handleTaxCodeBlur}/>{taxLookupState === 'loading' && <small>Đang tra cứu...</small>}{taxLookupState === 'done' && <small>Đã điền theo dữ liệu Tổng cục Thuế.</small>}</label>
            <label className={styles.span2}>Tên khách hàng / công ty *<input placeholder="Ví dụ: Công ty TNHH Minh Triết" value={data.customer_name} onChange={(e) => patch('customer_name', e.target.value)}/>{errors.customer_name && <small>{errors.customer_name}</small>}</label>
            <label>Người liên hệ<input placeholder="Họ tên người nhận báo giá" value={data.contact_name || ''} onChange={(e) => patch('contact_name', e.target.value)}/></label>
            <label>Số điện thoại<input inputMode="tel" placeholder="Ví dụ: 0901 234 567" value={data.phone || ''} onChange={(e) => patch('phone', e.target.value)}/>{errors.phone && <small>{errors.phone}</small>}</label>
            <label>Email<input type="email" placeholder="email@congty.vn" value={data.email || ''} onChange={(e) => patch('email', e.target.value)}/>{errors.email && <small>{errors.email}</small>}</label>
            <label className={styles.span2}>Địa chỉ<textarea placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" value={data.address || ''} onChange={(e) => patch('address', e.target.value)}/></label>
            <label>Ngày báo giá<input type="date" value={data.quotation_date} onChange={(e) => patch('quotation_date', e.target.value)}/></label>
            <label>Số báo giá<input value={data.quotation_no} onChange={(e) => patch('quotation_no', e.target.value)}/>{errors.quotation_no && <small>{errors.quotation_no}</small>}</label>
            <label className={styles.span2}>Ghi chú<textarea placeholder="Ghi chú riêng dành cho báo giá này" value={data.note || ''} onChange={(e) => patch('note', e.target.value)}/></label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionTitle}>
            <div><h2>Thông tin sản phẩm</h2><p>Nhập tên, mô tả, số lượng và đơn giá của từng sản phẩm.</p></div>
            <div className={styles.sectionTitleActions}>
              <button type="button" onClick={downloadProductImportTemplate}><FaFileArrowDown/> Tải file mẫu</button>
              <label className={styles.fileButton}>
                <FaFileArrowUp/> Nhập từ Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleImportProducts}/>
              </label>
              <button className={styles.primary} onClick={() => patch('items', [...data.items, newItem()])}><FaPlus/> Thêm sản phẩm</button>
            </div>
          </div>
          {errors.items && <p className={styles.error}>{errors.items}</p>}
          <div className={styles.tableWrap}><table className={styles.itemsTable}>
            <thead><tr><th>STT</th><th>Tên và mô tả sản phẩm *</th><th>Thương hiệu</th><th>Số lượng</th><th>ĐVT</th><th>Đơn giá</th><th>Thành tiền</th><th></th></tr></thead>
            <tbody>{data.items.map((item, index) => <tr key={item.key || item.id}>
              <td>{index + 1}</td>
              <td><div className={productStyles.productEditor}><input aria-label={`Tên sản phẩm ${index + 1}`} placeholder="Tên sản phẩm" value={item.product_name || ''} onChange={(e) => patchItem(index, 'product_name', e.target.value)}/>{errors[`item_${index}_product_name`] && <small>{errors[`item_${index}_product_name`]}</small>}<textarea aria-label={`Mô tả sản phẩm ${index + 1}`} placeholder="Mô tả sản phẩm (có thể nhập nhiều dòng)" value={item.description || ''} onChange={(e) => patchItem(index, 'description', e.target.value)}/></div></td>
              <td><input placeholder="Thương hiệu" value={item.brand || ''} onChange={(e) => patchItem(index, 'brand', e.target.value)}/></td>
              <td><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => patchItem(index, 'quantity', e.target.value)}/>{errors[`item_${index}_quantity`] && <small>{errors[`item_${index}_quantity`]}</small>}</td>
              <td><input list="units" placeholder="ĐVT" value={item.unit} onChange={(e) => patchItem(index, 'unit', e.target.value)}/></td>
              <td><input type="number" min="0" step="1000" value={item.unit_price} onChange={(e) => patchItem(index, 'unit_price', e.target.value)}/>{errors[`item_${index}_unit_price`] && <small>{errors[`item_${index}_unit_price`]}</small>}</td>
              <td className={styles.money}>{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td>
              <td><button className={styles.danger} disabled={data.items.length === 1} onClick={() => window.confirm('Xóa sản phẩm này?') && patch('items', data.items.filter((_, i) => i !== index))}><FaTrash/></button></td>
            </tr>)}</tbody>
            <tfoot><tr><td colSpan={8} className={styles.addRow}><button type="button" onClick={() => patch('items', [...data.items, newItem()])}><FaPlus/> Thêm sản phẩm</button></td></tr></tfoot>
          </table><datalist id="units">{UNITS.map((unit) => <option key={unit} value={unit}/>)}</datalist></div>
        </section>

        <section className={`${styles.card} ${styles.summaryCard}`}>
          <div className={styles.totals}><p><span>Tạm tính</span><b>{formatCurrency(summary.subtotal)} VNĐ</b></p><p><span>Chiết khấu</span><b>-{formatCurrency(summary.discount)} VNĐ</b></p><p><span>Phí vận chuyển</span><b>{formatCurrency(summary.shipping)} VNĐ</b></p><p><span>VAT</span><b>Đã bao gồm</b></p><p className={styles.grand}><span>Tổng cộng</span><b>{formatCurrency(summary.total)} VNĐ</b></p><em>{summary.words}</em></div>
        </section>

        <section className={styles.card}>
          <h2>Dấu mộc công ty</h2>
          <div className={styles.formGrid}>
            <label className={styles.span2}>
              Tải ảnh dấu mộc từ máy
              <input type="file" accept="image/*" onChange={handleStampUpload}/>
              <span className={styles.hint}>Ảnh được lưu trên trình duyệt này (IndexedDB), không tải lên máy chủ.</span>
            </label>
            {stamp?.url && (
              <label className={`${styles.span2} ${styles.rangeField}`}>
                Kích thước dấu mộc ({Math.round((stampPosition.scale ?? 1) * 100)}%)
                <input
                  type="range" min="0.4" max="2.5" step="0.05"
                  value={stampPosition.scale ?? 1}
                  onChange={handleStampScaleChange}
                />
              </label>
            )}
            {stamp?.url && (
              <div className={styles.inlineButton}>
                <button type="button" className={styles.danger} onClick={handleStampClear}><FaTrash/> Xóa dấu mộc</button>
              </div>
            )}
          </div>
          {stamp?.url && <p className={styles.hint}>Mở "Xem trước" và kéo dấu mộc để đặt đúng vị trí mong muốn.</p>}
        </section>

        <section className={styles.card}><h2>Điều khoản báo giá</h2><div className={styles.terms}>{Object.entries(TERM_LABELS).map(([key, label]) => <label key={key}>{label}<textarea value={data.terms?.[key] || ''} onChange={(e) => patch('terms', { ...data.terms, [key]: e.target.value })}/></label>)}</div></section>
        <section className={styles.card}><h2>Người lập báo giá</h2><div className={styles.formGrid}><label>Họ tên<input value={data.prepared_by_name || ''} onChange={(e) => patch('prepared_by_name', e.target.value)}/></label><label>Điện thoại<input value={data.prepared_by_phone || ''} onChange={(e) => patch('prepared_by_phone', e.target.value)}/></label><label>Email<input type="email" value={data.prepared_by_email || ''} onChange={(e) => patch('prepared_by_email', e.target.value)}/></label><label>Trạng thái<select value={data.status} onChange={(e) => patch('status', e.target.value)}>{Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></section>
      </div>
      <PrintInvoice ref={printRef} quotation={data} summary={summary} stamp={stamp} stampPosition={stampPosition}/>
      {preview && <div className={styles.modal} onClick={() => setPreview(false)}><div onClick={(e) => e.stopPropagation()} className={styles.modalBody}><div className={styles.modalActions}><button onClick={handleCopyPreviewImage} disabled={busy === 'copy-image'}><FaCopy/> {busy === 'copy-image' ? 'Đang sao chép...' : 'Sao chép hình'}</button><button onClick={() => setPreview(false)} aria-label="Đóng bản xem trước"><FaXmark/></button></div><PrintInvoice ref={previewRef} quotation={data} summary={summary} preview stamp={stamp} stampPosition={stampPosition} stampEditable={!!stamp?.url} onStampDrag={setStampPosition} onStampDragEnd={handleStampDragEnd}/></div></div>}
    </>
  );
}
