import React from 'react';

export default function ProductForm({ productName, setProductName, specs, setSpecs, onGenerate, isLoading }) {
  return (
    <div className="card mb-4 shadow-sm">
      <div className="card-body">
        <h5 className="card-title text-primary mb-3">📦 Thông tin Sản phẩm</h5>
        <div className="mb-3">
          <label className="form-label fw-bold">Tên sản phẩm</label>
          <input
            type="text"
            className="form-control"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="VD: Máy khoan pin Dekton..."
            disabled={isLoading}
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-bold">Thông số kỹ thuật</label>
          <textarea
            className="form-control"
            rows="4"
            value={specs}
            onChange={(e) => setSpecs(e.target.value)}
            placeholder="Nhập thông số chi tiết..."
            disabled={isLoading}
          ></textarea>
        </div>
        <button 
          className="btn btn-primary w-100 py-2 fw-bold" 
          onClick={onGenerate} 
          disabled={isLoading || !productName}
        >
          {isLoading ? (
            <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Đang tạo nội dung...</>
          ) : (
            '✨ Tạo nội dung tự động'
          )}
        </button>
      </div>
    </div>
  );
}