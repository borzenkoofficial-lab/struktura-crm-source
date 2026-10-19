'use strict';
(function(root) {
  const round = (n, digits = 2) => {
    const p = 10 ** digits;
    return Math.round((n + Number.EPSILON) * p) / p;
  };
  const positive = (value, label, allowZero = false) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) throw new Error(label + ': требуется ' + (allowZero ? 'неотрицательное' : 'положительное') + ' число.');
    return n;
  };
  function normalizeOperations(operations) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error('Добавь хотя бы одну технологическую операцию.');
    if (operations.length > 100) throw new Error('В одном объекте допускается не более 100 операций.');
    const ids = new Set();
    const normalized = operations.map((op, index) => {
      const id = String(op.id || '').trim();
      const name = String(op.name || '').trim();
      if (!id || ids.has(id)) throw new Error('У каждой операции должен быть уникальный ID.');
      ids.add(id);
      if (!name) throw new Error('Укажи название операции №' + (index + 1) + '.');
      const quantity = positive(op.quantity, name + ' · объём');
      const productivity = positive(op.productivity, name + ' · производительность');
      const crewSize = positive(op.crewSize ?? 5, name + ' · бригада');
      const hoursPerShift = positive(op.hoursPerShift ?? 8, name + ' · часы смены');
      if (crewSize > 200 || hoursPerShift > 24) throw new Error(name + ': бригада не более 200 человек, смена не более 24 часов.');
      const difficultyFactor = positive(op.difficultyFactor ?? 1, name + ' · коэффициент сложности');
      if (difficultyFactor < 0.1 || difficultyFactor > 3) throw new Error(name + ': коэффициент сложности должен быть от 0,1 до 3.');
      const predecessors = Array.isArray(op.predecessors) ? [...new Set(op.predecessors.map(String))] : [];
      if (predecessors.includes(id)) throw new Error(name + ': операция не может зависеть сама от себя.');
      return {
        ...op, id, name, quantity, productivity, crewSize, hoursPerShift, difficultyFactor, predecessors,
        wagePerWorkerShift: positive(op.wagePerWorkerShift ?? 0, name + ' · оплата', true),
        pricePerUnit: positive(op.pricePerUnit ?? 0, name + ' · цена', true),
        extraCostPerUnit: positive(op.extraCostPerUnit ?? 0, name + ' · доп. расходы', true),
        fixedCosts: positive(op.fixedCosts ?? 0, name + ' · постоянные расходы', true),
        overheadPercent: positive(op.overheadPercent ?? 0, name + ' · накладные расходы', true),
        taxPercent: positive(op.taxPercent ?? 0, name + ' · налог', true),
        reservePercent: positive(op.reservePercent ?? 15, name + ' · резерв срока', true)
      };
    });
    for (const op of normalized) {
      for (const predecessor of op.predecessors) {
        if (!ids.has(predecessor)) throw new Error(op.name + ': зависимость "' + predecessor + '" не найдена.');
      }
    }
    return normalized;
  }
  function calculateProjectPlan(operations) {
    const items = normalizeOperations(operations);
    const byId = new Map(items.map(op => [op.id, op]));
    const state = new Map();
    const ordered = [];
    function visit(op, chain = []) {
      const status = state.get(op.id);
      if (status === 'done') return;
      if (status === 'visiting') throw new Error('Обнаружен цикл технологических зависимостей: ' + [...chain, op.name].join(' → '));
      state.set(op.id, 'visiting');
      op.predecessors.forEach(id => visit(byId.get(id), [...chain, op.name]));
      state.set(op.id, 'done');
      ordered.push(op);
    }
    items.forEach(op => visit(op));
    const scheduled = new Map();
    for (const op of ordered) {
      const effectiveProductivity = op.productivity / op.difficultyFactor;
      const personShifts = op.quantity / effectiveProductivity;
      const duration = personShifts / op.crewSize * 8 / op.hoursPerShift;
      const startShift = op.predecessors.reduce((max, id) => Math.max(max, scheduled.get(id).finishShift), 0);
      const plannedStartShift = op.predecessors.reduce((max, id) => Math.max(max, scheduled.get(id).plannedFinishShift), 0);
      const finishShift = startShift + duration;
      const plannedFinishShift = plannedStartShift + duration * (1 + op.reservePercent / 100);
      const laborCost = personShifts * (8 / op.hoursPerShift) * op.wagePerWorkerShift;
      const directCost = laborCost + op.quantity * op.extraCostPerUnit + op.fixedCosts;
      const overhead = directCost * op.overheadPercent / 100;
      const preTaxCost = directCost + overhead;
      const revenue = op.quantity * op.pricePerUnit;
      const tax = revenue * op.taxPercent / 100;
      const totalCost = preTaxCost + tax;
      const profit = revenue - totalCost;
      scheduled.set(op.id, {
        id: op.id, name: op.name, predecessors: op.predecessors,
        quantity: op.quantity, productivity: round(effectiveProductivity, 3),
        personShifts: round(personShifts), crewShifts: round(duration),
        startShift: round(startShift), finishShift: round(finishShift),
        plannedStartShift: round(plannedStartShift), plannedFinishShift: round(plannedFinishShift),
        laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead),
        tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
        marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
        crewSize: op.crewSize, hoursPerShift: op.hoursPerShift, reservePercent: op.reservePercent
      });
    }
    const results = items.map(op => scheduled.get(op.id));
    const totalCost = results.reduce((sum, op) => sum + op.totalCost, 0);
    const revenue = results.reduce((sum, op) => sum + op.revenue, 0);
    const laborCost = results.reduce((sum, op) => sum + op.laborCost, 0);
    const directCost = results.reduce((sum, op) => sum + op.directCost, 0);
    const overhead = results.reduce((sum, op) => sum + op.overhead, 0);
    const tax = results.reduce((sum, op) => sum + op.tax, 0);
    const profit = revenue - totalCost;
    const projectFinish = Math.max(...results.map(op => op.finishShift));
    const plannedFinish = Math.max(...results.map(op => op.plannedFinishShift));
    return {
      operations: results, operationCount: results.length,
      totalPersonShifts: round(results.reduce((sum, op) => sum + op.personShifts, 0)),
      totalLaborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead),
      tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
      marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
      durationShifts: round(projectFinish), plannedDurationShifts: round(plannedFinish),
      parallelismNote: 'Независимые операции планируются параллельно. Расчёт предполагает отдельные бригады для одновременно выполняемых работ; общий ограниченный ресурс бригады пока не распределяется.'
    };
  }
  const api = { calculateProjectPlan, normalizeOperations };
  root.StrukturaEngineeringProjectPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
