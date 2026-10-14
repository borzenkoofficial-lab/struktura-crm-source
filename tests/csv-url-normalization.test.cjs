'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, prospectDuplicateKeys } = require('../src/csv.cjs');

test('URL normalization lowercases host but preserves case-sensitive path and query values', () => {
  assert.equal(normalizeUrl('HTTPS://WWW.Example.COM/About/'), 'https://example.com/About');
  assert.equal(normalizeUrl('https://example.com/About'), 'https://example.com/About');
  assert.equal(normalizeUrl('https://example.com/about'), 'https://example.com/about');
  assert.notEqual(normalizeUrl('https://example.com/About'), normalizeUrl('https://example.com/about'));
  assert.notEqual(normalizeUrl('https://example.com/?Section=About'), normalizeUrl('https://example.com/?section=about'));
});

test('prospect duplicate keys do not merge distinct case-sensitive website paths', () => {
  const about = prospectDuplicateKeys({ company_name: 'Example', region: 'Москва', website: 'https://example.com/About' });
  const lower = prospectDuplicateKeys({ company_name: 'Example', region: 'Москва', website: 'https://example.com/about' });
  assert.ok(about.includes('website:https://example.com/About'));
  assert.ok(lower.includes('website:https://example.com/about'));
  assert.notEqual(about.find(key => key.startsWith('website:')), lower.find(key => key.startsWith('website:')));
});
