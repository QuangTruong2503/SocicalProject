import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaArrowLeft, FaPen, FaPlus, FaTrash } from 'react-icons/fa6';
import { deleteKnmQuotation, listKnmQuotations } from '../../services/knmQuotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import styles from './QuotationKnm.module.css';

export default function QuotationKnmList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listKnmQuotations({ search }).then(setRows).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 300);
    return () => window.clearTimeout(timer);
  }, [load]);

  const remove = async (row) => {
    if (!window.confirm(`Xóa báo giá ${row.quotation_no} của "${row.customer_name}"?`)) return;
    try {
      await deleteKnmQuotation(row.id);
      toast.success('Đã xóa báo giá.');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <Helmet><title>Quản lý báo giá KNM</title></Helmet>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <div className={styles.logoBadge}>KNM</div>
            <div className={styles.headerTitle}>
              <h1>QUẢN LÝ BÁO GIÁ</h1>
              <p>Tìm và chỉnh sửa các báo giá đã lưu</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link to="/bao-gia-knm" className={styles.btnManage}><FaArrowLeft /> Quay lại</Link>
            <Link to="/bao-gia-knm" className={styles.btnPdf}><FaPlus /> Tạo báo giá mới</Link>
          </div>
        </header>

        <div className={styles.listBody}>
          <section className={styles.card}>
            <div className={styles.filters}>
              <input
                placeholder="Tìm theo số điện thoại, tên công ty/khách hàng, MST hoặc số báo giá..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.tableWrap}>
              <table className={styles.listTable}>
                <thead>
                  <tr>
                    <th>Số báo giá</th>
                    <th>Ngày</th>
                    <th>Khách hàng / Công ty</th>
                    <th>Liên hệ</th>
                    <th>SĐT</th>
                    <th>MST</th>
                    <th>Tổng tiền</th>
                    <th>Cập nhật</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="9" className={styles.emptyState}>Đang tải...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan="9" className={styles.emptyState}>Chưa có báo giá nào phù hợp.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.id}>
                      <td><Link to={`/bao-gia-knm/${row.id}/chinh-sua`}>{row.quotation_no}</Link></td>
                      <td>{dayjs(row.quotation_date).format('DD/MM/YYYY')}</td>
                      <td>{row.customer_name}</td>
                      <td>{row.customer_contact || '—'}</td>
                      <td>{row.customer_phone || '—'}</td>
                      <td>{row.customer_tax_code || '—'}</td>
                      <td className={styles.money}>{formatCurrency(row.total)}</td>
                      <td>{dayjs(row.updated_at).format('DD/MM/YYYY HH:mm')}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button type="button" title="Chỉnh sửa" onClick={() => navigate(`/bao-gia-knm/${row.id}/chinh-sua`)}><FaPen /></button>
                          <button type="button" title="Xóa" className={styles.danger} onClick={() => remove(row)}><FaTrash /></button>
                        </div>
                      </td>
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
