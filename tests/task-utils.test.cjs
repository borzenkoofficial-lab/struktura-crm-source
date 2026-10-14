const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTaskInput, taskUrgency } = require('../src/task-utils.cjs');

test('task requires a non-empty title and trims input', () => {
  assert.deepEqual(normalizeTaskInput({ title: '  Перезвонить заказчику  ' }), { title: 'Перезвонить заказчику', dueAt: null });
  assert.throws(() => normalizeTaskInput({ title: '   ' }), /Укажи, что нужно сделать/);
});

test('task accepts date and local date-time, rejects malformed dates', () => {
  assert.equal(normalizeTaskInput({ title: 'Позвонить', due_at: '2026-10-15' }).dueAt, '2026-10-15');
  assert.equal(normalizeTaskInput({ title: 'Позвонить', due_at: '2026-10-15T14:30' }).dueAt, '2026-10-15T14:30');
  assert.throws(() => normalizeTaskInput({ title: 'Позвонить', due_at: 'завтра' }), /корректную дату/);
});

test('urgency distinguishes overdue, due today, upcoming, unscheduled and done tasks', () => {
  const today = '2026-10-13';
  assert.equal(taskUrgency({ is_done: 0, due_at: '2026-10-12' }, today), 'overdue');
  assert.equal(taskUrgency({ is_done: 0, due_at: '2026-10-13T15:00' }, today), 'today');
  assert.equal(taskUrgency({ is_done: 0, due_at: '2026-10-14' }, today), 'upcoming');
  assert.equal(taskUrgency({ is_done: 0, due_at: null }, today), 'unscheduled');
  assert.equal(taskUrgency({ is_done: 1, due_at: '2026-10-10' }, today), 'done');
});
