# Quick Reference - User Activities Table

## 🚀 Get Started in 60 Seconds

### Step 1: Install Dependencies
```bash
npm install lucide-react
npm install -D tailwindcss postcss autoprefixer
```

### Step 2: Start Backend
```bash
npm run sv
```

### Step 3: Start Frontend
```bash
npm run dev
```

### Step 4: View Component
Open: `http://localhost:5173/activities`

---

## 📚 Import in Your Component

```jsx
import UserActivitiesTable from '@/components/UserActivitiesTable';

export default function Dashboard() {
  return <UserActivitiesTable />;
}
```

---

## 🎯 Key Features at a Glance

| Feature | Status | Details |
|---------|--------|---------|
| Display Activities | ✅ | JOIN user_activities + users |
| Search Username | ✅ | Real-time LIKE search |
| Filter by Module | ✅ | Dynamic dropdown from DB |
| Pagination | ✅ | 10/25/50/100 items per page |
| Status Colors | ✅ | Green/Gray/Red badges |
| Export CSV | ✅ | Download as CSV file |
| Responsive | ✅ | Mobile-first design |
| Icons | ✅ | Lucide React icons |

---

## 📊 Table Columns

1. **Hành động** - Type of action with icon
2. **Người dùng** - Username + Full Name
3. **Module** - Activity module (auth, user, etc.)
4. **Mô tả** - Activity description
5. **IP Address** - Client IP with icon
6. **Trạng thái** - Color-coded status badge
7. **Thời gian** - Formatted date + relative time

---

## 🎨 Status Colors

```
🟢 Active   = Green badge  (Hoạt động)
⚫ Inactive = Gray badge   (Không hoạt động)
🔴 Banned   = Red badge    (Bị cấm)
```

---

## 📡 API Endpoints

```javascript
// Get activities with filters
GET /api/activities?module=auth&username=john&limit=10&offset=0

// Get available modules
GET /api/activities/modules

// Create activity (automatic when user performs action)
POST /api/register
PUT /api/users/{id}/status
GET /api/users/{id}
```

---

## 🧪 Quick Test

### Test in Browser Console
```javascript
// Import service
import { getActivities, getActivityModules } from '@/api/userService';

// Get activities
const activities = await getActivities({ limit: 10 });
console.log(activities);

// Get modules
const modules = await getActivityModules();
console.log(modules);
```

### Test with cURL
```bash
curl http://localhost:5000/api/activities
curl http://localhost:5000/api/activities/modules
```

---

## ⚙️ Component Props (Current)

Component doesn't accept props currently. All settings are internal:

```jsx
<UserActivitiesTable />
```

---

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| No data shown | Start server: `npm run sv` |
| Styling broken | Check Tailwind config & App.css |
| Icons missing | Install lucide: `npm install lucide-react` |
| API error | Check browser console & server logs |
| Pagination broken | Verify database has data |

---

## 📂 File Locations

```
Component:           src/components/UserActivitiesTable.jsx
Page Demo:           src/pages/ActivitiesPage.jsx
API Service:         src/api/userService.js
Backend Endpoints:   server/index.cjs
Styles:             src/styles/App.css
Config:             tailwind.config.js
```

---

## 🔧 Customize Colors

**File:** `src/components/UserActivitiesTable.jsx` (line ~66)

```javascript
const statusMap = {
  active: {
    bg: 'bg-green-100',      // Change here
    text: 'text-green-800',  // Change here
    // ...
  }
};
```

---

## 📊 Database Schema Used

```sql
-- user_activities table
activity_id (UUID)
user_id (UUID) - Foreign Key to users
action (VARCHAR) - register, view_profile, update_status
module (VARCHAR) - auth, user, admin, etc.
description (TEXT) - Details of action
ip_address (VARCHAR) - Client IP
user_agent (TEXT) - Browser info
created_at (TIMESTAMP)

-- users table (joined)
username (VARCHAR)
full_name (VARCHAR)
status (ENUM) - active, inactive, banned
```

---

## 🚀 Advanced Usage

### Filter Only Auth Module
```javascript
const activities = await getActivities({ 
  module: 'auth',
  limit: 50 
});
```

### Search for Specific User
```javascript
const activities = await getActivities({ 
  username: 'john_doe',
  limit: 50 
});
```

### Combine Filters
```javascript
const activities = await getActivities({ 
  module: 'user',
  username: 'admin',
  limit: 25,
  offset: 50  // Page 3 with 25 items per page
});
```

---

## 📈 Performance Tips

1. **Pagination:** Don't load all records at once
2. **Filters:** Use specific filters to reduce data
3. **Indexes:** Add database indexes on:
   - `user_id`
   - `module`
   - `created_at`

---

## 🔐 Security Notes

- ✅ Password hashed with bcrypt
- ✅ UUID validation on backend
- ✅ SQL injection protected
- ⚠️ Add authentication middleware for production
- ⚠️ Add authorization checks
- ⚠️ Add rate limiting

---

## 📚 Documentation Files

1. **USER_API_DOCUMENTATION.md** - Full API reference
2. **USER_ACTIVITIES_COMPONENT.md** - Component details
3. **INTEGRATION_GUIDE.md** - Step-by-step setup
4. **IMPLEMENTATION_SUMMARY.md** - What was created
5. **This file** - Quick reference

---

## 🎯 Next Steps

1. ✅ Install dependencies
2. ✅ Start server & dev server
3. ✅ Test in browser
4. ✅ Customize if needed
5. ✅ Deploy to production

---

**Need help?** Check the documentation files or terminal logs.
