import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import {
  FaArrowDown,
  FaArrowsRotate,
  FaArrowUp,
  FaCheck,
  FaChevronLeft,
  FaChevronRight,
  FaCopy,
  FaFileCsv,
  FaSort,
  FaSortDown,
  FaSortUp,
} from 'react-icons/fa6';
import {
  getWatermarkAdminOverview,
  getWatermarkVisitorStats,
  subscribeToWatermarkImageCounts,
} from '../../services/watermarkImageCountService.js';
import WatermarkImagesChart from './WatermarkImagesChart.jsx';
import styles from './Admin.module.css';
import wm from './AdminWatermark.module.css';

const PAGE_SIZE = 50;
const CSV_ROW_LIMIT = 10000;
const LIVE_REFRESH_DELAY_MS = 1500;

const RANGE_OPTIONS = [
  { value: '7d', label: '7 ngày', days: 7 },
  { value: '30d', label: '30 ngày', days: 30 },
  { value: '90d', label: '90 ngày', days: 90 },
  { value: 'all', label: 'Tất cả', days: null },
];

const GROUP_OPTIONS = [
  { value: 'visitor', label: 'Theo visitor' },
  { value: 'user', label: 'Theo tài khoản' },
];

const SOURCE_LABELS = {
  watermark: 'Watermark',
  'watermark/doantrang': 'Đoan Trang',
};

const numberFormatter = new Intl.NumberFormat('vi-VN');
const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const timeFormatter = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium' });
const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
const RELATIVE_UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

function formatRelative(value) {
  const date = parseDate(value);

  if (!date) {
    return '—';
  }

  const diffSeconds = (date.getTime() - Date.now()) / 1000;

  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return relativeFormatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return 'vừa xong';
}

function getSourceLabel(sourcePage) {
  return SOURCE_LABELS[sourcePage] || sourcePage;
}

function shortId(value) {
  return value ? `${value.slice(0, 8)}…` : '—';
}

/** Start of the range at local midnight, so "7 ngày" = today + the 6 days before it. */
function getRangeFrom(range) {
  const option = RANGE_OPTIONS.find((item) => item.value === range);

  if (!option?.days) {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (option.days - 1));
  return start.toISOString();
}

function getRowLabel(row) {
  return row.userName || row.displayName || row.userEmail || 'Khách';
}

function getDelta(current, previous) {
  if (previous === null || previous === undefined) {
    return null;
  }

  if (previous === 0) {
    return current > 0 ? { direction: 'up', text: 'Mới so với kỳ trước' } : null;
  }

  const percent = Math.round(((current - previous) / previous) * 100);

  if (percent === 0) {
    return { direction: 'flat', text: 'Không đổi so với kỳ trước' };
  }

  return {
    direction: percent > 0 ? 'up' : 'down',
    text: `${Math.abs(percent)}% so với kỳ trước`,
  };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows, fileName) {
  const header = ['Tên', 'Email', 'User ID', 'Visitor ID', 'Số visitor', 'Tổng ảnh', 'Lượt tạo', 'Nguồn', 'Lần đầu', 'Gần nhất'];
  const lines = rows.map((row) => [
    getRowLabel(row),
    row.userEmail,
    row.userId,
    row.visitorId,
    row.visitorCount,
    row.totalImages,
    row.entryCount,
    row.sourcePages.join(' | '),
    row.firstSeenAt,
    row.lastSeenAt,
  ].map(escapeCsv).join(','));

  // BOM so Excel opens the UTF-8 Vietnamese text correctly.
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM, [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function StatTile({ label, value, previous, hint, loading }) {
  const delta = loading ? null : getDelta(value, previous);
  const DeltaIcon = delta?.direction === 'up' ? FaArrowUp : delta?.direction === 'down' ? FaArrowDown : null;

  return (
    <article className={styles.statCard}>
      <span>{label}</span>
      {loading ? <span className={wm.skeletonValue} aria-hidden="true" /> : <strong>{formatNumber(value)}</strong>}
      {delta ? (
        <small className={`${wm.delta} ${wm[`delta_${delta.direction}`]}`}>
          {DeltaIcon && <DeltaIcon aria-hidden="true" />} {delta.text}
        </small>
      ) : (
        <small>{hint}</small>
      )}
    </article>
  );
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Không copy được, hãy thử lại.');
    }
  }

  return (
    <button
      type="button"
      className={wm.copyButton}
      onClick={handleCopy}
      title={copied ? 'Đã copy' : `Copy ${label}`}
      aria-label={copied ? 'Đã copy' : `Copy ${label}`}
    >
      {copied ? <FaCheck aria-hidden="true" /> : <FaCopy aria-hidden="true" />}
    </button>
  );
}

