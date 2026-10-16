'use strict';

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function safeMoney(value, label, warnings, { allowNegative = false } = {}) {
  const number = value === null || value === undefined || value === '' ? 0 : Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) {
    warnings.push(`${label}: сумма некорректна; в расчёте использован 0 ₽.`);
    return 0;
  }
  return number;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildFinanceInsights({ today, cash = 0, projects = [], expenses = [] }) {
  if (!isoDate(today)) throw new Error('Дата должна быть в формате YYYY-MM-DD.');
  const dataWarnings = [];
  const cashNumber = cash === null || cash === undefined || cash === '' ? 0 : Number(cash);
  const normalizedCash = Number.isFinite(cashNumber) ? cashNumber : (dataWarnings.push('Денежный остаток: сумма некорректна; в расчёте использован 0 ₽.'), 0);
  const activeProjects = projects.filter(p => p.status !== 'cancelled');
  const receivables = activeProjects.map(p => {
    const received = safeMoney(p.received_rub, `Получено по объекту «${p.title || p.id || 'без названия'}»`, dataWarnings, { allowNegative: true });
    const contract = safeMoney(p.contract_rub, `Договор по объекту «${p.title || p.id || 'без названия'}»`, dataWarnings);
    if (p.end_date && !isoDate(p.end_date)) dataWarnings.push(`Объект «${p.title || p.id || 'без названия'}»: дата окончания некорректна; поступление не включено в прогноз по срокам.`);
    return { ...p, debtRub: Math.max(0, contract - Math.max(0, received)) };
  }).filter(p => p.debtRub > 0);
  const unpaid = expenses.filter(e => Number(e.is_paid) === 0).map(e => {
    const amountRub = safeMoney(e.amount_rub, `Расход «${e.description || e.id || 'без названия'}»`, dataWarnings);
    const dueDate = isoDate(e.expense_date);
    if (e.expense_date && !dueDate) dataWarnings.push(`Расход «${e.description || e.id || 'без названия'}»: дата некорректна; он не включён в прогноз по срокам.`);
    return { ...e, amountRub, dueDate };
  });
  const forecasts = [7, 30].map(days => {
    const through = addDays(today, days);
    const expectedReceipts = receivables.filter(p => isoDate(p.end_date) && isoDate(p.end_date) >= today && isoDate(p.end_date) <= through)
      .reduce((sum, p) => sum + p.debtRub, 0);
    const plannedOutflow = unpaid.filter(e => e.dueDate && e.dueDate <= through)
      .reduce((sum, e) => sum + e.amountRub, 0);
    return { days, through, expectedReceipts, plannedOutflow, projectedCash: normalizedCash + expectedReceipts - plannedOutflow };
  });
  const risks = activeProjects.map(p => {
    const contract = safeMoney(p.contract_rub, `Договор по объекту «${p.title || p.id || 'без названия'}»`, dataWarnings);
    const paid = safeMoney(p.paid_expenses_rub, `Оплаченные расходы по объекту «${p.title || p.id || 'без названия'}»`, dataWarnings);
    const planned = safeMoney(p.planned_expenses_rub, `Запланированные расходы по объекту «${p.title || p.id || 'без названия'}»`, dataWarnings);
    const total = paid + planned;
    const ratio = contract > 0 ? total / contract : null;
    return { id: p.id, title: p.title, contractRub: contract, paidExpensesRub: paid, plannedExpensesRub: planned,
      costRatio: ratio, level: ratio === null ? 'unknown' : ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok' };
  }).filter(p => p.level === 'warning' || p.level === 'over').sort((a,b) => (b.costRatio || 0) - (a.costRatio || 0));
  const overdueExpenses = unpaid.filter(e => e.dueDate && e.dueDate < today);
  const unscheduledReceivables = receivables.filter(p => !isoDate(p.end_date));
  return {
    today, cash: normalizedCash, forecasts, risks, dataWarnings: [...new Set(dataWarnings)],
    receivablesTotal: receivables.reduce((sum, p) => sum + p.debtRub, 0),
    unscheduledReceivablesTotal: unscheduledReceivables.reduce((sum, p) => sum + p.debtRub, 0),
    unscheduledReceivables, unpaidTotal: unpaid.reduce((sum, e) => sum + e.amountRub, 0),
    overdueExpensesTotal: overdueExpenses.reduce((sum, e) => sum + e.amountRub, 0),
    overdueExpensesCount: overdueExpenses.length
  };
}

module.exports = { buildFinanceInsights, addDays };
