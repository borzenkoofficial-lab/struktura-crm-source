const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, summarize } = require('../src/prospect-radar.js');

test('detects explicit tender and contractor signals', () => {
  const result = analyze({ company_name: 'ООО Пример', notes: 'Ищем подрядчика на реконструкцию офиса, тендер в октябре', website: 'https://example.ru' });
  assert.ok(result.signals.some(s => s.key === 'tender'));
  assert.ok(result.signals.some(s => s.key === 'contractor'));
  assert.ok(result.signalScore >= 50);
  assert.match(result.nextAction, /сайт|контакт|ответственного/i);
});

test('does not claim demand signal for plain company with no evidence', () => {
  const result = analyze({ company_name: 'ООО Ромашка', category: 'Компания', status: 'new' });
  assert.equal(result.signals.length, 0);
  assert.equal(result.signalScore, 0);
  assert.match(result.nextAction, /контакт|сайт/i);
});

test('summary excludes converted and rejected prospects and returns useful queue', () => {
  const rows = [
    { id: 1, company_name: 'Тендерная компания', notes: 'Опубликован тендер на ремонт офиса', status: 'new', website: 'https://a.ru' },
    { id: 2, company_name: 'Обычная компания', status: 'new', phone: '+79990000000' },
    { id: 3, company_name: 'Закрытая', notes: 'Ищем подрядчика', status: 'converted' },
    { id: 4, company_name: 'Отказ', notes: 'Тендер на демонтаж', status: 'rejected' }
  ];
  const result = summarize(rows);
  assert.equal(result.signalCount, 1);
  assert.equal(result.contactCount, 1);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.queue.map(p => p.id), [1, 2]);
});

test('contact status changes the recommended action', () => {
  const result = analyze({ company_name: 'ООО Пример', notes: 'Тендер на ремонт', phone: '+79990000000', status: 'new' });
  assert.match(result.nextAction, /подготовить персональный контакт/i);
});
