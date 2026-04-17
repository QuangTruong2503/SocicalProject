# User Activities Table Component Documentation

## 📋 Tổng Quan

Component `UserActivitiesTable` là một bảng tương tác hiển thị lịch sử hoạt động của người dùng trong hệ thống. Nó tích hợp dữ liệu từ bảng `user_activities` và `users` (JOIN) để cung cấp thông tin toàn diện về các hoạt động.

### Tính Năng Chính:
- ✅ Hiển thị danh sách hoạt động với pagination
- ✅ Lọc theo module hoạt động
- ✅ Tìm kiếm theo username
- ✅ Hiển thị trạng thái người dùng với màu sắc khác nhau
- ✅ Xuất dữ liệu ra CSV
- ✅ Icon từ Lucide Icons cho hành động
- ✅ Giao diện thiết kế với Tailwind CSS
- ✅ Responsive design

---

## 🚀 Cách Sử Dụng

### Basic Usage

```jsx
import UserActivitiesTable from '@/components/UserActivitiesTable';

function App() {
  return (
    <div>
      <UserActivitiesTable />
    </div>
  );
}
```

### Trong một trang riêng

```jsx
import React from 'react';
import UserActivitiesTable from '@/components/UserActivitiesTable';

const ActivitiesPage = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <UserActivitiesTable />
      </div>
    </div>
  );
};

export default ActivitiesPage;
```

---

## 📊 Cột Bảng (Columns)

| Cột | Kiểu Dữ Liệu | Mô Tả |
|-----|--------------|-------|
| **Hành động** | String | Loại hoạt động (register, view_profile, update_status, v.v.) |
| **Người dùng** | String | Username và Full Name của người dùng |
| **Module** | String | Module/phần của hệ thống (auth, user, admin, v.v.) |
| **Mô tả** | Text | Chi tiết mô tả hoạt động |
| **IP Address** | String | Địa chỉ IP của người thực hiện hoạt động |
| **Trạng thái** | Enum | Trạng thái người dùng (active/inactive/banned) |
| **Thời gian** | DateTime | Thời điểm hoạt động và thời gian tương đối (ago) |

---

## 🎨 Trạng Thái Màu Sắc (Status Colors)

Bảng hiển thị trạng thái người dùng với các màu sắc khác nhau:

### Active (Hoạt động)
```
🟢 Xanh lá - bg-green-100, text-green-800
Icon: CheckCircle
```

### Inactive (Không hoạt động)
```
⚫ Xám - bg-gray-100, text-gray-800
Icon: Clock
```

### Banned (Bị cấm)
```
🔴 Đỏ - bg-red-100, text-red-800
Icon: AlertCircle
```

---

## 🔍 Bộ Lọc (Filters)

### 1. Tìm Kiếm theo Username
- **Input:** Text search field
- **Hoạt động:** Tìm kiếm LIKE trên trường `username`
- **Placeholder:** "Tìm kiếm theo username..."

### 2. Lọc theo Module
- **Input:** Dropdown select
- **Hoạt động:** Filter chính xác trên `module`
- **Tùy chọn:** Tất cả modules + danh sách động từ database

### 3. Số Lượng Dòng Mỗi Trang
- **Tùy chọn:** 10, 25, 50, 100 dòng/trang
- **Default:** 10 dòng

---

## 📡 API Endpoints

### 1. GET /api/activities
Lấy danh sách hoạt động với filter và pagination

**Query Parameters:**
```javascript
{
  module: string,      // (optional) Lọc theo module
  username: string,    // (optional) Tìm kiếm theo username
  limit: number,       // (optional) Số dòng mỗi trang, default: 50
  offset: number       // (optional) Offset để pagination, default: 0
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "activity_id": "uuid",
      "user_id": "uuid",
      "username": "john_doe",
      "full_name": "John Doe",
      "action": "register",
      "module": "auth",
      "description": "Người dùng đăng ký tài khoản mới",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "status": "active",
      "email": "john@example.com",
      "created_at": "2024-04-17T10:30:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 156
  }
}
```

### 2. GET /api/activities/modules
Lấy danh sách các modules có sẵn

**Response:**
```json
{
  "success": true,
  "data": ["auth", "user", "admin", "system", "profile"]
}
```

---

## 🔄 State Management

Component quản lý các state sau:

```javascript
// Data state
const [activities, setActivities] = useState([]);        // Danh sách hoạt động
const [modules, setModules] = useState([]);              // Danh sách modules
const [loading, setLoading] = useState(false);           // Loading state
const [error, setError] = useState(null);                // Error message

// Filter state
const [searchUsername, setSearchUsername] = useState(''); // Username tìm kiếm
const [selectedModule, setSelectedModule] = useState('all'); // Module được chọn
const [currentPage, setCurrentPage] = useState(1);       // Trang hiện tại
const [itemsPerPage, setItemsPerPage] = useState(10);    // Số dòng mỗi trang

// Pagination state
const [totalItems, setTotalItems] = useState(0);         // Tổng số item
```

---

## 🎯 Hàm Chính

### `fetchActivities(page = 1)`
Lấy danh sách hoạt động từ API

```javascript
// Tự động được gọi khi:
// - Component mount
// - Filter thay đổi
// - Người dùng chuyển trang

const fetchActivities = async (page = 1) => {
  // Set loading, call API, update state
}
```

### `handleExport()`
Xuất dữ liệu ra file CSV

