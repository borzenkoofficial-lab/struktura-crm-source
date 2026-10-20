'use strict';

const fs = require('node:fs');

function removeSqliteSidecars(databasePath, fileSystem = fs) {
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = databasePath + suffix;
    if (fileSystem.existsSync(sidecar)) fileSystem.rmSync(sidecar, { force: true });
  }
}

module.exports = { removeSqliteSidecars };
