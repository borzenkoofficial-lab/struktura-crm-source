'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDeviceId,
  parseWindowsMachineGuid,
  readWindowsMachineGuid
} = require('../src/license-device.cjs');

test('device ID is a deterministic 64-character SHA-256 hash of the Windows MachineGuid', () => {
  const first = createDeviceId('  A1B2-C3D4-E5F6  ');
  const second = createDeviceId('a1b2-c3d4-e5f6');
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, 'a1b2-c3d4-e5f6');
});

test('device ID rejects missing or implausible machine identifiers', () => {
  for (const value of ['', '   ', null, 'x', 'a'.repeat(300)]) {
    assert.throws(() => createDeviceId(value), /идентификатор компьютера/i);
  }
});

test('registry output parser extracts MachineGuid from REG_SZ output', () => {
  const output = [
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography',
    '    MachineGuid    REG_SZ    12345678-90ab-cdef-1234-567890abcdef'
  ].join('\n');
  assert.equal(parseWindowsMachineGuid(output), '12345678-90ab-cdef-1234-567890abcdef');
});

test('registry reader uses the Windows MachineGuid registry value', () => {
  let call;
  const value = readWindowsMachineGuid((command, args, options) => {
    call = { command, args, options };
    return '    MachineGuid    REG_SZ    12345678-90ab-cdef-1234-567890abcdef';
  }, 'win32');
  assert.equal(value, '12345678-90ab-cdef-1234-567890abcdef');
  assert.equal(call.command, 'reg.exe');
  assert.deepEqual(call.args, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid']);
  assert.equal(call.options.encoding, 'utf8');
});

test('registry reader refuses unsupported operating systems', () => {
  assert.throws(() => readWindowsMachineGuid(() => '', 'linux'), /только на Windows/i);
});
