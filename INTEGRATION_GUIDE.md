# Integration Guide - User Activities Table Component

## 🎯 Bước-Bước Tích Hợp

### 1️⃣ Đảm Bảo Dependencies Đã Cài Đặt

```bash
# Lucide Icons
npm list lucide-react

# Nếu chưa có, cài đặt:
npm install lucide-react

# Tailwind CSS (đã có trong project)
npm list tailwindcss
```

### 2️⃣ Server Endpoints Đã Được Thêm Vào

Kiểm tra file [server/index.cjs](server/index.cjs) có chứa:
- ✅ `POST /api/register` - Đăng ký người dùng
- ✅ `GET /api/users/{user_id}` - Lấy profile
- ✅ `PUT /api/users/{user_id}/status` - Cập nhật status
- ✅ `GET /api/activities` - Lấy danh sách hoạt động (MỚI)
- ✅ `GET /api/activities/modules` - Lấy danh sách modules (MỚI)

### 3️⃣ API Service Functions Đã Được Thêm Vào

Kiểm tra file [src/api/userService.js](src/api/userService.js) có chứa:
- ✅ `registerUser(userData)`
- ✅ `getUserProfile(userId)`
- ✅ `updateUserStatus(userId, status)`
- ✅ `getActivities(options)` (MỚI)
- ✅ `getActivityModules()` (MỚI)

### 4️⃣ Components Đã Được Tạo

| Component | Đường dẫn | Mô Tả |
|-----------|----------|-------|
| UserActivitiesTable | `src/components/UserActivitiesTable.jsx` | Bảng hoạt động chính |
| ActivitiesPage | `src/pages/ActivitiesPage.jsx` | Trang demo |

### 5️⃣ Thêm Route Trong App.jsx

```jsx
import ActivitiesPage from '@/pages/ActivitiesPage';

// Thêm route
<Route path="/activities" element={<ActivitiesPage />} />
```

**Hoặc nhập trực tiếp component vào trang hiện có:**

```jsx
import UserActivitiesTable from '@/components/UserActivitiesTable';

export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <UserActivitiesTable />
    </div>
  );
}
```

### 6️⃣ Kiểm Tra Server Đang Chạy

```bash
# Terminal 1: Start server
npm run sv

# Output:
# 🚀 Server đang chạy tại port 5000
# ✅ Đã kết nối MySQL an toàn qua SSL!
```

### 7️⃣ Khởi Động Development Server

```bash
# Terminal 2: Start React dev server
npm run dev

# Truy cập: http://localhost:5173/activities
```

---

## 📋 Component Props

Component `UserActivitiesTable` hiện tại không nhận props, tất cả settings là internal state:

```jsx
// Sử dụng cơ bản (không có props)
<UserActivitiesTable />
```

### 🔮 Có thể mở rộng trong tương lai:

```jsx
// Props có thể được thêm vào:
<UserActivitiesTable
  initialModule="auth"           // Filter module ban đầu
  initialSearch="john"           // Search ban đầu
  itemsPerPage={25}              // Số dòng mỗi trang
  showExport={true}              // Hiển thị nút export
  onActivityClick={(activity) => {}} // Callback khi click row
/>
```

---

## 🗂️ Cấu Trúc Thư Mục Sau Khi Thêm

```
src/
├── components/
│   ├── UserActivitiesTable.jsx          [MỚI]
│   ├── Header.jsx
│   ├── Footer.jsx
│   └── ...
├── pages/
│   ├── ActivitiesPage.jsx               [MỚI]
│   ├── AISEO.jsx
│   ├── Watermark.jsx
│   └── ...
├── api/
│   └── userService.js                   [CẬP NHẬT]
└── ...

server/
└── index.cjs                             [CẬP NHẬT]
```

---

## 🧪 Test Component

### 1. Trực Tiếp Trong Browser

1. Mở: `http://localhost:5173/activities`
2. Kiểm tra:
   - ✅ Bảng hoạt động hiển thị
   - ✅ Tìm kiếm hoạt động
   - ✅ Lọc theo module
   - ✅ Thay đổi trang
   - ✅ Xuất CSV

### 2. Với Test File

```bash
# Chạy test file (nếu có Node.js CLI)
node USER_API_TESTS.js
```

### 3. Với Postman

```
GET http://localhost:5000/api/activities
GET http://localhost:5000/api/activities/modules
```

---

## 🎨 Customization Examples

### Thay Đổi Màu Header

File: `src/components/UserActivitiesTable.jsx`

```jsx
// Dòng 269: Thay đổi gradient
<div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-8">
  // Thành:
<div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-8">
```

### Thay Đổi Màu Status Badge

```jsx
// Dòng 66-77: Chỉnh sửa statusMap
const statusMap = {
  active: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    // ...
  },
};
```

### Thay Đổi Số Dòng Mặc Định

