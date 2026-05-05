import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function PublicRoute({ children, user }) {
  const { loading } = useAuth();
  const pendingSuccess = typeof window !== 'undefined' && window.sessionStorage.getItem('auth-success-pending') === 'true';

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Dang tai trang xac thuc...</p>
      </div>
    );
  }

  if (!user && typeof window !== 'undefined' && pendingSuccess) {
    window.sessionStorage.removeItem('auth-success-pending');
  }

  if (user && pendingSuccess) {
    return children;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
