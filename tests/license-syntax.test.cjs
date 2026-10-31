'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const files = [
  'src/main.cjs',
  'src/preload.cjs',
  'src/renderer.js',
  'src/license-core.cjs',
  'src/license-device.cjs',
  'src/license-service.cjs',
  'tools/license-generator.cjs',
  'tools/license-manager/main.cjs',
  'tools/license-manager/preload.cjs',
  'tools/license-manager/renderer.js'
];

test('all modified Electron and licensing JavaScript entrypoints parse under Node.js', () => {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file} syntax check failed:\n${result.stderr}`);
  }
});
