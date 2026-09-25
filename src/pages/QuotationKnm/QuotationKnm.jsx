import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaEye, FaFilePdf, FaFloppyDisk, FaList, FaPrint, FaRotateLeft } from 'react-icons/fa6';
import CompanyInfoForm from '../../components/quotationKnm/CompanyInfoForm.jsx';
import QuoteMetaForm from '../../components/quotationKnm/QuoteMetaForm.jsx';
import CustomerInfoForm from '../../components/quotationKnm/CustomerInfoForm.jsx';
import ProductEditor from '../../components/quotationKnm/ProductEditor.jsx';
import TermsEditor from '../../components/quotationKnm/TermsEditor.jsx';
import QuotePreview from './QuotePreview.jsx';
import QuotePreviewModal from './QuotePreviewModal.jsx';
import { calculateKnmTotals, createDraftKnmQuotation, KNM_DEFAULT_COMPANY, toNetUnitPrice } from '../../utils/knmQuotation.js';
import {
  clearCompanyBankQrAsset, clearCompanyLogoAsset, clearCompanyStampAsset, loadCompanyBankQrAsset, loadCompanyInfo,
  loadCompanyLogoAsset, loadCompanyStampAsset, loadTerms, nextQuotationNumberAsync, saveCompanyBankQrAsset,
  saveCompanyInfo, saveCompanyLogoAsset, saveCompanyStampAsset, saveTerms,
} from '../../utils/knmStorage.js';
import { getKnmQuotation, saveKnmQuotation } from '../../services/knmQuotationService.js';
import styles from './QuotationKnm.module.css';

