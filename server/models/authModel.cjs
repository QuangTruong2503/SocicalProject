const { v4: uuidv4 } = require('uuid');
const db = require('../db.cjs');

const promiseDb = db.promise();

async function findUserByUsernameOrEmail(username, email) {
    const sql = 'SELECT user_id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1';
    const [rows] = await promiseDb.query(sql, [username, email]);
    return rows[0] || null;
}

async function getUserByIdentifier(identifier) {
    const sql = `SELECT user_id, username, email, password_hash, role, status FROM users WHERE username = ? OR email = ? LIMIT 1`;
    const [rows] = await promiseDb.query(sql, [identifier, identifier]);
    return rows[0] || null;
}

async function createUser({ userId, username, email, password_hash, full_name }) {
    const sql = `INSERT INTO users (user_id, username, email, password_hash, full_name, role, status)
                 VALUES (?, ?, ?, ?, ?, 'customer', 'active')`;
    return promiseDb.query(sql, [userId, username, email, password_hash, full_name || null]);
}

async function logUserActivity({ userId, action, module, description, ip_address, user_agent }) {
    const activityId = uuidv4();
    const sql = `INSERT INTO user_activities (activity_id, user_id, action, module, description, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return promiseDb.query(sql, [activityId, userId, action, module, description, ip_address || null, user_agent || null]);
}

module.exports = {
    findUserByUsernameOrEmail,
    getUserByIdentifier,
    createUser,
    logUserActivity
};
