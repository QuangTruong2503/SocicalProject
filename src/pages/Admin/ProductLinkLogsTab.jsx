import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaBroom, FaFileCsv, FaXmark } from 'react-icons/fa6';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  adminListProductLinkLogActors,
  adminListProductLinkLogs,
  adminPurgeProductLinkCopyLogs,
  subscribeProductLinkLogs,
} from '../../services/productLinkService.js';
import { LOG_ACTION_OPTIONS, LOG_ACTION_TONE, describeProductLinkLog } from '../../utils/productLinkLog.js';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';
import { downloadCsv, formatDateTime, formatNumber, formatRelative } from './adminUtils.js';
import styles from './Admin.module.css';
import pl from './AdminProductLinks.module.css';

const PAGE_SIZE = 50;
const CSV_ROW_LIMIT = 5000;
const COLUMN_COUNT = 3;

const RANGE_OPTIONS = [
  { value: 'today', label: 'Hôm nay', days: 1 },
  { value: '7d', label: '7 ngày', days: 7 },
  { value: '30d', label: '30 ngày', days: 30 },
  { value: 'all', label: 'Tất cả thời gian', days: null },
];

const ACTION_LABELS = Object.fromEntries(LOG_ACTION_OPTIONS.map((option) => [option.value, option.label]));

const TONE_CLASS = {
  success: pl.toneSuccess,
  warning: pl.toneWarning,
  primary: pl.tonePrimary,
  danger: pl.toneDanger,
  neutral: pl.toneNeutral,
};

/** Start of the range at local midnight ("Hôm nay" = since 00:00). */
function getRangeFrom(range) {
  const days = RANGE_OPTIONS.find((option) => option.value === range)?.days;
  if (!days) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.toISOString();
}

