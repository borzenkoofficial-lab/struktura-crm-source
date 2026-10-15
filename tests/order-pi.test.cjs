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

test('uses saved preliminary economics in PI ranking without claiming real win probability', () => {
  const result = assessCommercialOrder({
    title: 'Тендер на демонтаж офисных помещений',
    snippet: 'Заказчик ищет подрядчика для демонтажа коммерческого помещения.',
    source_url: 'https://example.ru/tender/3',
    service: 'demolition',
    signal_score: 85
  }, {
    revenue_rub: 1500000,
    budget_rub: 1500000,
    quantity: 1000,
    estimated_margin_pct: 22,
    estimated_days: 8
  });
  assert.equal(result.economicsStatus, 'calculated_preliminary');
  assert.equal(result.deadlineStatus, 'production_duration_estimated');
  assert.equal(result.winProbabilityStatus, 'not_calculated');
  assert.equal(result.confidence, 'низкая');
  assert.ok(result.components.find(item => item.key === 'economics').value > 0);
  assert.ok(result.reasons.some(reason => reason.includes('Расчётная маржа')));
  assert.ok(!result.nextQuestions.includes('Уточнить бюджет или цену договора'));
});


test('caps priority for an order with a negative estimated margin', () => {
  const result = assessCommercialOrder({
    title: 'Тендер на демонтаж офисных помещений',
    snippet: 'Заказчик ищет подрядчика для демонтажа коммерческого помещения. Бюджет 1 500 000 руб., объём 1000 м2, заявки до 25.10.2026.',
    source_url: 'https://example.ru/tender/negative-margin',
    service: 'demolition',
    signal_labels: ['Закупка / тендер', 'Демонтаж']
  }, {
    revenue_rub: 1500000,
    budget_rub: 1500000,
    quantity: 1000,
    estimated_margin_pct: -12,
    estimated_days: 8,
    observations_count: 5
  });
  assert.ok(result.score <= 39);
  assert.equal(result.label, 'Недостаточно подтверждений');
  assert.ok(result.reasons.some(reason => reason.includes('Финансовый стоп-сигнал')));
  assert.ok(result.reasons.some(reason => reason.includes('ограничен финансовым стоп-сигналом')));
});

test('limits priority for thin positive estimated margin', () => {
  const result = assessCommercialOrder({
    title: 'Тендер на демонтаж офисных помещений',
    snippet: 'Заказчик ищет подрядчика для демонтажа коммерческого помещения.',
    source_url: 'https://example.ru/tender/thin-margin',
    service: 'demolition',
    signal_labels: ['Закупка / тендер', 'Демонтаж']
  }, {
    revenue_rub: 1500000,
    budget_rub: 1500000,
    quantity: 1000,
    estimated_margin_pct: 7,
    estimated_days: 8,
    observations_count: 5
  });
  assert.ok(result.score <= 54);
  assert.ok(result.reasons.some(reason => reason.includes('Низкая расчётная маржа')));
});

test('does not mistake a high general relevance score for procurement intent', () => {
  const result = assessCommercialOrder({
    title: 'Демонтаж коммерческого помещения',
    snippet: 'Компания описывает выполненный проект по демонтажу офиса и ремонту помещений.',
    source_url: 'https://example.ru/projects/demolition',
    service: 'demolition',
    signal_score: 60,
    signal_labels: ['Демонтаж', 'Коммерческий объект']
  });
  const intent = result.components.find(item => item.key === 'winLikelihood');
  assert.equal(intent.value, 25);
  assert.equal(result.winProbabilityStatus, 'not_calculated');
  assert.ok(!result.reasons.includes('Есть сигналы закупки или поиска подрядчика'));
});

test('does not treat a seller commercial proposal as buyer procurement intent', () => {
  const result = assessCommercialOrder({
    title: 'Коммерческое предложение на демонтаж офисов',
    snippet: 'Наша компания предлагает услуги демонтажа коммерческих помещений.',
    source_url: 'https://example.ru/services/demolition',
    service: 'demolition',
    signal_labels: ['Демонтаж', 'Коммерческий объект']
  });
  assert.equal(result.components.find(item => item.key === 'winLikelihood').value, 25);
  assert.ok(!result.reasons.includes('Есть сигналы закупки или поиска подрядчика'));
});

test('accepts explicit procurement labels from normalized search results', () => {
  const result = assessCommercialOrder({
    title: 'Демонтаж коммерческого помещения',
    snippet: 'Информация о проекте.',
    source_url: 'https://example.ru/tenders/123',
    service: 'demolition',
    signal_score: 60,
    signal_labels: ['Закупка / тендер', 'Демонтаж']
  });
  assert.equal(result.components.find(item => item.key === 'winLikelihood').value, 90);
});
