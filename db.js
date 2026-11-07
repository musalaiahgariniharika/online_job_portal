require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'niha123',
  database: process.env.DB_NAME || 'apartment_visitor_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

// Test connection helper
pool.testConnection = async function() {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return { success: true, message: 'Connected to MySQL successfully' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

module.exports = pool;
