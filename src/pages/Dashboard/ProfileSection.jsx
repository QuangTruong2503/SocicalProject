import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import AccountInfoPanel from './AccountInfoPanel.jsx';
import styles from './Dashboard.module.css';

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getInitialForm(profile, user) {
  return {
    username: profile?.username || user?.user_metadata?.username || '',
    full_name: profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    email: profile?.email || user?.email || '',
    phone: profile?.phone || '',
    bio: profile?.bio || '',
    date_of_birth: profile?.date_of_birth || '',
    gender: profile?.gender || '',
    country: profile?.country || '',
    city: profile?.city || '',
    address: profile?.address || '',
    avatar_url: profile?.avatar_url || '',
  };
}

export default function ProfileSection() {
  const { user, profile } = useAuth();
  const [message, setMessage] = useState('');
  const [saveCount, setSaveCount] = useState(0);

  return (
    <div className="dashboard-panels">
      <section className="dashboard-panel dashboard-profile-panel">
        <div className="dashboard-panel-head">
          <div>
            <span className="dashboard-panel-kicker">Hồ sơ cá nhân</span>
            <h3>Cập nhật thông tin cá nhân</h3>
          </div>
        </div>

        {/*
          Remount only when the profile first loads, the account changes, or after a save.
          Token refreshes hand us a new profile object with the same data and must not wipe
          what the user is typing.
        */}
        <ProfileForm
          key={`${profile?.id ?? 'pending'}:${saveCount}`}
          profile={profile}
          user={user}
          message={message}
          onMessage={setMessage}
          onSaved={() => {
            setMessage('Thông tin cá nhân đã được cập nhật.');
            setSaveCount((count) => count + 1);
          }}
        />
      </section>

      <AccountInfoPanel />
    </div>
  );
}

function ProfileForm({ profile, user, message, onMessage, onSaved }) {
  const { updateProfile, latestUpload } = useAuth();
  const [initialForm] = useState(() => getInitialForm(profile, user));
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isDirty = Object.keys(form).some((key) => form[key] !== initialForm[key]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    onMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextEmail = form.email.trim().toLowerCase();

    if (!validateEmail(nextEmail)) {
      setError('Email không đúng định dạng.');
      return;
    }

    if (form.username.trim() && form.username.trim().length < 3) {
      setError('Tên đăng nhập phải có ít nhất 3 ký tự.');
      return;
    }

    setIsSaving(true);
    setError('');
    onMessage('');

    const result = await updateProfile({
      username: form.username.trim() || null,
      full_name: form.full_name.trim() || null,
      email: nextEmail,
      phone: form.phone.trim() || null,
      bio: form.bio.trim() || null,
      date_of_birth: form.date_of_birth || null,
      gender: form.gender || null,
      country: form.country.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    });

    setIsSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onSaved();
  }

  const field = (name) => ({
    value: form[name],
    onChange: (event) => updateField(name, event.target.value),
    disabled: isSaving,
  });

  return (
    <form className="dashboard-form" onSubmit={handleSubmit}>
      <div className="dashboard-form-grid">
        <label className="dashboard-form-field">
          <span>Tên đăng nhập</span>
          <input type="text" autoComplete="username" {...field('username')} />
        </label>

        <label className="dashboard-form-field">
          <span>Họ tên</span>
          <input type="text" autoComplete="name" {...field('full_name')} />
        </label>

        <label className="dashboard-form-field">
          <span>Email hiển thị</span>
          <input type="email" autoComplete="email" {...field('email')} />
        </label>

        <label className="dashboard-form-field">
          <span>Số điện thoại</span>
          <input type="tel" autoComplete="tel" {...field('phone')} />
        </label>

        <label className="dashboard-form-field">
          <span>Ngày sinh</span>
          <input type="date" {...field('date_of_birth')} />
        </label>

        <label className="dashboard-form-field">
          <span>Giới tính</span>
          <select {...field('gender')}>
            <option value="">Chưa chọn</option>
            <option value="female">Nữ</option>
            <option value="male">Nam</option>
            <option value="other">Khác</option>
            <option value="prefer_not_to_say">Không muốn chia sẻ</option>
          </select>
        </label>

        <label className="dashboard-form-field">
          <span>Quốc gia</span>
          <input type="text" autoComplete="country-name" {...field('country')} />
        </label>

        <label className="dashboard-form-field">
          <span>Thành phố</span>
          <input type="text" autoComplete="address-level2" {...field('city')} />
        </label>
      </div>

      <label className="dashboard-form-field">
        <span>Địa chỉ</span>
        <input type="text" autoComplete="street-address" {...field('address')} />
      </label>

      <label className="dashboard-form-field">
        <span>URL ảnh đại diện</span>
        <input type="url" placeholder="https://..." aria-describedby="profile-avatar-url-hint" {...field('avatar_url')} />
        <small id="profile-avatar-url-hint" className={styles.fieldHint}>
          {latestUpload?.image_url
            ? 'Bạn đã có ảnh tải lên, nên ảnh tải lên mới nhất đang được dùng làm avatar. URL này chỉ dùng khi bạn xóa hết ảnh đã tải lên.'
            : 'Dùng làm avatar khi bạn chưa tải ảnh nào lên. Ảnh tải lên luôn được ưu tiên.'}
        </small>
      </label>

      <label className="dashboard-form-field">
        <span>Giới thiệu</span>
        <textarea rows={4} maxLength={500} {...field('bio')} />
      </label>

      {error && <div className="dashboard-inline-error" role="alert">{error}</div>}
      {message && !isDirty && <div className="dashboard-inline-success" role="status">{message}</div>}

      <div className="dashboard-panel-actions">
        <button
          type="button"
          className="dashboard-ghost-btn"
          onClick={() => { setForm(initialForm); setError(''); }}
          disabled={isSaving || !isDirty}
        >
          Hoàn tác
        </button>
        <button type="submit" className="dashboard-solid-btn" disabled={isSaving || !isDirty}>
          {isSaving ? 'Đang lưu...' : 'Lưu hồ sơ'}
        </button>
      </div>
    </form>
  );
}
