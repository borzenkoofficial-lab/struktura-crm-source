'use strict';

const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const { createPrivateKey, createPublicKey } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { generateConfiguredLicense } = require('../license-generator.cjs');
const { FEATURE_CATALOG } = require('../../src/license-catalog.cjs');
const { createDefaultTariffConfig, normalizeTariffConfig, normalizeLicenseRequest } = require('../../src/license-config.cjs');

app.setName('СКОЛ License Manager');
let mainWindow = null;
let privateKeyPath = '';
let tariffConfig = createDefaultTariffConfig();
let pendingRequest = null;

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

ipcMain.handle('licenseManager:config:get', () => ({
  config: tariffConfig,
  features: Object.values(FEATURE_CATALOG)
}));

ipcMain.handle('licenseManager:config:update', (_event, input) => {
  tariffConfig = normalizeTariffConfig(input);
  return { config: tariffConfig };
});

ipcMain.handle('licenseManager:config:load', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт конфигурации тарифов СКОЛ',
    properties: ['openFile'],
    filters: [{ name: 'СКОЛ tariff config', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const selectedPath = result.filePaths[0];
  const parsed = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
  tariffConfig = normalizeTariffConfig(parsed);
  return { config: tariffConfig, fileName: path.basename(selectedPath) };
});

ipcMain.handle('licenseManager:config:save', async (_event, input) => {
  const config = normalizeTariffConfig(input);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить конфигурацию тарифов СКОЛ',
    defaultPath: 'skol-tariff-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2), { encoding: 'utf8', flag: 'w' });
  tariffConfig = config;
  return { saved: true, fileName: path.basename(result.filePath) };
});

ipcMain.handle('licenseManager:request:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Загрузить заявку-конфигурацию с сайта СКОЛ',
    properties: ['openFile'],
    filters: [{ name: 'СКОЛ license request', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const selectedPath = result.filePaths[0];
  pendingRequest = normalizeLicenseRequest(JSON.parse(fs.readFileSync(selectedPath, 'utf8')));
  return { request: pendingRequest, fileName: path.basename(selectedPath) };
});

ipcMain.handle('licenseManager:generate', (_event, input = {}) => {
  if (!privateKeyPath) throw new Error('Сначала выбери закрытый ключ подписи.');
  const planId = String(input.planId || input.edition || '').trim().toUpperCase();
  let plan;
  if (planId === 'CUSTOM') {
    if (!pendingRequest) throw new Error('Сначала загрузи JSON-заявку с сайта СКОЛ.');
    plan = { id: pendingRequest.planId, name: pendingRequest.planName, features: pendingRequest.features, maxDevices: 50 };
  } else {
    plan = tariffConfig.plans.find(item => item.id === planId && item.enabled);
    if (!plan) throw new Error('Выбранный тариф не найден или отключён в конфигурации.');
  }
  const seatIndex = Number(input.seatIndex || 1);
  const seatCount = Number(input.seatCount || (pendingRequest?.seatCount ?? 1));
  if (!Number.isSafeInteger(seatCount) || seatCount > plan.maxDevices) {
    throw new Error(`Для тарифа ${plan.name} разрешено не более ${plan.maxDevices} компьютеров в одной заявке.`);
  }
  const { token, payload } = generateConfiguredLicense({
    planId: plan.id,
    planName: plan.name,
    features: plan.features,
    deviceId: input.deviceId,
    privateKeyPath,
    licenseId: input.licenseId,
    seatIndex,
    seatCount,
    updatesUntil: input.updatesUntil,
    expiresAt: input.expiresAt
  });
  return {
    token,
    summary: {
      planId: payload.planId,
      planName: payload.planName,
      edition: payload.planId,
      licenseId: payload.licenseId,
      features: payload.features,
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
