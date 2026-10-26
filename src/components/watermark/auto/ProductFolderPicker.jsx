import { PRODUCT_BLOCK_MESSAGES } from '../../../hooks/useWatermarkAutoProcessor.js';

const PRODUCT_STATUS_LABELS = {
  waiting: 'Chờ',
  processing: 'Đang xử lý',
  done: 'Hoàn tất',
  partial: 'Hoàn tất một phần',
  error: 'Lỗi',
  empty: 'Không có ảnh hợp lệ',
  blocked: 'Cần xử lý',
};

export function ProductStatusChip({ product }) {
  const label = product.status === 'blocked' && product.blocked?.code === 'permission' ? 'Chờ cấp quyền' : PRODUCT_STATUS_LABELS[product.status];
  return <span className={`wma-chip wma-chip--${product.status}`}>{label}</span>;
}

const isEligible = (product) => product.imageIds.length > 0 && !product.nameError && !product.namedIsFile;

function PermissionBadge({ permission }) {
  if (permission === 'granted') return <span className="wma-perm is-granted">Quyền ghi: đã cấp</span>;
  if (permission === 'denied') return <span className="wma-perm is-denied">Quyền ghi: bị từ chối</span>;
  return <span className="wma-perm is-prompt">Quyền ghi: chưa cấp</span>;
}

function ProductRow({ product, locked, onToggle, onRemove, onRequestPermission, onRescan }) {
  const eligible = isEligible(product);
  const skipped = product.unsupported + product.invalid;
  const checkboxId = `wma-select-${product.id}`;
  const needsRescan = product.blocked?.code === 'not_found' || product.images.some((image) => image.errorCode === 'source_changed');

  return (
    <li className={`wma-product${product.selected ? ' is-selected' : ''}`}>
      <input
        id={checkboxId}
        className="wma-product-check"
        type="checkbox"
        checked={product.selected}
        disabled={locked || !eligible}
        onChange={(event) => onToggle(product.id, event.target.checked)}
      />
      <div className="wma-product-body">
        <div className="wma-product-title">
          <label htmlFor={checkboxId} title={product.name}>{product.name}</label>
          <ProductStatusChip product={product} />
        </div>
        <span className="wma-product-path" title={product.relativePath}>{product.relativePath}</span>
        <div className="wma-product-meta">
          <span>{product.imageIds.length} ảnh hợp lệ</span>
          {skipped > 0 && (
            <span title={`${product.unsupported} file không hỗ trợ, ${product.invalid} file hỏng hoặc không đọc được`}>
              {skipped} file bỏ qua
            </span>
          )}
          {product.nestedFolders > 0 && <span>{product.nestedFolders} thư mục con bỏ qua</span>}
          <PermissionBadge permission={product.permission} />
        </div>
        {product.nameError && <p className="wma-row-error">{product.nameError}</p>}
        {product.namedIsFile && <p className="wma-row-error">{PRODUCT_BLOCK_MESSAGES.named_is_file}</p>}
        {product.blocked && !product.namedIsFile && <p className="wma-row-error">{product.blocked.message}</p>}
      </div>
      <div className="wma-product-actions">
        {product.permission !== 'granted' && eligible && (
          <button type="button" className="wm-btn-outline wm-btn-small" onClick={() => onRequestPermission(product.id)}>
            Cấp quyền
          </button>
        )}
        {needsRescan && (
          <button type="button" className="wm-btn-outline wm-btn-small" onClick={() => onRescan(product.id)} disabled={locked}>
            Quét lại
          </button>
        )}
        <button
          type="button"
          className="wma-icon-btn"
          onClick={() => onRemove(product.id)}
          disabled={locked}
          aria-label={`Bỏ ${product.name} khỏi danh sách`}
          title="Bỏ khỏi danh sách"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </li>
  );
}

/**
 * Step 1: product folders. "Thêm thư mục sản phẩm" adds one product per
 * dialog; "Chọn thư mục cha" adds its direct sub-folders.
 */
export default function ProductFolderPicker({
  products,
  notices,
  picking,
  locked,
  supported,
  onAddProduct,
  onAddParent,
  onClear,
  onRemove,
  onToggle,
  onToggleAll,
  onRequestPermission,
  onRescan,
  onDismissNotice,
}) {
  const selected = products.filter((product) => product.selected);
  const selectedImages = selected.reduce((sum, product) => sum + product.imageIds.length, 0);
  const eligible = products.filter(isEligible);
  const allSelected = eligible.length > 0 && eligible.every((product) => product.selected);
  const pickDisabled = !supported || locked || picking;

  return (
    <section className="wm-card wma-step" aria-labelledby="wma-step-folders">
      <header className="wma-step-head">
        <span className="wma-step-num" aria-hidden="true">1</span>
        <div>
          <h2 id="wma-step-folders">Chọn thư mục sản phẩm</h2>
          <p>Mỗi thư mục là một sản phẩm, tên thư mục là tên sản phẩm.</p>
        </div>
      </header>

      <div className="wma-picker-actions">
        <button type="button" className="wm-btn-primary" onClick={onAddProduct} disabled={pickDisabled}>
          {picking ? 'Đang đọc thư mục…' : 'Thêm thư mục sản phẩm'}
        </button>
        <button type="button" className="wm-btn-outline" onClick={onAddParent} disabled={pickDisabled}>
          Chọn thư mục cha
        </button>
        {products.length > 0 && (
          <button type="button" className="wm-btn-outline wma-btn-quiet" onClick={onClear} disabled={locked || picking}>
            Xóa danh sách
          </button>
        )}
      </div>
      <p className="wma-hint">
        Chỉ xử lý ảnh nằm trực tiếp trong thư mục sản phẩm (JPG, PNG, WebP). Thư mục “Named” luôn được bỏ qua khi đọc ảnh.
      </p>

      {notices.length > 0 && (
        <div className="wma-notices">
          {notices.map((notice) => (
            <div key={notice.id} className={`wma-notice wma-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
              <span>{notice.text}</span>
              <button type="button" onClick={() => onDismissNotice(notice.id)} aria-label="Ẩn thông báo">×</button>
            </div>
          ))}
        </div>
      )}

      {products.length > 0 ? (
        <>
          <div className="wma-list-head">
            <label className="wma-check-all">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={locked || eligible.length === 0}
                onChange={(event) => onToggleAll(event.target.checked)}
              />
              Chọn tất cả
            </label>
            <span aria-live="polite">
              <strong>{selected.length}</strong> sản phẩm · <strong>{selectedImages}</strong> ảnh đã chọn
            </span>
          </div>
          <ul className="wma-product-list" aria-label="Thư mục sản phẩm">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                locked={locked}
                onToggle={onToggle}
                onRemove={onRemove}
                onRequestPermission={onRequestPermission}
                onRescan={onRescan}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="wma-empty">Chưa có thư mục nào. Ví dụ chọn “SanPham” bằng “Chọn thư mục cha” để thêm mọi thư mục sản phẩm bên trong.</p>
      )}
    </section>
  );
}
