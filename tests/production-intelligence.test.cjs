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


test('PI returns explicit data coverage and confidence instead of only a generic summary', () => {
  const result = buildProductionIntelligence({
    projects: [
      { id: 1, title: 'Объект А', planCount: 1, shiftCount: 5, forecast: { estimated: true, observations: 6, teamShiftsRemaining: 2, lines: [] } },
      { id: 2, title: 'Объект Б', planCount: 0, shiftCount: 0, forecast: { estimated: false, lines: [] } }
    ],
    history: [],
    totals: { shifts: 5, work_records: 10 }
  }, { today: '2026-10-15' });
  assert.equal(result.dataQuality.forecastCoveragePct, 50);
  assert.equal(result.dataQuality.confidence, 'средняя');
  assert.equal(result.projectAssessments.length, 2);
  assert.equal(result.projectAssessments[1].confidence, 'недостаточно данных');
});

test('PI catches impossible allocated labour hours before they corrupt learned norms', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 3, title: 'Склад', planCount: 1, shiftCount: 1, forecast: { estimated: true, lines: [] } }],
    history: [{ project_id: 3, shift_date: '2026-10-15', workers_count: 4, shift_hours: 8, downtime_hours: 2,
      performance: [{ work_name: 'Демонтаж', workers_count: 4, hours: 7, deviationPct: 0 }] }],
    totals: { shifts: 1, work_records: 1 }
  }, { today: '2026-10-15' });
  assert.ok(result.alerts.some(alert => /трудозатрат/iu.test(alert.title)));
  assert.ok(result.recommendations.some(item => item.priority === 'high' && /часы/iu.test(item.nextStep)));
});

test('PI compares recent and previous productivity only when six observations exist', () => {
  const makeHistory = values => values.map((deviationPct, index) => ({
    project_id: 4, shift_date: `2026-10-${String(15-index).padStart(2,'0')}`,
    performance: [{ work_name: 'Снятие стяжки', deviationPct }]
  }));
  const short = buildProductionIntelligence({
    projects: [{ id: 4, title: 'Офис', planCount: 1, shiftCount: 3, forecast: { estimated: true, lines: [] } }],
    history: makeHistory([-5,-7,-6]), totals: { shifts: 3, work_records: 3 }
  });
  assert.equal(short.alerts.some(alert => /динамики/iu.test(alert.title)), false);
  const enough = buildProductionIntelligence({
    projects: [{ id: 4, title: 'Офис', planCount: 1, shiftCount: 6, forecast: { estimated: true, lines: [] } }],
    history: makeHistory([-35,-32,-30,-5,-7,-6]), totals: { shifts: 6, work_records: 6 }
  });
  assert.ok(enough.alerts.some(alert => /ухудшение динамики/iu.test(alert.title)));
});

test('PI recommends an action for repeated downtime using three or more shift records', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 8, title: 'ТЦ', planCount: 1, shiftCount: 3, forecast: { estimated: true, lines: [] } }],
    history: [
      { project_id: 8, shift_date: '2026-10-15', workers_count: 5, shift_hours: 8, downtime_hours: 3, performance: [] },
      { project_id: 8, shift_date: '2026-10-14', workers_count: 5, shift_hours: 8, downtime_hours: 2.5, performance: [] },
      { project_id: 8, shift_date: '2026-10-13', workers_count: 5, shift_hours: 8, downtime_hours: 0.5, performance: [] }
    ],
    totals: { shifts: 3, work_records: 0 }
  }, { today: '2026-10-15' });
  assert.ok(result.recommendations.some(item => /простои/iu.test(item.title) && /причину/iu.test(item.nextStep)));
});

test('PI sorts recommendations by urgency and does not invent economics without cost inputs', () => {
  const result = buildProductionIntelligence({
    projects: [{ id: 1, title: 'Объект', planCount: 0, shiftCount: 0, forecast: { estimated: false, lines: [] } }],
    history: [{ project_id: 1, shift_date: '2026-10-15', workers_count: 2, shift_hours: 8, downtime_hours: 0, performance: [
      { work_name: 'Стены', workers_count: 2, hours: 8, deviationPct: 0 }
    ] }],
    totals: { shifts: 1, work_records: 1 }
  }, { today: '2026-10-15' });
  assert.equal(result.recommendations[0].priority, 'high');
  assert.equal(Object.hasOwn(result, 'estimatedProfitRub'), false);
});
