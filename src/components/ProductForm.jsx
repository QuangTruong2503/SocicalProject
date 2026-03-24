import React from 'react';

export default function ProductForm({ productName, setProductName, specs, setSpecs, onGenerate, isLoading, selectedPlatforms, setSelectedPlatforms }) {
  
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setSelectedPlatforms(prev => ({ ...prev, [name]: checked }));
  };

  // Kiểm tra xem có ít nhất 1 mục được chọn hay không
  const isAnyPlatformSelected = Object.values(selectedPlatforms).some(val => val === true);

  return (
    <div className="card mb-4 shadow-sm border-primary">
      <div className="card-body">
        <h5 className="card-title text-primary mb-3">📦 Thông tin Sản phẩm & Tùy chọn</h5>
        <div className="mb-3">
          <label className="form-label fw-bold">Tên sản phẩm</label>
          <input
            type="text"
            className="form-control"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="VD: Máy cắt nhôm Dekton..."
            disabled={isLoading}
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-bold">Thông số kỹ thuật</label>
          <textarea
            className="form-control"
            rows="3"
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            placeholder="Nhập thông số chi tiết..."
            disabled={isLoading}
          ></textarea>
        </div>

        {/* Khu vực Checkbox chọn nền tảng */}
        <div className="mb-4 p-3 bg-light rounded border border-primary-subtle">
          <label className="form-label fw-bold text-primary mb-2">Mục tiêu tạo nội dung:</label>
          <div className="d-flex flex-wrap gap-3">
            <div className="form-check">
              <input className="form-check-input cursor-pointer" type="checkbox" name="website" id="chkWeb" checked={selectedPlatforms.website} onChange={handleCheckboxChange} disabled={isLoading} />
              <label className="form-check-label cursor-pointer" htmlFor="chkWeb">🌐 Website SEO</label>
            </div>
            <div className="form-check">
              <input className="form-check-input cursor-pointer" type="checkbox" name="youtube" id="chkYT" checked={selectedPlatforms.youtube} onChange={handleCheckboxChange} disabled={isLoading} />
              <label className="form-check-label cursor-pointer" htmlFor="chkYT">▶️ YouTube</label>
            </div>
            <div className="form-check">
              <input className="form-check-input cursor-pointer" type="checkbox" name="facebook" id="chkFB" checked={selectedPlatforms.facebook} onChange={handleCheckboxChange} disabled={isLoading} />
              <label className="form-check-label cursor-pointer" htmlFor="chkFB">📘 Facebook</label>
            </div>
            <div className="form-check">
              <input className="form-check-input cursor-pointer" type="checkbox" name="tiktok" id="chkTK" checked={selectedPlatforms.tiktok} onChange={handleCheckboxChange} disabled={isLoading} />
              <label className="form-check-label cursor-pointer" htmlFor="chkTK">🎵 TikTok</label>
            </div>
          </div>
        </div>

        <button 
          className="btn btn-primary w-100 py-2 fw-bold shadow-sm" 
          onClick={onGenerate} 
          disabled={isLoading || !productName || !isAnyPlatformSelected}
        >
          {isLoading ? (
            <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Đang tạo nội dung...</>
          ) : (
            '✨ Tạo nội dung'
          )}
        </button>
      </div>
    </div>
  );
}