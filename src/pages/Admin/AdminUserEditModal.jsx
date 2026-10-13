import { useState } from 'react';
import { FaTriangleExclamation } from 'react-icons/fa6';
import AdminDialog from './AdminDialog.jsx';
import {
  MAX_CREDITS,
  PLAN_SUGGESTIONS,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  formatChangeValue,
  getChangeFieldLabel,
  getProfileName,
  isSensitiveChange,
} from './adminUserLabels.js';
import styles from './Admin.module.css';
import us from './AdminUsers.module.css';

const PLAN_PATTERN = /^[a-z0-9_-]{1,30}$/;

function getInitialForm(profile) {
  return {
    role: profile.role || 'user',
    status: profile.status || 'active',
    is_verified: Boolean(profile.is_verified),
    plan: profile.plan || '',
    credits: profile.credits ?? '',
  };
}

/** Only the fields that differ from the current profile, normalized for the RPC. */
function getChanges(profile, form) {
  const initial = getInitialForm(profile);
  const changes = {};

  if (form.role !== initial.role) changes.role = form.role;
  if (form.status !== initial.status) changes.status = form.status;
  if (form.is_verified !== initial.is_verified) changes.is_verified = form.is_verified;

  const plan = form.plan.trim().toLowerCase();
  if (plan && plan !== initial.plan) changes.plan = plan;

  if (String(form.credits).trim() !== '' && Number(form.credits) !== Number(initial.credits)) {
    changes.credits = Number(form.credits);
  }

  return changes;
}

function validate(form) {
  const errors = {};
  const plan = form.plan.trim().toLowerCase();

  if (plan && !PLAN_PATTERN.test(plan)) {
    errors.plan = 'Chỉ dùng chữ thường, số, "-" hoặc "_" (tối đa 30 ký tự).';
  }

  if (String(form.credits).trim() !== '') {
    const credits = Number(form.credits);

    if (!Number.isInteger(credits) || credits < 0 || credits > MAX_CREDITS) {
      errors.credits = `Credits phải là số nguyên từ 0 đến ${MAX_CREDITS.toLocaleString('vi-VN')}.`;
    }
  }

  return errors;
}

export default function AdminUserEditModal({ profile, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => getInitialForm(profile));
  const [pendingChanges, setPendingChanges] = useState(null);
  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const changes = getChanges(profile, form);
  const hasChanges = Object.keys(changes).length > 0;
  const name = getProfileName(profile);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();

    if (hasErrors || !hasChanges) {
      return;
    }

    if (isSensitiveChange(profile, changes)) {
      setPendingChanges(changes);
      return;
    }

    onSave(changes);
  }

  if (pendingChanges) {
    const isPromotion = pendingChanges.role === 'admin';
    const isSuspension = pendingChanges.status === 'suspended';

    return (
      <AdminDialog title="Xác nhận thay đổi quan trọng" onClose={() => setPendingChanges(null)} busy={saving}>
        <div className={us.warningBox}>
          <FaTriangleExclamation aria-hidden="true" />
          <div>
            {isPromotion && <p><strong>{name}</strong> sẽ có toàn quyền quản trị: xem và sửa mọi người dùng, báo giá và dữ liệu.</p>}
            {pendingChanges.role === 'user' && <p><strong>{name}</strong> sẽ mất quyền quản trị.</p>}
            {isSuspension && <p><strong>{name}</strong> sẽ không thể dùng các trang cần đăng nhập và các tính năng báo giá.</p>}
          </div>
        </div>
        <ChangeList profile={profile} changes={pendingChanges} />
        <div className={styles.modalActions}>
          <button type="button" onClick={() => setPendingChanges(null)} disabled={saving}>Quay lại</button>
          <button
            type="button"
            className={isSuspension || isPromotion ? styles.dangerButton : styles.primary}
            onClick={() => onSave(pendingChanges)}
            disabled={saving}
            data-dialog-initial
          >
            {saving ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </AdminDialog>
    );
  }

  return (
    <AdminDialog title={`Chỉnh sửa: ${name}`} onClose={onCancel} busy={saving}>
      <form onSubmit={submit} noValidate>
        <div className={us.formGrid}>
          <label className={styles.modalField}>
            Vai trò
            <select value={form.role} onChange={(event) => updateField('role', event.target.value)}>
              {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className={styles.modalField}>
            Trạng thái tài khoản
            <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className={styles.modalField}>
            Gói
            <input
              type="text"
              list="admin-plan-suggestions"
              value={form.plan}
              onChange={(event) => updateField('plan', event.target.value)}
              aria-invalid={Boolean(errors.plan)}
              aria-describedby={errors.plan ? 'admin-plan-error' : undefined}
              placeholder="free"
            />
            <datalist id="admin-plan-suggestions">
              {PLAN_SUGGESTIONS.map((plan) => <option key={plan} value={plan} />)}
            </datalist>
            {errors.plan && <span id="admin-plan-error" className={us.fieldError}>{errors.plan}</span>}
          </label>

          <label className={styles.modalField}>
            Credits
            <input
              type="number"
              min="0"
              max={MAX_CREDITS}
              step="1"
              inputMode="numeric"
              value={form.credits}
              onChange={(event) => updateField('credits', event.target.value)}
              aria-invalid={Boolean(errors.credits)}
              aria-describedby={errors.credits ? 'admin-credits-error' : undefined}
            />
            {errors.credits && <span id="admin-credits-error" className={us.fieldError}>{errors.credits}</span>}
          </label>
        </div>

        <label className={styles.modalCheckbox}>
          <input
            type="checkbox"
            checked={form.is_verified}
            onChange={(event) => updateField('is_verified', event.target.checked)}
          />
          Đã xác minh
        </label>

        {hasChanges && <ChangeList profile={profile} changes={changes} />}

        <div className={styles.modalActions}>
          <button type="button" onClick={onCancel} disabled={saving}>Hủy</button>
          <button type="submit" className={styles.primary} disabled={saving || hasErrors || !hasChanges}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function ChangeList({ profile, changes }) {
  return (
    <ul className={us.changeList} aria-label="Các thay đổi">
      {Object.entries(changes).map(([field, value]) => (
        <li key={field}>
          <span>{getChangeFieldLabel(field)}</span>
          <span>
            {formatChangeValue(field, profile[field] ?? (field === 'role' ? 'user' : field === 'status' ? 'active' : null))}
            {' → '}
            <strong>{formatChangeValue(field, value)}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}
