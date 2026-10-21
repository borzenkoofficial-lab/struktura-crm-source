'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { openDatabase } = require('../src/db.cjs');
const { validateBackupDatabase } = require('../src/backup-utils.cjs');

test('backup validation accepts a database initialized by the current application schema', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-valid-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    const result = validateBackupDatabase(db);
    assert.ok(result.tableCount >= result.validatedTables);
    assert.equal(result.validatedTables, 6);
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('backup validation rejects a SQLite file with expected table names but incomplete columns', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-incomplete-'));
  const dbPath = path.join(userDataPath, 'incomplete.sqlite');
  let db;
  try {
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE leads (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE projects (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE payments (id INTEGER PRIMARY KEY, amount_rub INTEGER);
      CREATE TABLE expenses (id INTEGER PRIMARY KEY, amount_rub INTEGER);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    assert.throws(() => validateBackupDatabase(db), /отсутствуют обязательные поля: clients\.phone/);
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('backup validation rejects a non-CRM SQLite database before restore', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-wrong-db-'));
  const dbPath = path.join(userDataPath, 'other.sqlite');
  let db;
  try {
    db = new Database(dbPath);
    db.exec('CREATE TABLE unrelated (id INTEGER PRIMARY KEY, value TEXT)');
    assert.throws(() => validateBackupDatabase(db), /Отсутствуют обязательные таблицы/);
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
