import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaCircleCheck, FaCircleExclamation, FaSpinner } from 'react-icons/fa6';
import { isLikelyTaxCode, lookupBusinessByTaxCode } from '../../utils/knmTaxLookup.js';

export default function CustomerInfoForm({ customer, error, onChange, styles }) {
  const [lookupState, setLookupState] = useState('idle');
  const patch = (name, value) => onChange({ ...customer, [name]: value });

  const handleTaxCodeBlur = async () => {
    const taxCode = customer.taxCode.trim();
    if (!isLikelyTaxCode(taxCode)) {
      setLookupState('idle');
      return;
    }
    setLookupState('loading');
    try {
      const data = await lookupBusinessByTaxCode(taxCode);
      onChange({ ...customer, taxCode, name: data.name || customer.name, address: data.address || customer.address });
      setLookupState('done');
    } catch (err) {
      setLookupState('error');
      toast.error(err.message || 'Không tìm thấy thông tin doanh nghiệp với mã số thuế này.');
    }
  };

  return (
    <section className={styles.card}>
      <h2>Thông tin khách hàng</h2>
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.span2}`}>
          Mã số thuế
          <span className={styles.inputIconWrap}>
            <input
              value={customer.taxCode}
              onChange={(e) => { patch('taxCode', e.target.value); setLookupState('idle'); }}
              onBlur={handleTaxCodeBlur}
              placeholder="Nhập MST để tự động điền tên & địa chỉ"
            />
            {lookupState === 'loading' && (
              <span className={styles.inputIcon}><FaSpinner className={styles.inputIconSpin} /></span>
            )}
            {lookupState === 'done' && (
              <span className={styles.inputIcon} style={{ color: '#0f7a45' }}><FaCircleCheck /></span>
            )}
            {lookupState === 'error' && (
              <span className={styles.inputIcon} style={{ color: '#b91c1c' }}><FaCircleExclamation /></span>
            )}
          </span>
          {lookupState === 'loading' && <small className={styles.lookupHint}>Đang tra cứu...</small>}
          {lookupState === 'done' && <small className={styles.lookupHintDone}>Đã điền theo dữ liệu Tổng cục Thuế.</small>}
          {lookupState === 'error' && <small className={styles.lookupHintError}>Không tìm thấy doanh nghiệp với MST này.</small>}
        </label>
        <label className={`${styles.field} ${styles.span2}`}>
          Tên công ty / khách hàng *
          <input value={customer.name} onChange={(e) => patch('name', e.target.value)} />
          {error && <small>{error}</small>}
        </label>
        <label className={styles.field}>
          Người liên hệ
          <input value={customer.contact} onChange={(e) => patch('contact', e.target.value)} />
        </label>
        <label className={styles.field}>
          Số điện thoại
          <input value={customer.phone} onChange={(e) => patch('phone', e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.span2}`}>
          Email
          <input type="email" value={customer.email} onChange={(e) => patch('email', e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.span2}`}>
          Địa chỉ
          <textarea value={customer.address} onChange={(e) => patch('address', e.target.value)} />
        </label>
      </div>
    </section>
  );
}
