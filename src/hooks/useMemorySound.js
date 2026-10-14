import { useEffect, useRef } from 'react';

export function useMemorySound(enabled, event, gameId) {
  const contextRef = useRef(null);
  const playedRef = useRef(null);
  useEffect(() => {
    if (!enabled || !event || !['match', 'mismatch', 'win'].includes(event.type)) return;
    const key = `${gameId}:${event.id}`;
    if (playedRef.current === key) return;
    playedRef.current = key;
    // Audio is optional: denied/unsupported audio never blocks state transitions.
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      const context = contextRef.current ?? new Audio();
      contextRef.current = context;
      const play = () => {
        if (context.state !== 'running') return;
        const frequencies = event.type === 'win' ? [523.25, 659.25, 783.99] : [event.type === 'match' ? 800 : 300];
        frequencies.forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = context.currentTime + index * 0.12;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.08, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(start);
          oscillator.stop(start + 0.22);
        });
      };
      if (context.state === 'suspended') context.resume().then(play).catch(() => {});
      else play();
    } catch { /* The game remains playable without sound. */ }
  }, [enabled, event, gameId]);

  useEffect(() => () => {
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }, []);
}
