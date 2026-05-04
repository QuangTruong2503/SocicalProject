import React, { useRef } from 'react';
import '../styles/ProductForm.css';

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
    <div className="product-form-card">
      <h5 className="product-form-title">📦 Thông tin Sản phẩm & Tùy chọn</h5>
      
      <div className="product-form-group">
        <label className="product-form-label">Tên sản phẩm</label>
        <input type="text" className="product-form-input" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="VD: Máy khoan pin..." disabled={isLoading} />
      </div>
      
      <div className="product-form-group">
        <label className="product-form-label">Thông số kỹ thuật</label>
        <textarea className="product-form-textarea" rows="3" value={specs} onChange={(e) => setSpecs(e.target.value)} placeholder="Nhập thông số chi tiết..." disabled={isLoading}></textarea>
      </div>

      <div className="product-form-group">
        <label className="product-form-label">URL ảnh sản phẩm (mỗi dòng 1 URL)</label>
        <textarea
          className="product-form-textarea"
          rows="2"
          value={imageUrls}
          onChange={(e) => setImageUrls(e.target.value)}
          placeholder="https://example.com/image1.jpg\nhttps://example.com/image2.jpg"
          disabled={isLoading}
        ></textarea>
      </div>

      {/* KHU VỰC TỪ KHÓA SEO & ẢNH */}
      <div className="product-form-group">
        <div className="product-form-label-with-link">
          <label className="product-form-label">Keywords liên quan</label>
          <span className="product-form-upload-link" onClick={() => fileInputRef.current.click()}>
            🖼️ Tải ảnh lên
          </span>
        </div>
        <input type="file" accept="image/*" className="product-form-file-input" ref={fileInputRef} onChange={handleFileChange} />
        
        <div className="product-form-keywords-wrapper">
          <textarea 
            className="product-form-textarea" 
            rows="2" 
            value={keywords} 
            onChange={(e) => setKeywords(e.target.value)} 
            onPaste={handlePaste}
            placeholder="Nhập từ khóa hoặc Ctrl+V (dán) ảnh chụp màn hình chứa từ khóa vào đây..." 
            disabled={isLoading || isExtracting}
          ></textarea>
          
          {isExtracting && (
            <div className="product-form-extracting-status">
              <div className="product-form-btn-spinner"></div>
              Đang đọc ảnh...
            </div>
          )}
        </div>
      </div>

      {/* Khu vực Checkbox chọn nền tảng */}
      <div className="product-form-platforms">
        <label className="product-form-platforms-label">Mục tiêu tạo nội dung:</label>
        <div className="product-form-platforms-grid">
          <label className="product-form-checkbox">
            <input type="checkbox" name="website" checked={selectedPlatforms.website} onChange={handleCheckboxChange} />
            <span>🌐 Website SEO</span>
          </label>
          <label className="product-form-checkbox">
            <input type="checkbox" name="youtube" checked={selectedPlatforms.youtube} onChange={handleCheckboxChange} />
            <span>▶️ YouTube</span>
          </label>
          <label className="product-form-checkbox">
            <input type="checkbox" name="facebook" checked={selectedPlatforms.facebook} onChange={handleCheckboxChange} />
            <span>📘 Facebook</span>
          </label>
          <label className="product-form-checkbox">
            <input type="checkbox" name="tiktok" checked={selectedPlatforms.tiktok} onChange={handleCheckboxChange} />
            <span>🎵 TikTok</span>
          </label>
        </div>
      </div>

      <button className="product-form-btn" onClick={onGenerate} disabled={isLoading || isExtracting || !productName || !isAnyPlatformSelected}>
        {isLoading ? (
          <>
            <span className="product-form-btn-spinner"></span>
            Đang tạo nội dung...
          </>
        ) : (
          <>
            ✨ Tạo nội dung tự động
          </>
        )}
      </button>
    </div>
  );
}