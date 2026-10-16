const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeContactEmail, normalizePhone } = require('../src/contact-utils.cjs');

test('contact email is optional, trimmed and normalized to lowercase', () => {
  assert.equal(normalizeContactEmail(''), '');
  assert.equal(normalizeContactEmail('  Sales@Example.COM  '), 'sales@example.com');
});

test('contact email rejects malformed addresses and accepts ordinary international domains', () => {
  for (const email of ['name', 'name@', '@example.com', 'name@example', 'two@@example.com', 'name @example.com', 'name@example.com extra', 'a'.repeat(181) + '@example.com']) {
    assert.throws(() => normalizeContactEmail(email), /Проверь email/);
  }
  assert.equal(normalizeContactEmail('office@example.co.uk'), 'office@example.co.uk');
});

test('Russian phone numbers normalize to one canonical key', () => {
  assert.equal(normalizePhone('+7 (999) 123-45-67'), '79991234567');
  assert.equal(normalizePhone('8 999 123 45 67'), '79991234567');
  assert.equal(normalizePhone('9991234567'), '79991234567');
  assert.equal(normalizePhone(''), '');
});
