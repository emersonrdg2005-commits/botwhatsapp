const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'boletos.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS boletos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa TEXT NOT NULL,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL, -- formato YYYY-MM-DD
  pago INTEGER NOT NULL DEFAULT 0,
  notificado INTEGER NOT NULL DEFAULT 0,
  criado_por TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT UNIQUE NOT NULL,
  subscription_json TEXT NOT NULL,
  criado_em TEXT DEFAULT (datetime('now'))
);
`);

module.exports = db;
