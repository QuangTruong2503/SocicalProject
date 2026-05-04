import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import '../styles/Header.css';

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

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
      path: '/aiseo',
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
      <header className={`header ${scrolled ? 'scrolled' : ''}`}>
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
            {/* Theme Toggle Button (for future use) */}
            <button
              className="btn-icon-header"
              aria-label="Toggle theme"
              title="Dark Mode"
            >
              🌙
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