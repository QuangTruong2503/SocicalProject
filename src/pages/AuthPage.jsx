import { Helmet } from 'react-helmet-async';
import AuthCard from '../components/auth/AuthCard.jsx';
import '../styles/auth.css';

export default function AuthPage() {
  return (
    <>
      <Helmet>
        <title>Authentication - AISEO Tools Suite</title>
        <meta name="description" content="Dang ky va dang nhap voi Supabase Authentication." />
      </Helmet>

      <div className="auth-page">
        <div className="auth-bg-grid"></div>
        <div className="auth-bg-orb auth-bg-orb-one"></div>
        <div className="auth-bg-orb auth-bg-orb-two"></div>
        <div className="auth-bg-orb auth-bg-orb-three"></div>

        <div className="auth-page-content">
          <AuthCard />
        </div>
      </div>
    </>
  );
}
