'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPiCoachInsights, ageDays } = require('../src/pi-coach.js');

test('PI connects shift downtime, low measured output and a matching project cost risk', () => {
  const items = buildPiCoachInsights({
    production: { history: [{ id: 55, shift_date: '2026-10-10', project_title: 'Объект Север', shift_hours: 8, downtime_hours: 3, performance: [
      { work_name: 'Демонтаж стяжки', deviationPct: -25 }, { work_name: 'Вынос мусора', deviationPct: -15 }
    ] }] },
    finance: { risks: [{ id: 12, title: 'Объект Север', costRatio: 0.9 }] }
  }, { today: '2026-10-15' });
  const insight = items.find(item => item.id === 'production-cost-correlation-55');
  assert.ok(insight);
  assert.equal(insight.view, 'finance');
  assert.match(insight.title, /финансовым риском/u);
  assert.match(insight.detail, /расходы составляют 90% договора/u);
  assert.match(insight.detail, /не доказывает причинную связь/u);
});

test('PI does not correlate shift downtime with poor output when performance evidence is absent', () => {
  const items = buildPiCoachInsights({ production: { history: [{ id: 56, shift_date: '2026-10-10', project_title: 'Объект Юг', shift_hours: 8, downtime_hours: 4, performance: [] }] } }, { today: '2026-10-15' });
  assert.equal(items.some(item => item.id === 'production-cost-correlation-56'), false);
});


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
    { id: 1, project_id: 1, project_title: 'Объект А', shift_date: '2026-10-14', performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -30 }] },
    { id: 2, project_id: 2, project_title: 'Объект Б', shift_date: '2026-10-13', performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -24 }] },
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

test('PI coach compares expense periods and flags material refund patterns from saved finance records', () => {
  const items = buildPiCoachInsights({
    payments: [
      { payment_type: 'incoming', amount_rub: 50000 },
      { payment_type: 'incoming', amount_rub: 50000 },
      { payment_type: 'refund', amount_rub: 15000 }
    ],
    expenses: [
      { expense_date: '2026-10-01', amount_rub: 15000 },
      { expense_date: '2026-10-03', amount_rub: 10000 },
      { expense_date: '2026-10-05', amount_rub: 8000 },
      { expense_date: '2026-08-20', amount_rub: 4000 },
      { expense_date: '2026-09-01', amount_rub: 4000 },
      { expense_date: '2026-09-10', amount_rub: 4000 }
    ]
  }, { today: '2026-10-15' });
  assert.ok(items.some(item => item.id === 'finance-refund-pattern'));
  assert.ok(items.some(item => item.id === 'finance-expense-growth'));
});