export default function QuotationKnm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState(() => ({ ...KNM_DEFAULT_COMPANY }));
  const [quotation, setQuotation] = useState(createDraftKnmQuotation);
  const [customerError, setCustomerError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedId, setSavedId] = useState(id || '');
  const [saving, setSaving] = useState(false);

  const numberGenerated = useRef(false);
  const hydrated = useRef(false);
  const logoUrlRef = useRef('');
  const stampUrlRef = useRef('');
  const bankQrUrlRef = useRef('');

  useEffect(() => {
    if (id) return;
    if (numberGenerated.current) return;
    numberGenerated.current = true;
    (async () => {
      const no = await nextQuotationNumberAsync(dayjs().format('YYYYMMDD'));
      setQuotation((current) => (current.quotationNo ? current : { ...current, quotationNo: no }));
    })();
  }, [id]);

  useEffect(() => {
    if (!id) { setSavedId(''); return; }
    setSavedId(id);
    (async () => {
      try {
        const record = await getKnmQuotation(id);
        setCompany((current) => ({ ...current, ...(record.company || {}) }));
        setQuotation((current) => ({ ...current, ...(record.quotation || {}) }));
      } catch (e) {
        toast.error(e.message || 'Không tìm thấy báo giá.');
      }
    })();
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [storedCompany, storedTerms, logoAsset, stampAsset, bankQrAsset] = await Promise.all([
        loadCompanyInfo(), loadTerms(), loadCompanyLogoAsset(), loadCompanyStampAsset(), loadCompanyBankQrAsset(),
      ]);
      if (!active) return;
      setCompany((current) => ({
        ...current,
        ...(storedCompany || {}),
        logo: logoAsset?.url || '',
        logoName: logoAsset?.name || '',
        stamp: stampAsset?.url || '',
        stampName: stampAsset?.name || '',
        bankQr: bankQrAsset?.url || '',
        bankQrName: bankQrAsset?.name || '',
      }));
      logoUrlRef.current = logoAsset?.url || '';
      stampUrlRef.current = stampAsset?.url || '';
      bankQrUrlRef.current = bankQrAsset?.url || '';
      if (storedTerms) setQuotation((current) => ({ ...current, terms: storedTerms }));
      hydrated.current = true;
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
    if (bankQrUrlRef.current) URL.revokeObjectURL(bankQrUrlRef.current);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return undefined;
    const timer = window.setTimeout(() => saveCompanyInfo(company), 400);
    return () => window.clearTimeout(timer);
  }, [company]);

  useEffect(() => {
    if (!hydrated.current) return undefined;
    const timer = window.setTimeout(() => saveTerms(quotation.terms), 400);
    return () => window.clearTimeout(timer);
  }, [quotation.terms]);

  const totals = useMemo(() => calculateKnmTotals(quotation.items, quotation.vatRate), [quotation.items, quotation.vatRate]);
  const fullQuotation = useMemo(() => ({ ...quotation, totals }), [quotation, totals]);

  const patchQuotation = (patch) => setQuotation((current) => ({ ...current, ...patch }));

  const logoHandlers = {
    upload: async (file) => {
      try {
        await saveCompanyLogoAsset(file);
        const asset = await loadCompanyLogoAsset();
        if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
        logoUrlRef.current = asset?.url || '';
        setCompany((current) => ({ ...current, logo: asset?.url || '', logoName: asset?.name || '' }));
      } catch {
        toast.error('Không thể lưu logo vào thiết bị.');
      }
    },
    clear: async () => {
      await clearCompanyLogoAsset();
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = '';
      setCompany((current) => ({ ...current, logo: '', logoName: '' }));
    },
  };

  const stampHandlers = {
    upload: async (file) => {
      try {
        await saveCompanyStampAsset(file);
        const asset = await loadCompanyStampAsset();
        if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
        stampUrlRef.current = asset?.url || '';
        setCompany((current) => ({ ...current, stamp: asset?.url || '', stampName: asset?.name || '' }));
      } catch {
        toast.error('Không thể lưu dấu mộc vào thiết bị.');
      }
    },
    clear: async () => {
      await clearCompanyStampAsset();
      if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
      stampUrlRef.current = '';
      setCompany((current) => ({ ...current, stamp: '', stampName: '' }));
    },
  };

  const bankQrHandlers = {
    upload: async (file) => {
      try {
        await saveCompanyBankQrAsset(file);
        const asset = await loadCompanyBankQrAsset();
        if (bankQrUrlRef.current) URL.revokeObjectURL(bankQrUrlRef.current);
        bankQrUrlRef.current = asset?.url || '';
        setCompany((current) => ({ ...current, bankQr: asset?.url || '', bankQrName: asset?.name || '' }));
      } catch {
        toast.error('Không thể lưu QR ngân hàng vào thiết bị.');
      }
    },
    clear: async () => {
      await clearCompanyBankQrAsset();
      if (bankQrUrlRef.current) URL.revokeObjectURL(bankQrUrlRef.current);
      bankQrUrlRef.current = '';
      setCompany((current) => ({ ...current, bankQr: '', bankQrName: '' }));
    },
  };

  const persistQuotation = async () => {
    if (!quotation.customer.name.trim()) {
      setCustomerError('Tên khách hàng là bắt buộc.');
      toast.error('Vui lòng nhập tên khách hàng trước khi lưu.');
      return null;
    }
    setSaving(true);
    try {
      const record = await saveKnmQuotation({ id: savedId || undefined, company, quotation, totals });
      setSavedId(record.id);
      if (!id) navigate(`/bao-gia-knm/${record.id}/chinh-sua`, { replace: true });
      return record;
    } catch (e) {
      toast.error(e.message || 'Không thể lưu báo giá vào cơ sở dữ liệu.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const record = await persistQuotation();
    if (record) toast.success('Đã lưu báo giá.');
  };

  const triggerPrint = async (asPdf) => {
    if (!quotation.customer.name.trim()) {
      setCustomerError('Tên khách hàng là bắt buộc.');
      toast.error(`Vui lòng nhập tên khách hàng trước khi ${asPdf ? 'xuất PDF' : 'in'}.`);
      return;
    }
    if (asPdf) {
      await persistQuotation();
      toast.info('Trong hộp thoại in, chọn đích đến "Lưu thành PDF / Save as PDF" rồi bấm Lưu.', { autoClose: 6000 });
    }
    window.print();
  };

  const handlePrint = () => triggerPrint(false);
  const handleExportPdf = () => triggerPrint(true);

  const handleReset = () => {
    const hasData = quotation.customer.name.trim() || quotation.items.some((item) => item.description.trim() || Number(item.unitPrice) > 0);
    if (hasData && !window.confirm('Tạo báo giá mới sẽ xóa thông tin khách hàng và sản phẩm hiện tại. Tiếp tục?')) return;
    (async () => {
      const draft = createDraftKnmQuotation();
      draft.quotationNo = await nextQuotationNumberAsync(dayjs(draft.quotationDate).format('YYYYMMDD'));
      draft.terms = quotation.terms;
      setQuotation(draft);
      setCustomerError('');
      setSavedId('');
      if (id) navigate('/bao-gia-knm');
      toast.success('Đã tạo báo giá mới.');
    })();
  };

  return (
    <>
      <Helmet><title>{quotation.quotationNo || 'Báo giá KNM'}</title></Helmet>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            {company.logo
              ? <img className={styles.logoBadge} src={company.logo} alt="Logo" />
              : <div className={styles.logoBadge}>KNM</div>}
            <div className={styles.headerTitle}>
              <h1>TẠO BÁO GIÁ</h1>
              <p>Công cụ tạo báo giá máy móc &amp; thiết bị công nghiệp</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link to="/bao-gia-knm/quan-ly" className={styles.btnManage}><FaList /> Quản lý báo giá</Link>
            <button type="button" className={styles.btnPreview} onClick={() => setPreviewOpen(true)}><FaEye /> Xem trước</button>
            <button type="button" className={styles.btnPrint} onClick={handlePrint}><FaPrint /> In</button>
            <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
              <FaFloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
            <button type="button" className={styles.btnPdf} onClick={handleExportPdf}>
              <FaFilePdf /> Xuất PDF
            </button>
            <button type="button" className={styles.btnReset} onClick={handleReset}><FaRotateLeft /> Tạo báo giá mới</button>
          </div>
        </header>

        <div className={styles.body}>
          <CompanyInfoForm
            company={company}
            onChange={setCompany}
            onLogoUpload={logoHandlers.upload}
            onLogoClear={logoHandlers.clear}
            onStampUpload={stampHandlers.upload}
            onStampClear={stampHandlers.clear}
            onBankQrUpload={bankQrHandlers.upload}
            onBankQrClear={bankQrHandlers.clear}
            styles={styles}
          />
          <QuoteMetaForm quotation={quotation} onChange={patchQuotation} styles={styles} />
          <CustomerInfoForm
            customer={quotation.customer}
            error={customerError}
            onChange={(customer) => { setCustomerError(''); patchQuotation({ customer }); }}
            styles={styles}
          />
          <ProductEditor
            items={quotation.items}
            totals={totals}
            vatRate={quotation.vatRate}
            vatInclusiveInput={quotation.vatInclusiveInput}
            onChange={(items) => patchQuotation({ items })}
            onImport={(imported) => setQuotation((current) => ({
              ...current,
              items: [
                ...current.items.filter((item) => item.description.trim() || item.brand.trim() || Number(item.unitPrice) !== 0 || Number(item.quantity) !== 1 || item.unit !== 'Cái' || item.customUnit),
                ...imported.map((item) => ({
                  ...item,
                  unitPrice: current.vatInclusiveInput ? toNetUnitPrice(item.unitPrice, current.vatRate) : item.unitPrice,
                })),
              ],
            }))}
            styles={styles}
          />
          <TermsEditor terms={quotation.terms} onChange={(terms) => patchQuotation({ terms })} styles={styles} />
        </div>
      </div>

      <QuotePreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} company={company} quotation={fullQuotation} />

      <div className={styles.printHost}>
        <QuotePreview company={company} quotation={fullQuotation} />
      </div>
    </>
  );
}
