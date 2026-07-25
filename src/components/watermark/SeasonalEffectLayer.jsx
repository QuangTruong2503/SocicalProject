import React, { useMemo } from 'react';

const SEASON_ASSETS = {
  spring: { icon: '🌸', file: '/asset/seasonal/spring.png' },
  summer: { icon: '☀️', file: '/asset/seasonal/summer.png' },
  autumn: { icon: '🍂', file: '/asset/seasonal/autumn.png' },
  winter: { icon: '❄️', file: '/asset/seasonal/winter.png' },
};

function createParticles(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: (index * 37 + 11) % 100,
    delay: -((index * 1.73) % 18),
    scale: 0.65 + ((index * 13) % 65) / 100,
    drift: ((index * 29) % 160) - 80,
  }));
}

export default function SeasonalEffectLayer({ settings }) {
  const { enabled = false, season = 'spring', density = 30, duration = 12, opacity = 70 } = settings || {};
  const particleCount = Math.max(6, Math.round(Number(density) / 2));
  const particles = useMemo(() => createParticles(particleCount), [particleCount]);
  const asset = SEASON_ASSETS[season] || SEASON_ASSETS.spring;

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
          <span className="wm-seasonal-fallback">{asset.icon}</span>
          <img
            src={asset.file}
            alt=""
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        </span>
      ))}
    </div>
  );
}
