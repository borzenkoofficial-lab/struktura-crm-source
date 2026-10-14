const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReminders, isReminderWindow, normalizeReminderSettings } = require('../src/reminder-engine.cjs');

test('reminders are restricted to configured work hours and weekdays by default', () => {
  assert.equal(isReminderWindow(new Date(2026, 9, 12, 9, 0)), true); // Monday
  assert.equal(isReminderWindow(new Date(2026, 9, 12, 19, 0)), false);
  assert.equal(isReminderWindow(new Date(2026, 9, 11, 12, 0)), false); // Sunday
});

test('overdue tasks and stale active projects generate actionable reminders', () => {
  const reminders = buildReminders({
    now: new Date(2026, 9, 13, 10, 0),
    tasks: [{ id: 5, title: 'Позвонить заказчику', due_at: '2026-10-12T15:00', is_done: 0 }],
    projects: [
      { id: 8, title: 'Офис', status: 'active', last_shift_date: '2026-10-10', end_date: '2026-10-12' },
      { id: 9, title: 'Новый объект', status: 'active', last_shift_date: '2026-10-12', end_date: '2026-10-20' },
      { id: 10, title: 'Завершён', status: 'completed', last_shift_date: '2026-10-01', end_date: '2026-10-02' }
    ]
  });
  assert.equal(reminders.length, 3);
  assert.ok(reminders.some(item => item.key === 'task:5' && /Просрочка: 1 дн\./.test(item.body)));
  assert.ok(reminders.some(item => item.key === 'shift-report:8' && /3 дн\./.test(item.body)));
  assert.ok(reminders.some(item => item.key === 'project-deadline:8' && item.level === 'danger'));
});

test('reminders honor disabled rules and suppress repeat notifications until cooldown expires', () => {
  const now = new Date(2026, 9, 13, 10, 0);
  const input = { now, tasks: [{ id: 1, title: 'Смета', due_at: '2026-10-12T10:00', is_done: 0 }] };
  assert.deepEqual(buildReminders({ ...input, settings: { taskDeadlines: false } }), []);
  assert.deepEqual(buildReminders({ ...input, lastSent: { 'task:1': '2026-10-13T09:30:00' } }), []);
  assert.equal(buildReminders({ ...input, lastSent: { 'task:1': '2026-10-12T09:00:00' } }).length, 1);
});

test('notification settings are clamped to safe supported values', () => {
  assert.deepEqual(normalizeReminderSettings({ startHour: -3, endHour: 50, staleShiftDays: 0, repeatEveryHours: 900 }), {
    enabled: true, taskDeadlines: true, missingShiftReports: true, overdueProjects: true,
    startHour: 0, endHour: 24, weekdaysOnly: true, staleShiftDays: 2, repeatEveryHours: 168
  });
});

test('completed tasks, future deadlines, disabled reminders and out-of-hours checks stay silent', () => {
  const now = new Date(2026, 9, 13, 20, 0);
  const reminders = buildReminders({
    now,
    tasks: [
      { id: 1, title: 'Закрыта', due_at: '2026-10-12T09:00', is_done: 1 },
      { id: 2, title: 'Ещё не пора', due_at: '2026-10-14T09:00', is_done: 0 }
    ]
  });
  assert.deepEqual(reminders, []);
  assert.equal(isReminderWindow(new Date(2026, 9, 13, 10, 0), { enabled: false }), false);
});
