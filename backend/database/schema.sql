CREATE DATABASE IF NOT EXISTS finance_tracker;
USE finance_tracker;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  icon VARCHAR(10),
  color VARCHAR(10),
  user_id INT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE transactions (
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

INSERT INTO categories (name, icon, color, user_id) VALUES
('Food & Dining', '🍔', '#FF6B6B', NULL),
('Transport', '🚗', '#4ECDC4', NULL),
('Shopping', '🛍️', '#45B7D1', NULL),
('Bills & Utilities', '🧾', '#96CEB4', NULL),
('Entertainment', '🎬', '#FECA57', NULL),
('Healthcare', '💊', '#FF9FF3', NULL),
('Education', '📚', '#48DBFB', NULL),
('Salary', '💰', '#54A0FF', NULL),
('Freelance', '💼', '#5F27CD', NULL),
('Other', '📦', '#C8D6E5', NULL);