'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseManager', {
  choosePrivateKey: () => ipcRenderer.invoke('licenseManager:chooseKey'),
  getConfig: () => ipcRenderer.invoke('licenseManager:config:get'),
  updateConfig: (data) => ipcRenderer.invoke('licenseManager:config:update', data),
  loadConfig: () => ipcRenderer.invoke('licenseManager:config:load'),
  saveConfig: (data) => ipcRenderer.invoke('licenseManager:config:save', data),
  importRequest: () => ipcRenderer.invoke('licenseManager:request:import'),
  generateLicense: (data) => ipcRenderer.invoke('licenseManager:generate', data),
  copyLicense: (value) => ipcRenderer.invoke('licenseManager:copy', value)
});
