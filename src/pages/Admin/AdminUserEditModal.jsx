import { useState } from 'react';
import styles from './Admin.module.css';

const ROLE_OPTIONS = [
  { value: 'user', label: 'Người dùng' },
  { value: 'admin', label: 'Quản trị viên' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Hoạt động' },
  { value: 'suspended', label: 'Đã khóa' },
];

export default function AdminUserEditModal({ profile, onSave, onCancel, saving }) {
  const [role, setRole] = useState(profile.role || 'user');
  const [status, setStatus] = useState(profile.status || 'active');
  const [isVerified, setIsVerified] = useState(Boolean(profile.is_verified));

  if (!profile) return null;

  const submit = (event) => {
    event.preventDefault();
    onSave({ role, status, is_verified: isVerified });
  };

  return (
    <div className={styles.modal} onClick={onCancel}>
      <form className={styles.modalBody} onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true">
        <h3>Chỉnh sửa: {profile.full_name || profile.username || profile.email}</h3>

        <label className={styles.modalField}>
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>

        <label className={styles.modalField}>
          Trạng thái tài khoản
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>

        <label className={styles.modalCheckbox}>
          <input type="checkbox" checked={isVerified} onChange={(e) => setIsVerified(e.target.checked)} />
          Đã xác minh
        </label>

        <div className={styles.modalActions}>
          <button type="button" onClick={onCancel} disabled={saving}>Hủy</button>
          <button type="submit" className={styles.primary} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </form>
    </div>
  );
}
