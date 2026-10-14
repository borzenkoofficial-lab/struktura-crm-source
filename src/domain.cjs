const SERVICE_LABELS = {
  demolition: 'Демонтаж',
  finishing: 'Отделочные работы',
  raised_floor: 'Фальшполы'
};
const SOURCE_LABELS = {
  avito: 'Авито', phone: 'Телефон', telegram: 'Telegram',
  recommendation: 'Рекомендация', website: 'Сайт', other: 'Другое'
};
const STATUS_LABELS = {
  new: 'Новая', contacted: 'Связались', measurement: 'Замер', estimate: 'Смета',
  negotiation: 'Переговоры', won: 'Выиграна', lost: 'Отказ'
};
function rub(value) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(value || 0));
}
function projectMetrics(contractRub, incomingRub, refundRub, paidExpensesRub, plannedExpensesRub) {
  const contract = Number(contractRub || 0);
  const received = Number(incomingRub || 0) - Number(refundRub || 0);
  const paidExpenses = Number(paidExpensesRub || 0);
  const plannedExpenses = Number(plannedExpensesRub || 0);
  if ([contract, received, paidExpenses, plannedExpenses].some(n => !Number.isFinite(n) || n < 0)) {
    throw new RangeError('Суммы должны быть неотрицательными числами');
  }
  return {
    debtRub: Math.max(0, contract - received),
    cashAfterPaidExpensesRub: received - paidExpenses,
    estimatedProfitRub: contract - plannedExpenses,
    receivedRub: received,
    paidExpensesRub: paidExpenses
  };
}
module.exports = { SERVICE_LABELS, SOURCE_LABELS, STATUS_LABELS, rub, projectMetrics };
