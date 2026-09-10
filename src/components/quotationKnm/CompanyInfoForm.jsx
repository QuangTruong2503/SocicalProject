import { useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa6';
import AssetImageUploader from './AssetImageUploader.jsx';

export default function CompanyInfoForm({
  company, onChange, onLogoUpload, onLogoClear, onStampUpload, onStampClear,
  onBankQrUpload, onBankQrClear, styles,
}) {
  const [expanded, setExpanded] = useState(false);
  const patch = (name, value) => onChange({ ...company, [name]: value });

  return (
    <section className={styles.card}>
      <h2 className={styles.collapseHeading}>
        <button
          type="button"
          className={styles.collapseHeader}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span>Thông tin công ty <span>{company.name}</span></span>
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      </h2>

      {expanded && (
        <div className={styles.collapseBody}>
          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.span2}`}>
              Tên công ty
              <input value={company.name} onChange={(e) => patch('name', e.target.value)} />
            </label>
            <label className={styles.field}>
              Mã số thuế
              <input value={company.taxCode} onChange={(e) => patch('taxCode', e.target.value)} />
            </label>
            <label className={styles.field}>
              Hotline
              <input value={company.hotline} onChange={(e) => patch('hotline', e.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              Địa chỉ
              <textarea value={company.address} onChange={(e) => patch('address', e.target.value)} />
            </label>
            <label className={styles.field}>
              Email
              <input type="email" value={company.email} onChange={(e) => patch('email', e.target.value)} />
            </label>
            <label className={styles.field}>
              Website (tùy chọn)
              <input value={company.website} onChange={(e) => patch('website', e.target.value)} />
            </label>
            <label className={styles.field}>
              Người báo giá (tùy chọn)
              <input value={company.preparerName} onChange={(e) => patch('preparerName', e.target.value)} />
            </label>
            <label className={styles.field}>
              Chức vụ (tùy chọn)
              <input value={company.preparerTitle} onChange={(e) => patch('preparerTitle', e.target.value)} />
            </label>
            <label className={styles.field}>
              Ngân hàng (tùy chọn)
              <input value={company.bankName} onChange={(e) => patch('bankName', e.target.value)} />
            </label>
            <label className={styles.field}>
              Số tài khoản (tùy chọn)
              <input value={company.bankAccountNumber} onChange={(e) => patch('bankAccountNumber', e.target.value)} />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              Chủ tài khoản (tùy chọn)
              <input value={company.bankAccountHolder} onChange={(e) => patch('bankAccountHolder', e.target.value)} />
            </label>
          </div>

          <div className={styles.uploaderGrid}>
            <AssetImageUploader
              label="Logo công ty"
              hint="Ảnh tải lên được lưu trên thiết bị này (IndexedDB)."
              url={company.logo}
              fileName={company.logoName}
              onUpload={onLogoUpload}
              onClear={onLogoClear}
              styles={styles}
            />
            <AssetImageUploader
              label="Dấu mộc công ty (tùy chọn)"
              hint="Hiển thị dưới phần Đại diện công ty trên bản in/PDF."
              url={company.stamp}
              fileName={company.stampName}
              onUpload={onStampUpload}
              onClear={onStampClear}
              styles={styles}
            />
            <AssetImageUploader
              label="QR ngân hàng (tùy chọn)"
              hint="Hiển thị trong mục Thông tin ngân hàng trên bản báo giá."
              url={company.bankQr}
              fileName={company.bankQrName}
              onUpload={onBankQrUpload}
              onClear={onBankQrClear}
              styles={styles}
            />
          </div>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={company.showStamp}
              onChange={(e) => patch('showStamp', e.target.checked)}
            />
            Hiển thị dấu mộc trên bản báo giá
          </label>

          <p className={styles.hint}>Để trống các trường tùy chọn nếu không cần — chúng sẽ không hiển thị trên bản in/PDF.</p>
        </div>
      )}
    </section>
  );
}
