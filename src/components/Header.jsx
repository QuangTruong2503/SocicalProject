import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Menu, LogOut, User } from 'lucide-react';
import { isAuthenticated, getUser, logout } from '../api/authService';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Header() {
  const navigate = useNavigate();
  const [showOffcanvas, setShowOffcanvas] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkAuthStatus();
    window.addEventListener('storage', checkAuthStatus);
    return () => window.removeEventListener('storage', checkAuthStatus);
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
    <header>
      <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom shadow-sm sticky-top">
        <div className="container-fluid px-3 px-lg-5">
          <NavLink className="navbar-brand fw-bold d-flex align-items-center" to="/">
            <img
              src="/zeplao.png"
              alt="Logo"
              width="100"
              height="50"
              className="d-inline-block align-text-top me-2 rounded-1"
            />
            <span className="d-none d-lg-inline">SEO Generator</span>
          </NavLink>

          <button
            className="btn btn-outline-primary d-lg-none ms-auto me-2"
            type="button"
            onClick={() => setShowOffcanvas(true)}
            aria-label="Toggle navigation"
          >
            <Menu size={24} />
          </button>

          <div className="d-none d-lg-flex ms-auto">
            {!isAuth ? (
              <div className="d-flex gap-2">
                <NavLink to="/login" className="btn btn-outline-primary">
                  Đăng nhập
                </NavLink>
                <NavLink to="/register" className="btn btn-primary">
                  Đăng ký
                </NavLink>
              </div>
            ) : (
              <div className="d-flex align-items-center gap-3">
                <div className="d-flex align-items-center gap-2">
                  <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{width: '32px', height: '32px'}}>
                    <User size={16} className="text-primary" />
                  </div>
                  <span className="text-muted small fw-medium">
                    Xin chào, <strong>{user?.username || 'Bạn'}</strong>
                  </span>
                </div>
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleLogout}
                  title="Đăng xuất"
                >
                  <LogOut size={16} className="me-1" />
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {showOffcanvas && (
        <>
          <div
            className="offcanvas-backdrop fade show"
            onClick={() => setShowOffcanvas(false)}
          />

          <div
            className="offcanvas offcanvas-start show"
            style={{ visibility: 'visible' }}
          >
            <div className="offcanvas-header bg-light border-bottom">
              <h5 className="offcanvas-title fw-bold">Menu</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowOffcanvas(false)}
                aria-label="Close"
              />
            </div>

            <div className="offcanvas-body p-0">
              <ul className="nav flex-column w-100">
                <li className="nav-item border-bottom">
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link px-4 py-3 ${isActive ? 'bg-primary text-white fw-600' : ''}`
                    }
                    to="/"
                    onClick={() => setShowOffcanvas(false)}
                  >
                    🏠 Trang chủ
                  </NavLink>
                </li>
                <li className="nav-item border-bottom">
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link px-4 py-3 ${isActive ? 'bg-primary text-white fw-600' : ''}`
                    }
                    to="/aiseo"
                    onClick={() => setShowOffcanvas(false)}
                  >
                    🤖 AISEO
                  </NavLink>
                </li>
                <li className="nav-item border-bottom">
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link px-4 py-3 ${isActive ? 'bg-primary text-white fw-600' : ''}`
                    }
                    to="/watermark"
                    onClick={() => setShowOffcanvas(false)}
                  >
                    💧 Watermark
                  </NavLink>
                </li>

                {!isAuth ? (
                  <>
                    <li className="nav-item border-bottom">
                      <NavLink
                        className="nav-link px-4 py-3 text-primary fw-semibold"
                        to="/login"
                        onClick={() => setShowOffcanvas(false)}
                      >
                        🔐 Đăng nhập
                      </NavLink>
                    </li>
                    <li className="nav-item">
                      <NavLink
                        className="nav-link px-4 py-3 btn btn-primary mx-3 my-2 text-white"
                        to="/register"
                        onClick={() => setShowOffcanvas(false)}
                      >
                        📝 Đăng ký
                      </NavLink>
                    </li>
                  </>
                ) : (
                  <li className="nav-item border-bottom">
                    <div className="px-4 py-3">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="d-flex align-items-center gap-2">
                          <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{width: '32px', height: '32px'}}>
                            <User size={16} className="text-primary" />
                          </div>
                          <span className="small fw-medium">{user?.username || 'Bạn'}</span>
                        </div>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            handleLogout();
                            setShowOffcanvas(false);
                          }}
                        >
                          <LogOut size={14} />
                        </button>
                      </div>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </header>
  );
}