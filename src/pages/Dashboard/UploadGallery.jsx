import { useState } from 'react';
import { toast } from 'react-toastify';
import { FaMagnifyingGlassPlus, FaTrash } from 'react-icons/fa6';
import Dialog from '../../components/dialog/Dialog.jsx';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { formatDateTime } from '../../utils/formatters.js';
import styles from './Dashboard.module.css';

/**
 * Grid of uploads with preview and delete. `uploads` is the object returned by useUserUploads.
 * @param {{ uploads: ReturnType<typeof import('./useUserUploads.js').useUserUploads>, limit?: number, emptyText: string, showLoadMore?: boolean }} props
 */
export default function UploadGallery({ uploads, limit, emptyText, showLoadMore = false }) {
  const [preview, setPreview] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const items = limit ? uploads.items.slice(0, limit) : uploads.items;
  const isPending = uploads.loading && !uploads.loaded;

  async function confirmDelete() {
    setDeleting(true);
    const result = await uploads.remove(pendingDelete);
    setDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.warning) {
      toast.warning(result.warning);
    } else {
      toast.success('Đã xóa ảnh.');
    }

    if (preview?.id === pendingDelete.id) setPreview(null);
    setPendingDelete(null);
  }

  if (uploads.error && !uploads.items.length) {
    return (
      <div className={styles.inlineError} role="alert">
        <span>{uploads.error}</span>
        <button type="button" onClick={uploads.reload}>Thử lại</button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.gallery} aria-busy={uploads.loading}>
        {isPending && Array.from({ length: limit || 6 }, (_, index) => (
          <div key={`skeleton-${index}`} className={`${styles.thumb} ${styles.skeleton}`} aria-hidden="true" />
        ))}

        {!isPending && items.length === 0 && (
          <div className={styles.emptyState}>{emptyText}</div>
        )}

        {!isPending && items.map((item) => (
          <article key={item.id} className={styles.thumb}>
            <button
              type="button"
              className={styles.thumbOpen}
              onClick={() => setPreview(item)}
              aria-label={`Xem ảnh ${item.file_name || ''}`.trim()}
            >
              <img src={item.image_url} alt="" loading="lazy" />
            </button>
            <div className={styles.thumbActions}>
              <button type="button" onClick={() => setPreview(item)} aria-label="Xem lớn" title="Xem lớn">
                <FaMagnifyingGlassPlus aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setPendingDelete(item)} aria-label="Xóa ảnh" title="Xóa ảnh">
                <FaTrash aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>

      {uploads.error && uploads.items.length > 0 && (
        <div className={styles.inlineError} role="alert">
          <span>{uploads.error}</span>
          <button type="button" onClick={uploads.reload}>Thử lại</button>
        </div>
      )}

      {showLoadMore && uploads.hasMore && !isPending && (
        <div className={styles.loadMore}>
          <button type="button" className="dashboard-ghost-btn" onClick={uploads.loadMore} disabled={uploads.loadingMore}>
            {uploads.loadingMore ? 'Đang tải…' : `Xem thêm (${uploads.total - uploads.items.length} ảnh)`}
          </button>
        </div>
      )}

      {preview && !pendingDelete && (
        <Dialog title={preview.file_name || 'Ảnh đã tải lên'} onClose={() => setPreview(null)} variant="wide">
          <img className={styles.previewImage} src={preview.image_url} alt={preview.file_name || 'Ảnh đã tải lên'} />
          <div className={styles.previewMeta}>
            <span>Tải lên {formatDateTime(preview.created_at)}</span>
            <button type="button" className="dashboard-ghost-btn" onClick={() => setPendingDelete(preview)}>
              <FaTrash aria-hidden="true" /> Xóa ảnh
            </button>
          </div>
        </Dialog>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Xóa ảnh này?"
          message={`${pendingDelete.file_name || 'Ảnh'} sẽ bị xóa vĩnh viễn. Nếu đây là ảnh tải lên gần nhất, avatar sẽ chuyển sang ảnh trước đó.`}
          confirmLabel="Xóa ảnh"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
