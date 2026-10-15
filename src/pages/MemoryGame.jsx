import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { FiPause, FiPlay, FiRefreshCw, FiRotateCcw, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useAuth } from '../hooks/useAuth.js';
import { useMemoryAccount } from '../hooks/useMemoryAccount.js';
import { useMemorySound } from '../hooks/useMemorySound.js';
import { fetchPublicMemoryCards } from '../services/memoryCardService.js';
import { loadMemoryLeaderboard, revealDailyMemory, startDailyMemory } from '../services/memoryGameService.js';
import { prepareMemoryImages } from '../utils/memoryCardSources.js';
import {
  CARD_THEMES, PAIR_COUNTS, createGame, dailyGameFromServer, formatDuration,
  gameReducer, gameSnapshot, matchedPairs, modelReducer, scoreKey, vietnamDay,
} from '../utils/memoryGame.js';
import { readMemoryDocument, writeMemoryDocument } from '../utils/memoryGameStorage.js';
import fallbackCards from '../data/cards.json';
import '../styles/MemoryGame.css';

const LEVEL_NAMES = { 4: 'Dễ', 6: 'Vừa', 8: 'Khó' };
const SYNC_LABELS = {
  loading: 'Đang kết nối tài khoản…', saving: 'Đang đồng bộ…', synced: 'Đã đồng bộ với tài khoản',
  offline: 'Đã giữ trên thiết bị · chờ kết nối', unavailable: 'Đang lưu trên thiết bị',
  conflict: 'Có tiến trình khác trên tài khoản',
};
const themeName = (theme) => CARD_THEMES[theme]?.name ?? 'Bộ ảnh';
const displayDate = (value) => new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));

export default function MemoryGame() {
  const { user } = useAuth();
  if (!user?.id) return null;
  return <MemoryGamePlayer key={user.id} userId={user.id} />;
}

