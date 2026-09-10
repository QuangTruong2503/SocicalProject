import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaEye, FaFilePdf, FaPrint, FaRotateLeft } from 'react-icons/fa6';
import CompanyInfoForm from '../../components/quotationKnm/CompanyInfoForm.jsx';
import QuoteMetaForm from '../../components/quotationKnm/QuoteMetaForm.jsx';
import CustomerInfoForm from '../../components/quotationKnm/CustomerInfoForm.jsx';
import ProductEditor from '../../components/quotationKnm/ProductEditor.jsx';
import TermsEditor from '../../components/quotationKnm/TermsEditor.jsx';
import QuotePreview from './QuotePreview.jsx';
import QuotePreviewModal from './QuotePreviewModal.jsx';
import { calculateKnmTotals, createDraftKnmQuotation, KNM_DEFAULT_COMPANY } from '../../utils/knmQuotation.js';
import {
  clearCompanyLogoAsset, clearCompanyStampAsset, loadCompanyInfo, loadCompanyLogoAsset, loadCompanyStampAsset,
  loadTerms, nextQuotationNumberAsync, saveCompanyInfo, saveCompanyLogoAsset, saveCompanyStampAsset, saveTerms,
} from '../../utils/knmStorage.js';
import styles from './QuotationKnm.module.css';

export default function QuotationKnm() {
  const [company, setCompany] = useState(() => ({ ...KNM_DEFAULT_COMPANY }));
  const [quotation, setQuotation] = useState(createDraftKnmQuotation);
  const [customerError, setCustomerError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const numberGenerated = useRef(false);
  const hydrated = useRef(false);
  const logoUrlRef = useRef('');
  const stampUrlRef = useRef('');

  useEffect(() => {
    if (numberGenerated.current) return;
    numberGenerated.current = true;
    (async () => {
      const no = await nextQuotationNumberAsync(dayjs().format('YYYYMMDD'));
      setQuotation((current) => (current.quotationNo ? current : { ...current, quotationNo: no }));
    })();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [storedCompany, storedTerms, logoAsset, stampAsset] = await Promise.all([
        loadCompanyInfo(), loadTerms(), loadCompanyLogoAsset(), loadCompanyStampAsset(),
      ]);
      if (!active) return;
      setCompany((current) => ({
        ...current,
        ...(storedCompany || {}),
        logo: logoAsset?.url || '',
        logoName: logoAsset?.name || '',
        stamp: stampAsset?.url || '',
        stampName: stampAsset?.name || '',
      }));
      logoUrlRef.current = logoAsset?.url || '';
      stampUrlRef.current = stampAsset?.url || '';
      if (storedTerms) setQuotation((current) => ({ ...current, terms: storedTerms }));
      hydrated.current = true;
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
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

  const handleLogoUpload = async (file) => {
    try {
      await saveCompanyLogoAsset(file);
      const asset = await loadCompanyLogoAsset();
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      logoUrlRef.current = asset?.url || '';
      setCompany((current) => ({ ...current, logo: asset?.url || '', logoName: asset?.name || '' }));
    } catch {
      toast.error('Không thể lưu logo vào thiết bị.');
    }
  };

  const handleLogoClear = async () => {
    await clearCompanyLogoAsset();
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = '';
    setCompany((current) => ({ ...current, logo: '', logoName: '' }));
  };

  const handleStampUpload = async (file) => {
    try {
      await saveCompanyStampAsset(file);
      const asset = await loadCompanyStampAsset();
      if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
      stampUrlRef.current = asset?.url || '';
      setCompany((current) => ({ ...current, stamp: asset?.url || '', stampName: asset?.name || '' }));
    } catch {
      toast.error('Không thể lưu dấu mộc vào thiết bị.');
    }
  };

  const handleStampClear = async () => {
    await clearCompanyStampAsset();
    if (stampUrlRef.current) URL.revokeObjectURL(stampUrlRef.current);
    stampUrlRef.current = '';
    setCompany((current) => ({ ...current, stamp: '', stampName: '' }));
  };

  const triggerPrint = (asPdf) => {
    if (!quotation.customer.name.trim()) {
      setCustomerError('Tên khách hàng là bắt buộc.');
      toast.error(`Vui lòng nhập tên khách hàng trước khi ${asPdf ? 'xuất PDF' : 'in'}.`);
      return;
    }
    if (asPdf) {
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
            <button type="button" className={styles.btnPreview} onClick={() => setPreviewOpen(true)}><FaEye /> Xem trước</button>
            <button type="button" className={styles.btnPrint} onClick={handlePrint}><FaPrint /> In</button>
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
            onLogoUpload={handleLogoUpload}
            onLogoClear={handleLogoClear}
            onStampUpload={handleStampUpload}
            onStampClear={handleStampClear}
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
