import { useEffect, useRef, useState } from 'react';
import { FaCheck, FaPause, FaPlay, FaRotateLeft } from 'react-icons/fa6';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { loadAvatarFrames, useAvatarFrames } from '../../hooks/useAvatarFrames.js';
import { useMotionPreferences } from '../../hooks/useFrameMotion.js';
import { frameLayerProps, resolveAvatarFrame } from '../../utils/avatarFrames.js';
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from '../../utils/userProfile.js';
import styles from './Dashboard.module.css';

const NO_FRAME = { id: null, name: 'Không dùng khung', image_url: '' };
const SKELETONS = 6;

/**
 * Dashboard → Avatar: pick a frame. Picking only changes the preview here;
 * "Áp dụng" saves it to the account, and every avatar on the site follows.
 */
export default function AvatarFramePicker({ id }) {
  const { user, profile, latestUpload, isAvatarReady, updateAvatarFrame } = useAuth();
  const catalog = useAvatarFrames(false);
  // `touched: false` follows the saved frame (also when the profile loads late).
  const [draft, setDraft] = useState({ touched: false, id: null });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ tone: '', text: '' });
  const [isPaused, setIsPaused] = useState(false);
  const { reducedMotion } = useMotionPreferences();
  const saveLock = useRef(false);

  useEffect(() => {
    // Fresh list on open, so frames disabled meanwhile are no longer offered.
    if (user?.id) loadAvatarFrames();
  }, [user?.id]);

  const savedId = profile?.avatar_frame_id ?? null;
  const selectedId = draft.touched ? draft.id : savedId;
  const isDirty = selectedId !== savedId;
  const frames = catalog.frames;
  const savedFrame = resolveAvatarFrame(savedId, frames);
  const selectedFrame = selectedId ? resolveAvatarFrame(selectedId, frames) : NO_FRAME;
  const isSavedUnavailable = Boolean(savedId) && catalog.status === 'ready' && !savedFrame;
  const isFirstLoad = frames.length === 0 && (catalog.status === 'idle' || catalog.status === 'loading');
  const options = [NO_FRAME, ...frames];
  const isAnimatedPreview = selectedFrame?.frame_type === 'animated';

  const avatar = {
    src: getUserAvatarUrl(user, profile, latestUpload),
    alt: getUserDisplayName(user, profile),
    initials: getUserInitials(user, profile),
    isReady: isAvatarReady,
  };

  function pick(id) {
    if (saveLock.current) return;
    setDraft({ touched: true, id });
    setFeedback({ tone: '', text: '' });
  }

  async function apply() {
    if (saveLock.current || !isDirty) return;
    saveLock.current = true;
    setIsSaving(true);
    setFeedback({ tone: '', text: '' });

    try {
      const result = await updateAvatarFrame(selectedId);

      if (result.error) {
        // Keep the pick so the user can retry; refresh the list if the frame was just disabled.
        setFeedback({ tone: 'error', text: result.error });
        if (result.code === '22023') loadAvatarFrames();
        return;
      }

      setDraft({ touched: false, id: null });
      setFeedback({ tone: 'success', text: selectedId ? 'Đã áp dụng khung avatar.' : 'Đã gỡ khung avatar.' });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section id={id} className={`dashboard-panel ${styles.framePanel}`} aria-labelledby="avatar-frame-title">
      <div className="dashboard-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Trang trí</span>
          <h3 id="avatar-frame-title">Khung Avatar</h3>
        </div>
        <span className="dashboard-panel-chip">{savedFrame ? savedFrame.name : 'Không khung'}</span>
      </div>

      <div className={styles.frameLayout}>
        <div className={styles.framePreview}>
          <div className={styles.framePreviewAvatar}>
            <UserAvatar {...avatar} {...frameLayerProps(selectedFrame)} frameAnimate={!isPaused} />
          </div>
          <p>
            <span>Xem trước</span>
            <strong>{selectedFrame?.name || NO_FRAME.name}</strong>
          </p>
          <small>{isDirty ? 'Chưa lưu. Bấm “Áp dụng” để dùng khung này.' : 'Đây là khung đang dùng.'}</small>
          {isAnimatedPreview && (
            <div className={styles.motionControl}>
              <button
                type="button"
                className="dashboard-ghost-btn dashboard-icon-btn"
                onClick={() => setIsPaused((value) => !value)}
                disabled={reducedMotion}
                aria-pressed={isPaused}
              >
                {isPaused ? <FaPlay aria-hidden="true" /> : <FaPause aria-hidden="true" />}
                {isPaused ? 'Phát' : 'Tạm dừng'}
              </button>
              {reducedMotion && <small>Thiết bị đang bật giảm chuyển động nên khung hiển thị ảnh tĩnh.</small>}
            </div>
          )}
        </div>

        <div className={styles.frameChooser}>
          {isSavedUnavailable && (
            <p className="dashboard-panel-note" role="status">
              Khung bạn đang dùng đã ngừng hoạt động nên avatar đang hiển thị không khung. Hãy chọn khung khác hoặc “Không dùng khung”.
            </p>
          )}

          {catalog.status === 'error' && (
            <div className={styles.inlineError} role="alert">
              <span>{catalog.error}</span>
              <button type="button" onClick={() => loadAvatarFrames()}>Thử lại</button>
            </div>
          )}

          {isFirstLoad ? (
            <div className={styles.frameGrid} aria-busy="true" aria-label="Đang tải danh sách khung">
              {Array.from({ length: SKELETONS }, (_, index) => (
                <span key={index} className={`${styles.skeleton} ${styles.frameSkeleton}`} />
              ))}
            </div>
          ) : (
            <fieldset className={styles.frameFieldset} disabled={isSaving}>
              <legend className={styles.srOnly}>Chọn khung avatar</legend>
              <div className={styles.frameGrid}>
                {options.map((frame) => {
                  const isSelected = selectedId === frame.id;
                  const isSaved = savedId === frame.id;

                  return (
                    <label
                      key={frame.id ?? 'none'}
                      className={`${styles.frameOption} ${isSelected ? styles.frameOptionSelected : ''}`}
                    >
                      <input
                        type="radio"
                        name="avatar-frame"
                        className={styles.srOnly}
                        checked={isSelected}
                        onChange={() => pick(frame.id)}
                      />
                      <span className={styles.frameThumb}>
                        {/* Stills only: the list never plays every animation at once. */}
                        <UserAvatar {...avatar} {...frameLayerProps(frame, { still: true })} />
                      </span>
                      <span className={styles.frameName}>{frame.name}</span>
                      {frame.frame_type === 'animated' && <span className={styles.frameMotionBadge}>Động</span>}
                      {isSaved && <span className={styles.frameBadge}>Đang dùng</span>}
                      {isSelected && <FaCheck className={styles.frameCheck} aria-hidden="true" />}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {catalog.status === 'ready' && frames.length === 0 && (
            <p className={styles.mutedText}>Hiện chưa có khung nào được bật. Quay lại sau nhé.</p>
          )}

          {feedback.text && (
            <div
              className={feedback.tone === 'error' ? 'dashboard-inline-error' : 'dashboard-inline-success'}
              role={feedback.tone === 'error' ? 'alert' : 'status'}
            >
              {feedback.text}
            </div>
          )}

          {/* Sticks to the bottom of the screen on phones, so "Áp dụng" stays in reach while scrolling the grid. */}
          <div className={`dashboard-panel-actions ${styles.frameActions}`}>
            <span className={styles.frameActionsPreview} aria-hidden="true">
              <span className={styles.frameMiniAvatar}>
                <UserAvatar {...avatar} {...frameLayerProps(selectedFrame, { still: true })} />
              </span>
              <span>
                <small>{isDirty ? 'Chưa lưu' : 'Đang dùng'}</small>
                <strong>{selectedFrame?.name || NO_FRAME.name}</strong>
              </span>
            </span>
            <button
              type="button"
              className={`dashboard-ghost-btn dashboard-icon-btn ${styles.frameUndo}`}
              onClick={() => setDraft({ touched: false, id: null })}
              disabled={!isDirty || isSaving}
              aria-label="Hoàn tác"
              title="Hoàn tác"
            >
              <FaRotateLeft aria-hidden="true" />
              <span>Hoàn tác</span>
            </button>
            <button
              type="button"
              className="dashboard-solid-btn"
              onClick={apply}
              disabled={!isDirty || isSaving || !user}
              aria-busy={isSaving}
            >
              {isSaving ? 'Đang lưu…' : 'Áp dụng'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
