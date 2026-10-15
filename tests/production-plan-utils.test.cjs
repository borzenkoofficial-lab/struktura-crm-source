const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProductionPlan, normalizeShiftWorkLines } = require('../src/production-plan-utils.cjs');

const planLine = (overrides = {}) => ({ catalog_id: 'walls', work_name: 'Демонтаж стен', unit: 'м²', planned_quantity: 100, baseline_productivity: 8, ...overrides });
const shiftLine = (overrides = {}) => ({ catalog_id: 'walls', work_name: 'Демонтаж стен', unit: 'м²', quantity_done: 40, workers_count: 5, hours: 8, baseline_productivity: 8, ...overrides });

test('production plan normalizes team size and work rows', () => {
  const plan = normalizeProductionPlan({ planned_people: '5', complexity_factor: '1.25', lines: [planLine()] });
  assert.equal(plan.planned_people, 5);
  assert.equal(plan.complexity_factor, 1.25);
  assert.equal(plan.lines[0].planned_quantity, 100);
});

test('production plan rejects duplicated work, impossible size and empty plan', () => {
  assert.throws(() => normalizeProductionPlan({ planned_people: 0, lines: [planLine()] }), /от 1 до 200/);
  assert.throws(() => normalizeProductionPlan({ lines: [] }), /Добавь от 1 до 100/);
  assert.throws(() => normalizeProductionPlan({ lines: [planLine(), planLine()] }), /дважды/);
});

test('shift allows a realistic allocation across multiple work types', () => {
  const lines = normalizeShiftWorkLines({ workers: 5, shiftHours: 8, lines: [
    shiftLine({ catalog_id: 'walls', workers_count: 3, hours: 6 }),
    shiftLine({ catalog_id: 'floor', workers_count: 2, hours: 5, work_name: 'Снятие пола' })
  ] });
  assert.equal(lines.length, 2);
});

test('shift rejects duplicated labor hours exceeding the whole crew capacity', () => {
  assert.throws(() => normalizeShiftWorkLines({ workers: 5, shiftHours: 8, lines: [
    shiftLine({ catalog_id: 'walls', workers_count: 5, hours: 8 }),
    shiftLine({ catalog_id: 'floor', workers_count: 5, hours: 8, work_name: 'Снятие пола' })
  ] }), /нельзя учитывать дважды/);
});

test('shift can be logged with no work items when the shift produced no output', () => {
  assert.deepEqual(normalizeShiftWorkLines({ workers: 4, shiftHours: 8, lines: [] }), []);
});

test('shift subtracts downtime from available crew person-hours', () => {
  assert.throws(() => normalizeShiftWorkLines({
    workers: 5, shiftHours: 8, downtimeHours: 2,
    lines: [shiftLine({ workers_count: 5, hours: 7 })]
  }), /могла отработать максимум/);

  const lines = normalizeShiftWorkLines({
    workers: 5, shiftHours: 8, downtimeHours: 2,
    lines: [shiftLine({ workers_count: 5, hours: 6 })]
  });
  assert.equal(lines.length, 1);
});

test('shift rejects downtime outside the shift duration', () => {
  assert.throws(() => normalizeShiftWorkLines({
    workers: 5, shiftHours: 8, downtimeHours: 9, lines: []
  }), /Проверь численность/);
});


test('normalizes only known structured production conditions and removes duplicates', () => {
  const { normalizeConditions, normalizeProductionPlan } = require('../src/production-plan-utils.cjs');
  assert.deepEqual(normalizeConditions(['no_elevator', 'manual_carry', 'no_elevator']), ['manual_carry', 'no_elevator']);
  assert.deepEqual(normalizeProductionPlan({ planned_people: 4, complexity_factor: 1.25, conditions: ['cramped_space'], lines: [
    { catalog_id: 'walls', work_name: 'Демонтаж стен', unit: 'м²', planned_quantity: 10, baseline_productivity: 5 }
  ] }).conditions, ['cramped_space']);
  assert.throws(() => normalizeConditions(['unknown_factor']), /неизвестное условие/iu);
  assert.throws(() => normalizeConditions('no_elevator'), /списком/iu);
});
