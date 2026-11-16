import { Navigate, useLocation } from 'react-router-dom';

/** Preserve existing tool bookmarks while using their canonical Tools URLs. */
export default function ToolRedirect({ to }) {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} state={state} replace />;
}
