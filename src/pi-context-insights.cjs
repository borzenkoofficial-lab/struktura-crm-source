'use strict';

// Deterministic, explainable context layer for the ПИ assistant.
// This module does not infer missing financial values or claim statistical certainty.
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => String(value ?? '').trim();
const dateOnly = value => text(value).slice(0, 10);
const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
const pct = value => `${Math.round(value * 10) / 10}%`;

function buildPiContextInsights(history = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const today = dateOnly(now.toISOString());
  const insights = [];
  const add = (item) => insights.push({
    id: item.id,
    category: item.category,
    severity: item.severity || 'info',
    title: item.title,
    message: item.message,
    evidence: item.evidence || [],
    action: item.action,
    speakText: item.speakText || `${item.title}. ${item.message} Рекомендация: ${item.action}`,
    sourceIds: item.sourceIds || [],
  });

  for (const proposal of Array.isArray(history.proposals) ? history.proposals : []) {
    const revenue = num(proposal.total_rub ?? proposal.amount_rub ?? proposal.price_rub);
    const cost = num(proposal.cost_rub ?? proposal.estimated_cost_rub);
    if (revenue === null || cost === null || revenue <= 0) continue;
    const profit = revenue - cost;
    const margin = profit / revenue * 100;
    if (profit < 0) {
      add({ id: `proposal-loss:${proposal.id ?? proposal.project_id ?? 'unknown'}`, category: 'finance', severity: 'critical',
        title: 'КП с отрицательной прибылью', message: `По КП «${text(proposal.title) || 'Без названия'}» расчётная себестоимость выше цены на ${money(Math.abs(profit))}.`,
        evidence: [`Цена: ${money(revenue)}`, `Себестоимость: ${money(cost)}`, `Расчётная прибыль: ${money(profit)}`],
        action: 'Проверь состав работ, трудозатраты и цену до отправки или подтверждения КП.',
        sourceIds: [proposal.id].filter(Boolean) });
    } else if (margin < 10) {
      add({ id: `proposal-low-margin:${proposal.id ?? proposal.project_id ?? 'unknown'}`, category: 'finance', severity: 'warning',
        title: 'Низкая маржа в КП', message: `Расчётная маржа по КП «${text(proposal.title) || 'Без названия'}» — ${pct(margin)}.`,
        evidence: [`Цена: ${money(revenue)}`, `Себестоимость: ${money(cost)}`, `Расчётная прибыль: ${money(profit)}`],
        action: 'Перепроверь смету и резерв на сложность до согласования цены.',
        sourceIds: [proposal.id].filter(Boolean) });
    }
  }

  for (const project of Array.isArray(history.projects) ? history.projects : []) {
    const status = text(project.status).toLowerCase();
    if (['completed', 'cancelled', 'завершён', 'завершен', 'отменён', 'отменен'].includes(status)) continue;
    const due = dateOnly(project.due_date ?? project.deadline ?? project.planned_end_date);
    if (due && due < today) {
      add({ id: `project-overdue:${project.id ?? text(project.title)}`, category: 'production', severity: 'warning',
        title: 'Срок объекта уже прошёл', message: `По объекту «${text(project.title) || 'Без названия'}» плановый срок ${due} прошёл.`,
        evidence: [`Плановый срок: ${due}`, `Статус: ${text(project.status) || 'не указан'}`],
        action: 'Обнови остаток работ и дату завершения; проверь последние отчёты смен.',
        sourceIds: [project.id].filter(Boolean) });
    }
    const projectShifts = (Array.isArray(history.shifts) ? history.shifts : []).filter(s => String(s.project_id) === String(project.id));
    const lastShift = projectShifts.map(s => dateOnly(s.shift_date ?? s.date)).filter(Boolean).sort().at(-1);
    if (status === 'active' && lastShift && (new Date(today) - new Date(lastShift)) / 86400000 >= 3) {
      add({ id: `project-stale-shift:${project.id ?? text(project.title)}`, category: 'production', severity: 'warning',
        title: 'Давно не было отчёта смены', message: `По объекту «${text(project.title) || 'Без названия'}» последний отчёт смены датирован ${lastShift}.`,
        evidence: [`Последняя записанная смена: ${lastShift}`, 'Порог сигнала: 3 календарных дня без отчёта'],
        action: 'Проверь, работает ли бригада, и внеси фактический отчёт или причину простоя.',
        sourceIds: [project.id].filter(Boolean) });
    }
  }

  const payments = Array.isArray(history.payments) ? history.payments : [];
  const expenses = Array.isArray(history.expenses) ? history.expenses : [];
  const received = payments.reduce((sum, row) => sum + (num(row.amount_rub ?? row.amount) || 0), 0);
  const spent = expenses.reduce((sum, row) => sum + (num(row.amount_rub ?? row.amount) || 0), 0);
  if (payments.length && expenses.length && spent > received) {
    add({ id: 'finance-expenses-exceed-receipts', category: 'finance', severity: 'warning',
      title: 'Расходы выше учтённых поступлений', message: `В загруженной истории расходы превышают поступления на ${money(spent - received)}.`,
      evidence: [`Учтённые поступления: ${money(received)}`, `Учтённые расходы: ${money(spent)}`, 'Сравнение охватывает переданные записи без привязки к периоду или объекту.'],
      action: 'Проверь период, полноту поступлений и не смешаны ли расходы разных объектов.',
      speakText: `Обрати внимание: расходы в переданных записях выше поступлений на ${money(spent - received)}. Это не обязательно убыток за период: сначала нужно сверить даты и полноту записей.` });
  }

  for (const estimate of Array.isArray(history.estimates) ? history.estimates : []) {
    const lines = Array.isArray(estimate.lines) ? estimate.lines : [];
    const incomplete = lines.filter(line => {
      const quantity = num(line.quantity ?? line.volume);
      const price = num(line.price_rub ?? line.unit_price);
      const cost = num(line.cost_rub ?? line.unit_cost);
      return quantity === null || quantity <= 0 || price === null || price < 0 || cost === null || cost < 0;
    });
    if (incomplete.length) {
      add({ id: `estimate-incomplete:${estimate.id ?? text(estimate.title)}`, category: 'estimate', severity: 'warning',
        title: 'В смете не хватает расчётных данных', message: `В смете «${text(estimate.title) || 'Без названия'}» обнаружено позиций с неполными или некорректными объёмами, ценами либо себестоимостью: ${incomplete.length}.`,
        evidence: [`Всего позиций: ${lines.length}`, `Требуют проверки: ${incomplete.length}`],
        action: 'Заполни объём, цену и себестоимость каждой позиции перед использованием итоговой маржи.',
        sourceIds: [estimate.id].filter(Boolean) });
    }
  }

  const seen = new Set();
  return insights
    .filter(item => !seen.has(item.id) && seen.add(item.id))
    .sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a.severity] - ({ critical: 0, warning: 1, info: 2 }[b.severity])))
    .slice(0, Math.max(1, Math.min(20, Number(options.limit) || 8)));
}

module.exports = { buildPiContextInsights };
