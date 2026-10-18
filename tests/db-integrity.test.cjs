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
    for (const table of ['clients','leads','projects','payments','expenses','income_records','production_plans','work_shifts','work_shift_items','settings']) assert.ok(tables.has(table), 'missing core table: ' + table);
    const client = db.prepare('INSERT INTO clients(name) VALUES (?)').run('Тестовый клиент');
    const project = db.prepare("INSERT INTO projects(client_id,title,service,status,contract_rub) VALUES (?,?,'demolition','planned',100000)").run(client.lastInsertRowid, 'Тестовый объект');
    assert.throws(() => db.prepare('INSERT INTO payments(project_id,amount_rub,payment_date) VALUES (?,?,?)').run(project.lastInsertRowid, -1, '2026-10-16'));
    db.prepare('DELETE FROM clients WHERE id=?').run(client.lastInsertRowid);
    assert.equal(db.prepare('SELECT client_id FROM projects WHERE id=?').get(project.lastInsertRowid).client_id, null);
    db.close();
    db = openDatabase(userDataPath);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=?').get(project.lastInsertRowid).title, 'Тестовый объект');
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '7');
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

test('payment integrity helper rejects excess refunds, incoming-to-refund changes, and transfers', () => {
  const { assertPaymentBalance } = require('../src/payment-integrity.cjs');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-payment-helper-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    const clientId = db.prepare('INSERT INTO clients(name) VALUES (?)').run('Клиент').lastInsertRowid;
    const p1 = db.prepare("INSERT INTO projects(client_id,title,service,status,contract_rub) VALUES (?,?,'demolition','planned',1000)").run(clientId,'Объект 1').lastInsertRowid;
    const p2 = db.prepare("INSERT INTO projects(client_id,title,service,status,contract_rub) VALUES (?,?,'demolition','planned',1000)").run(clientId,'Объект 2').lastInsertRowid;
    const paymentId = db.prepare("INSERT INTO payments(project_id,amount_rub,payment_date,payment_type) VALUES (?,?,'2026-10-18','incoming')").run(p1,1000).lastInsertRowid;
    assert.equal(assertPaymentBalance(db,p1,'incoming',500),1500);
    assert.throws(() => assertPaymentBalance(db,p1,'refund',1001), /возвратов не может превышать поступления/);
    assert.throws(() => assertPaymentBalance(db,p1,'refund',1000,paymentId), /возвратов не может превышать поступления/);
    assert.throws(() => assertPaymentBalance(db,p2,'refund',1,paymentId), /возвратов не может превышать поступления/);
  } finally { if (db && db.open) db.close(); fs.rmSync(userDataPath,{recursive:true,force:true}); }
});

test('project deletion is blocked while financial records remain attached', () => {
  const { assertProjectDeletable } = require('../src/project-integrity.cjs');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-project-delete-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    const clientId = db.prepare('INSERT INTO clients(name) VALUES (?)').run('Клиент').lastInsertRowid;
    const projectId = db.prepare("INSERT INTO projects(client_id,title,service,status,contract_rub) VALUES (?,?,'demolition','planned',1000)").run(clientId,'Объект').lastInsertRowid;
    assert.equal(assertProjectDeletable(db, projectId), true);
    db.prepare("INSERT INTO payments(project_id,amount_rub,payment_date,payment_type) VALUES (?,100,'2026-10-18','incoming')").run(projectId);
    assert.throws(() => assertProjectDeletable(db, projectId), /Нельзя удалить объект/);
    db.prepare('DELETE FROM payments WHERE project_id=?').run(projectId);
    db.prepare("INSERT INTO expenses(project_id,amount_rub,expense_date,category,description,is_paid) VALUES (?,50,'2026-10-18','other','Тестовый расход',1)").run(projectId);
    assert.throws(() => assertProjectDeletable(db, projectId), /Нельзя удалить объект/);
  } finally { if (db && db.open) db.close(); fs.rmSync(userDataPath,{recursive:true,force:true}); }
});
