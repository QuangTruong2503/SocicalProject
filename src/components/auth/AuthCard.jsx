import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import AuthField from './AuthField.jsx';
import AuthToast from './AuthToast.jsx';
import SuccessOverlay from './SuccessOverlay.jsx';
import { normalizeLocalPath } from '../../utils/authRedirect.js';

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
  const location = useLocation();
  const { login, signup, loginWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [errors, setErrors] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const returnTarget = normalizeLocalPath(location.state?.from, '/dashboard');
  const isSubmitting = Boolean(pendingAction);

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

  function getSubmitLabel(action, fallback) {
    if (pendingAction === action) {
      return (
        <>
          <span className="auth-spinner"></span>
          Đang xử lý...
        </>
      );
    }

    return fallback;
  }

  function validateRegisterForm() {
    const nextErrors = {};

    if (registerForm.username.trim().length < 3) {
      nextErrors.username = 'Username phải có ít nhất 3 ký tự.';
    }

    if (!validateEmail(registerForm.email)) {
      nextErrors.email = 'Email không đúng định dạng.';
    }

    if (registerForm.password.length < 6) {
      nextErrors.password = 'Password phải có ít nhất 6 ký tự.';
    }

    if (registerForm.confirmPassword !== registerForm.password) {
      nextErrors.confirmPassword = 'Confirm password không khớp.';
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

    setPendingAction('register');
    setErrors({});

    const result = await signup({
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
      username: registerForm.username.trim(),
    });

    if (result.error) {
      setPendingAction(null);
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
        ? 'Đăng ký thành công. Thông báo kích hoạt đã được gửi tới email.'
        : 'Tài khoản đã được tạo và phiên đăng nhập đã sẵn sàng.',
    });

    window.setTimeout(() => {
      setShowSuccess(false);
      setRegisterForm(initialRegisterState);
      clearStateForTab('login');
      setPendingAction(null);

      if (!result.data?.requiresEmailConfirmation && result.data?.session) {
        navigate(returnTarget, { replace: true });
      }
    }, 1100);
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    if (!validateLoginForm()) {
      return;
    }

    setPendingAction('login');
    setErrors({});

    const result = await login({
      email: loginForm.email.trim().toLowerCase(),
      password: loginForm.password,
    });

    if (result.error) {
      setPendingAction(null);
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
      setPendingAction(null);
      navigate(returnTarget, { replace: true });
    }, 900);
  }

  async function handleGoogleLogin() {
    setPendingAction('google');
    setErrors({});

    const result = await loginWithGoogle(returnTarget);

    if (result.error) {
      setPendingAction(null);
      setErrors({ global: result.error });
      triggerShake();
    }
  }

  function renderGoogleButton() {
    return (
      <button
        type="button"
        className="auth-oauth-btn"
        onClick={handleGoogleLogin}
        disabled={isSubmitting}
      >
        <span className="auth-google-mark" aria-hidden="true">
          <span className="auth-google-mark-blue">G</span>
        </span>
        {pendingAction === 'google' ? (
          <>
            <span className="auth-spinner auth-spinner-dark"></span>
            Đang mở Google...
          </>
        ) : (
          'Continue with Google'
        )}
      </button>
    );
  }

  return (
    <>
      <AuthToast toast={toast} />

      <div className={`auth-card auth-appear ${isShaking ? 'auth-shake' : ''}`}>
        <div className="auth-card-header">
          <span className="auth-chip">ZepLao Account</span>
          <h1>{activeTab === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h1>
          <p>
            {activeTab === 'login'
              ? 'Tiếp tục vào dashboard và các công cụ cá nhân của bạn.'
              : 'Bắt đầu đồng bộ dữ liệu, hồ sơ và phiên làm việc an toàn.'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication tabs">
          <button
            type="button"
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => clearStateForTab('login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => clearStateForTab('register')}
          >
            Đăng ký
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
                {renderGoogleButton()}

                <div className="auth-divider">
                  <span>or continue with email</span>
                </div>

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
                  {getSubmitLabel('login', 'Đăng nhập')}
                </button>

                <p className="auth-footnote">
                  Bằng việc tiếp tục, bạn đồng ý với quy trình xác thực và bảo mật của hệ thống.
                </p>
              </form>
            </section>

            <section className="auth-form-panel">
              <form className="auth-form" onSubmit={handleRegisterSubmit}>
                {renderGoogleButton()}

                <div className="auth-divider">
                  <span>or continue with email</span>
                </div>

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
                  {getSubmitLabel('register', 'Tạo tài khoản')}
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
