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

test('quote economics rounds each printed line before summing totals', () => {
  const result = calculateQuoteTotals([
    { quantity: 1.25, price: 100, cost: 20 },
    { quantity: 1.25, price: 100, cost: 20 }
  ], 1.6);
  assert.equal(result.grossRevenueRub, 250);
  assert.equal(result.discountRub, 2);
  assert.equal(result.revenueRub, 248);
  assert.equal(result.costRub, 50);
});

test('quote economics rejects negative, infinite and overflowing line values', () => {
  assert.throws(() => calculateQuoteTotals([{ quantity: -1, price: 100 }]), /Количество в строке КП/);
  assert.throws(() => calculateQuoteTotals([{ quantity: 1, price: Infinity }]), /Цена в строке КП/);
  assert.throws(() => calculateQuoteTotals([{ quantity: Number.MAX_VALUE, price: Number.MAX_VALUE }]), /Сумма строки КП/);
  assert.throws(() => calculateQuoteTotals([{ quantity: 1, price: 100 }], -1), /Скидка/);
});

test('quote economics derives full internal cost from line costs and explicit expenses', () => {
  const result = calculateQuoteTotals(
    [{ quantity: 2, price: 1000, cost: 400 }],
    100,
    { payroll: 200, materials: 100, disposal: 50, transport: 25, equipment: 0, other: 25, overheadPercent: 10, taxPercent: 6 }
  );
  assert.equal(result.grossRevenueRub, 2000);
  assert.equal(result.discountRub, 100);
  assert.equal(result.revenueRub, 1900);
  assert.equal(result.lineCostsRub, 800);
  assert.equal(result.directCostsRub, 1200);
  assert.equal(result.overheadRub, 120);
  assert.equal(result.taxReserveRub, 114);
  assert.equal(result.costRub, 1434);
  assert.equal(result.profitRub, 466);
  assert.equal(result.marginPct, 466 / 1900 * 100);
});

test('quote economics validates each cost input before the PDF is created', () => {
  assert.throws(() => calculateQuoteTotals([{quantity:1,price:100,cost:10}],0,{payroll:-1}), /Оплата бригады/);
  assert.throws(() => calculateQuoteTotals([{quantity:1,price:100,cost:10}],0,{overheadPercent:101}), /Накладные расходы/);
  assert.throws(() => calculateQuoteTotals([{quantity:1,price:100,cost:10}],0,{taxPercent:51}), /Налоговый резерв/);
});
