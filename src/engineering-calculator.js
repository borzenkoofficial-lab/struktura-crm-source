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
  function calculateConditionFactor(input = {}) {
    const isScreed = /стяжк/i.test(String(input.workName || '')) || String(input.workId || '').includes('floor-screed');
    const thickness = Number(input.thicknessMm);
    const thicknessFactor = isScreed && Number.isFinite(thickness) && thickness > 0 ? clamp(Math.sqrt(thickness / 50), 0.7, 2.2) : 1;
    const reinforcementFactor = input.reinforced === 'yes' ? 1.25 : input.reinforced === 'unknown' ? 1.1 : 1;
    const floor = Number(input.floor);
    const floorFactor = Number.isFinite(floor) ? 1 + Math.max(0, floor - 1) * 0.015 : 1;
    const accessFactor = input.elevator === 'no' ? 1.2 : input.elevator === 'unknown' ? 1.1 : 1;
    const distance = Number(input.carryDistanceM);
    const carryFactor = Number.isFinite(distance) ? Math.min(1.75, 1 + Math.max(0, distance - 10) / 100) : 1;
    const methodFactor = input.method === 'manual' ? 1.25 : input.method === 'mixed' ? 1.1 : 1;
    const physicalFactor = Math.min(3, thicknessFactor * reinforcementFactor * floorFactor * accessFactor * carryFactor * methodFactor);
    const baseDifficulty = Number(input.baseDifficulty ?? 1);
    if (!Number.isFinite(baseDifficulty) || baseDifficulty < 0.1 || baseDifficulty > 3) throw new Error('Коэффициент сложности должен быть от 0,1 до 3.');
    return {
      total: round(clamp(baseDifficulty * physicalFactor, 0.1, 3), 2),
      physicalFactor: round(physicalFactor, 3), thicknessFactor: round(thicknessFactor, 3),
      reinforcementFactor: round(reinforcementFactor, 3), floorFactor: round(floorFactor, 3),
      accessFactor: round(accessFactor, 3), carryFactor: round(carryFactor, 3), methodFactor: round(methodFactor, 3)
    };
  }
  function blendObservedProductivity(baselineProductivity, evidence = {}) {
    const baseline = number(baselineProductivity, 'Базовая производительность', { min: 0, allowZero: false });
    const observedMedian = Number(evidence.observedMedian);
    const observedWeight = Number(evidence.observedWeight);
    if (!Number.isFinite(observedMedian) || observedMedian <= 0 ||
        !Number.isFinite(observedWeight) || observedWeight <= 0 || observedWeight > 1) {
      return round(baseline, 3);
    }
    return round(baseline * (1 - observedWeight) + observedMedian * observedWeight, 3);
  }

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
    const targetShifts = number(input.targetShifts ?? 5, 'Желаемый срок в рабочих сменах', { min: 1, max: 365, allowZero: false });
    const difficultyFactor = number(input.difficultyFactor ?? 1, 'Коэффициент условий', { min: 0.1, max: 3, allowZero: false });
    const observations = Array.isArray(input.observations) ? input.observations : [];
    const rateCore = root.StrukturaProductionRateCore ||
      (typeof require === 'function' ? require('./production-model.js') : null);
    let validRates = [];
    let observationCount = 0;
    let medianRate = null;
    let weight = 0;
    let learnedNormalRate = baseRate;
    let sharedRateModel = null;
    if (rateCore && typeof rateCore.buildRateModel === 'function') {
      sharedRateModel = rateCore.buildRateModel({
        baselineProductivity: baseRate,
        observations,
        targetDifficulty: 1,
        targetCrewSize: crew
      });
      observationCount = sharedRateModel.observations;
      medianRate = sharedRateModel.observedMedian;
      weight = sharedRateModel.observedWeight;
      learnedNormalRate = sharedRateModel.learnedNormalRate;
    } else {
      validRates = observations.map(o => {
        if (!o || typeof o !== 'object') return null;
        const q = Number(o.quantity_done ?? o.quantity);
        const people = Number(o.workers_count ?? o.workers ?? o.people);
        const hours = Number(o.hours ?? o.hours_per_worker);
        const factor = Number(o.complexity_factor ?? o.conditionFactor ?? 1);
        if (![q, people, hours, factor].every(Number.isFinite) || q <= 0 || people <= 0 || hours <= 0 || factor <= 0) return null;
        return q / (people * hours / 8) * factor;
      }).filter(n => Number.isFinite(n) && n > 0);
      validRates.sort((x, y) => x - y);
      medianRate = validRates.length
        ? (validRates.length % 2 ? validRates[(validRates.length - 1) / 2] : (validRates[validRates.length / 2 - 1] + validRates[validRates.length / 2]) / 2)
        : null;
      weight = validRates.length >= 5 ? 0.75 : validRates.length >= 3 ? 0.5 : validRates.length ? 0.25 : 0;
      learnedNormalRate = medianRate == null ? baseRate : baseRate * (1 - weight) + medianRate * weight;
      observationCount = validRates.length;
    }
    const effectiveRate = learnedNormalRate / difficultyFactor;
    const personShifts = quantity / effectiveRate;
    const crewShifts = personShifts / crew * 8 / hoursPerShift;
    const plannedShifts = crewShifts * (1 + reservePercent / 100);
    const requiredCrewForTarget = Math.ceil((personShifts * (1 + reservePercent / 100) * 8 / hoursPerShift) / targetShifts);
    const dailyOutput = quantity / plannedShifts;
    const scenarioCrews = [...new Set([1, 2, 3, 5, 8, 10, crew, requiredCrewForTarget].filter(n => Number.isInteger(n) && n >= 1 && n <= 200))].sort((a, b) => a - b);
    const crewScenarios = scenarioCrews.map(workers => {
      const rawShifts = personShifts / workers * 8 / hoursPerShift;
      return { workers, shifts: round(rawShifts), plannedShifts: round(rawShifts * (1 + reservePercent / 100)), outputPerShift: round(quantity / (rawShifts * (1 + reservePercent / 100)), 2) };
    });
    const laborCost = personShifts * (8 / hoursPerShift) * wagePerWorkerShift;
    const directCost = laborCost + quantity * extraCostPerUnit + fixedCosts;
    const overhead = directCost * overheadPercent / 100;
    const preTaxCost = directCost + overhead;
    const taxBase = quantity * pricePerUnit;
    const tax = taxBase * taxPercent / 100;
    const totalCost = preTaxCost + tax;
    const revenue = quantity * pricePerUnit;
    const profit = revenue - totalCost;
    const minimumPrice = quantity > 0 && taxPercent < 100 ? (preTaxCost / (1 - taxPercent / 100)) / quantity : null;
    const targetPrice = quantity > 0 ? (preTaxCost / (1 - targetMarginPercent / 100 - taxPercent / 100)) / quantity : 0;
    const warnings = [];
    if (observationCount === 0) warnings.push('Нет фактических наблюдений: используется стартовая норма.');
    else if (observationCount < 3) warnings.push('Есть только 1–2 наблюдения: обученная норма предварительная.');
    if (pricePerUnit <= 0) warnings.push('Не задана цена для клиента: прибыль и маржа не являются оценкой сделки.');
    if (targetMarginPercent + taxPercent >= 100) warnings.push('Целевая маржа вместе с налоговой долей не оставляет допустимой базы для цены.');
    if (targetMarginPercent + taxPercent >= 100) return { quantity, baselineProductivity: baseRate, observations: observationCount, effectiveProductivity: round(effectiveRate, 3), personShifts: round(personShifts), crewShifts: round(crewShifts), plannedShifts: round(plannedShifts), targetShifts, requiredCrewForTarget, dailyOutput: round(dailyOutput, 2), crewScenarios, laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead), tax: round(tax), totalCost: round(totalCost), revenue: round(revenue), profit: round(profit), marginPercent: revenue > 0 ? round(profit / revenue * 100) : null, minimumPricePerUnit: minimumPrice == null ? null : round(minimumPrice, 2), targetPricePerUnit: null, warnings };
    return {
      quantity, baselineProductivity: baseRate, observedMedian: medianRate == null ? null : round(medianRate, 3),
      observations: observationCount, learnedWeight: weight, effectiveProductivity: round(effectiveRate, 3),
      personShifts: round(personShifts), crewShifts: round(crewShifts), plannedShifts: round(plannedShifts),
      targetShifts, requiredCrewForTarget, dailyOutput: round(dailyOutput, 2), crewScenarios,
      laborCost: round(laborCost), directCost: round(directCost), overhead: round(overhead), tax: round(tax),
      totalCost: round(totalCost), revenue: round(revenue), profit: round(profit),
      marginPercent: revenue > 0 ? round(profit / revenue * 100) : null,
      minimumPricePerUnit: minimumPrice == null ? null : round(minimumPrice, 2),
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
  const api = { calculateEngineeringEstimate, calculateConditionFactor, blendObservedProductivity, loadHistory, saveHistory, observationsFor, recordActual, STORAGE_KEY };
  root.StrukturaEngineeringCalculator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