```javascript
const handleExport = () => {
  // Format dữ liệu thành CSV
  // Download file với tên: activities_YYYY-MM-DD.csv
}
```

---

## 📱 Thành Phần Con (Sub-components)

### StatusBadge
Hiển thị trạng thái người dùng với icon và màu sắc

```jsx
<StatusBadge status="active" />
// Output: 🟢 Hoạt động
```

### ActionIcon
Hiển thị icon tương ứng với loại hành động

```jsx
<ActionIcon action="register" />
// Output: 👤 icon (blue)
```

---

## 🧬 Cấu Trúc Component

```
UserActivitiesTable
├── Header (Gradient)
│   ├── Tiêu đề + Icon
│   ├── Refresh button
│   └── Filters
│       ├── Search username input
│       ├── Module dropdown
│       └── Items per page select
├── Error Alert (conditionally)
├── Loading Spinner (conditionally)
├── Table
│   ├── thead (Column headers)
│   └── tbody (Data rows)
│       └── Row
│           ├── Action icon + name
│           ├── Username + Full name
│           ├── Module badge
│           ├── Description
│           ├── IP Address
│           ├── Status badge
│           └── Time (formatted + ago)
├── Empty State (conditionally)
└── Pagination Footer
    ├── Info text (showing X to Y of Z)
    ├── Export CSV button
    └── Pagination controls
```

---

## 🎨 Tailwind CSS Classes

### Colors Used
- **Primary:** indigo (600, 100, 200)
- **Success:** green (100, 800)
- **Warning:** orange (600)
- **Error:** red (100, 800)
- **Neutral:** gray (50, 100, 200, 300, 400, 500, 600, 700, 800, 900)

### Responsive Breakpoints
- **Mobile:** Default (no breakpoint)
- **Tablet & Up:** md (filters grid)
- **Desktop:** Full width with padding

---

## 📋 Lucide Icons Được Sử Dụng

| Icon | Sử Dụng |
|------|---------|
| `Search` | Search input icon |
| `Filter` | Module filter icon |
| `ChevronLeft` | Previous page button |
| `ChevronRight` | Next page button |
| `Clock` | Inactive status + time |
| `User` | Register action |
| `Shield` | View profile action |
| `AlertCircle` | Banned status + update_status action |
| `CheckCircle` | Active status |
| `RefreshCw` | Refresh button |
| `Download` | Export CSV button |
| `MapPin` | IP address |
| `Globe` | Login/logout action |

---

## ⚙️ Dependencies

```json
{
  "react": "^19.2.4",
  "lucide-react": "latest",
  "tailwindcss": "latest"
}
```

### Cài Đặt Lucide Icons
```bash
npm install lucide-react
```

---

## 🔧 Customization

### Thay Đổi Màu Sắc

```jsx
// Chỉnh sửa StatusBadge component
const statusMap = {
  active: {
    bg: 'bg-emerald-100',        // Thay từ green
    text: 'text-emerald-800',    // Thay từ green
    // ...
  },
  inactive: {
    bg: 'bg-slate-100',          // Thay từ gray
    text: 'text-slate-800',      // Thay từ gray
    // ...
  },
  banned: {
    bg: 'bg-rose-100',           // Thay từ red
    text: 'text-rose-800',       // Thay từ red
    // ...
  }
};
```

### Thay Đổi Items Mỗi Trang

```jsx
// Chỉnh sửa select options
<option value={15}>15 dòng</option>
<option value={30}>30 dòng</option>
<option value={75}>75 dòng</option>
```

### Thêm Cột Mới

```jsx
// Thêm header
<th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
  Cột mới
</th>

// Thêm cell
<td className="px-6 py-4">
  {activity.new_field}
</td>
```

---

## 🐛 Troubleshooting

### Bảng không hiển thị dữ liệu
1. Kiểm tra server có chạy trên port 5000
2. Kiểm tra database connection
3. Kiểm tra browser console để xem lỗi

### Icons không hiển thị
1. Kiểm tra lucide-react đã cài đặt
2. Kiểm tra import statements

### CSS không áp dụng
1. Kiểm tra Tailwind CSS đã configure trong tailwind.config.js
2. Kiểm tra file CSS được import trong main.jsx

---

## 📚 File Liên Quan

| File | Mô Tả |
|------|-------|
| `src/components/UserActivitiesTable.jsx` | Component chính |
| `src/pages/ActivitiesPage.jsx` | Demo page |
| `src/api/userService.js` | API functions |
| `server/index.cjs` | Backend endpoints |
| `USER_API_DOCUMENTATION.md` | API documentation |

---

## 💡 Tips & Best Practices

1. **Performance:** Component tự động paginate dữ liệu để tránh tải quá nhiều records cùng lúc
2. **User Experience:** Cung cấp feedback loading và error messages rõ ràng
3. **Accessibility:** Sử dụng semantic HTML và title attributes
4. **Mobile First:** Design responsive cho tất cả screen sizes
5. **Export:** Người dùng có thể xuất dữ liệu cho mục đích phân tích

---

## 🔐 Security Considerations

- ✅ UUID validation trên backend
- ✅ SQL injection protection (parameterized queries)
- ✅ Input sanitization (username search)
- ✅ CORS enabled (xem config)
- ⚠️ Xem xét thêm authentication/authorization cho endpoint

---

## 📞 Support

Để báo cáo lỗi hoặc đề xuất tính năng, vui lòng liên hệ team phát triển hoặc tạo issue trong repository.
