CREATE DATABASE IF NOT EXISTS finance_tracker;
USE finance_tracker;

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
  color VARCHAR(20) DEFAULT '#6366f1',
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

-- Default categories (only inserted if the table is empty).
-- Names match database/seed.js
INSERT INTO categories (name, icon, color, user_id)
SELECT * FROM (
  SELECT 'Food & Dining' AS name, '🍔' AS icon, '#FF6B6B' AS color, NULL AS user_id UNION ALL
  SELECT 'Transport',         '🚗', '#4ECDC4', NULL UNION ALL
  SELECT 'Shopping',          '🛍️', '#45B7D1', NULL UNION ALL
  SELECT 'Bills & Utilities', '💡', '#96CEB4', NULL UNION ALL
  SELECT 'Entertainment',     '🎬', '#FECA57', NULL UNION ALL
  SELECT 'Healthcare',        '💊', '#FF9FF3', NULL UNION ALL
  SELECT 'Education',         '📚', '#A29BFE', NULL UNION ALL
  SELECT 'Salary',            '💰', '#54A0FF', NULL UNION ALL
  SELECT 'Freelance',         '💻', '#5F27CD', NULL UNION ALL
  SELECT 'Other',             '📦', '#C8D6E5', NULL
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM categories);
