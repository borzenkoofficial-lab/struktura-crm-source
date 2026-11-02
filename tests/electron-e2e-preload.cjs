'use strict';

// This preload hook is activated only for the dedicated Windows Electron UI smoke test.
// It isolates all application data and substitutes a one-run verification public key.
// The app's real license service, activation form and IPC checks remain active.
if (process.env.SKOL_UI_E2E === '1' && process.type === 'browser') {
  const fs = require('node:fs');
  const path = require('node:path');
  const { app } = require('electron');

  const userDataPath = process.env.SKOL_UI_E2E_USER_DATA;
  const publicKeyBase64 = process.env.SKOL_UI_E2E_PUBLIC_KEY_B64;
  if (!userDataPath || !publicKeyBase64) {
    throw new Error('SKOL UI E2E requires an isolated user-data path and a temporary public key.');
  }

  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);

  const tempAppData = path.dirname(userDataPath);
  fs.mkdirSync(tempAppData, { recursive: true });
  try { app.setPath('appData', tempAppData); } catch { /* The runner may lock this path; userData is still isolated. */ }

  const testPublicKey = Buffer.from(publicKeyBase64, 'base64').toString('utf8');
  if (!testPublicKey.includes('PUBLIC KEY')) throw new Error('Temporary E2E license public key is invalid.');

  const originalReadFileSync = fs.readFileSync.bind(fs);
  fs.readFileSync = function (filePath, options) {
    if (path.basename(String(filePath)).toLowerCase() === 'license-public-key.pem') {
      const wantsText = options === 'utf8' || (options && typeof options === 'object' && options.encoding);
      return wantsText ? testPublicKey : Buffer.from(testPublicKey, 'utf8');
    }
    return originalReadFileSync(filePath, options);
  };
}
