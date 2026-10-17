import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaArrowsRotate, FaChevronLeft, FaChevronRight, FaCopy, FaEye, FaFileCsv, FaPen, FaPlus, FaPrint, FaSort, FaSortDown,
  FaSortUp, FaTrash, FaXmark,
} from 'react-icons/fa6';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  deleteKnmQuotation, getKnmQuotation, getKnmQuotationStats, listKnmQuotations,
} from '../../services/knmQuotationService.js';
import { downloadCsv } from '../../utils/csv.js';
import { formatDateTime, formatNumber, formatRelative } from '../../utils/formatters.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { normalizeKnmQuotation } from '../../utils/knmQuotation.js';
import styles from './QuotationKnm.module.css';

const PAGE_SIZE = 50;
const CSV_ROW_LIMIT = 5000;
const COLUMN_COUNT = 7;

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day ? `${day}/${month}/${year}` : value;
}

function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const Icon = !active ? FaSort : sort.desc ? FaSortDown : FaSortUp;
  return (
    <th aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={className}>
      <button type="button" className={`${styles.sortButton} ${active ? styles.sortActive : ''}`} onClick={() => onSort(sortKey)}>
        {label} <Icon aria-hidden="true" />
      </button>
    </th>
  );
}

function StatTile({ label, value, hint, loading }) {
  return (
    <article className={styles.statTile}>
      <span>{label}</span>
      {loading ? <i className={styles.skeleton} aria-hidden="true" /> : <strong>{value}</strong>}
      {hint && <small>{hint}</small>}
    </article>
  );
}

