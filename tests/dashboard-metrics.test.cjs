'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPeriodRange,
  isInRange,
  getTaskBucket,
  percent,
  computeDashboardMetrics
} = require('../src/dashboard-metrics.js');

const NOW = new Date(2026, 10, 1, 12, 0, 0);

function fixture() {
  return {
    financeEnabled: true,
    productionEnabled: true,
    summary: { leads: 1, projects: 2, cash: 777 },
    leads: [
      { id: 1, status: 'new' },
      { id: 2, status: 'won' },
      { id: 3, status: 'lost' }
    ],
    clients: [{ id: 1 }, { id: 2 }],
    projects: [
      { id: 1, title: 'Active', status: 'active', planned_people: 5, contract_rub: 1000, received_rub: 250 },
      { id: 2, title: 'Planned', status: 'planned', planned_people: 3, contract_rub: 500, received_rub: 100 },
      { id: 3, title: 'Completed', status: 'completed', planned_people: 0, contract_rub: 500, received_rub: 250 },
      { id: 4, title: 'Cancelled', status: 'cancelled', planned_people: 0, contract_rub: 9999, received_rub: 9999 }
    ],
    tasks: [
      { id: 1, is_done: 1, due_at: '2026-10-30' },
      { id: 2, is_done: 0, due_at: '2026-10-31' },
      { id: 3, is_done: 0, due_at: '2026-11-01' },
      { id: 4, is_done: 0, due_at: null }
    ],
    payments: [
      { payment_date: '2026-11-01', payment_type: 'payment', amount_rub: 100 },
      { payment_date: '2026-10-31', payment_type: 'refund', amount_rub: 20 },
      { payment_date: '2026-10-25', payment_type: 'payment', amount_rub: 999 }
    ],
    incomeRecords: [
      { income_date: '2026-11-01', amount_rub: 50 },
      { income_date: '2026-10-25', amount_rub: 30 }
    ],
    expenses: [
      { expense_date: '2026-11-01', is_paid: 1, amount_rub: 40 },
      { expense_date: '2026-11-01', is_paid: 0, amount_rub: 100 },
      { expense_date: '2026-10-25', is_paid: 1, amount_rub: 500 }
    ],
    production: {
      projects: [
        { forecast: { totalLines: 2, lines: [
          { plannedQuantity: 100, actualQuantity: 60 },
          { plannedQuantity: 50, actualQuantity: 10 }
        ] } },
        { forecast: { totalLines: 0, lines: [] } }
      ]
    }
  };
}

test('period ranges use inclusive local calendar dates', () => {
  assert.deepEqual(getPeriodRange('week', NOW), { start: '2026-10-26', end: '2026-11-01', label: 'За последние 7 дней' });
  assert.deepEqual(getPeriodRange('month', NOW), { start: '2026-11-01', end: '2026-11-01', label: 'С начала месяца' });
  assert.deepEqual(getPeriodRange('year', NOW), { start: '2026-01-01', end: '2026-11-01', label: 'С начала года' });
  assert.equal(isInRange('2026-10-31T23:59:59', getPeriodRange('week', NOW)), true);
  assert.equal(isInRange('2026-10-25', getPeriodRange('week', NOW)), false);
});

test('task status classifier handles completed, missing, overdue, today and upcoming dates', () => {
  assert.equal(getTaskBucket({ is_done: 1, due_at: '2026-10-01' }, '2026-11-01', NOW), 'done');
  assert.equal(getTaskBucket({ is_done: 0, due_at: null }, '2026-11-01', NOW), 'unscheduled');
  assert.equal(getTaskBucket({ is_done: 0, due_at: '2026-10-31' }, '2026-11-01', NOW), 'overdue');
  assert.equal(getTaskBucket({ is_done: 0, due_at: '2026-11-01' }, '2026-11-01', NOW), 'today');
  assert.equal(getTaskBucket({ is_done: 0, due_at: '2026-11-02' }, '2026-11-01', NOW), 'upcoming');
});

test('percent never divides by zero and clamps to the 0–100 interval', () => {
  assert.equal(percent(2, 0), 0);
  assert.equal(percent(-1, 4), 0);
  assert.equal(percent(8, 4), 100);
  assert.equal(percent(1, 4), 25);
});

test('dashboard counts distinguish active projects, client records and planned crew from employee headcount', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.equal(metrics.counts.activeLeads, 1);
  assert.equal(metrics.counts.activeProjects, 2);
  assert.equal(metrics.counts.clients, 2);
  assert.equal(metrics.counts.plannedPeople, 5);
});

