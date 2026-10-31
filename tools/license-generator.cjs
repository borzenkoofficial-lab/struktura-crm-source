'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { createLicenseToken, getFeaturesForEdition } = require('../src/license-core.cjs');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Неизвестный аргумент: ${item}`);
    const name = item.slice(2);
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
    '  --license-id <общий номер покупки; нужен одинаковый для всех ПК одной покупки>',
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`Параметр --${name} должен иметь формат YYYY-MM-DD.`);
  }
  return `${value}T23:59:59.999Z`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(usage()); return; }
  const edition = String(args.edition || '').toUpperCase();
  const features = getFeaturesForEdition(edition);
  const deviceId = String(args['device-id'] || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(deviceId)) throw new Error('Укажи корректный Device ID из окна активации СКОЛ.');
  const privateKeyPath = args['private-key'] ? path.resolve(args['private-key']) : '';
  if (!privateKeyPath || !fs.existsSync(privateKeyPath)) throw new Error('Не найден закрытый PEM-ключ. Укажи путь через --private-key.');
  const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  const seatIndex = Number(args['seat-index'] || 1);
  const seatCount = Number(args['seat-count'] || 1);
  const licenseId = String(args['license-id'] || `SKOL-${randomBytes(6).toString('hex').toUpperCase()}`);
  const expiresAt = parseDateEnd(args['expires-at'], 'expires-at');
  const updatesUntil = args['updates-until'] || null;
  if (updatesUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(updatesUntil) || !Number.isFinite(Date.parse(`${updatesUntil}T00:00:00.000Z`)))) {
    throw new Error('Параметр --updates-until должен иметь формат YYYY-MM-DD.');
  }
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
  const token = createLicenseToken(payload, privateKeyPem);
  console.log('Лицензионный ключ СКОЛ CRM:');
  console.log(token);
  console.log('');
  console.log(`Тариф: ${edition} · Место ${seatIndex}/${seatCount} · Лицензия: ${licenseId}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(`Ошибка генерации лицензии: ${error.message}`); process.exitCode = 1; }
}

module.exports = { parseArgs, parseDateEnd, main, usage };
