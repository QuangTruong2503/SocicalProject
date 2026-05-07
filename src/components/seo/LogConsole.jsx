import { useEffect, useRef } from 'react';

export default function LogConsole({ logs }) {
  const viewportRef = useRef(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="seo-excel-card">
      <div className="seo-excel-card__header">
        <div>
          <span className="seo-excel-kicker">Log Console</span>
          <h2>Realtime events</h2>
        </div>
        <span className="seo-status-badge seo-status-badge--idle">{logs.length} dòng</span>
      </div>

      <div ref={viewportRef} className="seo-log-console" role="log" aria-live="polite">
        {logs.length ? (
          logs.map((line, index) => (
            <div key={`${line}-${index}`} className="seo-log-line">
              {line}
            </div>
          ))
        ) : (
          <div className="seo-log-empty">Chưa có log nào. Upload file và bắt đầu xử lý để xem realtime.</div>
        )}
      </div>
    </section>
  );
}

