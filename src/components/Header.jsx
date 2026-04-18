import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, logout } from '../api/authService';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Menu, User, LogOut, Home, Bot, Droplets, LogIn, UserPlus } from 'lucide-react';
export default function Header() {
  const navigate = useNavigate();
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState(null);

useEffect(() => {
  const handleStorageChange = (event) => {
    // Chỉ chạy lại nếu key bị thay đổi là 'token' hoặc 'user'
    if (event.key === 'token' || event.key === 'user' || event.key === null) {
      checkAuthStatus();
    }
  };

  checkAuthStatus();
  window.addEventListener('storage', handleStorageChange);
  
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);

  const checkAuthStatus = () => {
    setIsAuth(isAuthenticated());
    setUser(getUser());
  };

  const handleLogout = () => {
    logout();
    setIsAuth(false);
    setUser(null);
    navigate('/');
  };
  return (
    <header className="sticky-top">
  <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm py-2">
    <div className="container-fluid px-3 px-lg-5">
      {/* 1. Mobile Toggle - Đưa sang trái hoặc giữ cạnh logo để dễ thao tác */}
      <button
        className="navbar-toggler border-0 p-2 me-2 d-lg-none"
        type="button"
        onClick={() => setShowOffcanvas(true)}
      >
        <Menu size={24} />
      </button>

      {/* 2. Logo */}
      <NavLink className="navbar-brand fw-bold d-flex align-items-center me-auto" to="/">
        <img
          src="/zeplao.png"
          alt="Logo"
          width="90"
          height="45"
          className="d-inline-block align-text-top me-2 rounded"
        />
        <span className="d-none d-sm-inline-block fs-5 tracking-tight text-primary">SEO Generator</span>
      </NavLink>

      {/* 3. Desktop Menu (Optional - nếu bạn muốn có menu ngang trên máy tính) */}
      <div className="d-none d-lg-flex flex-grow-1 justify-content-center">
        <ul className="navbar-nav gap-2">
          <li className="nav-item">
            <NavLink to="/" className={({ isActive }) => `nav-link px-3 fw-medium ${isActive ? 'text-primary' : ''}`}>Trang chủ</NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/aiseo" className={({ isActive }) => `nav-link px-3 fw-medium ${isActive ? 'text-primary' : ''}`}>AISEO</NavLink>
          </li>
          <li className="nav-item">
            <NavLink to="/watermark" className={({ isActive }) => `nav-link px-3 fw-medium ${isActive ? 'text-primary' : ''}`}>Watermark</NavLink>
          </li>
        </ul>
      </div>

      {/* 4. Auth Actions */}
      <div className="d-flex align-items-center gap-2">
        {!isAuth ? (
          <div className="d-none d-sm-flex gap-2">
            <NavLink to="/login" className="btn btn-link text-decoration-none text-muted fw-medium">Đăng nhập</NavLink>
            <NavLink to="/register" className="btn btn-primary px-4 shadow-sm">Đăng ký</NavLink>
          </div>
        ) : (
          <div className="dropdown">
            <div className="d-flex align-items-center gap-2 cursor-pointer p-1 rounded-pill hover-bg-light" style={{ cursor: 'pointer' }}>
              <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px' }}>
                <User size={18} className="text-primary" />
              </div>
              <div className="d-none d-lg-block me-2">
                <p className="mb-0 lh-1 small text-muted">Xin chào,</p>
                <p className="mb-0 fw-bold small">{user?.username || 'Thành viên'}</p>
              </div>
              <button onClick={handleLogout} className="btn btn-outline-danger btn-sm rounded-circle p-1 d-sm-none">
                <LogOut size={14} />
              </button>
              <button onClick={handleLogout} className="btn btn-light btn-sm d-none d-sm-inline-flex align-items-center text-danger border-0">
                <LogOut size={16} className="me-1" /> Thoát
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </nav>

  {/* 5. Offcanvas Mobile Menu */}
{/* Cấu trúc này giúp hiệu ứng trượt hoạt động mượt mà */}
<div 
  className={`offcanvas offcanvas-start ${showOffcanvas ? 'show' : ''}`} 
  tabIndex="-1" 
  style={{ 
    visibility: showOffcanvas ? 'visible' : 'hidden', 
    width: '280px',
    transition: 'transform 0.3s ease-in-out' // Hiệu ứng trượt đặc trưng
  }}
  aria-modal="true"
  role="dialog"
>
  <div className="offcanvas-header border-bottom py-3">
    <div className="d-flex align-items-center">
      <img src="/zeplao.png" alt="Logo" width="40" className="me-2" />
      <h5 className="offcanvas-title fw-bold">SEO Gen</h5>
    </div>
    <button 
      type="button" 
      className="btn-close" 
      onClick={() => setShowOffcanvas(false)} 
      aria-label="Close" 
    />
  </div>

  <div className="offcanvas-body p-0 d-flex flex-column">
    <div className="py-3">
      <p className="text-uppercase text-muted small fw-bold px-4 mb-2">Chức năng</p>
      <nav className="nav flex-column">
        {/* Sử dụng component MenuLink đã tối ưu ở bước trước */}
        <MenuLink to="/" icon={<Home size={20}/>} label="Trang chủ" onClick={() => setShowOffcanvas(false)} />
        <MenuLink to="/aiseo" icon={<Bot size={20}/>} label="Công cụ AISEO" onClick={() => setShowOffcanvas(false)} />
        <MenuLink to="/watermark" icon={<Droplets size={20}/>} label="Đóng dấu ảnh" onClick={() => setShowOffcanvas(false)} />
      </nav>
    </div>

    {/* Đẩy phần Auth xuống dưới cùng bằng mt-auto */}
    {!isAuth && (
      <div className="mt-auto p-4 border-top">
        <NavLink 
          to="/login" 
          className="btn btn-outline-primary w-100 mb-2" 
          onClick={() => setShowOffcanvas(false)}
        >
          Đăng nhập
        </NavLink>
        <NavLink 
          to="/register" 
          className="btn btn-primary w-100" 
          onClick={() => setShowOffcanvas(false)}
        >
          Đăng ký ngay
        </NavLink>
      </div>
    )}
  </div>
</div>

{/* Backdrop: Chỉ hiển thị khi showOffcanvas là true */}
{showOffcanvas && (
  <div 
    className="offcanvas-backdrop fade show" 
    onClick={() => setShowOffcanvas(false)} 
  />
)}
</header>
  );
}
const MenuLink = ({ to, icon, label, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    className={({ isActive }) => 
      `nav-link px-4 py-3 d-flex align-items-center gap-3 transition-all ${
        isActive ? 'bg-primary bg-opacity-10 text-primary fw-bold border-end border-primary border-4' : 'text-dark'
      }`
    }
  >
    {icon}
    <span>{label}</span>
  </NavLink>
);