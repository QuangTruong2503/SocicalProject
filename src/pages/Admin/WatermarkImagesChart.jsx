import { useState } from 'react';
import styles from './AdminWatermark.module.css';

const TICK_COUNT = 4;

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(Number(value) || 0);
}

function formatBucket(bucket, granularity) {
  const [year, month, day] = String(bucket).split('-');

  if (!year || !month) {
    return bucket;
  }

  if (granularity === 'month') {
    return `${month}/${year}`;
  }

  if (granularity === 'week') {
    return `Tuần ${day}/${month}`;
  }

  return `${day}/${month}`;
}

// Integer-friendly "nice" step so axis ticks land on 1/2/5 × 10^n.
function getNiceStep(max) {
  if (max <= 0) {
    return 1;
  }

  const raw = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return Math.max(1, factor * magnitude);
}

export default function WatermarkImagesChart({ series, granularity, loading }) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (loading && series.length === 0) {
    return <div className={styles.chartSkeleton} aria-hidden="true" />;
  }

  const maxValue = series.reduce((max, point) => Math.max(max, point.images), 0);

  if (maxValue === 0) {
    return (
      <div className={styles.chartEmpty}>
        Chưa có ảnh nào được tạo trong khoảng thời gian này.
      </div>
    );
  }

  const step = getNiceStep(maxValue);
  const axisMax = step * Math.ceil(maxValue / step);
  const ticks = Array.from({ length: Math.round(axisMax / step) + 1 }, (_, index) => index * step).reverse();
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const activePoint = activeIndex === null ? null : series[activeIndex];
  const activeRatio = activeIndex === null ? 0 : (activeIndex + 0.5) / series.length;
  // Keep the tooltip inside the plot near the left/right edges.
  const tooltipShift = activeRatio < 0.15 ? '0%' : activeRatio > 0.85 ? '-100%' : '-50%';

  return (
    <div className={styles.chart}>
      <div className={styles.chartPlot}>
        <div className={styles.chartTicks} aria-hidden="true">
          {ticks.map((tick) => (
            <div key={tick} className={styles.chartTick}>
              <span>{formatNumber(tick)}</span>
            </div>
          ))}
        </div>

        <div
          className={styles.chartBars}
          role="group"
          aria-label="Số ảnh watermark theo thời gian"
          onPointerLeave={() => setActiveIndex(null)}
        >
          {series.map((point, index) => (
            <div
              key={point.bucket}
              className={`${styles.chartColumn} ${activeIndex === index ? styles.chartColumnActive : ''}`}
              tabIndex={0}
              aria-label={`${formatBucket(point.bucket, granularity)}: ${formatNumber(point.images)} ảnh, ${formatNumber(point.entries)} lượt tạo`}
              onPointerEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              {point.images > 0 && (
                <span
                  className={styles.chartBar}
                  style={{ height: `${(point.images / axisMax) * 100}%` }}
                />
              )}
            </div>
          ))}

          {activePoint && (
            <div
              className={styles.chartTooltip}
              style={{ left: `${activeRatio * 100}%`, transform: `translateX(${tooltipShift})` }}
              aria-hidden="true"
            >
              <strong>{formatNumber(activePoint.images)} ảnh</strong>
              <span>{formatNumber(activePoint.entries)} lượt tạo</span>
              <small>{formatBucket(activePoint.bucket, granularity)}</small>
            </div>
          )}
        </div>
      </div>

      <div className={styles.chartAxis} aria-hidden="true">
        {series.map((point, index) => (
          <span key={point.bucket}>
            {index % labelEvery === 0 || index === series.length - 1 ? formatBucket(point.bucket, granularity) : ''}
          </span>
        ))}
      </div>

      <details className={styles.chartTable}>
        <summary>Xem dạng bảng</summary>
        <div className={styles.chartTableWrap}>
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Ảnh</th>
                <th>Lượt tạo</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.bucket}>
                  <td>{formatBucket(point.bucket, granularity)}</td>
                  <td>{formatNumber(point.images)}</td>
                  <td>{formatNumber(point.entries)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
