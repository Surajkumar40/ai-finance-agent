# AI Finance Agent — Progress Log
> Upgraded from basic Finance Tracker → Intelligent AI Finance Agent
> Stack: React + Vite | Node + Express | PostgreSQL | Claude AI (tool_use + vision) | Socket.io | Playwright

---

## Project Vision
Not a finance tracker. An AI agent that watches your money, thinks ahead, warns you before problems happen, and acts on your behalf — without you having to ask.

---

## What We Kept From Finance Tracker ✅
- [x] Folder structure (finance-tracker/)
- [x] Frontend setup (Vite + React)
- [x] Backend setup (Node + Express)
- [x] Database connection (backend/config/db.js)
- [x] Auth routes — register + login (backend/routes/auth.js)
- [x] JWT middleware (backend/middleware/auth.js)
- [x] Centralised Axios instance with auth interceptor
- [x] Login / Signup pages
- [x] AuthContext + ProtectedRoute
- [x] Basic transactions CRUD (will be extended)
- [x] Categories route + seeded data
- [x] Sidebar Layout component

---

## What We Are Replacing / Upgrading
| Old | New |
|---|---|
| Simple AI chatbox | Claude Agent with tool_use — calls your own backend |
| Basic dashboard cards | Live financial health score + anomaly alerts |
| Static charts | Real-time charts via WebSocket |
| Manual transaction entry only | Receipt OCR + voice input + CSV import |
| No memory | Persistent agent memory stored in DB |
| No tests | Playwright E2E test suite |
| No background jobs | Cron-based proactive AI alerts |
| Simple category detection | Full AI budget planner (multi-step reasoning) |

---

## Full Session Plan

---

### Session 7 — Database Upgrade & Agent Memory Schema
**Goal:** Extend the DB to support agent memory, health scores, budgets, alerts, audit logs, recurring transactions.

#### Tasks
- [ ] Extend schema.sql with new tables:
  - `budgets` (user_id, category_id, monthly_limit, month)
  - `agent_memory` (user_id, memory_key, memory_value, updated_at)
  - `financial_health_scores` (user_id, score, breakdown_json, calculated_at)
  - `alerts` (user_id, type, message, is_read, triggered_at)
  - `audit_logs` (user_id, action, entity, entity_id, old_value, new_value, created_at)
  - `recurring_transactions` (user_id, title, amount, category_id, frequency, next_due)
  - Add `is_recurring`, `receipt_url`, `currency` columns to `transactions`
- [ ] Write migration script (backend/database/migrate.js)
- [ ] Update db.js to support DB transactions (atomic operations)
- [ ] Seed realistic sample data for testing

#### Files to create/edit
- backend/database/schema_v2.sql
- backend/database/migrate.js
- backend/database/seed.js

---

### Session 8 — Claude Agent with Tool Use
**Goal:** Replace the basic AI chatbox with a real Claude agent that can query your database, calculate totals, and update budgets autonomously.

#### Tasks
- [ ] Define agent tools (functions Claude can call):
  - `get_transactions(filters)` — query DB with date/category/amount filters
  - `get_budget_status()` — return current month spend vs limits
  - `get_financial_health()` — return health score + breakdown
  - `add_transaction(data)` — agent can add transactions on user's behalf
  - `update_budget(category, limit)` — agent can set budget limits
  - `get_spending_trends(months)` — return month-over-month comparison
- [ ] Build agent route (backend/routes/agent.js)
  - Multi-turn conversation with tool_use loop
  - Tool dispatcher maps Claude's tool calls to real DB queries
  - Returns structured response + tool results to frontend
- [ ] Build agent memory system
  - Save key facts per user (spending habits, goals, preferred categories)
  - Inject memory into every agent system prompt
  - Update memory after each session
- [ ] Replace AIChatWindow.jsx with AgentChat.jsx
  - Show tool calls happening in real time ("Agent is checking your budget...")
  - Show which tools were called in UI
  - Conversation history persisted in DB

#### Files to create/edit
- backend/routes/agent.js
- backend/services/agentTools.js
- backend/services/agentMemory.js
- frontend/src/components/AgentChat.jsx
- frontend/src/components/AgentChat.css

---

### Session 9 — Financial Health Score + Anomaly Detection
**Goal:** Build a live financial health score engine and automatic anomaly detection.

