import React, { useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useReactToPrint } from 'react-to-print';
import dayjs from 'dayjs';
import { FaFileArrowDown, FaFloppyDisk, FaPrint, FaRotateLeft, FaPlus } from 'react-icons/fa6';
import CustomerInfo from '../../components/quotation/CustomerInfo.jsx';
import ProductTable from '../../components/quotation/ProductTable.jsx';
import PrintInvoice from '../../components/quotation/PrintInvoice.jsx';
import { useQuotation } from '../../hooks/useQuotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import styles from './Quotation.module.css';

function focusField(selector) {
  const element = document.querySelector(`[data-quotation-field="${selector}"]`);

  if (element instanceof HTMLElement) {
    element.focus();
    if ('select' in element && typeof element.select === 'function') {
      element.select();
    }
  }
}

export default function Quotation() {
  const printRef = useRef(null);
  const {
    control,
    formState: { errors },
    fields,
    products,
    customer,
    selectedCompany,
    companyOptions,
    summary,
    searchState,
    addProduct,
    removeProduct,
    searchProduct,
    hideSuggestions,
    selectSuggestion,
    resetForm,
    getValues,
    trigger,
  } = useQuotation();

  const printInvoice = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Bao-gia-${selectedCompany?.shortName || 'quotation'}-${customer?.companyName || 'client'}-${dayjs().format('YYYYMMDD')}`,
  });

  const onEnterAdvance = useCallback((event, nextSelector) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    focusField(nextSelector);
  }, []);

  const handlePrint = useCallback(async () => {
    const isValid = await trigger();
    if (isValid) {
      printInvoice();
    }
  }, [printInvoice, trigger]);

  const handleSave = useCallback(async () => {
    const isValid = await trigger();
    if (!isValid) {
      window.alert('Vui lòng kiểm tra lại các trường bắt buộc trước khi xuất Excel.');
      return;
    }

    const values = getValues();
    const fileName = exportQuotationToExcel({
      company: selectedCompany,
      customer: values.customer,
      products,
      summary,
    });

    window.alert(`Đã xuất file Excel: ${fileName}`);
  }, [getValues, products, selectedCompany, summary, trigger]);

  return (
    <>
      <Helmet>
        <title>Quotation - Phiếu Báo Giá / Đơn Hàng</title>
        <meta
          name="description"
          content="Tạo phiếu báo giá, quản lý sản phẩm, tính VAT và in hóa đơn A4."
        />
      </Helmet>

      <div className={styles.quotationPage}>


        <div className={styles.quotationToolbar}>
        <div className={styles.quotationToolbar__group}>
            <button className={`${styles.quotationBtn} ${styles['quotationBtn--secondary']}`} type="button" onClick={addProduct}>
              <FaPlus aria-hidden="true" />
              Thêm sản phẩm
            </button>
            <button className={`${styles.quotationBtn} ${styles['quotationBtn--secondary']}`} type="button" onClick={handleSave}>
              <FaFloppyDisk aria-hidden="true" />
              Lưu Excel
            </button>
            <button className={`${styles.quotationBtn} ${styles['quotationBtn--secondary']}`} type="button" onClick={resetForm}>
              <FaRotateLeft aria-hidden="true" />
              Làm mới
            </button>
          </div>

          <div className={styles.quotationToolbar__group}>
            <button className={`${styles.quotationBtn} ${styles['quotationBtn--primary']}`} type="button" onClick={handlePrint}>
              <FaPrint aria-hidden="true" />
              In báo giá
            </button>
            <button className={`${styles.quotationBtn} ${styles['quotationBtn--secondary']}`} type="button" onClick={handleSave}>
              <FaFileArrowDown aria-hidden="true" />
              Xuất Excel
            </button>
          </div>
        </div>

        <div className={styles.quotationGrid}>
          <div className={styles.quotationStack}>
            <CustomerInfo
              control={control}
              errors={errors}
              companyOptions={companyOptions}
              selectedCompany={selectedCompany}
            />
            <ProductTable
              control={control}
              fields={fields}
              errors={errors}
              products={products}
              summary={summary}
              searchState={searchState}
              onAddProduct={addProduct}
              onRemoveProduct={removeProduct}
              onSearchProduct={searchProduct}
              onHideSuggestions={hideSuggestions}
              onSelectSuggestion={selectSuggestion}
              onEnterAdvance={onEnterAdvance}
            />
          </div>

        </div>

        <PrintInvoice
          ref={printRef}
          company={selectedCompany}
          customer={customer}
          products={products}
          summary={summary}
        />
      </div>
    </>
  );
}
