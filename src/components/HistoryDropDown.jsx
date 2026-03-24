
export default function HistoryDropdown({ history, onSelectHistory }) {
  if (!history || history.length === 0) return null; // Ẩn nếu chưa có lịch sử

  return (
    <div className="card mb-4 shadow-sm border-info">
      <div className="card-body py-2 d-flex flex-column flex-md-row align-items-md-center">
        <label className="fw-bold me-3 text-info mb-2 mb-md-0 text-nowrap">
          <i className="bi bi-clock-history me-1"></i> Lịch sử phiên:
        </label>
        <select 
          className="form-select border-info"
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