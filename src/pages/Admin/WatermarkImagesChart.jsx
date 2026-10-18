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
function getNiceStep(max, integer = true) {
  if (max <= 0) {
    return 1;
  }

  const raw = max / TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return integer ? Math.max(1, factor * magnitude) : factor * magnitude;
}

const DEFAULTS = {
  getValue: (point) => point.images,
  formatValue: (value) => `${formatNumber(value)} ảnh`,
  getDetail: (point) => `${formatNumber(point.entries)} lượt tạo`,
  formatTick: formatNumber,
  emptyText: 'Chưa có ảnh nào được tạo trong khoảng thời gian này.',
  label: 'Số ảnh watermark theo thời gian',
  columns: ['Ảnh', 'Lượt tạo'],
  getCells: (point) => [formatNumber(point.images), formatNumber(point.entries)],
};

/**
 * Bar chart of one value per bucket. Defaults draw the watermark image counts;
 * other pages pass their own accessors and labels (e.g. /admin/usage).
 */
export default function WatermarkImagesChart({
  series,
  granularity,
  loading,
  bucketKey = 'bucket',
  getValue = DEFAULTS.getValue,
  formatValue = DEFAULTS.formatValue,
  getDetail = DEFAULTS.getDetail,
  formatTick = DEFAULTS.formatTick,
  emptyText = DEFAULTS.emptyText,
  label = DEFAULTS.label,
  columns = DEFAULTS.columns,
  getCells = DEFAULTS.getCells,
  integerTicks = true,
}) {
  const [activeIndex, setActiveIndex] = useState(null);

  if (loading && series.length === 0) {
    return <div className={styles.chartSkeleton} aria-hidden="true" />;
  }

  const maxValue = series.reduce((max, point) => Math.max(max, Number(getValue(point)) || 0), 0);

  if (maxValue === 0) {
    return (
      <div className={styles.chartEmpty}>
        {emptyText}
      </div>
    );
  }

  const step = getNiceStep(maxValue, integerTicks);
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
              <span>{formatTick(tick)}</span>
            </div>
          ))}
        </div>

        <div
          className={styles.chartBars}
          role="group"
          aria-label={label}
          onPointerLeave={() => setActiveIndex(null)}
        >
          {series.map((point, index) => (
            <div
              key={point[bucketKey]}
              className={`${styles.chartColumn} ${activeIndex === index ? styles.chartColumnActive : ''}`}
              tabIndex={0}
              aria-label={`${formatBucket(point[bucketKey], granularity)}: ${formatValue(getValue(point))}, ${getDetail(point)}`}
              onPointerEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              {Number(getValue(point)) > 0 && (
                <span
                  className={styles.chartBar}
                  style={{ height: `${(Number(getValue(point)) / axisMax) * 100}%` }}
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
              <strong>{formatValue(getValue(activePoint))}</strong>
              <span>{getDetail(activePoint)}</span>
              <small>{formatBucket(activePoint[bucketKey], granularity)}</small>
            </div>
          )}
        </div>
      </div>

      <div className={styles.chartAxis} aria-hidden="true">
        {series.map((point, index) => (
          <span key={point[bucketKey]}>
            {index % labelEvery === 0 || index === series.length - 1 ? formatBucket(point[bucketKey], granularity) : ''}
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
                <th>{columns[0]}</th>
                <th>{columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point[bucketKey]}>
                  <td>{formatBucket(point[bucketKey], granularity)}</td>
                  {getCells(point).map((cell, index) => <td key={columns[index]}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
