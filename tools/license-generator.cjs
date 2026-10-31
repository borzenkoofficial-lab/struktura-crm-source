'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createLicenseToken, getFeaturesForEdition } = require('../src/license-core.cjs');

const ALLOWED_ARGUMENTS = new Set([
  'help', 'edition', 'device-id', 'private-key', 'license-id',
  'seat-index', 'seat-count', 'updates-until', 'expires-at'
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Неизвестный аргумент: ${item}`);
    const name = item.slice(2);
    if (!ALLOWED_ARGUMENTS.has(name)) throw new Error(`Неизвестный параметр: --${name}`);
    if (name === 'help') { args.help = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Для --${name} нужно указать значение.`);
    args[name] = value;
    index++;
  }
  return args;
}

function usage() {
  return [
    'Генератор офлайн-лицензий СКОЛ CRM',
    '',
    'Обязательные параметры:',
    '  --edition START|PRO|BUSINESS',
    '  --device-id <64-символьный Device ID из окна активации>',
    '  --private-key <путь к закрытому PEM-ключу>',
    '',
    'Дополнительные параметры:',
    '  --license-id <общий номер покупки; одинаковый для всех ПК одной покупки>',
    '  --seat-index <номер места, начиная с 1> (по умолчанию 1)',
    '  --seat-count <общее число мест> (по умолчанию 1)',
    '  --updates-until YYYY-MM-DD',
    '  --expires-at YYYY-MM-DD (не задавать для бессрочной лицензии)',
    '',
    'Пример:',
    '  node tools/license-generator.cjs --edition PRO --device-id <DEVICE_ID> --private-key ./license-keys/skol-license-private.pem --updates-until 2027-10-31'
  ].join('\n');
}

function parseDateEnd(value, name) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Параметр --${name} должен иметь формат YYYY-MM-DD.`);
  const date = new Date(`${value}T23:59:59.999Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Параметр --${name} содержит некорректную дату.`);
  }
  return date.toISOString();
}

function parseDateOnly(value, name) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Параметр --${name} должен иметь формат YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Параметр --${name} содержит некорректную дату.`);
  }
  return value;
}

function parseInteger(value, fallback, name) {
  const result = Number(value ?? fallback);
  if (!Number.isSafeInteger(result) || result < 1 || result > 50) {
    throw new Error(`Параметр --${name} должен быть целым числом от 1 до 50.`);
  }
  return result;
}

function generateLicense(args) {
  const edition = String(args.edition || '').toUpperCase();
  const features = getFeaturesForEdition(edition);
  const deviceId = String(args['device-id'] || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(deviceId)) throw new Error('Укажи корректный Device ID из окна активации СКОЛ.');
  const privateKeyPath = args['private-key'] ? path.resolve(args['private-key']) : '';
  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) throw new Error('Не найден закрытый PEM-ключ. Укажи путь через --private-key.');
  const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  const seatIndex = parseInteger(args['seat-index'], 1, 'seat-index');
  const seatCount = parseInteger(args['seat-count'], 1, 'seat-count');
  if (seatIndex > seatCount) throw new Error('--seat-index не может быть больше --seat-count.');
  const licenseId = String(args['license-id'] || `SKOL-${randomBytes(12).toString('hex').toUpperCase()}`).toUpperCase();
  const expiresAt = parseDateEnd(args['expires-at'], 'expires-at');
  const updatesUntil = parseDateOnly(args['updates-until'], 'updates-until');
  const payload = {
    v: 1,
    product: 'SKOL_CRM',
    licenseId,
    edition,
    features,
    deviceId,
    issuedAt: new Date().toISOString(),
    expiresAt,
    updatesUntil,
    seatIndex,
    seatCount
  };
  return { token: createLicenseToken(payload, privateKeyPem), payload };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(usage()); return null; }
  const { token, payload } = generateLicense(args);
  console.log('Лицензионный ключ СКОЛ CRM:');
  console.log(token);
  console.log('');
  console.log(`Тариф: ${payload.edition} · Место ${payload.seatIndex}/${payload.seatCount} · Лицензия: ${payload.licenseId}`);
  return { token, payload };
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`Ошибка генерации лицензии: ${error.message}`); process.exitCode = 1; }
}

module.exports = { parseArgs, parseDateEnd, parseDateOnly, parseInteger, generateLicense, main, usage };
