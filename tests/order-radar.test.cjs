'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderQueries, buildManualOrderSearchUrl, normalizeOrderResult, normalizeBraveOrderResult, orderRefreshAction, deduplicateOrders, classifyOrderSource } = require('../src/order-radar.cjs');

test('builds four order queries with selected service and region', () => {
  const queries = buildOrderQueries('demolition', 'Москва и МО');
  assert.equal(queries.length, 4);
  assert.ok(queries.every(query => query.includes('Москва и МО')));
  assert.ok(queries.some(query => /тендер|закупк/i.test(query)));
  assert.ok(queries.some(query => /zakupki\.gov\.ru|roseltorg\.ru|b2b-center\.ru/i.test(query)));
});

test('normalizes links and scores a plausible commercial order from result evidence', () => {
  const order = normalizeOrderResult({
    title: 'Закупка на демонтаж офисных помещений',
    url: 'https://tenders.example.ru/procedure/123#details',
    description: 'Заказчик ищет подрядчика для демонтажа и ремонта офиса в Москве'
  }, 'общий запрос', 'demolition', 'Москва и МО');
  assert.equal(order.source_url, 'https://tenders.example.ru/procedure/123');
  assert.equal(order.source_name, 'tenders.example.ru');
  assert.ok(order.signal_score >= 50);
  assert.equal(order.relevance, 'potential_order');
});

test('rejects invalid URLs and removes duplicate source links', () => {
  assert.equal(normalizeOrderResult({ title: 'bad', url: 'javascript:alert(1)' }), null);
  const order = normalizeOrderResult({ title: 'Заказ', url: 'https://example.ru/order' });
  assert.equal(deduplicateOrders([order, order]).length, 1);
});

test('search keywords alone do not turn generic results into potential orders', () => {
  const order = normalizeOrderResult(
    { title: 'Компания', url: 'https://example.ru', description: 'Профиль компании' },
    'тендер закупка демонтаж коммерческих помещений Москва'
  );
  assert.equal(order.signal_score, 0);
  assert.equal(order.relevance, 'review');
});

test('marks general renovation signal for manual review if no explicit tender or contractor signal', () => {
  const order = normalizeOrderResult({
    title: 'Реконструкция офисного пространства',
    url: 'https://example.ru/project',
    description: 'Ремонт и отделка коммерческого помещения'
  }, 'демонтаж', 'finishing', 'Москва');
  assert.equal(order.relevance, 'review');
  assert.ok(order.signal_score > 0);
});

test('uses safe defaults for unknown service and strips URL credentials', () => {
  assert.equal(normalizeOrderResult({
    title: 'Заказ',
    url: 'https://user:pass@example.ru/order'
  }), null);
  const order = normalizeOrderResult({
    title: 'Заказ',
    url: 'https://example.ru/order'
  }, '', 'unknown');
  assert.equal(order.service, 'demolition');
});


test('maps Brave Search result fields into a scored order card', () => {
  const order = normalizeBraveOrderResult({
    company_name: 'Закупка: демонтаж офисных помещений',
    source_url: 'https://tenders.example.ru/order/42?utm_source=brave#details',
    snippet: 'Проводится тендер, заказчик ищет подрядчика для демонтажа офиса в Москве'
  }, 'тендер демонтаж Москва', 'demolition', 'Москва и МО');
  assert.ok(order);
  assert.equal(order.title, 'Закупка: демонтаж офисных помещений');
  assert.equal(order.source_url, 'https://tenders.example.ru/order/42');
  assert.match(order.snippet, /заказчик ищет подрядчика/i);
  assert.equal(order.relevance, 'potential_order');
});

test('rejects incomplete Brave results instead of creating empty order cards', () => {
  assert.equal(normalizeBraveOrderResult({ source_url: 'https://example.ru', snippet: 'Демонтаж' }), null);
  assert.equal(normalizeBraveOrderResult({ company_name: 'Заказ', snippet: 'Демонтаж' }), null);
});


test('protects manually reviewed statuses while allowing ordinary records to refresh', () => {
  assert.equal(orderRefreshAction(undefined), 'insert');
  assert.equal(orderRefreshAction('new'), 'update');
  assert.equal(orderRefreshAction('opened'), 'update');
  assert.equal(orderRefreshAction('relevant'), 'protect');
  assert.equal(orderRefreshAction('rejected'), 'protect');
});


test('does not classify unrelated tenders as potential orders without matching service evidence', () => {
  const order = normalizeOrderResult({
    title: 'Тендер на поставку офисной мебели',
    url: 'https://example.ru/tender/123',
    description: 'Открытая закупка для коммерческого объекта'
  }, 'тендер демонтаж', 'demolition', 'Москва');
  assert.equal(order.relevance, 'review');
});

test('requires matching service evidence and recognizes raised-floor procurement', () => {
  const order = normalizeOrderResult({
    title: 'Закупка на монтаж фальшпола',
    url: 'https://example.ru/tender/floor',
    description: 'Заказчик проводит тендер на устройство технического пола'
  }, 'тендер фальшпол', 'raised_floor', 'Москва');
  assert.equal(order.relevance, 'potential_order');
  assert.ok(order.signal_labels.includes('Фальшполы'));
});


test('removes common tracking parameters when normalizing order URLs', () => {
  const plain = normalizeOrderResult({ title: 'Тендер на демонтаж офиса', url: 'https://example.ru/tender/5?utm_source=mail&fbclid=abc' }, 'тендер демонтаж', 'demolition', 'Москва');
  const clean = normalizeOrderResult({ title: 'Тендер на демонтаж офиса', url: 'https://example.ru/tender/5' }, 'тендер демонтаж', 'demolition', 'Москва');
  assert.equal(plain.source_url, clean.source_url);
  assert.equal(plain.source_url, 'https://example.ru/tender/5');
});

test('builds service-specific procurement queries for all three services', () => {
  assert.ok(buildOrderQueries('demolition').some(q => /работ по демонтажу/i.test(q)));
  assert.ok(buildOrderQueries('finishing').some(q => /отделочных работ/i.test(q)));
  assert.ok(buildOrderQueries('raised_floor').some(q => /фальшпола/i.test(q)));
});

test('builds source-specific queries for Telegram, Avito and tenders', () => {
  assert.ok(buildOrderQueries('demolition', 'Москва', 'telegram').every(q => /t\.me|telegram\.me/i.test(q)));
  assert.ok(buildOrderQueries('finishing', 'Москва', 'avito').every(q => /avito\.ru/i.test(q)));
  assert.ok(buildOrderQueries('raised_floor', 'Москва', 'tenders').some(q => /zakupki\.gov\.ru/i.test(q)));
});

test('classifies original source domains without trusting search query text', () => {
  assert.equal(classifyOrderSource('https://t.me/public_channel/123'), 'telegram');
  assert.equal(classifyOrderSource('https://www.avito.ru/moskva/item'), 'avito');
  assert.equal(classifyOrderSource('https://zakupki.gov.ru/epz/order/1'), 'tenders');
  assert.equal(classifyOrderSource('https://example.ru/order'), 'web');
});

test('builds manual search links without requiring an API key', () => {
  const url = buildManualOrderSearchUrl('demolition', 'Москва и МО', 'avito');
  assert.match(url, /^https:\/\/yandex\.ru\/search\/\?text=/);
  assert.match(decodeURIComponent(url), /site:avito\.ru/);
  assert.match(decodeURIComponent(url), /Москва и МО/);
});
