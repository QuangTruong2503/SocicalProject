import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaEye, FaFileCsv, FaLock, FaLockOpen, FaPen, FaXmark } from 'react-icons/fa6';
import { useAuth } from '../../hooks/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  adminBulkUpdateStatus,
  adminListProfiles,
  adminUpdateProfile,
  getAdminProfileStats,
} from '../../services/profileService.js';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import AdminUserAvatar from './AdminUserAvatar.jsx';
import AdminUserDrawer from './AdminUserDrawer.jsx';
import AdminUserEditModal from './AdminUserEditModal.jsx';
import { Pagination, SortHeader } from './AdminTableParts.jsx';
import { downloadCsv, formatDateTime, formatNumber, formatRelative } from './adminUtils.js';
import { ROLE_OPTIONS, STATUS_OPTIONS, getProfileName, getRoleLabel, getStatusLabel } from './adminUserLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

const PAGE_SIZE = 50;
const CSV_ROW_LIMIT = 5000;
const SKELETON_ROWS = 6;
const COLUMN_COUNT = 9;
const SELF_LOCK_HINT = 'Bạn không thể tự thay đổi tài khoản của chính mình';

const VERIFIED_OPTIONS = [
  { value: 'true', label: 'Đã xác minh' },
  { value: 'false', label: 'Chưa xác minh' },
];

// Columns returned by admin_list_profiles; used to merge an RPC update into a list row.
const LIST_FIELDS = ['role', 'status', 'is_verified', 'plan', 'credits', 'last_login_at'];

