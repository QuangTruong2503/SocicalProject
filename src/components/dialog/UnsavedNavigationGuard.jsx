import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';

function RouterGuard({ dirtyRef, busy, onDiscard }) {
  const blocker=useBlocker(() => busy || dirtyRef.current);
  const handledRef=useRef(null);
  useEffect(() => {
    if (blocker.state !== 'blocked') { handledRef.current=null;return; }
    if (handledRef.current===blocker.location.key) return;
    handledRef.current=blocker.location.key;
    if (busy) { blocker.reset();return; }
    if (window.confirm('Có thay đổi chưa lưu. Bỏ thay đổi và rời màn hình này?')) {
      dirtyRef.current=false;onDiscard?.();blocker.proceed();
    } else blocker.reset();
  },[blocker,busy,dirtyRef,onDiscard]);
  return null;
}

// Standalone component tests may use a declarative MemoryRouter. Production
// uses the data router so browser Back/Forward can be blocked before unmount.
export default function UnsavedNavigationGuard(props) {
  const router=useContext(UNSAFE_DataRouterContext);
  return router ? <RouterGuard {...props} /> : null;
}
