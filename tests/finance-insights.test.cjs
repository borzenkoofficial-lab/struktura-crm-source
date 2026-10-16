'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFinanceInsights } = require('../src/finance-insights.cjs');

test('negative net receipts from refunds do not become an invalid-money zero or inflate debt beyond contract', () => {
  const result = buildFinanceInsights({
    today: '2026-10-16',
    projects: [{ id: 1, title: 'Объект с возвратом', status: 'active', contract_rub: 100000, received_rub: -25000, end_date: '2026-10-20', paid_expenses_rub: 0, planned_expenses_rub: 0 }],
    expenses: []
  });
  assert.equal(result.receivablesTotal, 100000);
  assert.equal(result.forecasts[1].expectedReceipts, 100000);
  assert.equal(result.dataWarnings.some(warning => /Получено по объекту/u.test(warning)), false);
});
