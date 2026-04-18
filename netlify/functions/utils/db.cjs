const mysql = require('mysql2/promise');
const config = require('../../../config.cjs');

const dbConfig = {
  host: process.env.DATABASE_HOST || config.database?.host,
  user: process.env.DATABASE_USER || config.database?.user,
  password: process.env.DATABASE_PASSWORD || config.database?.password,
  database: process.env.DATABASE_NAME || config.database?.name,
  port: process.env.DATABASE_PORT || config.database?.port || 3306,
  ssl: process.env.DATABASE_SSL_CA || config.database?.ssl_ca ? {
    ca: (process.env.DATABASE_SSL_CA || config.database?.ssl_ca).replace(/\\n/g, '\n'),
    rejectUnauthorized: true
  } : undefined,
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function parseJsonBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (error) {
    return null;
  }
}

function createConnection() {
  return mysql.createConnection(dbConfig);
}

module.exports = {
  createConnection,
  parseJsonBody,
  json
};