function SortHeader({ label, sortKey, sort, onSort, align }) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? FaSort : sort.desc ? FaSortDown : FaSortUp;

  return (
    <th
      aria-sort={isActive ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className={align === 'right' ? wm.alignRight : undefined}
    >
      <button type="button" className={`${wm.sortButton} ${isActive ? wm.sortButtonActive : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        <Icon aria-hidden="true" />
      </button>
    </th>
  );
}

export default function AdminWatermarkPage() {
  const [range, setRange] = useState('30d');
  const [sourcePage, setSourcePage] = useState('');
  const [groupBy, setGroupBy] = useState('visitor');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'total_images', desc: true });
  const [page, setPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [overview, setOverview] = useState({ data: null, loading: true, error: '' });
  const [table, setTable] = useState({ rows: [], totalCount: 0, loading: true, loaded: false, error: '' });
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const overviewRequestRef = useRef(0);
  const tableRequestRef = useRef(0);

  // Debounce the search box so typing does not fire one RPC per keystroke.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    const requestId = ++overviewRequestRef.current;

    async function loadOverview() {
      setOverview((current) => ({ ...current, loading: true }));

      const result = await getWatermarkAdminOverview({
        sourcePage: sourcePage || null,
        from: getRangeFrom(range),
        bucket: range === 'all' ? 'month' : 'day',
      });

      if (requestId !== overviewRequestRef.current) {
        return;
      }

      setOverview((current) => ({
        data: result.error ? current.data : result.data,
        loading: false,
        error: result.error || '',
      }));

      if (!result.error) {
        setLastUpdatedAt(new Date());
      }
    }

    loadOverview();
  }, [range, sourcePage, reloadToken]);

  useEffect(() => {
    const requestId = ++tableRequestRef.current;

    async function loadTable() {
      setTable((current) => ({ ...current, loading: true }));

      const result = await getWatermarkVisitorStats({
        sourcePage: sourcePage || null,
        from: getRangeFrom(range),
        search,
        groupBy,
        sort: sort.key,
        desc: sort.desc,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      if (requestId !== tableRequestRef.current) {
        return;
      }

      if (result.error) {
        setTable((current) => ({ ...current, loading: false, loaded: true, error: result.error }));
        return;
      }

      setTable({
        rows: result.data.rows,
        totalCount: result.data.totalCount,
        loading: false,
        loaded: true,
        error: '',
      });
    }

    loadTable();
  }, [range, sourcePage, groupBy, search, sort, page, reloadToken]);

  // New inserts arrive in bursts (one per batch); refresh once they settle.
  useEffect(() => {
    let timeout = null;

    const unsubscribe = subscribeToWatermarkImageCounts(
      () => {
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => setReloadToken((token) => token + 1), LIVE_REFRESH_DELAY_MS);
      },
      (status) => setIsLive(status === 'SUBSCRIBED'),
    );

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(0);
    };
  }

  const handleRangeChange = changeFilter(setRange);
  const handleSourceChange = changeFilter(setSourcePage);
  const handleGroupChange = changeFilter(setGroupBy);

  function handleSort(key) {
    setSort((current) => (
      current.key === key
        ? { key, desc: !current.desc }
        : { key, desc: key !== 'name' }
    ));
    setPage(0);
  }

  function refresh() {
    setReloadToken((token) => token + 1);
  }

  async function handleExport() {
    setIsExporting(true);

    const result = await getWatermarkVisitorStats({
      sourcePage: sourcePage || null,
      from: getRangeFrom(range),
      search,
      groupBy,
      sort: sort.key,
      desc: sort.desc,
      limit: CSV_ROW_LIMIT,
      offset: 0,
    });

    setIsExporting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data.rows.length === 0) {
      toast.info('Không có dữ liệu để xuất.');
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(result.data.rows, `watermark-${groupBy}-${range}-${stamp}.csv`);

    if (result.data.totalCount > result.data.rows.length) {
      toast.warning(`Chỉ xuất ${formatNumber(result.data.rows.length)}/${formatNumber(result.data.totalCount)} dòng đầu tiên.`);
    }
  }

  const summary = overview.data?.summary;
  const previous = overview.data?.previous;
  const sources = overview.data?.sources || [];
  const isOverviewPending = overview.loading && !overview.data;
  const isTablePending = table.loading && !table.loaded;
  const isRefreshing = overview.loading || table.loading;
  const pageCount = Math.max(1, Math.ceil(table.totalCount / PAGE_SIZE));
  const rangeLabel = RANGE_OPTIONS.find((item) => item.value === range)?.label || '';
  const errors = [...new Set([overview.error, table.error].filter(Boolean))];
  const sourceOptions = sourcePage && !sources.some((item) => item.sourcePage === sourcePage)
    ? [...sources, { sourcePage, images: 0 }]
    : sources;

  return (
    <>
      <Helmet><title>Thống kê Watermark</title></Helmet>

      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>WATERMARK</h1></div>
        <div className={wm.headerActions}>
          <span className={`${wm.liveBadge} ${isLive ? wm.liveBadgeOn : ''}`} title={isLive ? 'Tự cập nhật khi có ảnh mới' : 'Chưa kết nối realtime'}>
            <span className={wm.liveDot} aria-hidden="true" />
            {isLive ? 'Trực tiếp' : 'Ngoại tuyến'}
          </span>
          {lastUpdatedAt && (
            <span className={wm.updatedAt}>Cập nhật {timeFormatter.format(lastUpdatedAt)}</span>
          )}
          <button type="button" className={wm.actionButton} onClick={refresh} disabled={isRefreshing}>
            <FaArrowsRotate aria-hidden="true" className={isRefreshing ? wm.spin : undefined} />
            Làm mới
          </button>
          <button type="button" className={wm.actionButton} onClick={handleExport} disabled={isExporting || isTablePending}>
            <FaFileCsv aria-hidden="true" />
            {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
          </button>
        </div>
      </header>

      <section className={wm.toolbar} aria-label="Bộ lọc">
        <div className={wm.segmented} role="group" aria-label="Khoảng thời gian">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${wm.segment} ${range === option.value ? wm.segmentActive : ''}`}
              aria-pressed={range === option.value}
              onClick={() => handleRangeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          className={wm.control}
          value={sourcePage}
          onChange={(event) => handleSourceChange(event.target.value)}
          aria-label="Nguồn"
        >
          <option value="">Tất cả nguồn</option>
          {sourceOptions.map((item) => (
            <option key={item.sourcePage} value={item.sourcePage}>
              {getSourceLabel(item.sourcePage)} ({formatNumber(item.images)} ảnh)
            </option>
          ))}
        </select>

        <div className={wm.segmented} role="group" aria-label="Gom nhóm">
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${wm.segment} ${groupBy === option.value ? wm.segmentActive : ''}`}
              aria-pressed={groupBy === option.value}
              onClick={() => handleGroupChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          className={`${wm.control} ${wm.search}`}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Tên, email, visitor ID, user ID…"
          aria-label="Tìm kiếm"
        />
      </section>

      {errors.length > 0 && (
        <div className={wm.alert} role="alert">
          <span>{errors.join(' · ')}</span>
          <button type="button" onClick={refresh}>Thử lại</button>
        </div>
      )}

      <section className={styles.statGrid} aria-label="Tổng quan">
        <StatTile
          label="Ảnh đã tạo"
          value={summary?.totalImages}
          previous={previous?.totalImages}
          hint={`Trong ${rangeLabel.toLowerCase()}`}
          loading={isOverviewPending}
        />
        <StatTile
          label="Lượt tạo"
          value={summary?.totalEntries}
          previous={previous?.totalEntries}
          hint="Mỗi lần bấm tạo ảnh"
          loading={isOverviewPending}
        />
        <StatTile
          label="Visitor"
          value={summary?.uniqueVisitors}
          previous={previous?.uniqueVisitors}
          hint="Trình duyệt khác nhau"
          loading={isOverviewPending}
        />
        <StatTile
          label="Tài khoản"
          value={summary?.uniqueUsers}
          previous={previous?.uniqueUsers}
          hint="Người dùng đã đăng nhập"
          loading={isOverviewPending}
        />
      </section>

      <section className={styles.card}>
        <div className={wm.cardHead}>
          <h2>Số ảnh theo {overview.data?.bucket === 'month' ? 'tháng' : overview.data?.bucket === 'week' ? 'tuần' : 'ngày'}</h2>
          <span>{sourcePage ? getSourceLabel(sourcePage) : 'Tất cả nguồn'} · {rangeLabel}</span>
        </div>
        <WatermarkImagesChart
          series={overview.data?.series || []}
          granularity={overview.data?.bucket || 'day'}
          loading={isOverviewPending}
        />
      </section>

      <section className={styles.card}>
        <div className={wm.cardHead}>
          <h2>{groupBy === 'user' ? 'Theo tài khoản' : 'Theo visitor'}</h2>
          <span>{isTablePending ? 'Đang tải…' : `${formatNumber(table.totalCount)} dòng`}</span>
        </div>

        <div className={`${styles.tableWrap} ${table.loading && table.loaded ? wm.tableBusy : ''}`} aria-busy={table.loading}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortHeader label="Người dùng" sortKey="name" sort={sort} onSort={handleSort} />
                <SortHeader label="Tổng ảnh" sortKey="total_images" sort={sort} onSort={handleSort} align="right" />
                <SortHeader label="Lượt tạo" sortKey="entry_count" sort={sort} onSort={handleSort} align="right" />
                <th>Nguồn</th>
                <SortHeader label="Lần đầu" sortKey="first_seen_at" sort={sort} onSort={handleSort} />
                <SortHeader label="Gần nhất" sortKey="last_seen_at" sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {isTablePending && Array.from({ length: 6 }, (_, index) => (
                <tr key={`skeleton-${index}`} aria-hidden="true">
                  {Array.from({ length: 6 }, (__, cell) => (
                    <td key={cell}><span className={wm.skeletonLine} /></td>
                  ))}
                </tr>
              ))}

              {!isTablePending && table.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>
                    {search ? `Không tìm thấy kết quả cho “${search}”.` : 'Chưa có dữ liệu trong khoảng thời gian này.'}
                  </td>
                </tr>
              )}

              {!isTablePending && table.rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <div className={wm.identity}>
                      <div className={wm.identityName}>
                        <strong>{getRowLabel(row)}</strong>
                        <span className={`${styles.badge} ${row.userId ? styles.badgeActive : styles.badgeDefault}`}>
                          {row.userId ? 'Tài khoản' : 'Khách'}
                        </span>
                        {row.visitorCount > 1 && (
                          <span className={`${styles.badge} ${styles.badgeUser}`}>{row.visitorCount} visitor</span>
                        )}
                      </div>
                      {row.userEmail && <span className={wm.identityMeta}>{row.userEmail}</span>}
                      <span className={wm.identityMeta}>
                        <code title={row.visitorId}>{shortId(row.visitorId)}</code>
                        {row.visitorId && <CopyButton value={row.visitorId} label="visitor ID" />}
                        {row.userId && (
                          <>
                            <span aria-hidden="true">·</span>
                            <code title={row.userId}>user {shortId(row.userId)}</code>
                            <CopyButton value={row.userId} label="user ID" />
                          </>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className={wm.numberCell}>{formatNumber(row.totalImages)}</td>
                  <td className={wm.numberCell}>{formatNumber(row.entryCount)}</td>
                  <td>
                    <div className={wm.tags}>
                      {row.sourcePages.map((source) => (
                        <span key={source} className={wm.tag}>{getSourceLabel(source)}</span>
                      ))}
                    </div>
                  </td>
                  <td className={wm.dateCell} title={formatDateTime(row.firstSeenAt)}>{formatRelative(row.firstSeenAt)}</td>
                  <td className={wm.dateCell} title={formatDateTime(row.lastSeenAt)}>{formatRelative(row.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {table.totalCount > PAGE_SIZE && (
          <nav className={wm.pagination} aria-label="Phân trang">
            <span>
              {formatNumber(page * PAGE_SIZE + 1)}–{formatNumber(Math.min((page + 1) * PAGE_SIZE, table.totalCount))} / {formatNumber(table.totalCount)}
            </span>
            <div>
              <button type="button" onClick={() => setPage((current) => current - 1)} disabled={page === 0 || table.loading} aria-label="Trang trước">
                <FaChevronLeft aria-hidden="true" />
              </button>
              <span>Trang {page + 1}/{pageCount}</span>
              <button type="button" onClick={() => setPage((current) => current + 1)} disabled={page + 1 >= pageCount || table.loading} aria-label="Trang sau">
                <FaChevronRight aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </section>
    </>
  );
}
