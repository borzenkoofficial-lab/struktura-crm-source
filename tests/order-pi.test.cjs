'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assessCommercialOrder } = require('../src/order-pi.cjs');

test('does not invent profitability or win probability when commercial terms are missing', () => {
  const result = assessCommercialOrder({
    title: 'Ищем подрядчика на демонтаж офисных помещений',
    snippet: 'Коммерческий объект в Москве, требуется подрядчик для демонтажа перегородок.',
    source_url: 'https://example.ru/tender/1',
    service: 'demolition',
    signal_score: 55
  });
  assert.equal(result.economicsStatus, 'unknown');
  assert.equal(result.winProbabilityStatus, 'not_calculated');
  assert.ok(result.nextQuestions.includes('Уточнить бюджет или цену договора'));
  assert.ok(result.nextQuestions.includes('Уточнить объём и единицы измерения'));
  assert.equal(result.totalFactors, 5);
});

test('recognizes stated budget, volume and deadline as unverified evidence only', () => {
  const result = assessCommercialOrder({
    title: 'Тендер на демонтаж, бюджет 1 500 000 руб., объём 1000 м2',
    snippet: 'Заявки принимаются до 25.10.2026. Требуется подрядчик на демонтаж коммерческого помещения.',
    source_url: 'https://example.ru/tender/2',
    service: 'demolition',
    signal_score: 85
  });
  assert.equal(result.economicsStatus, 'needs_verification');
  assert.equal(result.deadlineStatus, 'mentioned_unverified');
  assert.ok(result.score > 0);
  assert.ok(result.reasons.some(reason => reason.includes('требуется проверка')));
  assert.match(result.disclaimer, /Не является прогнозом прибыли/);
});

test('flags a service mismatch and weak source data', () => {
  const result = assessCommercialOrder({
    title: 'Поставка офисной мебели',
    snippet: '',
    source_url: 'not-a-url',
    service: 'demolition',
    signal_score: 0
  });
  assert.ok(result.score < 40);
  assert.equal(result.confidence, 'низкая');
  assert.ok(result.nextQuestions.includes('Добавить ссылку на первоисточник'));
  assert.ok(result.reasons.includes('Вид работ не подтверждён текстом результата'));
});
