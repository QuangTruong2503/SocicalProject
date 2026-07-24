import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  getWatermarkVisitorStatsRows,
} from '../services/watermarkImageCountService.js';
import '../styles/WatermarkDashboard.css';

const SOURCE_PAGE_OPTIONS = [
  { value: 'all', label: 'Tất cả nguồn' },
  { value: 'watermark', label: 'Watermark' },
  { value: 'watermark/doantrang', label: 'Đoan Trang' },
];

function formatCount(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) {
    return 'Chưa có';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Chưa có';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getVisitorLabel(row) {
  return row.display_name?.trim()
    || row.displayName?.trim()
    || row.visitor_id?.trim()
    || row.visitorId?.trim()
    || 'Khách';
}

function normalizeVisitorStatsRows(rows) {
  return (rows || [])
    .map((row) => ({
      visitorId: row.visitor_id || row.visitorId || '',
      userId: row.user_id || row.userId || '',
      displayName: row.display_name || row.displayName || getVisitorLabel(row),
      totalImages: Number(row.total_images ?? row.totalImages ?? 0) || 0,
      entryCount: Number(row.entry_count ?? row.entryCount ?? 0) || 0,
      sourcePages: Array.isArray(row.source_pages)
        ? row.source_pages
        : Array.isArray(row.sourcePages)
          ? row.sourcePages
          : row.source_page
            ? [row.source_page]
            : [],
      lastSeenAt: row.last_seen_at || row.lastSeenAt || '',
    }))
    .sort((left, right) => (
      right.totalImages - left.totalImages
      || new Date(right.lastSeenAt || 0) - new Date(left.lastSeenAt || 0)
    ));
}

function StatCard({ label, value, hint }) {
  return (
    <article className="wd-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export default function WatermarkDashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourcePage, setSourcePage] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadRows() {
      setLoading(true);
      setError('');

      const result = await getWatermarkVisitorStatsRows();

      if (!isActive) {
        return;
      }

      if (result.error) {
        setRows([]);
        setError(result.error);
        setLoading(false);
        return;
      }

      setRows(result.data || []);
      setLoading(false);
    }

    loadRows();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSource = sourcePage === 'all'
        || (Array.isArray(row.source_pages) && row.source_pages.includes(sourcePage));

      if (!matchesSource) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.visitorId,
        row.userId,
        row.displayName,
        row.sourcePages?.join(' '),
      ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [rows, search, sourcePage]);

  const visitorGroups = useMemo(() => normalizeVisitorStatsRows(filteredRows), [filteredRows]);

  const summary = useMemo(() => {
    const totalImages = filteredRows.reduce((sum, row) => sum + (Number(row.totalImages) || 0), 0);
    const uniqueVisitors = visitorGroups.length;
    const totalEntries = filteredRows.reduce((sum, row) => sum + (Number(row.entryCount) || 0), 0);
    const uniqueSources = new Set(
      filteredRows.flatMap((row) => row.sourcePages || [])
    ).size;

    return {
      totalImages,
      uniqueVisitors,
      totalEntries,
      uniqueSources,
    };
  }, [filteredRows, visitorGroups.length]);

  return (
    <>
      <Helmet>
        <title>Watermark Dashboard</title>
        <meta
          name="description"
          content="Dashboard watermark theo từng visitor_id, có display_name và thống kê theo nguồn."
        />
      </Helmet>

      <div className="wd-page">
        <div className="wd-shell">
          <section className="wd-hero">
            <div className="wd-hero-copy">
              <span className="wd-badge">Watermark analytics</span>
              <h1>Dashboard theo visitor_id</h1>
              <p>
                Mỗi visitor_id được gom thành một dòng riêng để xem tổng số ảnh, số lần tạo,
                nguồn dữ liệu và display_name nếu có.
              </p>
              <div className="wd-hero-actions">
                <Link className="wd-solid-btn" to="/watermark">
                  Mở Watermark
                </Link>
              </div>
            </div>

            <aside className="wd-hero-card">
              <span className="wd-hero-card__kicker">Live summary</span>
              <div className="wd-hero-card__value">
                {loading ? '...' : formatCount(summary.totalImages)}
              </div>
              <p>Tổng ảnh watermark đang hiển thị theo bộ lọc hiện tại.</p>
              <div className="wd-hero-card__meta">
                <span>{loading ? '...' : `${formatCount(summary.uniqueVisitors)} visitor`}</span>
                <span>{loading ? '...' : `${formatCount(summary.uniqueSources)} nguồn`}</span>
              </div>
            </aside>
          </section>

          <section className="wd-stats-grid" aria-label="Tổng quan watermark">
            <StatCard
              label="Visitor"
              value={loading ? '...' : formatCount(summary.uniqueVisitors)}
              hint="Số visitor_id khác nhau"
            />
            <StatCard
              label="Entry"
              value={loading ? '...' : formatCount(summary.totalEntries)}
              hint="Số dòng dữ liệu đã lưu"
            />
            <StatCard
              label="Ảnh"
              value={loading ? '...' : formatCount(summary.totalImages)}
              hint="Tổng image_count theo bộ lọc"
            />
            <StatCard
              label="Nguồn"
              value={loading ? '...' : formatCount(summary.uniqueSources)}
              hint="Số source_page đang xuất hiện"
            />
          </section>

          <section className="wd-toolbar" aria-label="Bộ lọc dashboard">
            <div className="wd-filters">
              {SOURCE_PAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`wd-pill ${sourcePage === option.value ? 'is-active' : ''}`}
                  onClick={() => setSourcePage(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="wd-search">
              <span>Tìm kiếm</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="visitor_id, display_name, user_id..."
              />
            </label>
          </section>

          {error && (
            <div className="wd-alert wd-alert--error">
              {error}
            </div>
          )}

          <section className="wd-table-panel">
            <div className="wd-table-panel__head">
              <div>
                <span className="wd-panel-kicker">Bảng visitor</span>
                <h2>Danh sách visitor_id</h2>
              </div>
              <span className="wd-panel-chip">
                {loading ? 'Đang tải...' : `${formatCount(visitorGroups.length)} visitor`}
              </span>
            </div>

            <div className="wd-table-wrap">
              <table className="wd-table">
                <thead>
                  <tr>
                    <th>Visitor ID</th>
                    <th>Display name</th>
                    <th>User ID</th>
                    <th>Tổng ảnh</th>
                    <th>Lần tạo</th>
                    <th>Sources</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && visitorGroups.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="wd-empty">
                          <strong>Chưa có dữ liệu phù hợp</strong>
                          <p>Hãy đổi bộ lọc hoặc tạo thêm watermark để dashboard có dữ liệu.</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {visitorGroups.map((group) => (
                    <tr key={group.visitorId || group.userId || group.displayName}>
                      <td>
                        <code className="wd-code">{group.visitorId || 'N/A'}</code>
                      </td>
                      <td>
                        <strong>{group.displayName || 'Khách'}</strong>
                      </td>
                      <td>
                        <code className="wd-code">{group.userId || '—'}</code>
                      </td>
                      <td>{formatCount(group.totalImages)}</td>
                      <td>{formatCount(group.entryCount)}</td>
                      <td>
                        <div className="wd-source-tags">
                          {group.sourcePages.map((source) => (
                            <span key={source} className="wd-tag">
                              {source}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDate(group.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
