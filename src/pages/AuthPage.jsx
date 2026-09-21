import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiLayers, FiZap, FiGrid, FiArrowUpRight } from 'react-icons/fi';
import AuthCard from '../components/auth/AuthCard.jsx';
import '../styles/auth.css';
import '../styles/auth-page.css';

export default function AuthPage() {
  return (
    <>
      <Helmet>
        <title>Đăng nhập & Đăng ký - AISEO Tools Suite</title>
        <meta name="description" content="Đăng nhập AISEO để tiếp tục sáng tạo nội dung, xử lý hình ảnh và quản lý công việc của bạn." />
      </Helmet>

      <div className="auth-page">
        <div className="auth-page-content">
          <header className="auth-topbar">
            <Link to="/" className="auth-brand"><span><FiLayers aria-hidden="true" /></span>AISEO<span className="auth-brand-suite">Tools Suite</span></Link>
            <Link to="/" className="auth-home-link"><FiArrowLeft aria-hidden="true" />Về trang chủ</Link>
          </header>

          <div className="auth-layout">
            <aside className="auth-intro">
              <span className="auth-intro-badge"><span />MỘT NƠI, NHIỀU TIỆN ÍCH</span>
              <h2>Ít thao tác hơn.<br /><em>Nhiều cảm hứng hơn.</em></h2>
              <p>Từ ý tưởng đến thành phẩm, tập trung vào điều bạn muốn tạo ra. AISEO giúp bạn xử lý phần còn lại.</p>
              <div className="auth-feature-list">
                <div><span><FiZap aria-hidden="true" /></span><div><strong>Sáng tạo cùng AI</strong><p>Hỗ trợ viết và tối ưu nội dung SEO.</p></div></div>
                <div><span><FiLayers aria-hidden="true" /></span><div><strong>Công cụ cho công việc hằng ngày</strong><p>Xử lý hình ảnh, tạo báo giá và hơn thế nữa.</p></div></div>
                <div><span><FiGrid aria-hidden="true" /></span><div><strong>Không gian của riêng bạn</strong><p>Quản lý tài khoản và truy cập các công cụ.</p></div></div>
              </div>
              <Link to="/" className="auth-explore">Khám phá bộ công cụ<FiArrowUpRight aria-hidden="true" /></Link>
            </aside>
            <div className="auth-panel">
              <AuthCard />
            </div>
          </div>
          <footer className="auth-page-footer">AISEO Tools Suite · Thêm tiện ích cho mỗi ngày làm việc.</footer>
        </div>
      </div>
    </>
  );
}
