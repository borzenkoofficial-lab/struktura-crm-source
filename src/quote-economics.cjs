'use strict';

function nonNegativeFinite(value, field) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error(field + ' должно быть конечным неотрицательным числом.');
  return n;
}
function safeRubles(value, field) {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0) throw new Error(field + ' выходит за допустимый диапазон рублей.');
  return rounded;
}
function sumSafeRubles(values, field) {
  const sum = values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(sum) || sum < 0) throw new Error(field + ' превышает допустимую сумму.');
  return sum;
}
function calculateQuoteTotals(lines, discountInput = 0) {
  const sourceLines = Array.isArray(lines) ? lines.slice(0, 500) : [];
  const normalized = sourceLines.map((line, index) => {
    if (!line || typeof line !== 'object') throw new Error('Строка КП №' + (index + 1) + ' имеет неверный формат.');
    const quantity = nonNegativeFinite(line.quantity, 'Количество в строке КП №' + (index + 1));
    const price = nonNegativeFinite(line.price, 'Цена в строке КП №' + (index + 1));
    const cost = nonNegativeFinite(line.cost, 'Себестоимость строки КП №' + (index + 1));
    return {
      revenueRub: safeRubles(quantity * price, 'Сумма строки КП №' + (index + 1)),
      costRub: safeRubles(quantity * cost, 'Себестоимость строки КП №' + (index + 1))
    };
  });
  // Round each work line to whole roubles so printed row totals add up to the gross total.
  const grossRevenueRub = sumSafeRubles(normalized.map(line => line.revenueRub), 'Сумма работ');
  const costRub = sumSafeRubles(normalized.map(line => line.costRub), 'Себестоимость');
  const requestedDiscount = safeRubles(nonNegativeFinite(discountInput, 'Скидка'), 'Скидка');
  const discountRub = Math.min(grossRevenueRub, requestedDiscount);
  const revenueRub = grossRevenueRub - discountRub;
  const profitRub = revenueRub - costRub;
  return { grossRevenueRub, revenueRub, costRub, profitRub, discountRub, marginPct: revenueRub > 0 ? profitRub / revenueRub * 100 : 0 };
}
module.exports = { calculateQuoteTotals };
