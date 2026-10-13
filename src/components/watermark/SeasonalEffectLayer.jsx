import { useEffect, useMemo, useState } from 'react';

const SEASON_ASSETS = {
  spring: { icon: '🌸', file: '/asset/seasonal/spring.png' },
  summer: { icon: '☀️', file: '/asset/seasonal/summer.png' },
  autumn: { icon: '🍂', file: '/asset/seasonal/autumn.png' },
  winter: { icon: '❄️', file: '/asset/seasonal/winter.png' },
};

// Result of probing each season image once per page load: true / false.
const assetAvailability = new Map();

function createParticles(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: (index * 37 + 11) % 100,
    delay: -((index * 1.73) % 18),
    scale: 0.65 + ((index * 13) % 65) / 100,
    drift: ((index * 29) % 160) - 80,
  }));
}

/**
 * Probes the optional PNG for a season a single time. Particles use the emoji
 * until (and unless) the image exists, so a missing file costs one request
 * instead of one failed request per particle.
 */
function useSeasonImage(file, enabled) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled || assetAvailability.has(file)) return undefined;

    let active = true;
    const probe = new Image();
    probe.onload = () => {
      assetAvailability.set(file, true);
      if (active) setVersion((version) => version + 1);
    };
    probe.onerror = () => {
      assetAvailability.set(file, false);
    };
    probe.src = file;

    return () => { active = false; };
  }, [file, enabled]);

  return assetAvailability.get(file) === true;
}

export default function SeasonalEffectLayer({ settings }) {
  const { enabled = false, season = 'spring', density = 30, duration = 12, opacity = 70 } = settings || {};
  const particleCount = Math.max(6, Math.round(Number(density) / 2));
  const particles = useMemo(() => createParticles(particleCount), [particleCount]);
  const asset = SEASON_ASSETS[season] || SEASON_ASSETS.spring;
  const hasImage = useSeasonImage(asset.file, enabled);

  if (!enabled) return null;

  return (
    <div className="wm-seasonal-layer" aria-hidden="true">
      {particles.map((particle) => (
        <span
          className="wm-seasonal-particle"
          key={particle.id}
          style={{
            '--wm-fall-left': `${particle.left}%`,
            '--wm-fall-delay': `${particle.delay}s`,
            '--wm-fall-duration': `${duration}s`,
            '--wm-fall-opacity': Number(opacity) / 100,
            '--wm-fall-scale': particle.scale,
            '--wm-fall-drift': `${particle.drift}px`,
          }}
        >
          {hasImage ? <img src={asset.file} alt="" /> : <span className="wm-seasonal-fallback">{asset.icon}</span>}
        </span>
      ))}
    </div>
  );
}
