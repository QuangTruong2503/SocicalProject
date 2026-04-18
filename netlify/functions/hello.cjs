const { json } = require('./utils/db.cjs');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { success: false, error: 'Method not allowed' });
  }

  return json(200, { message: 'Xin chào từ server!' });
};