import React, { useState, useRef } from 'react';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { registerUser, loginUser } from '../api/authService';
import 'bootstrap/dist/css/bootstrap.min.css';

const AuthForm = ({ onSuccess, onClose }) => {
    const [activeTab, setActiveTab] = useState('login');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const toastRef = useRef(null);

    // Form states
    const [loginForm, setLoginForm] = useState({
        identifier: '',
        password: ''
    });

    const [registerForm, setRegisterForm] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        full_name: ''
    });

    const [errors, setErrors] = useState({});

    // Validation functions
    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const validateLoginForm = () => {
        const newErrors = {};

        if (!loginForm.identifier.trim()) {
            newErrors.identifier = 'Username hoặc email là bắt buộc';
        }

        if (!loginForm.password) {
            newErrors.password = 'Mật khẩu là bắt buộc';
        } else if (loginForm.password.length < 6) {
            newErrors.password = 'Mật khẩu phải ít nhất 6 ký tự';
        }

        return newErrors;
    };

    const validateRegisterForm = () => {
        const newErrors = {};

        if (!registerForm.username.trim()) {
            newErrors.username = 'Tên đăng nhập là bắt buộc';
        } else if (registerForm.username.length < 3) {
            newErrors.username = 'Tên đăng nhập phải ít nhất 3 ký tự';
        }

        if (!registerForm.email.trim()) {
            newErrors.email = 'Email là bắt buộc';
        } else if (!validateEmail(registerForm.email)) {
            newErrors.email = 'Email không hợp lệ';
        }

        if (!registerForm.password) {
            newErrors.password = 'Mật khẩu là bắt buộc';
        } else if (registerForm.password.length < 6) {
            newErrors.password = 'Mật khẩu phải ít nhất 6 ký tự';
        }

        if (registerForm.password !== registerForm.confirmPassword) {
            newErrors.confirmPassword = 'Mật khẩu không khớp';
        }

        return newErrors;
    };

    // Toast notification
    const showToast = (message, type = 'success') => {
        const toastContent = document.createElement('div');
        toastContent.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
        toastContent.role = 'alert';
        toastContent.innerHTML = `
            <strong>${type === 'error' ? 'Lỗi!' : 'Thành công!'}</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;

        const container = document.getElementById('toast-container') || createToastContainer();
        container.appendChild(toastContent);

        // Auto remove after 5s
        setTimeout(() => {
            toastContent.remove();
        }, 5000);
    };

    const createToastContainer = () => {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        return container;
    };

    // Handle login
    const handleLogin = async (e) => {
        e.preventDefault();
        const newErrors = validateLoginForm();

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        setLoading(true);

        try {
            const isEmail = loginForm.identifier.includes('@');
            const result = await loginUser({
                username: isEmail ? null : loginForm.identifier,
                email: isEmail ? loginForm.identifier : null,
                password: loginForm.password
            });

            if (result.success) {
                showToast('Đăng nhập thành công!', 'success');
                if (onSuccess) {
                    onSuccess(result.data.user);
                }
                // Reset form
                setLoginForm({ identifier: '', password: '' });
                if (onClose) {
                    setTimeout(() => onClose(), 1500);
                }
            } else {
                showToast(result.error, 'error');
            }
        } catch (error) {
            showToast('Lỗi server: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Handle register
    const handleRegister = async (e) => {
        e.preventDefault();
        const newErrors = validateRegisterForm();

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        setLoading(true);

        try {
            const result = await registerUser({
                username: registerForm.username,
                email: registerForm.email,
                password: registerForm.password,
                full_name: registerForm.full_name || null
            });

            if (result.success) {
                showToast('Đăng ký thành công! Vui lòng đăng nhập.', 'success');
                // Reset and switch to login
                setRegisterForm({
                    username: '',
                    email: '',
                    password: '',
                    confirmPassword: '',
                    full_name: ''
                });
                setActiveTab('login');
            } else {
                showToast(result.error, 'error');
            }
        } catch (error) {
            showToast('Lỗi server: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '450px' }}>
            <div className="modal-content border-0 shadow-lg">
                {/* Header */}
                <div className="modal-header border-0 bg-gradient pt-4 pb-3 px-4">
                    <div className="w-100">
                        <h5 className="modal-title fw-bold mb-3">Tài khoản của bạn</h5>
                        <ul className="nav nav-tabs border-0" role="tablist">
                            <li className="nav-item" role="presentation">
                                <button
                                    className={`nav-link fw-600 ${activeTab === 'login' ? 'active border-bottom border-primary' : ''}`}
                                    onClick={() => setActiveTab('login')}
                                    style={{
                                        borderBottom: activeTab === 'login' ? '3px solid #0d6efd' : 'none',
                                        background: 'transparent'
                                    }}
                                >
                                    Đăng nhập
                                </button>
                            </li>
                            <li className="nav-item ms-3" role="presentation">
                                <button
                                    className={`nav-link fw-600 ${activeTab === 'register' ? 'active border-bottom border-primary' : ''}`}
                                    onClick={() => setActiveTab('register')}
                                    style={{
                                        borderBottom: activeTab === 'register' ? '3px solid #0d6efd' : 'none',
                                        background: 'transparent'
                                    }}
                                >
                                    Đăng ký
                                </button>
                            </li>
                        </ul>
                    </div>
                    {onClose && (
                        <button
                            type="button"
                            className="btn-close"
                            onClick={onClose}
                            aria-label="Close"
                        />
                    )}
                </div>

                {/* Body */}
                <div className="modal-body p-4">
                    {/* LOGIN FORM */}
                    {activeTab === 'login' && (
                        <form onSubmit={handleLogin}>
                            <div className="mb-3">
                                <label htmlFor="loginIdentifier" className="form-label fw-500">
                                    <Mail size={16} className="me-2" style={{ display: 'inline' }} />
                                    Username hoặc Email
                                </label>
                                <input
                                    type="text"
                                    className={`form-control form-control-lg ${errors.identifier ? 'is-invalid' : ''}`}
                                    id="loginIdentifier"
                                    placeholder="Nhập username hoặc email"
                                    value={loginForm.identifier}
                                    onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                                    disabled={loading}
                                />
                                {errors.identifier && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.identifier}
                                    </div>
                                )}
                            </div>

                            <div className="mb-3">
                                <label htmlFor="loginPassword" className="form-label fw-500">
                                    <Lock size={16} className="me-2" style={{ display: 'inline' }} />
                                    Mật khẩu
                                </label>
                                <div className="input-group">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={`form-control form-control-lg ${errors.password ? 'is-invalid' : ''}`}
                                        id="loginPassword"
                                        placeholder="Nhập mật khẩu"
                                        value={loginForm.password}
                                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={() => setShowPassword(!showPassword)}
                                        disabled={loading}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.password}
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-100 fw-600"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                        Đang đăng nhập...
                                    </>
                                ) : (
                                    'Đăng nhập'
                                )}
                            </button>

                            <div className="text-center mt-3 text-muted small">
                                Quên mật khẩu? <a href="#" className="text-primary text-decoration-none fw-600">Nhấn vào đây</a>
                            </div>
                        </form>
                    )}

                    {/* REGISTER FORM */}
                    {activeTab === 'register' && (
                        <form onSubmit={handleRegister}>
                            <div className="mb-3">
                                <label htmlFor="registerUsername" className="form-label fw-500">
                                    <User size={16} className="me-2" style={{ display: 'inline' }} />
                                    Tên đăng nhập
                                </label>
                                <input
                                    type="text"
                                    className={`form-control form-control-lg ${errors.username ? 'is-invalid' : ''}`}
                                    id="registerUsername"
                                    placeholder="Nhập tên đăng nhập"
                                    value={registerForm.username}
                                    onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                                    disabled={loading}
                                />
                                {errors.username && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.username}
                                    </div>
                                )}
                            </div>

                            <div className="mb-3">
                                <label htmlFor="registerEmail" className="form-label fw-500">
                                    <Mail size={16} className="me-2" style={{ display: 'inline' }} />
                                    Email
                                </label>
                                <input
                                    type="email"
                                    className={`form-control form-control-lg ${errors.email ? 'is-invalid' : ''}`}
                                    id="registerEmail"
                                    placeholder="Nhập email"
                                    value={registerForm.email}
                                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                                    disabled={loading}
                                />
                                {errors.email && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.email}
                                    </div>
                                )}
                            </div>

                            <div className="mb-3">
                                <label htmlFor="registerFullName" className="form-label fw-500">
                                    <User size={16} className="me-2" style={{ display: 'inline' }} />
                                    Họ và tên (tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    id="registerFullName"
                                    placeholder="Nhập họ và tên"
                                    value={registerForm.full_name}
                                    onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                                    disabled={loading}
                                />
                            </div>

                            <div className="mb-3">
                                <label htmlFor="registerPassword" className="form-label fw-500">
                                    <Lock size={16} className="me-2" style={{ display: 'inline' }} />
                                    Mật khẩu
                                </label>
                                <div className="input-group">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={`form-control form-control-lg ${errors.password ? 'is-invalid' : ''}`}
                                        id="registerPassword"
                                        placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
                                        value={registerForm.password}
                                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={() => setShowPassword(!showPassword)}
                                        disabled={loading}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {errors.password && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.password}
                                    </div>
                                )}
                            </div>

                            <div className="mb-3">
                                <label htmlFor="registerConfirmPassword" className="form-label fw-500">
                                    <Lock size={16} className="me-2" style={{ display: 'inline' }} />
                                    Xác nhận mật khẩu
                                </label>
                                <div className="input-group">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        className={`form-control form-control-lg ${errors.confirmPassword ? 'is-invalid' : ''}`}
                                        id="registerConfirmPassword"
                                        placeholder="Xác nhận mật khẩu"
                                        value={registerForm.confirmPassword}
                                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        disabled={loading}
                                    >
                                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {errors.confirmPassword && (
                                    <div className="invalid-feedback d-block">
                                        <AlertCircle size={14} className="me-1" style={{ display: 'inline' }} />
                                        {errors.confirmPassword}
                                    </div>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="btn btn-success btn-lg w-100 fw-600"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                        Đang đăng ký...
                                    </>
                                ) : (
                                    'Đăng ký'
                                )}
                            </button>

                            <div className="text-center mt-3 text-muted small">
                                Bằng cách đăng ký, bạn đồng ý với <a href="#" className="text-primary text-decoration-none">Điều khoản dịch vụ</a>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthForm;
