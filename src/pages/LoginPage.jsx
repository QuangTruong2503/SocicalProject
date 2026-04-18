import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, ArrowLeft, CheckCircle } from 'lucide-react';
import { loginUser } from '../api/authService';
import 'bootstrap/dist/css/bootstrap.min.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      navigate('/');
    }
  }, [navigate]);

  // Validation functions
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.identifier.trim()) {
      newErrors.identifier = 'Username hoặc email là bắt buộc';
    }

    if (!formData.password) {
      newErrors.password = 'Mật khẩu là bắt buộc';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Mật khẩu phải ít nhất 6 ký tự';
    }

    return newErrors;
  };

  // Show toast notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const isEmail = formData.identifier.includes('@');
      const result = await loginUser({
        username: isEmail ? null : formData.identifier,
        email: isEmail ? formData.identifier : null,
        password: formData.password
      });

      if (result.success) {
        showToast('Đăng nhập thành công!', 'success');

        // Redirect to intended page or home
        const from = location.state?.from?.pathname || '/';
        setTimeout(() => {
          navigate(from, { replace: true });
        }, 1500);
      } else {
        showToast(result.error, 'error');
      }
    } catch (error) {
      showToast('Lỗi server: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-gradient-primary">
      {/* Background Pattern */}
      <div className="position-absolute top-0 start-0 w-100 h-100 opacity-10">
        <div className="bg-pattern"></div>
      </div>

      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5">
            {/* Back Button */}
            <Link
              to="/"
              className="btn btn-link text-decoration-none mb-4 d-inline-flex align-items-center"
            >
              <ArrowLeft size={20} className="me-2" />
              Quay về trang chủ
            </Link>

            {/* Main Card */}
            <div className="card border-0 shadow-lg">
              <div className="card-body p-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="mb-3">
                    <div className="bg-primary bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center" style={{width: '80px', height: '80px'}}>
                      <Lock size={40} className="text-primary" />
                    </div>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">Chào mừng trở lại</h2>
                  <p className="text-muted mb-0">Đăng nhập vào tài khoản của bạn</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  {/* Identifier Field */}
                  <div className="mb-3">
                    <label htmlFor="identifier" className="form-label fw-semibold">
                      <Mail size={18} className="me-2 text-primary" />
                      Email hoặc Username
                    </label>
                    <input
                      type="text"
                      className={`form-control form-control-lg ${errors.identifier ? 'is-invalid' : ''}`}
                      id="identifier"
                      name="identifier"
                      placeholder="Nhập email hoặc username"
                      value={formData.identifier}
                      onChange={handleInputChange}
                      disabled={loading}
                      autoComplete="username"
                    />
                    {errors.identifier && (
                      <div className="invalid-feedback d-flex align-items-center">
                        <AlertCircle size={16} className="me-1" />
                        {errors.identifier}
                      </div>
                    )}
                  </div>

                  {/* Password Field */}
                  <div className="mb-4">
                    <label htmlFor="password" className="form-label fw-semibold">
                      <Lock size={18} className="me-2 text-primary" />
                      Mật khẩu
                    </label>
                    <div className="input-group input-group-lg">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                        id="password"
                        name="password"
                        placeholder="Nhập mật khẩu"
                        value={formData.password}
                        onChange={handleInputChange}
                        disabled={loading}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                      {errors.password && (
                        <div className="invalid-feedback d-block w-100">
                          <AlertCircle size={16} className="me-1" />
                          {errors.password}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg w-100 fw-semibold mb-3"
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

                  {/* Links */}
                  <div className="text-center">
                    <p className="mb-2">
                      <Link to="#" className="text-decoration-none">
                        Quên mật khẩu?
                      </Link>
                    </p>
                    <p className="mb-0">
                      Chưa có tài khoản?{' '}
                      <Link to="/register" className="text-primary fw-semibold text-decoration-none">
                        Đăng ký ngay
                      </Link>
                    </p>
                  </div>
                </form>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-4">
              <p className="text-muted small mb-0">
                Bảo mật bởi mã hóa SSL • Chính sách bảo mật
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
          <div className={`toast show align-items-center text-white bg-${toast.type === 'error' ? 'danger' : 'success'} border-0`}>
            <div className="d-flex">
              <div className="toast-body">
                {toast.type === 'error' ? (
                  <AlertCircle size={18} className="me-2" />
                ) : (
                  <CheckCircle size={18} className="me-2" />
                )}
                {toast.message}
              </div>
              <button
                type="button"
                className="btn-close btn-close-white me-2 m-auto"
                onClick={() => setToast(null)}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .bg-gradient-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .bg-pattern {
          background-image:
            radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 0%, transparent 50%);
          background-size: 100px 100px;
          height: 100%;
        }

        .form-control:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
        }

        .btn-primary:hover {
          background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }

        .card {
          border-radius: 15px;
          backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  );
};

export default LoginPage;