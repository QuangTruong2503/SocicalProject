import React from 'react';
import '../styles/Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-grid">
          {/* Cột 1: Thông tin công ty/dự án */}
          <div className="footer-section">
            <h5 className="footer-section h5">
              <a href="https://www.facebook.com/quang.truong.196493" target="_blank" rel="noopener noreferrer" className="footer-link">
                Quang Truong
              </a>
            </h5>
          </div>
        </div>

        <div className="footer-divider"></div>

        {/* Bản quyền và tên người chịu trách nhiệm */}
        <div className="footer-bottom">
          <div className="footer-credits">
            © {currentYear} Bản quyền thuộc về: 
            <a href="https://www.facebook.com/quang.truong.196493" target="_blank" rel="noopener noreferrer">
              Quang Truong
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;