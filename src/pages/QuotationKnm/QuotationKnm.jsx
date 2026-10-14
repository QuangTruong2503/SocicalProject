import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaCopy, FaEye, FaFloppyDisk, FaList, FaLock, FaPlus, FaPrint, FaSpinner, FaTableColumns,
} from 'react-icons/fa6';
import Dialog from '../../components/dialog/Dialog.jsx';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import dialogStyles from '../../components/dialog/Dialog.module.css';
import CompanyInfoForm from '../../components/quotationKnm/CompanyInfoForm.jsx';
import QuoteMetaForm from '../../components/quotationKnm/QuoteMetaForm.jsx';
import CustomerInfoForm from '../../components/quotationKnm/CustomerInfoForm.jsx';
import ProductEditor from '../../components/quotationKnm/ProductEditor.jsx';
import TermsEditor from '../../components/quotationKnm/TermsEditor.jsx';
import QuotePreview from './QuotePreview.jsx';
import QuotePreviewModal from './QuotePreviewModal.jsx';
import QuoteLivePreview from './QuoteLivePreview.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import {
  calculateKnmTotals, copyKnmQuotationForNew, createDraftKnmQuotation, KNM_DEFAULT_COMPANY, knmEditableSnapshot,
  knmFileSlug, normalizeKnmQuotation, validateKnmQuotation,
} from '../../utils/knmQuotation.js';
import { clearLocalKnmAsset, loadCompanyInfo, loadLocalKnmAsset, loadTerms, saveCompanyInfo, saveTerms } from '../../utils/knmStorage.js';
import {
  clearKnmCompanyAsset, getKnmQuotation, KNM_ASSET_KINDS, loadKnmCompanyAssets, saveKnmQuotation, uploadKnmCompanyAsset,
} from '../../services/knmQuotationService.js';
import { formatDateTime, formatRelative } from '../../utils/formatters.js';
import styles from './QuotationKnm.module.css';

const LIST_PATH = '/bao-gia-knm/quan-ly';
const NEW_PATH = '/bao-gia-knm';
const AUTO_SPLIT_PREF = 'knm:autoSplitVat';
const SIDE_PREVIEW_PREF = 'knm:sidePreview';
const NO_ASSETS = { logo: null, stamp: null, bank_qr: null };

function readPref(key) {
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}

function writePref(key, value) {
  try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
}

function readBackup(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && value.quotation && value.company ? value : null;
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

/** Defaults first, then each source; missing/null fields (older records) keep the default. */
function mergeCompany(...sources) {
  const result = { ...KNM_DEFAULT_COMPANY };
  sources.forEach((source) => {
    Object.entries(source || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key in KNM_DEFAULT_COMPANY) result[key] = value;
    });
  });
  return { ...result, logo: '', logoName: '', stamp: '', stampName: '', bankQr: '', bankQrName: '' };
}