```jsx
// Dòng 222: Thay đổi default
const [itemsPerPage, setItemsPerPage] = useState(10);
  // Thành:
const [itemsPerPage, setItemsPerPage] = useState(25);
```

---

## 🐛 Common Issues & Solutions

### ❌ "Cannot find module 'lucide-react'"
**Giải pháp:**
```bash
npm install lucide-react
```

### ❌ "API not found" / 404 errors
**Giải pháp:**
1. Kiểm tra server đang chạy: `npm run sv`
2. Kiểm tra port 5000 có mở không
3. Kiểm tra database connection

### ❌ Bảng trống (không có dữ liệu)
**Giải pháp:**
1. Kiểm tra database có bản ghi trong user_activities
2. Chạy test để tạo dữ liệu: `node USER_API_TESTS.js`
3. Kiểm tra console log cho lỗi API

### ❌ CSS không áp dụng (unstyled)
**Giải pháp:**
1. Kiểm tra Tailwind CSS import trong main.jsx
2. Kiểm tra tailwind.config.js content paths
3. Rebuild: `npm run dev`

### ❌ Icons hiển thị sai hoặc không hiển thị
**Giải pháp:**
1. Kiểm tra lucide-react version: `npm list lucide-react`
2. Cập nhật: `npm install lucide-react@latest`
3. Restart dev server

---

## 📊 Database Query Reference

### Lấy danh sách activities với JOIN

```sql
SELECT 
    ua.activity_id,
    ua.user_id,
    ua.action,
    ua.module,
    ua.description,
    ua.ip_address,
    ua.user_agent,
    ua.created_at,
    u.username,
    u.full_name,
    u.status,
    u.email
FROM user_activities ua
LEFT JOIN users u ON ua.user_id = u.user_id
WHERE 1=1
  AND ua.module = 'auth'
  AND u.username LIKE '%john%'
ORDER BY ua.created_at DESC
LIMIT 10 OFFSET 0;
```

### Lấy danh sách modules

```sql
SELECT DISTINCT module 
FROM user_activities 
WHERE module IS NOT NULL
ORDER BY module ASC;
```

---

## 🔄 Update User Activities Table

Component tự động thực hiện các hành động sau và ghi log vào user_activities:

| Hành Động | Module | Description | Log? |
|-----------|--------|-------------|------|
| Register | auth | Đăng ký tài khoản | ✅ |
| View Profile | user | Xem thông tin profile | ✅ |
| Update Status | user | Cập nhật trạng thái | ✅ |

---

## 📝 Environment Setup

Kiểm tra file `.env` hoặc `config.cjs`:

```env
DATABASE_HOST=your-host
DATABASE_PORT=3306
DATABASE_NAME=your-db
DATABASE_USER=your-user
DATABASE_PASSWORD=your-password
DATABASE_SSL_CA=certificate-content

PORT=5000
```

---

## 🚀 Production Deployment

### Trước khi deploy:

1. ✅ Kiểm tra tất cả dependencies: `npm list`
2. ✅ Build project: `npm run build`
3. ✅ Test endpoints với real data
4. ✅ Kiểm tra environment variables
5. ✅ Kiểm tra database performance với large datasets

### Optimizations:

- Thêm caching cho `/api/activities/modules`
- Thêm rate limiting cho `/api/activities`
- Thêm authentication/authorization
- Thêm database indexes:

```sql
CREATE INDEX idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX idx_user_activities_module ON user_activities(module);
CREATE INDEX idx_user_activities_created_at ON user_activities(created_at DESC);
```

---

## 📚 Tài Liệu Tham Khảo

| Document | Nội Dung |
|----------|---------|
| [USER_API_DOCUMENTATION.md](USER_API_DOCUMENTATION.md) | API endpoints & usage |
| [USER_ACTIVITIES_COMPONENT.md](USER_ACTIVITIES_COMPONENT.md) | Component details |
| [USER_API_TESTS.js](USER_API_TESTS.js) | Test cases |

---

## ✅ Checklist Hoàn Thành

- [ ] Cài đặt lucide-react
- [ ] Kiểm tra server endpoints
- [ ] Kiểm tra API functions
- [ ] Thêm route trong App.jsx
- [ ] Start server: `npm run sv`
- [ ] Start dev: `npm run dev`
- [ ] Test component trên browser
- [ ] Kiểm tra tìm kiếm và lọc
- [ ] Kiểm tra xuất CSV
- [ ] Kiểm tra pagination
- [ ] Kiểm tra responsive design

---

## 🎓 Learning Resources

### Tailwind CSS
- https://tailwindcss.com/docs

### Lucide Icons
- https://lucide.dev/

### React Hooks
- https://react.dev/reference/react/hooks

### MySQL JOINs
- https://dev.mysql.com/doc/refman/8.0/en/join.html

---

## 💬 Questions?

Nếu có câu hỏi hoặc vấn đề, vui lòng:
1. Kiểm tra documentation
2. Kiểm tra browser console
3. Kiểm tra server logs
4. Liên hệ team phát triển
