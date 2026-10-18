'use strict';

function assertProjectDeletable(db, projectId) {
  const payments = db.prepare('SELECT COUNT(*) AS count FROM payments WHERE project_id=?').get(projectId).count;
  const expenses = db.prepare('SELECT COUNT(*) AS count FROM expenses WHERE project_id=?').get(projectId).count;
  if (payments || expenses) throw new Error('Нельзя удалить объект, пока к нему привязаны платежи или расходы. Удали финансовые записи или исправь их привязку.');
  return true;
}
module.exports = { assertProjectDeletable };
