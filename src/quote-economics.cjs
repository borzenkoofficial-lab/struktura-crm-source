'use strict';

function nonNegative(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(label + ' должно быть неотрицательным числом.');
  }
  return number;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Totals for the commercial quote PDF and quote history.
 * estimatedCostRub is supplied by the detailed estimate calculator because
 * the PDF line payload intentionally contains presentation fields only.
 */
function calculateQuoteTotals(lines, discount = 0, estimatedCostRub) {
  if (!Array.isArray(lines)) throw new Error('Строки сметы должны быть списком.');
  const grossRevenueRub = round2(lines.reduce((sum, line) => {
    const quantity = nonNegative(line?.quantity, 'Количество');
    const price = nonNegative(line?.price, 'Цена');
    return sum + quantity * price;
  }, 0));

  const requestedDiscount = nonNegative(discount, 'Скидка');
  const discountRub = round2(Math.min(requestedDiscount, grossRevenueRub));
  const revenueRub = round2(Math.max(0, grossRevenueRub - discountRub));
  const calculatedLineCost = round2(lines.reduce((sum, line) => {
    const quantity = nonNegative(line?.quantity, 'Количество');
    const cost = nonNegative(line?.cost, 'Себестоимость');
    return sum + quantity * cost;
  }, 0));
  const costRub = round2(estimatedCostRub === undefined || estimatedCostRub === null
    ? calculatedLineCost
    : nonNegative(estimatedCostRub, 'Полная себестоимость'));
  const profitRub = round2(revenueRub - costRub);
  const marginPct = revenueRub > 0 ? round2(profitRub / revenueRub * 100) : 0;

  return { grossRevenueRub, discountRub, revenueRub, costRub, profitRub, marginPct };
}

module.exports = { calculateQuoteTotals };
