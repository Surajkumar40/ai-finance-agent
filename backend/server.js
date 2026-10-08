const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('./config/env');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' })); // receipt photos are sent as base64

// Auto-mount every file in /routes as /api/<filename>
// e.g. routes/auth.js -> /api/auth, routes/budgets.js -> /api/budgets
const routesDir = path.join(__dirname, 'routes');
fs.readdirSync(routesDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const name = file.replace('.js', '');
    try {
      app.use(`/api/${name}`, require(path.join(routesDir, file)));
      console.log(`✅ Loaded route /api/${name}`);
    } catch (err) {
      // One broken route will no longer stop the whole server
      console.error(`❌ Skipped route "${file}": ${err.message}`);
    }
  });

app.get('/', (req, res) => res.send('API running ✅'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  require('./services/recurring').startScheduler(); // adds due recurring transactions every hour
});
