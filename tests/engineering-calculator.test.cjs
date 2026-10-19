'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateEngineeringEstimate, calculateConditionFactor, loadHistory, saveHistory, observationsFor, recordActual } = require('../src/engineering-calculator.js');

test('engineering estimate calculates labor, schedule, costs and target price deterministically', () => {
  const r = calculateEngineeringEstimate({ quantity: 100, baselineProductivity: 10, crewSize: 5, hoursPerShift: 8, wagePerWorkerShift: 4000, pricePerUnit: 1000, extraCostPerUnit: 50, fixedCosts: 1000, overheadPercent: 10, taxPercent: 6, targetMarginPercent: 20, reservePercent: 10, difficultyFactor: 1 });
  assert.equal(r.personShifts, 10);
  assert.equal(r.crewShifts, 2);
  assert.equal(r.plannedShifts, 2.2);
  assert.equal(r.laborCost, 40000);
  assert.equal(r.directCost, 46000);
  assert.equal(r.overhead, 4600);
  assert.equal(r.tax, 6000);
  assert.equal(r.totalCost, 56600);
  assert.equal(r.profit, 43400);
  assert.equal(r.targetPricePerUnit, 683.78);
});

test('history learning uses median and grows weight only with more observations', () => {
  const base = { quantity: 100, baselineProductivity: 10, crewSize: 5, hoursPerShift: 8, pricePerUnit: 0, observations: [
    { quantity: 80, people: 1, hours: 8 }, { quantity: 90, people: 1, hours: 8 }, { quantity: 100, people: 1, hours: 8 }
  ] };
  const r = calculateEngineeringEstimate(base);
  assert.equal(r.observations, 3);
  assert.equal(r.observedMedian, 90);
  assert.equal(r.learnedWeight, 0.5);
  assert.equal(r.effectiveProductivity, 50);
});

test('invalid inputs are rejected and missing baseline data is never invented', () => {
  assert.throws(() => calculateEngineeringEstimate({ quantity: 0, baselineProductivity: 8 }), /Объём/);
  assert.throws(() => calculateEngineeringEstimate({ quantity: 10, baselineProductivity: 0 }), /Базовая производительность/);
});

test('history storage keeps and reuses real completed-work observations', () => {
  const store = { value: '[]', getItem() { return this.value; }, setItem(_k, v) { this.value = v; } };
  const saved = [{ id: 'p1', catalogId: 'screed', observations: [] }];
  saveHistory(saved, store);
  let history = loadHistory(store);
  history = recordActual(history, 'p1', { catalogId: 'screed', workKey: 'screed', quantity: 80, people: 4, hours: 8, conditionFactor: 1 });
  saveHistory(history, store);
  const restored = loadHistory(store);
  assert.equal(observationsFor(restored, 'screed', 'screed').length, 1);
  assert.equal(observationsFor(restored, 'screed', 'screed')[0].quantity, 80);
});


test('condition factor reacts deterministically to screed thickness, reinforcement, access and method', () => {
  const normal = calculateConditionFactor({ workName: 'Демонтаж цементной стяжки', thicknessMm: 50, reinforced: 'no', floor: 1, elevator: 'yes', carryDistanceM: 10, method: 'mechanized', baseDifficulty: 1 });
  const difficult = calculateConditionFactor({ workName: 'Демонтаж цементной стяжки', thicknessMm: 100, reinforced: 'yes', floor: 4, elevator: 'no', carryDistanceM: 60, method: 'manual', baseDifficulty: 1 });
  assert.equal(normal.total, 1);
  assert.ok(difficult.total > normal.total);
  assert.ok(difficult.total <= 3);
});

test('condition factor keeps non-screed thickness neutral and rejects invalid base difficulty', () => {
  const r = calculateConditionFactor({ workName: 'Демонтаж перегородки ГКЛ', thicknessMm: 100, reinforced: 'no', floor: 1, elevator: 'yes', carryDistanceM: 10, method: 'mechanized', baseDifficulty: 1 });
  assert.equal(r.thicknessFactor, 1);
  assert.throws(() => calculateConditionFactor({ baseDifficulty: 0 }), /Коэффициент сложности/);
});

test('target duration yields required crew, daily output and comparable crew scenarios', () => {
  const r = calculateEngineeringEstimate({
    quantity: 100, baselineProductivity: 10, crewSize: 5, hoursPerShift: 8,
    reservePercent: 20, targetShifts: 4, difficultyFactor: 1
  });
  assert.equal(r.personShifts, 10);
  assert.equal(r.crewShifts, 2);
  assert.equal(r.plannedShifts, 2.4);
  assert.equal(r.requiredCrewForTarget, 3);
  assert.equal(r.dailyOutput, 41.67);
  assert.ok(r.crewScenarios.some(s => s.workers === 5 && s.plannedShifts === 2.4));
  assert.ok(r.crewScenarios.some(s => s.workers === 3 && s.plannedShifts === 4));
});

test('target duration rejects zero and unreasonable values', () => {
  assert.throws(() => calculateEngineeringEstimate({ quantity: 10, baselineProductivity: 8, targetShifts: 0 }), /Желаемый срок/);
  assert.throws(() => calculateEngineeringEstimate({ quantity: 10, baselineProductivity: 8, targetShifts: 366 }), /Желаемый срок/);
});


test('engineering estimate uses the shared crew-size productivity model', () => {
  const observations = [
    ...[20, 21, 19].map(rate => ({ quantity: rate * 5, people: 5, hours: 8, conditionFactor: 1 })),
    ...[10, 11, 9].map(rate => ({ quantity: rate * 15, people: 15, hours: 8, conditionFactor: 1 }))
  ];
  const small = calculateEngineeringEstimate({
    quantity: 100, baselineProductivity: 10, crewSize: 5, difficultyFactor: 1,
    pricePerUnit: 0, observations
  });
  const large = calculateEngineeringEstimate({
    quantity: 100, baselineProductivity: 10, crewSize: 15, difficultyFactor: 1,
    pricePerUnit: 0, observations
  });
  assert.equal(small.observations, 6);
  assert.equal(large.observations, 6);
  assert.ok(large.effectiveProductivity < small.effectiveProductivity,
    'engineering estimate should use the same crew-size adjustment as the production model');
});
