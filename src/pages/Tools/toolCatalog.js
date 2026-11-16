// Add each new tool here to include it in the directory and category filters.
export const TOOL_CATALOG = [
  {
    id: 'clear-video',
    name: 'Clear Video',
    category: 'Video',
    description: 'Tìm và dọn video trong thư mục trên máy. Xem danh sách, chọn tệp và xác nhận trước khi xóa.',
    path: '/tools/clear-video',
    keywords: 'dọn xóa video thư mục dung lượng cleanup local',
    local: true,
    icon: 'video',
    previewTitle: 'Dọn video, gọn thư mục.',
    steps: ['Quét', 'Chọn', 'Dọn'],
  },
  {
    id: 'watermark',
    brandIcon: 'watermark',
    name: 'Watermark',
    category: 'Ảnh',
    description: 'Thêm logo, điều chỉnh dấu bản quyền và xuất ảnh hàng loạt. Hỗ trợ xử lý tự động cho tài khoản Pro.',
    path: '/tools/watermark',
    keywords: 'ảnh logo đóng dấu bản quyền hình image watermark',
    requiresAuth: true,
    icon: 'image',
    previewTitle: 'Ảnh của bạn, dấu ấn riêng.',
    steps: ['Chọn ảnh', 'Thêm logo', 'Xuất ảnh'],
  },
  {
    id: 'chuyen-doi-file',
    brandIcon: 'convert',
    name: 'Chuyển đổi file',
    category: 'PDF',
    description: 'Chuyển ảnh sang PDF, xuất PDF thành ảnh, gộp và tách trang PDF ngay trên trình duyệt.',
    path: '/tools/chuyen-doi-file',
    keywords: 'chuyển đổi file tệp tài liệu ảnh pdf jpg png jpeg gộp tách convert merge split',
    local: true,
    icon: 'file',
    previewTitle: 'Đúng định dạng, gọn công việc.',
    steps: ['Chọn tệp', 'Chuyển đổi', 'Tải xuống'],
  },
];

export function filterTools(tools, query, category) {
  const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const term = normalize(query.trim());
  return tools.filter((tool) => (category === 'all' || tool.category === category)
    && normalize(`${tool.name} ${tool.description} ${tool.keywords}`).includes(term));
}
