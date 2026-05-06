import { memo, useCallback, useEffect, useRef, useState } from 'react';
import '../styles/MemoryGame.css';
import { Helmet } from 'react-helmet-async';
import fallbackCards from '../data/cards.json';
import {
  fetchPublicMemoryCards,
  normalizeMemoryCards,
} from '../services/memoryCardService.js';

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const createGameCards = (sourceCards) => {
  const shuffled = shuffleArray(sourceCards);
  const selected = shuffled.slice(0, Math.min(4, shuffled.length));

  return shuffleArray(
    [...selected, ...selected].map((card) => ({
      ...card,
      uniqueId: crypto.randomUUID(),
      matched: false,
    })),
  );
};

export default function MemoryGame() {
  const [cards, setCards] = useState([]);
  const [cardPool, setCardPool] = useState([]);
  const [firstCard, setFirstCard] = useState(null);
  const [secondCard, setSecondCard] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const [turns, setTurns] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const [dataSource, setDataSource] = useState('supabase');
  const [bestScore, setBestScore] = useState(() => {
    const saved = localStorage.getItem('memoryGameBestScore');
    return saved ? parseInt(saved, 10) : null;
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const audioContextRef = useRef(null);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCards() {
      setLoading(true);
      setLoadError('');

      const localCards = normalizeMemoryCards(fallbackCards);

      if (localCards.length > 0) {
        setCardPool(localCards);
        setCards(createGameCards(localCards));
        setDataSource('fallback');
        setLoading(false);
      }

      const result = await fetchPublicMemoryCards();

      if (!isMounted) {
        return;
      }

      if (result.error) {
        console.error('[MemoryGame] fetchPublicMemoryCards failed', result.error);

        if (localCards.length === 0) {
          setLoadError(result.error);
          setCardPool([]);
          setCards([]);
          setLoading(false);
        }

        return;
      }

      const remoteCards = result.data ?? [];

      if (remoteCards.length === 0) {
        if (localCards.length === 0) {
          setLoadError('Khong co anh nao de tai.');
          setCardPool([]);
          setCards([]);
          setLoading(false);
        }

        return;
      }

      setCardPool(remoteCards);
      setCards(createGameCards(remoteCards));
      setDataSource('supabase');
      setLoading(false);
    }

    loadCards();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    cards.forEach((card) => {
      const image = new Image();
      image.src = card.image;
    });
  }, [cards]);

  useEffect(() => () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }

    audioContextRef.current?.close?.();
  }, []);

  const playSound = useCallback((type) => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const audioContext = audioContextRef.current;

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'match') {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2,
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } else if (type === 'mismatch') {
      oscillator.frequency.value = 300;
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.15,
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } else if (type === 'win') {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, audioContext.currentTime + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + idx * 0.15 + 0.3,
        );
        osc.start(audioContext.currentTime + idx * 0.15);
        osc.stop(audioContext.currentTime + idx * 0.15 + 0.3);
      });
    }
  }, []);

  const resetTurn = useCallback(() => {
    setFirstCard(null);
    setSecondCard(null);
    setDisabled(false);
  }, []);

  const startGame = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }

    if (cardPool.length === 0) {
      setCards([]);
      return;
    }

    const newCards = createGameCards(cardPool);
    setCards(newCards);
    setFirstCard(null);
    setSecondCard(null);
    setDisabled(false);
    setTurns(0);
    setMatches(0);
    setWon(false);
  }, [cardPool]);

  const resolveSecondChoice = useCallback((card) => {
    setDisabled(true);
    const newTurns = turns + 1;
    setTurns(newTurns);
    setSecondCard(card);

    if (firstCard.id === card.id) {
      playSound('match');
      const nextMatches = matches + 1;
      const isWinningMove = nextMatches === cards.length / 2;

      setCards((prev) => prev.map((item) => (
        item.id === firstCard.id ? { ...item, matched: true } : item
      )));
      setMatches(nextMatches);

      if (isWinningMove) {
        setWon(true);
        playSound('win');

        if (bestScore === null || newTurns < bestScore) {
          setBestScore(newTurns);
          localStorage.setItem('memoryGameBestScore', String(newTurns));
        }
      }

      resetTurn();
    } else {
      playSound('mismatch');
      resetTimerRef.current = window.setTimeout(resetTurn, 720);
    }
  }, [bestScore, cards.length, firstCard, matches, playSound, resetTurn, turns]);

  const handleChoice = useCallback((card) => {
    if (
      disabled ||
      card.matched ||
      firstCard?.uniqueId === card.uniqueId ||
      (firstCard && secondCard)
    ) {
      return;
    }

    if (firstCard) {
      resolveSecondChoice(card);
      return;
    }

    setFirstCard(card);
  }, [disabled, firstCard, resolveSecondChoice, secondCard]);

  const totalCards = cards.length;
  const progress = totalCards > 0 ? Math.round((matches / (totalCards / 2)) * 100) : 0;
  const hasEnoughCards = cardPool.length >= 2;

  return (
    <>
      <Helmet>
        <title>Memory Match Game</title>
        <meta
          name="description"
          content="Test your memory skills with this fun matching game!"
        />
      </Helmet>
      <div className="memory-game-container">
        <div className="animated-background"></div>

        <header className="game-header">
          <div className="header-content">
            <h1 className="game-title">
              <span className="emoji">🧠</span>
              Memory Match
            </h1>
            <p className="game-subtitle">Test your memory skills</p>
          </div>

          <div className="stats-container">
            <div className="stat-card">
              <span className="stat-label">Luot choi</span>
              <span className="stat-value">{turns}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Cap tim duoc</span>
              <span className="stat-value">{matches}</span>
            </div>
            {bestScore !== null && (
              <div className="stat-card best-score">
                <span className="stat-label">🏆 Tot nhat</span>
                <span className="stat-value">{bestScore}</span>
              </div>
            )}
          </div>
        </header>

        {!loading && !won && totalCards > 0 && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="progress-text">{progress}% hoan thanh</p>
          </div>
        )}

        <main className="game-board">
          {loading ? (
            <p className="progress-text">Dang tai the bai tu Supabase...</p>
          ) : loadError ? (
            <p className="progress-text">Khong the tai du lieu: {loadError}</p>
          ) : !hasEnoughCards ? (
            <p className="progress-text">
              Can it nhat 2 anh trong bang <strong>memory_cards</strong> de choi game.
            </p>
          ) : (
            <div className="cards-grid">
              {cards.map((card) => {
                const flipped = card === firstCard || card === secondCard || card.matched;

                return (
                  <MemoryCard
                    key={card.uniqueId}
                    card={card}
                    flipped={flipped}
                    disabled={disabled}
                    onChoice={handleChoice}
                  />
                );
              })}
            </div>
          )}

          {!loading && !loadError && cardPool.length > 0 && dataSource === 'fallback' && (
            <p className="progress-text">
              Dang dung bo anh du phong de game van choi duoc ngay ca khi bang <strong>memory_cards</strong> chua truy cap duoc.
            </p>
          )}
        </main>

        {won && (
          <div className="win-overlay">
            <div className="win-card animate-pop-in">
              <div className="confetti"></div>
              <h2 className="win-title">🎉 Chuc mung! 🎉</h2>
              <p className="win-message">
                Ban thang sau <strong>{turns}</strong> luot choi
              </p>
              {bestScore === turns && (
                <p className="win-record">🏆 Day la ky luc moi!</p>
              )}
              <button className="btn-play-again" onClick={startGame}>
                Choi lai
              </button>
            </div>
          </div>
        )}

        <footer className="game-footer">
          <button
            className="btn-new-game"
            onClick={startGame}
            disabled={loading || !hasEnoughCards}
          >
            ↻ Van choi moi
          </button>
        </footer>
      </div>
    </>
  );
}

const MemoryCard = memo(function MemoryCard({
  card,
  flipped,
  disabled,
  onChoice,
}) {
  const chooseCard = useCallback(() => {
    onChoice(card);
  }, [card, onChoice]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseCard();
    }
  }, [chooseCard]);

  return (
    <div className="card-wrapper">
      <div
        className={`flip-card ${flipped ? 'flipped' : ''} ${
          card.matched ? 'matched' : ''
        } ${disabled ? 'disabled' : ''}`}
        onClick={chooseCard}
        role="button"
        tabIndex={card.matched ? -1 : 0}
        aria-label={flipped ? 'The dang mo' : 'Mo the'}
        aria-pressed={flipped}
        onKeyDown={handleKeyDown}
      >
        <div className="flip-card-inner">
          <div className="flip-card-front">
            <span className="card-emoji">✨</span>
          </div>

          <div className="flip-card-back">
            <img
              src={card.image}
              alt={card.name || 'memory card'}
              className="card-image"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
