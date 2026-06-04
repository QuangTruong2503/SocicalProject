import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../utils/userProfile.js';
import '../styles/Header.css';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(70);
  const headerRef = useRef(null);
  const userMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, profile, latestUpload, logout } = useAuth();
  const userDisplayName = getUserDisplayName(user, profile);
  const userAvatarUrl = getUserAvatarUrl(user, profile, latestUpload);
  const userInitials = getUserInitials(user, profile);

  useEffect(() => {
    const updateHeaderHeight = () => {
      setHeaderHeight(headerRef.current?.offsetHeight || 70);
    };

    const handleScroll = () => {
      const nextHeaderHeight = headerRef.current?.offsetHeight || 70;
      setScrolled(window.scrollY > 10);
      setPinned(window.scrollY > nextHeaderHeight);
    };

    updateHeaderHeight();
    handleScroll();

    window.addEventListener('resize', updateHeaderHeight);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setUserMenuOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown, { passive: true });
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [userMenuOpen]);

  const navItems = [
    {
      label: 'Trang Chu',
      path: '/',
      icon: '🏠',
    },
    {
      label: 'SEO Keywords',
      path: '/seo-keywords',
      icon: '🔍',
    },
    {
      label: 'Watermark',
      path: '/watermark',
      icon: '🎨',
    },
    {
      label: 'Memory Game',
      path: '/memory-game',
      icon: '🎮',
    },
    {
      label: user ? 'Dashboard' : 'Đăng nhập',
      path: user ? '/dashboard/overview' : '/auth',
      icon: user ? '📊' : '🔐',
    },
  ];

  const isActive = (path) => {
    if (path.startsWith('/dashboard')) {
      return location.pathname.startsWith('/dashboard');
    }

    if (path === '/watermark') {
      return location.pathname.startsWith('/watermark');
    }

    return location.pathname === path;
  };

  async function handleLogout() {
    const result = await logout();

    if (result.error) {
      console.error('Logout failed:', result.error);
      return;
    }

    setIsOpen(false);
    setUserMenuOpen(false);
    navigate('/auth', { replace: true });
  }

  function handleDashboardClick() {
    setUserMenuOpen(false);
    setIsOpen(false);
    navigate('/dashboard/overview');
  }

  return (
    <>
      {pinned && (
        <div
          className="header-spacer"
          style={{ height: `${headerHeight}px` }}
          aria-hidden="true"
        />
      )}

      <header
        ref={headerRef}
        className={`header ${scrolled ? 'scrolled' : ''} ${pinned ? 'pinned' : ''}`}
      >
        <div className="header-container">
          <div className="header-logo">
            <NavLink to="/" className="logo-link" aria-label="Home">
              <div className="logo-wrapper">
                <img
                  src="/zeplao.png"
                  alt="AISEO Logo"
                  width="48"
                  height="48"
                  className="logo-image"
                  loading="lazy"
                />
                <div className="logo-text">
                  <span className="logo-primary">AISEO</span>
                  <span className="logo-secondary">Tools Suite</span>
                </div>
              </div>
            </NavLink>
          </div>

          <nav className="header-nav">
            <div className="nav-items">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                  onClick={() => setIsOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {isActive(item.path) && <span className="nav-indicator"></span>}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="header-right">
            {user ? (
              <div className="user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="user-menu-trigger"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-label={`Open account menu for ${userDisplayName}`}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <span className="user-avatar-ring" aria-hidden="true">
                    {userAvatarUrl ? (
                      <img src={userAvatarUrl} alt={userDisplayName} className="user-avatar-image" />
                    ) : (
                      <span className="user-avatar-fallback">{userInitials}</span>
                    )}
                  </span>
                  <span className="user-menu-meta">
                    <strong>{userDisplayName}</strong>
                    <span>{profile?.email || user.email || 'Account'}</span>
                  </span>
                  <span className={`user-menu-caret ${userMenuOpen ? 'open' : ''}`}>⌄</span>
                </button>

                {userMenuOpen && (
                  <div className="user-menu-dropdown" role="menu" aria-label="Account menu">
                    <button type="button" className="user-menu-item" onClick={handleDashboardClick} role="menuitem">
                      <span className="user-menu-item-icon">📊</span>
                      <span>
                        <strong>Dashboard</strong>
                        <small>Quản lý ảnh và hồ sơ</small>
                      </span>
                    </button>
                    <button type="button" className="user-menu-item danger" onClick={handleLogout} role="menuitem">
                      <span className="user-menu-item-icon">↩</span>
                      <span>
                        <strong>Logout</strong>
                        <small>Thoát phiên đăng nhập</small>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="btn-auth-link"
                onClick={() => navigate('/auth')}
                aria-label="Go to authentication"
                title="Auth"
              >
                Đăng nhập
              </button>
            )}

            <button
              className="btn-icon-header"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            <button
              className={`btn-mobile-menu ${isOpen ? 'active' : ''}`}
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={isOpen}
            >
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
              <span className="hamburger-line"></span>
            </button>
          </div>
        </div>
      </header>

      <div className={`mobile-menu ${isOpen ? 'open' : ''}`}>
        <div className="mobile-menu-content">
          <div className="mobile-menu-header">
            <h3>Menu</h3>
            <button
              className="btn-close-menu"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <nav className="mobile-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => setIsOpen(false)}
              >
                <span className="mobile-nav-icon">{item.icon}</span>
                <span className="mobile-nav-label">{item.label}</span>
                {isActive(item.path) && <span className="mobile-nav-indicator">✓</span>}
              </NavLink>
            ))}
          </nav>

          <div className="mobile-menu-footer">
            <p className="mobile-menu-version">v1.0.0</p>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="menu-overlay"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        ></div>
      )}
    </>
  );
}
