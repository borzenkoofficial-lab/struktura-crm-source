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
  assert.equal(result.forecasts[1].expectedReceipts, 0);
  assert.equal(result.unscheduledReceivablesTotal, 100000);
  assert.ok(result.dataWarnings.some(warning => /нет графика платежей/u.test(warning)));
  assert.equal(result.dataWarnings.some(warning => /Получено по объекту/u.test(warning)), false);
});

test('refunds never inflate receivables above the contract and end dates are not payment dates', () => {
  const result = buildFinanceInsights({ today: '2026-10-16', projects: [{ id: 2, title: 'Возврат', status: 'active', contract_rub: 50000, received_rub: -10000, end_date: '2026-10-17' }] });
  assert.equal(result.receivablesTotal, 50000);
  assert.equal(result.forecasts[0].expectedReceipts, 0);
  assert.equal(result.forecasts[1].expectedReceipts, 0);
});
