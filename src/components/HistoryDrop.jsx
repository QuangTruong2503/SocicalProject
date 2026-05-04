import '../styles/HistoryDrop.css';

export default function HistoryDrop({ history, onSelectHistory }) {
  if (!history || history.length === 0) return null; // Ẩn nếu chưa có lịch sử

  return (
    <div className="history-drop">
      <div className="history-drop-body">
        <label className="history-drop-label">
          <span className="history-drop-icon">⏱️</span>
          Lịch sử phiên:
        </label>
        <select 
          className="history-drop-select"
          onChange={(e) => onSelectHistory(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>-- Chọn sản phẩm đã tạo để xem lại --</option>
          {history.map(item => (
            <option key={item.id} value={item.id}>
              {item.timestamp} - {item.productName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}