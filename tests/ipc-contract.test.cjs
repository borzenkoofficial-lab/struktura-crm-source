'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const preload = fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');

function uniqueMatches(source, pattern) {
  return [...source.matchAll(pattern)].map(match => match[1]);
}

test('every exposed CRM IPC bridge call has a matching main-process handler', () => {
  const exposedChannels = uniqueMatches(preload, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g);
  const registeredChannels = uniqueMatches(main, /ipcMain\.handle\(['"]([^'"]+)['"]/g);

  assert.ok(exposedChannels.length > 0, 'preload must expose at least one IPC method');
  assert.equal(new Set(exposedChannels).size, exposedChannels.length, 'preload must not expose duplicate IPC channels');
  assert.equal(new Set(registeredChannels).size, registeredChannels.length, 'main process must not register duplicate IPC handlers');

  const handlerSet = new Set(registeredChannels);
  const missingHandlers = exposedChannels.filter(channel => !handlerSet.has(channel));
  assert.deepEqual(missingHandlers, [], 'every preload invoke channel must be registered in main.cjs');

  const bridgeSet = new Set(exposedChannels);
  const unexposedHandlers = registeredChannels.filter(channel => !bridgeSet.has(channel));
  assert.deepEqual(unexposedHandlers, [], 'every registered application IPC handler should be intentionally exposed through preload');
});

test('IPC channel contract includes critical data safety and production workflows', () => {
  const exposedChannels = new Set(uniqueMatches(preload, /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g));
  for (const channel of [
    'backup:create',
    'backup:restore',
    'data:exportCsv',
    'projects:create',
    'projects:update',
    'production:saveShift',
    'production:updateShift',
    'estimate:exportQuotePdf',
    'orders:convertLead',
    'prospects:convertLead',
    'security:pinVerify'
  ]) {
    assert.ok(exposedChannels.has(channel), 'missing critical bridge channel: ' + channel);
  }
});
