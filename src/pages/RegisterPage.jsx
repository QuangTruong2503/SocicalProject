import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, AlertCircle, ArrowLeft, CheckCircle, UserPlus } from 'lucide-react';
import { registerUser } from '../api/authService';
import 'bootstrap/dist/css/bootstrap.min.css';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: ''
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

    if (!formData.username.trim()) {
      newErrors.username = 'Tên đăng nhập là bắt buộc';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Tên đăng nhập phải ít nhất 3 ký tự';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Tên đăng nhập chỉ chứa chữ, số và dấu gạch dưới';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email là bắt buộc';
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Email không hợp lệ';
    }

    if (!formData.password) {
      newErrors.password = 'Mật khẩu là bắt buộc';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Mật khẩu phải ít nhất 6 ký tự';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường và 1 số';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp';
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
      const result = await registerUser({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name || null
      });

      if (result.success) {
        showToast('Đăng ký thành công! Đang chuyển hướng...', 'success');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
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
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-gradient-success">
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
                    <div className="bg-success bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center" style={{width: '80px', height: '80px'}}>
                      <UserPlus size={40} className="text-success" />
                    </div>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">Tạo tài khoản</h2>
                  <p className="text-muted mb-0">Điền thông tin để bắt đầu</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  {/* Username Field */}
                  <div className="mb-3">
                    <label htmlFor="username" className="form-label fw-semibold">
                      <User size={18} className="me-2 text-success" />
                      Tên đăng nhập
                    </label>
                    <input
                      type="text"
                      className={`form-control form-control-lg ${errors.username ? 'is-invalid' : ''}`}
                      id="username"
                      name="username"
                      placeholder="Nhập tên đăng nhập"
                      value={formData.username}
                      onChange={handleInputChange}
                      disabled={loading}
                      autoComplete="username"
                    />
                    {errors.username && (
                      <div className="invalid-feedback d-flex align-items-center">
                        <AlertCircle size={16} className="me-1" />
                        {errors.username}
                      </div>
                    )}
                  </div>

                  {/* Email Field */}
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label fw-semibold">
                      <Mail size={18} className="me-2 text-success" />
                      Email
                    </label>
                    <input
                      type="email"
                      className={`form-control form-control-lg ${errors.email ? 'is-invalid' : ''}`}
                      id="email"
                      name="email"
                      placeholder="Nhập địa chỉ email"
                      value={formData.email}
                      onChange={handleInputChange}
                      disabled={loading}
                      autoComplete="email"
                    />
                    {errors.email && (
                      <div className="invalid-feedback d-flex align-items-center">
                        <AlertCircle size={16} className="me-1" />
                        {errors.email}
                      </div>
                    )}
                  </div>

                  {/* Full Name Field */}
                  <div className="mb-3">
                    <label htmlFor="full_name" className="form-label fw-semibold">
                      <User size={18} className="me-2 text-success" />
                      Họ và tên (tùy chọn)
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-lg"
                      id="full_name"
                      name="full_name"
                      placeholder="Nhập họ và tên đầy đủ"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      disabled={loading}
                      autoComplete="name"
                    />
                  </div>

                  {/* Password Field */}
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label fw-semibold">
                      <Lock size={18} className="me-2 text-success" />
                      Mật khẩu
                    </label>
                    <div className="input-group input-group-lg">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={`form-control ${errors.password ? 'is-invalid' : ''}`}
                        id="password"
                        name="password"
                        placeholder="Tạo mật khẩu mạnh"
                        value={formData.password}
                        onChange={handleInputChange}
                        disabled={loading}
                        autoComplete="new-password"
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
                    </div>
                    {errors.password && (
                      <div className="invalid-feedback d-block">
                        <AlertCircle size={16} className="me-1" />
                        {errors.password}
                      </div>
                    )}
                    <div className="form-text">
                      Mật khẩu phải chứa ít nhất 6 ký tự, 1 chữ hoa, 1 chữ thường và 1 số
                    </div>
                  </div>

                  {/* Confirm Password Field */}
                  <div className="mb-4">
                    <label htmlFor="confirmPassword" className="form-label fw-semibold">
                      <Lock size={18} className="me-2 text-success" />
                      Xác nhận mật khẩu
                    </label>
                    <div className="input-group input-group-lg">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className={`form-control ${errors.confirmPassword ? 'is-invalid' : ''}`}
                        id="confirmPassword"
                        name="confirmPassword"
                        placeholder="Nhập lại mật khẩu"
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        disabled={loading}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={loading}
                        aria-label="Toggle confirm password visibility"
                      >
                        {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <div className="invalid-feedback d-block">
                        <AlertCircle size={16} className="me-1" />
                        {errors.confirmPassword}
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="btn btn-success btn-lg w-100 fw-semibold mb-3"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Đang tạo tài khoản...
                      </>
                    ) : (
                      'Tạo tài khoản'
                    )}
                  </button>

                  {/* Links */}
                  <div className="text-center">
                    <p className="mb-0">
                      Đã có tài khoản?{' '}
                      <Link to="/login" className="text-success fw-semibold text-decoration-none">
                        Đăng nhập ngay
                      </Link>
                    </p>
                  </div>
                </form>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-4">
              <p className="text-muted small mb-0">
                Bằng cách đăng ký, bạn đồng ý với{' '}
                <Link to="#" className="text-decoration-none">Điều khoản dịch vụ</Link>{' '}
                và{' '}
                <Link to="#" className="text-decoration-none">Chính sách bảo mật</Link>
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
        .bg-gradient-success {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }

        .bg-pattern {
          background-image:
            radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 0%, transparent 50%);
          background-size: 100px 100px;
          height: 100%;
        }

        .form-control:focus {
          border-color: #11998e;
          box-shadow: 0 0 0 0.2rem rgba(17, 153, 142, 0.25);
        }

        .btn-success {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          border: none;
        }

        .btn-success:hover {
          background: linear-gradient(135deg, #0e7c73 0%, #32d56a 100%);
        }

        .card {
          border-radius: 15px;
          backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  );
};

export default RegisterPage;