export default function QuotationKnm() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const userId = user?.id ?? null;
  const backupKey = `knm-quotation:backup:${userId || 'anonymous'}:${id || 'new'}`;

  // "Sao chép" passes the source in router state. The router reuses this component between
  // routes, so remember the request per history entry; once saved (URL has an id) it is ignored.
  const incomingCopy = id ? null : location.state?.copyOf ?? null;
  const [copyRequest, setCopyRequest] = useState(() => (incomingCopy ? { key: location.key, source: incomingCopy } : null));
  if (incomingCopy && copyRequest?.key !== location.key) setCopyRequest({ key: location.key, source: incomingCopy });
  const copySource = id ? null : copyRequest?.source ?? null;

  const [company, setCompany] = useState(() => mergeCompany());
  const [quotation, setQuotation] = useState(createDraftKnmQuotation);
  const [meta, setMeta] = useState({ updatedAt: null, createdBy: null, createdByName: '', updatedByName: '' });
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [restoreOffer, setRestoreOffer] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [pendingLeave, setPendingLeave] = useState(null);
  const [saveBeforePrint, setSaveBeforePrint] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sidePreview, setSidePreview] = useState(() => readPref(SIDE_PREVIEW_PREF));
  const [assets, setAssets] = useState(NO_ASSETS);
  const [assetsState, setAssetsState] = useState({ ready: false, error: '' });
  const [assetsToken, setAssetsToken] = useState(0);
  const [localAssets, setLocalAssets] = useState(NO_ASSETS);
  const [assetBusy, setAssetBusy] = useState('');
  const defaultsTouched = useRef(false);
  const userIdRef = useRef(userId);

  const ready = savedSnapshot !== null;
  const isNew = !id;
  const canEdit = isNew || isAdmin || Boolean(meta.createdBy && meta.createdBy === userId);
  const readOnly = !canEdit;
  const snapshot = useMemo(() => knmEditableSnapshot(company, quotation), [company, quotation]);
  const dirty = ready && !readOnly && snapshot !== savedSnapshot;
  const totals = useMemo(() => calculateKnmTotals(quotation), [quotation]);
  const fullQuotation = useMemo(() => ({ ...quotation, totals }), [quotation, totals]);
  const errors = useMemo(() => (showErrors ? validateKnmQuotation(quotation) : {}), [showErrors, quotation]);
  const previewCompany = useMemo(() => ({
    ...company,
    logo: assets.logo?.url || '',
    stamp: assets.stamp?.url || '',
    bankQr: assets.bank_qr?.url || '',
  }), [company, assets]);

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ── Load: the server copy is the source of truth; a local backup is only offered for restore ──
  useEffect(() => {
    let active = true;

    async function load() {
      setLoadError('');
      setSavedSnapshot(null);
      setRestoreOffer(null);
      setShowErrors(false);
      setConflict(null);
      defaultsTouched.current = false;

      try {
        let nextCompany;
        let nextQuotation;
        let baseline;
        let nextMeta;

        if (id) {
          const record = await getKnmQuotation(id);
          nextCompany = mergeCompany(record.company);
          nextQuotation = {
            ...createDraftKnmQuotation(),
            ...normalizeKnmQuotation(record.quotation),
            quotationNo: record.quotation_no,
          };
          baseline = knmEditableSnapshot(nextCompany, nextQuotation);
          nextMeta = {
            updatedAt: record.updated_at,
            createdBy: record.created_by,
            createdByName: record.created_by_name || '',
            updatedByName: record.updated_by_name || '',
          };
        } else {
          // Device defaults apply to new quotations only, never to saved ones.
          const [storedCompany, storedTerms] = await Promise.all([loadCompanyInfo(), loadTerms()]);
          const defaultsCompany = mergeCompany(storedCompany);
          const draft = { ...createDraftKnmQuotation(), autoSplitVat: readPref(AUTO_SPLIT_PREF) };
          if (storedTerms) draft.terms = storedTerms;
          baseline = knmEditableSnapshot(defaultsCompany, draft);
          if (copySource) {
            // A copy is unsaved work until the user saves it.
            nextCompany = mergeCompany(copySource.company);
            nextQuotation = copyKnmQuotationForNew({ ...draft, ...copySource.quotation });
          } else {
            nextCompany = defaultsCompany;
            nextQuotation = draft;
          }
          nextMeta = { updatedAt: null, createdBy: userIdRef.current, createdByName: '', updatedByName: '' };
        }
        if (!active) return;

        setCompany(nextCompany);
        setQuotation(nextQuotation);
        setMeta(nextMeta);
        setSavedSnapshot(baseline);

        // Also after a reload of a copy (the router keeps the copy request): edits on it are only in the backup.
        const backup = readBackup(backupKey);
        if (backup && knmEditableSnapshot(backup.company, backup.quotation) !== knmEditableSnapshot(nextCompany, nextQuotation)) {
          setRestoreOffer({ ...backup, stale: Boolean(id) && backup.baseUpdatedAt !== nextMeta.updatedAt });
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Không mở được báo giá.');
      }
    }

    load();
    return () => { active = false; };
  }, [id, backupKey, reloadToken, copySource]);

  // ── Shared company images (logo, stamp, bank QR) ──
  useEffect(() => {
    let active = true;
    loadKnmCompanyAssets()
      .then((next) => { if (active) { setAssets(next); setAssetsState({ ready: true, error: '' }); } })
      .catch((error) => { if (active) setAssetsState({ ready: true, error: error.message }); });
    return () => { active = false; };
  }, [assetsToken]);

  // Images uploaded before v2 live only on the device: offer them to admins for kinds still missing.
  useEffect(() => {
    if (!isAdmin || !assetsState.ready) return undefined;
    let active = true;
    const created = [];
    Promise.all(KNM_ASSET_KINDS.map(async (kind) => {
      if (assets[kind]) return [kind, null];
      const local = await loadLocalKnmAsset(kind);
      if (local) created.push(local.url);
      return [kind, local];
    })).then((entries) => { if (active) setLocalAssets(Object.fromEntries(entries)); });
    return () => {
      active = false;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets, assetsState.ready, isAdmin]);

  // ── Local backup of unsaved changes (never overrides the server automatically) ──
  useEffect(() => {
    if (!ready || restoreOffer) return undefined;
    if (!dirty) {
      removeBackup(backupKey);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      writeBackup(backupKey, { company, quotation, baseUpdatedAt: meta.updatedAt, savedAt: new Date().toISOString() });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [backupKey, company, quotation, dirty, meta.updatedAt, ready, restoreOffer]);

  // Company info and terms edited on a new quotation become this device's defaults.
  useEffect(() => {
    if (!isNew || !ready || !defaultsTouched.current) return undefined;
    const timer = window.setTimeout(() => {
      saveCompanyInfo(company);
      saveTerms(quotation.terms);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [company, quotation.terms, isNew, ready]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changeCompany = (next) => {
    defaultsTouched.current = true;
    setCompany(next);
  };

  const changeQuotation = (next) => {
    if (Boolean(next.autoSplitVat) !== Boolean(quotation.autoSplitVat)) writePref(AUTO_SPLIT_PREF, next.autoSplitVat);
    setQuotation(next);
  };

  const patchQuotation = (patch) => setQuotation((current) => ({ ...current, ...patch }));

  const focusFirstError = () => {
    window.setTimeout(() => {
      const target = document.querySelector('[aria-invalid="true"]');
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target?.focus({ preventScroll: true });
    }, 0);
  };

  const validate = () => {
    const found = validateKnmQuotation(quotation);
    setShowErrors(true);
    if (Object.keys(found).length) {
      toast.error('Vui lòng kiểm tra các trường được đánh dấu.');
      focusFirstError();
      return false;
    }
    return true;
  };

  // ── Save ──
  const handleSave = async ({ overwrite = false, after = '' } = {}) => {
    if (readOnly || busy === 'save' || !ready) return null;
    if (!validate()) return null;
    setBusy('save');
    try {
      const result = await saveKnmQuotation({ id, company, quotation }, overwrite ? null : meta.updatedAt);
      setConflict(null);
      removeBackup(backupKey);

      if (!id) {
        toast.success(`Đã lưu và cấp số ${result.quotation_no}.`);
        navigate(`/bao-gia-knm/${result.id}/chinh-sua${after ? `?${after}=1` : ''}`, { replace: true });
        return result;
      }

      const saved = { ...quotation, quotationNo: result.quotation_no };
      setQuotation(saved);
      setMeta((current) => ({ ...current, updatedAt: result.updated_at, updatedByName: result.updated_by_name || current.updatedByName }));
      setSavedSnapshot(knmEditableSnapshot(company, saved));
      toast.success('Đã lưu báo giá.');
      return result;
    } catch (error) {
      if (error.code === 'conflict') {
        // Keep the edits right away: "Tải bản mới nhất" may come before the debounced backup.
        writeBackup(backupKey, { company, quotation, baseUpdatedAt: meta.updatedAt, savedAt: new Date().toISOString() });
        setConflict(error.message);
      } else {
        toast.error(error.message);
      }
      return null;
    } finally {
      setBusy('');
    }
  };

  const saveRef = useRef(handleSave);
  useEffect(() => { saveRef.current = handleSave; });

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Print / PDF: never writes to the database ──
  const runPrint = useCallback(() => {
    const previousTitle = document.title;
    // The browser suggests the document title as the PDF file name.
    document.title = ['Bao-gia', knmFileSlug(quotation.quotationNo), knmFileSlug(quotation.customer.name)].filter(Boolean).join('-');
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }, [quotation.quotationNo, quotation.customer.name]);

  const requestPrint = () => {
    if (!ready) return;
    if (!validate()) return;
    if (!quotation.quotationNo) {
      setSaveBeforePrint(true);
      return;
    }
    runPrint();
  };

  // ?in=1 (from the list, or right after "Lưu & in"): print the loaded copy once images are in.
  const autoPrint = searchParams.get('in') === '1';
  useEffect(() => {
    if (!ready || !autoPrint || !quotation.quotationNo || !assetsState.ready) return;
    setSearchParams({}, { replace: true });
    // Not cleared on re-run: removing ?in=1 re-runs this effect right away. Let the print sheet paint first.
    window.setTimeout(runPrint, 150);
  }, [autoPrint, assetsState.ready, quotation.quotationNo, ready, runPrint, setSearchParams]);

  // ── Navigation ──
  const goTo = (path) => {
    if (dirty) {
      setPendingLeave(path);
      return;
    }
    if (path === NEW_PATH && !id) {
      setReloadToken((token) => token + 1);
      return;
    }
    navigate(path);
  };

  const confirmLeave = () => {
    const path = pendingLeave;
    setPendingLeave(null);
    if (path === NEW_PATH && !id) {
      removeBackup(backupKey);
      setReloadToken((token) => token + 1);
      return;
    }
    navigate(path);
  };

  const handleDuplicate = () => {
    navigate(NEW_PATH, { state: { copyOf: { company, quotation } } });
    toast.info('Đã tạo bản sao chưa lưu. Số báo giá sẽ được cấp khi lưu.');
  };

  const restoreBackup = () => {
    if (!restoreOffer) return;
    setCompany(mergeCompany(restoreOffer.company));
    setQuotation((current) => ({ ...current, ...restoreOffer.quotation, quotationNo: current.quotationNo }));
    setRestoreOffer(null);
    toast.success('Đã khôi phục thay đổi chưa lưu.');
  };

  const discardBackup = () => {
    removeBackup(backupKey);
    setRestoreOffer(null);
  };

  const toggleSidePreview = () => {
    setSidePreview((current) => {
      writePref(SIDE_PREVIEW_PREF, !current);
      return !current;
    });
  };

  // ── Company images (admin) ──
  const withAsset = async (kind, task, success) => {
    setAssetBusy(kind);
    try {
      await task();
      setAssetsToken((token) => token + 1);
      toast.success(success);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setAssetBusy('');
    }
  };

  const assetHandlers = {
    upload: (kind, file) => withAsset(kind, () => uploadKnmCompanyAsset(kind, file), 'Đã cập nhật ảnh cho cả công ty.'),
    clear: (kind) => withAsset(kind, () => clearKnmCompanyAsset(kind), 'Đã xóa ảnh.'),
    useLocal: (kind) => withAsset(kind, async () => {
      const local = localAssets[kind];
      if (!local) return;
      const file = new File([local.blob], local.name || `${kind}.png`, { type: local.blob.type || 'image/png' });
      await uploadKnmCompanyAsset(kind, file);
      await clearLocalKnmAsset(kind);
    }, 'Đã đưa ảnh trên máy này lên làm ảnh chung.'),
  };

  if (loadError) {
    return (
      <div className={styles.page}>
        <div className={styles.workspace}>
          <div className={`${styles.banner} ${styles.bannerDanger}`} role="alert">
            <p><b>Không mở được báo giá.</b> {loadError}</p>
            <div className={styles.bannerActions}>
              <button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button>
              <button type="button" onClick={() => navigate(LIST_PATH)}>Về danh sách</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  let stateLabel;
  if (!ready) stateLabel = <span className={styles.saveState}>Đang tải…</span>;
  else if (readOnly) stateLabel = <span className={`${styles.saveState} ${styles.saveStateLocked}`}><FaLock aria-hidden="true" /> Chỉ xem</span>;
  else if (dirty) stateLabel = <span className={`${styles.saveState} ${styles.saveStateDirty}`}>Chưa lưu</span>;
  else if (isNew) stateLabel = <span className={`${styles.saveState} ${styles.saveStateNew}`}>Báo giá mới, chưa lưu</span>;
  else stateLabel = <span className={styles.saveState} title={formatDateTime(meta.updatedAt)}>Đã lưu {formatRelative(meta.updatedAt)}</span>;

  const title = isNew ? 'BÁO GIÁ MỚI' : `BÁO GIÁ ${quotation.quotationNo || ''}`.trim();

  return (
    <>
      <Helmet><title>{isNew ? 'Báo giá KNM mới' : `${quotation.quotationNo || 'Báo giá'} · KNM`}</title></Helmet>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            {assets.logo?.url
              ? <img className={styles.logoBadge} src={assets.logo.url} alt="" />
              : <div className={styles.logoBadge} aria-hidden="true">KNM</div>}
            <div className={styles.headerTitle}>
              <h1>{title}</h1>
              <p>
                {stateLabel}
                {!isNew && meta.createdByName && <span>Lập bởi {meta.createdByName}</span>}
                {!isNew && meta.updatedByName && meta.updatedByName !== meta.createdByName && <span>· Sửa gần nhất: {meta.updatedByName}</span>}
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.iconOnlyMobile} onClick={() => goTo(LIST_PATH)} aria-label="Danh sách báo giá">
              <FaList /> <span className={styles.btnLabel}>Danh sách</span>
            </button>
            <button type="button" className={styles.iconOnlyMobile} onClick={() => setPreviewOpen(true)} disabled={!ready} aria-label="Xem trước">
              <FaEye /> <span className={styles.btnLabel}>Xem trước</span>
            </button>
            <button
              type="button"
              className={`${styles.sidePreviewToggle} ${sidePreview ? styles.btnToggleOn : ''}`}
              onClick={toggleSidePreview}
              aria-pressed={sidePreview}
            >
              <FaTableColumns /> Xem bên cạnh
            </button>
            <button type="button" className={styles.iconOnlyMobile} onClick={requestPrint} disabled={!ready} aria-label="In hoặc xuất PDF">
              <FaPrint /> <span className={styles.btnLabel}>In / PDF</span>
            </button>
            {!isNew && (
              <button type="button" className={styles.iconOnlyMobile} onClick={handleDuplicate} disabled={!ready} aria-label="Sao chép thành báo giá mới">
                <FaCopy /> <span className={styles.btnLabel}>Sao chép</span>
              </button>
            )}
            <button type="button" className={styles.iconOnlyMobile} onClick={() => goTo(NEW_PATH)} aria-label="Tạo báo giá mới">
              <FaPlus /> <span className={styles.btnLabel}>Tạo mới</span>
            </button>
            {!readOnly && (
              <button type="button" className={styles.btnPrimary} onClick={() => handleSave()} disabled={!ready || busy === 'save'} title="Ctrl + S">
                {busy === 'save' ? <FaSpinner className={styles.spin} /> : <FaFloppyDisk />}
                {busy === 'save' ? 'Đang lưu…' : isNew ? 'Lưu & cấp số' : 'Lưu'}
              </button>
            )}
          </div>
        </header>

        <div className={`${styles.workspace} ${sidePreview ? styles.workspaceSplit : ''}`}>
          {(restoreOffer || (readOnly && ready) || assetsState.error) && (
            <div className={styles.banners}>
              {restoreOffer && (
                <div className={`${styles.banner} ${styles.bannerWarn}`} role="status">
                  <p>
                    <b>Có thay đổi chưa lưu</b> từ {formatDateTime(restoreOffer.savedAt)} trên máy này.
                    {restoreOffer.stale && ' Báo giá đã được cập nhật trên server sau thời điểm đó, hãy kiểm tra kỹ trước khi lưu.'}
                  </p>
                  <div className={styles.bannerActions}>
                    <button type="button" className={styles.bannerPrimary} onClick={restoreBackup}>Khôi phục</button>
                    <button type="button" onClick={discardBackup}>Bỏ qua</button>
                  </div>
                </div>
              )}
              {readOnly && ready && (
                <div className={`${styles.banner} ${styles.bannerInfo}`} role="status">
                  <p>
                    <FaLock aria-hidden="true" /> Báo giá do <b>{meta.createdByName || 'người khác'}</b> lập.
                    Chỉ người lập và quản trị viên được sửa; bạn vẫn xem, in và sao chép được.
                  </p>
                  <div className={styles.bannerActions}>
                    <button type="button" className={styles.bannerPrimary} onClick={handleDuplicate}><FaCopy /> Sao chép thành báo giá mới</button>
                  </div>
                </div>
              )}
              {assetsState.error && (
                <div className={`${styles.banner} ${styles.bannerWarn}`} role="status">
                  <p>Không tải được logo, dấu mộc, QR: {assetsState.error}</p>
                  <div className={styles.bannerActions}>
                    <button type="button" onClick={() => setAssetsToken((token) => token + 1)}>Thử lại</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!ready ? (
            <div className={`${styles.card} ${styles.loadingCard}`} role="status">
              <FaSpinner className={styles.spin} /> Đang tải báo giá…
            </div>
          ) : (
            <div className={styles.body}>
              <CompanyInfoForm
                company={company}
                onChange={changeCompany}
                assets={assets}
                localAssets={localAssets}
                assetBusy={assetBusy}
                canManageAssets={isAdmin}
                onAssetUpload={assetHandlers.upload}
                onAssetClear={assetHandlers.clear}
                onAssetUseLocal={assetHandlers.useLocal}
                isNew={isNew}
                readOnly={readOnly}
                styles={styles}
              />
              <QuoteMetaForm quotation={quotation} onChange={changeQuotation} readOnly={readOnly} styles={styles} />
              <CustomerInfoForm
                customer={quotation.customer}
                errors={errors}
                onChange={(customer) => patchQuotation({ customer })}
                readOnly={readOnly}
                styles={styles}
              />
              <ProductEditor
                quotation={quotation}
                totals={totals}
                errors={errors}
                readOnly={readOnly}
                onChange={(items) => patchQuotation({ items })}
                onImport={(imported) => setQuotation((current) => ({
                  ...current,
                  items: [
                    ...current.items.filter((item) => item.description.trim() || item.brand.trim() || Number(item.unitPrice) !== 0
                      || Number(item.grossUnitPrice) > 0 || Number(item.quantity) !== 1 || item.unit !== 'Cái' || item.customUnit),
                    ...imported,
                  ],
                }))}
                styles={styles}
              />
              <TermsEditor
                terms={quotation.terms}
                onChange={(terms) => { defaultsTouched.current = true; patchQuotation({ terms }); }}
                readOnly={readOnly}
                styles={styles}
              />
            </div>
          )}

          {sidePreview && ready && (
            <aside className={styles.sidePreview} aria-label="Xem trước bản in">
              <h2>XEM TRƯỚC A4</h2>
              <QuoteLivePreview company={previewCompany} quotation={fullQuotation} />
            </aside>
          )}
        </div>
      </div>

      <QuotePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} company={previewCompany} quotation={fullQuotation} />

      <div className={styles.printHost}>
        <QuotePreview company={previewCompany} quotation={fullQuotation} />
      </div>

      {conflict && (
        <Dialog title="Báo giá vừa được người khác cập nhật" onClose={() => setConflict(null)} busy={busy === 'save'}>
          <p className={dialogStyles.message}>
            {conflict} Thay đổi của bạn vẫn được giữ tạm trên máy này.
          </p>
          <div className={dialogStyles.actions}>
            <button type="button" className={dialogStyles.button} onClick={() => setConflict(null)} disabled={busy === 'save'}>Để sau</button>
            <button
              type="button"
              className={dialogStyles.button}
              onClick={() => { setConflict(null); setReloadToken((token) => token + 1); }}
              disabled={busy === 'save'}
              data-dialog-initial
            >
              Tải bản mới nhất
            </button>
            <button
              type="button"
              className={`${dialogStyles.button} ${dialogStyles.danger}`}
              onClick={() => handleSave({ overwrite: true })}
              disabled={busy === 'save'}
            >
              Lưu đè
            </button>
          </div>
        </Dialog>
      )}

      {pendingLeave && (
        <ConfirmDialog
          title={pendingLeave === NEW_PATH && !id ? 'Bỏ báo giá đang soạn?' : 'Rời trang khi chưa lưu?'}
          message={pendingLeave === NEW_PATH && !id
            ? 'Nội dung đang soạn sẽ bị xóa để bắt đầu báo giá mới.'
            : 'Thay đổi chưa lưu vẫn được giữ tạm trên máy này và sẽ được đề nghị khôi phục khi bạn mở lại báo giá.'}
          confirmLabel={pendingLeave === NEW_PATH && !id ? 'Bỏ và tạo mới' : 'Rời trang'}
          danger
          onConfirm={confirmLeave}
          onCancel={() => setPendingLeave(null)}
        />
      )}

      {saveBeforePrint && (
        <ConfirmDialog
          title="Lưu báo giá trước khi in?"
          message="Báo giá mới chưa có số. Lưu để được cấp số, sau đó hộp thoại in sẽ mở. Chọn “Lưu thành PDF / Save as PDF” để xuất PDF."
          confirmLabel="Lưu & in"
          busy={busy === 'save'}
          onConfirm={async () => {
            await handleSave({ after: 'in' });
            setSaveBeforePrint(false);
          }}
          onCancel={() => setSaveBeforePrint(false)}
        />
      )}
    </>
  );
}
