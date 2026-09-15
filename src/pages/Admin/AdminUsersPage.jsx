import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'react-toastify';
import { FaPen } from 'react-icons/fa6';
import { useAuth } from '../../hooks/useAuth.js';
import { adminUpdateProfile, listProfiles } from '../../services/profileService.js';
import AdminUserEditModal from './AdminUserEditModal.jsx';
import styles from './Admin.module.css';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: '', role: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => listProfiles(filters).then((result) => {
    if (result.error) {
      toast.error(result.error);
      setRows([]);
      return;
    }
    setRows(result.data || []);
  }).finally(() => setLoading(false)), [filters]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async (updates) => {
    if (!editingProfile) return;
    setSaving(true);
    const result = await adminUpdateProfile(editingProfile.id, updates);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Đã cập nhật người dùng.');
    setEditingProfile(null);
    load();
  };

  return (
    <>
      <Helmet><title>Quản lý người dùng</title></Helmet>
      <header className={styles.pageHeader}>
        <div><span>QUẢN TRỊ HỆ THỐNG</span><h1>NGƯỜI DÙNG</h1></div>
      </header>

      <section className={styles.card}>
        <div className={styles.filters}>
          <input
            placeholder="Tên đăng nhập, email, họ tên..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">Tất cả vai trò</option>
            <option value="admin">Quản trị viên</option>
            <option value="user">Người dùng</option>
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="suspended">Đã khóa</option>
          </select>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Xác minh</th>
                <th>Tham gia</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={styles.emptyState}>Đang tải...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className={styles.emptyState}>Không có người dùng phù hợp.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.full_name || row.username || '—'}</td>
                  <td>{row.email || '—'}</td>
                  <td>
                    <span className={`${styles.badge} ${row.role === 'admin' ? styles.badgeAdmin : styles.badgeUser}`}>
                      {row.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${row.status === 'suspended' ? styles.badgeSuspended : row.status === 'active' ? styles.badgeActive : styles.badgeDefault}`}>
                      {row.status === 'suspended' ? 'Đã khóa' : row.status === 'active' ? 'Hoạt động' : (row.status || '—')}
                    </span>
                  </td>
                  <td>{row.is_verified ? 'Đã xác minh' : '—'}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        title="Chỉnh sửa"
                        onClick={() => setEditingProfile(row)}
                        disabled={row.id === currentUser?.id}
                      >
                        <FaPen />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editingProfile && (
        <AdminUserEditModal
          profile={editingProfile}
          saving={saving}
          onSave={saveEdit}
          onCancel={() => setEditingProfile(null)}
        />
      )}
    </>
  );
}
