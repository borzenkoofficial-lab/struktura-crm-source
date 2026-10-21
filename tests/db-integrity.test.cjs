'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db.cjs');

test('database core initializes, enforces constraints, and survives an idempotent reopen', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-db-core-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    for (const table of ['clients','leads','projects','payments','expenses','income_records','production_plans','work_shifts','work_shift_items','settings','engineering_project_plans']) assert.ok(tables.has(table), 'missing core table: ' + table);
    const client = db.prepare('INSERT INTO clients(name) VALUES (?)').run('Тестовый клиент');
    const project = db.prepare("INSERT INTO projects(client_id,title,service,status,contract_rub) VALUES (?,?,'demolition','planned',100000)").run(client.lastInsertRowid, 'Тестовый объект');
    assert.throws(() => db.prepare('INSERT INTO payments(project_id,amount_rub,payment_date) VALUES (?,?,?)').run(project.lastInsertRowid, -1, '2026-10-16'));
    db.prepare('DELETE FROM clients WHERE id=?').run(client.lastInsertRowid);
    assert.equal(db.prepare('SELECT client_id FROM projects WHERE id=?').get(project.lastInsertRowid).client_id, null);
    db.prepare('INSERT INTO engineering_project_plans(id,title,created_at,operations_json,result_json) VALUES (?,?,?,?,?)').run('plan-test','Комплексный тест','2026-10-20T00:00:00.000Z','[]','{}');
    db.close();
    db = openDatabase(userDataPath);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=?').get(project.lastInsertRowid).title, 'Тестовый объект');
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '8');
    assert.equal(db.prepare('SELECT title FROM engineering_project_plans WHERE id=?').get('plan-test').title, 'Комплексный тест');
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('database upgrades a legacy schema without dropping existing project and lead records', () => {
  const Database = require('better-sqlite3');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-db-legacy-'));
  const dbPath = path.join(userDataPath, 'struktura-crm.sqlite');
  let db;
  try {
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE leads (id INTEGER PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE projects (id INTEGER PRIMARY KEY, status TEXT NOT NULL, title TEXT NOT NULL);
      CREATE TABLE prospects (id INTEGER PRIMARY KEY, status TEXT NOT NULL, region TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO leads(id,status,created_at) VALUES (7,'new','2025-01-01');
      INSERT INTO projects(id,status,title) VALUES (11,'active','Старый объект');
      INSERT INTO prospects(id,status,region) VALUES (13,'new','Москва');
    `);
    db.close(); db = null;
    db = openDatabase(userDataPath);
    const leadColumns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(row => row.name));
    const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(row => row.name));
    const prospectColumns = new Set(db.prepare('PRAGMA table_info(prospects)').all().map(row => row.name));
    assert.ok(leadColumns.has('commercial_order_id'));
    assert.ok(projectColumns.has('planned_people'));
    assert.ok(projectColumns.has('complexity_factor'));
    assert.ok(prospectColumns.has('service'));
    assert.equal(db.prepare('SELECT status FROM leads WHERE id=7').get().status, 'new');
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=11').get().title, 'Старый объект');
    assert.equal(db.prepare('SELECT region FROM prospects WHERE id=13').get().region, 'Москва');
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('database migrates legacy production plans that forbid a missing productivity norm', () => {
  const Database = require('better-sqlite3');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-db-plan-migration-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    const clientId = db.prepare('INSERT INTO clients(name) VALUES (?)').run('Клиент миграции').lastInsertRowid;
    const projectId = db.prepare("INSERT INTO projects(client_id,title,service,status) VALUES (?,'Объект миграции','demolition','active')").run(clientId).lastInsertRowid;
    db.prepare("INSERT INTO production_plans(project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity) VALUES (?,?,?,?,?,?)")
      .run(projectId, 'wall', 'Демонтаж стены', 'м²', 40, 8);
    db.pragma('foreign_keys = OFF');
    db.exec('DROP INDEX IF EXISTS idx_production_plan_project');
    db.exec('ALTER TABLE production_plans RENAME TO production_plans_current');
    db.exec(`CREATE TABLE production_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      catalog_id TEXT NOT NULL,
      work_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      planned_quantity REAL NOT NULL CHECK(planned_quantity > 0),
      baseline_productivity REAL NOT NULL CHECK(baseline_productivity > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, catalog_id)
    )`);
    db.exec('INSERT INTO production_plans SELECT * FROM production_plans_current');
    db.exec('DROP TABLE production_plans_current');
    db.pragma('foreign_keys = ON');
    db.close(); db = null;

    db = openDatabase(userDataPath);
    const migrated = db.prepare('SELECT project_id,catalog_id,planned_quantity,baseline_productivity FROM production_plans WHERE catalog_id=?').get('wall');
    assert.deepEqual(migrated, { project_id: projectId, catalog_id: 'wall', planned_quantity: 40, baseline_productivity: 8 });
    assert.doesNotThrow(() => db.prepare("INSERT INTO production_plans(project_id,catalog_id,work_name,unit,planned_quantity,baseline_productivity) VALUES (?,?,?,?,?,0)")
      .run(projectId, 'unknown', 'Работа без нормы', 'м²', 10));
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_production_plan_project'").get());
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('SQLite backup API preserves committed rows held in a source WAL file', async () => {
  const Database = require('better-sqlite3');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-wal-backup-'));
  const sourcePath = path.join(userDataPath, 'source.sqlite');
  const normalizedPath = path.join(userDataPath, 'normalized.sqlite');
  let writer;
  let reader;
  let normalized;
  try {
    writer = new Database(sourcePath);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer.exec('CREATE TABLE wal_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    writer.prepare('INSERT INTO wal_probe(value) VALUES (?)').run('committed-in-wal');
    assert.ok(fs.existsSync(sourcePath + '-wal'), 'source WAL exists while writer connection is open');

    reader = new Database(sourcePath, { readonly: true, fileMustExist: true });
    assert.equal(reader.pragma('integrity_check', { simple: true }), 'ok');
    await reader.backup(normalizedPath);
    reader.close(); reader = null;
    normalized = new Database(normalizedPath, { readonly: true, fileMustExist: true });
    assert.equal(normalized.prepare('SELECT value FROM wal_probe WHERE id=1').get().value, 'committed-in-wal');
    assert.equal(normalized.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    if (normalized && normalized.open) normalized.close();
    if (reader && reader.open) reader.close();
    if (writer && writer.open) writer.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
