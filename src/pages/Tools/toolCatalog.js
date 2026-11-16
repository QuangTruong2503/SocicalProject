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
];

export function filterTools(tools, query, category) {
  const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const term = normalize(query.trim());
  return tools.filter((tool) => (category === 'all' || tool.category === category)
    && normalize(`${tool.name} ${tool.description} ${tool.keywords}`).includes(term));
}
