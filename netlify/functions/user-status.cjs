const { v4: uuidv4 } = require('uuid');
const { createConnection, parseJsonBody, json } = require('./utils/db.cjs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'PUT') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  const user_id = event.queryStringParameters?.user_id;
  if (!user_id || !user_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    return json(400, { success: false, error: 'ID người dùng không hợp lệ' });
  }

  const body = parseJsonBody(event);
  if (!body) {
    return json(400, { success: false, error: 'Invalid JSON body' });
  }

  const { status, ip_address, user_agent } = body;
  const validStatus = ['active', 'inactive', 'banned'];
  if (!status || !validStatus.includes(status)) {
    return json(400, { success: false, error: 'Trạng thái không hợp lệ' });
  }

  const connection = await createConnection();
  try {
    const [users] = await connection.execute(
      'SELECT username FROM users WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      return json(404, { success: false, error: 'Không tìm thấy người dùng' });
    }

    await connection.execute(
      'UPDATE users SET status = ?, updated_at = NOW() WHERE user_id = ?',
      [status, user_id]
    );

    const activityId = uuidv4();
    await connection.execute(
      'INSERT INTO user_activities (activity_id, user_id, action, module, description, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [activityId, user_id, 'update_status', 'user', `Cập nhật trạng thái thành ${status}`, ip_address || '', user_agent || '']
    );

    return json(200, { success: true, message: 'Cập nhật trạng thái thành công' });
  } catch (error) {
    console.error('Update status error:', error);
    return json(500, { success: false, error: 'Lỗi server: ' + error.message });
  } finally {
    await connection.end();
  }
};