#### Tasks
- [ ] Health score engine (backend/services/healthScore.js)
  - Savings rate (income vs expenses ratio) — 30 points
  - Budget adherence (% of categories within limit) — 30 points
  - Spending consistency (variance month over month) — 20 points
  - Recurring obligations coverage — 20 points
  - Recalculate on every transaction add/edit/delete
- [ ] Anomaly detection (backend/services/anomalyDetection.js)
  - Calculate 3-month baseline per category
  - Flag transactions > 2x the baseline
  - Run on every new transaction
  - Store flagged alerts in `alerts` table
- [ ] Health score API route (backend/routes/health.js)
- [ ] Alerts API route (backend/routes/alerts.js)
- [ ] Frontend HealthScoreCard.jsx — animated circular score gauge
- [ ] Frontend AnomalyBanner.jsx — dismissible alert banners on dashboard
- [ ] Update DashboardPage to show score + alerts prominently

#### Files to create/edit
- backend/services/healthScore.js
- backend/services/anomalyDetection.js
- backend/routes/health.js
- backend/routes/alerts.js
- frontend/src/components/HealthScoreCard.jsx
- frontend/src/components/AnomalyBanner.jsx

---

### Session 10 — Proactive AI Alerts (Cron Agent)
**Goal:** Agent runs on a schedule, checks data, sends alerts before the user opens the app.

#### Tasks
- [ ] Install node-cron, nodemailer
- [ ] Build cron scheduler (backend/services/cronAgent.js)
  - Runs every day at 8am
  - For each user: fetch current month data
  - Ask Claude: "Based on this data, what proactive alerts should I send?"
  - Claude responds with structured alert objects
  - Save alerts to `alerts` table
- [ ] Alert types:
  - Budget warning (spending 80%+ of limit)
  - Unusual spike detected
  - Recurring transaction due soon
  - Monthly summary ready
  - Positive milestone ("You saved more than last month!")
- [ ] Email alert system (nodemailer)
  - Send daily digest email if unread alerts exist
  - Beautiful HTML email template
- [ ] Frontend notification bell
  - Unread alert count badge on sidebar
  - Alert dropdown with dismiss/mark all read
  - Link each alert to relevant page

#### Files to create/edit
- backend/services/cronAgent.js
- backend/services/emailService.js
- backend/templates/alertEmail.html
- backend/routes/alerts.js (extend)
- frontend/src/components/NotificationBell.jsx

---

### Session 11 — Receipt OCR Scanner (Claude Vision)
**Goal:** User photos a receipt → Claude reads it → transaction auto-added.

#### Tasks
- [ ] Receipt upload endpoint (backend/routes/receipts.js)
  - Accept image upload (multer)
  - Convert to base64
  - Send to Claude with vision prompt
  - Claude extracts: merchant, amount, date, category, currency
  - Return structured JSON
