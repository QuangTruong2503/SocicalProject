import React, { useState } from 'react';
import AuthModal from './AuthModal';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Header() {
  const [showOffcanvas, setShowOffcanvas] = useState(false);

  return (
    <header>
      <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom shadow-sm sticky-top">
        <div className="container-fluid px-3 px-lg-5">
          {/* Logo */}
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

          {/* Offcanvas Toggle Button */}
          <button
            className="btn btn-outline-primary ms-auto me-2"
            type="button"
            onClick={() => setShowOffcanvas(true)}
            aria-label="Toggle navigation"
          >
            <Menu size={24} />
            Menu
          </button>
          <AuthModal />
        </div>
      </nav>

      {/* Offcanvas Menu */}
      {showOffcanvas && (
        <>
          {/* Backdrop */}
          <div 
            className="offcanvas-backdrop fade show" 
            onClick={() => setShowOffcanvas(false)}
          />
          
          {/* Offcanvas Sidebar */}
          <div 
            className="offcanvas offcanvas-start show" 
            style={{ visibility: 'visible' }}
          >
            {/* Offcanvas Header */}
            <div className="offcanvas-header bg-light border-bottom">
              <h5 className="offcanvas-title fw-bold">Menu</h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowOffcanvas(false)}
                aria-label="Close"
              />
            </div>

            {/* Offcanvas Body */}
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
                <li className="nav-item border-bottom">
                  <div className="px-4 py-3">
                    <AuthModal />
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </header>
  );
}