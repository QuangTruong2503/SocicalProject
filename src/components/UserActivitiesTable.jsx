import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Shield,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Download,
  MapPin,
  Globe
} from 'lucide-react';
import { getActivities, getActivityModules } from '../api/userService.js';

const UserActivitiesTable = () => {
  // State
  const [activities, setActivities] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [searchUsername, setSearchUsername] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Pagination state
  const [totalItems, setTotalItems] = useState(0);

  // Load modules dropdown
  useEffect(() => {
    const loadModules = async () => {
      try {
        const response = await getActivityModules();
        if (response.success) {
          setModules(response.data);
        }
      } catch (err) {
        console.error('Lỗi tải modules:', err);
      }
    };
    loadModules();
  }, []);

  // Fetch activities
  const fetchActivities = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * itemsPerPage;

      const response = await getActivities({
        module: selectedModule,
        username: searchUsername || null,
        limit: itemsPerPage,
        offset: offset
      });

      if (response.success) {
        setActivities(response.data);
        setTotalItems(response.pagination.total);
        setCurrentPage(page);
      } else {
        setError('Không thể tải dữ liệu hoạt động');
      }
    } catch (err) {
      setError(err.message || 'Lỗi khi tải dữ liệu');
      console.error('Lỗi fetch activities:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load data on mount and when filters change
  useEffect(() => {
    fetchActivities(1);
  }, [selectedModule, searchUsername, itemsPerPage]);

  // Status badge component
  const StatusBadge = ({ status }) => {
    const statusMap = {
      active: {
        bg: 'bg-success',
        text: 'text-white',
        icon: CheckCircle,
        label: 'Hoạt động'
      },
      inactive: {
        bg: 'bg-secondary',
        text: 'text-white',
        icon: Clock,
        label: 'Không hoạt động'
      },
      banned: {
        bg: 'bg-danger',
        text: 'text-white',
        icon: AlertCircle,
        label: 'Bị cấm'
      }
    };

    const config = statusMap[status] || statusMap.inactive;
    const Icon = config.icon;

    return (
      <div className={`d-inline-flex align-items-center gap-2 px-2 py-1 rounded-pill ${config.bg} ${config.text} fs-6 fw-medium`}>
        <Icon size={14} />
        {config.label}
      </div>
    );
  };

  // Action icon component
  const ActionIcon = ({ action }) => {
    const actionMap = {
      register: { icon: User, color: 'text-primary' },
      view_profile: { icon: Shield, color: 'text-info' },
      update_status: { icon: AlertCircle, color: 'text-warning' },
      login: { icon: Globe, color: 'text-success' },
      logout: { icon: Globe, color: 'text-muted' }
    };

    const config = actionMap[action] || { icon: Clock, color: 'text-muted' };
    const Icon = config.icon;

    return <Icon size={16} className={config.color} />;
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Format time ago
  const getTimeAgo = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  // Pagination calculations
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Export to CSV
  const handleExport = () => {
    const headers = ['Activity ID', 'Username', 'Full Name', 'Action', 'Module', 'Description', 'IP Address', 'Created At'];
    const rows = activities.map(activity => [
      activity.activity_id,
      activity.username || 'N/A',
      activity.full_name || 'N/A',
      activity.action,
      activity.module || 'N/A',
      activity.description || 'N/A',
      activity.ip_address || 'N/A',
      formatTime(activity.created_at)
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activities_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="w-100 bg-white rounded shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-4 py-5" style={{background: 'linear-gradient(to right, #0d6efd, #0dcaf0)'}}>
        <div className="d-flex align-items-center justify-content-between mb-4">
          <div>
            <h1 className="fs-2 fw-bold text-white d-flex align-items-center gap-3">
              <Clock size={32} />
              Lịch sử hoạt động
            </h1>
            <p className="text-white-50 mt-2">Theo dõi các hoạt động của người dùng trong hệ thống</p>
          </div>
          <button
            onClick={() => fetchActivities(currentPage)}
            disabled={loading}
            className="btn btn-transparent p-2 text-white"
            style={{backgroundColor: 'rgba(255, 255, 255, 0.2)', border: 'none', cursor: 'pointer'}}
            title="Làm mới dữ liệu"
          >
            <RefreshCw size={24} className={`text-white ${loading ? 'spinner' : ''}`} style={{animation: loading ? 'spin 1s linear infinite' : 'none'}} />
          </button>
        </div>

        {/* Filters */}
        <div className="row g-3">
          {/* Search by username */}
          <div className="col-12 col-md-4 position-relative">
            <Search size={18} className="position-absolute" style={{left: '12px', top: '12px', color: '#6c757d'}} />
            <input
              type="text"
              placeholder="Tìm kiếm theo username..."
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              className="form-control ps-4"
              style={{backgroundColor: 'rgba(255, 255, 255, 0.9)', border: 'none'}}
            />
          </div>

          {/* Filter by module */}
          <div className="col-12 col-md-4 position-relative">
            <Filter size={18} className="position-absolute" style={{left: '12px', top: '12px', color: '#6c757d'}} />
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="form-select ps-4"
              style={{backgroundColor: 'rgba(255, 255, 255, 0.9)', border: 'none'}}
            >
              <option value="all">Tất cả modules</option>
              {modules.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
          </div>

          {/* Items per page */}
          <div className="col-12 col-md-4">
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
              className="form-select"
              style={{backgroundColor: 'rgba(255, 255, 255, 0.9)', border: 'none'}}
            >
              <option value={10}>10 dòng</option>
              <option value={25}>25 dòng</option>
              <option value={50}>50 dòng</option>
              <option value={100}>100 dòng</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="m-4 p-3 bg-danger-light border border-danger rounded d-flex align-items-center gap-3 text-danger">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="d-flex align-items-center justify-content-center py-5">
          <div className="d-flex flex-column align-items-center gap-3">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Đang tải...</span>
            </div>
            <p className="text-muted fw-medium">Đang tải dữ liệu...</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && activities.length > 0 && (
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Hành động</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Người dùng</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Module</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Mô tả</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">IP Address</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Trạng thái</th>
                <th className="ps-4 py-3 text-start fs-6 fw-semibold text-muted">Thời gian</th>
              </tr>
            </thead>
            <tbody className="table-group-divider">
              {activities.map((activity, index) => (
                <tr key={activity.activity_id}>
                  {/* Action */}
                  <td className="ps-4 py-3">
                    <div className="d-flex align-items-center gap-2">
                      <ActionIcon action={activity.action} />
                      <span className="fs-6 fw-medium text-dark text-capitalize">
                        {activity.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>

                  {/* Username */}
                  <td className="ps-4 py-3">
                    <div className="d-flex flex-column">
                      <span className="fs-6 fw-semibold text-dark">
                        {activity.username || 'N/A'}
                      </span>
                      <span className="fs-7 text-muted">
                        {activity.full_name || 'Không có tên'}
                      </span>
                    </div>
                  </td>

                  {/* Module */}
                  <td className="ps-4 py-3">
                    <span className="badge bg-info">
                      {activity.module || 'N/A'}
                    </span>
                  </td>

                  {/* Description */}
                  <td className="ps-4 py-3 fs-6 text-muted text-truncate" title={activity.description}>
                    {activity.description || '-'}
                  </td>

                  {/* IP Address */}
                  <td className="ps-4 py-3">
                    <div className="d-flex align-items-center gap-2 fs-6 text-muted">
                      {activity.ip_address ? (
                        <>
                          <MapPin size={14} className="text-muted-light" />
                          {activity.ip_address}
                        </>
                      ) : (
                        <span className="text-muted-light">-</span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="ps-4 py-3">
                    {activity.status && (
                      <StatusBadge status={activity.status} />
                    )}
                  </td>

                  {/* Time */}
                  <td className="ps-4 py-3">
                    <div className="d-flex flex-column">
                      <span className="fs-6 fw-medium text-dark">
                        {formatTime(activity.created_at)}
                      </span>
                      <span className="fs-7 text-muted">
                        {getTimeAgo(activity.created_at)} ago
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && activities.length === 0 && (
        <div className="d-flex flex-column align-items-center justify-content-center py-5 text-center">
          <Clock size={48} className="text-muted-light mb-3" />
          <h3 className="fs-5 fw-semibold text-dark mb-2">Không có dữ liệu</h3>
          <p className="text-muted">Không tìm thấy hoạt động nào phù hợp với bộ lọc hiện tại</p>
        </div>
      )}

      {/* Pagination and Footer */}
      {!loading && activities.length > 0 && (
        <div className="px-4 py-3 bg-light border-top d-flex align-items-center justify-content-between">
          {/* Info */}
          <div className="fs-6 text-muted">
            Hiển thị <span className="fw-semibold">{(currentPage - 1) * itemsPerPage + 1}</span> đến{' '}
            <span className="fw-semibold">
              {Math.min(currentPage * itemsPerPage, totalItems)}
            </span>{' '}
            trong <span className="fw-semibold">{totalItems}</span> hoạt động
          </div>

          {/* Controls */}
          <div className="d-flex align-items-center gap-3">
            {/* Export button */}
            <button
              onClick={handleExport}
              className="btn btn-sm btn-link text-info text-decoration-none"
              title="Xuất dữ liệu ra CSV"
            >
              <Download size={16} className="me-2" />
              Xuất CSV
            </button>

            {/* Pagination */}
            <div className="d-flex align-items-center gap-1">
              <button
                onClick={() => fetchActivities(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1 || loading}
                className="btn btn-sm p-2 text-muted"
                style={{backgroundColor: 'transparent', border: 'none', cursor: 'pointer'}}
              >
                <ChevronLeft size={18} />
              </button>

              <div className="d-flex align-items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => fetchActivities(pageNum)}
                      className={`btn btn-sm ${
                        currentPage === pageNum
                          ? 'btn-primary'
                          : 'btn-light text-muted'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => fetchActivities(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages || loading}
                className="btn btn-sm p-2 text-muted"
                style={{backgroundColor: 'transparent', border: 'none', cursor: 'pointer'}}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserActivitiesTable;
