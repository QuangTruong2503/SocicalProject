import { useState } from 'react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa6';
import AssetImageUploader from './AssetImageUploader.jsx';

const ASSETS = [
  { kind: 'logo', label: 'Logo công ty', hint: 'Hiển thị ở đầu bản báo giá.' },
  { kind: 'stamp', label: 'Dấu mộc công ty (tùy chọn)', hint: 'Hiển thị dưới phần Đại diện công ty trên bản in/PDF.' },
  { kind: 'bank_qr', label: 'QR ngân hàng (tùy chọn)', hint: 'Hiển thị trong mục Thông tin ngân hàng.' },
];

/**
 * @param {{ assets: Record<string, { url: string, name: string } | null>, localAssets: Record<string, Object | null>,
 *   assetBusy: string, canManageAssets: boolean, isNew: boolean, readOnly: boolean }} props
 */
export default function CompanyInfoForm({
  company, onChange, assets, localAssets, assetBusy, canManageAssets, onAssetUpload, onAssetClear, onAssetUseLocal,
  isNew, readOnly, styles,
}) {
  const [expanded, setExpanded] = useState(false);
  const patch = (name, value) => onChange({ ...company, [name]: value });
  const showLogo = company.showLogo !== false;

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

      <div className={styles.displayToggles}>
        <span>Hiển thị trên báo giá:</span>
        <button
          type="button"
          className={styles.chipToggle}
          aria-pressed={showLogo}
          onClick={() => patch('showLogo', !showLogo)}
          disabled={readOnly}
          title={assets.logo ? undefined : 'Chưa có logo, bản in sẽ không có logo.'}
        >
          Logo {showLogo ? 'bật' : 'tắt'}
        </button>
        <button
          type="button"
          className={styles.chipToggle}
          aria-pressed={company.showStamp}
          onClick={() => patch('showStamp', !company.showStamp)}
          disabled={readOnly}
        >
          Dấu mộc {company.showStamp ? 'bật' : 'tắt'}
        </button>
      </div>

      {expanded && (
        <div className={styles.collapseBody}>
          <fieldset className={styles.fieldset} disabled={readOnly}>
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
          </fieldset>
          <p className={styles.scopeHint}>
            {isNew
              ? 'Thông tin công ty và điều khoản sửa ở báo giá mới sẽ được nhớ cho các báo giá mới sau trên máy này.'
              : 'Thay đổi ở đây chỉ áp dụng cho báo giá này.'}
            {' '}Để trống các trường tùy chọn nếu không cần, chúng sẽ không hiển thị trên bản in/PDF.
          </p>

          <div className={styles.uploaderGrid}>
            {ASSETS.map(({ kind, label, hint }) => (
              <AssetImageUploader
                key={kind}
                label={label}
                hint={hint}
                asset={assets[kind]}
                localAsset={localAssets[kind]}
                canManage={canManageAssets}
                busy={assetBusy === kind}
                onUpload={(file) => onAssetUpload(kind, file)}
                onClear={() => onAssetClear(kind)}
                onUseLocal={() => onAssetUseLocal(kind)}
                styles={styles}
              />
            ))}
          </div>
          <p className={styles.scopeHint}>
            Logo, dấu mộc và QR dùng chung cho mọi người và mọi báo giá KNM.
            {canManageAssets ? ' Ảnh PNG, JPG, WEBP hoặc GIF, tối đa 2MB.' : ' Chỉ quản trị viên được thay đổi.'}
          </p>
        </div>
      )}
    </section>
  );
}
