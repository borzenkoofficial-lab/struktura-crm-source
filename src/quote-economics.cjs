'use strict';

function nonNegativeFinite(value, field) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) {
    throw new Error(field + ' должно быть конечным неотрицательным числом в допустимом диапазоне.');
  }
  return n;
}
function safeRubles(value, field) {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || rounded < 0) {
    throw new Error(field + ' выходит за допустимый диапазон рублей.');
  }
  return rounded;
}
function sumSafeAmounts(values, field) {
  const sum = values.reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum) || sum < 0 || sum > Number.MAX_SAFE_INTEGER) {
    throw new Error(field + ' превышает допустимую сумму.');
  }
  return sum;
}
function calculateQuoteTotals(lines, discountInput = 0, costInputs = {}) {
  const sourceLines = Array.isArray(lines) ? lines.slice(0, 500) : [];
  const normalized = sourceLines.map((line, index) => {
    if (!line || typeof line !== 'object') {
      throw new Error('Строка КП №' + (index + 1) + ' имеет неверный формат.');
    }
    const quantity = nonNegativeFinite(line.quantity, 'Количество в строке КП №' + (index + 1));
    const price = nonNegativeFinite(line.price, 'Цена в строке КП №' + (index + 1));
    const cost = nonNegativeFinite(line.cost, 'Себестоимость строки КП №' + (index + 1));
    return {
      revenueRub: safeRubles(quantity * price, 'Сумма строки КП №' + (index + 1)),
      costAmount: nonNegativeFinite(quantity * cost, 'Себестоимость строки КП №' + (index + 1))
    };
  });

  // Round each printed work line before aggregating so PDF row totals equal the gross total.
  const grossRevenueRub = sumSafeAmounts(normalized.map(line => line.revenueRub), 'Сумма работ');
  const discountRequestedRub = safeRubles(nonNegativeFinite(discountInput, 'Скидка'), 'Скидка');
  const discountRub = Math.min(grossRevenueRub, discountRequestedRub);
  const revenueRub = grossRevenueRub - discountRub;

  const extraFields = [
    ['payroll', 'Оплата бригады'],
    ['materials', 'Материалы'],
    ['disposal', 'Вывоз и утилизация'],
    ['transport', 'Транспорт'],
    ['equipment', 'Инструмент и техника'],
    ['other', 'Прочие расходы']
  ];
  const extraCosts = extraFields.map(([key, label]) => nonNegativeFinite(costInputs?.[key], label));
  const lineCosts = sumSafeAmounts(normalized.map(line => line.costAmount), 'Себестоимость работ');
  const directCosts = sumSafeAmounts([lineCosts, ...extraCosts], 'Прямые затраты');

  const overheadPercent = nonNegativeFinite(costInputs?.overheadPercent, 'Накладные расходы, %');
  const taxPercent = nonNegativeFinite(costInputs?.taxPercent, 'Налоговый резерв, %');
  if (overheadPercent > 100) throw new Error('Накладные расходы не могут превышать 100%.');
  if (taxPercent > 50) throw new Error('Налоговый резерв не может превышать 50%.');

  const overheadRub = directCosts * overheadPercent / 100;
  const taxReserveRub = revenueRub * taxPercent / 100;
  const costRub = safeRubles(directCosts + overheadRub + taxReserveRub, 'Полная себестоимость');
  const profitRub = revenueRub - costRub;
  return {
    grossRevenueRub, revenueRub, costRub, profitRub, discountRub,
    lineCostsRub: safeRubles(lineCosts, 'Себестоимость работ'),
    directCostsRub: safeRubles(directCosts, 'Прямые затраты'),
    overheadRub: safeRubles(overheadRub, 'Накладные расходы'),
    taxReserveRub: safeRubles(taxReserveRub, 'Налоговый резерв'),
    marginPct: revenueRub > 0 ? profitRub / revenueRub * 100 : 0
  };
}

module.exports = { calculateQuoteTotals };
