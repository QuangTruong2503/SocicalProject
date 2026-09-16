import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaBan, FaPen, FaTrash } from 'react-icons/fa6';
import { listQuotations, setQuotationStatus, softDeleteDraft } from '../../services/quotationService.js';
import { deleteKnmQuotation, listKnmQuotations } from '../../services/knmQuotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import ConfirmModal from '../Quotation/ConfirmModal.jsx';
import styles from './Admin.module.css';

const TABS = [
  { key: 'standard', label: 'Báo giá' },
  { key: 'knm', label: 'Báo giá KNM' },
];

export default function AdminQuotationsPage() {
  const [tab, setTab] = useState('standard');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmRow, setConfirmRow] = useState(null);

  const load = useCallback(() => {
    const request = tab === 'standard' ? listQuotations({ search }) : listKnmQuotations({ search });
    return request
      .then(setRows)
      .catch((error) => { toast.error(error.message); setRows([]); })
      .finally(() => setLoading(false));
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const confirmRemove = async () => {
    const row = confirmRow;
    setConfirmRow(null);
    if (!row) return;
    try {
      if (tab === 'standard') {
        row.status === 'draft' ? await softDeleteDraft(row.id) : await setQuotationStatus(row.id, 'cancelled');
      } else {
        await deleteKnmQuotation(row.id);
      }
      toast.success('Đã cập nhật báo giá.');
      load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <Helmet><title>Quản lý báo giá</title></Helmet>
      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>BÁO GIÁ</h1></div>
      </header>

      <section className={styles.card}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.filters}>
          <input
            placeholder="Số báo giá, khách hàng, số điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Số báo giá</th>
                <th>Ngày</th>
                <th>Khách hàng</th>
                <th>Liên hệ</th>
                <th>Tổng tiền</th>
                {tab === 'standard' && <th>Trạng thái</th>}
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={tab === 'standard' ? 6 : 5} className={styles.emptyState}>Đang tải...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={tab === 'standard' ? 6 : 5} className={styles.emptyState}>Chưa có báo giá.</td></tr>
              ) : rows.map((row) => {
                const editHref = tab === 'standard'
                  ? `/bao-gia-minh-triet/${row.id}/chinh-sua`
                  : `/bao-gia-knm/${row.id}/chinh-sua`;
                return (
                  <tr key={row.id}>
                    <td><Link to={editHref}>{row.quotation_no}</Link></td>
                    <td>{row.quotation_date}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.contact_name || row.customer_contact || row.phone || row.customer_phone || '—'}</td>
                    <td className={styles.money}>{formatCurrency(row.total)}</td>
                    {tab === 'standard' && <td>{row.status}</td>}
                    <td>
                      <div className={styles.rowActions}>
                        <Link title="Chỉnh sửa" to={editHref}><FaPen /></Link>
                        <button
                          title={tab === 'standard' && row.status === 'draft' ? 'Xóa' : 'Xóa / Hủy'}
                          className={styles.danger}
                          onClick={() => setConfirmRow(row)}
                        >
                          {tab === 'standard' && row.status === 'draft' ? <FaTrash /> : <FaBan />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmModal
        open={!!confirmRow}
        title={tab === 'standard' && confirmRow?.status === 'draft' ? 'Xóa bản nháp' : 'Xóa / hủy báo giá'}
        message="Bạn có chắc muốn thực hiện thao tác này?"
        confirmLabel="Xác nhận"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setConfirmRow(null)}
      />
    </>
  );
}
