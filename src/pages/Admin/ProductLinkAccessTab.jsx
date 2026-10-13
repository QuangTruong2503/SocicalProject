import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaTriangleExclamation, FaXmark } from 'react-icons/fa6';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  ACCESS_LEVEL_OPTIONS,
  adminListProductLinkAccess,
  adminSetProductLinkAccess,
} from '../../services/productLinkService.js';
import AdminConfirmDialog from './AdminConfirmDialog.jsx';
import AdminUserAvatar from './AdminUserAvatar.jsx';
import { Pagination, SortHeader } from './AdminTableParts.jsx';
import { formatDateTime, formatNumber, formatRelative } from './adminUtils.js';
import { STATUS_OPTIONS, getProfileName, getStatusLabel } from './adminUserLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';
import pl from './AdminProductLinks.module.css';

const PAGE_SIZE = 50;
const COLUMN_COUNT = 7;
const GRANT_LEVELS = ACCESS_LEVEL_OPTIONS.slice(1);

const LEVEL_FILTER_OPTIONS = [
  { value: 'granted', label: 'Đã có quyền' },
  { value: 'none', label: 'Chưa có quyền' },
  ...GRANT_LEVELS.map((option) => ({ value: option.value, label: option.label })),
  { value: 'admin', label: 'Quản trị viên' },
];

function getLevelLabel(level) {
  return ACCESS_LEVEL_OPTIONS.find((option) => option.value === (level || ''))?.label || level;
}

/** Copy for the confirmation dialog of a single or bulk access change. */
function describeChange(change) {
  const nextLabel = getLevelLabel(change.level);

  if (change.rows.length === 1) {
    const [row] = change.rows;
    const name = getProfileName(row);
    const warning = row.status === 'suspended' && change.level
      ? ' Tài khoản này đang bị khóa nên quyền chỉ có hiệu lực sau khi được mở khóa.'
      : '';

    return {
      title: change.level ? 'Đổi quyền truy cập?' : 'Thu hồi quyền?',
      message: change.level
        ? `${name}: ${getLevelLabel(row.level)} → ${nextLabel}.${warning}`
        : `${name} sẽ không còn thấy trang Link ảnh sản phẩm.`,
      confirmLabel: change.level ? 'Đổi quyền' : 'Thu hồi',
    };
  }

  return {
    title: change.level ? `Đặt quyền cho ${formatNumber(change.rows.length)} người?` : `Thu hồi quyền của ${formatNumber(change.rows.length)} người?`,
    message: change.level
      ? `Tất cả người đã chọn sẽ có quyền "${nextLabel}".`
      : 'Tất cả người đã chọn sẽ không còn thấy trang Link ảnh sản phẩm.',
    confirmLabel: change.level ? 'Áp dụng' : 'Thu hồi',
  };
}

