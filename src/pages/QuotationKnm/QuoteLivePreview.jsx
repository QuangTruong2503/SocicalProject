import { useEffect, useRef, useState } from 'react';
import QuotePreview from './QuotePreview.jsx';
import styles from './QuoteLivePreview.module.css';

const A4_WIDTH_PX = 210 * 3.7795275591;

export default function QuoteLivePreview({ company, quotation }) {
  const frameRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const update = () => {
      const available = frame.clientWidth;
      setScale(available > 0 ? Math.min(1, available / A4_WIDTH_PX) : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frameRef} className={styles.frame}>
      <div
        className={styles.scaleWrap}
        style={{ transform: `scale(${scale})`, width: '210mm', height: scale < 1 ? `${297 * scale}mm` : undefined }}
      >
        <QuotePreview company={company} quotation={quotation} />
      </div>
    </div>
  );
}
