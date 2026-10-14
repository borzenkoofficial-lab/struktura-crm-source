const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductionReportHtml } = require('../src/production-report.cjs');

test('client production report contains plan/fact and shift notes but hides internal finance', () => {
  const html = buildProductionReportHtml({
    project: { title: 'Объект <А>', address: 'Москва', client_name: 'Заказчик' },
    startDate: '2026-10-01', endDate: '2026-10-13', internal: false,
    plan: [{ work_name: 'Демонтаж стен', unit: 'м²', planned_quantity: 100, actual_quantity: 65 }],
    shifts: [{ shift_date: '2026-10-12', workers_count: 5, shift_hours: 8, downtime_hours: 1, notes: 'Ждали лифт' }],
    payments: [{ amount_rub: 100000, payment_type: 'incoming' }],
    expenses: [{ amount_rub: 25000, description: 'Оплата рабочих', category: 'workers' }]
  });
  assert.match(html, /Демонтаж стен/u);
  assert.match(html, /65/u);
  assert.match(html, /Ждали лифт/u);
  assert.doesNotMatch(html, /100\s*000/u);
  assert.doesNotMatch(html, /Оплата рабочих/u);
  assert.match(html, /не заменяет договор или акт приёмки/u);
});

test('internal report includes finance and escapes untrusted database text', () => {
  const html = buildProductionReportHtml({
    project: { title: '<script>alert(1)</script>', address: '', client_name: '' },
    startDate: '2026-10-01', endDate: '2026-10-13', internal: true,
    plan: [], shifts: [], payments: [{ amount_rub: 100000, payment_type: 'incoming' }],
    expenses: [{ amount_rub: 25000, description: 'Рабочие', category: 'workers' }]
  });
  assert.doesNotMatch(html, /<script>alert/u);
  assert.match(html, /&lt;script&gt;/u);
  assert.match(html, /100\s*000/u);
  assert.match(html, /Рабочие/u);
  assert.match(html, /ВНУТРЕННИЙ ОТЧЁТ/u);
});

test('report generator does not preserve impossible date strings', () => {
  const html = buildProductionReportHtml({ project: { title: 'Объект' }, startDate: '2026-02-31', endDate: '2026-10-13', plan: [], shifts: [], payments: [], expenses: [] });
  assert.match(html, /Период: — — 2026-10-13/u);
});

test('completed-works act includes period quantities and clear non-legal-substitute notice', () => {
  const html = buildProductionReportHtml({
    documentType: 'act',
    project: { title: 'Склад', client_name: 'ООО Заказчик', address: 'Москва' },
    startDate: '2026-10-01', endDate: '2026-10-13',
    plan: [{ work_name: 'Демонтаж стяжки', unit: 'м²', planned_quantity: 100, actual_quantity: 70, remaining_quantity: 30 }],
    actualByPeriod: [{ work_name: 'Демонтаж стяжки', unit: 'м²', quantity_done: 25 }]
  });
  assert.match(html, /Акт фиксации фактически выполненных работ/);
  assert.match(html, /25/);
  assert.match(html, /перед использованием как договорного документа проверьте требования/);
  assert.doesNotMatch(html, /Финансы за выбранный период/);
});


test('production report uses the current GRUZLI CRM brand consistently', () => {
  const { buildProductionReportHtml } = require('../src/production-report.cjs');
  const html = buildProductionReportHtml({ project: { title: 'Тестовый объект' } });
  assert.match(html, /<div class="brand">GRUZLI<\/div>/);
  assert.match(html, /Сформировано в GRUZLI CRM/);
  assert.doesNotMatch(html, /STRUKTURA/);
});
