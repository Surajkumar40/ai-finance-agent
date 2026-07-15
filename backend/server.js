const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,   // e.g. https://your-app.vercel.app
  'http://localhost:5173',    // local dev
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/ai',           require('./routes/ai'));
app.use('/api/budgets',      require('./routes/budgets'));
app.use('/api/agent',        require('./routes/agent'));

app.get('/', (req, res) => res.send('API running ✅'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));