import { useEffect, useState, useRef } from "react";
import cardsData from "../data/cards.json";
import "../styles/MemoryGame.css";
import { Helmet } from "react-helmet-async";

// Fisher-Yates shuffle algorithm (optimal)
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getRandomCards = () => {
  const shuffled = shuffleArray(cardsData);
  const selected = shuffled.slice(0, 4);

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
  const [firstCard, setFirstCard] = useState(null);
  const [secondCard, setSecondCard] = useState(null);
  const [disabled, setDisabled] = useState(false);
  const [turns, setTurns] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const [bestScore, setBestScore] = useState(null);
  const audioRef = useRef(null);

  // Load best score from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("memoryGameBestScore");
    if (saved) setBestScore(parseInt(saved, 10));
  }, []);

  const startGame = () => {
    const newCards = getRandomCards();
    setCards(newCards);
    setFirstCard(null);
    setSecondCard(null);
    setDisabled(false);
    setTurns(0);
    setMatches(0);
    setWon(false);
  };

  useEffect(() => {
    startGame();
  }, []);

  // Handle card matching logic
  useEffect(() => {
    if (!firstCard || !secondCard) return;

    setDisabled(true);
    const newTurns = turns + 1;
    setTurns(newTurns);

    if (firstCard.id === secondCard.id) {
      // Match found!
      playSound("match");
      setCards((prev) =>
        prev.map((card) =>
          card.id === firstCard.id ? { ...card, matched: true } : card,
        ),
      );
      setMatches((prev) => prev + 1);
      resetTurn();
    } else {
      // No match - flip back after delay
      playSound("mismatch");
      const timer = setTimeout(resetTurn, 900);
      return () => clearTimeout(timer);
    }
  }, [secondCard]);

  // Check win condition
  useEffect(() => {
    if (cards.length === 0) return;

    if (cards.every((card) => card.matched) && matches > 0) {
      setWon(true);
      playSound("win");

      // Update best score
      if (bestScore === null || turns < bestScore) {
        setBestScore(turns);
        localStorage.setItem("memoryGameBestScore", turns);
      }
    }
  }, [matches, cards, turns, bestScore]);

  const handleChoice = (card) => {
    if (
      disabled ||
      card.matched ||
      firstCard?.uniqueId === card.uniqueId ||
      (firstCard && secondCard)
    ) {
      return;
    }

    firstCard ? setSecondCard(card) : setFirstCard(card);
  };

  const resetTurn = () => {
    setFirstCard(null);
    setSecondCard(null);
    setDisabled(false);
  };

  const playSound = (type) => {
    // Simple sound using Web Audio API
    const audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === "match") {
      oscillator.frequency.value = 800;
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2,
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } else if (type === "mismatch") {
      oscillator.frequency.value = 300;
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.15,
      );
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99]; // C, E, G
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
  };

  const totalCards = cards.length;
  const progress =
    totalCards > 0 ? Math.round((matches / (totalCards / 2)) * 100) : 0;

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
        {/* Background with animated gradient */}
        <div className="animated-background"></div>

        {/* Header */}
        <header className="game-header">
          <div className="header-content">
            <h1 className="game-title">
              <span className="emoji">🧠</span>
              Memory Match
            </h1>
            <p className="game-subtitle">Test your memory skills</p>
          </div>

          {/* Stats */}
          <div className="stats-container">
            <div className="stat-card">
              <span className="stat-label">Lượt chơi</span>
              <span className="stat-value">{turns}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Cặp tìm được</span>
              <span className="stat-value">{matches}</span>
            </div>
            {bestScore !== null && (
              <div className="stat-card best-score">
                <span className="stat-label">🏆 Tốt nhất</span>
                <span className="stat-value">{bestScore}</span>
              </div>
            )}
          </div>
        </header>

        {/* Progress bar */}
        {!won && totalCards > 0 && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="progress-text">{progress}% hoàn thành</p>
          </div>
        )}

        {/* Game Board */}
        <main className="game-board">
          <div className="cards-grid">
            {cards.map((card) => {
              const flipped =
                card === firstCard || card === secondCard || card.matched;

              return (
                <div key={card.uniqueId} className="card-wrapper">
                  <div
                    className={`flip-card ${flipped ? "flipped" : ""} ${
                      card.matched ? "matched" : ""
                    } ${disabled ? "disabled" : ""}`}
                    onClick={() => handleChoice(card)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Card ${card.uniqueId}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleChoice(card);
                      }
                    }}
                  >
                    <div className="flip-card-inner">
                      <div className="flip-card-front">
                        <span className="card-emoji">✨</span>
                      </div>

                      <div className="flip-card-back">
                        <img
                          src={card.image}
                          alt={card.name || "card"}
                          className="card-image"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Win Screen */}
        {won && (
          <div className="win-overlay">
            <div className="win-card animate-pop-in">
              <div className="confetti"></div>
              <h2 className="win-title">🎉 Chúc mừng! 🎉</h2>
              <p className="win-message">
                Bạn thắng sau <strong>{turns}</strong> lượt chơi
              </p>
              {bestScore === turns && (
                <p className="win-record">🏆 Đây là kỷ lục mới!</p>
              )}
              <button className="btn-play-again" onClick={startGame}>
                Chơi lại
              </button>
            </div>
          </div>
        )}

        {/* New Game Button (always visible) */}
        <footer className="game-footer">
          <button className="btn-new-game" onClick={startGame}>
            ↻ Ván chơi mới
          </button>
        </footer>
      </div>
    </>
  );
}