function exportLogsCsv(logs) {
  downloadCsv(
    ['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Chi tiết'],
    logs.map((log) => {
      const { target, extra } = describeProductLinkLog(log);
      return [log.created_at, log.actor_name, ACTION_LABELS[log.action] || log.action, target, extra];
    }),
    `nhat-ky-link-anh-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export default function ProductLinkLogsTab({ retentionDays, onChanged }) {
  const [searchInput, setSearchInput] = useState('');
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [range, setRange] = useState('30d');
  const [hideCopy, setHideCopy] = useState(true);
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [logs, setLogs] = useState({ rows: [], loading: true, loaded: false, hasMore: false, error: '' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [actors, setActors] = useState([]);
  const [newCount, setNewCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const requestRef = useRef(0);
  // Copy entries are hidden unless the admin filters on "Copy link" explicitly.
  const effectiveHideCopy = hideCopy && action !== 'copy';
  const hideCopyRef = useRef(effectiveHideCopy);

  function getFilters() {
    return { search, action, userId: actorId, from: getRangeFrom(range), hideCopy: effectiveHideCopy };
  }

  useEffect(() => {
    hideCopyRef.current = effectiveHideCopy;
  }, [effectiveHideCopy]);

  useEffect(() => {
    const requestId = ++requestRef.current;

    async function load() {
      setLogs((current) => ({ ...current, loading: true }));
      setNewCount(0);

      const result = await adminListProductLinkLogs({
        search,
        action,
        userId: actorId,
        from: getRangeFrom(range),
        hideCopy: effectiveHideCopy,
        limit: PAGE_SIZE,
      });

      if (requestId !== requestRef.current) return;

      if (result.error) {
        setLogs((current) => ({ ...current, loading: false, loaded: true, error: result.error }));
        return;
      }

      setLogs({ rows: result.data, loading: false, loaded: true, hasMore: result.data.length === PAGE_SIZE, error: '' });
    }

    load();
  }, [search, action, actorId, range, effectiveHideCopy, reloadToken]);

  useEffect(() => {
    let isActive = true;
    adminListProductLinkLogActors().then((result) => {
      if (isActive && !result.error) setActors(result.data || []);
    });
    return () => { isActive = false; };
  }, []);

  // New entries are announced instead of being inserted, so the list never shifts while reading.
  useEffect(() => subscribeProductLinkLogs((row) => {
    if (hideCopyRef.current && row.action === 'copy') return;
    setNewCount((count) => count + 1);
  }), []);

  async function loadMore() {
    const last = logs.rows.at(-1);
    if (!last) return;

    setLoadingMore(true);
    const result = await adminListProductLinkLogs({ ...getFilters(), beforeId: last.id, limit: PAGE_SIZE });
    setLoadingMore(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setLogs((current) => ({ ...current, rows: [...current.rows, ...result.data], hasMore: result.data.length === PAGE_SIZE }));
  }

  async function handleExport() {
    setIsExporting(true);
    const result = await adminListProductLinkLogs({ ...getFilters(), limit: CSV_ROW_LIMIT });
    setIsExporting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data.length === 0) {
      toast.info('Không có nhật ký để xuất.');
      return;
    }

    exportLogsCsv(result.data);

    if (result.data.length === CSV_ROW_LIMIT) {
      toast.warning(`Chỉ xuất ${formatNumber(CSV_ROW_LIMIT)} dòng mới nhất. Hãy thu hẹp bộ lọc để xuất phần còn lại.`);
    }
  }

  async function handlePurge() {
    setPurging(true);
    const result = await adminPurgeProductLinkCopyLogs();
    setPurging(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(result.data
      ? `Đã xóa ${formatNumber(result.data)} log copy cũ hơn ${retentionDays} ngày.`
      : `Không có log copy nào cũ hơn ${retentionDays} ngày.`);
    setConfirmPurge(false);
    setReloadToken((token) => token + 1);
    onChanged?.();
  }

  const hasFilters = Boolean(searchInput || action || actorId || range !== '30d' || !hideCopy);
  const isPending = logs.loading && !logs.loaded;

  function clearFilters() {
    setSearchInput('');
    setAction('');
    setActorId('');
    setRange('30d');
    setHideCopy(true);
  }

  return (
    <section className={styles.card}>
      <div className={styles.toolbar} role="search">
        <input
          type="search"
          className={`${styles.control} ${styles.search}`}
          placeholder="Mã sản phẩm, người thực hiện, người được cấp quyền…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Tìm trong nhật ký"
        />
        <select className={styles.control} value={action} onChange={(event) => setAction(event.target.value)} aria-label="Hành động">
          <option value="">Tất cả hành động</option>
          {LOG_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className={styles.control} value={actorId} onChange={(event) => setActorId(event.target.value)} aria-label="Người thực hiện">
          <option value="">Tất cả mọi người</option>
          {actors.map((actor) => <option key={actor.user_id} value={actor.user_id}>{actor.actor_name || 'Không rõ tên'}</option>)}
        </select>
        <select className={styles.control} value={range} onChange={(event) => setRange(event.target.value)} aria-label="Khoảng thời gian">
          {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <label className={pl.checkboxControl}>
          <input type="checkbox" checked={hideCopy} disabled={action === 'copy'} onChange={(event) => setHideCopy(event.target.checked)} />
          Ẩn lượt copy link
        </label>
        {hasFilters && (
          <button type="button" className={styles.actionButton} onClick={clearFilters}>
            <FaXmark aria-hidden="true" /> Xóa bộ lọc
          </button>
        )}
      </div>

      <div className={pl.logActions}>
        <span className={pl.retentionNote}>Lượt copy link được giữ {retentionDays} ngày rồi tự xóa.</span>
        <div>
          <button type="button" className={styles.actionButton} onClick={() => setReloadToken((token) => token + 1)} disabled={logs.loading}>
            <FaArrowsRotate aria-hidden="true" className={logs.loading ? styles.spin : undefined} /> Làm mới
          </button>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting || isPending}>
            <FaFileCsv aria-hidden="true" /> {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
          <button type="button" className={styles.actionButton} onClick={() => setConfirmPurge(true)}>
            <FaBroom aria-hidden="true" /> Dọn log copy cũ
          </button>
        </div>
      </div>

      {newCount > 0 && (
        <button type="button" className={pl.newBanner} onClick={() => setReloadToken((token) => token + 1)}>
          Có {formatNumber(newCount)} hoạt động mới · Bấm để hiện
        </button>
      )}

      {logs.error && (
        <div className={styles.alert} role="alert">
          <span>{logs.error}</span>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button>
        </div>
      )}

      <div className={`${styles.tableWrap} ${logs.loading && logs.loaded ? styles.tableBusy : ''}`} aria-busy={logs.loading}>
        <table className={`${styles.table} ${pl.logTable}`}>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Hoạt động</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {isPending && Array.from({ length: 6 }, (_, index) => (
              <tr key={`skeleton-${index}`} aria-hidden="true">
                {Array.from({ length: COLUMN_COUNT }, (__, cell) => <td key={cell}><span className={styles.skeletonLine} /></td>)}
              </tr>
            ))}

            {!isPending && logs.rows.length === 0 && !logs.error && (
              <tr>
                <td colSpan={COLUMN_COUNT} className={styles.emptyState}>
                  Không có hoạt động nào phù hợp.
                  {hasFilters && <button type="button" className={pl.linkButton} onClick={clearFilters}>Xóa bộ lọc</button>}
                </td>
              </tr>
            )}

            {!isPending && logs.rows.map((log) => {
              const { verb, target, extra } = describeProductLinkLog(log);
              const tone = LOG_ACTION_TONE[log.action] || 'neutral';

              return (
                <tr key={log.id}>
                  <td className={styles.dateCell} title={formatDateTime(log.created_at)}>
                    <time dateTime={log.created_at}>{formatRelative(log.created_at)}</time>
                  </td>
                  <td>
                    <div className={pl.logSentence}>
                      <span className={`${pl.actionBadge} ${TONE_CLASS[tone]}`}>
                        <span className={pl.toneDot} aria-hidden="true" />
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span>
                        <strong>{log.actor_name || 'Không rõ'}</strong> {verb}{target ? <> <strong>{target}</strong></> : null}
                      </span>
                    </div>
                  </td>
                  <td className={pl.logExtra}>{extra || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {logs.hasMore && !logs.loading && (
        <div className={pl.loadMore}>
          <button type="button" className={styles.actionButton} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : 'Tải thêm'}
          </button>
        </div>
      )}

      {confirmPurge && (
        <AdminConfirmDialog
          title="Dọn log copy cũ?"
          message={`Xóa vĩnh viễn các lượt copy link cũ hơn ${retentionDays} ngày. Các hoạt động khác (đánh dấu, sửa, nhập, phân quyền) được giữ nguyên.`}
          confirmLabel="Xóa log cũ"
          danger
          busy={purging}
          onConfirm={handlePurge}
          onCancel={() => setConfirmPurge(false)}
        />
      )}
    </section>
  );
}
