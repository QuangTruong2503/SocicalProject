import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../hooks/useAuth.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { listProfiles } from '../../services/profileService.js';
import {
  ACCESS_LEVEL_OPTIONS,
  listProductLinkAccess,
  listProductLinkLogs,
  setProductLinkAccess,
} from '../../services/productLinkService.js';
import { LOG_ACTION_OPTIONS, describeProductLinkLog, formatDateTime } from '../../utils/productLinkLog.js';
import styles from './Admin.module.css';

const LOG_PAGE_SIZE = 50;

function PermissionsTab() {
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [access, setAccess] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [search, setSearch] = useState('');
  const [onlyGranted, setOnlyGranted] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    let active = true;
    Promise.all([
      listProfiles({ search: debouncedSearch }),
      listProductLinkAccess(),
    ]).then(([profilesResult, accessResult]) => {
      if (!active) return;
      setLoading(false);
      if (profilesResult.error || accessResult.error) {
        toast.error(profilesResult.error || accessResult.error);
        return;
      }
      setProfiles(profilesResult.data);
      setAccess(new Map(accessResult.data.map((row) => [row.user_id, row])));
    });
    return () => { active = false; };
  }, [debouncedSearch]);

  async function changeLevel(profile, level) {
    setSavingId(profile.id);
    const result = await setProductLinkAccess(profile.id, level, currentUser?.id);
    setSavingId('');
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setAccess((current) => {
      const next = new Map(current);
      if (level) next.set(profile.id, result.data);
      else next.delete(profile.id);
      return next;
    });
    const label = ACCESS_LEVEL_OPTIONS.find((option) => option.value === level)?.label;
    toast.success(level
      ? `Đã cấp quyền "${label}" cho ${profile.full_name || profile.username || profile.email}.`
      : `Đã thu hồi quyền của ${profile.full_name || profile.username || profile.email}.`);
  }

  const rows = useMemo(
    () => profiles.filter((profile) => !onlyGranted || profile.role === 'admin' || access.has(profile.id)),
    [profiles, access, onlyGranted],
  );
  const grantedCount = access.size;

  return (
    <section className={styles.card}>
      <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
        Cấp quyền theo từng tài khoản. Quản trị viên luôn có toàn quyền.{' '}
        {ACCESS_LEVEL_OPTIONS.slice(1).map((option, index) => (
          <span key={option.value}>{index > 0 && ' · '}<strong>{option.label}</strong>: {option.hint.replace(/^\+ /, 'thêm ')}</span>
        ))}
      </p>

      <div className={styles.filters} style={{ gridTemplateColumns: '2fr 1fr' }}>
        <input
          placeholder="Tìm tên đăng nhập, email, họ tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className={styles.modalCheckbox} style={{ margin: 0 }}>
          <input type="checkbox" checked={onlyGranted} onChange={(e) => setOnlyGranted(e.target.checked)} />
          Chỉ người đã có quyền ({grantedCount})
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Email</th>
              <th>Trạng thái</th>
              <th style={{ width: 260 }}>Quyền trang Link ảnh</th>
              <th>Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.emptyState}>Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Không có người dùng phù hợp.</td></tr>
            ) : rows.map((profile) => {
              const current = access.get(profile.id);
              const isAdmin = profile.role === 'admin';

              return (
                <tr key={profile.id}>
                  <td>{profile.full_name || profile.username || '—'}</td>
                  <td>{profile.email || '—'}</td>
                  <td>
                    <span className={`${styles.badge} ${profile.status === 'suspended' ? styles.badgeSuspended : styles.badgeActive}`}>
                      {profile.status === 'suspended' ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td>
                    {isAdmin ? (
                      <span className={`${styles.badge} ${styles.badgeAdmin}`}>Toàn quyền (admin)</span>
                    ) : (
                      <select
                        value={current?.level ?? ''}
                        disabled={savingId === profile.id}
                        onChange={(e) => changeLevel(profile, e.target.value)}
                        aria-label={`Quyền của ${profile.email}`}
                        style={{
                          width: '100%',
                          minHeight: 36,
                          borderRadius: 8,
                          padding: '6px 10px',
                          border: '1px solid var(--color-border)',
                          background: current ? 'rgba(34, 197, 94, .1)' : 'var(--color-surface)',
                          color: 'var(--color-text)',
                          font: 'inherit',
                        }}
                      >
                        {ACCESS_LEVEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{current ? formatDateTime(current.updated_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    let active = true;
    listProductLinkLogs({ limit: LOG_PAGE_SIZE, action, search: debouncedSearch }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setLogs(result.data);
      setHasMore(result.data.length === LOG_PAGE_SIZE);
    });
    return () => { active = false; };
  }, [action, debouncedSearch]);

  async function loadMore() {
    const last = logs[logs.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const result = await listProductLinkLogs({ limit: LOG_PAGE_SIZE, action, search: debouncedSearch, beforeId: last.id });
    setLoadingMore(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setLogs((current) => [...current, ...result.data]);
    setHasMore(result.data.length === LOG_PAGE_SIZE);
  }

  return (
    <section className={styles.card}>
      <div className={styles.filters} style={{ gridTemplateColumns: '2fr 1fr' }}>
        <input placeholder="Tìm theo người thực hiện hoặc mã sản phẩm..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Tất cả hành động</option>
          {LOG_ACTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Người thực hiện</th>
              <th>Hành động</th>
              <th>Đối tượng</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className={styles.emptyState}>Đang tải...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>Chưa có nhật ký phù hợp.</td></tr>
            ) : logs.map((log) => {
              const { verb, target, extra } = describeProductLinkLog(log);
              return (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                  <td>{log.actor_name || '—'}</td>
                  <td>{verb}</td>
                  <td><strong>{target || '—'}</strong></td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{extra || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button type="button" className={styles.tab} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải...' : 'Tải thêm'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function AdminProductLinksPage() {
  const [tab, setTab] = useState('permissions');

  return (
    <>
      <Helmet><title>Quản trị · Link ảnh sản phẩm</title></Helmet>
      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>LINK ẢNH SẢN PHẨM</h1></div>
        <Link to="/link-anh-san-pham" className={styles.tab} style={{ textDecoration: 'none' }}>Mở trang →</Link>
      </header>

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'permissions' ? styles.tabActive : ''}`} onClick={() => setTab('permissions')}>
          Phân quyền
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'logs' ? styles.tabActive : ''}`} onClick={() => setTab('logs')}>
          Nhật ký hoạt động
        </button>
      </div>

      {tab === 'permissions' ? <PermissionsTab /> : <LogsTab />}
    </>
  );
}
