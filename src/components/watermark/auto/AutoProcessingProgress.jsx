import { useState } from 'react';
import { ProductStatusChip } from './ProductFolderPicker.jsx';
import { describeRunSummary, imageStatusLabel } from '../../../utils/watermarkAutoNaming.js';

const ROWS_PER_PAGE = 100;

function formatWait(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} phút ${String(seconds % 60).padStart(2, '0')} giây` : `${seconds} giây`;
}

/** Rows are only rendered for an opened product, a page at a time (folders can hold thousands of images). */
function ProductImages({ product }) {
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const shown = product.images.slice(0, limit);

  return (
    <>
      <ol className="wma-image-list">
        {shown.map((image) => (
          <li key={image.id} className={`wma-image-row is-${image.status}`}>
            <span className="wma-image-source" title={image.sourceName}>{image.sourceName}</span>
            <span className="wma-image-arrow" aria-hidden="true">→</span>
            <span className="wma-image-target">
              {image.status === 'saved' ? (
                <span title={`${product.resultFolderName}/${image.outputName}`}>{image.outputName}</span>
              ) : (
                <span className="wma-image-state">{imageStatusLabel(image.status)}</span>
              )}
              {image.status === 'saved' && image.needsReview && <span className="wma-chip wma-chip--review">Cần kiểm tra</span>}
            </span>
            {image.status === 'error' && <span className="wma-image-error">{image.errorMessage}</span>}
          </li>
        ))}
      </ol>
      {product.images.length > limit && (
        <button type="button" className="wm-btn-outline wm-btn-small wma-more" onClick={() => setLimit((value) => value + ROWS_PER_PAGE)}>
          Hiện thêm ({product.images.length - limit} ảnh)
        </button>
      )}
    </>
  );
}

function ProductDetails({ product }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="wma-detail" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="wma-detail-name" title={product.relativePath}>{product.name}</span>
        <ProductStatusChip product={product} />
        <span className="wma-detail-count">
          {product.counts.saved}/{product.images.length} đã lưu
          {product.counts.error > 0 && ` · ${product.counts.error} lỗi`}
          {product.counts.review > 0 && ` · ${product.counts.review} cần kiểm tra`}
        </span>
      </summary>
      {product.blocked && <p className="wma-row-error">{product.blocked.message}</p>}
      <p className="wma-detail-path">Lưu tại: {product.relativePath}/{product.resultFolderName}</p>
      {open && <ProductImages product={product} />}
    </details>
  );
}

/**
 * Step 3: start, follow and finish one run. Every control after "Bắt đầu"
 * reuses the configuration captured when the run started.
 */
export default function AutoProcessingProgress({
  run,
  runProducts,
  canStart,
  blockers,
  now,
  pauseActions,
  onStart,
  onStop,
  onResume,
  onRetry,
  onCopyReport,
  onDownloadJson,
  onDownloadCsv,
}) {
  const running = run?.state === 'running' || run?.state === 'stopping';
  const done = run ? run.saved + run.errors : 0;
  const percent = run?.total ? Math.round((done / run.total) * 100) : 0;
  const waitMs = run?.pause?.until ? run.pause.until - now : 0;
  const finishedOrPaused = run && (run.state === 'finished' || run.state === 'paused');
  const summary = run && describeRunSummary(run);

  return (
    <section className="wm-card wma-step" aria-labelledby="wma-step-run">
      <header className="wma-step-head">
        <span className="wma-step-num" aria-hidden="true">3</span>
        <div>
          <h2 id="wma-step-run">Xử lý và lưu</h2>
          <p>Chèn logo, đặt tên AI, chỉnh kích thước và lưu vào thư mục Named của từng sản phẩm.</p>
        </div>
      </header>

      <div className="wma-run-actions">
        {running ? (
          <>
            <button type="button" className="wm-btn-primary" disabled aria-busy="true">
              <span className="wm-spinner" aria-hidden="true" />
              {run.state === 'stopping' ? 'Đang dừng…' : `Đang xử lý ${done}/${run.total}…`}
            </button>
            <button type="button" className="wm-btn-outline" onClick={onStop} disabled={run.state === 'stopping'}>Dừng</button>
          </>
        ) : (
          <>
            {run?.state === 'paused' && run.pending > 0 && (
              <button type="button" className="wm-btn-primary" onClick={onResume} disabled={waitMs > 0}>
                Tiếp tục phần còn lại ({run.pending})
              </button>
            )}
            {finishedOrPaused && run.retryableErrors > 0 && (
              <button type="button" className="wm-btn-outline" onClick={onRetry} disabled={waitMs > 0}>
                Thử lại ảnh lỗi ({run.retryableErrors})
              </button>
            )}
            <button
              type="button"
              className={run ? 'wm-btn-outline' : 'wm-btn-primary wma-start'}
              onClick={onStart}
              disabled={!canStart}
              aria-describedby={blockers.length ? 'wma-start-blockers' : undefined}
            >
              {run ? 'Bắt đầu lượt mới' : 'Bắt đầu xử lý'}
            </button>
          </>
        )}
      </div>

      {!running && blockers.length > 0 && (
        <ul className="wma-blockers" id="wma-start-blockers">
          {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      )}
      {!running && run && canStart && (
        <p className="wma-hint">Lượt mới xử lý lại mọi ảnh đã chọn với cấu hình hiện tại; ảnh đã lưu trước đó được giữ, bản mới có thêm hậu tố -2, -3…</p>
      )}

      {run && (
        <div className="wma-progress" aria-live="polite">
          <div className="wma-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={done} aria-label="Tiến độ">
            <span style={{ width: `${percent}%` }} />
          </div>
          <dl className="wma-counters">
            <div><dt>Đã lưu</dt><dd>{run.saved}/{run.total}</dd></div>
            <div><dt>Lỗi</dt><dd>{run.errors}</dd></div>
            <div><dt>Cần kiểm tra</dt><dd>{run.review}</dd></div>
            <div><dt>Còn chờ</dt><dd>{run.pending}</dd></div>
          </dl>
          {running && run.currentProductName && (
            <p className="wma-current">
              Sản phẩm: <strong>{run.currentProductName}</strong>
              {run.stage && <> · {imageStatusLabel(run.stage)}</>}
            </p>
          )}
        </div>
      )}

      {run?.state === 'paused' && run.pause && (
        <div className={`wma-notice ${run.pause.kind === 'stopped' ? 'wma-notice--info' : 'wma-notice--warning'}`} role="status">
          <span>
            {run.pause.message}
            {waitMs > 0 && ` Có thể tiếp tục sau ${formatWait(waitMs)}.`}
          </span>
          {pauseActions}
        </div>
      )}

      {finishedOrPaused && (
        <div className="wma-summary">
          <p className={run.errors || run.pending ? 'is-partial' : 'is-done'}>
            <strong>{run.state === 'finished' && !run.errors ? 'Hoàn tất. ' : 'Hoàn tất một phần. '}</strong>
            {summary}
          </p>
          <div className="wma-report-actions">
            <button type="button" className="wm-btn-outline wm-btn-small" onClick={onCopyReport}>Sao chép báo cáo</button>
            <button type="button" className="wm-btn-outline wm-btn-small" onClick={onDownloadCsv}>Tải CSV</button>
            <button type="button" className="wm-btn-outline wm-btn-small" onClick={onDownloadJson}>Tải JSON</button>
          </div>
          <small className="wma-hint">Báo cáo chỉ tạo trên máy bạn, không gửi lên máy chủ.</small>
        </div>
      )}

      {run && runProducts.length > 0 && (
        <div className="wma-details" aria-label="Chi tiết theo sản phẩm">
          {runProducts.map((product) => <ProductDetails key={product.id} product={product} />)}
        </div>
      )}
    </section>
  );
}
