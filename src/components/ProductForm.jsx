import React, { useRef } from 'react';

export default function ProductForm({ 
  productName, setProductName, 
  specs, setSpecs, 
  keywords, setKeywords, // Thêm state keywords
  imageUrls, setImageUrls,
  onImageUpload, isExtracting, // Thêm props xử lý ảnh
  onGenerate, isLoading, 
  selectedPlatforms, setSelectedPlatforms 
}) {
  const fileInputRef = useRef(null);

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setSelectedPlatforms(prev => ({ ...prev, [name]: checked }));
  };

  const isAnyPlatformSelected = Object.values(selectedPlatforms).some(val => val === true);

  // Xử lý sự kiện Ctrl+V trực tiếp vào textarea
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault(); // Chặn hành vi paste text mặc định
        const file = items[i].getAsFile();
        onImageUpload(file);
        break;
      }
    }
  };

  // Xử lý khi chọn file qua nút bấm
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  return (
    <div className="card mb-4 shadow-sm border-primary">
      <div className="card-body">
        <h5 className="card-title text-primary mb-3">📦 Thông tin Sản phẩm & Tùy chọn</h5>
        
        <div className="mb-3">
          <label className="form-label fw-bold">Tên sản phẩm</label>
          <input type="text" className="form-control" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="VD: Máy khoan pin..." disabled={isLoading} />
        </div>
        
        <div className="mb-3">
          <label className="form-label fw-bold">Thông số kỹ thuật</label>
          <textarea className="form-control" rows="3" value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="Nhập thông số chi tiết..." disabled={isLoading}></textarea>
        </div>

        <div className="mb-3">
          <label className="form-label fw-bold">URL ảnh sản phẩm (mỗi dòng 1 URL)</label>
          <textarea
            className="form-control"
            rows="2"
            value={imageUrls}
            onChange={(e) => setImageUrls(e.target.value)}
            placeholder="https://example.com/image1.jpg\nhttps://example.com/image2.jpg"
            disabled={isLoading}
          ></textarea>
        </div>

        {/* KHU VỰC TỪ KHÓA SEO & ẢNH */}
        <div className="mb-3 position-relative">
          <label className="form-label fw-bold d-flex justify-content-between">
            <span>Keywords liên quan</span>
            <span className="text-primary" style={{cursor: 'pointer', fontSize: '0.9rem'}} onClick={() => fileInputRef.current.click()}>
              <i className="bi bi-image"></i> Tải ảnh lên
            </span>
          </label>
          <input type="file" accept="image/*" className="d-none" ref={fileInputRef} onChange={handleFileChange} />
          
          <textarea 
            className={`form-control ${isExtracting ? 'bg-light' : ''}`} 
            rows="2" 
            value={keywords} 
            onChange={(e) => setKeywords(e.target.value)} 
            onPaste={handlePaste} // Bắt sự kiện dán ảnh
            placeholder="Nhập từ khóa hoặc Ctrl+V (dán) ảnh chụp màn hình chứa từ khóa vào đây..." 
            disabled={isLoading || isExtracting}
          ></textarea>
          
          {isExtracting && (
            <div className="position-absolute top-50 start-50 translate-middle text-primary bg-white px-3 py-1 rounded shadow-sm border">
              <span className="spinner-border spinner-border-sm me-2"></span> Đang đọc ảnh...
            </div>
          )}
        </div>

        {/* Khu vực Checkbox chọn nền tảng */}
        <div className="mb-4 p-3 bg-light rounded border border-primary-subtle">
          <label className="form-label fw-bold text-primary mb-2">Mục tiêu tạo nội dung:</label>
          <div className="d-flex flex-wrap gap-3">
            <div className="form-check"><input className="form-check-input" type="checkbox" name="website" id="chkWeb" checked={selectedPlatforms.website} onChange={handleCheckboxChange} /> <label className="form-check-label" htmlFor="chkWeb">🌐 Website SEO</label></div>
            <div className="form-check"><input className="form-check-input" type="checkbox" name="youtube" id="chkYT" checked={selectedPlatforms.youtube} onChange={handleCheckboxChange} /> <label className="form-check-label" htmlFor="chkYT">▶️ YouTube</label></div>
            <div className="form-check"><input className="form-check-input" type="checkbox" name="facebook" id="chkFB" checked={selectedPlatforms.facebook} onChange={handleCheckboxChange} /> <label className="form-check-label" htmlFor="chkFB">📘 Facebook</label></div>
            <div className="form-check"><input className="form-check-input" type="checkbox" name="tiktok" id="chkTK" checked={selectedPlatforms.tiktok} onChange={handleCheckboxChange} /> <label className="form-check-label" htmlFor="chkTK">🎵 TikTok</label></div>
          </div>
        </div>

        <button className="btn btn-primary w-100 py-2 fw-bold shadow-sm" onClick={onGenerate} disabled={isLoading || isExtracting || !productName || !isAnyPlatformSelected}>
          {isLoading ? <><span className="spinner-border spinner-border-sm me-2"></span> Đang tạo nội dung...</> : '✨ Tạo nội dung tự động'}
        </button>
      </div>
    </div>
  );
}