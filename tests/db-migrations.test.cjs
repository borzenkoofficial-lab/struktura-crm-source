'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { SCHEMA, openDatabase } = require('../src/db.cjs');

test('legacy databases gain nullable client links on leads and projects without losing records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gruzli-db-migration-'));
  const dbPath = path.join(directory, 'struktura-crm.sqlite');
  let legacy;
  let db;
  try {
    legacy = new Database(dbPath);
    const legacySchema = SCHEMA.replace(/^\s*client_id INTEGER REFERENCES clients\(id\) ON DELETE SET NULL,\r?\n/gm, '');
    legacy.exec(legacySchema);
    legacy.prepare("INSERT INTO clients(name) VALUES (?)").run('Существующий клиент');
    legacy.prepare("INSERT INTO leads(title,service,source) VALUES (?,?,?)").run('Существующая заявка', 'demolition', 'phone');
    legacy.prepare("INSERT INTO projects(title,service) VALUES (?,?)").run('Существующий объект', 'demolition');
    legacy.close();
    legacy = null;

    db = openDatabase(directory);
    const leadColumns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(column => column.name));
    const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
    assert.ok(leadColumns.has('client_id'));
    assert.ok(projectColumns.has('client_id'));
    assert.equal(db.prepare('SELECT title FROM leads WHERE id=1').get().title, 'Существующая заявка');
    assert.equal(db.prepare('SELECT title FROM projects WHERE id=1').get().title, 'Существующий объект');

    db.prepare('UPDATE leads SET client_id=1 WHERE id=1').run();
    db.prepare('UPDATE projects SET client_id=1 WHERE id=1').run();
    assert.equal(db.prepare('SELECT client_id FROM leads WHERE id=1').get().client_id, 1);
    assert.equal(db.prepare('SELECT client_id FROM projects WHERE id=1').get().client_id, 1);
    db.prepare('DELETE FROM clients WHERE id=1').run();
    assert.equal(db.prepare('SELECT client_id FROM leads WHERE id=1').get().client_id, null);
    assert.equal(db.prepare('SELECT client_id FROM projects WHERE id=1').get().client_id, null);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    if (db && db.open) db.close();
    if (legacy && legacy.open) legacy.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
