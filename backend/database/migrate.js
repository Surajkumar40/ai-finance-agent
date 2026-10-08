const db = require('../config/db');

async function migrate() {
  console.log('Running migrations...');
  try {
    // MySQL 8 does not support "ADD COLUMN IF NOT EXISTS", so check manually
    async function addColumn(table, column, definition) {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
      );
      if (rows[0].c === 0) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    }
    await addColumn('transactions', 'is_recurring', 'BOOLEAN DEFAULT FALSE');
    await addColumn('transactions', 'receipt_url', 'TEXT');
    await addColumn('transactions', 'currency', "VARCHAR(10) DEFAULT 'INR'");
    await addColumn('categories', 'color', "VARCHAR(20) DEFAULT '#6366f1'");
    await addColumn('categories', 'icon', 'VARCHAR(10)');
    console.log('✅ transactions table extended');

    await db.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        category_id INT NOT NULL,
        monthly_limit DECIMAL(12,2) NOT NULL,
        month DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_budget (user_id, category_id, month),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ budgets table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        memory_key VARCHAR(100) NOT NULL,
        memory_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_memory (user_id, memory_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ agent_memory table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS financial_health_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        score DECIMAL(5,2) NOT NULL,
        breakdown_json JSON,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ financial_health_scores table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        metadata_json JSON,
        is_read BOOLEAN DEFAULT FALSE,
        triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ alerts table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(20) NOT NULL,
        entity VARCHAR(50) NOT NULL,
        entity_id INT,
        old_value JSON,
        new_value JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ audit_logs table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        category_id INT,
        frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
        next_due DATE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        currency VARCHAR(10) DEFAULT 'INR',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      )
    `);
    console.log('✅ recurring_transactions table created');

    await db.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(10) DEFAULT '🎯',
        target_amount DECIMAL(12,2) NOT NULL,
        saved_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        target_date DATE NULL,
        completed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ savings_goals table created');
    await addColumn('recurring_transactions', 'type', "VARCHAR(10) NOT NULL DEFAULT 'expense'");
    await addColumn('recurring_transactions', 'anchor_day', 'INT');

    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        tool_calls JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ agent_conversations table created');

    console.log('\n✅ All migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();