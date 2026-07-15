const mysql = require("mysql2/promise");
require("dotenv").config();

const BASE_TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(10),
  color VARCHAR(10),
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  type ENUM('income','expense') NOT NULL,
  category_id INT,
  note TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
`;

const DEFAULT_CATEGORIES = [
  ["Food & Dining", "🍔", "#FF6B6B"],
  ["Transport", "🚗", "#4ECDC4"],
  ["Shopping", "🛍️", "#45B7D1"],
  ["Bills & Utilities", "🧾", "#96CEB4"],
  ["Entertainment", "🎬", "#FECA57"],
  ["Healthcare", "💊", "#FF9FF3"],
  ["Education", "📚", "#48DBFB"],
  ["Salary", "💰", "#54A0FF"],
  ["Freelance", "💼", "#5F27CD"],
  ["Other", "📦", "#C8D6E5"],
];

async function run() {
  console.log(`Connecting to ${process.env.DB_HOST}:${process.env.DB_PORT} / ${process.env.DB_NAME} ...`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });

  console.log("Connected. Creating base tables...");
  await conn.query(BASE_TABLES);
  console.log("✅ users, categories, transactions created");

  const [existing] = await conn.query("SELECT COUNT(*) AS count FROM categories WHERE user_id IS NULL");
  if (existing[0].count === 0) {
    for (const [name, icon, color] of DEFAULT_CATEGORIES) {
      await conn.query(
        "INSERT INTO categories (name, icon, color, user_id) VALUES (?, ?, ?, NULL)",
        [name, icon, color]
      );
    }
    console.log("✅ default categories seeded");
  } else {
    console.log("↷ default categories already present, skipping seed");
  }

  await conn.end();
  console.log("\nBase schema done. Now applying v2 migration (budgets, agent memory, health scores, alerts)...\n");

  require("./migrate.js");
}

run().catch(err => {
  console.error("❌ Init failed:", err.message);
  process.exit(1);
});