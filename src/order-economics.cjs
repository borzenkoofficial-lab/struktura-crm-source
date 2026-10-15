'use strict';

const { buildRateModel } = require('./production-model.cjs');

function nonNegative(value, label) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(label + ' должно быть неотрицательным числом.');
  return number;
}
function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(label + ' должно быть больше нуля.');
  return number;
}
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function calculateOrderEconomics(input = {}, observations = []) {
  const quantity = positive(input.quantity, 'Объём');
  const baselineProductivity = positive(input.baseline_productivity, 'Производительность');
  const crewSize = Number(input.crew_size);
  if (!Number.isInteger(crewSize) || crewSize < 1 || crewSize > 200) throw new Error('Количество рабочих должно быть от 1 до 200.');
  const budget = nonNegative(input.budget_rub, 'Бюджет');
  const pricePerUnit = nonNegative(input.price_per_unit, 'Цена за единицу');
  if (budget <= 0 && pricePerUnit <= 0) throw new Error('Укажи бюджет заказа или цену за единицу из прайса.');
  const costPerUnit = nonNegative(input.cost_per_unit, 'Себестоимость за единицу');
  const wagePerShift = nonNegative(input.wage_per_worker_shift, 'Оплата рабочего за смену');
  const otherCosts = nonNegative(input.other_costs_rub, 'Дополнительные расходы');
  if (costPerUnit <= 0 && wagePerShift <= 0 && otherCosts <= 0) {
    throw new Error('Не указаны расходы. Заполни себестоимость за единицу, оплату бригады или дополнительные затраты, иначе маржа будет завышена.');
  }
  const difficulty = Number(input.difficulty_factor ?? 1);
  const reserve = Number(input.reserve_percent ?? 15);
  if (!Number.isFinite(difficulty) || difficulty < 0.25 || difficulty > 5) throw new Error('Коэффициент сложности должен быть от 0,25 до 5.');
  if (!Number.isFinite(reserve) || reserve < 0 || reserve > 100) throw new Error('Резерв срока должен быть от 0 до 100%.');
  const model = buildRateModel({ baselineProductivity, observations, targetDifficulty: difficulty, targetCrewSize: crewSize });
  const estimatedDays = round2(Math.max(0.1, quantity / (model.effectiveProductivity * crewSize) * (1 + reserve / 100)));
  const revenue = budget > 0 ? budget : round2(quantity * pricePerUnit);
  const costs = round2(quantity * costPerUnit + crewSize * wagePerShift * estimatedDays + otherCosts);
  const profit = round2(revenue - costs);
  const margin = revenue > 0 ? round2(profit / revenue * 100) : 0;
  return {
    catalog_id: String(input.catalog_id || '').trim().slice(0, 120),
    work_name: String(input.work_name || 'Работа по заказу').trim().slice(0, 180),
    unit: String(input.unit || 'м²').trim().slice(0, 24),
    quantity, budget_rub: budget, price_per_unit: pricePerUnit, cost_per_unit: costPerUnit,
    baseline_productivity: baselineProductivity, effective_productivity: model.effectiveProductivity,
    crew_size: crewSize, wage_per_worker_shift: wagePerShift, other_costs_rub: otherCosts,
    difficulty_factor: difficulty, reserve_percent: reserve, observations_count: model.observations,
    estimated_days: estimatedDays, revenue_rub: revenue, estimated_cost_rub: costs,
    estimated_profit_rub: profit, estimated_margin_pct: margin
  };
}

module.exports = { calculateOrderEconomics };
