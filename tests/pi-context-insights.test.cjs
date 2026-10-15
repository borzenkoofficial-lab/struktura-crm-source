'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPiContextInsights } = require('../src/pi-context-insights.cjs');

test('flags negative-profit commercial proposal with evidence and actionable advice', () => {
  const result = buildPiContextInsights({ proposals: [{ id: 7, title: 'Демонтаж', total_rub: 100000, cost_rub: 125000 }] }, { now: '2026-10-15T12:00:00Z' });
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 'critical');
  assert.match(result[0].message, /25/);
  assert.match(result[0].speakText, /Проверь состав работ/);
  assert.deepEqual(result[0].sourceIds, [7]);
});

test('does not invent margin when proposal price or cost is missing', () => {
  const result = buildPiContextInsights({ proposals: [{ id: 1, total_rub: 50000 }, { id: 2, total_rub: 0, cost_rub: 100 }] });
  assert.equal(result.length, 0);
});

test('flags stale shift report only for active project with known last shift date', () => {
  const result = buildPiContextInsights({
    projects: [{ id: 4, title: 'Объект А', status: 'active' }, { id: 5, title: 'Объект Б', status: 'completed' }],
    shifts: [{ id: 11, project_id: 4, shift_date: '2026-10-10' }, { id: 12, project_id: 5, shift_date: '2026-10-01' }]
  }, { now: '2026-10-15T12:00:00Z' });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'project-stale-shift:4');
});

test('does not report stale shift when no shift history exists', () => {
  const result = buildPiContextInsights({ projects: [{ id: 4, title: 'Объект А', status: 'active' }] }, { now: '2026-10-15T12:00:00Z' });
  assert.equal(result.length, 0);
});

test('compares cash history only when both payments and expenses are present', () => {
  const noComparison = buildPiContextInsights({ payments: [{ amount: 1000 }] });
  assert.equal(noComparison.length, 0);
  const result = buildPiContextInsights({ payments: [{ amount: 1000 }], expenses: [{ amount: 1500 }] });
  assert.equal(result.length, 1);
  assert.match(result[0].speakText, /не обязательно убыток/);
});

test('flags estimates with missing cost inputs but ignores complete lines', () => {
  const result = buildPiContextInsights({ estimates: [
    { id: 1, title: 'Полная', lines: [{ quantity: 10, price_rub: 1000, cost_rub: 600 }] },
    { id: 2, title: 'Неполная', lines: [{ quantity: 10, price_rub: 1000 }] }
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'estimate-incomplete:2');
});

test('deduplicates identical event ids and caps result count', () => {
  const proposals = Array.from({ length: 12 }, (_, i) => ({ id: 1, title: `КП ${i}`, total_rub: 100, cost_rub: 120 }));
  const result = buildPiContextInsights({ proposals }, { limit: 5 });
  assert.equal(result.length, 1);
});

test('ignores expired-project rule for completed projects', () => {
  const result = buildPiContextInsights({ projects: [{ id: 3, title: 'Завершённый', status: 'completed', due_date: '2026-10-01' }] }, { now: '2026-10-15T12:00:00Z' });
  assert.equal(result.length, 0);
});
