import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import '../styles/Header.css';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(70);
  const headerRef = useRef(null);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Handle scroll effect
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

  // Close menu when pressing Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
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

  const navItems = [
    {
      label: 'Trang Chủ',
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
  ];

  const isActive = (path) => location.pathname === path;

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
          {/* Logo Section */}
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

          {/* Navigation Items - Desktop */}
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

          {/* Right Section - Action Buttons & Mobile Menu */}
          <div className="header-right">
            {/* Theme Toggle Button */}
            <button
              className="btn-icon-header"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>

            {/* Mobile Menu Button */}
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

      {/* Mobile Menu */}
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

      {/* Menu Overlay */}
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
