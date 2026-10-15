import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaArrowsRotate, FaBan, FaCopy, FaEye, FaFileCsv, FaPen, FaPlus, FaRotateLeft, FaTrash, FaXmark } from 'react-icons/fa6';
import ConfirmDialog from '../../components/dialog/ConfirmDialog.jsx';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { changeAdminQuotation, getAdminQuotation, listAdminQuotations } from '../../services/adminQuotationService.js';
import { normalizeQuotation } from '../../services/quotationService.js';
import { normalizeKnmQuotation } from '../../utils/knmQuotation.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { csvQuotationRows, formatQuotationDate, quotationHref, readAdminQuotationFilters } from '../../utils/adminQuotations.js';
import { downloadCsv, formatDateTime, formatNumber } from './adminUtils.js';
import { QUOTATION_STATUSES } from '../../utils/quotation.js';
import { SortHeader } from './AdminTableParts.jsx';
import AdminQuotationDetail from './AdminQuotationDetail.jsx';
import styles from './AdminQuotations.module.css';

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
const PARAMS = { kind:'kind',search:'q',status:'status',from:'from',to:'to',creator:'creator',sort:'sort',page:'page' };
const freshTable = { key:'',rows:[],totalCount:0,summary:null,creators:[],enhanced:null,loading:true,error:'' };

