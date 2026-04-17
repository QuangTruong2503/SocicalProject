import React, { useState } from 'react';
import UserActivitiesTable from '../components/UserActivitiesTable.jsx';
import { ArrowLeft, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ActivitiesPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-vh-100 py-4" style={{background: 'linear-gradient(135deg, #f5f5f5 0%, #f0f0f0 100%)'}}>
      <div className="container-fluid px-3 px-md-4">
        {/* Header with back button */}
        <div className="mb-4 d-flex align-items-center justify-content-between">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-link text-primary text-decoration-none d-flex align-items-center gap-2"
          >
            <ArrowLeft size={20} />
            <span className="fw-medium">Quay lại</span>
          </button>
        </div>

        {/* Main content */}
        <UserActivitiesTable />

        {/* Info section */}
        <div className="mt-4 p-4 bg-info-light border border-info rounded">
          <div className="d-flex gap-3">
            <Info className="text-info flex-shrink-0" style={{marginTop: '2px'}} size={20} />
            <div>
              <h3 className="fw-semibold text-info-emphasis mb-2">Thông tin bảng Lịch sử hoạt động</h3>
              <ul className="text-info-emphasis mb-0">
                <li>• <strong>Hành động:</strong> Loại hoạt động (đăng ký, xem profile, cập nhật trạng thái, v.v.)</li>
                <li>• <strong>Người dùng:</strong> Tên đăng nhập và tên đầy đủ của người dùng</li>
                <li>• <strong>Module:</strong> Phần hệ thống liên quan (auth, user, v.v.)</li>
                <li>• <strong>Mô tả:</strong> Chi tiết hoạt động</li>
                <li>• <strong>IP Address:</strong> Địa chỉ IP của người thực hiện hoạt động</li>
                <li>• <strong>Trạng thái:</strong> Trạng thái của người dùng (Xanh=Hoạt động, Xám=Không hoạt động, Đỏ=Bị cấm)</li>
                <li>• <strong>Thời gian:</strong> Thời điểm hoạt động xảy ra</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivitiesPage;
