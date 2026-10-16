const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  client_type TEXT NOT NULL DEFAULT 'person' CHECK(client_type IN ('person','company')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  commercial_order_id INTEGER REFERENCES commercial_orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  service TEXT NOT NULL CHECK(service IN ('demolition','finishing','raised_floor')),
  source TEXT NOT NULL CHECK(source IN ('avito','phone','telegram','recommendation','website','other')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','measurement','estimate','negotiation','won','lost')),
  budget_rub INTEGER NOT NULL DEFAULT 0 CHECK(budget_rub >= 0),
  address TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  next_action_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  service TEXT NOT NULL CHECK(service IN ('demolition','finishing','raised_floor')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
  contract_rub INTEGER NOT NULL DEFAULT 0 CHECK(contract_rub >= 0),
  address TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  planned_people INTEGER NOT NULL DEFAULT 5 CHECK(planned_people BETWEEN 1 AND 200),
  complexity_factor REAL NOT NULL DEFAULT 1 CHECK(complexity_factor > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount_rub INTEGER NOT NULL CHECK(amount_rub > 0),
  payment_date TEXT NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'incoming' CHECK(payment_type IN ('incoming','refund')),
  method TEXT NOT NULL DEFAULT 'other',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS income_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 amount_rub INTEGER NOT NULL CHECK(amount_rub > 0),
 income_date TEXT NOT NULL,
 record_type TEXT NOT NULL DEFAULT 'official' CHECK(record_type IN ('official','internal')),
 source TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_income_records_date ON income_records(income_date);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  amount_rub INTEGER NOT NULL CHECK(amount_rub > 0),
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  is_paid INTEGER NOT NULL DEFAULT 1 CHECK(is_paid IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note',
  body TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT,
  is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT 'demolition' CHECK(service IN ('demolition','finishing','raised_floor')),
  region TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL DEFAULT '',
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','contacted','converted','rejected')),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS commercial_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE,
 source_name TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'web' CHECK(source_type IN ('web','telegram','avito','tenders','files')), snippet TEXT NOT NULL DEFAULT '', search_query TEXT NOT NULL DEFAULT '',
 service TEXT NOT NULL DEFAULT 'demolition' CHECK(service IN ('demolition','finishing','raised_floor')),
 region TEXT NOT NULL DEFAULT 'Москва и Московская область',
 signal_score INTEGER NOT NULL DEFAULT 0 CHECK(signal_score BETWEEN 0 AND 100),
 signal_labels TEXT NOT NULL DEFAULT '', relevance TEXT NOT NULL DEFAULT 'review' CHECK(relevance IN ('potential_order','review')),
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','opened','relevant','rejected')),
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- source_type index is created after additive migration for legacy databases.
CREATE INDEX IF NOT EXISTS idx_commercial_orders_status ON commercial_orders(status);
CREATE INDEX IF NOT EXISTS idx_commercial_orders_service ON commercial_orders(service);
CREATE INDEX IF NOT EXISTS idx_commercial_orders_last_seen ON commercial_orders(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS commercial_order_analysis (
  order_id INTEGER PRIMARY KEY REFERENCES commercial_orders(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL DEFAULT '',
  work_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'м²',
  quantity REAL NOT NULL CHECK(quantity > 0),
  budget_rub REAL NOT NULL DEFAULT 0 CHECK(budget_rub >= 0),
  price_per_unit REAL NOT NULL DEFAULT 0 CHECK(price_per_unit >= 0),
  cost_per_unit REAL NOT NULL DEFAULT 0 CHECK(cost_per_unit >= 0),
  baseline_productivity REAL NOT NULL CHECK(baseline_productivity > 0),
  effective_productivity REAL NOT NULL CHECK(effective_productivity > 0),
  crew_size INTEGER NOT NULL CHECK(crew_size BETWEEN 1 AND 200),
  wage_per_worker_shift REAL NOT NULL DEFAULT 0 CHECK(wage_per_worker_shift >= 0),
  other_costs_rub REAL NOT NULL DEFAULT 0 CHECK(other_costs_rub >= 0),
  difficulty_factor REAL NOT NULL DEFAULT 1 CHECK(difficulty_factor BETWEEN 0.25 AND 5),
  reserve_percent REAL NOT NULL DEFAULT 15 CHECK(reserve_percent BETWEEN 0 AND 100),
  observations_count INTEGER NOT NULL DEFAULT 0 CHECK(observations_count >= 0),
  estimated_days REAL NOT NULL CHECK(estimated_days > 0),
  revenue_rub REAL NOT NULL CHECK(revenue_rub >= 0),
  estimated_cost_rub REAL NOT NULL CHECK(estimated_cost_rub >= 0),
  estimated_profit_rub REAL NOT NULL,
  estimated_margin_pct REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS competitor_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  price_rub INTEGER CHECK(price_rub IS NULL OR price_rub >= 0),
  region TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(source_url)
);
CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quote_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  prepared_at TEXT NOT NULL,
  revenue_rub REAL NOT NULL DEFAULT 0 CHECK(revenue_rub >= 0),
  cost_rub REAL NOT NULL DEFAULT 0 CHECK(cost_rub >= 0),
  profit_rub REAL NOT NULL DEFAULT 0,
  margin_pct REAL NOT NULL DEFAULT 0,
  discount_rub REAL NOT NULL DEFAULT 0 CHECK(discount_rub >= 0),
  lines_count INTEGER NOT NULL DEFAULT 0 CHECK(lines_count >= 0),
  lines_json TEXT NOT NULL DEFAULT '[]',
  file_path TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_quote_history_prepared_at ON quote_history(prepared_at DESC);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_payments_project_date ON payments(project_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_project_date ON expenses(project_id, expense_date);
CREATE TABLE IF NOT EXISTS production_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL,
  work_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  planned_quantity REAL NOT NULL CHECK(planned_quantity > 0),
  baseline_productivity REAL NOT NULL CHECK(baseline_productivity >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, catalog_id)
);
CREATE TABLE IF NOT EXISTS work_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shift_date TEXT NOT NULL,
  workers_count INTEGER NOT NULL CHECK(workers_count BETWEEN 1 AND 200),
  shift_hours REAL NOT NULL CHECK(shift_hours > 0 AND shift_hours <= 24),
  downtime_hours REAL NOT NULL DEFAULT 0 CHECK(downtime_hours >= 0),
  complexity_factor REAL NOT NULL DEFAULT 1 CHECK(complexity_factor > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS work_shift_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES work_shifts(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL,
  work_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity_done REAL NOT NULL CHECK(quantity_done > 0),
  workers_count INTEGER NOT NULL CHECK(workers_count BETWEEN 1 AND 200),
  hours REAL NOT NULL CHECK(hours > 0 AND hours <= 24),
  baseline_productivity REAL NOT NULL CHECK(baseline_productivity > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(shift_id, catalog_id)
);
CREATE INDEX IF NOT EXISTS idx_production_plan_project ON production_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_work_shifts_project_date ON work_shifts(project_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_work_shift_items_catalog ON work_shift_items(catalog_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_region ON prospects(region);

`;

function openDatabase(userDataPath) {
  fs.mkdirSync(userDataPath, { recursive: true });
  const dbPath = path.join(userDataPath, 'struktura-crm.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Additive migrations keep existing local databases intact after app updates.
  const leadColumns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(column => column.name));
  if (!leadColumns.has('commercial_order_id')) db.exec('ALTER TABLE leads ADD COLUMN commercial_order_id INTEGER REFERENCES commercial_orders(id) ON DELETE SET NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_leads_commercial_order ON leads(commercial_order_id)');
  const orderColumns = new Set(db.prepare('PRAGMA table_info(commercial_orders)').all().map(column => column.name));
  if (!orderColumns.has('source_type')) db.exec("ALTER TABLE commercial_orders ADD COLUMN source_type TEXT NOT NULL DEFAULT 'web' CHECK(source_type IN ('web','telegram','avito','tenders','files'))");
  db.exec('CREATE INDEX IF NOT EXISTS idx_commercial_orders_source_type ON commercial_orders(source_type)');
  const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
  if (!projectColumns.has('planned_people')) db.exec('ALTER TABLE projects ADD COLUMN planned_people INTEGER NOT NULL DEFAULT 5 CHECK(planned_people BETWEEN 1 AND 200)');
  if (!projectColumns.has('complexity_factor')) db.exec('ALTER TABLE projects ADD COLUMN complexity_factor REAL NOT NULL DEFAULT 1 CHECK(complexity_factor > 0)');
  const prospectColumns = new Set(db.prepare('PRAGMA table_info(prospects)').all().map(column => column.name));
  if (!prospectColumns.has('service')) db.exec("ALTER TABLE prospects ADD COLUMN service TEXT NOT NULL DEFAULT 'demolition' CHECK(service IN ('demolition','finishing','raised_floor'))");
  db.exec('CREATE INDEX IF NOT EXISTS idx_prospects_service ON prospects(service)');
  // Older databases enforce baseline_productivity > 0; rebuild only this table so missing norms can be stored explicitly.
  const productionPlanSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='production_plans'").get()?.sql || '';
  if (/CHECK\\s*\\(\\s*baseline_productivity\\s*>\\s*0\\s*\\)/i.test(productionPlanSql)) {
    db.pragma('foreign_keys = OFF');
    try {
      const migratePlans = db.transaction(() => {
        db.exec('DROP INDEX IF EXISTS idx_production_plan_project');
        db.exec('ALTER TABLE production_plans RENAME TO production_plans_legacy');
        db.exec(`CREATE TABLE production_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, catalog_id TEXT NOT NULL, work_name TEXT NOT NULL, unit TEXT NOT NULL, planned_quantity REAL NOT NULL CHECK(planned_quantity > 0), baseline_productivity REAL NOT NULL CHECK(baseline_productivity >= 0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_id, catalog_id))`);
        db.exec('INSERT INTO production_plans(id,project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity,created_at,updated_at) SELECT id,project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity,created_at,updated_at FROM production_plans_legacy');
        db.exec('DROP TABLE production_plans_legacy');
        db.exec('CREATE INDEX IF NOT EXISTS idx_production_plan_project ON production_plans(project_id)');
      });
      migratePlans();
    } finally { db.pragma('foreign_keys = ON'); }
  }
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES ('schema_version','7')").run();
  db.prepare("UPDATE settings SET value='7' WHERE key='schema_version'").run();
  return db;
}

module.exports = { openDatabase, SCHEMA };
