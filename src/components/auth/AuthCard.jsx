import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import AuthField from './AuthField.jsx';
import AuthToast from './AuthToast.jsx';
import SuccessOverlay from './SuccessOverlay.jsx';

const initialLoginState = {
  email: '',
  password: '',
};

const initialRegisterState = {
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthCard() {
  const navigate = useNavigate();
  const { login, signup, loginWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const registerFields = useMemo(() => ([
    {
      id: 'register-username',
      label: 'Username',
      value: registerForm.username,
      error: errors.username,
      autoComplete: 'username',
      onChange: (event) => {
        setRegisterForm((prev) => ({ ...prev, username: event.target.value }));
      },
    },
    {
      id: 'register-email',
      label: 'Email',
      value: registerForm.email,
      error: errors.email,
      type: 'email',
      autoComplete: 'email',
      onChange: (event) => {
        setRegisterForm((prev) => ({ ...prev, email: event.target.value }));
      },
    },
    {
      id: 'register-password',
      label: 'Password',
      value: registerForm.password,
      error: errors.password,
      autoComplete: 'new-password',
      showPasswordToggle: true,
      isPasswordVisible: showRegisterPassword,
      onTogglePassword: () => setShowRegisterPassword((prev) => !prev),
      onChange: (event) => {
        setRegisterForm((prev) => ({ ...prev, password: event.target.value }));
      },
    },
    {
      id: 'register-confirm-password',
      label: 'Confirm Password',
      value: registerForm.confirmPassword,
      error: errors.confirmPassword,
      autoComplete: 'new-password',
      showPasswordToggle: true,
      isPasswordVisible: showRegisterConfirmPassword,
      onTogglePassword: () => setShowRegisterConfirmPassword((prev) => !prev),
      onChange: (event) => {
        setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }));
      },
    },
  ]), [errors.confirmPassword, errors.email, errors.password, errors.username, registerForm, showRegisterConfirmPassword, showRegisterPassword]);

  function triggerShake() {
    setIsShaking(false);

    window.requestAnimationFrame(() => {
      setIsShaking(true);
    });

    window.setTimeout(() => {
      setIsShaking(false);
    }, 520);
  }

  function clearStateForTab(nextTab) {
    setActiveTab(nextTab);
    setErrors({});
    setIsShaking(false);
    setShowSuccess(false);
  }

  function validateRegisterForm() {
    const nextErrors = {};

    if (registerForm.username.trim().length < 3) {
      nextErrors.username = 'Username phai co it nhat 3 ky tu.';
    }

    if (!validateEmail(registerForm.email)) {
      nextErrors.email = 'Email khong dung dinh dang.';
    }

    if (registerForm.password.length < 6) {
      nextErrors.password = 'Password phai co it nhat 6 ky tu.';
    }

    if (registerForm.confirmPassword !== registerForm.password) {
      nextErrors.confirmPassword = 'Confirm password khong khop.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      triggerShake();
      return false;
    }

    return true;
  }

  function validateLoginForm() {
    const nextErrors = {};

    if (!validateEmail(loginForm.email)) {
      nextErrors.email = 'Email không đúng định dạng.';
    }

    if (loginForm.password.length < 6) {
      nextErrors.password = 'Password phải có ít nhất 6 ký tự.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      triggerShake();
      return false;
    }

    return true;
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();

    if (!validateRegisterForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const result = await signup({
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
      username: registerForm.username.trim(),
    });

    if (result.error) {
      setIsSubmitting(false);
      setErrors({ global: result.error });
      triggerShake();
      return;
    }

    setSuccessMessage('Đăng ký thành công');
    setShowSuccess(true);
    setToast({
      type: 'success',
      title: 'Đăng ký thành công',
      message: result.data?.requiresEmailConfirmation
        ? 'Tai khoan da duoc tao. Vui long kiem tra email de xac thuc truoc khi dang nhap.'
        : 'Tai khoan da duoc tao va phien dang nhap da san sang.',
    });

    window.setTimeout(() => {
      setShowSuccess(false);
      setRegisterForm(initialRegisterState);
      clearStateForTab('login');
      setIsSubmitting(false);
    }, 1100);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    if (!validateLoginForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const result = await login({
      email: loginForm.email.trim().toLowerCase(),
      password: loginForm.password,
    });

    if (result.error) {
      setIsSubmitting(false);
      setErrors({ global: result.error });
      triggerShake();
      return;
    }

    setSuccessMessage('Đăng nhập thành công');
    setShowSuccess(true);
    setToast({
      type: 'success',
      title: 'Xin chào!',
      message: 'Bạn đã đăng nhập thành công.',
    });

    window.setTimeout(() => {
      setShowSuccess(false);
      setIsSubmitting(false);
      navigate('/dashboard', { replace: true });
    }, 900);
  }

  async function handleGoogleLogin() {
    setIsSubmitting(true);
    setErrors({});

    const result = await loginWithGoogle();

    if (result.error) {
      setIsSubmitting(false);
      setErrors({ global: result.error });
      triggerShake();
    }
  }

  return (
    <>
      <AuthToast toast={toast} />

      <div className={`auth-card auth-appear ${isShaking ? 'auth-shake' : ''}`}>
        <div className="auth-card-glow"></div>
        <div className="auth-particles" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div className="auth-card-header">
          <span className="auth-chip">ZepLao Account</span>
          <h1>{activeTab === 'login' ? 'Chào mừng bạn trở lại' : 'Tạo tài khoản mới'}</h1>
          <p>
            {activeTab === 'login'
              ? 'Đăng nhập để tiếp tục làm việc với dashboard và các công cụ của bạn.'
              : 'Đăng ký tài khoản để đồng bộ dữ liệu và bắt đầu sử dụng hệ thống.'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication tabs">
          <button
            type="button"
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => clearStateForTab('login')}
          >
            Dang nhap
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => clearStateForTab('register')}
          >
            Dang ky
          </button>
          <div className={`auth-tab-indicator ${activeTab === 'register' ? 'register' : 'login'}`}></div>
        </div>

        <div className={`auth-global-error ${errors.global ? 'visible' : ''}`}>
          {errors.global || ' '}
        </div>

        <div className={`auth-form-slider ${activeTab === 'register' ? 'register-active' : 'login-active'}`}>
          <div className="auth-form-track">
            <section className="auth-form-panel">
              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <AuthField
                  id="login-email"
                  label="Email"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  error={errors.email}
                  disabled={isSubmitting}
                  autoComplete="email"
                />

                <AuthField
                  id="login-password"
                  label="Password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  error={errors.password}
                  disabled={isSubmitting}
                  autoComplete="current-password"
                  showPasswordToggle
                  isPasswordVisible={showLoginPassword}
                  onTogglePassword={() => setShowLoginPassword((prev) => !prev)}
                />

                <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="auth-spinner"></span>
                      Đang xử lý...
                    </>
                  ) : (
                    'Đăng nhập'
                  )}
                </button>

                <button
                  type="button"
                  className="auth-oauth-btn"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                >
                  <span className="auth-oauth-icon">G</span>
                  Đăng nhập bằng Google
                </button>

                <p className="auth-footnote">
                  Bằng việc tiếp tục, bạn đồng ý với quy trình xác thực và bảo mật của hệ thống.
                </p>
              </form>
            </section>

            <section className="auth-form-panel">
              <form className="auth-form" onSubmit={handleRegisterSubmit}>
                {registerFields.map((field) => (
                  <AuthField
                    key={field.id}
                    id={field.id}
                    label={field.label}
                    type={field.type}
                    value={field.value}
                    onChange={field.onChange}
                    error={field.error}
                    disabled={isSubmitting}
                    autoComplete={field.autoComplete}
                    showPasswordToggle={field.showPasswordToggle}
                    isPasswordVisible={field.isPasswordVisible}
                    onTogglePassword={field.onTogglePassword}
                  />
                ))}

                <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="auth-spinner"></span>
                      Đang xử lý...
                    </>
                  ) : (
                    'Tạo tài khoản'
                  )}
                </button>

                <p className="auth-footnote">
                  Sau khi đăng ký, bạn có thể cần xác thực email trước khi đăng nhập.
                </p>
              </form>
            </section>
          </div>
        </div>

        <SuccessOverlay visible={showSuccess} message={successMessage} />
      </div>
    </>
  );
}