export default function AdminQuotationsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const filters = useMemo(() => readAdminQuotationFilters(params), [params]);
  const { kind, status, from, to, creator, deleted, sort, desc, page } = filters;
  const search = useDebouncedValue(filters.search.trim(), 300);
  const [table, setTable] = useState(freshTable);
  const [reloadToken, setReloadToken] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState('');
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState(null);
  const actionLock = useRef(false);
  const copyLock = useRef(false);
  const mounted = useRef(false);
  const returnTo = `${location.pathname}${location.search}`;
  const dateError = from && to && from > to ? 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' : '';
  const requestFilters = useMemo(() => ({kind,search,status,from,to,creator,deleted,sort,desc}), [kind,search,status,from,to,creator,deleted,sort,desc]);
  const key = JSON.stringify([requestFilters,page,reloadToken]);
  const waitingSearch = search !== filters.search.trim();
  const loading = table.key !== key || table.loading || waitingSearch;
  const usable = !loading && !dateError && !table.error;
  const rows = usable ? table.rows : [];
  const title = kind === 'standard' ? 'Minh Triết' : 'KNM';
  const columnCount = kind === 'standard' ? 8 : 7;
  const pageCount = Math.max(1, Math.ceil(table.totalCount / PAGE_SIZE));
  const hasFilters = Boolean(filters.search || status || from || to || creator);

  const updateFilters = useCallback((patch, replace = false) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (!Object.hasOwn(patch,'page')) next.delete('page');
      for (const [name,value] of Object.entries(patch)) {
        const param = PARAMS[name] ?? (name === 'deleted' ? 'view' : name === 'desc' ? 'dir' : name);
        if (name === 'deleted') { if (value) next.set(param,'trash'); else next.delete(param); }
        else if (name === 'desc') { if (!value) next.set(param,'asc'); else next.delete(param); }
        else if (value === '' || value === null || value === undefined || (name === 'page' && value <= 1)) next.delete(param);
        else next.set(param,String(value));
      }
      return next;
    }, {replace});
  }, [setParams]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (dateError || waitingSearch) return;
    const controller = new AbortController();
    async function load() {
      setTable((current) => ({...current,key,loading:true,error:''}));
      try {
        const result = await listAdminQuotations({...requestFilters,limit:PAGE_SIZE,offset:page * PAGE_SIZE},controller.signal);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(0,Math.ceil(result.totalCount / PAGE_SIZE) - 1);
        if (page > lastPage) { updateFilters({page:lastPage + 1},true); return; }
        setTable({...result,key,loading:false,error:''});
      } catch (error) {
        if (!controller.signal.aborted) setTable((current) => ({...current,key,rows:[],loading:false,error:error.message}));
      }
    }
    load();
    return () => controller.abort();
  }, [key, requestFilters, page, dateError, waitingSearch, updateFilters]);

  function clearFilters() { updateFilters({search:'',status:'',from:'',to:'',creator:'',sort:'created_at',desc:true}); }
  function askAction(row, action, nextStatus) {
    if (!usable || actionLock.current) return;
    setConfirmation({row:{...row},action,status:nextStatus});
  }
  async function confirmAction() {
    if (!confirmation || actionLock.current) return;
    actionLock.current = true;
    setActionBusy(true);
    const operation = confirmation;
    try {
      await changeAdminQuotation(operation.row,operation.action,operation.status);
      if (!mounted.current) return;
      const verb = operation.action === 'restore' ? 'Đã khôi phục' : operation.action === 'delete' ? 'Đã chuyển vào thùng rác' : `Đã đổi sang “${QUOTATION_STATUSES[operation.status]}”`;
      toast.success(`${verb}: ${operation.row.quotation_no}.`);
      setConfirmation(null);
      setReloadToken((value) => value + 1);
    } catch (error) {
      if (!mounted.current) return;
      toast.error(error.message);
      if (['40001','P0002','42501'].includes(error.code)) {
        setConfirmation(null);
        setReloadToken((value) => value + 1);
      }
    } finally {
      actionLock.current = false;
      if (mounted.current) setActionBusy(false);
    }
  }

  async function duplicate(row) {
    if (copyLock.current || !usable) return;
    copyLock.current = true; setCopyBusy(row.id);
    try {
      const {record} = await getAdminQuotation(row.kind,row.id);
      if (!mounted.current) return;
      if (record.deleted_at) { toast.error('Báo giá đã được xóa. Hãy làm mới danh sách.'); setReloadToken((value) => value + 1); return; }
      const copyOf = row.kind === 'standard' ? normalizeQuotation(record) : {company:record.company,quotation:normalizeKnmQuotation(record.quotation)};
      navigate(row.kind === 'standard' ? '/bao-gia-minh-triet/tao-moi' : '/bao-gia-knm',{state:{copyOf,adminReturnTo:returnTo}});
      toast.info('Đã tạo bản sao chưa lưu. Số mới được cấp khi lưu.');
    } catch (error) { if (mounted.current) toast.error(error.message); }
    finally { copyLock.current = false; if (mounted.current) setCopyBusy(''); }
  }
  async function exportCsv() {
    if (exporting || !usable) return;
    setExporting(true);
    try {
      const result = await listAdminQuotations({...requestFilters,limit:EXPORT_LIMIT,offset:0});
      if (!mounted.current) return;
      if (!result.rows.length) { toast.info('Không có báo giá phù hợp để xuất.'); return; }
      downloadCsv(['Số báo giá','Ngày','Khách hàng','Người liên hệ','Điện thoại','Tổng tiền (VND)','Người lập','Trạng thái','Xóa lúc','Tạo lúc'],csvQuotationRows(result.rows,QUOTATION_STATUSES),`bao-gia-${kind}${deleted ? '-thung-rac' : ''}.csv`);
      if (result.totalCount > result.rows.length) toast.warning(`Đã xuất ${formatNumber(result.rows.length)}/${formatNumber(result.totalCount)} báo giá đầu tiên. Hãy thu hẹp bộ lọc để xuất phần còn lại.`);
      else toast.success(`Đã xuất ${formatNumber(result.rows.length)} báo giá ${title}.`);
    } catch (error) { if (mounted.current) toast.error(error.message); }
    finally { if (mounted.current) setExporting(false); }
  }
  const sortState = {key:sort,desc};
  const onSort = (value) => updateFilters({sort:value,desc:value === sort ? !desc : !['quotation_no','customer_name'].includes(value)});
  const sortOptions = [
    ['created_at:desc','Tạo mới nhất'],['created_at:asc','Tạo cũ nhất'],
    ['quotation_date:desc','Ngày báo giá: mới nhất'],['quotation_date:asc','Ngày báo giá: cũ nhất'],
    ['quotation_no:asc','Số báo giá: tăng dần'],['quotation_no:desc','Số báo giá: giảm dần'],
    ['total:desc','Giá trị: cao đến thấp'],['total:asc','Giá trị: thấp đến cao'],
    ...(table.enhanced === false && kind === 'standard' ? [] : [['customer_name:asc','Khách hàng: A–Z'],['customer_name:desc','Khách hàng: Z–A']]),
    ...(deleted ? [['deleted_at:desc','Xóa gần nhất'],['deleted_at:asc','Xóa cũ nhất']] : []),
  ];
  const monthPrefix = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date());
  const summary = table.summary ?? {
    total:table.totalCount,value:table.rows.filter((row) => row.status !== 'cancelled').reduce((sum,row) => sum + Number(row.total || 0),0),
    draft:table.rows.filter((row) => row.status === 'draft').length,confirmed:table.rows.filter((row) => row.status === 'confirmed').length,
    month:table.rows.filter((row) => row.quotation_date?.startsWith(monthPrefix)).length,
    recent:table.rows.filter((row) => Date.parse(row.updated_at) >= Date.now() - 7 * 86400000).length,
  };
  const summaryReady = usable && summary;
  const tiles = [
    ['Kết quả lọc',formatNumber(summary.total),'Theo loại và bộ lọc đang chọn'],
    [table.enhanced === false ? 'Giá trị trang này' : 'Giá trị báo giá',`${formatCurrency(summary.value)} ₫`,'Không cộng báo giá đã hủy'],
    [kind === 'standard' ? 'Bản nháp' : 'Ngày báo giá trong tháng',formatNumber(kind === 'standard' ? summary.draft : summary.month),table.enhanced === false ? 'Trong trang hiện tại' : 'Trong kết quả lọc'],
    [kind === 'standard' ? 'Khách đã xác nhận' : 'Cập nhật trong 7 ngày',formatNumber(kind === 'standard' ? summary.confirmed : summary.recent),table.enhanced === false ? 'Trong trang hiện tại' : 'Trong kết quả lọc'],
  ];
  const confirmLabel = confirmation?.action === 'restore' ? 'Khôi phục' : confirmation?.action === 'delete' ? 'Chuyển vào thùng rác' : confirmation?.status === 'cancelled' ? 'Hủy báo giá' : 'Đổi trạng thái';

  function rowActions(row) {
    return <div className={styles.rowActions}>
      <button type="button" onClick={() => setDetail(row)} aria-label={`Xem nhanh ${row.quotation_no}`} title="Xem nhanh và lịch sử"><FaEye aria-hidden="true" /></button>
      {row.deleted_at ? <button type="button" onClick={() => askAction(row,'restore')} aria-label={`Khôi phục ${row.quotation_no}`} title="Khôi phục"><FaRotateLeft aria-hidden="true" /></button> : <>
        <Link to={quotationHref(row)} state={{adminReturnTo:returnTo}} aria-label={`${row.status === 'cancelled' ? 'Mở' : 'Sửa'} ${row.quotation_no}`} title={row.status === 'cancelled' ? 'Mở báo giá' : 'Chỉnh sửa'}><FaPen aria-hidden="true" /></Link>
        <button type="button" onClick={() => duplicate(row)} disabled={Boolean(copyBusy)} aria-label={`Sao chép ${row.quotation_no}`} title="Sao chép thành báo giá mới"><FaCopy aria-hidden="true" /></button>
        {(row.kind === 'knm' || row.status !== 'cancelled') && <button type="button" className={styles.danger}
          onClick={() => askAction(row,row.kind === 'knm' || row.status === 'draft' ? 'delete' : 'status','cancelled')}
          aria-label={`${row.kind === 'knm' || row.status === 'draft' ? 'Xóa' : 'Hủy'} ${row.quotation_no}`}
          title={row.kind === 'knm' || row.status === 'draft' ? 'Chuyển vào thùng rác' : 'Hủy báo giá'}>{row.kind === 'knm' || row.status === 'draft' ? <FaTrash aria-hidden="true" /> : <FaBan aria-hidden="true" />}</button>}
      </>}
    </div>;
  }

  return <>
    <Helmet><title>Quản lý báo giá · Quản trị</title></Helmet>
    <div className={styles.page}>
      <header className={styles.header}><div><span className={styles.eyebrow}>QUẢN TRỊ HỆ THỐNG</span><h1>Quản lý báo giá</h1><p>Tra cứu, theo dõi và quản lý báo giá Minh Triết và KNM.</p></div>
        <div className={styles.headerActions}><button type="button" className={styles.button} onClick={() => setReloadToken((value) => value + 1)} disabled={loading || actionBusy}><FaArrowsRotate aria-hidden="true" /> Làm mới</button>
          <button type="button" className={styles.button} onClick={exportCsv} disabled={!usable || exporting || !table.totalCount} title="Xuất tối đa 5.000 dòng phù hợp bộ lọc"><FaFileCsv aria-hidden="true" /> {exporting ? 'Đang xuất…' : 'Xuất CSV'}</button>
          <Link className={`${styles.button} ${styles.primary}`} to={kind === 'standard' ? '/bao-gia-minh-triet/tao-moi' : '/bao-gia-knm'} state={{adminReturnTo:returnTo}}><FaPlus aria-hidden="true" /> Tạo báo giá</Link></div>
      </header>
      <div className={styles.switches}><div role="group" aria-label="Loại báo giá">{[['standard','Minh Triết'],['knm','KNM']].map(([value,label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => updateFilters({kind:value,status:'',creator:''})}>{label}</button>)}</div>
        <div role="group" aria-label="Khu vực lưu trữ"><button type="button" aria-pressed={!deleted} onClick={() => updateFilters({deleted:false,sort:sort === 'deleted_at' ? 'created_at' : sort})}>Đang dùng</button><button type="button" aria-pressed={deleted} onClick={() => updateFilters({deleted:true,sort:'deleted_at',desc:true})}><FaTrash aria-hidden="true" /> Thùng rác</button></div></div>
      <section className={styles.stats} aria-label="Thống kê kết quả lọc">{tiles.map(([label,value,hint]) => <article key={label}><span>{label}</span><strong>{summaryReady ? value : '—'}</strong><small>{hint}</small></article>)}</section>
      <section className={styles.card} aria-label={`Danh sách báo giá ${title}`}>
        <div className={`${styles.filters} ${kind === 'knm' ? styles.knmFilters : ''}`}>
          <label className={styles.search}>Tìm báo giá<input type="search" value={filters.search} placeholder="Số báo giá, khách hàng, điện thoại, người lập…" onChange={(event) => updateFilters({search:event.target.value},true)} /></label>
          {kind === 'standard' && <label>Trạng thái<select value={status} onChange={(event) => updateFilters({status:event.target.value})}><option value="">Tất cả trạng thái</option>{Object.entries(QUOTATION_STATUSES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          <label>Từ ngày<input type="date" value={from} max={to || undefined} aria-invalid={Boolean(dateError)} onChange={(event) => updateFilters({from:event.target.value})} /></label>
          <label>Đến ngày<input type="date" value={to} min={from || undefined} aria-invalid={Boolean(dateError)} onChange={(event) => updateFilters({to:event.target.value})} /></label>
          <label>Người lập<select value={creator} disabled={table.enhanced === false} onChange={(event) => updateFilters({creator:event.target.value})}><option value="">Tất cả người lập</option>{creator && !table.creators.some((item) => item.id === creator) && <option value={creator}>Người lập đang lọc</option>}{table.creators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className={styles.listHeading}><p role="status" aria-live="polite">{deleted ? 'Thùng rác' : 'Danh sách'} {title} · {dateError ? 'Kiểm tra bộ lọc ngày' : loading ? 'Đang tải…' : `${formatNumber(table.totalCount)} kết quả`}</p>
          <div className={styles.listTools}><label className={styles.sortControl}>Sắp xếp<select value={`${sort}:${desc ? 'desc' : 'asc'}`} onChange={(event) => { const [value,direction] = event.target.value.split(':'); updateFilters({sort:value,desc:direction === 'desc'}); }}>{sortOptions.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {hasFilters && <button type="button" className={styles.textButton} onClick={clearFilters}><FaXmark aria-hidden="true" /> Xóa bộ lọc</button>}</div></div>
        {dateError && <div className={styles.alert} role="alert">{dateError}</div>}
        {table.error && !loading && <div className={styles.alert} role="alert"><p>{table.error}</p><button type="button" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button></div>}
        {table.enhanced === false && !loading && <p className={styles.hint}>Một số tính năng quản trị chưa sẵn sàng. Bạn vẫn có thể tra cứu và quản lý danh sách đang dùng.</p>}
        <div className={styles.tableWrap} aria-busy={loading}>
          <table className={styles.table} role="table" aria-label={`Báo giá ${title}`}><thead><tr>
            <SortHeader label="Số báo giá" sortKey="quotation_no" sort={sortState} onSort={onSort} />
            <SortHeader label="Ngày báo giá" sortKey="quotation_date" sort={sortState} onSort={onSort} />
            {table.enhanced === false && kind === 'standard' ? <th>Khách hàng</th> : <SortHeader label="Khách hàng" sortKey="customer_name" sort={sortState} onSort={onSort} />}
            <th>Liên hệ</th><SortHeader label="Tổng tiền (₫)" sortKey="total" sort={sortState} onSort={onSort} align="right" />
            <th>Người lập</th>{kind === 'standard' && <th>Trạng thái</th>}<th>Thao tác</th>
          </tr></thead><tbody>
            {dateError ? <tr className={styles.empty}><td colSpan={columnCount}>Kiểm tra lại khoảng ngày để xem kết quả.</td></tr>
              : loading ? <tr className={styles.empty}><td colSpan={columnCount}>Đang tải báo giá…</td></tr>
                : table.error ? <tr className={styles.empty}><td colSpan={columnCount}>Danh sách chưa tải được. Vui lòng thử lại.</td></tr>
                  : !rows.length ? <tr className={styles.empty}><td colSpan={columnCount}>{deleted ? 'Không có báo giá trong thùng rác phù hợp bộ lọc.' : hasFilters ? 'Không tìm thấy báo giá phù hợp.' : 'Chưa có báo giá. Hãy tạo báo giá đầu tiên.'}</td></tr>
                    : rows.map((row) => <tr key={`${row.kind}:${row.id}`}>
                      <td data-label="Số báo giá">{row.deleted_at ? <button type="button" className={styles.quoteNumber} onClick={() => setDetail(row)}>{row.quotation_no}</button> : <Link className={styles.quoteNumber} to={quotationHref(row)} state={{adminReturnTo:returnTo}}>{row.quotation_no}</Link>}</td>
                      <td data-label="Ngày báo giá" className={styles.date}>{formatQuotationDate(row.quotation_date)}{row.deleted_at && <small>Xóa: {formatDateTime(row.deleted_at)}</small>}</td>
                      <td data-label="Khách hàng" className={styles.customer}>{row.customer_name}</td>
                      <td data-label="Liên hệ"><span>{row.contact_name || '—'}</span>{row.phone && <a className={styles.phone} href={`tel:${row.phone.replace(/[^\d+]/g,'')}`}>{row.phone}</a>}</td>
                      <td data-label="Tổng tiền" className={styles.money}>{formatCurrency(row.total)} ₫</td>
                      <td data-label="Người lập">{row.creator_name || 'Chưa có thông tin'}</td>
                      {kind === 'standard' && <td data-label="Trạng thái"><span className={`${styles.badge} ${styles[`status_${row.status}`] ?? ''}`}>{QUOTATION_STATUSES[row.status] ?? row.status}</span>{!deleted && <select className={styles.statusControl} aria-label={`Đổi trạng thái ${row.quotation_no}`} value={row.status} onChange={(event) => { if (event.target.value !== row.status) askAction(row,'status',event.target.value); }}>{Object.entries(QUOTATION_STATUSES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}</td>}
                      <td data-label="Thao tác">{rowActions(row)}</td>
                    </tr>)}
          </tbody></table>
        </div>
        <nav className={styles.pagination} aria-label="Phân trang báo giá"><span>{usable && table.totalCount ? `${formatNumber(page * PAGE_SIZE + 1)}–${formatNumber(Math.min((page + 1) * PAGE_SIZE,table.totalCount))} / ${formatNumber(table.totalCount)}` : '—'}</span><div><button type="button" aria-label="Trang trước" disabled={!usable || page === 0} onClick={() => updateFilters({page})}>←</button><span>Trang {page + 1}/{usable ? pageCount : '…'}</span><button type="button" aria-label="Trang sau" disabled={!usable || page + 1 >= pageCount} onClick={() => updateFilters({page:page + 2})}>→</button></div></nav>
      </section>
    </div>
    {detail && <AdminQuotationDetail row={detail} returnTo={returnTo} onClose={() => setDetail(null)} />}
    {confirmation && <ConfirmDialog title={`${confirmLabel} ${confirmation.row.quotation_no}?`}
      message={`${confirmation.row.customer_name} · ${formatCurrency(confirmation.row.total)} ₫. ${confirmation.action === 'delete' ? 'Báo giá sẽ vào thùng rác và có thể được quản trị viên khôi phục.' : confirmation.action === 'restore' ? 'Báo giá sẽ trở lại danh sách đang dùng, giữ nguyên số và nội dung.' : `Trạng thái sẽ đổi từ “${QUOTATION_STATUSES[confirmation.row.status]}” sang “${QUOTATION_STATUSES[confirmation.status]}”. Nội dung báo giá được giữ lại.`}`}
      confirmLabel={confirmLabel} danger={confirmation.action === 'delete' || confirmation.status === 'cancelled'} busy={actionBusy} onConfirm={confirmAction} onCancel={() => { if (!actionLock.current) setConfirmation(null); }} />}
  </>;
}
