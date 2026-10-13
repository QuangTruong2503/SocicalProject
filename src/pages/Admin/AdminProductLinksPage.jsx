import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { FaArrowUpRightFromSquare, FaTriangleExclamation } from 'react-icons/fa6';
import { getAdminProductLinkStats } from '../../services/productLinkService.js';
import ProductLinkAccessTab from './ProductLinkAccessTab.jsx';
import ProductLinkLogsTab from './ProductLinkLogsTab.jsx';
import { formatNumber } from './adminUtils.js';
import styles from './Admin.module.css';
import pl from './AdminProductLinks.module.css';

const TABS = [
  { id: 'permissions', label: 'Phân quyền' },
  { id: 'logs', label: 'Nhật ký hoạt động' },
];

function StatTile({ label, value, hint, loading }) {
  return (
    <article className={styles.statCard}>
      <span>{label}</span>
      {loading ? <span className={styles.skeletonValue} aria-hidden="true" /> : <strong>{formatNumber(value)}</strong>}
      <small>{hint}</small>
    </article>
  );
}

export default function AdminProductLinksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === searchParams.get('tab')) ? searchParams.get('tab') : 'permissions';
  const [stats, setStats] = useState({ data: null, error: '' });
  const [statsToken, setStatsToken] = useState(0);
  // Lets the stats banner jump the permissions tab to "suspended" accounts.
  const [accessPreset, setAccessPreset] = useState(null);
  const tabRefs = useRef({});

  useEffect(() => {
    let isActive = true;

    getAdminProductLinkStats().then((result) => {
      if (isActive) setStats({ data: result.data, error: result.error || '' });
    });

    return () => { isActive = false; };
  }, [statsToken]);

  function selectTab(id) {
    setSearchParams(id === 'permissions' ? {} : { tab: id }, { replace: true });
  }

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function handleTabKeyDown(event) {
    const index = TABS.findIndex((item) => item.id === tab);
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  const refreshStats = () => setStatsToken((token) => token + 1);
  const data = stats.data;
  const loading = !data && !stats.error;
  const grantedUsers = (data?.viewer || 0) + (data?.checker || 0) + (data?.editor || 0);
  const donePercent = data?.items_total ? Math.round((data.items_done / data.items_total) * 100) : 0;

  return (
    <>
      <Helmet><title>Quản trị · Link ảnh sản phẩm</title></Helmet>

      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>LINK ẢNH SẢN PHẨM</h1></div>
        <div className={styles.headerActions}>
          <Link to="/link-anh-san-pham" className={styles.actionButton}>
            <FaArrowUpRightFromSquare aria-hidden="true" /> Mở trang
          </Link>
        </div>
      </header>

      <section className={styles.statGrid} aria-label="Tổng quan Link ảnh sản phẩm">
        <StatTile
          label="Sản phẩm"
          value={data?.items_total}
          hint={`${formatNumber(data?.items_done)} hoàn thành (${donePercent}%)`}
          loading={loading}
        />
        <StatTile label="Đang ghim" value={data?.items_pinned} hint="Chưa hoàn thành" loading={loading} />
        <StatTile
          label="Người có quyền"
          value={grantedUsers}
          hint={`${formatNumber(data?.viewer)} xem · ${formatNumber(data?.checker)} đánh dấu · ${formatNumber(data?.editor)} quản lý · ${formatNumber(data?.admins)} admin`}
          loading={loading}
        />
        <StatTile
          label="Hoạt động 7 ngày"
          value={data?.actions_7d}
          hint={`${formatNumber(data?.active_users_7d)} người · ${formatNumber(data?.copies_7d)} lượt copy`}
          loading={loading}
        />
      </section>

      {stats.error && (
        <div className={styles.alert} role="alert">
          <span>{stats.error}</span>
          <button type="button" onClick={refreshStats}>Thử lại</button>
        </div>
      )}

      {data?.suspended_with_access > 0 && (
        <div className={pl.notice} role="status">
          <FaTriangleExclamation aria-hidden="true" />
          <span>
            {formatNumber(data.suspended_with_access)} tài khoản đã bị khóa vẫn còn quyền. Quyền này không có hiệu lực cho đến khi tài khoản được mở khóa.
          </span>
          <button
            type="button"
            onClick={() => {
              selectTab('permissions');
              setAccessPreset({ status: 'suspended', level: 'granted', at: Date.now() });
            }}
          >
            Xem danh sách
          </button>
        </div>
      )}

      <div className={pl.tabList} role="tablist" aria-label="Quản trị Link ảnh sản phẩm" onKeyDown={handleTabKeyDown}>
        {TABS.map((item) => (
          <button
            key={item.id}
            ref={(element) => { tabRefs.current[item.id] = element; }}
            type="button"
            role="tab"
            id={`pl-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`pl-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`pl-panel-${tab}`} aria-labelledby={`pl-tab-${tab}`}>
        {tab === 'permissions'
          ? <ProductLinkAccessTab key={accessPreset?.at ?? 'default'} initialFilters={accessPreset} onChanged={refreshStats} />
          : <ProductLinkLogsTab retentionDays={data?.copy_retention_days ?? 14} onChanged={refreshStats} />}
      </div>
    </>
  );
}