- [ ] Store receipt image in local /uploads or Cloudinary
- [ ] Frontend ReceiptScanner.jsx
  - Camera capture on mobile (input type=file, accept=image/*)
  - Preview image before submitting
  - Show AI extraction result in editable form
  - One-click confirm to add transaction
- [ ] Link receipt_url to transaction record

#### Files to create/edit
- backend/routes/receipts.js
- backend/middleware/upload.js (multer config)
- frontend/src/components/ReceiptScanner.jsx
- frontend/src/components/ReceiptScanner.css

---

### Session 12 — CSV / Bank Statement Import
**Goal:** Upload any bank's CSV → AI maps columns → bulk import transactions.

#### Tasks
- [ ] CSV upload endpoint (backend/routes/import.js)
  - Accept .csv file
  - Parse with papaparse
  - Send sample rows to Claude: "Map these columns to: date, description, amount, type"
  - Claude returns column mapping
  - Apply mapping and bulk insert to DB
  - Duplicate detection (same date + amount + description)
- [ ] Frontend ImportPage.jsx
  - Drag and drop CSV upload
  - Preview mapped data in table (editable before import)
  - Import progress indicator
  - Summary: "47 transactions imported, 3 duplicates skipped"

#### Files to create/edit
- backend/routes/import.js
- backend/services/csvMapper.js
- frontend/src/pages/ImportPage.jsx
- frontend/src/pages/ImportPage.css

---

### Session 13 — Voice Input
**Goal:** Speak a transaction → agent parses → adds it.

#### Tasks
- [ ] Frontend VoiceInput.jsx
  - Web Speech API for recording
  - Mic button on TransactionsPage and floating button
  - Show live transcript while speaking
  - Send transcript to backend on stop
- [ ] Backend voice route (backend/routes/voice.js)
  - Receive transcript text
  - Claude parses: "spent 200 on chai" → {amount: 200, category: food, description: chai, date: today}
  - Return parsed transaction for user to confirm
- [ ] Confirmation modal before adding
- [ ] Show voice-added transactions with mic icon badge in list

#### Files to create/edit
- backend/routes/voice.js
- frontend/src/components/VoiceInput.jsx
- frontend/src/components/VoiceInput.css

---

### Session 14 — Real-Time Dashboard (WebSockets)
**Goal:** Transactions update live across tabs/devices without refresh.

#### Tasks
- [ ] Install socket.io on backend
- [ ] Add WebSocket server to server.js
- [ ] Emit events on transaction changes:
  - `transaction:created`, `transaction:updated`, `transaction:deleted`
  - `alert:new` — push new anomaly alerts live
  - `health:updated` — push new health score
- [ ] Frontend socket client (frontend/src/services/socket.js)
- [ ] Hook into DashboardPage — update charts/cards live on socket events
- [ ] Hook into TransactionsPage — prepend new transactions live
- [ ] Show live indicator ("Live" green dot on dashboard)
- [ ] Multi-tab sync — open two tabs, add in one, see it in both

#### Files to create/edit
- backend/services/socketService.js
- frontend/src/services/socket.js
- frontend/src/hooks/useSocket.js

---

### Session 15 — AI Budget Planner (Multi-step Reasoning)
**Goal:** Agent analyses 3 months of data and generates a personalised budget plan.

#### Tasks
- [ ] Budget planner service (backend/services/budgetPlanner.js)
  - Multi-step Claude reasoning chain:
    1. Analyse spending by category for last 3 months
    2. Identify fixed vs variable expenses
    3. Calculate realistic limits with 10-15% savings target
    4. Generate explanation per category
  - Return structured budget plan JSON
- [ ] One-click apply — saves to `budgets` table
- [ ] Frontend BudgetPlannerPage.jsx
  - "Generate my budget" button
  - Show AI reasoning steps as they complete (streaming)
  - Editable budget table before applying
  - Month-by-month comparison charts
- [ ] Budget vs actual progress bars on Dashboard

#### Files to create/edit
- backend/services/budgetPlanner.js
- backend/routes/budgets.js
- frontend/src/pages/BudgetPlannerPage.jsx
- frontend/src/components/BudgetProgressBar.jsx

---

### Session 16 — Recurring Transactions Engine
**Goal:** Mark bills/subscriptions as recurring. Auto-generate them. Never miss a payment.

#### Tasks
- [ ] Recurring transaction service (backend/services/recurringEngine.js)
  - Cron: runs daily, checks `recurring_transactions` for due dates
  - Auto-creates transaction and sends alert
  - Updates next_due date
- [ ] Frontend RecurringManager.jsx
  - List all recurring transactions
  - Add/edit/delete recurring rules
  - Calendar view showing upcoming transactions
  - Toggle active/paused
- [ ] Show upcoming recurring in Dashboard sidebar widget

#### Files to create/edit
- backend/services/recurringEngine.js
- backend/routes/recurring.js
- frontend/src/components/RecurringManager.jsx
- frontend/src/pages/RecurringPage.jsx

---

### Session 17 — Optimistic UI + Dark Mode + Polish
**Goal:** Make the UX feel fast, premium, and complete.

#### Tasks
- [ ] Optimistic UI for all transaction mutations
  - Add transaction → appears instantly in list, rolls back on error
  - Delete → removed instantly, restored on error
  - Toast notification system (success / error / undo)
- [ ] Dark mode
  - CSS variables throughout
  - System preference detection + manual toggle
  - Persisted in localStorage + user profile
- [ ] Loading skeletons (not spinners) for all data fetches
- [ ] Empty states with helpful CTAs (not blank pages)
- [ ] Keyboard shortcuts (N = new transaction, / = search, Esc = close modal)
- [ ] Mobile responsiveness audit and fixes
- [ ] Micro-animations on health score changes and chart updates

#### Files to edit/create
- frontend/src/index.css (CSS variable dark mode)
- frontend/src/components/Toast.jsx
- frontend/src/components/Skeleton.jsx
- All pages — optimistic state + skeletons

---

### Session 18 — E2E Tests + Audit Log + Security
**Goal:** Add tests and audit trail — two things that immediately separate you from 99% of portfolio projects.

#### Tasks
- [ ] Install Playwright
- [ ] Write E2E tests:
  - Auth flow (signup, login, logout)
  - Add / edit / delete transaction
  - Budget limit triggers alert
  - Voice input parses correctly
  - Receipt OCR returns expected fields
  - Agent chat responds with tool use
- [ ] Audit log middleware (backend/middleware/auditLog.js)
  - Auto-log every write operation (POST/PUT/DELETE)
  - Store in `audit_logs` table
- [ ] Frontend AuditLogPage.jsx — searchable timeline of all actions
- [ ] Rate limiting (express-rate-limit) on auth + AI routes
- [ ] Input validation with Zod on all backend routes

#### Files to create/edit
- tests/auth.spec.js
- tests/transactions.spec.js
- tests/agent.spec.js
- tests/receipts.spec.js
- backend/middleware/auditLog.js
- backend/middleware/rateLimiter.js
- backend/middleware/validate.js
- frontend/src/pages/AuditLogPage.jsx

---

### Session 19 — PDF Export + Multi-Currency
**Goal:** Tangible outputs and global-ready app.

#### Tasks
- [ ] Monthly PDF report (backend/routes/export.js)
  - Generate with pdfkit
  - Include: health score, budget vs actual, top categories, AI summary paragraph, transaction list
  - Download as "January_2026_Report.pdf"
- [ ] Multi-currency support
  - Store `currency` field per transaction
  - Live exchange rates (exchangerate-api.com free tier)
  - Convert all amounts to base currency on dashboard
  - Currency selector on transaction form

#### Files to create/edit
- backend/routes/export.js
- backend/services/currencyService.js
- frontend/src/components/CurrencySelector.jsx

---

### Session 20 — Deployment + CI/CD (Production-Ready)
**Goal:** Deploy everything with a proper CI/CD pipeline.

#### Tasks
- [ ] Backend production prep
  - Dynamic CORS (env-based FRONTEND_URL)
  - Helmet.js for security headers
  - Compression middleware
  - Centralised error handling middleware
- [ ] GitHub Actions CI/CD pipeline
  - Run Playwright tests on every push
  - Auto-deploy to Render on main branch merge
- [ ] Deploy backend to Render (Web Service)
- [ ] Deploy PostgreSQL to Render (managed DB)
- [ ] Deploy frontend to Vercel
- [ ] Environment variables configured on both platforms
- [ ] Run schema_v2.sql + seed on production DB
- [ ] Final QA checklist on production URLs
- [ ] README.md with screenshots, feature list, tech stack, live demo link

#### Files to create/edit
- .github/workflows/ci.yml
- backend/middleware/errorHandler.js
- README.md (comprehensive, with screenshots)

---

## Final Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts, Socket.io-client |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL |
| AI | Claude API (messages, tool_use, vision) |
| Auth | JWT + bcrypt |
| Background jobs | node-cron |
| Email | Nodemailer |
| File uploads | Multer |
| Validation | Zod |
| Testing | Playwright |
| Security | Helmet, express-rate-limit |
| Deployment | Vercel (frontend) + Render (backend + DB) |
| CI/CD | GitHub Actions |

---

## What Makes This Next Level (For Interviews)
1. Real AI agent — not a chatbox. Claude calls your own APIs via tool_use
2. Proactive intelligence — alerts and insights without user asking
3. Claude Vision — receipt scanning solves a real-world problem
4. WebSockets — real-time, multi-device sync
5. Cron agent — background AI that works while user sleeps
6. E2E tests — something 99% of portfolio projects don't have
7. Audit log — shows database design maturity
8. Multi-step AI reasoning — budget planner chain of thought
9. Optimistic UI — shows senior-level frontend thinking
10. Full CI/CD pipeline — shows you understand production software

---

## Current Status
- Starting: Session 7 — Database upgrade for Agent architecture
- Previous: Completed basic Finance Tracker (Sessions 1–6) — foundation reused
- Total sessions planned: 20

## How To Start Next Session
Upload this progress.md to Claude and say:
"Session 7 ready — let's build the upgraded database schema for the AI Finance Agent"
