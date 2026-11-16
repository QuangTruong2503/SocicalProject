import { Navigate, useLocation } from 'react-router-dom';

/** Keep existing bookmarks while using the Tools URLs for both watermark pages. */
export default function WatermarkRedirect({ to }) {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} state={state} replace />;
}
