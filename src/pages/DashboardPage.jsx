import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import '../styles/auth.css';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - AISEO Tools Suite</title>
        <meta name="description" content="Dashboard sau khi dang nhap thanh cong voi Supabase." />
      </Helmet>

      <div className="dashboard-page">
        <div className="dashboard-shell">
          <div className="dashboard-card">
            <div className="dashboard-badge">Authenticated Session</div>
            <h1>Dashboard</h1>
            <p className="dashboard-subtitle">
              Ban da dang nhap thanh cong. Session hien tai dang duoc luu boi Supabase Auth.
            </p>

            <div className="dashboard-grid">
              <div className="dashboard-item">
                <span className="dashboard-label">Username</span>
                <strong>{profile?.username || user?.user_metadata?.username || 'Chua cap nhat'}</strong>
              </div>
              <div className="dashboard-item">
                <span className="dashboard-label">Email</span>
                <strong>{profile?.email || user?.email || 'Khong co email'}</strong>
              </div>
              <div className="dashboard-item">
                <span className="dashboard-label">User ID</span>
                <strong>{user?.id || 'N/A'}</strong>
              </div>
              <div className="dashboard-item">
                <span className="dashboard-label">Created At</span>
                <strong>{profile?.created_at ? new Date(profile.created_at).toLocaleString() : 'Khong ro'}</strong>
              </div>
            </div>

            <div className="dashboard-actions">
              <button type="button" className="auth-submit-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
