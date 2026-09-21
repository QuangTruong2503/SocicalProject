import { Navigate, useLocation } from 'react-router-dom';
import { getAuthReturnPath } from '../utils/authRedirect.js';
import { useAuth } from '../hooks/useAuth.js';

export default function PublicRoute({ children }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Đang khôi phục phiên đăng nhập…</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={getAuthReturnPath(location)} replace />;
  }

  return children;
}
