'use strict';

const { sign, verify } = require('node:crypto');
const { normalizeFeatureIds } = require('./license-catalog.cjs');

const TOKEN_PREFIX = 'SKOL1';
const MAX_TOKEN_LENGTH = 2048;
const EDITION_FEATURES = Object.freeze({
  START: Object.freeze([]),
  PRO: Object.freeze(['engineering', 'finance', 'production', 'reports']),
  BUSINESS: Object.freeze([
    'advanced_analytics',
    'engineering',
    'engineering_plans',
    'finance',
    'order_radar',
    'production',
    'reports',
    'web_browser'
  ])
});

function getFeaturesForEdition(edition) {
  const features = EDITION_FEATURES[String(edition || '').toUpperCase()];
  if (!features) throw new Error('Неизвестный тариф лицензии.');
  return [...features];
}

function normalizeLicenseToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, '').replace(/^skol1\./i, 'SKOL1.');
}

function parseIsoTimestamp(value, fieldName, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error(`Некорректное поле лицензии: ${fieldName}.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Некорректное поле лицензии: ${fieldName}.`);
  return new Date(parsed).toISOString();
}

function normalizeLegacyPayload(input) {
  const allowedKeys = new Set(['v', 'product', 'licenseId', 'edition', 'features', 'deviceId', 'issuedAt', 'expiresAt', 'updatesUntil', 'seatIndex', 'seatCount']);
  if (Object.keys(input).some(key => !allowedKeys.has(key))) throw new Error('Лицензия содержит неизвестные поля.');
  if (input.product !== 'SKOL_CRM') throw new Error('Лицензия предназначена для другого продукта.');
  const edition = String(input.edition || '').toUpperCase();
  const expectedFeatures = getFeaturesForEdition(edition);
  if (!Array.isArray(input.features)) throw new Error('Некорректный список разрешений лицензии.');
  const features = [...input.features].map(value => String(value)).sort();
  if (new Set(features).size !== features.length || JSON.stringify(features) !== JSON.stringify(expectedFeatures)) {
    throw new Error('Список разрешений не соответствует выбранному тарифу.');
  }
  const licenseId = normalizeLicenseId(input.licenseId);
  const deviceId = normalizeDeviceId(input.deviceId);
  const issuedAt = parseIsoTimestamp(input.issuedAt, 'issuedAt');
  const expiresAt = parseIsoTimestamp(input.expiresAt, 'expiresAt', { nullable: true });
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error('Срок действия лицензии указан некорректно.');
  const updatesUntil = normalizeUpdatesUntil(input.updatesUntil);
  const { seatIndex, seatCount } = normalizeSeats(input.seatIndex, input.seatCount);
  return { v: 1, product: 'SKOL_CRM', licenseId, edition, features, deviceId, issuedAt, expiresAt, updatesUntil, seatIndex, seatCount };
}

function normalizeCustomPayload(input) {
  const allowedKeys = new Set(['v', 'product', 'licenseId', 'planId', 'planName', 'features', 'deviceId', 'issuedAt', 'expiresAt', 'updatesUntil', 'seatIndex', 'seatCount']);
  if (Object.keys(input).some(key => !allowedKeys.has(key))) throw new Error('Лицензия содержит неизвестные поля.');
  if (input.product !== 'SKOL_CRM') throw new Error('Лицензия предназначена для другого продукта.');
  const planId = String(input.planId || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(planId)) throw new Error('Некорректный ID тарифа.');
  const planName = String(input.planName || '').trim();
  if (!planName || planName.length > 80) throw new Error('Некорректное название тарифа.');
  const features = normalizeFeatureIds(input.features);
  const licenseId = normalizeLicenseId(input.licenseId);
  const deviceId = normalizeDeviceId(input.deviceId);
  const issuedAt = parseIsoTimestamp(input.issuedAt, 'issuedAt');
  const expiresAt = parseIsoTimestamp(input.expiresAt, 'expiresAt', { nullable: true });
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error('Срок действия лицензии указан некорректно.');
  const updatesUntil = normalizeUpdatesUntil(input.updatesUntil);
  const { seatIndex, seatCount } = normalizeSeats(input.seatIndex, input.seatCount);
  return { v: 2, product: 'SKOL_CRM', licenseId, planId, planName, features, deviceId, issuedAt, expiresAt, updatesUntil, seatIndex, seatCount };
}

function normalizeLicenseId(value) {
  const licenseId = String(value || '');
  if (!/^[A-Z0-9-]{8,64}$/.test(licenseId)) throw new Error('Некорректный номер лицензии.');
  return licenseId;
}

function normalizeDeviceId(value) {
  const deviceId = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(deviceId)) throw new Error('Некорректный идентификатор устройства.');
  return deviceId;
}

function normalizeUpdatesUntil(value) {
  if (value === null) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value) return value;
  throw new Error('Некорректный срок обновлений лицензии.');
}

function normalizeSeats(seatIndexValue, seatCountValue) {
  const seatCount = Number(seatCountValue);
  const seatIndex = Number(seatIndexValue);
  if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 50 || !Number.isInteger(seatIndex) || seatIndex < 1 || seatIndex > seatCount) {
    throw new Error('Некорректное количество устройств в лицензии.');
  }
  return { seatIndex, seatCount };
}

function normalizePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректные данные лицензии.');
  if (input.v === 1) return normalizeLegacyPayload(input);
  if (input.v === 2) return normalizeCustomPayload(input);
  throw new Error('Неподдерживаемая версия лицензии.');
}
function createLicenseToken(payload, privateKeyPem) {
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) throw new Error('Не найден закрытый ключ подписи лицензий.');
  const normalized = normalizePayload(payload);
  const payloadPart = Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64url');
  const signature = sign(null, Buffer.from(payloadPart, 'utf8'), privateKeyPem).toString('base64url');
  return `${TOKEN_PREFIX}.${payloadPart}.${signature}`;
}

function verifyLicenseToken(value, publicKeyPem, expectedDeviceId, nowMs = Date.now()) {
  const token = normalizeLicenseToken(value);
  if (!token || token.length > MAX_TOKEN_LENGTH) return { valid: false, license: null, reason: 'invalid_format' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) {
    return { valid: false, license: null, reason: 'invalid_format' };
  }
  try {
    const signature = Buffer.from(parts[2], 'base64url');
    if (signature.length !== 64 || !publicKeyPem || !verify(null, Buffer.from(parts[1], 'utf8'), publicKeyPem, signature)) {
      return { valid: false, license: null, reason: 'invalid_signature' };
    }
  } catch {
    return { valid: false, license: null, reason: 'invalid_signature' };
  }
  let license;
  try {
    const payloadText = Buffer.from(parts[1], 'base64url').toString('utf8');
    license = normalizePayload(JSON.parse(payloadText));
  } catch {
    return { valid: false, license: null, reason: 'invalid_payload' };
  }
  if (typeof expectedDeviceId !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDeviceId) || license.deviceId !== expectedDeviceId.toLowerCase()) {
    return { valid: false, license: null, reason: 'wrong_device' };
  }
  if (!Number.isFinite(nowMs)) return { valid: false, license: null, reason: 'invalid_clock' };
  if (license.expiresAt && nowMs > Date.parse(license.expiresAt)) {
    return { valid: false, license: null, reason: 'expired' };
  }
  return { valid: true, license, reason: null };
}

module.exports = {
  TOKEN_PREFIX,
  EDITION_FEATURES,
  createLicenseToken,
  verifyLicenseToken,
  getFeaturesForEdition,
  normalizeLicenseToken
};
