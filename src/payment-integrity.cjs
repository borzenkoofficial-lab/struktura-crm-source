'use strict';

function assertPaymentBalance(db, projectId, paymentType, amountRub, excludeId = null) {
  const current = db.prepare(`SELECT COALESCE(SUM(CASE WHEN payment_type='refund' THEN -amount_rub ELSE amount_rub END),0) AS net FROM payments WHERE project_id=? AND (? IS NULL OR id<>?)`).get(projectId, excludeId, excludeId).net;
  const resulting = current + (paymentType === 'refund' ? -amountRub : amountRub);
  if (resulting < 0) throw new Error('Сумма возвратов не может превышать поступления по объекту. Проверь платежи.');
  return resulting;
}

module.exports = { assertPaymentBalance };
