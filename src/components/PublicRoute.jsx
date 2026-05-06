import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function PublicRoute({ children }) {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-ring"></div>
        <p>Dang khoi phuc phien dang nhap...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
