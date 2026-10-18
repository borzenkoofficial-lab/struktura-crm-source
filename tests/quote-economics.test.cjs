'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQuoteTotals } = require('../src/quote-economics.cjs');

test('quote totals are recalculated from line quantities, prices, costs, and bounded discount', () => {
  assert.deepEqual(calculateQuoteTotals([
    { quantity: 2, price: 1000, cost: 600 },
    { quantity: 3, price: 500, cost: 250 }
  ], 400), {
    grossRevenueRub: 3500, revenueRub: 3100, costRub: 1950, profitRub: 1150, discountRub: 400, marginPct: 1150 / 3100 * 100
  });
});

test('quote totals do not trust renderer totals and cannot apply discount beyond revenue', () => {
  const result = calculateQuoteTotals([{ quantity: 1, price: 100, cost: 150 }], 999999);
  assert.equal(result.revenueRub, 0);
  assert.equal(result.discountRub, 100);
  assert.equal(result.profitRub, -150);
  assert.equal(result.marginPct, 0);
});
