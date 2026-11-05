'use strict';

const path = require('node:path');
const fs = require('node:fs');

async function replaceDatabaseWithRollback({
  database,
  userDataPath,
  livePath,
  restoreCandidatePath,
  openDatabase,
  validateDatabase,
  onDatabase = () => {},
  fileSystem = fs,
  now = new Date()
}) {
  if (!database || typeof database.backup !== 'function' || typeof database.close !== 'function') {
    throw new TypeError('A live SQLite database is required for restore.');
  }
  if (typeof openDatabase !== 'function' || typeof validateDatabase !== 'function') {
    throw new TypeError('Database opener and validator are required for restore.');
  }

  const safetyPath = path.join(
    userDataPath,
    `SKOL-before-restore-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`
  );
  const sidecars = [`${livePath}-wal`, `${livePath}-shm`];
  const removeSidecars = () => {
    for (const sidecar of sidecars) {
      if (fileSystem.existsSync(sidecar)) fileSystem.rmSync(sidecar, { force: true });
    }
  };

  try {
    database.pragma('wal_checkpoint(FULL)');
    await database.backup(safetyPath);
  } catch (error) {
    try { fileSystem.rmSync(safetyPath, { force: true }); } catch {}
    throw new Error(`Не удалось создать страховочную копию. Действующая база не изменена. ${error.message}`);
  }

  database.close();
  let replacementDatabase = null;
  try {
    removeSidecars();
    fileSystem.copyFileSync(restoreCandidatePath, livePath);
    replacementDatabase = openDatabase(userDataPath);
    onDatabase(replacementDatabase);
    validateDatabase(replacementDatabase);
    return { database: replacementDatabase, safetyPath };
  } catch (error) {
    try { if (replacementDatabase && replacementDatabase.open) replacementDatabase.close(); } catch {}
    try {
      removeSidecars();
      fileSystem.copyFileSync(safetyPath, livePath);
      const rollbackDatabase = openDatabase(userDataPath);
      onDatabase(rollbackDatabase);
      validateDatabase(rollbackDatabase);
    } catch (rollbackError) {
      throw new Error(
        `Восстановление не завершено: ${error.message}. Автоматический откат также не удался: ${rollbackError.message}. Сохранённая копия: ${safetyPath}`
      );
    }
    throw new Error(`Восстановление не удалось; прежняя база возвращена. ${error.message}`);
  }
}

module.exports = { replaceDatabaseWithRollback };
