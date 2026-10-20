'use strict';

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function buildRateModel({ baselineProductivity, observations = [], targetDifficulty = 1, targetCrewSize = 5 } = {}) {
  const baseline = Number(baselineProductivity);
  const difficulty = Number(targetDifficulty);
  const crewTarget = Number(targetCrewSize);
  if (!Number.isFinite(baseline) || baseline <= 0) throw new Error('Базовая производительность должна быть больше нуля.');
  if (!Number.isFinite(difficulty) || difficulty <= 0) throw new Error('Коэффициент сложности должен быть больше нуля.');
  if (!Number.isFinite(crewTarget) || crewTarget < 1 || crewTarget > 200) throw new Error('Размер целевой бригады должен быть от 1 до 200 человек.');

  const entries = observations.map((o) => {
    const quantity = Number(o.quantity_done ?? o.quantity);
    const workers = Number(o.workers_count ?? o.workers ?? o.people);
    const hours = Number(o.hours ?? o.hours_per_worker);
    const factor = Number(o.complexity_factor ?? o.conditionFactor ?? 1);
    if (![quantity, workers, hours, factor].every(Number.isFinite) || quantity <= 0 || workers <= 0 || hours <= 0 || factor <= 0) return null;
    // Convert the observed speed back to a normal-condition rate before comparing sites.
    return { rate: (quantity / (workers * hours / 8)) * factor, crewSize: workers };
  }).filter((entry) => entry && Number.isFinite(entry.rate) && entry.rate > 0);

  const rawObservedMedian = median(entries.map((entry) => entry.rate));
  const count = entries.length;
  const crewSizeCounts = new Map();
  for (const entry of entries) crewSizeCounts.set(entry.crewSize, (crewSizeCounts.get(entry.crewSize) || 0) + 1);
  const hasRepeatedCrewGroups = [...crewSizeCounts.values()].filter(sizeCount => sizeCount >= 2).length >= 2;
  const distinctCrewSizes = crewSizeCounts.size;
  const referenceCrewSize = median(entries.map(entry => entry.crewSize));

  // Learn how per-worker productivity changes with crew size only when the history
  // contains at least two repeated crew-size groups. Otherwise keep a linear scale assumption.
  let crewSizeExponent = 0;
  let crewScalingApplied = false;
  if (count >= 5 && distinctCrewSizes >= 2 && hasRepeatedCrewGroups && referenceCrewSize > 0) {
    const points = entries.map(entry => ({ x: Math.log(entry.crewSize), y: Math.log(entry.rate) }));
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const varianceX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    if (varianceX > 1e-9) {
      const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
      crewSizeExponent = clamp(covariance / varianceX, -0.5, 0.25);
      crewScalingApplied = Math.abs(crewSizeExponent) >= 0.05;
      if (!crewScalingApplied) crewSizeExponent = 0;
    }
  }

  let crewAdjustedObservedMedian = rawObservedMedian;
  if (crewAdjustedObservedMedian != null && crewScalingApplied) {
    // Fit the typical per-worker rate at the requested crew size using the median log intercept.
    const intercept = median(entries.map(entry => Math.log(entry.rate) - crewSizeExponent * Math.log(entry.crewSize)));
    crewAdjustedObservedMedian = Math.exp(intercept + crewSizeExponent * Math.log(crewTarget));
  }
  const observedWeight = count >= 5 ? 0.75 : count >= 3 ? 0.5 : count > 0 ? 0.25 : 0;
  const learnedNormalRate = crewAdjustedObservedMedian == null
    ? baseline
    : baseline * (1 - observedWeight) + crewAdjustedObservedMedian * observedWeight;
  const effectiveProductivity = learnedNormalRate / difficulty;
  const confidence = count >= 5 ? 'По практике · 5+ наблюдений'
    : count >= 3 ? 'Уточняется · 3–4 наблюдения'
      : count > 0 ? 'Предварительно · 1–2 наблюдения' : 'Стартовая норма · без факта';
  return {
    baselineProductivity: baseline,
    observedMedian: crewAdjustedObservedMedian == null ? null : round(crewAdjustedObservedMedian, 3),
    rawObservedMedian: rawObservedMedian == null ? null : round(rawObservedMedian, 3),
    learnedNormalRate: round(learnedNormalRate, 3),
    effectiveProductivity: round(effectiveProductivity, 3),
    observations: count,
    confidence,
    observedWeight,
    referenceCrewSize: referenceCrewSize == null ? null : round(referenceCrewSize, 1),
    targetCrewSize: crewTarget,
    crewSizeExponent: round(crewSizeExponent, 3),
    crewScalingApplied
  };
}

function forecastRemainingWork({ planItems = [], actualByCatalog = {}, observationsByCatalog = {}, targetDifficulty = 1, crewSize = 5 } = {}) {
  const crew = Number(crewSize);
  if (!Number.isFinite(crew) || crew < 1 || crew > 200) throw new Error('Размер бригады должен быть от одного до 200 человек.');
  const lines = planItems.map((item) => {
    const planned = Number(item.planned_quantity ?? item.quantity ?? 0);
    const completed = Number(actualByCatalog[item.catalog_id] ?? item.actual_quantity ?? 0);
    const remaining = Math.max(0, planned - completed);
    const baseline = Number(item.baseline_productivity ?? item.productivity);
    if (!Number.isFinite(baseline) || baseline <= 0) return { catalogId: item.catalog_id, name: item.work_name ?? item.name, unit: item.unit, plannedQuantity: round(planned, 2), actualQuantity: round(completed, 2), remainingQuantity: round(remaining, 2), baselineProductivity: 0, effectiveProductivity: null, observations: 0, confidence: 'Нужна норма', laborShiftsRemaining: null, teamShiftsRemaining: null, overPlan: completed > planned, missingRate: true };
    const model = buildRateModel({ baselineProductivity: baseline, observations: observationsByCatalog[item.catalog_id] || [], targetDifficulty, targetCrewSize: crew });
    const laborShiftsRemaining = remaining > 0 ? remaining / model.effectiveProductivity : 0;
    return { catalogId: item.catalog_id, name: item.work_name ?? item.name, unit: item.unit, plannedQuantity: round(planned, 2), actualQuantity: round(completed, 2), remainingQuantity: round(remaining, 2), ...model, laborShiftsRemaining: round(laborShiftsRemaining, 2), teamShiftsRemaining: round(laborShiftsRemaining / crew, 2), overPlan: completed > planned, missingRate: false };
  });
  const laborShiftsRemaining = lines.reduce((sum, line) => sum + (Number.isFinite(line.laborShiftsRemaining) ? line.laborShiftsRemaining : 0), 0);
  return {
    lines,
    laborShiftsRemaining: round(laborShiftsRemaining, 2),
    teamShiftsRemaining: round(laborShiftsRemaining / crew, 2),
    completedLines: lines.filter((line) => line.remainingQuantity <= 0).length,
    totalLines: lines.length,
    observations: lines.reduce((sum, line) => sum + line.observations, 0),
    estimated: lines.length > 0 && lines.every(line => !line.missingRate)
  };
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, decimals = 2) {
  const p = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * p) / p;
}

const productionModelApi = { median, buildRateModel, forecastRemainingWork };
if (typeof module !== 'undefined' && module.exports) module.exports = productionModelApi;
if (typeof globalThis !== 'undefined') globalThis.StrukturaProductionRateCore = productionModelApi;
