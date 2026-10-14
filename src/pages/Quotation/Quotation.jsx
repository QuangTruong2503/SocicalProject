import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import {
  FaBan, FaChevronDown, FaClockRotateLeft, FaCopy, FaEye, FaFileArrowDown, FaFileArrowUp, FaFileExcel, FaFilePdf,
  FaFloppyDisk, FaGripVertical, FaLock, FaMagnifyingGlass, FaPlus, FaPrint, FaRotateLeft, FaTrash, FaXmark,
} from 'react-icons/fa6';
import { toast } from 'react-toastify';
import Dialog from '../../components/dialog/Dialog.jsx';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import CustomerCombobox from '../../components/quotation/CustomerCombobox.jsx';
import MoneyInput from '../../components/quotation/MoneyInput.jsx';
import PrintInvoice from '../../components/quotation/PrintInvoice.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import {
  calculateQuotation, copyQuotationForNew, DEFAULT_ITEM_VAT_RATE, editableSnapshot, emptyQuotation, fileSlug, itemVatRate,
  newItem, QUOTATION_STATUSES, quotationPayload, TERM_LABELS, UNITS, validateQuotation, VAT_EXCLUDED_NOTE,
  VAT_INCLUDED_NOTE, VAT_MODES, VAT_RATES, vatModeKind,
} from '../../utils/quotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import { exportQuotationToPdf } from '../../utils/quotationPdf.js';
import {
  getQuotation, listQuotationHistory, normalizeQuotation, saveQuotation, setQuotationStatus,
} from '../../services/quotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { formatDateTime, formatRelative } from '../../utils/formatters.js';
import { isLikelyTaxCode, lookupBusinessByTaxCode } from '../../utils/taxLookup.js';
import {
  DEFAULT_STAMP_POSITION, clearStampAsset, loadStampAsset, loadStampPosition, saveStampAsset, saveStampPosition,
} from '../../utils/quotationAssets.js';
import { downloadProductImportTemplate, exportProductsToExcel, parseProductImportFile } from '../../utils/quotationImport.js';
import styles from './Quotation.module.css';
import productStyles from './QuotationProduct.module.css';

const VAT_MODE_HINTS = {
  included: 'Đơn giá đã bao gồm VAT.',
  common: 'Đơn giá chưa VAT, áp dụng một mức VAT cho tất cả sản phẩm.',
  per_item: 'Đơn giá chưa VAT, chọn mức VAT ở từng sản phẩm.',
};

const HISTORY_ACTIONS = { create: 'Tạo báo giá', update: 'Sửa nội dung', status: 'Đổi trạng thái', delete: 'Xóa bản nháp' };
const HISTORY_FIELDS = {
  status: 'Trạng thái', quotation_date: 'Ngày báo giá', customer_name: 'Khách hàng', contact_name: 'Người liên hệ',
  phone: 'Điện thoại', email: 'Email', address: 'Địa chỉ', tax_code: 'MST', note: 'Ghi chú', vat_mode: 'Cách tính VAT',
  discount_type: 'Loại chiết khấu', discount_value: 'Chiết khấu', shipping_fee: 'Phí vận chuyển', total: 'Tổng tiền',
  item_count: 'Số dòng sản phẩm', quotation_no: 'Số báo giá',
};

const EXPORT_PARAMS = ['pdf', 'excel', 'print'];

function readBackup(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && value.data ? value : null;
  } catch {
    return null;
  }
}

function writeBackup(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the server copy is still the source of truth.
  }
}

function removeBackup(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function formatHistoryValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status') return QUOTATION_STATUSES[value] || value;
  if (field === 'total' || field === 'discount_value' || field === 'shipping_fee') return `${formatCurrency(value)} đ`;
  if (field === 'vat_mode') return value === 'included' ? 'Gồm VAT' : value === 'per_item' ? 'VAT từng sản phẩm' : `VAT ${value}%`;
  return String(value);
}

