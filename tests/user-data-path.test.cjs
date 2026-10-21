'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { findLegacyUserDataPath } = require('../src/user-data-path.cjs');

const appDataPath = path.join('C:', 'Users', 'Test', 'AppData', 'Roaming');
const currentPath = path.join(appDataPath, 'СКОЛ');
const candidates = ['Struktura CRM', 'struktura-crm', 'struktura-crm-source'];
const dbFile = 'struktura-crm.sqlite';

function existsFrom(paths) {
  const set = new Set(paths);
  return candidate => set.has(candidate);
}

test('data path selection keeps the current profile when it already has the application database', () => {
  const currentDatabase = path.join(currentPath, dbFile);
  const legacyDatabase = path.join(appDataPath, 'Struktura CRM', dbFile);
  assert.equal(findLegacyUserDataPath({
    appDataPath, currentUserDataPath: currentPath,
    legacyDataCandidates: candidates,
    existsSync: existsFrom([currentDatabase, legacyDatabase])
  }), null);
});

test('data path selection falls back to an existing legacy profile only when the current profile is empty', () => {
  const legacyPath = path.join(appDataPath, 'Struktura CRM');
  assert.equal(findLegacyUserDataPath({
    appDataPath, currentUserDataPath: currentPath,
    legacyDataCandidates: candidates,
    existsSync: existsFrom([path.join(legacyPath, dbFile)])
  }), legacyPath);
});

test('data path selection ignores legacy folders without the CRM database file', () => {
  assert.equal(findLegacyUserDataPath({
    appDataPath, currentUserDataPath: currentPath,
    legacyDataCandidates: candidates,
    existsSync: existsFrom([path.join(appDataPath, 'Struktura CRM', 'unrelated.sqlite')])
  }), null);
});
