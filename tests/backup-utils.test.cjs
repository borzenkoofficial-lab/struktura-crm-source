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
    assert.equal(result.validatedCurrentTables, 17);
    assert.equal(result.schemaVersion, 14);
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


test('backup validation rejects broken foreign-key relationships', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-fk-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    db.pragma('foreign_keys = OFF');
    db.prepare('INSERT INTO payments(project_id,amount_rub,payment_date) VALUES (?,?,?)')
      .run(999999, 1000, '2026-10-21');
    db.pragma('foreign_keys = ON');
    assert.throws(() => validateBackupDatabase(db), /Нарушены связи между таблицами .*payments/i);
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


test('backup validation rejects a current-version database missing a production table', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-missing-table-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    db.exec('DROP TABLE work_shifts');
    assert.throws(
      () => validateBackupDatabase(db),
      /заявляет актуальную схему, но в ней отсутствуют таблицы: work_shifts/i
    );
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('backup validation rejects a current-version database missing a production column', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-missing-column-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    db.exec('ALTER TABLE work_shift_items DROP COLUMN hours');
    assert.throws(
      () => validateBackupDatabase(db),
      /work_shift_items\.hours/
    );
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('backup validation rejects a current-version database missing a commercial order source field', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-backup-missing-order-source-'));
  let db;
  try {
    db = openDatabase(userDataPath);
    db.exec('ALTER TABLE commercial_orders DROP COLUMN source_page_title');
    assert.throws(
      () => validateBackupDatabase(db),
      /commercial_orders\.source_page_title/
    );
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('restore rollback preserves the original database when the replacement fails validation', async () => {
  const { replaceDatabaseWithRollback } = require('../src/backup-restore.cjs');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-restore-rollback-'));
  const livePath = path.join(userDataPath, 'struktura-crm.sqlite');
  const candidatePath = path.join(userDataPath, 'candidate.sqlite');
  const safetyTimestamp = new Date('2026-11-05T12:00:00.000Z');
  let liveDb;
  try {
    liveDb = new Database(livePath);
    liveDb.pragma('journal_mode = WAL');
    liveDb.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    liveDb.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('original-data');

    const candidate = new Database(candidatePath);
    candidate.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    candidate.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('replacement-data');
    candidate.close();

    let currentDb = liveDb;
    await assert.rejects(
      replaceDatabaseWithRollback({
        database: liveDb,
        userDataPath,
        livePath,
        restoreCandidatePath: candidatePath,
        openDatabase: directory => new Database(path.join(directory, 'struktura-crm.sqlite')),
        validateDatabase: database => {
          const value = database.prepare('SELECT value FROM restore_probe').get().value;
          if (value === 'replacement-data') throw new Error('simulated post-restore validation failure');
          assert.equal(value, 'original-data');
        },
        onDatabase: database => { currentDb = database; },
        now: safetyTimestamp
      }),
      /прежняя база возвращена.*simulated post-restore validation failure/i
    );

    assert.equal(currentDb.open, true);
    assert.equal(currentDb.prepare('SELECT value FROM restore_probe').get().value, 'original-data');
    assert.equal(fs.existsSync(path.join(userDataPath, 'SKOL-before-restore-2026-11-05T12-00-00-000Z.sqlite')), true);
    currentDb.close();
    currentDb = null;
    assert.equal(fs.existsSync(livePath + '-wal'), false);
    assert.equal(fs.existsSync(livePath + '-shm'), false);
  } finally {
    if (liveDb && liveDb.open) liveDb.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});

test('restore replacement keeps a safety copy and opens the restored database on success', async () => {
  const { replaceDatabaseWithRollback } = require('../src/backup-restore.cjs');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-restore-success-'));
  const livePath = path.join(userDataPath, 'struktura-crm.sqlite');
  const candidatePath = path.join(userDataPath, 'candidate.sqlite');
  let liveDb;
  let currentDb;
  try {
    liveDb = new Database(livePath);
    liveDb.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    liveDb.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('original-data');
    const candidate = new Database(candidatePath);
    candidate.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    candidate.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('replacement-data');
    candidate.close();

    const result = await replaceDatabaseWithRollback({
      database: liveDb,
      userDataPath,
      livePath,
      restoreCandidatePath: candidatePath,
      openDatabase: directory => new Database(path.join(directory, 'struktura-crm.sqlite')),
      validateDatabase: database => {
        assert.equal(database.prepare('SELECT value FROM restore_probe').get().value, 'replacement-data');
      },
      onDatabase: database => { currentDb = database; },
      now: new Date('2026-11-05T12:00:00.000Z')
    });

    assert.equal(result.database, currentDb);
    assert.equal(currentDb.prepare('SELECT value FROM restore_probe').get().value, 'replacement-data');
    assert.equal(fs.existsSync(result.safetyPath), true);
    currentDb.close();
    currentDb = null;
  } finally {
    if (currentDb && currentDb.open) currentDb.close();
    if (liveDb && liveDb.open) liveDb.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});


test('restore leaves the live database open and unchanged when safety backup creation fails', async () => {
  const { replaceDatabaseWithRollback } = require('../src/backup-restore.cjs');
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'skol-restore-safety-failure-'));
  const livePath = path.join(userDataPath, 'struktura-crm.sqlite');
  const candidatePath = path.join(userDataPath, 'candidate.sqlite');
  let db;
  try {
    db = new Database(livePath);
    db.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    db.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('original-data');
    const candidate = new Database(candidatePath);
    candidate.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)');
    candidate.prepare('INSERT INTO restore_probe(value) VALUES (?)').run('replacement-data');
    candidate.close();

    const databaseWithFailedBackup = {
      pragma: (...args) => db.pragma(...args),
      backup: async () => { throw new Error('simulated disk write failure'); },
      close: () => db.close(),
      get open() { return db.open; }
    };
    await assert.rejects(
      replaceDatabaseWithRollback({
        database: databaseWithFailedBackup,
        userDataPath,
        livePath,
        restoreCandidatePath: candidatePath,
        openDatabase: directory => new Database(path.join(directory, 'struktura-crm.sqlite')),
        validateDatabase: () => { throw new Error('must not validate an uninstalled candidate'); },
        now: new Date('2026-11-05T13:00:00.000Z')
      }),
      /Действующая база не изменена.*simulated disk write failure/i
    );

    assert.equal(db.open, true);
    assert.equal(db.prepare('SELECT value FROM restore_probe').get().value, 'original-data');
    assert.equal(fs.existsSync(path.join(userDataPath, 'SKOL-before-restore-2026-11-05T13-00-00-000Z.sqlite')), false);
  } finally {
    if (db && db.open) db.close();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  }
});
