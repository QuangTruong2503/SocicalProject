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
  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.query;
    const { status, ip_address, user_agent } = req.body;

    // Validation UUID
    if (!user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return res.status(400).json({
        success: false,
        error: 'ID người dùng không hợp lệ'
      });
    }

    // Validation status
    const validStatus = ['active', 'inactive', 'banned'];
    if (!status || !validStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Trạng thái không hợp lệ'
      });
    }

    const connection = await mysql.createConnection(dbConfig);

    // Check if user exists
    const [users] = await connection.execute(
      'SELECT username FROM users WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      await connection.end();
      return res.status(404).json({
        success: false,
        error: 'Không tìm thấy người dùng'
      });
    }

    // Update status
    await connection.execute(
      'UPDATE users SET status = ?, updated_at = NOW() WHERE user_id = ?',
      [status, user_id]
    );

    // Log activity
    const activityId = uuidv4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [activityId, user_id, 'update_status', 'user', `Cập nhật trạng thái thành ${status}`, ip_address || '', user_agent || '']
    );

    await connection.end();

    res.json({
      success: true,
      message: 'Cập nhật trạng thái thành công'
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      error: 'Lỗi server: ' + error.message
    });
  }
}