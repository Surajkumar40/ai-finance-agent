const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Run multiple queries atomically. Pass a callback that receives a
// connection and does its queries with `conn.query(...)`.
// If the callback throws, everything is rolled back automatically.
//
// Example:
//   await withTransaction(async (conn) => {
//     await conn.query('INSERT INTO transactions ...', [...]);
//     await conn.query('UPDATE budgets ...', [...]);
//   });
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = pool;
module.exports.withTransaction = withTransaction;