test('cashflow periods subtract refunds and include only actually paid expenses', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.equal(metrics.finance.periodReceived, 130);
  assert.equal(metrics.finance.periodExpenses, 40);
  assert.equal(metrics.finance.periodPaymentsCount, 2);
  assert.equal(metrics.finance.periodOtherIncomeCount, 1);
  assert.equal(metrics.finance.periodExpenseCount, 1);
  assert.equal(metrics.finance.cash, 777, 'all-time management cash uses the trusted summary');
});

test('collection progress is measured against non-cancelled contracts, not arbitrary income', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.equal(metrics.finance.totalContract, 2000);
  assert.equal(metrics.finance.projectReceived, 600);
  assert.equal(metrics.finance.collectionPercent, 30);
});

test('project, production, task and lead rings use their corresponding actual denominators', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.deepEqual(metrics.progress.projects, { done: 1, total: 3, percent: 1 / 3 * 100, available: true });
  assert.equal(metrics.progress.production.planned, 150);
  assert.equal(metrics.progress.production.actual, 70);
  assert.equal(metrics.progress.production.percent, 70 / 150 * 100);
  assert.deepEqual(metrics.progress.tasks, { done: 1, total: 4, percent: 25, available: true });
  assert.equal(metrics.progress.leads.won, 1);
  assert.equal(metrics.progress.leads.total, 3);
  assert.equal(metrics.progress.leads.percent, 1 / 3 * 100);
  assert.equal(metrics.progress.leads.available, true);
});

test('attention signals reuse the same task date rules and active object data', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.deepEqual(metrics.attention, {
    overdueTasks: 1,
    newLeads: 1,
    unstaffedProjects: 0,
    unplannedActiveProjects: 1,
    tasksAvailable: true,
    leadsAvailable: true,
    projectsAvailable: true,
    productionAvailable: true
  });
});

test('cashflow chart groups the last six months and accounts for refunds', () => {
  const metrics = computeDashboardMetrics(fixture(), 'week', NOW);
  assert.equal(metrics.cashflow.length, 6);
  assert.deepEqual(metrics.cashflow.map(item => item.key), [
    '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'
  ]);
  assert.equal(metrics.cashflow[4].income, 1009);
  assert.equal(metrics.cashflow[4].expenses, 500);
  assert.equal(metrics.cashflow[5].income, 150);
  assert.equal(metrics.cashflow[5].expenses, 40);
});

test('missing source arrays stay explicitly incomplete instead of becoming false zeroes', () => {
  const input = fixture();
  delete input.payments;
  const metrics = computeDashboardMetrics(input, 'month', NOW);
  assert.equal(metrics.finance.available, true);
  assert.equal(metrics.finance.complete, false);
  assert.equal(metrics.finance.periodReceived, null);
  assert.equal(metrics.finance.periodExpenses, null);
  assert.deepEqual(metrics.cashflow, []);
});

test('restricted licence features do not expose finance or production metrics', () => {
  const input = fixture();
  input.financeEnabled = false;
  input.productionEnabled = false;
  const metrics = computeDashboardMetrics(input, 'month', NOW);
  assert.equal(metrics.finance.available, false);
  assert.equal(metrics.progress.production.available, false);
  assert.deepEqual(metrics.cashflow, []);
});

test('progress and attention sources are marked unavailable when their lists fail to load', () => {
  const input = fixture();
  delete input.projects;
  delete input.tasks;
  delete input.leads;
  delete input.production;
  const metrics = computeDashboardMetrics(input, 'month', NOW);
  assert.equal(metrics.availability.projects, false);
  assert.equal(metrics.availability.tasks, false);
  assert.equal(metrics.availability.leads, false);
  assert.equal(metrics.availability.production, false);
  assert.equal(metrics.progress.projects.available, false);
  assert.equal(metrics.progress.tasks.available, false);
  assert.equal(metrics.progress.leads.available, false);
  assert.equal(metrics.attention.projectsAvailable, false);
  assert.equal(metrics.attention.tasksAvailable, false);
  assert.equal(metrics.progress.production.available, false);
});

test('invalid or missing numeric fields are safely treated as zero, not NaN', () => {
  const input = fixture();
  input.projects[0].contract_rub = 'not-money';
  input.projects[1].planned_people = undefined;
  const metrics = computeDashboardMetrics(input, 'week', NOW);
  assert.equal(metrics.finance.totalContract, 1000);
  assert.equal(metrics.counts.plannedPeople, 5);
});
