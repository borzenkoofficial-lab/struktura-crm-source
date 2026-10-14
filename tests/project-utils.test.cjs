'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProjectInput, validDate } = require('../src/project-utils.cjs');

test('project requires a non-empty title and trims it', () => {
  assert.throws(() => normalizeProjectInput({ title: '   ' }), /название объекта/i);
  assert.equal(normalizeProjectInput({ title: '  Объект  ' }).title, 'Объект');
});

test('project accepts empty optional dates and valid date-only values', () => {
  assert.equal(normalizeProjectInput({ title: 'Офис' }).start_date, null);
  assert.equal(normalizeProjectInput({ title: 'Офис', start_date: '2026-10-13', end_date: '2026-10-20' }).end_date, '2026-10-20');
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
});

test('project rejects malformed dates and end date before start date', () => {
  assert.throws(() => normalizeProjectInput({ title: 'Офис', start_date: '13.10.2026' }), /дату начала/i);
  assert.throws(() => normalizeProjectInput({ title: 'Офис', start_date: '2026-10-20', end_date: '2026-10-19' }), /раньше даты начала/i);
});

test('project normalizes service, status, contract and bounded text fields', () => {
  const project = normalizeProjectInput({ title: 'X', service: 'bad', status: 'bad', contract_rub: '100.6', address: 'a'.repeat(300) });
  assert.equal(project.service, 'demolition');
  assert.equal(project.status, 'planned');
  assert.equal(project.contract_rub, 101);
  assert.equal(project.address.length, 250);
  assert.throws(() => normalizeProjectInput({ title: 'X', contract_rub: -1 }), /неотрицательной/i);
});
