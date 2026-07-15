-- ============================================================
-- AI Finance Agent — Schema V2 (MySQL)
-- Session 7: Agent Memory, Health Scores, Budgets, Alerts
-- Run in: phpMyAdmin → finance_tracker → SQL tab
-- ============================================================

-- ─────────────────────────────────────────────
-- EXTEND: transactions table
-- ─────────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_recurring  BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_url   TEXT,
  ADD COLUMN IF NOT EXISTS currency      VARCHAR(10)  DEFAULT 'INR';

-- ─────────────────────────────────────────────
-- NEW TABLE: budgets
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT            NOT NULL,
  category_id    INT            NOT NULL,
  monthly_limit  DECIMAL(12,2)  NOT NULL,
  month          DATE           NOT NULL,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_budget (user_id, category_id, month),
  FOREIGN KEY (user_id)     REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)  ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- NEW TABLE: agent_memory
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_memory (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  memory_key    VARCHAR(100) NOT NULL,
  memory_value  TEXT         NOT NULL,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_memory (user_id, memory_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- NEW TABLE: financial_health_scores
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_health_scores (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT            NOT NULL,
  score           DECIMAL(5,2)   NOT NULL,
  breakdown_json  JSON,
  calculated_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- NEW TABLE: alerts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  type          VARCHAR(50)  NOT NULL,
  message       TEXT         NOT NULL,
  metadata_json JSON,
  is_read       BOOLEAN      DEFAULT FALSE,
  triggered_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- NEW TABLE: audit_logs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          ,
  action      VARCHAR(20)  NOT NULL,
  entity      VARCHAR(50)  NOT NULL,
  entity_id   INT,
  old_value   JSON,
  new_value   JSON,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────
-- NEW TABLE: recurring_transactions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT            NOT NULL,
  title        VARCHAR(200)   NOT NULL,
  amount       DECIMAL(12,2)  NOT NULL,
  category_id  INT,
  frequency    VARCHAR(20)    NOT NULL DEFAULT 'monthly',
  next_due     DATE           NOT NULL,
  is_active    BOOLEAN        DEFAULT TRUE,
  currency     VARCHAR(10)    DEFAULT 'INR',
  notes        TEXT,
  created_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)       ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id)  ON DELETE SET NULL
);

-- ─────────────────────────────────────────────
-- NEW TABLE: agent_conversations
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  role        VARCHAR(20)  NOT NULL,
  content     TEXT         NOT NULL,
  tool_calls  JSON,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
