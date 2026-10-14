import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FaArrowsRotate, FaChevronLeft, FaChevronRight, FaCopy, FaFileCsv, FaFileExcel, FaFilePdf, FaPen, FaEye,
  FaPlus, FaPrint, FaSort, FaSortDown, FaSortUp, FaTrash, FaXmark,
} from 'react-icons/fa6';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  deleteQuotationDraft, getQuotation, getQuotationStats, listQuotations, normalizeQuotation, setQuotationStatus,
} from '../../services/quotationService.js';
import { downloadCsv } from '../../utils/csv.js';
import { formatDateTime, formatNumber, formatRelative } from '../../utils/formatters.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { calculateQuotation, QUOTATION_STATUSES } from '../../utils/quotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import styles from './Quotation.module.css';

const PAGE_SIZE = 50;
const CSV_ROW_LIMIT = 5000;
const COLUMN_COUNT = 8;

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
        {label} <Icon aria-hidden="true"/>
      </button>
    </th>
  );
}

function StatTile({ label, value, hint, loading }) {
  return (
    <article className={styles.statTile}>
      <span>{label}</span>
      {loading ? <i className={styles.skeleton} aria-hidden="true"/> : <strong>{value}</strong>}
      {hint && <small>{hint}</small>}
    </article>
  );
}

