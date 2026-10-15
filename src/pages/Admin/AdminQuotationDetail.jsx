import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Dialog from '../../components/dialog/Dialog.jsx';
import { getAdminQuotation } from '../../services/adminQuotationService.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import { formatDateTime } from '../../utils/formatters.js';
import { formatQuotationDate, quotationHref } from '../../utils/adminQuotations.js';
import { QUOTATION_STATUSES } from '../../utils/quotation.js';
import styles from './AdminQuotations.module.css';

const ACTIONS = { create: 'Tạo báo giá', update: 'Cập nhật', status: 'Đổi trạng thái', delete: 'Chuyển vào thùng rác', restore: 'Khôi phục' };
const FIELDS = {
  status: 'Trạng thái', quotation_date: 'Ngày báo giá', customer_name: 'Khách hàng',
  contact_name: 'Người liên hệ', customer_contact: 'Người liên hệ', phone: 'Điện thoại', customer_phone: 'Điện thoại',
  email: 'Email', customer_email: 'Email', address: 'Địa chỉ', customer_address: 'Địa chỉ',
  tax_code: 'Mã số thuế', customer_tax_code: 'Mã số thuế', note: 'Ghi chú', total: 'Tổng tiền',
  item_count: 'Số dòng sản phẩm', deleted_at: 'Ngày xóa', quotation_no: 'Số báo giá',
  vat_mode: 'Cách tính VAT', discount_type: 'Loại chiết khấu', discount_value: 'Chiết khấu', shipping_fee: 'Phí vận chuyển',
};
function historyValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'status') return QUOTATION_STATUSES[value] ?? String(value);
  if (key === 'total') return `${formatCurrency(value)} ₫`;
  if (key === 'deleted_at') return formatDateTime(value);
  if (key === 'quotation_date') return formatQuotationDate(value);
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function AdminQuotationDetail({ row, returnTo, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [token, reload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ loading: true, data: null, error: '' });
      try {
        const data = await getAdminQuotation(row.kind, row.id, controller.signal);
        if (!controller.signal.aborted) setState({ loading: false, data, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [row.kind, row.id, token]);
  const record = state.data?.record;
  const items = record ? row.kind === 'standard' ? record.quotation_items ?? [] : record.quotation?.items ?? [] : [];
  const contact = record?.contact_name ?? record?.customer_contact;
  const phone = record?.phone ?? record?.customer_phone;
  return <Dialog title={`${row.kind === 'standard' ? 'Minh Triết' : 'KNM'} · ${row.quotation_no}`} variant="wide" onClose={onClose}>
    <div className={styles.detail}>
      {state.loading ? <p role="status">Đang tải chi tiết và lịch sử…</p> : state.error ? <div className={styles.alert} role="alert"><p>{state.error}</p><button type="button" onClick={() => reload((value) => value + 1)}>Thử lại</button></div> : <>
        <div className={styles.detailHeading}><div><span>{formatQuotationDate(record.quotation_date)}</span><h4>{record.customer_name}</h4></div><strong>{formatCurrency(record.total)} ₫</strong></div>
        <dl className={styles.detailMeta}>
          <div><dt>Người liên hệ</dt><dd>{contact || '—'}</dd></div><div><dt>Điện thoại</dt><dd>{phone || '—'}</dd></div>
          <div><dt>Email</dt><dd>{record.email || record.customer_email || '—'}</dd></div><div><dt>Mã số thuế</dt><dd>{record.tax_code || record.customer_tax_code || '—'}</dd></div>
          <div><dt>Người lập</dt><dd>{record.prepared_by_name || record.created_by_name || 'Chưa có thông tin'}</dd></div>
          <div><dt>Cập nhật</dt><dd>{formatDateTime(record.updated_at)}</dd></div>
          <div><dt>Trạng thái</dt><dd>{record.deleted_at ? 'Trong thùng rác' : row.kind === 'standard' ? QUOTATION_STATUSES[record.status] : 'Đang lưu'}</dd></div>
          <div><dt>Địa chỉ</dt><dd>{record.address || record.customer_address || '—'}</dd></div>
        </dl>
        {!record.deleted_at && <Link className={styles.button} to={quotationHref(row)} state={{ adminReturnTo: returnTo }}>Mở báo giá đầy đủ</Link>}
        <h4>Sản phẩm ({items.length})</h4>
        {items.length ? <div className={styles.detailTable}><table><thead><tr><th>Sản phẩm</th><th>Số lượng</th><th>Đơn vị</th><th>Đơn giá</th></tr></thead><tbody>{items.map((item, index) => <tr key={item.id ?? index}><td>{item.product_name || item.description || 'Sản phẩm'}{item.product_name && item.description && <small>{item.description}</small>}</td><td>{item.quantity}</td><td>{item.unit === 'Khác' ? item.customUnit : item.unit}</td><td>{formatCurrency(item.unit_price ?? item.unitPrice)} ₫</td></tr>)}</tbody></table></div> : <p>Chưa có dòng sản phẩm.</p>}
        <h4>Lịch sử thay đổi</h4>
        {state.data.historyError ? <p role="alert">Chưa tải được lịch sử thay đổi. Hãy thử tải lại chi tiết.</p>
          : !state.data.history.length ? <p>Chưa có lịch sử cho báo giá này.</p> : <ol className={styles.history}>{state.data.history.map((entry) => <li key={entry.id}><div><strong>{ACTIONS[entry.action] ?? entry.action}</strong><span>{entry.actor_name || 'Người dùng'} · {formatDateTime(entry.created_at)}</span></div>
            <ul>{Object.entries(entry.changes ?? {}).map(([key, change]) => <li key={key}><b>{FIELDS[key] ?? key}: </b>{change && typeof change === 'object' && 'to' in change ? <>{historyValue(key, change.from)} → {historyValue(key, change.to)}</> : historyValue(key, change)}</li>)}</ul>
          </li>)}</ol>}
        {state.data.history.length === 50 && <p className={styles.hint}>Đang hiển thị 50 thay đổi gần nhất.</p>}
      </>}
    </div>
  </Dialog>;
}