function MemoryGamePlayer({ userId }) {
  const [model, dispatch] = useReducer(modelReducer, userId, (id) => ({
    game: createGame(), document: readMemoryDocument(id), newRecord: false,
  }));
  const { game, document: saved, newRecord } = model;
  const account = useMemoryAccount(userId, saved, dispatch);
  const [photos, setPhotos] = useState([]);
  const [photoStatus, setPhotoStatus] = useState('loading');
  const [now, setNow] = useState(Date.now);
  const [dialog, setDialog] = useState(null);
  const [dismissedWin, setDismissedWin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dailyError, setDailyError] = useState('');
  const [dailyNotice, setDailyNotice] = useState('');
  const [ranking, setRanking] = useState([]);
  const [rankingStatus, setRankingStatus] = useState('loading');
  const [rankingRequest, refreshRanking] = useReducer((n) => n + 1, 0);
  const networkBusy = useRef(false);
  const requests = useRef(new Set());
  const boardRef = useRef(null);
  const mounted = useRef(false);
  const day = vietnamDay(new Date(now));
  useMemorySound(saved.sound, game.event, game.id);

  useEffect(() => {
    mounted.current = true;
    const activeRequests = requests.current;
    return () => {
      mounted.current = false;
      activeRequests.forEach((controller) => controller.abort());
      activeRequests.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    async function load() {
      const remote = await fetchPublicMemoryCards(controller.signal);
      if (controller.signal.aborted) return;
      const checked = await prepareMemoryImages(remote.error ? fallbackCards : remote.data, { signal: controller.signal });
      if (controller.signal.aborted) return;
      // Update the next-game catalog only. A running board is never regenerated.
      setPhotos(checked.length >= 4 ? checked : []);
      setPhotoStatus(checked.length >= 4 ? 'ready' : 'unavailable');
      window.clearTimeout(timeout);
    }
    controller.signal.addEventListener('abort', () => {
      if (mounted.current) setPhotoStatus('unavailable');
    }, { once: true });
    load();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      dispatch({ type: 'tick', now: time });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!game.lockUntil) return;
    const timer = window.setTimeout(() => dispatch({ type: 'clear', gameId: game.id, now: Date.now() }), Math.max(0, game.lockUntil - Date.now()) + 10);
    return () => window.clearTimeout(timer);
  }, [game.id, game.lockUntil]);

  useEffect(() => {
    if (game.status === 'paused' && !dialog && !globalThis.document.hidden) {
      boardRef.current?.querySelector('.mg-pause-panel button')?.focus();
    }
  }, [game.status, dialog]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (game.verified) return;
      if (globalThis.document.hidden) dispatch({ type: 'pause', now: Date.now() });
      else if (game.status === 'paused') boardRef.current?.querySelector('.mg-pause-panel button')?.focus();
    };
    const saveOnExit = () => {
      if (game.verified) return;
      const paused = gameReducer(game, { type: 'pause', now: Date.now() });
      writeMemoryDocument(userId, { ...saved, active: game.status === 'ready' ? saved.active : gameSnapshot(paused), updatedAt: Date.now() });
    };
    globalThis.document.addEventListener('visibilitychange', pauseWhenHidden);
    window.addEventListener('pagehide', saveOnExit);
    return () => {
      globalThis.document.removeEventListener('visibilitychange', pauseWhenHidden);
      window.removeEventListener('pagehide', saveOnExit);
    };
  }, [game, saved, userId]);

  const rankedWin = game.verified && game.status === 'won' ? game.id : null;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const result = await loadMemoryLeaderboard(day, controller.signal);
      if (controller.signal.aborted) return;
      if (result.error) setRankingStatus(result.unavailable ? 'unavailable' : 'offline');
      else { setRanking(result.data ?? []); setRankingStatus('ready'); }
    }
    load();
    return () => controller.abort();
  }, [day, rankedWin, rankingRequest]);

  const runRequest = useCallback(async (operation) => {
    if (networkBusy.current) return null;
    networkBusy.current = true;
    setBusy(true);
    const controller = new AbortController();
    requests.current.add(controller);
    try { return await operation(controller.signal); }
    finally {
      requests.current.delete(controller);
      networkBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const startDaily = useCallback(async () => {
    setDailyError('');
    const result = await runRequest((signal) => startDailyMemory(signal));
    if (!mounted.current || !result) return;
    if (result.error) {
      if (game.verified) {
        setDailyError('Chưa tải lại được thử thách. Ván xếp hạng vẫn được giữ trên tài khoản; hãy thử lại khi có mạng.');
        return;
      }
      dispatch({ type: 'new', game: createGame({ mode: 'daily', pairCount: 6, day: vietnamDay() }), now: Date.now() });
      setDailyNotice('Bạn đang chơi thử thách ở chế độ luyện tập. Kết quả được lưu riêng và không lên bảng xếp hạng.');
    } else {
      dispatch({ type: 'server', game: dailyGameFromServer(result.data), now: Date.now() });
      setDailyNotice('Mỗi tài khoản có một lượt thử thách xếp hạng mỗi ngày. Thời gian tính liên tục từ thẻ đầu tiên, kể cả khi rời trang.');
    }
    setDismissedWin(null);
  }, [runRequest, game.verified]);

  const chooseCard = useCallback(async (index) => {
    if (networkBusy.current || game.status === 'paused' || game.status === 'won' || game.second !== null
      || game.cards[index]?.matched || index === game.first) return;
    if (!game.verified) { dispatch({ type: 'choose', index, now: Date.now() }); return; }
    setDailyError('');
    const result = await runRequest(async (signal) => {
      const revealed = await revealDailyMemory(game.id, index, signal);
      if (!revealed.error) return revealed;
      // A response may be lost after a committed flip. Reload server state.
      const reconciled = await startDailyMemory(signal);
      return reconciled.error ? revealed : reconciled;
    });
    if (!mounted.current || !result) return;
    if (result.error) setDailyError('Chưa nhận được trạng thái mới. Hãy kiểm tra kết nối rồi tải lại ván thử thách.');
    else dispatch({ type: 'server', game: dailyGameFromServer(result.data), now: Date.now() });
  }, [game, runRequest]);

  const requestChange = (operation, title = 'Bắt đầu ván mới?') => {
    if (busy) return;
    if ((game.status !== 'won' && game.status !== 'ready') || (game.status === 'ready' && saved.active)) {
      const wasPlaying = game.status === 'playing' && !game.verified;
      if (wasPlaying) dispatch({ type: 'pause', now: Date.now() });
      setDialog({ operation, title, wasPlaying });
    } else operation();
  };

  const newFreeGame = async (theme = game.theme, pairCount = game.pairCount) => {
    if (networkBusy.current) return;
    let source = photos;
    if (theme === 'photos') {
      const result = await runRequest(async (parentSignal) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        parentSignal.addEventListener('abort', abort, { once: true });
        const timeout = window.setTimeout(abort, 20000);
        try {
          const catalog = await fetchPublicMemoryCards(controller.signal);
          if (catalog.error || controller.signal.aborted) return { error: true };
          const cards = await prepareMemoryImages(catalog.data, { signal: controller.signal });
          return controller.signal.aborted ? { error: true } : { cards };
        } finally {
          window.clearTimeout(timeout);
          parentSignal.removeEventListener('abort', abort);
        }
      });
      if (!mounted.current || !result) return;
      if (result.error) { setDailyNotice('Chưa cập nhật được bộ ảnh. Ván hiện tại được giữ nguyên; hãy thử lại khi có mạng.'); return; }
      source = result.cards;
      setPhotos(source.length >= 4 ? source : []);
      setPhotoStatus(source.length >= 4 ? 'ready' : 'unavailable');
    }
    const nextTheme = theme === 'photos' && source.length < 4 ? 'animals' : theme;
    const nextCount = nextTheme === 'photos' ? Math.min(pairCount, source.length >= 8 ? 8 : source.length >= 6 ? 6 : 4) : pairCount;
    dispatch({ type: 'new', game: createGame({ theme: nextTheme, pairCount: nextCount, source: nextTheme === 'photos' ? source : undefined }), now: Date.now() });
    setDailyNotice(nextTheme !== theme ? 'Bộ ảnh chưa đủ 4 ảnh tải được. Ván mới sử dụng chủ đề Động vật.' : nextCount !== pairCount ? 'Bộ ảnh đã thay đổi. Độ khó được điều chỉnh theo số ảnh hiện có.' : '');
    setDailyError('');
    setDismissedWin(null);
    queueMicrotask(() => boardRef.current?.querySelector('button')?.focus());
  };

  const resumeSaved = () => {
    const snapshot = saved.active;
    if (!snapshot) return;
    dispatch({ type: 'restore', game: snapshot, now: Date.now() });
    setDailyError('');
    setDailyNotice(snapshot.mode === 'daily' ? 'Đây là ván thử thách luyện tập được lưu trên thiết bị.' : '');
    setDismissedWin(null);
  };

  const closeConfirmation = () => {
    if (dialog.wasPlaying) dispatch({ type: 'resume', now: Date.now() });
    setDialog(null);
  };
  const resumeGame = () => {
    dispatch({ type: 'resume', now: Date.now() });
    queueMicrotask(() => boardRef.current?.querySelector('button:not(:disabled)')?.focus());
  };
  const matches = matchedPairs(game);
  const progress = Math.round(matches / game.pairCount * 100);
  const elapsed = game.verified && game.status === 'playing'
    ? game.elapsedMs + Math.max(0, now - game.lastTick) : game.elapsedMs;
  const best = saved.records[scoreKey(game)];
  const winOpen = game.status === 'won' && dismissedWin !== game.id && !dialog;
  const canResume = saved.active && saved.active.id !== game.id;
  const accuracy = game.turns ? Math.round(matches / game.turns * 100) : 0;

  return (
    <>
      <Helmet>
        <title>Ghép thẻ trí nhớ · Memory Match</title>
        <meta name="description" content="Ghép các cặp thẻ, chọn độ khó và tham gia thử thách trí nhớ hằng ngày." />
      </Helmet>
      <div className="mg-page">
        <div className="mg-shell">
          <header className="mg-header">
            <div>
              <span className="mg-eyebrow">Một chút thư giãn, một chút thử thách</span>
              <h1><span aria-hidden="true">🧠</span> Ghép thẻ trí nhớ</h1>
              <p id="mg-instructions">Lật hai thẻ để tìm cặp giống nhau. Hoàn thành với ít lượt nhất.</p>
            </div>
            <button type="button" className="mg-icon-button" aria-pressed={saved.sound}
              aria-label={saved.sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
              onClick={() => dispatch({ type: 'sound', value: !saved.sound, now: Date.now() })}>
              {saved.sound ? <FiVolume2 aria-hidden="true" /> : <FiVolumeX aria-hidden="true" />}
            </button>
          </header>

          <div className="mg-toolbar">
            <fieldset className="mg-levels" disabled={busy || game.verified}>
              <legend>Độ khó</legend>
              {PAIR_COUNTS.map((count) => (
                <button type="button" key={count} aria-pressed={game.pairCount === count}
                  disabled={game.theme === 'photos' && photos.length < count}
                  onClick={() => requestChange(() => newFreeGame(game.theme, count), 'Đổi độ khó và bắt đầu ván mới?')}>
                  {LEVEL_NAMES[count]} <span>{count} cặp</span>
                </button>
              ))}
            </fieldset>
            <label className="mg-theme-label">Chủ đề
              <select value={game.theme} disabled={busy || game.verified}
                onChange={(event) => {
                  const theme = event.target.value;
                  requestChange(() => newFreeGame(theme, theme === 'photos' ? Math.min(game.pairCount, photos.length >= 8 ? 8 : photos.length >= 6 ? 6 : 4) : game.pairCount), 'Đổi chủ đề và bắt đầu ván mới?');
                }}>
                {Object.entries(CARD_THEMES).map(([key, theme]) => <option key={key} value={key}>{theme.icon} {theme.name}</option>)}
                <option value="photos" disabled={photoStatus !== 'ready'}>{photoStatus === 'loading' ? 'Đang chuẩn bị bộ ảnh…' : photoStatus === 'ready' ? `🖼️ Bộ ảnh (${photos.length} ảnh)` : 'Bộ ảnh chưa sẵn sàng'}</option>
              </select>
            </label>
            <button type="button" className="mg-primary-button" disabled={busy}
              onClick={() => requestChange(() => newFreeGame())}>
              <FiRotateCcw aria-hidden="true" /> Ván mới
            </button>
          </div>

          {canResume && game.status === 'ready' && (
            <div className="mg-notice mg-resume">
              <p>Bạn có một ván đang chơi: {themeName(saved.active.theme)}, {saved.active.pairCount} cặp · {saved.active.turns} lượt.</p>
              <button type="button" className="mg-secondary-button" onClick={resumeSaved}><FiPlay aria-hidden="true" /> Tiếp tục ván đã lưu</button>
            </div>
          )}

          <section className="mg-stats" aria-label="Thông tin ván chơi">
            <div><span>Lượt lật</span><strong>{game.turns}</strong></div>
            <div><span>Cặp đã ghép</span><strong>{matches}<small>/{game.pairCount}</small></strong></div>
            <div><span>Thời gian</span><strong>{formatDuration(elapsed)}</strong></div>
            <div><span>Kỷ lục cùng chế độ</span><strong>{best ? best.turns : '—'}<small>{best ? ' lượt' : ''}</small></strong></div>
          </section>

          <div className="mg-progress-row">
            <div className="mg-progress" role="progressbar" aria-label="Tiến độ ghép thẻ"
              aria-valuenow={matches} aria-valuemin={0} aria-valuemax={game.pairCount} aria-valuetext={`${matches}/${game.pairCount} cặp`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span>{progress}%</span>
            {!game.verified && game.status === 'playing' && (
              <button type="button" className="mg-text-button" onClick={() => dispatch({ type: 'pause', now: Date.now() })}><FiPause aria-hidden="true" /> Tạm dừng</button>
            )}
          </div>

          {game.mode === 'daily' && <div className="mg-notice"><strong>{game.verified ? '🏅 Thử thách xếp hạng' : '🧩 Thử thách luyện tập'} · {game.day}</strong><p>{dailyNotice}</p></div>}
          {game.mode !== 'daily' && dailyNotice && <p className="mg-notice" role="status">{dailyNotice}</p>}
          {dailyError && <div className="mg-notice mg-error" role="alert"><p>{dailyError}</p><button type="button" disabled={busy} className="mg-secondary-button" onClick={startDaily}>Tải lại ván thử thách</button></div>}

          <section className="mg-board" aria-label="Bàn ghép thẻ" aria-describedby="mg-instructions" ref={boardRef}>
            <div className={`mg-grid mg-grid-${game.pairCount}`} inert={game.status === 'paused'}>
              {game.cards.map((card, index) => (
                <MemoryCard key={card.key} card={card} index={index}
                  flipped={card.matched || index === game.first || index === game.second}
                  blocked={busy || game.status === 'paused' || game.status === 'won' || game.second !== null}
                  onChoice={chooseCard}
                  onImageError={() => dispatch({ type: 'image-error', pairId: card.pairId, now: Date.now() })} />
              ))}
            </div>
            {game.status === 'paused' && <div className="mg-pause-panel"><span aria-hidden="true">⏸</span><h2>Ván chơi đang tạm dừng</h2><p>Thời gian sẽ tiếp tục khi bạn chơi lại.</p><button type="button" className="mg-primary-button" onClick={resumeGame}><FiPlay aria-hidden="true" /> Chơi tiếp</button></div>}
          </section>

          <p className="mg-feedback" role="status" aria-live="polite" aria-atomic="true">{busy ? 'Đang nhận trạng thái ván chơi…' : game.event?.message ?? (game.status === 'ready' ? 'Sẵn sàng! Thời gian bắt đầu khi bạn lật thẻ đầu tiên.' : '\u00a0')}</p>
          {game.status === 'won' && !winOpen && <button type="button" className="mg-secondary-button" onClick={() => setDismissedWin(null)}>Xem kết quả ván chơi</button>}

          <section className="mg-account" aria-label="Lưu và đồng bộ tiến trình">
            <div><span className={`mg-sync-dot ${account.status === 'synced' ? 'is-synced' : ''}`} aria-hidden="true" /><span>{!account.storageAvailable && ['offline', 'unavailable'].includes(account.status) ? 'Chưa đồng bộ với tài khoản' : SYNC_LABELS[account.status]}</span></div>
            {!account.storageAvailable && <p role="alert">Trình duyệt không cho lưu trên thiết bị. Giữ trang mở cho đến khi dữ liệu được đồng bộ với tài khoản.</p>}
            {account.status === 'conflict' ? (
              <div className="mg-notice">
                <p>Một thiết bị khác có tiến trình mới. Lịch sử và kỷ lục đã được gộp; hãy chọn ván muốn tiếp tục.</p>
                <div className="mg-actions"><button type="button" className="mg-secondary-button" onClick={() => account.resolveConflict(false)}>Giữ ván trên thiết bị này</button>
                  {account.remoteGame && <button type="button" className="mg-primary-button" onClick={() => requestChange(() => account.resolveConflict(true), 'Tiếp tục ván trên tài khoản?')}>Dùng ván trên tài khoản</button>}</div>
              </div>
            ) : ['offline', 'unavailable'].includes(account.status) && <button type="button" className="mg-text-button" onClick={account.synchronize}><FiRefreshCw aria-hidden="true" /> Thử đồng bộ lại</button>}
          </section>

          <div className="mg-extras">
            <section className="mg-daily">
              <span className="mg-eyebrow">Một bàn chơi chung mỗi ngày</span>
              <h2>Thử thách hôm nay <span aria-hidden="true">🏅</span></h2>
              <p>6 cặp thẻ. Xếp hạng theo số lượt, sau đó đến thời gian. Tên trên bảng là biệt danh tự động của tài khoản.</p>
              <button type="button" className="mg-primary-button" disabled={busy} onClick={() => requestChange(startDaily, 'Mở thử thách hôm nay?')}>{game.mode === 'daily' && game.verified ? 'Tải lại / tiếp tục thử thách' : 'Chơi thử thách hôm nay'}</button>
              <div className="mg-section-heading"><h3>Bảng xếp hạng hôm nay</h3><button type="button" className="mg-icon-button" aria-label="Tải lại bảng xếp hạng" onClick={refreshRanking}><FiRefreshCw aria-hidden="true" /></button></div>
              {rankingStatus === 'loading' ? <p>Đang tải bảng xếp hạng…</p>
                : rankingStatus !== 'ready' ? <p>Bảng xếp hạng chưa kết nối được. Bạn vẫn có thể chơi thử thách luyện tập.</p>
                  : ranking.length === 0 ? <p>Chưa có kết quả hôm nay. Hãy là người đầu tiên hoàn thành!</p>
                    : <ol className="mg-ranking">{ranking.map((entry) => <li key={entry.rank} className={entry.is_mine ? 'is-mine' : ''}><span className="mg-rank">{entry.rank}</span><span>{entry.display_name}{entry.is_mine && <small> Bạn</small>}</span><strong>{entry.turns} lượt<small>{formatDuration(entry.elapsed_ms)}</small></strong></li>)}</ol>}
            </section>

            <section className="mg-history">
              <span className="mg-eyebrow">Mỗi ván là một bước tiến</span>
              <h2>Lịch sử của bạn</h2>
              <p>Kỷ lục tách theo chủ đề, độ khó và chế độ. Nếu bằng số lượt, thời gian nhanh hơn được ưu tiên.</p>
              {saved.history.length === 0 ? <div className="mg-history-empty"><span aria-hidden="true">✨</span><p>Hoàn thành ván đầu tiên để xem kết quả tại đây.</p></div>
                : <ol className="mg-history-list">{saved.history.slice(0, 10).map((result) => <li key={result.id}><div><strong>{themeName(result.theme)} · {result.pairCount} cặp</strong><span>{result.mode === 'daily' ? result.verified ? 'Thử thách xếp hạng' : 'Thử thách luyện tập' : 'Chơi tự do'} · {displayDate(result.completedAt)}</span></div><div><strong>{result.turns} lượt</strong><span>{formatDuration(result.elapsedMs)} · {Math.round(result.pairCount / result.turns * 100)}% đúng</span></div></li>)}</ol>}
            </section>
          </div>
        </div>
      </div>

      {dialog && <GameDialog title={dialog.title} onClose={closeConfirmation}>
        <p>Ván hiện tại sẽ được thay thế. Ván thử thách xếp hạng vẫn được giữ trên tài khoản để tiếp tục trong hôm nay.</p>
        <div className="mg-actions"><button type="button" className="mg-secondary-button" onClick={closeConfirmation}>Giữ ván hiện tại</button><button type="button" className="mg-primary-button" onClick={() => { const operation = dialog.operation; setDialog(null); operation(); }}>Tiếp tục</button></div>
      </GameDialog>}

      {winOpen && <GameDialog title="Bạn đã hoàn thành! 🎉" onClose={() => setDismissedWin(game.id)}>
        <p>Đã tìm được {game.pairCount} cặp trong <strong>{game.turns} lượt</strong>.</p>
        <div className="mg-result-stats"><div><span>Thời gian</span><strong>{formatDuration(game.elapsedMs)}</strong></div><div><span>Tỷ lệ ghép đúng</span><strong>{accuracy}%</strong></div></div>
        {newRecord && <p className="mg-record">🏆 Kỷ lục mới cho chế độ này!</p>}
        {game.verified && <p>Kết quả đã được ghi nhận trên bảng xếp hạng hôm nay.</p>}
        <div className="mg-actions"><button type="button" className="mg-secondary-button" onClick={() => setDismissedWin(game.id)}>Xem lại bàn</button><button type="button" className="mg-primary-button" disabled={busy} onClick={() => newFreeGame(game.theme, game.pairCount)}>{game.mode === 'daily' ? 'Chơi tự do' : 'Chơi lại'}</button></div>
      </GameDialog>}
    </>
  );
}

const MemoryCard = memo(function MemoryCard({ card, index, flipped, blocked, onChoice, onImageError }) {
  const name = flipped ? `${card.name ?? 'Thẻ'}, ${card.matched ? 'đã ghép' : 'đang mở'}` : 'chưa mở';
  return <button type="button" className={`mg-card ${flipped ? 'is-flipped' : ''} ${card.matched ? 'is-matched' : ''}`}
    aria-label={`Thẻ ${index + 1}: ${name}`} aria-pressed={flipped}
    aria-disabled={blocked || card.matched} disabled={card.matched} onClick={() => { if (!blocked) onChoice(index); }}>
    <span className="mg-card-inner" aria-hidden="true">
      <span className="mg-card-front"><span className="mg-card-mark">✦</span><small>{index + 1}</small></span>
      <span className="mg-card-back">
        {card.image ? <img src={card.image} alt="" decoding="async" onError={onImageError} /> : <span className="mg-card-symbol">{card.symbol}</span>}
        {card.matched && <span className="mg-match-check">✓</span>}
      </span>
    </span>
  </button>;
});

function GameDialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = globalThis.document.activeElement;
    const overflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = 'hidden';
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('button')?.focus();
    return () => {
      if (dialog.open && dialog.close) dialog.close();
      globalThis.document.body.style.overflow = overflow;
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
      else globalThis.document.querySelector('.mg-toolbar .mg-primary-button')?.focus();
    };
  }, []);
  return <dialog ref={ref} className="mg-dialog" aria-labelledby="mg-dialog-title" onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0]; const last = buttons.at(-1);
      if (event.shiftKey && globalThis.document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && globalThis.document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <h2 id="mg-dialog-title">{title}</h2>{children}
  </dialog>;
}
