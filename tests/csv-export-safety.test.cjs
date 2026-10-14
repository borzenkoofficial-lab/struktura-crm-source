'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeCsvCell } = require('../src/csv.cjs');

test('CSV export neutralizes spreadsheet operator prefixes', () => {
  for (const prefix of [61, 43, 45, 64]) {
    const value = String.fromCharCode(prefix) + '1+1';
    assert.equal(safeCsvCell(value), "'" + value);
  }
});

test('CSV export neutralizes spreadsheet operators after leading whitespace', () => {
  const value = '  ' + String.fromCharCode(61) + '1+1';
  assert.equal(safeCsvCell(value), "'" + value);
});

test('CSV export preserves ordinary text and safely handles nullish values', () => {
  assert.equal(safeCsvCell('Демонтаж стен'), 'Демонтаж стен');
  assert.equal(safeCsvCell(''), '');
  assert.equal(safeCsvCell(null), '');
  assert.equal(safeCsvCell(undefined), '');
});
