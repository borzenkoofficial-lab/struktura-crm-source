'use strict';

const REQUIRED_BACKUP_COLUMNS = Object.freeze({
  clients: ['id', 'name', 'phone', 'email', 'client_type', 'notes', 'created_at', 'updated_at'],
  leads: ['id', 'client_id', 'title', 'service', 'source', 'status', 'budget_rub', 'address', 'notes', 'created_at', 'updated_at'],
  projects: ['id', 'lead_id', 'client_id', 'title', 'service', 'status', 'contract_rub', 'address', 'start_date', 'end_date', 'notes', 'created_at', 'updated_at'],
  payments: ['id', 'project_id', 'amount_rub', 'payment_date', 'payment_type', 'method', 'note', 'created_at'],
  expenses: ['id', 'project_id', 'amount_rub', 'expense_date', 'category', 'description', 'is_paid', 'created_at'],
  settings: ['key', 'value']
});

// Schema version 14 contains all current customer, production, engineering,
// reporting and commercial-order data. A backup claiming this version must
// contain every corresponding table and column before it can replace live data.
const CURRENT_SCHEMA_VERSION = 14;
const REQUIRED_CURRENT_BACKUP_COLUMNS = Object.freeze({
  clients: ['id', 'name', 'phone', 'email', 'contact_name', 'client_type', 'notes', 'created_at', 'updated_at'],
  leads: ['id', 'client_id', 'commercial_order_id', 'title', 'service', 'source', 'status', 'budget_rub', 'address', 'next_action', 'next_action_at', 'notes', 'created_at', 'updated_at'],
  projects: ['id', 'lead_id', 'client_id', 'title', 'service', 'status', 'contract_rub', 'address', 'start_date', 'end_date', 'planned_people', 'complexity_factor', 'notes', 'created_at', 'updated_at'],
  income_records: ['id', 'amount_rub', 'income_date', 'record_type', 'source', 'note', 'created_at'],
  activities: ['id', 'client_id', 'lead_id', 'kind', 'body', 'occurred_at'],
  tasks: ['id', 'lead_id', 'project_id', 'title', 'due_at', 'is_done', 'created_at'],
  prospects: ['id', 'company_name', 'category', 'service', 'region', 'phone', 'email', 'website', 'source_url', 'source_name', 'discovered_at', 'status', 'notes'],
  commercial_orders: ['id', 'source_name', 'service', 'region', 'signal_score', 'signal_labels', 'status', 'customer_name', 'contact_name', 'phone', 'email', 'budget_rub', 'volume_value', 'volume_unit', 'deadline_text', 'procurement_number', 'work_address', 'fact_evidence_json', 'first_seen_at'],
  commercial_order_analysis: ['order_id', 'catalog_id', 'work_name', 'unit', 'quantity', 'budget_rub', 'price_per_unit', 'cost_per_unit', 'baseline_productivity', 'effective_productivity', 'crew_size', 'wage_per_worker_shift', 'other_costs_rub', 'difficulty_factor', 'reserve_percent', 'observations_count', 'estimated_days', 'revenue_rub', 'estimated_cost_rub', 'estimated_profit_rub', 'estimated_margin_pct', 'updated_at'],
  competitor_listings: ['id', 'source_name', 'source_url', 'title', 'price_rub', 'region', 'published_at', 'discovered_at', 'content_hash', 'notes'],
  import_jobs: ['id', 'source_name', 'file_name', 'imported_count', 'skipped_count', 'error_count', 'details', 'created_at'],
  quote_history: ['id', 'title', 'customer', 'address', 'prepared_at', 'revenue_rub', 'cost_rub', 'profit_rub', 'margin_pct', 'discount_rub', 'lines_count', 'lines_json', 'file_path'],
  engineering_project_plans: ['id', 'title', 'created_at', 'operations_json', 'result_json', 'updated_at'],
  production_plans: ['id', 'project_id', 'catalog_id', 'work_name', 'unit', 'planned_quantity', 'baseline_productivity', 'created_at', 'updated_at'],
  work_shifts: ['id', 'project_id', 'shift_date', 'workers_count', 'shift_hours', 'downtime_hours', 'complexity_factor', 'notes', 'created_at'],
  work_shift_items: ['id', 'shift_id', 'catalog_id', 'work_name', 'unit', 'quantity_done', 'workers_count', 'hours', 'baseline_productivity', 'created_at'],
  commercial_order_documents: ['id', 'order_id', 'source_url', 'title', 'file_name', 'mime_type', 'page_count', 'extracted_text', 'fact_evidence_json', 'sha256', 'fetched_at', 'created_at', 'updated_at', 'document_type', 'sheet_count', 'row_count', 'line_items_json']
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
  const requiredColumnsByTable = { ...REQUIRED_BACKUP_COLUMNS };
  const schemaVersionRow = database.prepare("SELECT value FROM settings WHERE key='schema_version'").get();
  const schemaVersion = Number(schemaVersionRow?.value || 0);
  const isCurrentSchema = Number.isSafeInteger(schemaVersion) && schemaVersion >= CURRENT_SCHEMA_VERSION;
  if (isCurrentSchema) {
    Object.assign(requiredColumnsByTable, REQUIRED_CURRENT_BACKUP_COLUMNS);
  }

  const missingCurrentTables = isCurrentSchema
    ? Object.keys(REQUIRED_CURRENT_BACKUP_COLUMNS).filter(table => !tables.has(table))
    : [];
  if (missingCurrentTables.length) {
    throw new Error('Резервная копия заявляет актуальную схему, но в ней отсутствуют таблицы: ' + missingCurrentTables.join(', ') + '.');
  }

  for (const table of Object.keys(requiredColumnsByTable)) {
    if (!tables.has(table)) continue;
    schema.set(table, new Set(database.prepare('PRAGMA table_info("' + table + '")').all().map(row => row.name)));
  }
  const missingColumns = [];
  for (const [table, requiredColumns] of Object.entries(requiredColumnsByTable)) {
    if (!schema.has(table)) continue;
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

  return {
    tableCount: tables.size,
    validatedTables: Object.keys(REQUIRED_BACKUP_COLUMNS).length,
    validatedCurrentTables: isCurrentSchema ? Object.keys(REQUIRED_CURRENT_BACKUP_COLUMNS).length : 0,
    schemaVersion: isCurrentSchema ? schemaVersion : null,
    foreignKeyViolations: 0
  };
}

module.exports = {
  REQUIRED_BACKUP_COLUMNS,
  REQUIRED_CURRENT_BACKUP_COLUMNS,
  CURRENT_SCHEMA_VERSION,
  validateBackupDatabase
};
