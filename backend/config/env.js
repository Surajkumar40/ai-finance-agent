// Loads backend/.env (always from THIS backend folder, no matter where you start node from)
// and stops with a clear message if something is missing.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '.env');

function stop(lines) {
  console.error('\n❌ ' + lines.join('\n   ') + '\n');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  const hint = fs.existsSync(file + '.txt')
    ? 'I found ".env.txt" — Windows added .txt. Rename it to exactly ".env"'
    : 'Create it by copying ".env.example" to ".env" and filling in your values';
  stop([
    'The .env file was NOT FOUND.',
    'It must be exactly here:',
    file,
    hint,
  ]);
}

require('dotenv').config({ path: file, quiet: true });

const missing = ['DB_NAME', 'JWT_SECRET'].filter((k) => !process.env[k]);
if (!process.env.DB_USER) missing.push('DB_USER');
if (missing.length) {
  stop([
    `Your .env is missing: ${missing.join(', ')}`,
    `Open ${file} and add them (see .env.example). Save the file, then start again.`,
  ]);
}
