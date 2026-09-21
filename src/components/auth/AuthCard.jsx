import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { FiArrowRight, FiMail } from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth.js';
import AuthField from './AuthField.jsx';
import { getAuthReturnPath } from '../../utils/authRedirect.js';
import { validateAuthForm } from '../../utils/authValidation.js';

const emptyForm = { username: '', email: '', password: '', confirmPassword: '' };

export default function AuthCard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState(() => ({ global: location.state?.authNotice }));
  const [pending, setPending] = useState(null);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const requestInFlight = useRef(false);
  const formRef = useRef(null);
  const isRegister = mode === 'register';
  const returnTarget = getAuthReturnPath(location);

  function changeMode(nextMode) {
    if (requestInFlight.current || mode === nextMode) return;
    setMode(nextMode);
    setErrors({});
    setVisiblePasswords({});
    setForm((previous) => ({ ...emptyForm, email: previous.email }));
  }

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined, global: undefined,
      ...(key === 'password' ? { confirmPassword: undefined } : {}),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (requestInFlight.current) return;
    const nextErrors = validateAuthForm(mode, form);
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      formRef.current?.elements.namedItem(firstInvalid)?.focus();
      return;
    }
    requestInFlight.current = true;
    setPending(mode);
    setConfirmationEmail('');
    try {
      const payload = { email: form.email.trim().toLowerCase(), password: form.password,
        username: form.username.trim(), redirectPath: returnTarget };
      const result = await (isRegister ? signup(payload) : login(payload));
      if (result.error) {
        setErrors({ global: result.error });
      } else if (result.data?.session) {
        navigate(returnTarget, { replace: true });
      } else if (isRegister && result.data?.requiresEmailConfirmation) {
        setConfirmationEmail(payload.email);
        setForm({ ...emptyForm, email: payload.email });
        setMode('login');
        setVisiblePasswords({});
      } else {
        setErrors({ global: 'Chưa thể hoàn tất đăng nhập. Vui lòng thử lại.' });
      }
    } catch {
      setErrors({ global: 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.' });
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }

  async function googleLogin() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending('google');
    setErrors({});
    try {
      const result = await loginWithGoogle(returnTarget);
      if (result.error) setErrors({ global: result.error });
    } catch {
      setErrors({ global: 'Không thể mở Google. Vui lòng thử lại.' });
    } finally {
      requestInFlight.current = false;
      setPending(null);
    }
  }

  function field(key, label, options = {}) {
    return <AuthField key={key} id={mode + '-' + key} name={key} label={label}
      value={form[key]} onChange={(event) => updateField(key, event.target.value)}
      error={errors[key]} disabled={Boolean(pending)}
      isPasswordVisible={Boolean(visiblePasswords[key])}
      onTogglePassword={() => setVisiblePasswords((previous) => ({ ...previous, [key]: !previous[key] }))}
      {...options} />;
  }

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <span className="auth-eyebrow">KHÔNG GIAN LÀM VIỆC CỦA BẠN</span>
        <h1>{isRegister ? 'Bắt đầu cùng AISEO' : 'Chào mừng trở lại'}</h1>
        <p>{isRegister ? 'Tạo tài khoản để sử dụng các công cụ yêu thích.' : 'Đăng nhập để tiếp tục công việc của bạn.'}</p>
      </div>

      {confirmationEmail && <div className="auth-confirmation" role="status">
        <FiMail aria-hidden="true" />
        <div><strong>Kiểm tra hộp thư của bạn</strong>
          <p>Nếu email <b>{confirmationEmail}</b> đủ điều kiện đăng ký, bạn sẽ nhận được liên kết xác nhận. Mở liên kết rồi quay lại đăng nhập. Hãy kiểm tra cả thư rác.</p>
        </div>
      </div>}

      <div className="auth-tabs" role="tablist" aria-label="Chọn đăng nhập hoặc đăng ký">
        {['login', 'register'].map((tab) => (
          <button key={tab} id={'auth-tab-' + tab} type="button" role="tab"
            aria-selected={mode === tab} aria-controls="auth-form-panel"
            tabIndex={mode === tab ? 0 : -1} disabled={Boolean(pending)}
            className={'auth-tab ' + (mode === tab ? 'active' : '')}
            onClick={() => changeMode(tab)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : mode === 'login' ? 'register' : 'login';
              changeMode(next);
              document.getElementById('auth-tab-' + next)?.focus();
            }}>
            {tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        ))}
      </div>

      <section id="auth-form-panel" role="tabpanel" aria-labelledby={'auth-tab-' + mode} aria-busy={Boolean(pending)}>
        <button type="button" className="auth-oauth-btn" onClick={googleLogin} disabled={Boolean(pending)}>
          <FcGoogle size={22} aria-hidden="true" />
          {pending === 'google' ? 'Đang mở Google…' : 'Tiếp tục với Google'}
        </button>
        <div className="auth-divider"><span>hoặc tiếp tục với email</span></div>
        {errors.global && <div className="auth-global-error visible" role="alert">{errors.global}</div>}
        <form ref={formRef} className="auth-form" onSubmit={submit} noValidate>
          {isRegister && field('username', 'Tên hiển thị', { autoComplete: 'nickname', hint: 'Ít nhất 3 ký tự.' })}
          {field('email', 'Địa chỉ email', { type: 'email', autoComplete: 'email', placeholder: 'ban@example.com' })}
          {field('password', 'Mật khẩu', { autoComplete: isRegister ? 'new-password' : 'current-password', showPasswordToggle: true,
            hint: isRegister ? 'Ít nhất 6 ký tự. Nên kết hợp chữ, số và ký hiệu.' : undefined })}
          {isRegister && field('confirmPassword', 'Nhập lại mật khẩu', { autoComplete: 'new-password', showPasswordToggle: true })}
          <button type="submit" className="auth-submit-btn" disabled={Boolean(pending)}>
            {pending === mode ? <><span className="auth-spinner" aria-hidden="true" />Đang xử lý…</> :
              <>{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}<FiArrowRight aria-hidden="true" /></>}
          </button>
        </form>
        <p className="auth-switch-copy">{isRegister ? 'Đã có tài khoản?' : 'Bạn mới đến AISEO?'}{' '}
          <button type="button" disabled={Boolean(pending)} onClick={() => changeMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Đăng nhập' : 'Tạo tài khoản ngay'}
          </button>
        </p>
      </section>
    </div>
  );
}
