import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaArrowDown, FaArrowUp, FaArrowsRotate, FaEye, FaEyeSlash, FaPen, FaPlus, FaTrash } from 'react-icons/fa6';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { loadAvatarFrames } from '../../hooks/useAvatarFrames.js';
import {
  adminDeleteAvatarFrame,
  adminListAvatarFrames,
  adminReorderAvatarFrames,
  adminSaveAvatarFrame,
} from '../../services/avatarFrameService.js';
import { frameFormatLabel, frameLayerProps } from '../../utils/avatarFrames.js';
import { formatDateTime, formatNumber } from '../../utils/formatters.js';
import AdminAvatarFrameEditor from './AdminAvatarFrameEditor.jsx';
import { FramePreview } from './AdminAvatarFrameParts.jsx';
import styles from './Admin.module.css';
import fs from './AdminAvatarFrames.module.css';

const RETRY_CODES = new Set(['40001', 'P0002', '42501']);

function frameSummary(frame) {
  const parts = [frame.image_source === 'builtin' ? 'Khung mẫu' : 'Ảnh tải lên', frameFormatLabel(frame)];
  if (frame.frame_type === 'animated') {
    parts.push(`${frame.frame_count} frame · ${(frame.duration_ms / 1000).toLocaleString('vi-VN')} giây`);
    if (!frame.fallback_url) parts.push('chưa có ảnh dự phòng');
  }
  return parts.filter(Boolean).join(' · ');
}

