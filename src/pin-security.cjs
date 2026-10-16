'use strict';

const crypto = require('node:crypto');

function normalizePin(value) {
  const pin = String(value ?? '');
  if (!/^\\d{4,12}$/.test(pin)) throw new Error('PIN должен содержать от 4 до 12 цифр.');
  return pin;
}

function createPinConfig(value, updatedAt = new Date().toISOString()) {
  const pin = normalizePin(value);
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(pin, salt, 64).toString('hex'), updatedAt };
}

function pinMatches(value, config) {
  if (!config || typeof config.salt !== 'string' || typeof config.hash !== 'string' || !/^\\d{4,12}$/.test(String(value ?? ''))) return false;
  try {
    const actual = Buffer.from(crypto.scryptSync(String(value), config.salt, 64).toString('hex'), 'hex');
    const expected = Buffer.from(config.hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function evaluatePinAttempt(value, config, failures = {}, now = Date.now()) {
  if (!config || !config.hash) {
    return { result: { ok: true, enabled: false, remainingAttempts: 5, lockedForMs: 0 }, failures: { count: 0, lockedUntil: 0 } };
  }
  const countSoFar = Math.min(5, Math.max(0, Number(failures.count) || 0));
  const lockedUntil = Math.max(0, Number(failures.lockedUntil) || 0);
  if (lockedUntil > now) {
    return { result: { ok: false, enabled: true, remainingAttempts: 0, lockedForMs: lockedUntil - now }, failures: { count: countSoFar, lockedUntil } };
  }
  if (pinMatches(value, config)) {
    return { result: { ok: true, enabled: true, remainingAttempts: 5, lockedForMs: 0 }, failures: { count: 0, lockedUntil: 0 } };
  }
  const nextCount = countSoFar + 1;
  const nextLockedUntil = nextCount >= 5 ? now + 30000 : 0;
  return {
    result: { ok: false, enabled: true, remainingAttempts: nextLockedUntil ? 0 : 5 - nextCount, lockedForMs: nextLockedUntil ? 30000 : 0 },
    failures: { count: nextLockedUntil ? 0 : nextCount, lockedUntil: nextLockedUntil }
  };
}

module.exports = { normalizePin, createPinConfig, pinMatches, evaluatePinAttempt };
