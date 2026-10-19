'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProjectPlan } = require('../src/engineering-project-plan.js');

const base = (id, name, overrides = {}) => ({
  id, name, quantity: 100, productivity: 10, crewSize: 5, hoursPerShift: 8,
  wagePerWorkerShift: 4000, pricePerUnit: 1000, extraCostPerUnit: 50,
  fixedCosts: 1000, overheadPercent: 10, taxPercent: 6, reservePercent: 10,
  difficultyFactor: 1, predecessors: [], ...overrides
});

test('project schedule places dependent operations sequentially and independent work in parallel', () => {
  const result = calculateProjectPlan([
    base('demo', 'Демонтаж', { quantity: 100, productivity: 100, predecessors: [] }),
    base('carry', 'Вынос', { quantity: 100, productivity: 50, predecessors: ['demo'] }),
    base('cleanup', 'Уборка', { quantity: 100, productivity: 100, predecessors: ['demo'] })
  ]);
  const demo = result.operations.find(x => x.id === 'demo');
  const carry = result.operations.find(x => x.id === 'carry');
  const cleanup = result.operations.find(x => x.id === 'cleanup');
  assert.equal(demo.startShift, 0);
  assert.equal(demo.finishShift, 0.2);
  assert.equal(carry.startShift, demo.finishShift);
  assert.equal(cleanup.startShift, demo.finishShift);
  assert.equal(result.durationShifts, 0.6);
  assert.equal(result.operationCount, 3);
  assert.equal(result.plannedDurationShifts, 0.64);
});

test('project aggregates costs, revenue and profit across all operations', () => {
  const result = calculateProjectPlan([
    base('a', 'Работа A', { quantity: 10, productivity: 10, pricePerUnit: 1000 }),
    base('b', 'Работа B', { quantity: 20, productivity: 10, pricePerUnit: 500 })
  ]);
  assert.equal(result.revenue, 20000);
  assert.equal(result.totalCost, 18250);
  assert.equal(result.profit, 1750);
  assert.equal(result.marginPercent, 8.75);
  assert.ok(result.totalPersonShifts > 0);
});

test('invalid references, duplicate ids, cycles and missing operations are rejected', () => {
  assert.throws(() => calculateProjectPlan([]), /хотя бы одну/);
  assert.throws(() => calculateProjectPlan([base('a', 'A'), base('a', 'B')]), /уникальный ID/);
  assert.throws(() => calculateProjectPlan([base('a', 'A', { predecessors: ['missing'] })]), /не найдена/);
  assert.throws(() => calculateProjectPlan([
    base('a', 'A', { predecessors: ['b'] }), base('b', 'B', { predecessors: ['a'] })
  ]), /цикл технологических зависимостей/);
});

test('difficulty factor lowers effective productivity and extends schedule', () => {
  const normal = calculateProjectPlan([base('a', 'A', { quantity: 100, productivity: 10, difficultyFactor: 1 })]);
  const hard = calculateProjectPlan([base('a', 'A', { quantity: 100, productivity: 10, difficultyFactor: 2 })]);
  assert.equal(hard.operations[0].productivity, 5);
  assert.equal(hard.durationShifts, normal.durationShifts * 2);
});

test('zero revenue yields null margin rather than division by zero', () => {
  const result = calculateProjectPlan([base('a', 'A', { pricePerUnit: 0 })]);
  assert.equal(result.marginPercent, null);
  assert.equal(result.operations[0].marginPercent, null);
});
