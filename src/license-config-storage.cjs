'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createDefaultTariffConfig, normalizeTariffConfig } = require('./license-config.cjs');

function loadTariffConfigFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Не указан путь к локальной конфигурации тарифов.');
  if (!fs.existsSync(filePath)) {
    return { config: createDefaultTariffConfig(), source: 'default', warning: null };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const config = normalizeTariffConfig(JSON.parse(raw));
    return { config, source: 'local', warning: null };
  } catch (error) {
    return {
      config: createDefaultTariffConfig(),
      source: 'default',
      warning: `Локальная конфигурация тарифов не прочитана: ${error.message}. Загружены стандартные значения; импортируй корректный JSON или восстанови файл.`
    };
  }
}

function saveTariffConfigFile(filePath, input) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('Не указан путь для сохранения конфигурации тарифов.');
  const config = normalizeTariffConfig(input);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
    throw new Error(`Не удалось сохранить конфигурацию тарифов: ${error.message}`);
  }
  return config;
}

module.exports = { loadTariffConfigFile, saveTariffConfigFile };
