import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaBan, FaCopy, FaFileExcel, FaFilePdf, FaPen, FaPlus, FaPrint, FaTrash } from 'react-icons/fa6';
import { listQuotations, getQuotation, getNextQuotationNumber, normalizeQuotation, saveQuotation, setQuotationStatus, softDeleteDraft } from '../../services/quotationService.js';
import { calculateQuotation, QUOTATION_STATUSES, quotationPayload } from '../../utils/quotation.js';
import { exportQuotationToExcel } from '../../utils/quotationExcel.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from './Quotation.module.css';

export default function QuotationList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => listQuotations(filters).then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false)), [filters]);
  useEffect(() => { load(); }, [load]);
  const duplicate = async (id) => {
    try {
      const source = normalizeQuotation(await getQuotation(id));
      source.id = ''; source.quotation_no = await getNextQuotationNumber(source.quotation_date);
      const newId = await saveQuotation(quotationPayload(source, 'draft'));
      navigate(`/admin/bao-gia/${newId}/chinh-sua`);
    } catch (e) { toast.error(e.message); }
  };
  const excel = async (id) => {
    try { const q = normalizeQuotation(await getQuotation(id)); await exportQuotationToExcel(q, calculateQuotation(q)); }
    catch (e) { toast.error(e.message); }
  };
  const remove = async (row) => {
    if (!window.confirm(row.status === 'draft' ? 'Xóa bản nháp này?' : 'Hủy báo giá này?')) return;
    try { row.status === 'draft' ? await softDeleteDraft(row.id) : await setQuotationStatus(row.id, 'cancelled'); load(); }
    catch (e) { toast.error(e.message); }
  };

  return <><Helmet><title>Danh sách báo giá</title></Helmet><div className={styles.page}>
    <header className={styles.pageHeader}><div><span>QUẢN LÝ BÁO GIÁ</span><h1>DANH SÁCH BÁO GIÁ</h1></div><Link className={styles.primaryLink} to="/admin/bao-gia/tao-moi"><FaPlus/> Tạo báo giá</Link></header>
    <section className={styles.card}><div className={styles.filters}><input placeholder="Số báo giá, khách hàng, số điện thoại..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}/><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tất cả trạng thái</option>{Object.entries(QUOTATION_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}/><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}/></div>
    <div className={styles.tableWrap}><table className={styles.listTable}><thead><tr><th>Số báo giá</th><th>Ngày</th><th>Khách hàng</th><th>Liên hệ</th><th>Tổng tiền</th><th>Nhân viên</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="9">Đang tải...</td></tr> : rows.length === 0 ? <tr><td colSpan="9">Chưa có báo giá.</td></tr> : rows.map((row) => <tr key={row.id}><td><Link to={`/admin/bao-gia/${row.id}/chinh-sua`}>{row.quotation_no}</Link></td><td>{row.quotation_date}</td><td>{row.customer_name}</td><td>{row.contact_name || row.phone || '—'}</td><td className={styles.money}>{formatCurrency(row.total)}</td><td>{row.prepared_by_name || '—'}</td><td><span className={`${styles.status} ${styles[row.status]}`}>{QUOTATION_STATUSES[row.status]}</span></td><td>{new Date(row.created_at).toLocaleString('vi-VN')}</td><td><div className={styles.rowActions}><button title="Chỉnh sửa" onClick={() => navigate(`/admin/bao-gia/${row.id}/chinh-sua`)}><FaPen/></button><button title="Tạo bản sao" onClick={() => duplicate(row.id)}><FaCopy/></button><button title="Xuất Excel" onClick={() => excel(row.id)}><FaFileExcel/></button><button title="Xuất PDF" onClick={() => navigate(`/admin/bao-gia/${row.id}/chinh-sua?pdf=1`)}><FaFilePdf/></button><button title="In" onClick={() => navigate(`/admin/bao-gia/${row.id}/chinh-sua?print=1`)}><FaPrint/></button><button title={row.status === 'draft' ? 'Xóa' : 'Hủy'} className={styles.danger} onClick={() => remove(row)}>{row.status === 'draft' ? <FaTrash/> : <FaBan/>}</button></div></td></tr>)}
    </tbody></table></div></section></div></>;
}
