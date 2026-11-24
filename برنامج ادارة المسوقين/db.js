const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.BASMA_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'basma-marketers.sqlite'));

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','marketer')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  business_type TEXT,
  phone TEXT,
  phone_normalized TEXT,
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  street TEXT,
  address_description TEXT,
  latitude REAL,
  longitude REAL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_by TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(business_name);
CREATE INDEX IF NOT EXISTS idx_customers_area ON customers(city, district, neighborhood, street);
CREATE INDEX IF NOT EXISTS idx_customers_assigned ON customers(assigned_to, status);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  marketer_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','expired')),
  reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  released_at TEXT,
  released_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_reservation_per_customer
ON reservations(customer_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  marketer_id TEXT NOT NULL REFERENCES users(id),
  result TEXT NOT NULL,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  visited_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_customer_date ON visits(customer_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_marketer_date ON visits(marketer_id, visited_at DESC);

CREATE TABLE IF NOT EXISTS visit_correction_requests (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  proposed_correction TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  marketer_id TEXT NOT NULL REFERENCES users(id),
  plan_name TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'YER',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','cancelled','refunded')),
  sold_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_marketer_date ON sales(marketer_id, sold_at DESC);

CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_name TEXT,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed','percentage')),
  value REAL NOT NULL CHECK (value >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_entries (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  marketer_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','paid','reversed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_payments (
  id TEXT PRIMARY KEY,
  marketer_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL CHECK (amount > 0),
  payment_reference TEXT,
  notes TEXT,
  paid_by TEXT NOT NULL REFERENCES users(id),
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS visits_no_update
BEFORE UPDATE ON visits BEGIN
  SELECT RAISE(ABORT, 'Visit records are immutable; submit a correction request.');
END;
CREATE TRIGGER IF NOT EXISTS visits_no_delete
BEFORE DELETE ON visits BEGIN
  SELECT RAISE(ABORT, 'Visit records cannot be deleted.');
END;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (1),(2);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO app_settings(key, value_json) VALUES
  ('reservation_minutes', '120'),
  ('session_hours', '8');

CREATE TABLE IF NOT EXISTS offline_mutations (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  mutation_type TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer_date ON sales(customer_id, sold_at DESC);
`);

module.exports = { db, databasePath: path.join(dataDir, 'basma-marketers.sqlite') };
