const { v4: uuidv4 } = require('uuid');
const { createConnection, json } = require('./utils/db.cjs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const user_id = event.queryStringParameters?.user_id;
  if (!user_id || !user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return json(400, { success: false, error: 'ID người dùng không hợp lệ' });
  }

  const connection = await createConnection();
  try {
    const [users] = await connection.execute(
      'SELECT user_id, username, email, full_name, role, status, created_at, updated_at FROM users WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      return json(404, { success: false, error: 'Không tìm thấy người dùng' });
    }

    const user = users[0];
    const activityId = uuidv4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description) VALUES (?, ?, ?, ?, ?)',
      [activityId, user_id, 'view_profile', 'user', `Xem thông tin profile của ${user.username}`]
    );

    return json(200, { success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    return json(500, { success: false, error: 'Lỗi server: ' + error.message });
  } finally {
    await connection.end();
  }
};