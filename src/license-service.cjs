'use strict';

const { normalizeLicenseToken, verifyLicenseToken } = require('./license-core.cjs');

const FEATURE_CHANNELS = Object.freeze([
  [/^(finance|income|payments|expenses):/, 'finance'],
  [/^(production|pi):/, 'production'],
  [/^(engineering|estimate):/, 'engineering'],
  [/^engineeringPlans:/, 'engineering_plans'],
  [/^(orders|prospects|search):/, 'order_radar'],
  [/^browser:/, 'web_browser']
]);

const INVALID_MESSAGES = Object.freeze({
  invalid_format: 'Ключ имеет неверный формат.',
  invalid_signature: 'Ключ недействителен или повреждён.',
  invalid_payload: 'Данные лицензии повреждены.',
  wrong_device: 'Этот ключ выпущен для другого компьютера.',
  expired: 'Срок действия лицензии истёк.',
  invalid_clock: 'Не удалось проверить системное время.'
});

function featureForChannel(channel) {
  const name = String(channel || '');
  for (const [pattern, feature] of FEATURE_CHANNELS) {
    if (pattern.test(name)) return feature;
  }
  return null;
}

function publicLicenseSummary(license) {
  if (!license) return null;
  return {
    licenseId: license.licenseId,
    edition: license.edition,
    features: [...license.features],
    issuedAt: license.issuedAt,
    expiresAt: license.expiresAt,
    updatesUntil: license.updatesUntil,
    seatIndex: license.seatIndex,
    seatCount: license.seatCount
  };
}

function createLicenseService({ getSetting, setSetting, publicKeyPem, deviceId, now = () => Date.now() }) {
  if (typeof getSetting !== 'function' || typeof setSetting !== 'function') {
    throw new Error('Для службы лицензирования нужны функции чтения и записи настроек.');
  }

  function getStatus() {
    const token = getSetting('license_token_v1', null);
    if (!token) return { activated: false, reason: 'not_activated', deviceId, license: null };
    const result = verifyLicenseToken(token, publicKeyPem, deviceId, now());
    if (!result.valid) return { activated: false, reason: result.reason, deviceId, license: null };
    return { activated: true, reason: null, deviceId, license: publicLicenseSummary(result.license) };
  }

  function activate(value) {
    const token = normalizeLicenseToken(value);
    const result = verifyLicenseToken(token, publicKeyPem, deviceId, now());
    if (!result.valid) {
      throw new Error(INVALID_MESSAGES[result.reason] || 'Не удалось проверить лицензию.');
    }
    setSetting('license_token_v1', token);
    return getStatus();
  }

  return { getStatus, activate };
}

module.exports = { createLicenseService, featureForChannel, publicLicenseSummary, INVALID_MESSAGES };
