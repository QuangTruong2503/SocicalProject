import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { FaCopy, FaEye, FaFileExcel, FaFilePdf, FaFloppyDisk, FaPlus, FaPrint, FaTrash, FaXmark } from 'react-icons/fa6';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth.js';
import { calculateQuotation, emptyQuotation, newItem, normalizeLocalQuotation, QUOTATION_STATUSES, UNITS, validateQuotation, quotationPayload } from '../../utils/quotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import { exportQuotationToPdf } from '../../utils/quotationPdf.js';
import { createCustomer, getNextQuotationNumber, getQuotation, listCustomers, normalizeQuotation, saveQuotation } from '../../services/quotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import PrintInvoice from '../../components/quotation/PrintInvoice.jsx';
import styles from './Quotation.module.css';
import productStyles from './QuotationProduct.module.css';

const termLabels = {
  note: 'Ghi chú', deliveryPlace: 'Địa điểm giao hàng', deliveryTime: 'Thời gian giao hàng',
  payment: 'Phương thức thanh toán', quality: 'Chất lượng hàng hóa', validity: 'Hiệu lực báo giá',
};

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
  const [customers, setCustomers] = useState([]);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(false);
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
          const record = normalizeQuotation(await getQuotation(id));
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
          if (!next.quotation_no) next.quotation_no = await getNextQuotationNumber(next.quotation_date);
          if (active) setData(next);
        }
      } catch (error) { toast.error(error.message); }
      finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, [id, profile, storageKey, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listCustomers(data.customer_name).then(setCustomers).catch(() => setCustomers([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [data.customer_name]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      toast.error('Không thể lưu bản nháp trên trình duyệt.');
    }
  }, [data, ready, storageKey]);

  const chooseCustomer = (customer) => setData((current) => ({
    ...current, customer_id: customer.id, customer_name: customer.name,
    contact_name: customer.contact_name || '', phone: customer.phone || '', email: customer.email || '',
    address: customer.address || '', tax_code: customer.tax_code || '',
  }));

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

  const handleCreateCustomer = async () => {
    if (!data.customer_name.trim()) return toast.error('Hãy nhập tên khách hàng trước.');
    setBusy('customer');
    try { chooseCustomer(await createCustomer(data, user.id)); toast.success('Đã thêm khách hàng.'); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const handleExport = async () => {
    if (!validate(false)) return;
    setBusy('excel');
    try { await exportQuotationToExcel(data, summary); toast.success('Đã xuất Excel theo mẫu công ty.'); }
    catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
  };

  const handleExportPdf = async () => {
    if (!validate(false)) return;
    setBusy('pdf');
    try {
      await exportQuotationToPdf(data, summary);
      toast.success('Đã tạo PDF tại trình duyệt và tải xuống.');
    } catch (error) { toast.error(error.message); }
    finally { setBusy(''); }
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
    exportQuotationToPdf(data, summary)
      .then(() => toast.success('Đã tạo PDF tại trình duyệt và tải xuống.'))
      .catch((error) => toast.error(error.message))
      .finally(() => setBusy(''));
  }, [data, ready, searchParams, summary]);

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

  return (
    <>
      <Helmet><title>{id ? 'Chỉnh sửa' : 'Tạo'} báo giá</title></Helmet>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div><span>QUẢN LÝ BÁO GIÁ</span><h1>{id ? 'CHỈNH SỬA BÁO GIÁ' : 'TẠO BÁO GIÁ'}</h1></div>
          <div className={styles.actions}>
            <button className={styles.secondaryAction} onClick={() => handleSave('draft')} disabled={!!busy}><FaFloppyDisk/> Lưu nháp</button>
            <button className={styles.primary} onClick={() => handleSave('created')} disabled={!!busy}><FaFloppyDisk/> Lưu báo giá</button>
            <button className={styles.previewAction} onClick={() => setPreview(true)}><FaEye/> Xem trước</button>
            <button className={styles.excelAction} onClick={handleExport} disabled={!!busy}><FaFileExcel/> {busy === 'excel' ? 'Đang xuất...' : 'Xuất Excel'}</button>
            <button className={styles.pdfAction} onClick={handleExportPdf} disabled={!!busy}><FaFilePdf/> {busy === 'pdf' ? 'Đang chuyển PDF...' : 'Xuất PDF'}</button>
            <button onClick={print}><FaPrint/> In</button>
            <button onClick={duplicate} disabled={!!busy}><FaCopy/> Tạo bản sao</button>
            <button onClick={() => navigate('/admin/bao-gia')}><FaXmark/> Hủy</button>
          </div>
        </header>

        <section className={styles.card}>
          <h2>Thông tin khách hàng</h2>
          <div className={styles.formGrid}>
            <label className={styles.span2}>Tên khách hàng / công ty *<input placeholder="Ví dụ: Công ty TNHH Minh Triết" value={data.customer_name} onChange={(e) => patch('customer_name', e.target.value)} list="customer-list"/>{errors.customer_name && <small>{errors.customer_name}</small>}</label>
            <datalist id="customer-list">{customers.map((customer) => <option key={customer.id} value={customer.name}/>)}</datalist>
            <label>Khách hàng đã lưu<select value={data.customer_id || ''} onChange={(e) => chooseCustomer(customers.find((item) => item.id === e.target.value) || {})}><option value="">-- Chọn khách hàng --</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select></label>
            <div className={styles.inlineButton}><button type="button" onClick={handleCreateCustomer} disabled={busy === 'customer'}><FaPlus/> Tạo khách hàng mới</button></div>
            <label>Người liên hệ<input placeholder="Họ tên người nhận báo giá" value={data.contact_name || ''} onChange={(e) => patch('contact_name', e.target.value)}/></label>
            <label>Số điện thoại<input inputMode="tel" placeholder="Ví dụ: 0901 234 567" value={data.phone || ''} onChange={(e) => patch('phone', e.target.value)}/>{errors.phone && <small>{errors.phone}</small>}</label>
            <label>Email<input type="email" placeholder="email@congty.vn" value={data.email || ''} onChange={(e) => patch('email', e.target.value)}/>{errors.email && <small>{errors.email}</small>}</label>
            <label>Mã số thuế<input placeholder="Nhập mã số thuế khách hàng" value={data.tax_code || ''} onChange={(e) => patch('tax_code', e.target.value)}/></label>
            <label className={styles.span2}>Địa chỉ<textarea placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" value={data.address || ''} onChange={(e) => patch('address', e.target.value)}/></label>
            <label>Ngày báo giá<input type="date" value={data.quotation_date} onChange={(e) => patch('quotation_date', e.target.value)}/></label>
            <label>Số báo giá<input value={data.quotation_no} onChange={(e) => patch('quotation_no', e.target.value)}/>{errors.quotation_no && <small>{errors.quotation_no}</small>}</label>
            <label className={styles.span2}>Ghi chú<textarea placeholder="Ghi chú riêng dành cho báo giá này" value={data.note || ''} onChange={(e) => patch('note', e.target.value)}/></label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.sectionTitle}><div><h2>Thông tin sản phẩm</h2><p>Nhập tên, mô tả, số lượng và đơn giá của từng sản phẩm.</p></div><button className={styles.primary} onClick={() => patch('items', [...data.items, newItem()])}><FaPlus/> Thêm sản phẩm</button></div>
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
          </table><datalist id="units">{UNITS.map((unit) => <option key={unit} value={unit}/>)}</datalist></div>
        </section>

        <section className={`${styles.card} ${styles.summaryCard}`}>
          <div className={styles.totals}><p><span>Tạm tính</span><b>{formatCurrency(summary.subtotal)} VNĐ</b></p><p><span>Chiết khấu</span><b>-{formatCurrency(summary.discount)} VNĐ</b></p><p><span>Phí vận chuyển</span><b>{formatCurrency(summary.shipping)} VNĐ</b></p><p><span>VAT</span><b>Đã bao gồm</b></p><p className={styles.grand}><span>Tổng cộng</span><b>{formatCurrency(summary.total)} VNĐ</b></p><em>{summary.words}</em></div>
        </section>

        <section className={styles.card}><h2>Điều khoản báo giá</h2><div className={styles.terms}>{Object.entries(termLabels).map(([key, label]) => <label key={key}>{label}<textarea value={data.terms?.[key] || ''} onChange={(e) => patch('terms', { ...data.terms, [key]: e.target.value })}/></label>)}</div></section>
        <section className={styles.card}><h2>Người lập báo giá</h2><div className={styles.formGrid}><label>Họ tên<input value={data.prepared_by_name || ''} onChange={(e) => patch('prepared_by_name', e.target.value)}/></label><label>Điện thoại<input value={data.prepared_by_phone || ''} onChange={(e) => patch('prepared_by_phone', e.target.value)}/></label><label>Email<input type="email" value={data.prepared_by_email || ''} onChange={(e) => patch('prepared_by_email', e.target.value)}/></label><label>Trạng thái<select value={data.status} onChange={(e) => patch('status', e.target.value)}>{Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></section>
      </div>
      <PrintInvoice ref={printRef} quotation={data} summary={summary}/>
      {preview && <div className={styles.modal} onClick={() => setPreview(false)}><div onClick={(e) => e.stopPropagation()} className={styles.modalBody}><div className={styles.modalActions}><button onClick={handleCopyPreviewImage} disabled={busy === 'copy-image'}><FaCopy/> {busy === 'copy-image' ? 'Đang sao chép...' : 'Sao chép hình'}</button><button onClick={() => setPreview(false)} aria-label="Đóng bản xem trước"><FaXmark/></button></div><PrintInvoice ref={previewRef} quotation={data} summary={summary} preview/></div></div>}
    </>
  );
}
