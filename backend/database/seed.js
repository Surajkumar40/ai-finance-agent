const db = require('../config/db');

async function seed() {
  console.log('🌱 Seeding database...');
  try {
    // Get first user
    const [users] = await db.query('SELECT id FROM users LIMIT 1');
    if (users.length === 0) {
      console.log('❌ No users found. Please signup first, then run seed.');
      process.exit(1);
    }

    const userId = users[0].id;
    console.log(`✅ Seeding for user ID: ${userId}`);

    // Get categories
    const [categories] = await db.query('SELECT id, name FROM categories');
    const cat = {};
    categories.forEach(c => cat[c.name] = c.id);

    // Seed transactions — last 3 months of realistic data
    const today = new Date();
    const transactions = [];

    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const month = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
      const monthStr = month.toISOString().slice(0, 7);

      transactions.push(
        [userId, 'Monthly Salary', 50000, 'income', cat['Salary'], `${monthStr}-01`],
        [userId, 'Freelance Project', 15000, 'income', cat['Freelance'], `${monthStr}-05`],
        [userId, 'Grocery Shopping', 3200, 'expense', cat['Food & Dining'], `${monthStr}-03`],
        [userId, 'Zomato Order', 850, 'expense', cat['Food & Dining'], `${monthStr}-07`],
        [userId, 'Uber Ride', 450, 'expense', cat['Transport'], `${monthStr}-08`],
        [userId, 'Metro Card Recharge', 500, 'expense', cat['Transport'], `${monthStr}-10`],
        [userId, 'Amazon Shopping', 2800, 'expense', cat['Shopping'], `${monthStr}-12`],
        [userId, 'Electricity Bill', 1800, 'expense', cat['Bills & Utilities'], `${monthStr}-15`],
        [userId, 'Internet Bill', 999, 'expense', cat['Bills & Utilities'], `${monthStr}-15`],
        [userId, 'Doctor Visit', 600, 'expense', cat['Healthcare'], `${monthStr}-18`],
        [userId, 'Netflix Subscription', 649, 'expense', cat['Entertainment'], `${monthStr}-20`],
        [userId, 'Udemy Course', 499, 'expense', cat['Education'], `${monthStr}-22`],
        [userId, 'Restaurant Dinner', 1200, 'expense', cat['Food & Dining'], `${monthStr}-25`]
      );
    }

    // Insert transactions
    for (const t of transactions) {
      await db.query(
        `INSERT IGNORE INTO transactions 
         (user_id, title, amount, type, category_id, date) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        t
      );
    }
    console.log(`✅ ${transactions.length} transactions seeded`);

    // Seed budgets for current month
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const budgets = [
      [userId, cat['Food & Dining'], 8000, currentMonth],
      [userId, cat['Transport'], 2000, currentMonth],
      [userId, cat['Shopping'], 5000, currentMonth],
      [userId, cat['Bills & Utilities'], 3500, currentMonth],
      [userId, cat['Healthcare'], 2000, currentMonth],
      [userId, cat['Entertainment'], 1500, currentMonth],
      [userId, cat['Education'], 1000, currentMonth],
    ];

    for (const b of budgets) {
      await db.query(
        `INSERT IGNORE INTO budgets 
         (user_id, category_id, monthly_limit, month) 
         VALUES (?, ?, ?, ?)`,
        b
      );
    }
    console.log(`✅ ${budgets.length} budgets seeded`);

    // Seed agent memory
    const memories = [
      [userId, 'preferred_currency', 'INR'],
      [userId, 'monthly_income', '65000'],
      [userId, 'savings_goal', '20'],
      [userId, 'top_expense_category', 'Food & Dining'],
      [userId, 'financial_goal', 'Save for emergency fund'],
    ];

    for (const m of memories) {
      await db.query(
        `INSERT INTO agent_memory (user_id, memory_key, memory_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE memory_value = VALUES(memory_value)`,
        m
      );
    }
    console.log(`✅ ${memories.length} agent memories seeded`);

    // Seed recurring transactions
    const recurring = [
      [userId, 'Netflix Subscription', 649, cat['Entertainment'], 'monthly', `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}-01`],
      [userId, 'Internet Bill', 999, cat['Bills & Utilities'], 'monthly', `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}-15`],
      [userId, 'Gym Membership', 1200, cat['Healthcare'], 'monthly', `${today.getFullYear()}-${String(today.getMonth() + 2).padStart(2, '0')}-01`],
    ];

    for (const r of recurring) {
      await db.query(
        `INSERT IGNORE INTO recurring_transactions
         (user_id, title, amount, category_id, frequency, next_due)
         VALUES (?, ?, ?, ?, ?, ?)`,
        r
      );
    }
    console.log(`✅ ${recurring.length} recurring transactions seeded`);

    console.log('\n✅ Database seeded successfully! Ready for Session 8.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();