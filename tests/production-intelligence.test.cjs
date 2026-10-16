const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductionIntelligence } = require('../src/production-intelligence.cjs');

test('PI warns when active projects have no plan and does not invent a forecast', () => {
  const result = buildProductionIntelligence({ projects: [{ id: 1, title: 'Объект А', planCount: 0, shiftCount: 0, forecast: { estimated: false } }], history: [], totals: { shifts: 0, work_records: 0 } });
  assert.equal(result.projectCount, 1);
  assert.equal(result.forecastableCount, 0);
  assert.equal(result.alerts[0].level, 'warning');
  assert.match(result.alerts[0].message, /план/iu);
  assert.match(result.summary, /недостаточно данных/iu);
});

test('PI flags over-plan work and stale production data from supplied CRM records', () => {
  const result = buildProductionIntelligence({
    projects: [
      { id: 1, title: 'Объект Б', planCount: 2, shiftCount: 3, lastShiftDate: '2026-10-01', forecast: { estimated: true, lines: [{ name: 'Стены', overPlan: true }], teamShiftsRemaining: 4 } }
    ],
    history: [{ project_id: 1, performance: [{ work_name: 'Пол', deviationPct: -28 }] }],
    totals: { shifts: 3, work_records: 1 }
  }, { today: '2026-10-13' });
  assert.ok(result.alerts.some(alert => /превышен/iu.test(alert.message)));
  assert.ok(result.alerts.some(alert => /смена/iu.test(alert.message)));
  assert.ok(result.alerts.some(alert => /ниже нормы/iu.test(alert.message)));
  assert.equal(result.forecastableCount, 1);
});

test('PI does not emit low-confidence productivity warnings without shift evidence', () => {
  const result = buildProductionIntelligence({ projects: [{ id: 2, title: 'Объект В', planCount: 1, shiftCount: 0, forecast: { estimated: true, lines: [] } }], history: [], totals: { shifts: 0, work_records: 0 } });
  assert.equal(result.alerts.some(alert => /ниже нормы/iu.test(alert.message)), false);
});

test('PI flags material downtime and gives a concrete follow-up action', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 7, title: 'Склад', planCount: 1, shiftCount: 1, forecast: { estimated: false } }],
    history: [{ id: 31, project_id: 7, shift_date: '2026-10-12', shift_hours: 8, downtime_hours: 3, performance: [] }],
    totals: { shifts: 1, work_records: 0 }
  }, { today: '2026-10-13' });
  const alert = result.alerts.find(item => /простой/iu.test(item.title));
  assert.ok(alert, 'must flag downtime above 25% of shift');
  assert.match(alert.message, /причин|устран/iu);
  assert.match(alert.message, /3/iu);
});

test('PI flags implausibly high productivity for verification instead of blindly celebrating it', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 9, title: 'Офис', planCount: 1, shiftCount: 1, forecast: { estimated: true, lines: [] } }],
    history: [{ project_id: 9, shift_date: '2026-10-13', performance: [{ work_name: 'Снятие покрытия', deviationPct: 175 }] }],
    totals: { shifts: 1, work_records: 1 }
  }, { today: '2026-10-14' });
  const alert = result.alerts.find(item => /аномально высокая выработка/iu.test(item.title));
  assert.ok(alert);
  assert.match(alert.message, /единиц|часы|численность/iu);
});

test('PI detects recurring underperformance only after at least three observations', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 10, title: 'Склад', planCount: 1, shiftCount: 3, forecast: { estimated: true, lines: [] } }],
    history: [
      { project_id: 10, performance: [{ work_name: 'Демонтаж стяжки', deviationPct: -30 }] },
      { project_id: 10, performance: [{ work_name: 'Демонтаж стяжки', deviationPct: -25 }] },
      { project_id: 10, performance: [{ work_name: 'Демонтаж стяжки', deviationPct: -5 }] }
    ],
    totals: { shifts: 3, work_records: 3 }
  });
  const alert = result.alerts.find(item => /повторяющееся отставание/iu.test(item.title));
  assert.ok(alert);
  assert.match(alert.message, /2 из 3/iu);
});


test('browser-side PI validates ISO dates and detects stale shift reports', () => {
  const { buildProductionIntelligence: buildBrowserPI } = require('../src/production-intelligence.js');
  const result = buildBrowserPI({
    projects: [{ id: 4, title: 'Объект с историей', planCount: 1, shiftCount: 1, lastShiftDate: '2026-10-01', forecast: { estimated: true, lines: [] } }],
    history: [],
    totals: { shifts: 1, work_records: 0 }
  }, { today: '2026-10-13' });
  assert.ok(result.alerts.some(alert => /12 дн\. назад/iu.test(alert.message)));
  const invalid = buildBrowserPI({
    projects: [{ id: 5, title: 'Объект с некорректной датой', planCount: 1, shiftCount: 1, lastShiftDate: '2026-02-31', forecast: { estimated: true, lines: [] } }],
    history: [],
    totals: { shifts: 1, work_records: 0 }
  }, { today: '2026-10-13' });
  assert.equal(invalid.alerts.some(alert => /Нет свежих отчётов/iu.test(alert.title)), false);
});