export default function QuotationList() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState({ key: 'created_at', desc: true });
  const search = useDebouncedValue(searchInput.trim(), 300);
  const dateError = from && to && from > to ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : '';
  const filtersKey = JSON.stringify([search, status, from, to, mine, sort]);
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
    if (dateError) return undefined;
    const requestId = ++requestRef.current;

    async function load() {
      setTable((current) => ({ ...current, loading: true }));
      try {
        const result = await listQuotations({
          search, status, from, to, mine, sort: sort.key, desc: sort.desc, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
        });
        if (requestId !== requestRef.current) return;
        setTable({ rows: result.rows, totalCount: result.totalCount, loading: false, loaded: true, error: '' });
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setTable((current) => ({ ...current, loading: false, loaded: true, error: error.message }));
      }
    }

    load();
    return undefined;
  }, [search, status, from, to, mine, sort, page, reloadToken, dateError]);

  useEffect(() => {
    let active = true;
    getQuotationStats(mine)
      .then((data) => { if (active) setStats({ data, error: '' }); })
      .catch((error) => { if (active) setStats({ data: null, error: error.message }); });
    return () => { active = false; };
  }, [mine, reloadToken]);

  const hasFilters = Boolean(searchInput || status || from || to || mine);
  const isPending = table.loading && !table.loaded;
  const pageCount = Math.max(1, Math.ceil(table.totalCount / PAGE_SIZE));

  function clearFilters() {
    setSearchInput('');
    setStatus('');
    setFrom('');
    setTo('');
    setMine(false);
  }

  function handleSort(key) {
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: key !== 'quotation_no' }));
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
    const source = normalizeQuotation(await getQuotation(row.id));
    navigate('/bao-gia-minh-triet/tao-moi', { state: { copyOf: source } });
    toast.info('Đã tạo bản sao chưa lưu. Số báo giá sẽ được cấp khi lưu.');
  });

  const exportExcel = (row) => withRow(row, 'excel', async () => {
    const quotation = normalizeQuotation(await getQuotation(row.id));
    await exportQuotationToExcel(quotation, calculateQuotation(quotation));
  });

  const changeStatus = (row, nextStatus) => withRow(row, 'status', async () => {
    const result = await setQuotationStatus(row.id, nextStatus);
    setTable((current) => ({
      ...current,
      rows: current.rows.map((item) => (item.id === row.id ? { ...item, status: result.status, updated_at: result.updated_at } : item)),
    }));
    toast.success(`${row.quotation_no}: ${QUOTATION_STATUSES[result.status]}`);
    getQuotationStats(mine).then((data) => setStats({ data, error: '' })).catch(() => {});
  });

  async function removeDraft() {
    const row = confirmDelete;
    setConfirmDelete(null);
    await withRow(row, 'delete', async () => {
      await deleteQuotationDraft(row.id);
      toast.success(`Đã xóa bản nháp ${row.quotation_no}.`);
      setReloadToken((token) => token + 1);
    });
  }

  async function exportList() {
    setExporting(true);
    try {
      const { rows, totalCount } = await listQuotations({ search, status, from, to, mine, sort: sort.key, desc: sort.desc, limit: CSV_ROW_LIMIT });
      if (!rows.length) {
        toast.info('Không có báo giá để xuất.');
        return;
      }
      downloadCsv(
        ['Số báo giá', 'Ngày', 'Khách hàng', 'Liên hệ', 'Điện thoại', 'Tổng tiền', 'Người lập', 'Trạng thái', 'Tạo lúc'],
        rows.map((row) => [
          row.quotation_no, formatDate(row.quotation_date), row.customer_name, row.contact_name, row.phone,
          Number(row.total) || 0, row.prepared_by_name, QUOTATION_STATUSES[row.status], formatDateTime(row.created_at),
        ]),
        `danh-sach-bao-gia-${new Date().toISOString().slice(0, 10)}.csv`,
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
      <Helmet><title>Danh sách báo giá · Minh Triết</title></Helmet>
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div><span>QUẢN LÝ BÁO GIÁ</span><h1>DANH SÁCH BÁO GIÁ</h1></div>
          <div className={styles.actions}>
            <button type="button" className={styles.outlineAction} onClick={() => setReloadToken((token) => token + 1)} disabled={table.loading}>
              <FaArrowsRotate className={table.loading ? styles.spin : undefined}/> Làm mới
            </button>
            <button type="button" className={styles.outlineAction} onClick={exportList} disabled={exporting || isPending}>
              <FaFileCsv/> {exporting ? 'Đang xuất…' : 'Xuất danh sách'}
            </button>
            <button type="button" className={styles.primary} onClick={() => navigate('/bao-gia-minh-triet/tao-moi')}>
              <FaPlus/> Tạo báo giá
            </button>
          </div>
        </header>

        <section className={styles.statGrid} aria-label={mine ? 'Thống kê báo giá của tôi' : 'Thống kê báo giá'}>
          <StatTile label="Tổng báo giá" value={formatNumber(s?.total)} hint={`${formatNumber(s?.draft)} bản nháp`} loading={statsLoading}/>
          <StatTile label="Đã gửi khách" value={formatNumber(s?.sent)} hint="Đang chờ phản hồi" loading={statsLoading}/>
          <StatTile label="Khách đã xác nhận" value={formatNumber(s?.confirmed)} loading={statsLoading}/>
          <StatTile label="Tháng này" value={`${formatCurrency(s?.month_value)} đ`} hint={`${formatNumber(s?.month_count)} báo giá (không tính đã hủy)`} loading={statsLoading}/>
          <StatTile label="Đã xác nhận tháng này" value={`${formatCurrency(s?.month_confirmed_value)} đ`} loading={statsLoading}/>
        </section>

        <section className={styles.card}>
          <div className={styles.listFilters} role="search">
            <input
              type="search"
              placeholder="Số báo giá, khách hàng, SĐT, MST, người lập…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Tìm báo giá"
            />
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Trạng thái">
              <option value="">Tất cả trạng thái</option>
              {Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <label className={styles.dateFilter}>Từ ngày<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} aria-invalid={Boolean(dateError)}/></label>
            <label className={styles.dateFilter}>Đến ngày<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} aria-invalid={Boolean(dateError)}/></label>
            <label className={styles.checkFilter}><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)}/> Chỉ báo giá của tôi</label>
            {hasFilters && <button type="button" onClick={clearFilters}><FaXmark/> Xóa bộ lọc</button>}
          </div>
          {dateError && <p className={styles.error} role="alert">{dateError}</p>}

          <div className={styles.listMeta}>
            <span>{isPending ? 'Đang tải…' : `${formatNumber(table.totalCount)} báo giá`}</span>
          </div>

          {table.error && (
            <div className={`${styles.banner} ${styles.bannerDanger}`} role="alert">
              <span>{table.error}</span>
              <div className={styles.bannerActions}><button type="button" onClick={() => setReloadToken((token) => token + 1)}>Thử lại</button></div>
            </div>
          )}

          <div className={`${styles.tableWrap} ${table.loading && table.loaded ? styles.tableBusy : ''}`} aria-busy={table.loading}>
            <table className={styles.listTable}>
              <thead>
                <tr>
                  <SortHeader label="Số báo giá" sortKey="quotation_no" sort={sort} onSort={handleSort}/>
                  <SortHeader label="Ngày" sortKey="quotation_date" sort={sort} onSort={handleSort}/>
                  <th>Khách hàng</th>
                  <SortHeader label="Tổng tiền" sortKey="total" sort={sort} onSort={handleSort} className={styles.money}/>
                  <th>Người lập</th>
                  <th>Trạng thái</th>
                  <SortHeader label="Tạo lúc" sortKey="created_at" sort={sort} onSort={handleSort}/>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isPending && Array.from({ length: 6 }, (_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden="true">
                    {Array.from({ length: COLUMN_COUNT }, (__, cell) => <td key={cell}><i className={styles.skeleton}/></td>)}
                  </tr>
                ))}
                {!isPending && !table.error && table.rows.length === 0 && (
                  <tr><td colSpan={COLUMN_COUNT} className={styles.emptyRow}>
                    {hasFilters ? 'Không có báo giá phù hợp với bộ lọc.' : 'Chưa có báo giá nào.'}
                    {hasFilters && <button type="button" className={styles.linkButton} onClick={clearFilters}>Xóa bộ lọc</button>}
                  </td></tr>
                )}
                {!isPending && table.rows.map((row) => {
                  const busy = busyAction.startsWith(`${row.id}:`);
                  const editHref = `/bao-gia-minh-triet/${row.id}/chinh-sua`;
                  return (
                    <tr key={row.id}>
                      <td><Link to={editHref} className={styles.quotationNo}>{row.quotation_no}</Link></td>
                      <td>{formatDate(row.quotation_date)}</td>
                      <td className={styles.customerCell}>
                        <strong>{row.customer_name}</strong>
                        {(row.contact_name || row.phone) && <small>{[row.contact_name, row.phone].filter(Boolean).join(' · ')}</small>}
                      </td>
                      <td className={styles.money}>{formatCurrency(row.total)}</td>
                      <td>{row.prepared_by_name || '—'}</td>
                      <td>
                        {row.can_edit ? (
                          <select
                            className={`${styles.statusSelect} ${styles[row.status]}`}
                            value={row.status}
                            onChange={(event) => changeStatus(row, event.target.value)}
                            disabled={busy}
                            aria-label={`Trạng thái ${row.quotation_no}`}
                          >
                            {Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        ) : (
                          <span className={`${styles.status} ${styles[row.status]}`}>{QUOTATION_STATUSES[row.status]}</span>
                        )}
                      </td>
                      <td title={formatDateTime(row.created_at)}>{formatRelative(row.created_at)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" aria-label={`${row.can_edit ? 'Chỉnh sửa' : 'Xem'} ${row.quotation_no}`} title={row.can_edit ? 'Chỉnh sửa' : 'Xem'} onClick={() => navigate(editHref)}>
                            {row.can_edit ? <FaPen/> : <FaEye/>}
                          </button>
                          <button type="button" aria-label={`Sao chép ${row.quotation_no}`} title="Sao chép thành báo giá mới" onClick={() => duplicate(row)} disabled={busy}><FaCopy/></button>
                          <button type="button" aria-label={`Xuất Excel ${row.quotation_no}`} title="Xuất Excel" onClick={() => exportExcel(row)} disabled={busy}><FaFileExcel/></button>
                          <button type="button" aria-label={`Xuất PDF ${row.quotation_no}`} title="Xuất PDF" onClick={() => navigate(`${editHref}?pdf=1`)}><FaFilePdf/></button>
                          <button type="button" aria-label={`In ${row.quotation_no}`} title="In" onClick={() => navigate(`${editHref}?print=1`)}><FaPrint/></button>
                          {row.can_edit && row.status === 'draft' && (
                            <button type="button" className={styles.danger} aria-label={`Xóa bản nháp ${row.quotation_no}`} title="Xóa bản nháp" onClick={() => setConfirmDelete(row)} disabled={busy}><FaTrash/></button>
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
                <button type="button" onClick={() => setPageState({ key: filtersKey, page: page - 1 })} disabled={page === 0 || table.loading} aria-label="Trang trước"><FaChevronLeft/></button>
                <span>Trang {page + 1}/{pageCount}</span>
                <button type="button" onClick={() => setPageState({ key: filtersKey, page: page + 1 })} disabled={page + 1 >= pageCount || table.loading} aria-label="Trang sau"><FaChevronRight/></button>
              </div>
            </nav>
          )}
        </section>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Xóa bản nháp ${confirmDelete.quotation_no}?`}
          message="Bản nháp sẽ bị xóa khỏi danh sách. Báo giá đã gửi hoặc đã xác nhận thì hãy chuyển trạng thái sang “Đã hủy”."
          confirmLabel="Xóa bản nháp"
          danger
          onConfirm={removeDraft}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
