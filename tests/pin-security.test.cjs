'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePin, createPinConfig, pinMatches, evaluatePinAttempt } = require('../src/pin-security.cjs');

test('PIN accepts 4–12 digits and rejects non-digits or invalid lengths', () => {
  assert.equal(normalizePin('1234'), '1234');
  assert.equal(normalizePin('123456789012'), '123456789012');
  for (const value of ['', '123', '1234567890123', '12a4', ' 1234', null]) {
    assert.throws(() => normalizePin(value), /4 до 12 цифр/);
  }
});

test('PIN config stores a salted scrypt hash rather than the original PIN', () => {
  const config = createPinConfig('4826', '2026-10-16T00:00:00.000Z');
  assert.equal(config.updatedAt, '2026-10-16T00:00:00.000Z');
  assert.notEqual(config.hash, '4826');
  assert.equal(config.salt.length, 32);
  assert.equal(config.hash.length, 128);
  assert.equal(pinMatches('4826', config), true);
  assert.equal(pinMatches('4827', config), false);
  assert.equal(pinMatches('abcd', config), false);
  assert.notDeepEqual(createPinConfig('4826').salt, config.salt);
});

test('PIN attempts count failures, lock for 30 seconds after five misses, and reset after success', () => {
  const config = createPinConfig('4826');
  let failures = { count: 0, lockedUntil: 0 };
  for (let i = 0; i < 4; i++) {
    const attempt = evaluatePinAttempt('0000', config, failures, 1000 + i);
    assert.equal(attempt.result.ok, false);
    assert.equal(attempt.result.remainingAttempts, 4 - i);
    failures = attempt.failures;
  }
  const fifth = evaluatePinAttempt('0000', config, failures, 2000);
  assert.equal(fifth.result.lockedForMs, 30000);
  failures = fifth.failures;
  const duringLock = evaluatePinAttempt('4826', config, failures, 2500);
  assert.equal(duringLock.result.ok, false);
  assert.ok(duringLock.result.lockedForMs > 0);
  const afterLock = evaluatePinAttempt('4826', config, failures, 32000);
  assert.equal(afterLock.result.ok, true);
  assert.deepEqual(afterLock.failures, { count: 0, lockedUntil: 0 });
});

test('PIN verification with no configured PIN does not block startup', () => {
  const result = evaluatePinAttempt('anything', null, { count: 3, lockedUntil: 0 }, 100);
  assert.equal(result.result.ok, true);
  assert.equal(result.result.enabled, false);
});
