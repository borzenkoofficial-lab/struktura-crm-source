'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBrowserInput, validateBrowserNavigation, companyNameFromPage } = require('../src/browser-utils.cjs');

test('browser resolves a normal domain to HTTPS', () => {
  assert.equal(resolveBrowserInput('example.com'), 'https://example.com/');
});

test('browser turns a phrase into a Yandex search query', () => {
  const url = new URL(resolveBrowserInput('генподрядчики Москва'));
  assert.equal(url.origin, 'https://yandex.ru');
  assert.equal(url.pathname, '/search/');
  assert.equal(url.searchParams.get('text'), 'генподрядчики Москва');
});

test('browser rejects credential-bearing URLs', () => {
  assert.throws(() => validateBrowserNavigation('https://user:pass@example.com'), /HTTP\/HTTPS/);
});

test('browser rejects non-web protocols', () => {
  assert.throws(() => validateBrowserNavigation('file:///etc/passwd'), /HTTP\/HTTPS/);
});

test('company name prefers page title and strips a site suffix', () => {
  assert.equal(companyNameFromPage('Строительная компания Альфа — Официальный сайт', 'www.alpha.ru'), 'Строительная компания Альфа');
  assert.equal(companyNameFromPage('', 'www.alpha.ru'), 'alpha.ru');
});
