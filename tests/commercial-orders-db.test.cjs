'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDatabase } = require('../src/db.cjs');

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'struktura-crm-orders-'));
}

test('commercial order can be linked to a lead and is not duplicated by link', t => {
  const directory = temporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const db = openDatabase(directory);
  t.after(() => db.close());

  const columns = db.prepare('PRAGMA table_info(leads)').all().map(column => column.name);
  assert.ok(columns.includes('commercial_order_id'));

  const orderId = db.prepare("INSERT INTO commercial_orders(title,source_url) VALUES (?,?)")
    .run('Демонтаж офиса', 'https://example.ru/tender/1').lastInsertRowid;
  const leadId = db.prepare("INSERT INTO leads(commercial_order_id,title,service,source) VALUES (?,?,?,'website')")
    .run(orderId, 'Демонтаж — заказ', 'demolition').lastInsertRowid;

  assert.equal(db.prepare('SELECT commercial_order_id FROM leads WHERE id=?').get(leadId).commercial_order_id, orderId);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM leads WHERE commercial_order_id=?').get(orderId).count, 1);

  db.prepare('DELETE FROM commercial_orders WHERE id=?').run(orderId);
  assert.equal(db.prepare('SELECT commercial_order_id FROM leads WHERE id=?').get(leadId).commercial_order_id, null);
});

test('adds the commercial order link when migrating an existing leads table', t => {
  const directory = temporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = new Database(path.join(directory, 'struktura-crm.sqlite'));
  legacy.exec(`
    CREATE TABLE clients (id INTEGER PRIMARY KEY AUTOINCREMENT);
    CREATE TABLE leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      service TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      budget_rub INTEGER NOT NULL DEFAULT 0,
      address TEXT NOT NULL DEFAULT '',
      next_action TEXT NOT NULL DEFAULT '',
      next_action_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  legacy.prepare("INSERT INTO leads(title,service,source) VALUES ('Старая заявка','demolition','phone')").run();
  legacy.close();

  const db = openDatabase(directory);
  t.after(() => db.close());
  const columns = db.prepare('PRAGMA table_info(leads)').all().map(column => column.name);
  assert.ok(columns.includes('commercial_order_id'));
  assert.equal(db.prepare('SELECT title,commercial_order_id FROM leads WHERE id=1').get().commercial_order_id, null);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_leads_commercial_order'").get().name, 'idx_leads_commercial_order');
});

test('migrates source_type onto an existing commercial_orders table', t => {
  const directory = temporaryDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = new Database(path.join(directory, 'struktura-crm.sqlite'));
  legacy.exec(`
    CREATE TABLE commercial_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      source_name TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      search_query TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL DEFAULT 'demolition',
      region TEXT NOT NULL DEFAULT 'Москва и Московская область',
      signal_score INTEGER NOT NULL DEFAULT 0,
      signal_labels TEXT NOT NULL DEFAULT '',
      relevance TEXT NOT NULL DEFAULT 'review',
      status TEXT NOT NULL DEFAULT 'new',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO commercial_orders(title,source_url) VALUES ('Старый заказ','https://example.ru/old');
  `);
  legacy.close();

  const db = openDatabase(directory);
  t.after(() => db.close());
  const columns = db.prepare('PRAGMA table_info(commercial_orders)').all().map(column => column.name);
  assert.ok(columns.includes('source_type'));
  assert.equal(db.prepare('SELECT source_type FROM commercial_orders WHERE id=1').get().source_type, 'web');
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_commercial_orders_source_type'").get().name, 'idx_commercial_orders_source_type');
});
