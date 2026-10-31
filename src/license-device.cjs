'use strict';

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function normalizeMachineGuid(value) {
  if (typeof value !== 'string') throw new Error('Не удалось прочитать идентификатор компьютера Windows.');
  const normalized = value.trim().replace(/^\{(.+)\}$/, '$1').toLowerCase();
  if (normalized.length < 8 || normalized.length > 128 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('Некорректный идентификатор компьютера Windows.');
  }
  return normalized;
}

function createDeviceId(machineGuid) {
  const normalized = normalizeMachineGuid(machineGuid);
  return createHash('sha256').update(`SKOL_CRM_DEVICE_V1:${normalized}`, 'utf8').digest('hex');
}

function parseWindowsMachineGuid(output) {
  if (typeof output !== 'string') throw new Error('Windows не вернула идентификатор компьютера.');
  const match = output.match(/^\s*MachineGuid\s+REG_SZ\s+(.+?)\s*$/im);
  if (!match) throw new Error('В реестре Windows не найден MachineGuid.');
  return normalizeMachineGuid(match[1]);
}

function readWindowsMachineGuid(execFileSyncImpl = execFileSync, platform = process.platform) {
  if (platform !== 'win32') throw new Error('Получение идентификатора лицензии поддерживается только на Windows.');
  let output;
  try {
    output = execFileSyncImpl('reg.exe', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid'
    ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    throw new Error('Не удалось прочитать MachineGuid из реестра Windows.');
  }
  return parseWindowsMachineGuid(output);
}

function getDeviceId(execFileSyncImpl = execFileSync, platform = process.platform) {
  return createDeviceId(readWindowsMachineGuid(execFileSyncImpl, platform));
}

module.exports = {
  normalizeMachineGuid,
  createDeviceId,
  parseWindowsMachineGuid,
  readWindowsMachineGuid,
  getDeviceId
};
