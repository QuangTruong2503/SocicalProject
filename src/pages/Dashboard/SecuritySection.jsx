import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import AccountInfoPanel from './AccountInfoPanel.jsx';
import { getAuthProviderLabel } from './dashboardLabels.js';

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function SecuritySection() {
  const { user, updatePassword } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (form.newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSaving(true);
    setError('');
    setMessage('');

    const result = await updatePassword({
      password: form.newPassword,
      currentPassword: form.currentPassword || undefined,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setForm(EMPTY_FORM);
    setMessage('Mật khẩu đã được cập nhật. Lần sau bạn có thể đăng nhập bằng email và mật khẩu.');
  }

  return (
    <div className="dashboard-panels">
      <section className="dashboard-panel dashboard-security-panel">
        <div className="dashboard-panel-head">
          <div>
            <span className="dashboard-panel-kicker">Bảo mật</span>
            <h3>Đổi mật khẩu</h3>
          </div>
          <span className="dashboard-panel-chip">{getAuthProviderLabel(user)}</span>
        </div>

        <form className="dashboard-form" onSubmit={handleSubmit}>
          <p className="dashboard-panel-note">
            Tài khoản Google vẫn có thể đặt mật khẩu để đăng nhập bằng email ở những lần sau.
            Nếu trước đó bạn chưa có mật khẩu, hãy để trống ô mật khẩu hiện tại.
          </p>

          <label className="dashboard-form-field">
            <span>Mật khẩu hiện tại</span>
            <input
              type="password"
              value={form.currentPassword}
              onChange={(event) => updateField('currentPassword', event.target.value)}
              disabled={isSaving}
              autoComplete="current-password"
              placeholder="Bỏ trống nếu đăng nhập Google"
            />
          </label>

          <label className="dashboard-form-field">
            <span>Mật khẩu mới</span>
            <input
              type="password"
              value={form.newPassword}
              onChange={(event) => updateField('newPassword', event.target.value)}
              disabled={isSaving}
              autoComplete="new-password"
              minLength={8}
            />
          </label>

          <label className="dashboard-form-field">
            <span>Xác nhận mật khẩu mới</span>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField('confirmPassword', event.target.value)}
              disabled={isSaving}
              autoComplete="new-password"
            />
          </label>

          {error && <div className="dashboard-inline-error" role="alert">{error}</div>}
          {message && <div className="dashboard-inline-success" role="status">{message}</div>}

          <div className="dashboard-panel-actions">
            <button type="submit" className="dashboard-solid-btn" disabled={isSaving || !form.newPassword}>
              {isSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </section>

      <AccountInfoPanel />
    </div>
  );
}