export default function QuotationKnmList() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState({ key: 'created_at', desc: true });
  const search = useDebouncedValue(searchInput.trim(), 300);
  const dateError = from && to && from > to ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : '';
  const filtersKey = JSON.stringify([search, from, to, mine, sort]);
  // The page belongs to one set of filters: changing a filter goes back to page 1.
  const [pageState, setPageState] = useState({ key: filtersKey, page: 0 });
  const page = pageState.key === filtersKey ? pageState.page : 0;
  const [table, setTable] = useState({ rows: [], totalCount: 0, loading: true, loaded: false, error: '' });
  const [stats, setStats] = useState({ data: null, error: '' });
  const [reloadToken, setReloadToken] = useState(0);
  const [busyAction, setBusyAction] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [exporting, setExporting] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (dateError) return;
    const requestId = ++requestRef.current;

    async function load() {
      setTable((current) => ({ ...current, loading: true }));
      try {
        const result = await listKnmQuotations({
          search, from, to, mine, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
        });
        // A slower, older request must not overwrite the newer result.
        if (requestId !== requestRef.current) return;
        setTable({ rows: result.rows, totalCount: result.totalCount, loading: false, loaded: true, error: '' });
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setTable((current) => ({ ...current, loading: false, loaded: true, error: error.message }));
      }
    }

    load();
  }, [search, from, to, mine, sort, page, reloadToken, dateError]);

  useEffect(() => {
    let active = true;
    getKnmQuotationStats()
      .then((data) => { if (active) setStats({ data, error: '' }); })
      .catch((error) => { if (active) setStats({ data: null, error: error.message }); });
    return () => { active = false; };
  }, [reloadToken]);

  const hasFilters = Boolean(searchInput || from || to || mine);
  const isPending = table.loading && !table.loaded;
  const pageCount = Math.max(1, Math.ceil(table.totalCount / PAGE_SIZE));

  function clearFilters() {
    setSearchInput('');
    setFrom('');
    setTo('');
    setMine(false);
  }

  function handleSort(key) {
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: !['quotation_no', 'customer_name'].includes(key) }));
  }

  async function withRow(row, action, task) {
    setBusyAction(`${row.id}:${action}`);
    try {
      await task();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusyAction('');
    }
  }

  const duplicate = (row) => withRow(row, 'copy', async () => {
    const record = await getKnmQuotation(row.id);
    navigate('/bao-gia-knm', { state: { copyOf: { company: record.company, quotation: normalizeKnmQuotation(record.quotation) } } });
    toast.info('Đã tạo bản sao chưa lưu. Số báo giá sẽ được cấp khi lưu.');
  });

  async function remove() {
    const row = confirmDelete;
    setConfirmDelete(null);
    await withRow(row, 'delete', async () => {
      await deleteKnmQuotation(row.id);
      toast.success(`Đã xóa báo giá ${row.quotation_no}.`);
      setReloadToken((token) => token + 1);
    });
  }

  async function exportList() {
    setExporting(true);
    try {
      const { rows, totalCount } = await listKnmQuotations({ search, from, to, mine, sort: sort.key, desc: sort.desc, limit: CSV_ROW_LIMIT });
      if (!rows.length) {
        toast.info('Không có báo giá để xuất.');
        return;
      }
      downloadCsv(
        ['Số báo giá', 'Ngày', 'Khách hàng', 'Người liên hệ', 'Điện thoại', 'MST', 'Tổng tiền', 'Người lập', 'Tạo lúc', 'Cập nhật'],
        rows.map((row) => [
          row.quotation_no, formatDate(row.quotation_date), row.customer_name, row.customer_contact, row.customer_phone,
          row.customer_tax_code, Number(row.total) || 0, row.created_by_name, formatDateTime(row.created_at), formatDateTime(row.updated_at),
        ]),
        `bao-gia-knm-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      if (totalCount > rows.length) toast.warning(`Chỉ xuất ${formatNumber(rows.length)}/${formatNumber(totalCount)} báo giá đầu tiên.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(false);
    }
  }

  const s = stats.data;
  const statsLoading = !s && !stats.error;

  return (
    <>
      <Helmet><title>Quản lý báo giá KNM</title></Helmet>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <div className={styles.logoBadge} aria-hidden="true">KNM</div>
            <div className={styles.headerTitle}>
              <h1>QUẢN LÝ BÁO GIÁ</h1>
              <p>Tìm, sửa, sao chép và in các báo giá đã lưu</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.iconOnlyMobile} onClick={() => setReloadToken((token) => token + 1)} disabled={table.loading} aria-label="Làm mới">
              <FaArrowsRotate className={table.loading ? styles.spin : undefined} /> <span className={styles.btnLabel}>Làm mới</span>
            </button>
            <button type="button" className={styles.iconOnlyMobile} onClick={exportList} disabled={exporting || isPending} aria-label="Xuất danh sách CSV">
              <FaFileCsv /> <span className={styles.btnLabel}>{exporting ? 'Đang xuất…' : 'Xuất CSV'}</span>
            </button>
            <Link to="/bao-gia-knm" className={styles.btnPrimary}><FaPlus /> Tạo báo giá mới</Link>
          </div>
        </header>

        <div className={styles.listBody}>
          <section className={styles.statGrid} aria-label="Thống kê báo giá KNM">
            <StatTile label="Tổng báo giá" value={formatNumber(s?.total)} loading={statsLoading} />
            <StatTile label="Của tôi" value={formatNumber(s?.mine)} loading={statsLoading} />
            <StatTile label="Báo giá tháng này" value={formatNumber(s?.month_count)} loading={statsLoading} />
            <StatTile label="Giá trị tháng này" value={`${formatCurrency(s?.month_value)} đ`} loading={statsLoading} />
          </section>
          {stats.error && <p className={styles.errorText} role="alert">{stats.error}</p>}

          <section className={styles.card}>
            <div className={styles.filters} role="search">
              <input
                type="search"
                placeholder="Số báo giá, khách hàng, SĐT, MST, người lập…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Tìm báo giá"
              />
              <label className={styles.dateFilter}>Từ ngày<input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-invalid={Boolean(dateError)} /></label>
              <label className={styles.dateFilter}>Đến ngày<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-invalid={Boolean(dateError)} /></label>
              <label className={styles.checkFilter}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Chỉ báo giá của tôi</label>
              {hasFilters && <button type="button" onClick={clearFilters}><FaXmark /> Xóa bộ lọc</button>}
            </div>
            {dateError && <p className={styles.errorText} role="alert">{dateError}</p>}

            <div className={styles.listMeta}>
              <span>{isPending ? 'Đang tải…' : `${formatNumber(table.totalCount)} báo giá`}</span>
            </div>

            {table.error && (
              <div className={`${styles.banner} ${styles.bannerDanger}`} role="alert">
                <p>{table.error}</p>
                <div className={styles.bannerActions}><button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button></div>
              </div>
            )}

            <div className={`${styles.tableWrap} ${table.loading && table.loaded ? styles.tableBusy : ''}`} aria-busy={table.loading}>
              <table className={styles.listTable}>
                <thead>
                  <tr>
                    <SortHeader label="Số báo giá" sortKey="quotation_no" sort={sort} onSort={handleSort} />
                    <SortHeader label="Ngày" sortKey="quotation_date" sort={sort} onSort={handleSort} />
                    <SortHeader label="Khách hàng" sortKey="customer_name" sort={sort} onSort={handleSort} />
                    <SortHeader label="Tổng tiền" sortKey="total" sort={sort} onSort={handleSort} className={styles.money} />
                    <th>Người lập</th>
                    <SortHeader label="Tạo lúc" sortKey="created_at" sort={sort} onSort={handleSort} />
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {isPending && Array.from({ length: 6 }, (_, index) => (
                    <tr key={`skeleton-${index}`} aria-hidden="true">
                      {Array.from({ length: COLUMN_COUNT }, (__, cell) => <td key={cell}><i className={styles.skeleton} /></td>)}
                    </tr>
                  ))}
                  {!isPending && !table.error && table.rows.length === 0 && (
                    <tr><td colSpan={COLUMN_COUNT} className={styles.emptyState}>
                      {hasFilters ? 'Không có báo giá phù hợp với bộ lọc.' : 'Chưa có báo giá nào.'}
                      {hasFilters && <button type="button" className={styles.linkButton} onClick={clearFilters}>Xóa bộ lọc</button>}
                    </td></tr>
                  )}
                  {!isPending && table.rows.map((row) => {
                    const busy = busyAction.startsWith(`${row.id}:`);
                    const editHref = `/bao-gia-knm/${row.id}/chinh-sua`;
                    const contact = [row.customer_contact, row.customer_phone, row.customer_tax_code && `MST ${row.customer_tax_code}`].filter(Boolean).join(' · ');
                    return (
                      <tr key={row.id}>
                        <td><Link to={editHref}>{row.quotation_no}</Link></td>
                        <td>{formatDate(row.quotation_date)}</td>
                        <td className={styles.customerCell}>
                          <strong>{row.customer_name}</strong>
                          {contact && <small>{contact}</small>}
                        </td>
                        <td className={styles.money}>{formatCurrency(row.total)}</td>
                        <td>{row.created_by_name || '—'}</td>
                        <td title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <button type="button" aria-label={`${row.can_edit ? 'Chỉnh sửa' : 'Xem'} ${row.quotation_no}`} title={row.can_edit ? 'Chỉnh sửa' : 'Xem'} onClick={() => navigate(editHref)}>
                              {row.can_edit ? <FaPen /> : <FaEye />}
                            </button>
                            <button type="button" aria-label={`Sao chép ${row.quotation_no}`} title="Sao chép thành báo giá mới" onClick={() => duplicate(row)} disabled={busy}><FaCopy /></button>
                            <button type="button" aria-label={`Xuất PDF ${row.quotation_no}`} title="Xuất PDF" onClick={() => navigate(`${editHref}?in=1`)}><FaPrint /></button>
                            {row.can_edit && (
                              <button type="button" className={styles.danger} aria-label={`Xóa ${row.quotation_no}`} title="Xóa" onClick={() => setConfirmDelete(row)} disabled={busy}><FaTrash /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {table.totalCount > PAGE_SIZE && (
              <nav className={styles.pagination} aria-label="Phân trang">
                <span>{formatNumber(page * PAGE_SIZE + 1)}–{formatNumber(Math.min((page + 1) * PAGE_SIZE, table.totalCount))} / {formatNumber(table.totalCount)}</span>
                <div>
                  <button type="button" onClick={() => setPageState({ key: filtersKey, page: page - 1 })} disabled={page === 0 || table.loading} aria-label="Trang trước"><FaChevronLeft /></button>
                  <span>Trang {page + 1}/{pageCount}</span>
                  <button type="button" onClick={() => setPageState({ key: filtersKey, page: page + 1 })} disabled={page + 1 >= pageCount || table.loading} aria-label="Trang sau"><FaChevronRight /></button>
                </div>
              </nav>
            )}
          </section>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Xóa báo giá ${confirmDelete.quotation_no}?`}
          message={`Báo giá của “${confirmDelete.customer_name}” sẽ bị xóa khỏi danh sách. Quản trị viên vẫn khôi phục được từ cơ sở dữ liệu nếu cần.`}
          confirmLabel="Xóa báo giá"
          danger
          onConfirm={remove}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
