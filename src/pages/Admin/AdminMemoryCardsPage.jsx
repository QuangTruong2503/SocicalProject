import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaTrash, FaUpload } from 'react-icons/fa6';
import {
  deleteMemoryCard,
  listMemoryCardsAdmin,
  uploadMemoryCard,
} from '../../services/memoryCardService.js';
import styles from './Admin.module.css';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminMemoryCardsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(() => listMemoryCardsAdmin().then((result) => {
    if (result.error) {
      toast.error(result.error);
      setRows([]);
      return;
    }
    setRows(result.data || []);
  }).finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  const handleFilesSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (files.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      const result = await uploadMemoryCard({ file });
      if (result.error) {
        toast.error(`${file.name}: ${result.error}`);
      } else {
        successCount += 1;
      }
    }

    setUploading(false);

    if (successCount > 0) {
      toast.success(`Da tai len ${successCount} anh nguon.`);
      load();
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm('Xoa the bai nay khoi tro choi?')) return;

    setDeletingId(row.id);
    const result = await deleteMemoryCard({ id: row.id, image: row.image });
    setDeletingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.warning) {
      toast.warn(result.warning);
    } else {
      toast.success('Da xoa the bai.');
    }

    setRows((prev) => prev.filter((item) => item.id !== row.id));
  };

  return (
    <>
      <Helmet><title>Quản lý ảnh Memory Game</title></Helmet>
      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>ẢNH MEMORY GAME</h1></div>
      </header>

      <section className={styles.card}>
        <p style={{ marginTop: 0, color: 'var(--color-text-secondary)' }}>
          Tải lên ảnh nguồn để làm thẻ bài cho trò chơi Memory Match. Trò chơi cần ít nhất 2 ảnh để hoạt động.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          disabled={uploading}
          style={{ display: 'none' }}
          id="memory-card-upload-input"
        />
        <label
          htmlFor="memory-card-upload-input"
          className={styles.primary}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 8,
            padding: '9px 16px',
            fontWeight: 600,
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <FaUpload /> {uploading ? 'Đang tải lên...' : 'Tải ảnh nguồn lên'}
        </label>
      </section>

      <section className={styles.card}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className={styles.emptyState}>Đang tải...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className={styles.emptyState}>Chưa có ảnh nào. Hãy tải ảnh lên phía trên.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <img
                      src={row.image}
                      alt={row.name || `memory-card-${row.id}`}
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                      loading="lazy"
                    />
                  </td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        title="Xóa"
                        className={styles.danger}
                        onClick={() => handleDelete(row)}
                        disabled={deletingId === row.id}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
