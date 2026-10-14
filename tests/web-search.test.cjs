'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildQueries, normalizeResult, searchBrave } = require('../src/web-search.cjs');

test('builds three service-specific queries with region', () => {
  const queries = buildQueries('demolition', 'Москва и МО');
  assert.equal(queries.length, 3);
  assert.ok(queries.every(q => q.includes('Москва и МО')));
  assert.ok(queries[0].includes('демонтаж'));
});

test('normalizes only valid public web result URLs and strips fragments', () => {
  const result = normalizeResult({ title: 'Компания | Официальный сайт', url: 'https://example.ru/about#contacts', description: 'Подрядчик' });
  assert.equal(result.company_name, 'Компания');
  assert.equal(result.website, 'https://example.ru/');
  assert.equal(result.source_url, 'https://example.ru/about');
  assert.equal(normalizeResult({ title: 'bad', url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeResult({ title: 'bad', url: 'https://user:pass@example.ru' }), null);
});

test('calls Brave API with token header and normalizes results', async () => {
  let requestedUrl, requestedHeaders;
  const fetchImpl = async (url, options) => {
    requestedUrl = new URL(url); requestedHeaders = options.headers;
    return { ok: true, status: 200, json: async () => ({ web: { results: [{ title: 'ООО Пример', url: 'https://example.ru', description: 'Демонтаж офисов' }] } }) };
  };
  const results = await searchBrave('демонтаж Москва', 'secret-test-key-123', { fetchImpl });
  assert.equal(requestedUrl.hostname, 'api.search.brave.com');
  assert.equal(requestedUrl.searchParams.get('q'), 'демонтаж Москва');
  assert.equal(requestedHeaders['X-Subscription-Token'], 'secret-test-key-123');
  assert.equal(results.length, 1);
  assert.equal(results[0].company_name, 'ООО Пример');
});

test('reports invalid API key, rate limits, and HTTP failures clearly', async () => {
  await assert.rejects(() => searchBrave('query', ''), /API-ключ/);
  await assert.rejects(() => searchBrave('query', 'secret-key-123', { fetchImpl: async () => ({ ok: false, status: 429 }) }), /ограничил частоту/);
  await assert.rejects(() => searchBrave('query', 'secret-key-123', { fetchImpl: async () => ({ ok: false, status: 401 }) }), /отклонил ключ/);
});
