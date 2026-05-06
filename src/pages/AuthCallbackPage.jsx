import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

function normalizeNextPath(nextPath) {
  if (typeof nextPath !== 'string' || !nextPath.trim()) {
    return '/dashboard';
  }

  try {
    const url = new URL(nextPath, window.location.origin);

    if (url.origin !== window.location.origin) {
      return '/dashboard';
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}

export default function AuthCallbackPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  const [searchParams] = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get('next')),
    [searchParams],
  );

  if (isInitializing) {
    return (
      <>
        <Helmet>
          <title>Đang hoàn tất đăng nhập - AISEO Tools Suite</title>
        </Helmet>

        <div className="auth-loading-screen">
          <div className="auth-loading-ring"></div>
          <p>Đang hoàn tất đăng nhập Google...</p>
        </div>
      </>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={nextPath} replace />;
  }

  return <Navigate to="/auth" replace />;
}
