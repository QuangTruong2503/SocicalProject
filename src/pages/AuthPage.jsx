import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import AuthCard from '../components/auth/AuthCard.jsx';
import '../styles/auth.css';

export default function AuthPage() {
  return (
    <>
      <Helmet>
        <title>Authentication - AISEO Tools Suite</title>
        <meta name="description" content="Đăng ký và đăng nhập với Supabase Authentication." />
      </Helmet>

      <div className="auth-page">
        <div className="auth-bg-grid"></div>
        <div className="auth-bg-orb auth-bg-orb-one"></div>
        <div className="auth-bg-orb auth-bg-orb-two"></div>
        <div className="auth-bg-orb auth-bg-orb-three"></div>

        <div className="auth-page-content">
          <div className="auth-layout">
            <section className="auth-showcase">
              <Link to="/" className="auth-home-link">
                ← Quay lại trang chính
              </Link>

              <div className="auth-showcase-badge">Modern Access Experience</div>
              <h1>Đăng nhập mượt mà, giao diện sáng và chuyên nghiệp hơn.</h1>
              <p>
                Tạo tài khoản, xác thực email và truy cập dashboard trong một trải nghiệm
                gọn gàng, thân thiện và rõ ràng hơn.
              </p>

              <div className="auth-showcase-points">
                <div className="auth-showcase-point">
                  <span>01</span>
                  <div>
                    <strong>Đăng ký nhanh</strong>
                    <p>Biểu mẫu rõ ràng, validation trực tiếp và phản hồi dễ hiểu.</p>
                  </div>
                </div>
                <div className="auth-showcase-point">
                  <span>02</span>
                  <div>
                    <strong>Xác thực an toàn</strong>
                    <p>Supabase Auth xử lý session, email verification và social login.</p>
                  </div>
                </div>
                <div className="auth-showcase-point">
                  <span>03</span>
                  <div>
                    <strong>Trải nghiệm nhất quán</strong>
                    <p>Hoạt động tốt ở cả light mode và dark mode với animation nhẹ nhàng.</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="auth-panel">
              <AuthCard />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
