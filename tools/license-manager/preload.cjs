'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseManager', {
  choosePrivateKey: () => ipcRenderer.invoke('licenseManager:chooseKey'),
  generateLicense: data => ipcRenderer.invoke('licenseManager:generate', data),
  copyLicense: value => ipcRenderer.invoke('licenseManager:copy', value)
});
