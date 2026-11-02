'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEisSearchResults, normalizeEisResult, searchEisProcurements } = require('../src/eis-search.cjs');

const card = (number = '0123456789012345678', title = 'Выполнение работ по демонтажу нежилого здания') => `
<div class="registry-entry__form">
  <div class="registry-entry__header-mid__number">Извещение № ${number}</div>
  <div class="registry-entry__header-mid__title">
    <a href="/epz/order/notice/ea20/view/common-info.html?regNumber=${number}">${title}</a>
  </div>
  <div class="registry-entry__body-value">Начальная цена: 1 250 000 руб. Заказчик ищет подрядчика.</div>
</div>`;

test('parses EIS procurement cards and preserves registry number and evidence URL', () => {
  const rows = parseEisSearchResults(card(), 'демонтаж Москва');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].registryNumber, '0123456789012345678');
  assert.equal(rows[0].title, 'Выполнение работ по демонтажу нежилого здания');
  assert.equal(rows[0].url, 'https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=0123456789012345678');
  assert.match(rows[0].snippet, /Начальная цена/);
  assert.equal(rows[0].source, 'eis');
});

test('extracts the procurement object from the real EIS body-value field', () => {
  const number = '0777700000126000001';
  const html = `<div class="row no-gutters registry-entry__form mr-0">
    <div class="registry-entry__header-mid__number"><a href="/epz/order/notice/ea20/view/common-info.html?regNumber=${number}">Извещение № ${number}</a></div>
    <div class="registry-entry__body-block"><div class="registry-entry__body-value">Выполнение работ по демонтажу и ремонту помещений</div></div>
    <div class="price-block__value">1 250 000 руб.</div>
  </div>`;
  const rows = parseEisSearchResults(html, 'демонтаж Москва');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Выполнение работ по демонтажу и ремонту помещений');
  assert.equal(rows[0].registryNumber, number);
});

test('normalizes only safe official EIS URLs and rejects external or malformed records', () => {
  assert.equal(normalizeEisResult({ title: 'Закупка', url: 'https://evil.example/epz/order?regNumber=123' }, 'x'), null);
  assert.equal(normalizeEisResult({ title: 'Закупка', url: 'javascript:alert(1)' }, 'x'), null);
  assert.equal(normalizeEisResult({ title: '', url: 'https://zakupki.gov.ru/epz/order/notice/common-info.html?regNumber=123' }, 'x'), null);
  const row = normalizeEisResult({ title: '  Закупка   демонтажа ', url: 'https://zakupki.gov.ru/epz/order/notice/common-info.html?regNumber=123#top' }, 'демонтаж');
  assert.equal(row.title, 'Закупка демонтажа');
  assert.equal(row.url, 'https://zakupki.gov.ru/epz/order/notice/common-info.html?regNumber=123');
  assert.equal(row.registryNumber, '123');
});

test('deduplicates repeated EIS registry entries', () => {
  const rows = parseEisSearchResults(card() + card(), 'демонтаж');
  assert.equal(rows.length, 1);
});

test('returns an explicit empty state for a valid empty result page', () => {
  assert.deepEqual(parseEisSearchResults('<html><body>По вашему запросу ничего не найдено</body></html>', 'демонтаж'), []);
});

test('reports EIS access denial instead of pretending the source is connected', async () => {
  const report = await searchEisProcurements('демонтаж', {
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => '' }),
    timeoutMs: 100
  });
  assert.equal(report.status, 'blocked');
  assert.equal(report.results.length, 0);
  assert.match(report.error, /403/);
});

test('returns parsed results from the public EIS search page', async () => {
  let requested;
  const report = await searchEisProcurements('демонтаж Москва', {
    fetchImpl: async (url) => {
      requested = new URL(url);
      return { ok: true, status: 200, text: async () => card() };
    },
    timeoutMs: 100
  });
  assert.equal(requested.hostname, 'zakupki.gov.ru');
  assert.equal(requested.searchParams.get('searchString'), 'демонтаж Москва');
  assert.equal(requested.searchParams.get('fz44'), 'on');
  assert.equal(requested.searchParams.get('fz223'), 'on');
  assert.equal(requested.searchParams.get('recordsPerPage'), '_50');
  assert.equal(report.status, 'ok');
  assert.equal(report.results.length, 1);
});