test('PI coach uses saved commercial proposal history to flag low-margin and loss-making quotes', () => {
  const items = buildPiCoachInsights({ quotes: [
    { id: 11, title: 'КП склад', prepared_at: '2026-10-15T10:00:00.000Z', revenue_rub: 100000, cost_rub: 105000, profit_rub: -5000, margin_pct: -5 },
    { id: 10, title: 'КП офис', prepared_at: '2026-10-14T10:00:00.000Z', revenue_rub: 120000, cost_rub: 115000, profit_rub: 5000, margin_pct: 4.2 },
    { id: 9, title: 'КП магазин', prepared_at: '2026-10-13T10:00:00.000Z', revenue_rub: 80000, cost_rub: 76000, profit_rub: 4000, margin_pct: 5 }
  ] }, { today: '2026-10-15' });
  assert.equal(items[0].id, 'quote-loss-11');
  assert.ok(items.some(item => item.id === 'quote-pattern-low-margin'));
  assert.match(items[0].spoken, /отрицательной расчётной прибылью/iu);
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

test('PI cross-checks saved quote profit against price minus cost and routes to quotes', () => {
  const items = buildPiCoachInsights({ quotes: [
    { id: 51, title: 'КП офис', revenue_rub: 100000, cost_rub: 70000, profit_rub: 50000, margin_pct: 50 }
  ] }, { today: '2026-10-15' });
  const mismatch = items.find(item => item.id === 'quote-math-mismatch-51');
  assert.ok(mismatch);
  assert.equal(mismatch.view, 'projects');
  assert.match(mismatch.detail, /Цена минус себестоимость: 30 000|Цена минус себестоимость: 30 000/u);
});

test('PI does not warn about missing project dates for completed or cancelled projects', () => {
  const items = buildPiCoachInsights({ projects: [
    { id: 1, title: 'Старый объект', status: 'completed' },
    { id: 2, title: 'Отменённый объект', status: 'cancelled' }
  ] }, { today: '2026-10-15' });
  assert.equal(items.some(item => item.id === 'project-dates-missing-1' || item.id === 'project-dates-missing-2'), false);
});

test('PI detects a worsening production trend only after four dated observations', () => {
  const items = buildPiCoachInsights({ production: { history: [
    { id: 1, shift_date: '2026-10-01', project_title: 'А', workers_count: 5, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -5 }] },
    { id: 2, shift_date: '2026-10-02', project_title: 'Б', workers_count: 5, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -8 }] },
    { id: 3, shift_date: '2026-10-03', project_title: 'В', workers_count: 5, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -28 }] },
    { id: 4, shift_date: '2026-10-04', project_title: 'Г', workers_count: 5, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Снятие стяжки', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -32 }] }
  ] } }, { today: '2026-10-15' });
  const trend = items.find(item => item.id === 'production-trend-worsening-снятие стяжки-м²');
  assert.ok(trend);
  assert.match(trend.detail, /Предыдущие два наблюдения: в среднем -6% к плану/u);
  assert.match(trend.detail, /Последние два: в среднем -30% к плану/u);
});

test('PI does not combine production observations from different crew conditions', () => {
  const items = buildPiCoachInsights({ production: { history: [
    { id: 1, shift_date: '2026-10-01', workers_count: 4, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Демонтаж перегородок', unit: 'м²', workers_count: 4, hours: 8, deviationPct: -5 }] },
    { id: 2, shift_date: '2026-10-02', workers_count: 4, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Демонтаж перегородок', unit: 'м²', workers_count: 4, hours: 8, deviationPct: -8 }] },
    { id: 3, shift_date: '2026-10-03', workers_count: 7, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Демонтаж перегородок', unit: 'м²', workers_count: 7, hours: 8, deviationPct: -28 }] },
    { id: 4, shift_date: '2026-10-04', workers_count: 7, shift_hours: 8, downtime_hours: 0, complexity_factor: 1, performance: [{ work_name: 'Демонтаж перегородок', unit: 'м²', workers_count: 7, hours: 8, deviationPct: -32 }] }
  ] } }, { today: '2026-10-15' });
  assert.equal(items.some(item => item.id.startsWith('production-trend-worsening-демонтаж перегородок')), false);
});

test('PI does not infer a production trend from fewer than four observations', () => {
  const items = buildPiCoachInsights({ production: { history: [
    { id: 1, shift_date: '2026-10-01', performance: [{ work_name: 'Демонтаж стен', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -5 }] },
    { id: 2, shift_date: '2026-10-02', performance: [{ work_name: 'Демонтаж стен', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -30 }] },
    { id: 3, shift_date: '2026-10-03', performance: [{ work_name: 'Демонтаж стен', unit: 'м²', workers_count: 5, hours: 8, deviationPct: -35 }] }
  ] } }, { today: '2026-10-15' });
  assert.equal(items.some(item => item.id === 'production-trend-worsening-демонтаж стен-м²' || item.id === 'production-trend-improving-демонтаж стен-м²'), false);
});

test('PI flags missing schedule only for active or planned projects and explains why it matters', () => {
  const items = buildPiCoachInsights({ projects: [
    { id: 7, title: 'Склад', status: 'active', start_date: '', end_date: '' }
  ] }, { today: '2026-10-15' });
  const item = items.find(row => row.id === 'project-dates-missing-7');
  assert.ok(item);
  assert.match(item.spoken, /не могу надёжно оценить/iu);
  assert.equal(item.view, 'projects');
});
