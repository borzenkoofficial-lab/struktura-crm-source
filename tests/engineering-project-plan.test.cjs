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
  assert.equal(result.plannedDurationShifts, 0.66);
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



test('project plan rejects numeric underflow that would produce infinite shifts', () => {
  assert.throws(
    () => calculateProjectPlan([base('extreme', 'Нереалистичная норма', { quantity: 100, productivity: Number.MIN_VALUE })]),
    /расчёт вышел за допустимый числовой диапазон/
  );
});

test('project plan rejects out-of-range shift hours and economic percentages', () => {
  assert.throws(() => calculateProjectPlan([base('short-shift', 'Короткая смена', { hoursPerShift: 0.5 })]), /длительность смены должна быть от 1 до 24 часов/);
  assert.throws(() => calculateProjectPlan([base('long-shift', 'Слишком длинная смена', { hoursPerShift: 25 })]), /длительность смены должна быть от 1 до 24 часов/);
  assert.throws(() => calculateProjectPlan([base('overhead', 'Накладные расходы', { overheadPercent: 101 })]), /накладные расходы: значение не должно превышать 100/);
  assert.throws(() => calculateProjectPlan([base('tax', 'Налог', { taxPercent: 101 })]), /налог: значение не должно превышать 100/);
  assert.throws(() => calculateProjectPlan([base('reserve', 'Резерв срока', { reservePercent: 101 })]), /резерв срока: значение не должно превышать 100/);
});

test('project plans reject fractional crew sizes', () => {
  assert.throws(() => calculateProjectPlan([base('fractional', 'Дробная бригада', { crewSize: 2.5 })]), /численность бригады должна быть целым числом/);
});

test('difficulty factor lowers effective productivity and extends schedule', () => {
  const normal = calculateProjectPlan([base('a', 'A', { quantity: 100, productivity: 10, difficultyFactor: 1 })]);
  const hard = calculateProjectPlan([base('a', 'A', { quantity: 100, productivity: 10, difficultyFactor: 2 })]);
  assert.equal(hard.operations[0].productivity, 5);
  assert.equal(hard.durationShifts, normal.durationShifts * 2);
});


test('shared workforce limit serializes independent operations when one brigade is available', () => {
  const result = calculateProjectPlan([
    base('a', 'Работа A', { quantity: 100, productivity: 100, crewSize: 5, reservePercent: 0 }),
    base('b', 'Работа B', { quantity: 100, productivity: 100, crewSize: 5, reservePercent: 0 })
  ], { availableWorkers: 5 });
  const a = result.operations.find(x => x.id === 'a');
  const b = result.operations.find(x => x.id === 'b');
  assert.equal(result.availableWorkers, 5);
  assert.equal(result.durationShifts, 0.4);
  assert.ok(a.finishShift <= b.startShift || b.finishShift <= a.startShift);
});

test('shared workforce permits parallel operations when total crews fit the pool', () => {
  const result = calculateProjectPlan([
    base('a', 'Работа A', { quantity: 60, productivity: 100, crewSize: 3, reservePercent: 0 }),
    base('b', 'Работа B', { quantity: 40, productivity: 100, crewSize: 2, reservePercent: 0 })
  ], { availableWorkers: 5 });
  assert.equal(result.durationShifts, 0.2);
  assert.equal(result.operations[0].startShift, result.operations[1].startShift);
});

test('operation requiring more workers than the available pool is rejected', () => {
  assert.throws(() => calculateProjectPlan([
    base('a', 'Большая бригада', { crewSize: 6 })
  ], { availableWorkers: 5 }), /требуется 6 рабочих/);
});

test('zero revenue yields null margin rather than division by zero', () => {
  const result = calculateProjectPlan([base('a', 'A', { pricePerUnit: 0 })]);
  assert.equal(result.marginPercent, null);
  assert.equal(result.operations[0].marginPercent, null);
});


test('calendar maps shift offsets to dates and skips weekends when requested', () => {
  const { buildCalendarSchedule } = require('../src/engineering-project-plan.js');
  const result = calculateProjectPlan([
    base('a', 'Демонтаж', { quantity: 1000, productivity: 100, crewSize: 5, reservePercent: 0 }),
    base('b', 'Вынос', { quantity: 1000, productivity: 100, crewSize: 5, reservePercent: 0, predecessors: ['a'] })
  ], { availableWorkers: 5 });
  const calendar = buildCalendarSchedule(result, { startDate: '2026-10-23', weekdaysOnly: true });
  assert.equal(calendar.operations[0].startDate, '2026-10-23');
  assert.equal(calendar.operations[0].finishDate, '2026-10-26');
  assert.equal(calendar.operations[1].startDate, '2026-10-27');
  assert.equal(calendar.operations[1].plannedStartDate, '2026-10-27');
  assert.throws(() => buildCalendarSchedule(result, { startDate: 'not-a-date' }), /Дата начала/);
});

test('calendar can include weekends when weekday restriction is disabled', () => {
  const { buildCalendarSchedule } = require('../src/engineering-project-plan.js');
  const result = calculateProjectPlan([
    base('a', 'Работа A', { quantity: 1000, productivity: 100, crewSize: 5, reservePercent: 0 }),
    base('b', 'Работа B', { quantity: 1000, productivity: 100, crewSize: 5, reservePercent: 0, predecessors: ['a'] })
  ], { availableWorkers: 5 });
  const calendar = buildCalendarSchedule(result, { startDate: '2026-10-23', weekdaysOnly: false });
  assert.equal(calendar.operations[1].startDate, '2026-10-25');
});

test('multi-operation plan reports observations used by shared production model', () => {
  const observations = [20, 21, 19, 10, 11, 9].map((rate, i) => ({ quantity_done: rate * (i < 3 ? 5 : 15), workers_count: i < 3 ? 5 : 15, hours: 8, complexity_factor: 1 }));
  const result = calculateProjectPlan([base('learned', 'Обученная работа', { quantity: 100, productivity: 12, crewSize: 15, observations, difficultyFactor: 1.25, reservePercent: 0 })]);
  assert.equal(result.operations[0].observationsCount, 6);
  assert.ok(result.operations[0].productivity > 0);
});