export default function ProductLinkAccessTab({ initialFilters, onChanged }) {
  const [searchInput, setSearchInput] = useState('');
  const [level, setLevel] = useState(initialFilters?.level || '');
  const [status, setStatus] = useState(initialFilters?.status || '');
  const [sort, setSort] = useState({ key: 'name', desc: false });
  const search = useDebouncedValue(searchInput.trim(), 300);
  const filtersKey = JSON.stringify([search, level, status, sort]);
  // Page and selection belong to one set of filters: changing a filter resets both.
  const [pageState, setPageState] = useState({ key: filtersKey, page: 0 });
  const page = pageState.key === filtersKey ? pageState.page : 0;
  const selectionKey = `${filtersKey}|${page}`;
  const [selectionState, setSelectionState] = useState({ key: selectionKey, ids: [] });
  const selectedIds = selectionState.key === selectionKey ? selectionState.ids : [];
  const [bulkLevel, setBulkLevel] = useState('viewer');
  const [table, setTable] = useState({ rows: [], totalCount: 0, loading: true, loaded: false, error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);
  const selectAllRef = useRef(null);

  useEffect(() => {
    const requestId = ++requestRef.current;

    async function load() {
      setTable((current) => ({ ...current, loading: true }));

      const result = await adminListProductLinkAccess({
        search,
        level,
        status,
        sort: sort.key,
        desc: sort.desc,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      if (requestId !== requestRef.current) return;

      if (result.error) {
        setTable((current) => ({ ...current, loading: false, loaded: true, error: result.error }));
        return;
      }

      setTable({ rows: result.data.rows, totalCount: result.data.totalCount, loading: false, loaded: true, error: '' });
    }

    load();
  }, [search, level, status, sort, page, reloadToken]);

  const selectableRows = table.rows.filter((row) => row.role !== 'admin');
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const hasFilters = Boolean(searchInput || level || status);
  const isPending = table.loading && !table.loaded;

  function setPage(nextPage) {
    setPageState({ key: filtersKey, page: nextPage });
  }

  function setSelectedIds(ids) {
    setSelectionState({ key: selectionKey, ids });
  }

  function toggleSelected(id) {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  function handleSort(key) {
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'name' }));
  }

  function clearFilters() {
    setSearchInput('');
    setLevel('');
    setStatus('');
  }

  async function applyChange() {
    setSaving(true);
    const result = await adminSetProductLinkAccess(pending.rows.map((row) => row.id), pending.level);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    const updates = new Map((result.data || []).map((row) => [row.user_id, row]));
    setTable((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        const update = updates.get(row.id);
        return update
          ? { ...row, level: update.level, granted_by: update.granted_by, granted_by_name: update.granted_by_name, access_updated_at: update.updated_at }
          : row;
      }),
    }));

    const label = getLevelLabel(pending.level);
    toast.success(pending.rows.length === 1
      ? (pending.level ? `Đã đặt quyền "${label}" cho ${getProfileName(pending.rows[0])}.` : `Đã thu hồi quyền của ${getProfileName(pending.rows[0])}.`)
      : (pending.level ? `Đã đặt quyền "${label}" cho ${formatNumber(updates.size)} người.` : `Đã thu hồi quyền của ${formatNumber(updates.size)} người.`));

    if (pending.rows.length > 1) setSelectedIds([]);
    setPending(null);
    onChanged?.();
  }

  const copy = pending && describeChange(pending);

  return (
    <section className={styles.card}>
      <ul className={pl.levelLegend} aria-label="Các cấp quyền">
        {GRANT_LEVELS.map((option, index) => (
          <li key={option.value}>
            <span className={pl.levelStep} aria-hidden="true">{index + 1}</span>
            <div>
              <strong>{option.label}</strong>
              <small>{option.hint.replace(/^\+ /, 'Thêm: ')}</small>
            </div>
          </li>
        ))}
        <li>
          <span className={pl.levelStep} aria-hidden="true">★</span>
          <div>
            <strong>Quản trị viên</strong>
            <small>Luôn có toàn quyền, không cần cấp</small>
          </div>
        </li>
      </ul>

      <div className={styles.toolbar} role="search">
        <input
          type="search"
          className={`${styles.control} ${styles.search}`}
          placeholder="Tên, tên đăng nhập, email…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Tìm người dùng"
        />
        <select className={styles.control} value={level} onChange={(event) => setLevel(event.target.value)} aria-label="Lọc theo quyền">
          <option value="">Tất cả quyền</option>
          {LEVEL_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select className={styles.control} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Trạng thái tài khoản">
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {hasFilters && (
          <button type="button" className={styles.actionButton} onClick={clearFilters}>
            <FaXmark aria-hidden="true" /> Xóa bộ lọc
          </button>
        )}
        <button type="button" className={styles.actionButton} onClick={() => { setReloadToken((token) => token + 1); onChanged?.(); }} disabled={table.loading}>
          <FaArrowsRotate aria-hidden="true" className={table.loading ? styles.spin : undefined} /> Làm mới
        </button>
      </div>

      <div className={us.listMeta}>
        {selectedIds.length > 0 ? (
          <div className={us.bulkBar} role="region" aria-label="Phân quyền hàng loạt">
            <strong>Đã chọn {formatNumber(selectedIds.length)}</strong>
            <select className={styles.control} value={bulkLevel} onChange={(event) => setBulkLevel(event.target.value)} aria-label="Quyền áp dụng">
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.value ? option.label : 'Thu hồi quyền'}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setPending({ level: bulkLevel, rows: table.rows.filter((row) => selectedIds.includes(row.id)) })}
            >
              Áp dụng
            </button>
            <button type="button" className={us.linkButton} onClick={() => setSelectedIds([])}>Bỏ chọn</button>
          </div>
        ) : (
          <span>{isPending ? 'Đang tải…' : `${formatNumber(table.totalCount)} người dùng`}</span>
        )}
      </div>

      {table.error && (
        <div className={styles.alert} role="alert">
          <span>{table.error}</span>
          <button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button>
        </div>
      )}

      <div className={`${styles.tableWrap} ${table.loading && table.loaded ? styles.tableBusy : ''}`} aria-busy={table.loading}>
        <table className={`${styles.table} ${pl.accessTable}`}>
          <thead>
            <tr>
              <th className={us.checkCell}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedIds(allSelected ? [] : selectableRows.map((row) => row.id))}
                  disabled={selectableRows.length === 0}
                  aria-label="Chọn tất cả trên trang này"
                />
              </th>
              <SortHeader label="Người dùng" sortKey="name" sort={sort} onSort={handleSort} />
              <th>Trạng thái</th>
              <SortHeader label="Quyền trang Link ảnh" sortKey="level" sort={sort} onSort={handleSort} />
              <th>Cấp bởi</th>
              <SortHeader label="Cập nhật" sortKey="updated_at" sort={sort} onSort={handleSort} />
              <th aria-label="Ghi chú" />
            </tr>
          </thead>
          <tbody>
            {isPending && Array.from({ length: 6 }, (_, index) => (
              <tr key={`skeleton-${index}`} aria-hidden="true">
                {Array.from({ length: COLUMN_COUNT }, (__, cell) => <td key={cell}><span className={styles.skeletonLine} /></td>)}
              </tr>
            ))}

            {!isPending && table.rows.length === 0 && !table.error && (
              <tr>
                <td colSpan={COLUMN_COUNT} className={styles.emptyState}>
                  {hasFilters ? 'Không có người dùng phù hợp với bộ lọc.' : 'Chưa có người dùng nào.'}
                  {hasFilters && <button type="button" className={us.linkButton} onClick={clearFilters}>Xóa bộ lọc</button>}
                </td>
              </tr>
            )}

            {!isPending && table.rows.map((row) => {
              const isAdmin = row.role === 'admin';
              const isSuspended = row.status === 'suspended';
              const name = getProfileName(row);

              return (
                <tr key={row.id} className={selectedIds.includes(row.id) ? us.rowSelected : undefined}>
                  <td className={us.checkCell}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                      disabled={isAdmin}
                      aria-label={`Chọn ${name}`}
                      title={isAdmin ? 'Quản trị viên luôn có toàn quyền' : undefined}
                    />
                  </td>
                  <td>
                    <div className={pl.userCell}>
                      <AdminUserAvatar profile={row} />
                      <span>
                        <strong>{name}</strong>
                        <small>{row.email || '—'}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${isSuspended ? styles.badgeSuspended : styles.badgeActive}`}>{getStatusLabel(row.status)}</span>
                  </td>
                  <td>
                    {isAdmin ? (
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>Toàn quyền (admin)</span>
                    ) : (
                      <select
                        className={`${styles.control} ${pl.levelSelect} ${row.level ? pl.levelSelectGranted : ''}`}
                        value={row.level || ''}
                        disabled={saving}
                        onChange={(event) => setPending({ level: event.target.value, rows: [row] })}
                        aria-label={`Quyền của ${name}`}
                      >
                        {ACCESS_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className={styles.dateCell}>{row.granted_by_name || '—'}</td>
                  <td className={styles.dateCell} title={formatDateTime(row.access_updated_at)}>
                    {row.access_updated_at ? formatRelative(row.access_updated_at) : '—'}
                  </td>
                  <td>
                    {isSuspended && row.level && (
                      <span className={pl.inactiveHint} title="Tài khoản đang bị khóa nên quyền này chưa có hiệu lực">
                        <FaTriangleExclamation aria-hidden="true" /> Chưa hiệu lực
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} totalCount={table.totalCount} disabled={table.loading} onPageChange={setPage} />

      {pending && (
        <AdminConfirmDialog
          title={copy.title}
          message={copy.message}
          confirmLabel={copy.confirmLabel}
          danger={!pending.level}
          busy={saving}
          onConfirm={applyChange}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
