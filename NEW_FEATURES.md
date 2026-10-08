# New features

**IMPORTANT after updating: run the migration once** (adds 2 columns for recurring items)

    cd backend
    node database/migrate.js

Then restart the backend (`npm run dev`) and the frontend.

| Feature | Where | How it works |
|---|---|---|
| Spending insights | Dashboard | Month picker, daily/cumulative spending chart, % change vs last month, avg/day, projected month-end, top categories |
| Recurring transactions | Sidebar > Recurring | Rent / salary / subscriptions (daily, weekly, monthly, yearly). Added automatically on the due date (checked every hour and at server start). Missed days are caught up. Pause / resume / delete. "Run due now" button |
| Budget alerts | Bell icon in the sidebar | Warning at 80% and "exceeded" at 100% of a category budget, once per category per month. Created when you add/edit a transaction, when the AI adds one, or when a recurring item is added |
| Receipt scanner | Transactions > Add > "Scan a receipt" | Photo is shrunk in the browser, Claude reads title / total / date / category and fills the form. **Needs a valid ANTHROPIC_API_KEY with credits** |

API routes added: /api/analytics, /api/recurring, /api/alerts, /api/receipts/scan

## Round 2
Run `node database/migrate.js` again (adds the `savings_goals` table).

| Feature | Where | How it works |
|---|---|---|
| Financial health score | Dashboard (top card) | 0-100 from: savings rate (30), budgets on track (25), spending trend (20), safety net = months of spending your balance covers (15), tracking habit (10). Shows a "focus" tip for your weakest area and the change since your last check. One score is saved per day in `financial_health_scores` |
| Savings goals | Sidebar > Goals | Target amount + optional date, add / withdraw money, "save about ₹X a month" hint, notification when a goal is reached. The AI agent can also see your goals |
| Export CSV | Transactions > Export CSV | Downloads exactly the transactions currently shown (respects search and filter). Opens correctly in Excel (₹ safe) |

API routes added: /api/health-score, /api/goals

## Clearer .env errors
The backend now reads `backend/.env` from its own folder and stops with a plain message if the file is
missing, named `.env.txt`, or lacks DB_USER / DB_NAME / JWT_SECRET — instead of "Access denied for user ''@'localhost'".
