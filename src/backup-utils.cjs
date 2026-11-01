'use strict';

const REQUIRED_BACKUP_COLUMNS = Object.freeze({
  clients: ['id', 'name', 'phone', 'email', 'client_type', 'notes', 'created_at', 'updated_at'],
  leads: ['id', 'client_id', 'title', 'service', 'source', 'status', 'budget_rub', 'address', 'notes', 'created_at', 'updated_at'],
  projects: ['id', 'lead_id', 'client_id', 'title', 'service', 'status', 'contract_rub', 'address', 'start_date', 'end_date', 'notes', 'created_at', 'updated_at'],
  payments: ['id', 'project_id', 'amount_rub', 'payment_date', 'payment_type', 'method', 'note', 'created_at'],
  expenses: ['id', 'project_id', 'amount_rub', 'expense_date', 'category', 'description', 'is_paid', 'created_at'],
  settings: ['key', 'value']
});

function validateBackupDatabase(database) {
  if (!database || typeof database.pragma !== 'function' || typeof database.prepare !== 'function') {
    throw new Error('Не удалось открыть выбранный файл как базу SQLite.');
  }

  let integrity;
  try {
    integrity = database.pragma('integrity_check', { simple: true });
  } catch (error) {
    throw new Error('Не удалось проверить целостность SQLite: ' + String(error?.message || error));
  }
  if (integrity !== 'ok') {
    throw new Error('Проверка целостности копии не пройдена: ' + String(integrity));
  }

  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  const missingTables = Object.keys(REQUIRED_BACKUP_COLUMNS).filter(table => !tables.has(table));
  if (missingTables.length) {
    throw new Error('Отсутствуют обязательные таблицы: ' + missingTables.join(', ') + '.');
  }

  const schema = new Map();
  for (const table of Object.keys(REQUIRED_BACKUP_COLUMNS)) {
    schema.set(table, new Set(database.prepare('PRAGMA table_info("' + table + '")').all().map(row => row.name)));
  }
  const missingColumns = [];
  for (const [table, requiredColumns] of Object.entries(REQUIRED_BACKUP_COLUMNS)) {
    for (const column of requiredColumns) {
      if (!schema.get(table).has(column)) missingColumns.push(table + '.' + column);
    }
  }
  if (missingColumns.length) {
    throw new Error('В таблицах копии отсутствуют обязательные поля: ' + missingColumns.join(', ') + '.');
  }

  let foreignKeyViolations;
  try {
    foreignKeyViolations = database.pragma('foreign_key_check');
  } catch (error) {
    throw new Error('Не удалось проверить связи между таблицами: ' + String(error?.message || error));
  }
  if (foreignKeyViolations.length) {
    const examples = foreignKeyViolations.slice(0, 3).map(row =>
      String(row.table) + ' → ' + String(row.parent) + (row.rowid == null ? '' : ' (запись ' + row.rowid + ')')
    );
    throw new Error('Нарушены связи между таблицами (' + foreignKeyViolations.length + '): ' + examples.join('; ') + '.');
  }

  return { tableCount: tables.size, validatedTables: Object.keys(REQUIRED_BACKUP_COLUMNS).length, foreignKeyViolations: 0 };
}

module.exports = { REQUIRED_BACKUP_COLUMNS, validateBackupDatabase };
