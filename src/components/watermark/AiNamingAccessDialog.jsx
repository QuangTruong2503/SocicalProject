import WatermarkModal from './WatermarkModal.jsx';
import { describeAiNamingAccess } from '../../utils/aiNamingAccess.js';

/** Shown instead of the AI dialog when the account may not use "Đặt tên AI". */
export default function AiNamingAccessDialog({ status, error, onRequestLogin, onRetry, onClose }) {
  const copy = describeAiNamingAccess(status, error);
  if (!copy) return null;

  return (
    <WatermarkModal
      onClose={onClose}
      labelledBy="wm-ai-access-title"
      describedBy="wm-ai-access-message"
      backdropClassName="wm-bulk-rename-backdrop"
      className="wm-bulk-rename-modal wm-ai-access-modal"
    >
      <div className="wm-bulk-rename-header">
        <div className="wm-bulk-rename-heading">
          <span className="wm-bulk-rename-hero-icon" aria-hidden="true">AI</span>
          <div>
            <span className="wm-bulk-rename-eyebrow">Đặt tên bằng AI</span>
            <strong id="wm-ai-access-title">{copy.title}</strong>
          </div>
        </div>
        <button className="wm-bulk-rename-close" type="button" onClick={onClose} aria-label="Đóng">×</button>
      </div>
      <p className="wm-ai-access-message" id="wm-ai-access-message">{copy.message}</p>
      {copy.note && <p className="wm-ai-access-note">{copy.note}</p>}
      <div className="wm-bulk-rename-actions">
        <span />
        <div className="wm-bulk-rename-action-buttons">
          {status === 'signed_out' && (
            <>
              <button className="wm-bulk-rename-cancel" type="button" onClick={onClose}>Để sau</button>
              <button className="wm-bulk-rename-confirm" type="button" onClick={onRequestLogin} data-dialog-initial>Đăng nhập</button>
            </>
          )}
          {status === 'error' && (
            <>
              <button className="wm-bulk-rename-cancel" type="button" onClick={onClose}>Đóng</button>
              <button className="wm-bulk-rename-confirm" type="button" onClick={onRetry} data-dialog-initial>Thử lại</button>
            </>
          )}
          {status === 'denied' && (
            <button className="wm-bulk-rename-confirm" type="button" onClick={onClose} data-dialog-initial>Đã hiểu</button>
          )}
        </div>
      </div>
    </WatermarkModal>
  );
}
