import React from 'react';
import { Controller } from 'react-hook-form';
import {
  FaBuilding,
  FaCalendarDays,
  FaFileInvoiceDollar,
  FaMapLocationDot,
  FaNoteSticky,
  FaPhone,
  FaReceipt,
  FaUser,
} from 'react-icons/fa6';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from '../../pages/Quotation/Quotation.module.css';

const customerFields = [
  {
    name: 'companyName',
    label: 'Tên khách hàng',
    placeholder: 'Nhập tên khách hàng',
    icon: FaUser,
    required: true,
    span: 2,
  },
  {
    name: 'taxCode',
    label: 'Mã số thuế',
    placeholder: 'Nhập MST',
    icon: FaFileInvoiceDollar,
  },
  {
    name: 'taxAddress',
    label: 'Địa chỉ thuế',
    placeholder: 'Nhập địa chỉ thuế',
    icon: FaBuilding,
    span: 2,
  },
  {
    name: 'phone',
    label: 'Số điện thoại',
    placeholder: 'Nhập số điện thoại',
    icon: FaPhone,
  },
  {
    name: 'shippingAddress',
    label: 'Địa chỉ giao hàng',
    placeholder: 'Nhập địa chỉ giao hàng',
    icon: FaMapLocationDot,
    span: 2,
  },
  {
    name: 'date',
    label: 'Ngày báo giá',
    placeholder: 'YYYY-MM-DD',
    icon: FaCalendarDays,
  },
  {
    name: 'documentNo',
    label: 'Số chứng từ',
    placeholder: 'Số CT',
    icon: FaReceipt,
  },
  {
    name: 'note',
    label: 'Ghi chú',
    placeholder: 'Nhập ghi chú',
    icon: FaNoteSticky,
    span: 2,
    textarea: true,
  },
];

function CustomerField({ control, error, field }) {
  const Icon = field.icon;
  const fieldSpanClass = field.span === 2 ? styles['quotationField--span-2'] : '';

  return (
    <div className={`${styles.quotationField} ${fieldSpanClass}`}>
      <label className={styles['quotationField__label']} htmlFor={`customer.${field.name}`}>
        <span className={styles['quotationField__label-inner']}>
          <Icon aria-hidden="true" />
          {field.label}
          {field.required && <span className={styles['quotationField__required']}>*</span>}
        </span>
      </label>

      <Controller
        control={control}
        name={`customer.${field.name}`}
        rules={
          field.required
            ? { required: 'Tên khách hàng là bắt buộc.' }
            : undefined
        }
        render={({ field: controllerField }) =>
          field.textarea ? (
            <textarea
              id={`customer.${field.name}`}
              className={`${styles['quotationField__input']} ${styles['quotationField__input--textarea']}`}
              placeholder={field.placeholder}
              rows={3}
              {...controllerField}
            />
          ) : (
            <input
              id={`customer.${field.name}`}
              className={styles['quotationField__input']}
              type={field.name === 'date' ? 'date' : 'text'}
              placeholder={field.placeholder}
              {...controllerField}
            />
          )
        }
      />

      {error && <span className={styles['quotationField__error']}>{error.message}</span>}
    </div>
  );
}

function CustomerInfo({ control, errors, companyOptions = [], selectedCompany }) {
  return (
    <section className={styles.quotationCard} aria-labelledby="quotation-customer-title">
      <div className={styles['quotationCard__header']}>
        <div>
          <span className={styles.quotationKicker}>Thông tin báo giá</span>
          <h2 id="quotation-customer-title">Phiếu báo giá / đơn hàng</h2>
        </div>
        <div className={styles['quotationCard__badge']}>React 19 · Vite · RHF</div>
      </div>

      <div className={styles.quotationCompanyPanel}>
        <div className={styles.quotationCompanyPanel__header}>
          <span className={styles.quotationKicker}>Chọn công ty phát hành</span>
          <strong>{selectedCompany?.name || 'Chưa chọn công ty'}</strong>
        </div>

        <Controller
          control={control}
          name="customer.companyId"
          render={({ field }) => (
            <select
              {...field}
              className={styles.quotationCompanySelect}
            >
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.shortName || company.name}
                </option>
              ))}
            </select>
          )}
        />

        {selectedCompany && (
          <div className={styles.quotationCompanyMeta}>
            <div>
              <span>MST</span>
              <strong>{selectedCompany.taxCode || '---'}</strong>
            </div>
            <div>
              <span>Điện thoại</span>
              <strong>{selectedCompany.phone || '---'}</strong>
            </div>
            <div>
              <span>Ngân hàng</span>
              <strong>{selectedCompany.bankName || '---'}</strong>
            </div>
            <div>
              <span>Tài khoản</span>
              <strong>{selectedCompany.bankAccount || '---'}</strong>
            </div>
          </div>
        )}
      </div>

      <div className={styles.quotationCustomerGrid}>
        {customerFields.map((field) => (
          <CustomerField
            key={field.name}
            control={control}
            error={errors?.customer?.[field.name]}
            field={field}
          />
        ))}
      </div>

      <div className={styles.quotationCustomerNote}>
        <strong>Số tiền bằng chữ:</strong>
        <span>............................................</span>
      </div>

      <div className={styles.quotationPreviewMeta}>
        <span>Định dạng số: {formatCurrency(1000000)}</span>
      </div>
    </section>
  );
}

export default React.memo(CustomerInfo);

