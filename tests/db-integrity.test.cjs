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
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='schema_version'").get().value, '6');
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
