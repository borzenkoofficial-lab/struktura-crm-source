'use strict';

const path = require('node:path');

function findLegacyUserDataPath({
  appDataPath,
  currentUserDataPath,
  legacyDataCandidates = [],
  databaseFilename = 'struktura-crm.sqlite',
  existsSync = require('node:fs').existsSync
} = {}) {
  if (!appDataPath || !currentUserDataPath || typeof existsSync !== 'function') return null;

  // Never switch away from a populated current profile; this prevents split-brain data after rebranding.
  if (existsSync(path.join(currentUserDataPath, databaseFilename))) return null;

  if (!Array.isArray(legacyDataCandidates)) return null;
  return legacyDataCandidates
    .filter(name => typeof name === 'string' && name.trim())
    .map(name => path.join(appDataPath, name))
    .find(candidate => existsSync(path.join(candidate, databaseFilename))) || null;
}

module.exports = { findLegacyUserDataPath };
