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
        <div className="auth-page-content">
          <Link to="/" className="auth-home-link">
            ← Trang chính
          </Link>

          <div className="auth-layout">
            <div className="auth-panel">
              <AuthCard />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
