# AI Finance Agent

A personal finance tracker with an AI agent layered on top — the agent has
real tool access to your transaction data (not just a chatbox bolted on),
plus an automatically-computed financial health score and spending-anomaly
detection.

## Features

- **Transactions & budgets** — categorized income/expense tracking, monthly
  budget limits with live spend-vs-limit progress bars
- **AI agent chat** — powered by the Claude API with `tool_use`: the agent
  can query your real transactions, categories, and budgets, add
  transactions on request, and remembers durable facts about you (goals,
  income, preferences) across conversations
- **Financial Health Score** — a 0–100 score computed from four weighted,
  independently-scored signals (savings rate, budget adherence, spending
  consistency, recurring-bill coverage). Components with no data yet are
  excluded and the rest are re-weighted, so a new user's score isn't
  unfairly dragged down by empty sections.
- **Anomaly detection** — new expense transactions are automatically
  compared against a per-category 3-month baseline; a spike over 2x the
  average generates an in-app alert
- **Auth** — JWT-based signup/login with bcrypt password hashing

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| Database | MySQL |
| AI | Claude API (`@anthropic-ai/sdk`, tool_use) |
| Auth | JWT + bcrypt |
| Testing | Jest (backend unit tests) |

## Project structure

```
backend/
  routes/         auth, transactions, categories, budgets, agent, health, alerts
  services/        agentTools, agentMemory, healthScore, anomalyDetection
  database/        schema.sql, schema_v2.sql, migrate.js, seed.js
  tests/           Jest unit tests for score/anomaly logic
  middleware/       JWT auth guard
frontend/
  src/pages/       Login, Signup, Dashboard, Transactions, AI Chat
  src/components/  HealthScoreCard, AlertsBanner, BudgetProgress, Layout, Navbar
  src/context/     Auth + Theme providers
```

## Setup

### 1. Database

Create a MySQL database and run the schema, then apply the v2 migration:

```bash
mysql -u root -p finance_tracker < backend/database/schema.sql
cd backend
node database/migrate.js
```

Optionally seed some sample data (needs at least one signed-up user first):

```bash
node database/seed.js
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in your DB credentials, JWT secret, API keys
npm install
npm run dev             # http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env    # set VITE_API_URL if backend isn't on localhost:5000
npm install
npm run dev              # http://localhost:5173
```

### 4. Run backend tests

```bash
cd backend
npm test
```

## How the Financial Health Score works

`backend/services/healthScore.js` exposes a pure `calculateHealthScore()`
function, deliberately separated from the database-fetching code around it,
so the scoring logic can be unit-tested without a live database
(`backend/tests/healthScore.test.js`). Each of the four components
contributes up to a fixed number of points; a component is skipped
entirely — not scored as zero — when there isn't enough data for it to be
meaningful yet (e.g. no budgets set), and the final percentage is computed
only over the components that actually had data.

## How anomaly detection works

On every new expense transaction, `backend/services/anomalyDetection.js`
compares the amount to the average of that category's transactions over the
trailing 3 months. It requires at least 3 prior transactions in that
category before it will flag anything (to avoid false positives on a brand
new category), and flags anything more than 2x that average as an alert,
surfaced on the dashboard.

## Security note

`.env` is git-ignored and must never be committed. If you're setting this
project up from a copy that may have shipped with real credentials, rotate
them immediately.
