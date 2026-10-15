'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPiCoachInsights, ageDays } = require('../src/pi-coach.cjs');

test('PI coach prioritizes a documented contract overrun above routine advice', () => {
  const items = buildPiCoachInsights({
    finance: { risks: [{ id: 8, title: 'Склад', level: 'over', costRatio: 1.12, contractRub: 100000, paidExpensesRub: 80000, plannedExpensesRub: 32000 }] },
    projects: [{ id: 8, title: 'Склад', status: 'active', contract_rub: 100000, received_rub: 50000 }],
    leads: [{ id: 3, title: 'Заявка', status: 'new', created_at: '2026-10-01' }]
  }, { today: '2026-10-15' });
  assert.equal(items[0].id, 'finance-overrun-8');
  assert.match(items[0].spoken, /достигли или превысили/iu);
  assert.match(items[0].detail, /112%/u);
});

test('PI coach does not invent a production forecast when the plan is missing', () => {
  const items = buildPiCoachInsights({ production: { projects: [{ id: 2, title: 'Офис', planCount: 0, shiftCount: 0, forecast: { estimated: false } }] } }, { today: '2026-10-15' });
  assert.ok(items.some(item => item.id === 'production-no-plan-2'));
  assert.match(items.find(item => item.id === 'production-no-plan-2').spoken, /не буду угадывать срок/iu);
});

test('PI coach flags recurring low productivity only with at least two grounded records', () => {
  const production = { history: [
    { id: 1, project_id: 1, project_title: 'Объект А', shift_date: '2026-10-14', performance: [{ work_name: 'Снятие стяжки', deviationPct: -30 }] },
    { id: 2, project_id: 2, project_title: 'Объект Б', shift_date: '2026-10-13', performance: [{ work_name: 'Снятие стяжки', deviationPct: -24 }] },
    { id: 3, project_id: 2, shift_date: '2026-10-12', performance: [{ work_name: 'Стены', deviationPct: -8 }] }
  ] };
  const items = buildPiCoachInsights({ production }, { today: '2026-10-15' });
  const insight = items.find(item => item.id === 'production-repeat-low-снятие стяжки');
  assert.ok(insight);
  assert.match(insight.detail, /Наблюдений с отклонением от −20%: 2/u);
});

test('PI coach flags overdue unpaid expenses and unscheduled receivables with source values', () => {
  const items = buildPiCoachInsights({ finance: { overdueExpensesTotal: 15000, overdueExpensesCount: 2, unscheduledReceivablesTotal: 80000 } }, { today: '2026-10-15' });
  assert.ok(items.some(item => item.id === 'finance-overdue-expenses' && /15 000|15 000/u.test(item.detail)));
  assert.ok(items.some(item => item.id === 'finance-unscheduled-receivables' && /80 000|80 000/u.test(item.detail)));
});

test('PI coach uses stable ordering and never emits random advice', () => {
  const data = {
    tasks: [{ id: 9, title: 'Позвонить заказчику', is_done: 0, urgency: 'overdue', due_at: '2026-10-10' }],
    leads: [{ id: 4, title: 'Демонтаж офиса', status: 'negotiation', created_at: '2026-10-01', updated_at: '2026-10-01' }]
  };
  const first = buildPiCoachInsights(data, { today: '2026-10-15' });
  const second = buildPiCoachInsights(data, { today: '2026-10-15' });
  assert.deepEqual(first, second);
  assert.equal(first[0].id, 'tasks-overdue-9');
});

test('ageDays rejects malformed dates and handles past/future dates deterministically', () => {
  assert.equal(ageDays('not-a-date', '2026-10-15'), null);
  assert.equal(ageDays('2026-10-10', '2026-10-15'), 5);
  assert.equal(ageDays('2026-10-20', '2026-10-15'), -5);
});

test('PI coach returns a grounded data-quality prompt when history is empty', () => {
  const items = buildPiCoachInsights({}, { today: '2026-10-15' });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'data-quality-overview');
  assert.match(items[0].spoken, /не буду придумывать показатели/iu);
});
