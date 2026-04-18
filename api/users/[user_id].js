const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config.cjs');

const dbConfig = {
  host: process.env.DATABASE_HOST || config.database?.host,
  user: process.env.DATABASE_USER || config.database?.user,
  password: process.env.DATABASE_PASSWORD || config.database?.password,
  database: process.env.DATABASE_NAME || config.database?.name,
  port: process.env.DATABASE_PORT || config.database?.port || 3306,
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.query;

    // Validation UUID
    if (!user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'ID người dùng không hợp lệ'
      });
    }

    const connection = await mysql.createConnection(dbConfig);

    const [users] = await connection.execute(
      'SELECT user_id, username, email, full_name, role, status, created_at, updated_at FROM users WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      await connection.end();
      return res.status(404).json({
        success: false,
        error: 'Không tìm thấy người dùng'
      });
    }

    const user = users[0];

    // Log activity
    const activityId = uuidv4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description) VALUES (?, ?, ?, ?, ?)',
      [activityId, user_id, 'view_profile', 'user', `Xem thông tin profile của ${user.username}`]
    );

    await connection.end();

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server: ' + error.message
    });
  }
}