const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../src/prospect-scoring.js');

test('prospect priority rewards relevant B2B company, local region and buying signal', () => {
  const result = evaluate({
    company_name: 'ООО Генподряд', category: 'Коммерческая недвижимость', service: 'demolition',
    region: 'Москва и Московская область', phone: '+7 495 123-45-67', email: 'info@example.ru',
    website: 'https://example.ru', source_url: 'https://example.ru/contacts',
    notes: 'Идёт реконструкция бизнес-центра, ищут подрядчика; новый объект'
  });
  assert.ok(result.score >= 80, `expected >=80, got ${result.score}`);
  assert.ok(result.reasons.includes('Возможный сигнал закупки/нового объекта'));
  assert.ok(result.reasons.includes('Целевой регион'));
});

test('priority remains cautious when a company has little evidence', () => {
  const result = evaluate({ company_name: 'Компания', service: 'demolition', region: 'Неизвестно' });
  assert.equal(result.score, 0);
  assert.ok(result.reasons.includes('Контакт не найден'));
});

test('service-specific evidence is only rewarded for matching service', () => {
  const notes = 'Монтаж фальшпола в серверной комнате';
  const raised = evaluate({ notes, service: 'raised_floor' });
  const demolition = evaluate({ notes, service: 'demolition' });
  assert.ok(raised.score > demolition.score);
});

test('priority score never exceeds 100', () => {
  const result = evaluate({ company_name: 'Генподрядчик', category: 'Бизнес-центр', notes: 'тендер, новый объект, ищем подрядчика, демонтаж, реконструкция', service: 'demolition', region: 'Москва', phone: '123', email: 'x@y.ru', website: 'https://x.ru', source_url: 'https://x.ru', status: 'reviewed' });
  assert.ok(result.score <= 100);
});
