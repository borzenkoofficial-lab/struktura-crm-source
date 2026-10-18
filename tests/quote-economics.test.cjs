'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateQuoteTotals } = require('../src/quote-economics.cjs');

test('quote totals calculate revenue, discount, costs, profit and margin', () => {
  assert.deepEqual(calculateQuoteTotals([
    { quantity: 10, price: 500, cost: 200 },
    { quantity: 2, price: 1000, cost: 600 }
  ], 500), {
    grossRevenueRub: 7000,
    discountRub: 500,
    revenueRub: 6500,
    costRub: 3200,
    profitRub: 3300,
    marginPct: 50.77
  });
});

test('quote totals use full cost from detailed estimate when line costs are omitted', () => {
  assert.deepEqual(calculateQuoteTotals([{ quantity: 10, price: 500 }], 250, 3200), {
    grossRevenueRub: 5000,
    discountRub: 250,
    revenueRub: 4750,
    costRub: 3200,
    profitRub: 1550,
    marginPct: 32.63
  });
});

test('discount cannot exceed gross revenue and zero revenue has zero margin', () => {
  assert.deepEqual(calculateQuoteTotals([{ quantity: 1, price: 100 }], 500, 20), {
    grossRevenueRub: 100,
    discountRub: 100,
    revenueRub: 0,
    costRub: 20,
    profitRub: -20,
    marginPct: 0
  });
});

test('invalid negative or non-finite amounts are rejected', () => {
  assert.throws(() => calculateQuoteTotals([{ quantity: -1, price: 100 }]), /неотрицательным/);
  assert.throws(() => calculateQuoteTotals([{ quantity: 1, price: 100 }], -1), /неотрицательным/);
  assert.throws(() => calculateQuoteTotals([{ quantity: 1, price: 100 }], 0, Infinity), /неотрицательным/);
});

test('every local module required by the Electron main process exists in the source tree', () => {
  const mainPath = path.join(__dirname, '..', 'src', 'main.cjs');
  const source = fs.readFileSync(mainPath, 'utf8');
  const requirePattern = /require\(['"]\.\/([^'"]+)['"]\)/g;
  for (const match of source.matchAll(requirePattern)) {
    const modulePath = path.join(path.dirname(mainPath), match[1]);
    assert.equal(fs.existsSync(modulePath) && fs.statSync(modulePath).isFile(), true,
      'Missing main-process dependency: ' + match[1]);
  }
});