function exportUsersCsv(rows) {
  downloadCsv(
    ['Họ tên', 'Tên đăng nhập', 'Email', 'Vai trò', 'Trạng thái', 'Xác minh', 'Gói', 'Credits', 'Đăng nhập gần nhất', 'Tham gia', 'ID'],
    rows.map((row) => [
      row.full_name,
      row.username,
      row.email,
      getRoleLabel(row.role),
      getStatusLabel(row.status),
      row.is_verified ? 'Có' : 'Không',
      row.plan,
      row.credits,
      row.last_login_at,
      row.created_at,
      row.id,
    ]),
    `nguoi-dung-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

function StatTile({ label, value, hint, loading, onClick, active }) {
  const content = (
    <>
      <span>{label}</span>
      {loading ? <span className={styles.skeletonValue} aria-hidden="true" /> : <strong>{formatNumber(value)}</strong>}
      <small>{hint}</small>
    </>
  );

  if (!onClick) {
    return <article className={styles.statCard}>{content}</article>;
  }

  return (
    <button
      type="button"
      className={`${styles.statCard} ${us.statButton} ${active ? us.statButtonActive : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {content}
    </button>
  );
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [searchInput, setSearchInput] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState('');
  const [sort, setSort] = useState({ key: 'created_at', desc: true });
  const search = useDebouncedValue(searchInput.trim(), 300);
  const filtersKey = JSON.stringify([search, role, status, verified, sort]);
  // Page and selection belong to one set of filters: changing a filter resets both.
  const [pageState, setPageState] = useState({ key: filtersKey, page: 0 });
  const page = pageState.key === filtersKey ? pageState.page : 0;
  const selectionKey = `${filtersKey}|${page}`;
  const [selectionState, setSelectionState] = useState({ key: selectionKey, ids: [] });
  const selectedIds = selectionState.key === selectionKey ? selectionState.ids : [];

  const [table, setTable] = useState({ rows: [], totalCount: 0, loading: true, loaded: false, error: '' });
  const [stats, setStats] = useState({ data: null, error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  const [statsToken, setStatsToken] = useState(0);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const requestRef = useRef(0);
  const selectAllRef = useRef(null);

  const listParams = {
    search,
    role,
    status,
    verified: verified === '' ? null : verified === 'true',
    sort: sort.key,
    desc: sort.desc,
  };

  useEffect(() => {
    const requestId = ++requestRef.current;

    async function load() {
      setTable((current) => ({ ...current, loading: true }));

      const result = await adminListProfiles({
        search,
        role,
        status,
        verified: verified === '' ? null : verified === 'true',
        sort: sort.key,
        desc: sort.desc,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      // A newer request (faster typing, another filter) already owns the table.
      if (requestId !== requestRef.current) {
        return;
      }

      if (result.error) {
        setTable((current) => ({ ...current, loading: false, loaded: true, error: result.error }));
        return;
      }

      setTable({ rows: result.data.rows, totalCount: result.data.totalCount, loading: false, loaded: true, error: '' });
    }

    load();
  }, [search, role, status, verified, sort, page, reloadToken]);

  useEffect(() => {
    let isActive = true;

    getAdminProfileStats().then((result) => {
      if (isActive) {
        setStats({ data: result.data, error: result.error || '' });
      }
    });

    return () => { isActive = false; };
  }, [statsToken]);

  const selectableRows = table.rows.filter((row) => row.id !== currentUser?.id);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const hasFilters = Boolean(searchInput || role || status || verified);
  const isTablePending = table.loading && !table.loaded;

  function setPage(nextPage) {
    setPageState({ key: filtersKey, page: nextPage });
  }

  function setSelectedIds(ids) {
    setSelectionState({ key: selectionKey, ids });
  }

  function toggleSelected(id) {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : selectableRows.map((row) => row.id));
  }

  function handleSort(key) {
    setSort((current) => (
      current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'name' && key !== 'email' }
    ));
  }

  function clearFilters() {
    setSearchInput('');
    setRole('');
    setStatus('');
    setVerified('');
  }

  function refreshAll() {
    setReloadToken((token) => token + 1);
    setStatsToken((token) => token + 1);
  }

  function applyRowUpdate(updated) {
    const patch = Object.fromEntries(LIST_FIELDS.map((field) => [field, updated[field]]));
    setTable((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === updated.id ? { ...row, ...patch } : row)),
    }));
  }

  // Dialogs replace the detail drawer while open and hand back to it afterwards.
  function closeEditor(updatedProfile) {
    if (editing?.fromDetail) {
      setDetail({ ...editing.profile, ...(updatedProfile || {}) });
    }
    setEditing(null);
  }

  async function saveEdit(updates) {
    setSaving(true);
    const result = await adminUpdateProfile(editing.profile.id, updates);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Đã cập nhật ${getProfileName(result.data)}.`);
    applyRowUpdate(result.data);
    setStatsToken((token) => token + 1);
    closeEditor(result.data);
  }

  function openEditor(profile, fromDetail = false) {
    setDetail(null);
    setEditing({ profile, fromDetail });
  }

  function requestToggleLock(profile, fromDetail = false) {
    setDetail(null);
    setConfirm({
      type: 'single',
      profile,
      status: profile.status === 'suspended' ? 'active' : 'suspended',
      fromDetail,
    });
  }

  function requestBulk(nextStatus) {
    setConfirm({ type: 'bulk', ids: selectedIds, status: nextStatus });
  }

  function closeConfirm(updatedProfile) {
    if (confirm?.fromDetail) {
      setDetail({ ...confirm.profile, ...(updatedProfile || {}) });
    }
    setConfirm(null);
  }

  async function runConfirm() {
    setConfirmBusy(true);

    if (confirm.type === 'single') {
      const result = await adminUpdateProfile(confirm.profile.id, { status: confirm.status });
      setConfirmBusy(false);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(confirm.status === 'suspended'
        ? `Đã khóa ${getProfileName(result.data)}.`
        : `Đã mở khóa ${getProfileName(result.data)}.`);
      applyRowUpdate(result.data);
      setStatsToken((token) => token + 1);
      closeConfirm(result.data);
      return;
    }

    const result = await adminBulkUpdateStatus(confirm.ids, confirm.status);
    setConfirmBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Đã ${confirm.status === 'suspended' ? 'khóa' : 'mở khóa'} ${formatNumber(result.data)} người dùng.`);
    setSelectedIds([]);
    closeConfirm();
    refreshAll();
  }

  async function handleExport() {
    setIsExporting(true);
    const result = await adminListProfiles({ ...listParams, limit: CSV_ROW_LIMIT, offset: 0 });
    setIsExporting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data.rows.length === 0) {
      toast.info('Không có dữ liệu để xuất.');
      return;
    }

    exportUsersCsv(result.data.rows);

    if (result.data.totalCount > result.data.rows.length) {
      toast.warning(`Chỉ xuất ${formatNumber(result.data.rows.length)}/${formatNumber(result.data.totalCount)} người dùng đầu tiên.`);
    }
  }

  const confirmCopy = confirm && (confirm.type === 'single'
    ? {
      title: confirm.status === 'suspended' ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?',
      message: confirm.status === 'suspended'
        ? `${getProfileName(confirm.profile)} sẽ không thể dùng các trang cần đăng nhập và các tính năng báo giá. Phiên đang mở vẫn giữ đăng nhập nhưng bị chặn truy cập dữ liệu.`
        : `${getProfileName(confirm.profile)} sẽ dùng lại được toàn bộ tính năng.`,
      confirmLabel: confirm.status === 'suspended' ? 'Khóa tài khoản' : 'Mở khóa',
    }
    : {
      title: `${confirm.status === 'suspended' ? 'Khóa' : 'Mở khóa'} ${formatNumber(confirm.ids.length)} người dùng?`,
      message: confirm.status === 'suspended'
        ? 'Các tài khoản đã chọn sẽ bị chặn khỏi các trang cần đăng nhập và các tính năng báo giá.'
        : 'Các tài khoản đã chọn sẽ dùng lại được toàn bộ tính năng.',
      confirmLabel: confirm.status === 'suspended' ? 'Khóa tất cả' : 'Mở khóa tất cả',
    });

  return (
    <>
      <Helmet><title>Quản lý người dùng</title></Helmet>

      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>NGƯỜI DÙNG</h1></div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.actionButton} onClick={refreshAll} disabled={table.loading}>
            <FaArrowsRotate aria-hidden="true" className={table.loading ? styles.spin : undefined} />
            Làm mới
          </button>
          <button type="button" className={styles.actionButton} onClick={handleExport} disabled={isExporting || isTablePending}>
            <FaFileCsv aria-hidden="true" />
            {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </div>
      </header>

      <section className={styles.statGrid} aria-label="Tổng quan người dùng">
        <StatTile label="Tổng người dùng" value={stats.data?.total} hint={`${formatNumber(stats.data?.verified)} đã xác minh`} loading={!stats.data && !stats.error} />
        <StatTile
          label="Quản trị viên"
          value={stats.data?.admins}
          hint="Đang hoạt động · bấm để lọc"
          loading={!stats.data && !stats.error}
          active={role === 'admin'}
          onClick={() => setRole(role === 'admin' ? '' : 'admin')}
        />
        <StatTile
          label="Đã khóa"
          value={stats.data?.suspended}
          hint="Bấm để lọc"
          loading={!stats.data && !stats.error}
          active={status === 'suspended'}
          onClick={() => setStatus(status === 'suspended' ? '' : 'suspended')}
        />
        <StatTile label="Mới trong 7 ngày" value={stats.data?.new_7d} hint="Tài khoản vừa đăng ký" loading={!stats.data && !stats.error} />
        <StatTile label="Đăng nhập 7 ngày" value={stats.data?.active_7d} hint="Có đăng nhập gần đây" loading={!stats.data && !stats.error} />
      </section>

      {stats.error && !table.error && (
        <div className={styles.alert} role="alert">
          <span>{stats.error}</span>
          <button type="button" onClick={() => setStatsToken((token) => token + 1)}>Thử lại</button>
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.toolbar} role="search">
          <input
            type="search"
            className={`${styles.control} ${styles.search}`}
            placeholder="Tên, tên đăng nhập, email hoặc ID…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Tìm người dùng"
          />
          <select className={styles.control} value={role} onChange={(event) => setRole(event.target.value)} aria-label="Vai trò">
            <option value="">Tất cả vai trò</option>
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className={styles.control} value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Trạng thái">
            <option value="">Tất cả trạng thái</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select className={styles.control} value={verified} onChange={(event) => setVerified(event.target.value)} aria-label="Xác minh">
            <option value="">Xác minh: tất cả</option>
            {VERIFIED_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {hasFilters && (
            <button type="button" className={styles.actionButton} onClick={clearFilters}>
              <FaXmark aria-hidden="true" /> Xóa bộ lọc
            </button>
          )}
        </div>

        <div className={us.listMeta}>
          {selectedIds.length > 0 ? (
            <div className={us.bulkBar} role="region" aria-label="Thao tác hàng loạt">
              <strong>Đã chọn {formatNumber(selectedIds.length)}</strong>
              <button type="button" className={styles.actionButton} onClick={() => requestBulk('suspended')}>
                <FaLock aria-hidden="true" /> Khóa
              </button>
              <button type="button" className={styles.actionButton} onClick={() => requestBulk('active')}>
                <FaLockOpen aria-hidden="true" /> Mở khóa
              </button>
              <button type="button" className={us.linkButton} onClick={() => setSelectedIds([])}>Bỏ chọn</button>
            </div>
          ) : (
            <span>{isTablePending ? 'Đang tải…' : `${formatNumber(table.totalCount)} người dùng`}</span>
          )}
        </div>

        {table.error && (
          <div className={styles.alert} role="alert">
            <span>{table.error}</span>
            <button type="button" onClick={refreshAll}>Thử lại</button>
          </div>
        )}

        <div className={`${styles.tableWrap} ${table.loading && table.loaded ? styles.tableBusy : ''}`} aria-busy={table.loading}>
          <table className={`${styles.table} ${us.usersTable}`}>
            <thead>
              <tr>
                <th className={us.checkCell}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={selectableRows.length === 0}
                    aria-label="Chọn tất cả trên trang này"
                  />
                </th>
                <SortHeader label="Người dùng" sortKey="name" sort={sort} onSort={handleSort} />
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Xác minh</th>
                <th>Gói</th>
                <SortHeader label="Đăng nhập gần nhất" sortKey="last_login_at" sort={sort} onSort={handleSort} />
                <SortHeader label="Tham gia" sortKey="created_at" sort={sort} onSort={handleSort} />
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isTablePending && Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  {Array.from({ length: COLUMN_COUNT }, (__, cell) => (
                    <td key={cell}><span className={styles.skeletonLine} /></td>
                  ))}
                </tr>
              ))}

              {!isTablePending && table.rows.length === 0 && !table.error && (
                <tr>
                  <td colSpan={COLUMN_COUNT} className={styles.emptyState}>
                    {hasFilters ? 'Không có người dùng phù hợp với bộ lọc.' : 'Chưa có người dùng nào.'}
                    {hasFilters && <button type="button" className={us.linkButton} onClick={clearFilters}>Xóa bộ lọc</button>}
                  </td>
                </tr>
              )}

              {!isTablePending && table.rows.map((row) => {
                const isSelf = row.id === currentUser?.id;
                const isSuspended = row.status === 'suspended';
                const name = getProfileName(row);

                return (
                  <tr key={row.id} className={selectedIds.includes(row.id) ? us.rowSelected : undefined}>
                    <td className={us.checkCell}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleSelected(row.id)}
                        disabled={isSelf}
                        aria-label={`Chọn ${name}`}
                        title={isSelf ? SELF_LOCK_HINT : undefined}
                      />
                    </td>
                    <td>
                      <button type="button" className={us.userCell} onClick={() => setDetail(row)}>
                        <AdminUserAvatar profile={row} />
                        <span>
                          <strong>
                            {name}
                            {isSelf && <span className={`${styles.badge} ${styles.badgeDefault} ${us.selfBadge}`}>Bạn</span>}
                          </strong>
                          <small>{row.email || (row.username ? `@${row.username}` : '—')}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${row.role === 'admin' ? styles.badgeAdmin : styles.badgeUser}`}>{getRoleLabel(row.role)}</span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${isSuspended ? styles.badgeSuspended : styles.badgeActive}`}>{getStatusLabel(row.status)}</span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${row.is_verified ? styles.badgeActive : styles.badgeDefault}`}>
                        {row.is_verified ? 'Đã xác minh' : 'Chưa xác minh'}
                      </span>
                    </td>
                    <td className={us.planCell}>
                      <strong>{row.plan || 'free'}</strong>
                      <small>{formatNumber(row.credits)} credits</small>
                    </td>
                    <td className={styles.dateCell} title={formatDateTime(row.last_login_at)}>
                      {row.last_login_at ? formatRelative(row.last_login_at) : 'Chưa ghi nhận'}
                    </td>
                    <td className={styles.dateCell} title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button type="button" title="Xem chi tiết" aria-label={`Xem chi tiết ${name}`} onClick={() => setDetail(row)}>
                          <FaEye aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          title={isSelf ? SELF_LOCK_HINT : 'Chỉnh sửa'}
                          aria-label={`Chỉnh sửa ${name}`}
                          onClick={() => openEditor(row)}
                          disabled={isSelf}
                        >
                          <FaPen aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={isSuspended ? undefined : styles.danger}
                          title={isSelf ? SELF_LOCK_HINT : isSuspended ? 'Mở khóa' : 'Khóa tài khoản'}
                          aria-label={`${isSuspended ? 'Mở khóa' : 'Khóa'} ${name}`}
                          onClick={() => requestToggleLock(row)}
                          disabled={isSelf}
                        >
                          {isSuspended ? <FaLockOpen aria-hidden="true" /> : <FaLock aria-hidden="true" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={table.totalCount}
          disabled={table.loading}
          onPageChange={setPage}
        />
      </section>

      {detail && (
        <AdminUserDrawer
          summary={detail}
          isSelf={detail.id === currentUser?.id}
          onClose={() => setDetail(null)}
          onEdit={(profile) => openEditor(profile, true)}
          onToggleLock={(profile) => requestToggleLock(profile, true)}
        />
      )}

      {editing && (
        <AdminUserEditModal
          profile={editing.profile}
          saving={saving}
          onSave={saveEdit}
          onCancel={() => closeEditor()}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.confirmLabel}
          danger={confirm.status === 'suspended'}
          busy={confirmBusy}
          onConfirm={runConfirm}
          onCancel={() => closeConfirm()}
        />
      )}
    </>
  );
}
