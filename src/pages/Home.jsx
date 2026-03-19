import React from 'react';
import {Link } from 'react-router-dom';

const Home = () => {
  return(
    <div>
      <h1>Chào mừng đến với Portfolio của Minh Tâm</h1>
      <h3 className="mb-4 text-secondary"><i className="bi bi-stack me-2"></i>Kho dự án cá nhân</h3>
      <div className="row g-4">
            {/* Project 1 Card */}
            <div className="col-md-6 col-lg-4">
              <div className="card h-100 border-0 shadow-sm hover-shadow transition">
                <div className="card-body text-center p-4">
                  <div className="display-4 text-primary mb-3">
                    <i class="bi bi-amd"></i>
                  </div>
                  <h5 className="card-title fw-bold">Dự án 1: Công cụ SEO</h5>
                  <i class="bi bi-amd"></i>
                  <p className="card-text text-muted small">Tự động hóa mô tả sản phẩm bằng AI và Node.js.</p>
                  <Link to="/project1" className="btn btn-outline-primary btn-sm rounded-pill px-4">Xem chi tiết</Link>
                </div>
              </div>
            </div>

            {/* Project 2 Card */}
            <div className="col-md-6 col-lg-4">
              <div className="card h-100 border-0 shadow-sm hover-shadow transition">
                <div className="card-body text-center p-4">
                  <div className="display-4 text-success mb-3">
                    <i className="bi bi-file-earmark-excel"></i>
                  </div>
                  <h5 className="card-title fw-bold">Dự án 2: Xử lý Excel</h5>
                  <p className="card-text text-muted small">So sánh mã sản phẩm và quản lý hình ảnh thông minh.</p>
                  <Link to="/project2" className="btn btn-outline-success btn-sm rounded-pill px-4">Khám phá ngay</Link>
                </div>
              </div>
            </div>

            {/* Placeholder cho dự án tương lai */}
            <div className="col-md-6 col-lg-4">
              <div className="card h-100 border-0 shadow-sm border-dashed bg-transparent d-flex align-items-center justify-content-center py-5">
                 <i className="bi bi-plus-circle text-muted" style={{fontSize: '2rem'}}></i>
                 <span className="text-muted mt-2">Coming Soon...</span>
              </div>
            </div>
      </div>
    </div>
  );
};
export default Home;