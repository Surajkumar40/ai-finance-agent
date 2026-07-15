const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// `credentials: true` requires an explicit origin — it's invalid (and
// silently ignored by browsers) when combined with a wildcard '*'.
// FRONTEND_URL falls back to the local Vite dev server.
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/ai',           require('./routes/ai'));
app.use('/api/budgets',      require('./routes/budgets'));
app.use('/api/agent',        require('./routes/agent'));
app.use('/api/health',       require('./routes/health'));
app.use('/api/alerts',       require('./routes/alerts'));

app.get('/', (req, res) => res.send('API running ✅'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));