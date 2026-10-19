'use strict';
(function(root) {
  const STORAGE_KEY = 'struktura-engineering-projects-v1';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const round = (n, digits = 2) => {
    const p = 10 ** digits;
    return Math.round((n + Number.EPSILON) * p) / p;
  };
  const number = (value, label, { min = 0, max = 1e9, allowZero = true } = {}) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (!allowZero && n === 0)) {
      throw new Error(label + ': значение вне допустимого диапазона.');
    }
    return n;
  };
  function calculateEngineeringEstimate(input = {}) {
    const quantity = number(input.quantity, 'Объём', { min: 0, allowZero: false });
    const baseRate = number(input.baselineProductivity, 'Базовая производительность', { min: 0, allowZero: false });
    const crew = number(input.crewSize ?? 5, 'Размер бригады', { min: 1, max: 200, allowZero: false });
    const hoursPerShift = number(input.hoursPerShift ?? 8, 'Длительность смены', { min: 1, max: 24, allowZero: false });
    const wagePerWorkerShift = number(input.wagePerWorkerShift ?? 0, 'Оплата рабочего за смену');
    const pricePerUnit = number(input.pricePerUnit ?? 0, 'Цена за единицу');
    const extraCostPerUnit = number(input.extraCostPerUnit ?? 0, 'Дополнительная себестоимость за единицу');
    const fixedCosts = number(input.fixedCosts ?? 0, 'Постоянные расходы');
    const overheadPercent = number(input.overheadPercent ?? 0, 'Накладные расходы', { max: 100 });
    const taxPercent = number(input.taxPercent ?? 0, 'Налог', { max: 100 });
    const targetMarginPercent = number(input.targetMarginPercent ?? 25, 'Целевая маржа', { max: 80 });
    const reservePercent = number(input.reservePercent ?? 15, 'Резерв срока', { max: 100 });
    const difficultyFactor = number(input.difficultyFactor ?? 1, 'Коэффициент условий', { min: 0.1, max: 3, allowZero: false });
    const observations = Array.isArray(input.observations) ? input.observations : [];
    const validRates = observations.map(o => {
      const q = Number(o.quantity);
      const people = Number(o.people);
      const hours = Number(o.hours);
      const factor = Number(o.conditionFactor ?? 1);
      if (![q, people, hours, factor].every(Number.isFinite) || q <= 0 || people <= 0 || hours <= 0 || factor <= 0) return null;
      return q / (people * hours / 8) * factor;
    }).filter(n => Number.isFinite(n) && n > 0);
    validRates.sort((a, b) => a - b);
    const medianRate = validRates.length
      ? (validRates.length % 2 ? validRates[(validRates.length - 1) / 2] : (validRates[validRates.length / 2 - 1] + validRates[validRates.length / 2]) / 2)
      : null;
    const weight = validRates.length >= 5 ? 0.75 : validRates.length >= 3 ? 0.5 : validRates.length ? 0.25 : 0;
    const learnedNormalRate = medianRate == null ? baseRate : baseRate * (1 - weight) + medianRate * weight;
    const effectiveRate = learnedNormalRate / difficultyFactor;
    const personShifts = quantity / effectiveRate;
    const crewShifts = personShifts / crew * 8 / hoursPerShift;
    const plannedShifts = crewShifts * (1 + reservePercent / 100);
    const laborCost = personShifts * (hoursPerShift / 8) * wagePerWorkerShift;
    const directCost = laborCost + quantity * extraCostPerUnit + fixedCosts;
    const overhead = directCost * overheadPercent / 100;
    const preTaxCost = directCost + overhead;
    const taxBase = quantity * pricePerUnit;
    const tax = taxBase * taxPercent / 100;
    const totalCost = preTaxCost + tax;
    const revenue = quantity * pricePerUnit;
    const profit = revenue - totalCost;
    const minimumPrice = quantity > 0 ? (preTaxCost / (1 - taxPercent / 100)) / quantity : 0;
    const targetPrice = quantity > 0 ? (preTaxCost / (1 - targetMarginPercent / 100 - taxPercent / 100)) / quantity : 0;
    const warnings = [];
    if (validRates.length === 0) warnings.push('Нет фактических наблюдений: используется стартовая норма.');
    else if (validRates.length < 3) warnings.push('Есть только 1–2 наблюдения: обученная норма предварительная.');
    if (pricePerUnit <= 0) warnings.push('Не задана цена для клиента: прибыль и маржа не являются оценкой сделки.');
    if (targetMarginPercent + taxPercent >= 100) warnings.push('Целевая маржа вместе с налоговой долей не оставляет допустимой базы для цены.');
    if (targetMarginPercent + taxPercent >= 100) return { quantity, baselineProductivity: baseRate, observations: validRates.length, effectiveProductivity: round(effectiveRate, 3), personShifts: round(personShifts), crewShifts: round(crewShifts), plannedShifts: round(plannedShifts), laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead), tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit), marginPercent: revenue > 0 ? round(profit / revenue * 100) : null, minimumPricePerUnit: round(minimumPrice, 2), targetPricePerUnit: null, warnings };
    return {
      quantity, baselineProductivity: baseRate, observedMedian: medianRate == null ? null : round(medianRate, 3),
      observations: validRates.length, learnedWeight: weight, effectiveProductivity: round(effectiveRate, 3),
      personShifts: round(personShifts), crewShifts: round(crewShifts), plannedShifts: round(plannedShifts),
      laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead), tax: round(tax),
      totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
      marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
      minimumPricePerUnit: round(minimumPrice, 2),
      targetPricePerUnit: round((preTaxCost / (1 - targetMarginPercent / 100 - taxPercent / 100)) / quantity, 2),
      warnings
    };
  }
  function loadHistory(storage = root.localStorage) {
    try {
      const data = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data.filter(x => x && typeof x.id === 'string' && Array.isArray(x.observations)).slice(0, 500) : [];
    } catch (_) { return []; }
  }
  function saveHistory(items, storage = root.localStorage) {
    if (!Array.isArray(items)) throw new Error('История должна быть списком.');
    storage?.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 500)));
    return true;
  }
  function observationsFor(history, catalogId, workKey) {
    return history.flatMap(project => (project.observations || [])
      .filter(o => (catalogId && o.catalogId === catalogId) || (!catalogId && o.workKey === workKey))
      .map(o => ({ quantity: o.quantity, people: o.people, hours: o.hours, conditionFactor: o.conditionFactor || 1, projectId: project.id })));
  }
  function recordActual(history, projectId, observation) {
    const projects = history.map(p => ({ ...p, observations: [...(p.observations || [])] }));
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Расчёт не найден в истории.');
    const quantity = number(observation.quantity, 'Фактический объём', { min: 0, allowZero: false });
    const people = number(observation.people, 'Число рабочих', { min: 1, max: 200, allowZero: false });
    const hours = number(observation.hours, 'Часы на смену', { min: 1, max: 24, allowZero: false });
    const conditionFactor = number(observation.conditionFactor ?? 1, 'Коэффициент условий', { min: 0.1, max: 3, allowZero: false });
    project.observations.push({ ...observation, quantity, people, hours, conditionFactor, recordedAt: new Date().toISOString() });
    return projects;
  }
  const api = { calculateEngineeringEstimate, loadHistory, saveHistory, observationsFor, recordActual, STORAGE_KEY };
  root.StrukturaEngineeringCalculator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