export default function AdminAvatarFramesPage() {
  const [table, setTable] = useState({ loading: true, frames: [], error: '' });
  const [token, setToken] = useState(0);
  const [editor, setEditor] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const alive = useRef(true);

  const refresh = () => setToken((value) => value + 1);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setTable((current) => ({ ...current, loading: true, error: '' }));
    adminListAvatarFrames().then((result) => {
      if (!active) return;
      setTable(result.error
        ? { loading: false, frames: [], error: result.error }
        : { loading: false, frames: result.data, error: '' });
    });
    return () => { active = false; };
  }, [token]);

  /** Runs one change at a time; refreshes the list and the shared catalog afterwards. */
  async function runAction(action) {
    if (actionLock.current) return null;
    actionLock.current = true;
    setBusy(true);

    try {
      const result = await action();
      if (!alive.current) return null;
      if (result.warning) toast.warning(result.warning);
      if (!result.error) {
        refresh();
        loadAvatarFrames();
      } else if (RETRY_CODES.has(result.code)) {
        refresh();
      }
      return result;
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function handleSaved(result, edited) {
    if (result.warning) toast.warning(result.warning);
    toast.success(edited ? 'Đã lưu khung avatar.' : 'Đã thêm khung avatar.');
    setEditor(null);
    refresh();
    loadAvatarFrames();
  }

  function handleConflict(message) {
    toast.error(message);
    setEditor(null);
    refresh();
  }

  async function toggle(frame) {
    const result = await runAction(() => adminSaveAvatarFrame({ frame, name: frame.name, isActive: !frame.is_active }));
    if (!result) return;
    if (result.error) {
      toast.error(result.error);
    } else if (frame.is_active && frame.usage_count > 0) {
      toast.info(`Đã tắt khung. ${formatNumber(frame.usage_count)} tài khoản đang dùng sẽ thấy avatar không khung cho đến khi bật lại.`);
    } else {
      toast.success(frame.is_active ? 'Đã tắt khung.' : 'Đã bật khung.');
    }
  }

  async function move(index, offset) {
    const ids = table.frames.map((frame) => frame.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const result = await runAction(() => adminReorderAvatarFrames(ids));
    if (result?.error) toast.error(result.error);
  }

  async function confirmDelete() {
    const frame = confirmation?.frame;
    if (!frame) return;
    const result = await runAction(() => adminDeleteAvatarFrame(frame));
    if (!result) return;
    if (result.error) {
      toast.error(result.error);
      if (RETRY_CODES.has(result.code)) setConfirmation(null);
      return;
    }
    toast.success(result.data.affected_users
      ? `Đã xóa khung. ${formatNumber(result.data.affected_users)} tài khoản đã trở về avatar không khung.`
      : 'Đã xóa khung.');
    setConfirmation(null);
  }

  const frames = table.frames;
  const activeCount = frames.filter((frame) => frame.is_active).length;
  const animatedCount = frames.filter((frame) => frame.frame_type === 'animated').length;
  const usageCount = frames.reduce((sum, frame) => sum + (Number(frame.usage_count) || 0), 0);

  return (
    <>
      <Helmet><title>Khung Avatar · Quản trị</title></Helmet>

      <div className={styles.pageHeader}>
        <div>
          <span>QUẢN TRỊ HỆ THỐNG</span>
          <h1>Khung Avatar</h1>
          <p className={fs.lead}>Khung trang trí người dùng chọn trong Dashboard → Avatar. Chỉ khung đang bật mới hiện trong danh sách chọn. Khung động cần ảnh tĩnh dự phòng.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.actionButton} onClick={refresh} disabled={table.loading || busy}>
            <FaArrowsRotate aria-hidden="true" className={table.loading ? styles.spin : undefined} /> Làm mới
          </button>
          <button type="button" className={`${styles.actionButton} ${styles.primary}`} onClick={() => setEditor({ frame: null })} disabled={busy}>
            <FaPlus aria-hidden="true" /> Thêm khung
          </button>
        </div>
      </div>

      <div className={styles.statGrid}>
        {[['Tổng số khung', frames.length], ['Đang bật', activeCount], ['Khung động', animatedCount], ['Tài khoản đang dùng khung', usageCount]].map(([label, value]) => (
          <div key={label} className={styles.statCard}>
            <span>{label}</span>
            {table.loading ? <strong className={styles.skeletonValue} /> : <strong>{table.error ? '—' : formatNumber(value)}</strong>}
          </div>
        ))}
      </div>

      {table.error && (
        <div className={styles.alert} role="alert">
          <span>{table.error}</span>
          <button type="button" onClick={refresh}>Thử lại</button>
        </div>
      )}

      <section className={styles.card} aria-labelledby="frame-list-title" aria-busy={table.loading}>
        <div className={styles.cardHead}>
          <h2 id="frame-list-title">Danh sách khung</h2>
          <span>Thứ tự trong danh sách là thứ tự người dùng nhìn thấy. Khung động hiển thị bằng ảnh dự phòng ở đây.</span>
        </div>

        {table.loading && frames.length === 0 && <p className={styles.emptyState}>Đang tải danh sách khung…</p>}
        {!table.loading && !table.error && frames.length === 0 && (
          <p className={styles.emptyState}>Chưa có khung nào. Bấm “Thêm khung” để tải khung đầu tiên.</p>
        )}

        {frames.length > 0 && (
          <ol className={`${fs.list} ${table.loading ? styles.tableBusy : ''}`}>
            {frames.map((frame, index) => (
              <li key={frame.id} className={fs.row}>
                <span className={fs.order} title="Thứ tự">{index + 1}</span>
                {/* Stills only, so the list never loads or plays every animation. */}
                <FramePreview frameSrc={frameLayerProps(frame, { still: true }).frameSrc} />
                <div className={fs.info}>
                  <strong>{frame.name}</strong>
                  <div className={fs.meta}>
                    <span className={`${styles.badge} ${frame.is_active ? styles.badgeActive : styles.badgeDefault}`}>
                      {frame.is_active ? 'Đang bật' : 'Đã tắt'}
                    </span>
                    {frame.frame_type === 'animated' && <span className={`${styles.badge} ${fs.motionBadge}`}>Động</span>}
                    <span>{frameSummary(frame)}</span>
                    <span>{formatNumber(frame.usage_count)} tài khoản đang dùng</span>
                  </div>
                  <small>Cập nhật {formatDateTime(frame.updated_at)} · tạo {formatDateTime(frame.created_at)}</small>
                </div>
                <div className={fs.actions}>
                  <button type="button" onClick={() => move(index, -1)} disabled={busy || table.loading || index === 0} aria-label={`Đưa ${frame.name} lên`} title="Đưa lên">
                    <FaArrowUp aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={busy || table.loading || index === frames.length - 1} aria-label={`Đưa ${frame.name} xuống`} title="Đưa xuống">
                    <FaArrowDown aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => toggle(frame)} disabled={busy} aria-label={`${frame.is_active ? 'Tắt' : 'Bật'} ${frame.name}`}>
                    {frame.is_active ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
                    <span>{frame.is_active ? 'Tắt' : 'Bật'}</span>
                  </button>
                  <button type="button" onClick={() => setEditor({ frame })} disabled={busy} aria-label={`Sửa ${frame.name}`}>
                    <FaPen aria-hidden="true" /><span>Sửa</span>
                  </button>
                  <button type="button" className={styles.danger} onClick={() => setConfirmation({ frame })} disabled={busy} aria-label={`Xóa ${frame.name}`}>
                    <FaTrash aria-hidden="true" /><span>Xóa</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {editor && (
        <AdminAvatarFrameEditor
          frame={editor.frame}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
          onConflict={handleConflict}
        />
      )}

      {confirmation && (
        <ConfirmDialog
          title={`Xóa khung “${confirmation.frame.name}”?`}
          message={[
            'Khung sẽ bị xóa vĩnh viễn khỏi danh sách.',
            confirmation.frame.usage_count > 0
              ? `${formatNumber(confirmation.frame.usage_count)} tài khoản đang dùng khung này sẽ trở về avatar không khung.`
              : 'Hiện chưa có tài khoản nào dùng khung này.',
            confirmation.frame.image_source === 'builtin'
              ? 'File mẫu vẫn nằm trong mã nguồn ứng dụng.'
              : confirmation.frame.frame_type === 'animated'
                ? 'Ảnh động và ảnh dự phòng sẽ được xóa khỏi Storage.'
                : 'Ảnh khung sẽ được xóa khỏi Storage.',
          ].join(' ')}
          confirmLabel="Xóa khung"
          danger
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => { if (!actionLock.current) setConfirmation(null); }}
        />
      )}
    </>
  );
}
