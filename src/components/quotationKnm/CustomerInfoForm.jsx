import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaCircleCheck, FaCircleExclamation, FaMagnifyingGlass, FaSpinner } from 'react-icons/fa6';
import { isLikelyTaxCode, lookupBusinessByTaxCode } from '../../utils/knmTaxLookup.js';

export default function CustomerInfoForm({ customer, errors = {}, onChange, readOnly, styles }) {
  const [lookupState, setLookupState] = useState('idle');
  const lastLookup = useRef('');
  const customerRef = useRef(customer);
  const taxCodeId = useId();
  useEffect(() => { customerRef.current = customer; }, [customer]);
  const patch = (name, value) => onChange({ ...customer, [name]: value });

  // Leaving the field fills only empty name/address; the button overwrites on purpose.
  const lookup = async (overwrite) => {
    const taxCode = customer.taxCode.trim();
    if (!isLikelyTaxCode(taxCode)) {
      if (overwrite) toast.error('Mã số thuế gồm 10 hoặc 13 chữ số (dạng 0123456789-001).');
      setLookupState('idle');
      return;
    }
    if (!overwrite && lastLookup.current === taxCode) return;
    lastLookup.current = taxCode;
    setLookupState('loading');
    try {
      const data = await lookupBusinessByTaxCode(taxCode);
      const current = customerRef.current;
      onChange({
        ...current,
        name: overwrite || !current.name.trim() ? (data.name || current.name) : current.name,
        address: overwrite || !current.address.trim() ? (data.address || current.address) : current.address,
      });
      setLookupState('done');
    } catch (err) {
      lastLookup.current = '';
      setLookupState('error');
      toast.error(err.message || 'Không tìm thấy thông tin doanh nghiệp với mã số thuế này.');
    }
  };

  return (
    <section className={styles.card}>
      <h2>Thông tin khách hàng</h2>
      <fieldset className={styles.fieldset} disabled={readOnly}>
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.span2}`}>
            <label htmlFor={taxCodeId}>Mã số thuế</label>
            <span className={styles.inputWithButton}>
              <span className={styles.inputIconWrap}>
                <input
                  id={taxCodeId}
                  value={customer.taxCode}
                  onChange={(e) => { patch('taxCode', e.target.value); setLookupState('idle'); }}
                  onBlur={() => lookup(false)}
                  placeholder="Nhập MST để tự động điền tên & địa chỉ"
                  inputMode="numeric"
                />
                {lookupState === 'loading' && (
                  <span className={styles.inputIcon}><FaSpinner className={styles.inputIconSpin} /></span>
                )}
                {lookupState === 'done' && (
                  <span className={`${styles.inputIcon} ${styles.inputIconDone}`}><FaCircleCheck /></span>
                )}
                {lookupState === 'error' && (
                  <span className={`${styles.inputIcon} ${styles.inputIconError}`}><FaCircleExclamation /></span>
                )}
              </span>
              <button
                type="button"
                onClick={() => lookup(true)}
                disabled={lookupState === 'loading'}
                title="Tra cứu và ghi đè tên, địa chỉ theo MST"
              >
                <FaMagnifyingGlass /> Tra cứu
              </button>
            </span>
            {lookupState === 'loading' && <small className={styles.lookupHint}>Đang tra cứu...</small>}
            {lookupState === 'done' && <small className={styles.lookupHintDone}>Đã điền theo dữ liệu Tổng cục Thuế.</small>}
            {lookupState === 'error' && <small className={styles.lookupHintError}>Không tìm thấy doanh nghiệp với MST này.</small>}
          </div>
          <label className={`${styles.field} ${styles.span2}`}>
            Tên công ty / khách hàng *
            <input
              value={customer.name}
              onChange={(e) => patch('name', e.target.value)}
              aria-invalid={Boolean(errors.customerName)}
              data-field="customerName"
            />
            {errors.customerName && <small>{errors.customerName}</small>}
          </label>
          <label className={styles.field}>
            Người liên hệ
            <input value={customer.contact} onChange={(e) => patch('contact', e.target.value)} />
          </label>
          <label className={styles.field}>
            Số điện thoại
            <input type="tel" value={customer.phone} onChange={(e) => patch('phone', e.target.value)} />
          </label>
          <label className={`${styles.field} ${styles.span2}`}>
            Email
            <input
              type="email"
              value={customer.email}
              onChange={(e) => patch('email', e.target.value)}
              aria-invalid={Boolean(errors.customerEmail)}
              data-field="customerEmail"
            />
            {errors.customerEmail && <small>{errors.customerEmail}</small>}
          </label>
          <label className={`${styles.field} ${styles.span2}`}>
            Địa chỉ
            <textarea value={customer.address} onChange={(e) => patch('address', e.target.value)} />
          </label>
        </div>
      </fieldset>
    </section>
  );
}
