import React, { useState } from 'react';
import { predefinedCompanies } from '../utils/companyData';
import '../styles/CompanyConfig.css';

export default function CompanyConfig({ companyInfo, setCompanyInfo }) {
  // Trạng thái quản lý giá trị đang được chọn trong Dropdown
  const [selectedCompanyId, setSelectedCompanyId] = useState('minh-tam');

  // Hàm xử lý khi người dùng chọn một công ty từ Dropdown
  const handleSelectChange = (e) => {
    const compId = e.target.value;
    setSelectedCompanyId(compId);

    if (compId !== 'custom') {
      // Tìm công ty được chọn và cập nhật vào text area
      const selected = predefinedCompanies.find(comp => comp.id === compId);
      if (selected) {
        setCompanyInfo(selected.details);
      }
    } else {
      // Nếu chọn "Tùy chỉnh", làm trống để người dùng tự nhập
      setCompanyInfo('');
    }
  };

  // Hàm xử lý khi người dùng chỉnh sửa trực tiếp vào textarea
  const handleTextareaChange = (e) => {
    setCompanyInfo(e.target.value);
    // Tự động chuyển dropdown về chế độ "Tùy chỉnh" nếu nội dung bị sửa tay
    setSelectedCompanyId('custom');
  };

  return (
    <div className="company-config-card">
      <div className="company-config-header">
        <h5>🏢 Cấu hình Thông tin Công ty</h5>
      </div>
      <div className="company-config-body">
        
        {/* Dropdown chọn công ty */}
        <div className="company-config-group">
          <label className="company-config-label">Chọn nhanh công ty:</label>
          <select 
            className="company-config-select" 
            value={selectedCompanyId} 
            onChange={handleSelectChange}
          >
            {predefinedCompanies.map(comp => (
              <option key={comp.id} value={comp.id}>
                {comp.name}
              </option>
            ))}
            <option value="custom">-- Nhập thông tin tùy chỉnh --</option>
          </select>
        </div>

        {/* Textarea hiển thị và cho phép chỉnh sửa */}
        <div className="company-config-group">
          <label className="company-config-label">Chi tiết thông tin (có thể chỉnh sửa):</label>
          <textarea
            className="company-config-textarea"
            rows="5"
            value={companyInfo}
            onChange={handleTextareaChange}
            placeholder="Nhập hoặc chỉnh sửa thông tin công ty để chèn vào nội dung AI..."
          ></textarea>
        </div>
        
        <div className="company-config-hint">
          <span>ℹ️</span>
          <span>Thông tin trong khung chữ nhật trên sẽ được tự động chèn vào nội dung Website và Facebook.</span>
        </div>
      </div>
    </div>
  );
}