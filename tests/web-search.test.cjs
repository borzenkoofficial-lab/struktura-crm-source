'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueries, normalizeResult } = require('../src/web-search.cjs');

test('builds service-specific query fallbacks with a sanitized region', () => {
  const queries = buildQueries('demolition', 'Москва и МО');
  assert.equal(queries.length, 3);
  assert.ok(queries.every(q => q.includes('Москва и МО')));
  assert.ok(queries[0].includes('демонтаж'));
  assert.ok(buildQueries('finishing', 'Казань')[0].includes('Казань'));
});
test('normalizes only valid public web result URLs and strips fragments', () => {
  const result = normalizeResult({ title: 'Компания | Официальный сайт', url: 'https://example.ru/about#contacts', description: 'Подрядчик' });
  assert.equal(result.company_name, 'Компания');
  assert.equal(result.website, 'https://example.ru/');
  assert.equal(result.source_url, 'https://example.ru/about');
  assert.equal(normalizeResult({ title: 'bad', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeResult({ title: 'bad', url: 'https://user:pass@example.ru' }), null);
});