export default function Quotation() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const printRef = useRef(null);
  const previewRef = useRef(null);
  const exportMenuRef = useRef(null);
  const identityRef = useRef({ user, profile });
  const backupKey = `quotation:backup:${user?.id || 'anonymous'}:${id || 'new'}`;

  // "Sao chép" passes the source in router state. The router reuses this component between
  // routes, so remember the request per history entry; once saved (URL has an id) it is ignored.
  const incomingCopy = id ? null : location.state?.copyOf ?? null;
  const [copyRequest, setCopyRequest] = useState(() => (incomingCopy ? { key: location.key, source: incomingCopy } : null));
  if (incomingCopy && copyRequest?.key !== location.key) setCopyRequest({ key: location.key, source: incomingCopy });
  const copySource = id ? null : copyRequest?.source ?? null;
  const [data, setData] = useState(() => emptyQuotation(profile, user));
  const [meta, setMeta] = useState({ updatedAt: null, preparedBy: null });
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [restoreOffer, setRestoreOffer] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [saveBeforeExport, setSaveBeforeExport] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [taxLookupState, setTaxLookupState] = useState('idle');
  const [preview, setPreview] = useState(false);
  const [stamp, setStamp] = useState(null);
  const [stampPosition, setStampPositionState] = useState(DEFAULT_STAMP_POSITION);
  const stampPositionRef = useRef(DEFAULT_STAMP_POSITION);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [stampOpen, setStampOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [history, setHistory] = useState({ open: false, loading: false, items: [], error: '' });
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteItemIndex, setDeleteItemIndex] = useState(null);
  const [confirmClearItems, setConfirmClearItems] = useState(false);

  const ready = savedSnapshot !== null;
  const isNew = !data.id;
  const canEdit = isNew || isAdmin || (meta.preparedBy && meta.preparedBy === user?.id);
  const isCancelled = !isNew && data.status === 'cancelled';
  const readOnly = !canEdit || isCancelled;
  const dirty = ready && !readOnly && editableSnapshot(data) !== savedSnapshot;
  const summary = useMemo(() => calculateQuotation(data), [data]);
  const hasItemContent = data.items.length > 1 || data.items.some((item) => item.product_name?.trim() || item.description?.trim());

  const print = useReactToPrint({ contentRef: printRef, documentTitle: `Bao-gia-${data.quotation_no || 'moi'}` });
  const patch = (name, value) => setData((current) => ({ ...current, [name]: value }));
  const patchItem = (index, name, value) => setData((current) => ({
    ...current, items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [name]: value } : item)),
  }));
  const setStampPosition = (position) => { stampPositionRef.current = position; setStampPositionState(position); };

  useEffect(() => { identityRef.current = { user, profile }; }, [user, profile]);

  // ── Load: the server copy is the source of truth; a local backup is only offered for restore ──
  useEffect(() => {
    let active = true;

    async function load() {
      const { user: currentUser, profile: currentProfile } = identityRef.current;
      setLoadError('');
      setSavedSnapshot(null);
      setRestoreOffer(null);

      try {
        if (copySource) {
          const copy = copyQuotationForNew(copySource, currentProfile, currentUser);
          if (!active) return;
          setData(copy);
          setMeta({ updatedAt: null, preparedBy: currentUser?.id ?? null });
          // A copy is unsaved work until the user saves it.
          setSavedSnapshot(editableSnapshot(emptyQuotation(currentProfile, currentUser)));
          return;
        }

        const server = id ? normalizeQuotation(await getQuotation(id)) : emptyQuotation(currentProfile, currentUser);
        if (!active) return;
        setData(server);
        setMeta({ updatedAt: server.updated_at ?? null, preparedBy: server.prepared_by ?? currentUser?.id ?? null });
        setSavedSnapshot(editableSnapshot(server));

        const backup = readBackup(backupKey);
        if (backup && editableSnapshot(backup.data) !== editableSnapshot(server)) {
          setRestoreOffer({
            data: backup.data,
            savedAt: backup.savedAt,
            stale: Boolean(id) && backup.baseUpdatedAt !== server.updated_at,
          });
        }
      } catch (error) {
        if (active) setLoadError(error.message);
      }
    }

    load();
    return () => { active = false; };
  }, [id, backupKey, reloadToken, copySource]);

  // Profile can arrive after the page: fill "Người lập" only if still empty.
  useEffect(() => {
    if (!isNew || !profile) return;
    setData((current) => (current.prepared_by_name ? current : {
      ...current,
      prepared_by_name: profile.full_name || profile.username || user?.email || '',
      prepared_by_phone: current.prepared_by_phone || profile.phone || '',
      prepared_by_email: current.prepared_by_email || profile.email || user?.email || '',
    }));
  }, [isNew, profile, user?.email]);

  // ── Local backup of unsaved changes (never overrides the server automatically) ──
  useEffect(() => {
    if (!ready || restoreOffer) return undefined;
    if (!dirty) {
      removeBackup(backupKey);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      writeBackup(backupKey, { data, baseUpdatedAt: meta.updatedAt, savedAt: new Date().toISOString() });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [backupKey, data, dirty, meta.updatedAt, ready, restoreOffer]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    loadStampAsset().then((asset) => { if (asset) setStamp(asset); });
    loadStampPosition().then((position) => { if (position) setStampPosition(position); });
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return undefined;
    const closeMenu = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) setExportMenuOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setExportMenuOpen(false); };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [exportMenuOpen]);

  const loadHistory = useCallback(async (quotationId) => {
    setHistory((current) => ({ ...current, loading: true, error: '' }));
    try {
      const items = await listQuotationHistory(quotationId);
      setHistory((current) => ({ ...current, loading: false, items }));
    } catch (error) {
      setHistory((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  const validate = (draft) => {
    const next = validateQuotation(data, draft);
    setErrors(next);
    if (Object.keys(next).length) toast.error('Vui lòng kiểm tra các trường được đánh dấu.');
    return !Object.keys(next).length;
  };

  // ── Save ──
  const handleSave = async ({ overwrite = false, afterSave = '' } = {}) => {
    if (readOnly) return null;
    if (!validate(data.status === 'draft')) return null;
    setBusy('save');

    try {
      const result = await saveQuotation(quotationPayload(data, data.status), overwrite ? null : meta.updatedAt);
      const saved = {
        ...data,
        id: result.id,
        quotation_no: result.quotation_no,
        quotation_date: result.quotation_date,
        customer_id: result.customer_id || data.customer_id,
        updated_at: result.updated_at,
      };
      setConflict(null);
      removeBackup(backupKey);

      if (!id) {
        toast.success(`Đã lưu và cấp số ${result.quotation_no}.`);
        navigate(`/bao-gia-minh-triet/${result.id}/chinh-sua${afterSave ? `?${afterSave}=1` : ''}`, { replace: true });
        return saved;
      }

      setData(saved);
      setMeta((current) => ({ ...current, updatedAt: result.updated_at }));
      setSavedSnapshot(editableSnapshot(saved));
      toast.success('Đã lưu báo giá.');
      if (history.open) loadHistory(result.id);
      return saved;
    } catch (error) {
      if (error.code === 'conflict') setConflict(error.message);
      else toast.error(error.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  // Status of a saved quotation changes immediately and on its own (recorded in the history).
  const handleStatusChange = async (status) => {
    if (isNew) {
      patch('status', status);
      return;
    }
    setBusy('status');
    try {
      const result = await setQuotationStatus(data.id, status);
      setData((current) => ({ ...current, status: result.status, updated_at: result.updated_at }));
      setMeta((current) => ({ ...current, updatedAt: result.updated_at }));
      toast.success(`Đã chuyển sang “${QUOTATION_STATUSES[result.status]}”.`);
      if (history.open) loadHistory(data.id);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  // ── Exports never write to the database ──
  const runExport = useCallback(async (kind, source = data) => {
    const sourceSummary = calculateQuotation(source);
    if (kind === 'print') {
      print();
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'pdf') {
        await exportQuotationToPdf(source, sourceSummary, stamp, stampPositionRef.current);
        toast.success('Đã tạo PDF và tải xuống.');
      } else {
        await exportQuotationToExcel(source, sourceSummary);
        toast.success('Đã xuất Excel theo mẫu công ty.');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  }, [data, print, stamp]);

  const requestExport = (kind) => {
    setExportMenuOpen(false);
    if (!data.quotation_no) {
      setSaveBeforeExport(kind);
      return;
    }
    if (!validate(false)) return;
    runExport(kind);
  };

  // ?pdf=1 / ?excel=1 / ?print=1 (from the list, or right after a first save): export the server copy once.
  const autoExport = EXPORT_PARAMS.find((kind) => searchParams.get(kind) === '1');
  useEffect(() => {
    if (!ready || !autoExport || !data.quotation_no) return;
    setSearchParams({}, { replace: true });
    // Let the hidden print sheet render the loaded data first.
    window.setTimeout(() => runExport(autoExport), 50);
  }, [autoExport, data.quotation_no, ready, runExport, setSearchParams]);

  const handleDuplicate = () => {
    navigate('/bao-gia-minh-triet/tao-moi', { state: { copyOf: data } });
    toast.info('Đã tạo bản sao chưa lưu. Số báo giá sẽ được cấp khi lưu.');
  };

  const handleClose = () => {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    navigate('/bao-gia-minh-triet');
  };

  // Blur fills only empty fields; the button overwrites on purpose.
  const lookupTaxCode = async (overwrite) => {
    const taxCode = (data.tax_code || '').trim();
    if (!isLikelyTaxCode(taxCode)) {
      if (overwrite) toast.error('Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0123456789-001).');
      setTaxLookupState('idle');
      return;
    }
    setTaxLookupState('loading');
    try {
      const info = await lookupBusinessByTaxCode(taxCode);
      setData((current) => ({
        ...current,
        customer_name: overwrite || !current.customer_name?.trim() ? (info.name || current.customer_name) : current.customer_name,
        address: overwrite || !current.address?.trim() ? (info.address || current.address) : current.address,
      }));
      setTaxLookupState('done');
    } catch (error) {
      setTaxLookupState('error');
      toast.error(error.message || 'Không tìm thấy thông tin doanh nghiệp với mã số thuế này.');
    }
  };

  const setVatMode = (kind) => setData((current) => {
    const excluded = kind !== 'included';
    const note = current.terms?.note;
    let nextNote = note;
    if (excluded && (!note || note === VAT_INCLUDED_NOTE)) nextNote = VAT_EXCLUDED_NOTE;
    if (!excluded && (!note || note === VAT_EXCLUDED_NOTE)) nextNote = VAT_INCLUDED_NOTE;
    let vatMode = kind;
    if (kind === 'common') vatMode = vatModeKind(current) === 'common' ? current.vat_mode : String(DEFAULT_ITEM_VAT_RATE);
    return { ...current, vat_mode: vatMode, terms: { ...current.terms, note: nextNote } };
  });

  const dropItem = (index) => {
    setData((current) => {
      if (dragIndex === null || dragIndex === index) return current;
      const items = [...current.items];
      const [moved] = items.splice(dragIndex, 1);
      items.splice(index, 0, moved);
      return { ...current, items };
    });
    setDragIndex(null);
  };

  const handleStampUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('stamp');
    try {
      await saveStampAsset(file);
      setStamp(await loadStampAsset());
      toast.success('Đã lưu dấu mộc vào trình duyệt này.');
    } catch (error) {
      toast.error(error.message || 'Không thể lưu dấu mộc.');
    } finally {
      setBusy('');
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

  const handleExportProducts = () => {
    try {
      const count = exportProductsToExcel(data.items, `San-pham-${fileSlug(data.quotation_no) || 'bao-gia'}.xlsx`);
      toast.success(`Đã xuất ${count} sản phẩm ra file Excel.`);
    } catch (error) {
      toast.error(error.message || 'Không thể xuất file Excel.');
    }
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
      const canvas = await html2canvas(previewRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Không thể tạo hình báo giá.'))),
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

  if (loadError) {
    return (
      <div className={styles.page}>
        <section className={`${styles.card} ${styles.loadError}`} role="alert">
          <h2>Không mở được báo giá</h2>
          <p>{loadError}</p>
          <div className={styles.bannerActions}>
            <button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button>
            <button type="button" onClick={() => navigate('/bao-gia-minh-triet')}>Về danh sách</button>
          </div>
        </section>
      </div>
    );
  }

  const statusSelect = (
    <label className={styles.statusControl}>
      <span>Trạng thái</span>
      <select
        value={data.status}
        onChange={(event) => handleStatusChange(event.target.value)}
        disabled={!canEdit || !ready || busy === 'status'}
        aria-label="Trạng thái báo giá"
      >
        {Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <Helmet><title>{`${isNew ? 'Tạo báo giá' : data.quotation_no || 'Báo giá'} · Minh Triết`}</title></Helmet>
      <div className={styles.page} aria-busy={!ready}>
        <header className={styles.pageHeader}>
          <div>
            <span>QUẢN LÝ BÁO GIÁ</span>
            <h1>{isNew ? 'TẠO BÁO GIÁ' : readOnly ? 'XEM BÁO GIÁ' : 'CHỈNH SỬA BÁO GIÁ'}</h1>
            <p className={styles.metaLine}>
              <b>{data.quotation_no || 'Chưa có số · cấp khi lưu'}</b>
              <span aria-hidden="true">·</span>
              <span className={styles.metaTotal}>{formatCurrency(summary.total)} đ</span>
              <span aria-hidden="true">·</span>
              {dirty
                ? <span className={styles.unsaved} role="status">● Chưa lưu</span>
                : !isNew && data.updated_at && <span title={formatDateTime(data.updated_at)}>Đã lưu {formatRelative(data.updated_at)}</span>}
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.outlineAction} onClick={handleClose}><FaXmark/> Đóng</button>
            {isNew && dirty && <button type="button" className={styles.outlineAction} onClick={() => setConfirmReset(true)}><FaRotateLeft/> Làm trống</button>}
            {!isNew && <button type="button" className={styles.outlineAction} onClick={handleDuplicate} disabled={!ready}><FaCopy/> Sao chép</button>}
            <button type="button" className={styles.outlineAction} onClick={() => setPreview(true)} disabled={!ready}><FaEye/> Xem trước</button>
            <div className={styles.exportMenu} ref={exportMenuRef}>
              <button
                type="button" className={styles.outlineAction} onClick={() => setExportMenuOpen((open) => !open)}
                disabled={!ready || !!busy} aria-expanded={exportMenuOpen} aria-controls="quotation-export-menu"
              >
                <FaFileArrowDown/> Xuất <FaChevronDown className={exportMenuOpen ? styles.chevronOpen : undefined}/>
              </button>
              {exportMenuOpen && (
                <div className={styles.exportMenuList} id="quotation-export-menu">
                  <button type="button" onClick={() => requestExport('pdf')}><FaFilePdf/> {busy === 'pdf' ? 'Đang tạo PDF…' : 'Xuất PDF'}</button>
                  <button type="button" onClick={() => requestExport('excel')}><FaFileExcel/> {busy === 'excel' ? 'Đang xuất…' : 'Xuất Excel'}</button>
                  <button type="button" onClick={() => requestExport('print')}><FaPrint/> In</button>
                </div>
              )}
            </div>
            {statusSelect}
            {!readOnly && (
              <button type="button" className={styles.primary} onClick={() => handleSave()} disabled={!ready || !!busy || (!isNew && !dirty)}>
                <FaFloppyDisk/> {busy === 'save' ? 'Đang lưu…' : isNew ? 'Lưu & cấp số' : 'Lưu'}
              </button>
            )}
          </div>
        </header>

        {restoreOffer && (
          <div className={`${styles.banner} ${restoreOffer.stale ? styles.bannerWarning : styles.bannerInfo}`} role="status">
            <FaClockRotateLeft aria-hidden="true"/>
            <span>
              Có thay đổi chưa lưu trên máy này từ {formatRelative(restoreOffer.savedAt)}.
              {restoreOffer.stale && ' Báo giá đã được cập nhật sau đó — nếu khôi phục rồi lưu, bản của bạn sẽ đè lên.'}
            </span>
            <div className={styles.bannerActions}>
              <button
                type="button"
                onClick={() => {
                  setData((current) => ({
                    ...restoreOffer.data,
                    id: current.id,
                    quotation_no: current.quotation_no,
                    status: current.status,
                    prepared_by: current.prepared_by,
                    updated_at: current.updated_at,
                  }));
                  setRestoreOffer(null);
                }}
              >
                Khôi phục
              </button>
              <button type="button" onClick={() => { removeBackup(backupKey); setRestoreOffer(null); }}>Bỏ qua</button>
            </div>
          </div>
        )}

        {ready && !canEdit && (
          <div className={`${styles.banner} ${styles.bannerInfo}`} role="status">
            <FaLock aria-hidden="true"/>
            <span>Báo giá do <b>{data.prepared_by_name || 'nhân viên khác'}</b> lập. Bạn có thể xem, xuất file hoặc tạo bản sao, nhưng chỉ người lập và quản trị viên được sửa.</span>
          </div>
        )}

        {ready && canEdit && isCancelled && (
          <div className={`${styles.banner} ${styles.bannerDanger}`} role="status">
            <FaBan aria-hidden="true"/>
            <span>Báo giá đã hủy nên đang ở chế độ chỉ xem.</span>
            <div className={styles.bannerActions}>
              <button type="button" onClick={() => handleStatusChange('draft')} disabled={busy === 'status'}><FaRotateLeft/> Mở lại báo giá</button>
            </div>
          </div>
        )}

        <fieldset className={styles.fieldset} disabled={readOnly || !ready}>
          <section className={styles.card}>
            <h2>Thông tin khách hàng &amp; báo giá</h2>
            <div className={styles.twoColGrid}>
              <div className={styles.formColumn}>
                <h3 className={styles.columnTitle}>Khách hàng</h3>
                <label>Mã số thuế
                  <div className={styles.inputWithButton}>
                    <input
                      placeholder="Nhập MST để tự điền tên & địa chỉ còn trống"
                      value={data.tax_code || ''}
                      onChange={(event) => { patch('tax_code', event.target.value); setTaxLookupState('idle'); }}
                      onBlur={() => lookupTaxCode(false)}
                    />
                    <button type="button" onClick={() => lookupTaxCode(true)} disabled={taxLookupState === 'loading'} aria-label="Tra cứu và điền theo MST" title="Tra cứu và điền theo MST (ghi đè tên, địa chỉ)"><FaMagnifyingGlass/></button>
                  </div>
                  {taxLookupState === 'loading' && <small>Đang tra cứu…</small>}
                  {taxLookupState === 'done' && <small>Đã điền theo dữ liệu tra cứu MST.</small>}
                </label>
                <label>Tên khách hàng / công ty *
                  <CustomerCombobox
                    value={data.customer_name}
                    placeholder="Gõ để tìm khách đã lưu, hoặc nhập khách mới"
                    invalid={Boolean(errors.customer_name)}
                    onChange={(value) => setData((current) => ({ ...current, customer_name: value, customer_id: '' }))}
                    onSelect={(customer) => setData((current) => ({
                      ...current,
                      customer_id: customer.id,
                      customer_name: customer.name,
                      contact_name: customer.contact_name || current.contact_name,
                      phone: customer.phone || current.phone,
                      email: customer.email || current.email,
                      address: customer.address || current.address,
                      tax_code: customer.tax_code || current.tax_code,
                    }))}
                    disabled={readOnly || !ready}
                  />
                  {errors.customer_name && <small>{errors.customer_name}</small>}
                </label>
                <label>Người liên hệ<input placeholder="Họ tên người nhận báo giá" value={data.contact_name || ''} onChange={(event) => patch('contact_name', event.target.value)}/></label>
                <label>Số điện thoại<input inputMode="tel" placeholder="Ví dụ: 0901 234 567" value={data.phone || ''} onChange={(event) => patch('phone', event.target.value)}/>{errors.phone && <small>{errors.phone}</small>}</label>
                <label>Email<input type="email" placeholder="email@congty.vn" value={data.email || ''} onChange={(event) => patch('email', event.target.value)}/>{errors.email && <small>{errors.email}</small>}</label>
                <label>Địa chỉ<textarea placeholder="Số nhà, đường, phường/xã, tỉnh/thành phố" value={data.address || ''} onChange={(event) => patch('address', event.target.value)}/></label>
              </div>
              <div className={styles.formColumn}>
                <h3 className={styles.columnTitle}>Đơn báo giá</h3>
                <label>Ngày báo giá<input type="date" value={data.quotation_date || ''} onChange={(event) => patch('quotation_date', event.target.value)}/>{errors.quotation_date && <small>{errors.quotation_date}</small>}</label>
                <div className={styles.readonlyField}>
                  <span>Số báo giá</span>
                  <b>{data.quotation_no || 'Sẽ được cấp tự động khi lưu lần đầu'}</b>
                </div>
                <label>Ghi chú<textarea placeholder="Ghi chú riêng dành cho báo giá này" value={data.note || ''} onChange={(event) => patch('note', event.target.value)}/></label>
              </div>
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
                <button type="button" onClick={handleExportProducts}><FaFileExcel/> Xuất sản phẩm ra Excel</button>
                <button type="button" className={styles.danger} onClick={() => setConfirmClearItems(true)} disabled={!hasItemContent}><FaTrash/> Xóa tất cả</button>
                <button type="button" className={styles.primary} onClick={() => patch('items', [...data.items, newItem()])}><FaPlus/> Thêm sản phẩm</button>
              </div>
            </div>
            <div className={styles.vatToggle}>
              <label>Cách tính VAT
                <select value={summary.vatMode} onChange={(event) => setVatMode(event.target.value)}>
                  {Object.entries(VAT_MODES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              {summary.vatMode === 'common' && (
                <label>VAT chung
                  <select value={String(data.vat_mode)} onChange={(event) => patch('vat_mode', event.target.value)}>
                    {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                  </select>
                </label>
              )}
              <span>{VAT_MODE_HINTS[summary.vatMode]}</span>
            </div>
            {errors.items && <p className={styles.error}>{errors.items}</p>}
            <div className={styles.tableWrap}><table className={styles.itemsTable}>
              <thead><tr><th className={styles.dragCol}></th><th>STT</th><th>Tên và mô tả sản phẩm *</th><th>Thương hiệu</th><th>Số lượng</th><th>ĐVT</th><th>{summary.vatExcluded ? 'Đơn giá chưa VAT' : 'Đơn giá'}</th><th>{summary.vatExcluded ? 'Thành tiền chưa VAT' : 'Thành tiền'}</th>{summary.vatMode === 'per_item' && <th>VAT</th>}<th></th></tr></thead>
              <tbody>{data.items.map((item, index) => (
                <tr
                  key={item.key || item.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropItem(index)}
                  className={dragIndex === index ? styles.dragging : undefined}
                >
                  <td className={styles.dragHandle}><span draggable={!readOnly} onDragStart={() => setDragIndex(index)} onDragEnd={() => setDragIndex(null)} title="Kéo để sắp xếp"><FaGripVertical/></span></td>
                  <td>{index + 1}</td>
                  <td><div className={productStyles.productEditor}><input aria-label={`Tên sản phẩm ${index + 1}`} placeholder="Tên sản phẩm" value={item.product_name || ''} onChange={(event) => patchItem(index, 'product_name', event.target.value)}/>{errors[`item_${index}_product_name`] && <small>{errors[`item_${index}_product_name`]}</small>}<textarea aria-label={`Mô tả sản phẩm ${index + 1}`} placeholder="Mô tả sản phẩm (có thể nhập nhiều dòng)" value={item.description || ''} onChange={(event) => patchItem(index, 'description', event.target.value)}/></div></td>
                  <td><input aria-label={`Thương hiệu ${index + 1}`} placeholder="Thương hiệu" value={item.brand || ''} onChange={(event) => patchItem(index, 'brand', event.target.value)}/></td>
                  <td><input aria-label={`Số lượng ${index + 1}`} type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => patchItem(index, 'quantity', event.target.value)}/>{errors[`item_${index}_quantity`] && <small>{errors[`item_${index}_quantity`]}</small>}</td>
                  <td><input aria-label={`Đơn vị tính ${index + 1}`} list="units" placeholder="ĐVT" value={item.unit} onChange={(event) => patchItem(index, 'unit', event.target.value)}/></td>
                  <td><MoneyInput aria-label={`Đơn giá ${index + 1}`} className={styles.moneyInput} value={item.unit_price} onChange={(value) => patchItem(index, 'unit_price', value)}/>{errors[`item_${index}_unit_price`] && <small>{errors[`item_${index}_unit_price`]}</small>}</td>
                  <td className={styles.money}>{formatCurrency(Number(item.quantity) * Number(item.unit_price))}</td>
                  {summary.vatMode === 'per_item' && <td className={styles.vatCell}>
                    <select aria-label={`VAT sản phẩm ${index + 1}`} value={String(itemVatRate(item))} onChange={(event) => patchItem(index, 'vat_rate', Number(event.target.value))}>
                      {VAT_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                    </select>
                  </td>}
                  <td><button type="button" className={styles.danger} disabled={data.items.length === 1} onClick={() => setDeleteItemIndex(index)} aria-label={`Xóa sản phẩm ${index + 1}`}><FaTrash/></button></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={summary.vatMode === 'per_item' ? 10 : 9} className={styles.addRow}><button type="button" onClick={() => patch('items', [...data.items, newItem()])}><FaPlus/> Thêm sản phẩm</button></td></tr></tfoot>
            </table><datalist id="units">{UNITS.map((unit) => <option key={unit} value={unit}/>)}</datalist></div>

            <div className={styles.totalsRow}>
              <div className={styles.adjustments}>
                <label>Chiết khấu
                  <div className={styles.inputWithButton}>
                    {data.discount_type === 'percent'
                      ? <input type="number" min="0" max="100" step="0.5" aria-label="Chiết khấu (%)" value={data.discount_value || 0} onChange={(event) => patch('discount_value', Number(event.target.value) || 0)}/>
                      : <MoneyInput aria-label="Chiết khấu (VNĐ)" value={data.discount_value || 0} onChange={(value) => patch('discount_value', value)}/>}
                    <select aria-label="Loại chiết khấu" value={data.discount_type || 'amount'} onChange={(event) => setData((current) => ({ ...current, discount_type: event.target.value, discount_value: 0 }))}>
                      <option value="amount">VNĐ</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </label>
                <label>Phí vận chuyển
                  <MoneyInput aria-label="Phí vận chuyển (VNĐ)" value={data.shipping_fee || 0} onChange={(value) => patch('shipping_fee', value)}/>
                </label>
              </div>
              <div className={styles.totalsCard}>
                <p><span>Tạm tính</span><b>{formatCurrency(summary.subtotal)} VNĐ</b></p>
                {summary.discount > 0 && <p><span>Chiết khấu</span><b>-{formatCurrency(summary.discount)} VNĐ</b></p>}
                {summary.shipping > 0 && <p><span>Phí vận chuyển</span><b>{formatCurrency(summary.shipping)} VNĐ</b></p>}
                {summary.vatExcluded ? (<>
                  <p><span>Tổng tiền</span><b>{formatCurrency(summary.preVat)} VNĐ</b></p>
                  {summary.vatLines.map((line) => <p key={line.rate}><span>VAT {line.rate}%</span><b>{formatCurrency(line.amount)} VNĐ</b></p>)}
                  <p className={styles.grand}><span>Tổng tiền đã gồm VAT</span><b>{formatCurrency(summary.total)} VNĐ</b></p>
                </>) : (<>
                  <p><span>VAT</span><b>Đã bao gồm</b></p>
                  <p className={styles.grand}><span>Tổng cộng</span><b>{formatCurrency(summary.total)} VNĐ</b></p>
                </>)}
                <em>{summary.words}</em>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <button type="button" className={styles.collapsibleHeader} onClick={() => setTermsOpen((open) => !open)} aria-expanded={termsOpen}>
              <h2>Điều khoản báo giá</h2>
              <FaChevronDown className={termsOpen ? styles.chevronOpen : undefined}/>
            </button>
            {termsOpen && <div className={styles.terms}>{Object.entries(TERM_LABELS).map(([key, label]) => <label key={key}>{label}<textarea value={data.terms?.[key] || ''} onChange={(event) => patch('terms', { ...data.terms, [key]: event.target.value })}/></label>)}</div>}
          </section>

          <section className={styles.card}>
            <h2>Người lập báo giá</h2>
            <div className={styles.formGrid}>
              <label>Họ tên<input value={data.prepared_by_name || ''} onChange={(event) => patch('prepared_by_name', event.target.value)}/></label>
              <label>Điện thoại<input value={data.prepared_by_phone || ''} onChange={(event) => patch('prepared_by_phone', event.target.value)}/></label>
              <label>Email<input type="email" value={data.prepared_by_email || ''} onChange={(event) => patch('prepared_by_email', event.target.value)}/></label>
            </div>
          </section>
        </fieldset>

        {/* The stamp is a setting of this browser, not part of the quotation. */}
        <section className={styles.card}>
          <button type="button" className={styles.collapsibleHeader} onClick={() => setStampOpen((open) => !open)} aria-expanded={stampOpen}>
            <div className={styles.collapsibleHeaderTitle}>
              <h2>Dấu mộc công ty</h2>
              {stamp?.url && <img src={stamp.url} alt="Dấu mộc đã lưu" className={styles.stampThumb}/>}
            </div>
            <FaChevronDown className={stampOpen ? styles.chevronOpen : undefined}/>
          </button>
          {stampOpen && (<>
            {stamp?.url && (
              <div className={styles.stampPreviewBox}>
                <img src={stamp.url} alt="Dấu mộc đã lưu"/>
                <span>Dấu mộc được lưu trên trình duyệt này.</span>
              </div>
            )}
            <div className={styles.formGrid}>
              <label className={styles.span2}>
                Tải ảnh dấu mộc từ máy
                <input type="file" accept="image/*" onChange={handleStampUpload} disabled={busy === 'stamp'}/>
                <span className={styles.hint}>{busy === 'stamp' ? 'Đang lưu dấu mộc…' : 'Ảnh được lưu trên trình duyệt này (IndexedDB), không tải lên máy chủ.'}</span>
              </label>
              {stamp?.url && (
                <label className={`${styles.span2} ${styles.rangeField}`}>
                  Kích thước dấu mộc ({Math.round((stampPosition.scale ?? 1) * 100)}%)
                  <input
                    type="range" min="0.4" max="2.5" step="0.05"
                    value={stampPosition.scale ?? 1}
                    onChange={(event) => {
                      const next = { ...stampPositionRef.current, scale: Number(event.target.value) };
                      setStampPosition(next);
                      saveStampPosition(next).catch(() => {});
                    }}
                  />
                </label>
              )}
              {stamp?.url && (
                <div className={styles.inlineButton}>
                  <button type="button" className={styles.danger} onClick={handleStampClear} disabled={busy === 'stamp'}><FaTrash/> Xóa dấu mộc</button>
                </div>
              )}
            </div>
            {stamp?.url && <p className={styles.hint}>Mở “Xem trước” và kéo dấu mộc để đặt đúng vị trí.</p>}
          </>)}
        </section>

        {!isNew && (
          <section className={styles.card}>
            <button
              type="button"
              className={styles.collapsibleHeader}
              aria-expanded={history.open}
              onClick={() => {
                const open = !history.open;
                setHistory((current) => ({ ...current, open }));
                if (open) loadHistory(data.id);
              }}
            >
              <h2>Lịch sử thay đổi</h2>
              <FaChevronDown className={history.open ? styles.chevronOpen : undefined}/>
            </button>
            {history.open && (
              history.loading ? <p className={styles.hint}>Đang tải…</p>
                : history.error ? <p className={styles.error}>{history.error}</p>
                  : !history.items.length ? <p className={styles.hint}>Chưa có lịch sử (báo giá tạo trước khi có tính năng này).</p>
                    : (
                      <ol className={styles.historyList}>
                        {history.items.map((entry) => (
                          <li key={entry.id}>
                            <div className={styles.historyMeta}>
                              <strong>{HISTORY_ACTIONS[entry.action] || entry.action}</strong>
                              <span>{entry.actor_name || 'Không rõ'} · <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{formatRelative(entry.created_at)}</time></span>
                            </div>
                            {entry.action !== 'create' && Object.keys(entry.changes || {}).length > 0 && (
                              <ul>
                                {Object.entries(entry.changes).map(([field, change]) => (
                                  <li key={field}>{HISTORY_FIELDS[field] || field}: {formatHistoryValue(field, change?.from)} → <b>{formatHistoryValue(field, change?.to)}</b></li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    )
            )}
          </section>
        )}
      </div>

      <PrintInvoice ref={printRef} quotation={data} summary={summary} stamp={stamp} stampPosition={stampPosition}/>

      {preview && (
        <Dialog title={`Xem trước ${data.quotation_no || 'báo giá'}`} onClose={() => setPreview(false)} variant="wide">
          <div className={styles.previewToolbar}>
            <button type="button" className={styles.primary} onClick={handleCopyPreviewImage} disabled={busy === 'copy-image'}>
              <FaCopy/> {busy === 'copy-image' ? 'Đang sao chép…' : 'Sao chép hình'}
            </button>
            {stamp?.url && <span className={styles.hint}>Kéo dấu mộc để đặt vị trí.</span>}
          </div>
          <PrintInvoice
            ref={previewRef}
            quotation={data}
            summary={summary}
            preview
            stamp={stamp}
            stampPosition={stampPosition}
            stampEditable={!!stamp?.url}
            onStampDrag={(position) => setStampPosition({ ...stampPositionRef.current, ...position })}
            onStampDragEnd={() => saveStampPosition(stampPositionRef.current).catch(() => {})}
          />
        </Dialog>
      )}

      {conflict && (
        <Dialog title="Báo giá vừa được người khác lưu" onClose={() => setConflict(null)} busy={busy === 'save'}>
          <p className={styles.dialogText}>{conflict} Bạn muốn làm gì với thay đổi của mình?</p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => setConflict(null)}>Để sau</button>
            <button type="button" onClick={() => { setConflict(null); removeBackup(backupKey); setReloadToken((token) => token + 1); }}>
              Tải bản mới nhất (bỏ thay đổi của tôi)
            </button>
            <button type="button" className={styles.dangerAction} onClick={() => handleSave({ overwrite: true })} disabled={busy === 'save'}>
              Lưu đè bằng bản của tôi
            </button>
          </div>
        </Dialog>
      )}

      {leaveOpen && (
        <Dialog title="Rời trang khi chưa lưu?" onClose={() => setLeaveOpen(false)}>
          <p className={styles.dialogText}>Thay đổi chưa lưu vẫn được giữ trên máy này và sẽ được đề nghị khôi phục khi bạn mở lại.</p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={() => setLeaveOpen(false)} data-dialog-initial>Ở lại</button>
            <button type="button" onClick={() => { removeBackup(backupKey); navigate('/bao-gia-minh-triet'); }}>Bỏ thay đổi</button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                // The backup is debounced; write the latest edits before leaving.
                writeBackup(backupKey, { data, baseUpdatedAt: meta.updatedAt, savedAt: new Date().toISOString() });
                navigate('/bao-gia-minh-triet');
              }}
            >
              Rời trang, giữ bản nháp
            </button>
          </div>
        </Dialog>
      )}

      {saveBeforeExport && (
        <ConfirmDialog
          title="Lưu báo giá trước khi xuất?"
          message="Báo giá chưa được lưu nên chưa có số. Lưu ngay để cấp số rồi xuất file."
          confirmLabel="Lưu & xuất"
          busy={busy === 'save'}
          onConfirm={async () => {
            const kind = saveBeforeExport;
            const saved = await handleSave({ afterSave: kind });
            if (saved) setSaveBeforeExport(null);
          }}
          onCancel={() => setSaveBeforeExport(null)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Làm trống báo giá?"
          message="Xóa thông tin khách hàng và sản phẩm đang nhập để bắt đầu lại."
          confirmLabel="Làm trống"
          danger
          onConfirm={() => {
            removeBackup(backupKey);
            setData(emptyQuotation(profile, user));
            setErrors({});
            setTaxLookupState('idle');
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {deleteItemIndex !== null && (
        <ConfirmDialog
          title="Xóa sản phẩm?"
          message={`Xóa dòng ${deleteItemIndex + 1}${data.items[deleteItemIndex]?.product_name ? ` (${data.items[deleteItemIndex].product_name})` : ''}?`}
          confirmLabel="Xóa"
          danger
          onConfirm={() => {
            patch('items', data.items.filter((_, index) => index !== deleteItemIndex));
            setDeleteItemIndex(null);
          }}
          onCancel={() => setDeleteItemIndex(null)}
        />
      )}

      {confirmClearItems && (
        <ConfirmDialog
          title="Xóa tất cả sản phẩm?"
          message={`Xóa toàn bộ ${data.items.length} sản phẩm trong báo giá.`}
          confirmLabel="Xóa tất cả"
          danger
          onConfirm={() => {
            patch('items', [newItem()]);
            setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'items' && !key.startsWith('item_'))));
            setConfirmClearItems(false);
          }}
          onCancel={() => setConfirmClearItems(false)}
        />
      )}
    </>
  );
}
