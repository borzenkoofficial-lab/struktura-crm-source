'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { createPrivateKey, createPublicKey } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { generateLicense } = require('../license-generator.cjs');

app.setName('СКОЛ License Manager');
let mainWindow = null;
let privateKeyPath = '';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 940,
    height: 820,
    minWidth: 760,
    minHeight: 680,
    title: 'СКОЛ · Генератор лицензий',
    backgroundColor: '#172332',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('licenseManager:chooseKey', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выбери закрытый ключ подписи СКОЛ',
    properties: ['openFile'],
    filters: [{ name: 'PEM key', extensions: ['pem', 'key'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  privateKeyPath = '';
  const selectedPath = result.filePaths[0];
  const pem = fs.readFileSync(selectedPath, 'utf8');
  if (!pem.includes('PRIVATE KEY')) throw new Error('Выбранный файл не содержит закрытый PEM-ключ.');
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Для лицензий СКОЛ требуется закрытый ключ Ed25519.');
  const expectedPublicPem = fs.readFileSync(path.join(__dirname, '../../src/license-public-key.pem'), 'utf8');
  const expectedPublicDer = createPublicKey(expectedPublicPem).export({ type: 'spki', format: 'der' });
  const selectedPublicDer = createPublicKey(key).export({ type: 'spki', format: 'der' });
  if (!Buffer.from(expectedPublicDer).equals(Buffer.from(selectedPublicDer))) {
    throw new Error('Этот закрытый ключ не соответствует открытому ключу в текущей сборке СКОЛ CRM.');
  }
  privateKeyPath = selectedPath;
  return { loaded: true, fileName: path.basename(selectedPath) };
});

ipcMain.handle('licenseManager:generate', (_event, input = {}) => {
  if (!privateKeyPath) throw new Error('Сначала выбери закрытый ключ подписи.');
  const args = {
    edition: input.edition,
    'device-id': input.deviceId,
    'private-key': privateKeyPath,
    'license-id': input.licenseId || undefined,
    'seat-index': String(input.seatIndex || 1),
    'seat-count': String(input.seatCount || 1),
    'updates-until': input.updatesUntil || undefined,
    'expires-at': input.expiresAt || undefined
  };
  const { token, payload } = generateLicense(args);
  return {
    token,
    summary: {
      edition: payload.edition,
      licenseId: payload.licenseId,
      seatIndex: payload.seatIndex,
      seatCount: payload.seatCount,
      deviceId: payload.deviceId,
      expiresAt: payload.expiresAt,
      updatesUntil: payload.updatesUntil
    }
  };
});

ipcMain.handle('licenseManager:copy', (_event, value) => {
  clipboard.writeText(String(value || ''));
  return { copied: true };
});

app.whenReady().then(createWindow).catch(error => {
  dialog.showErrorBox('СКОЛ License Manager', error.message || String(error));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
