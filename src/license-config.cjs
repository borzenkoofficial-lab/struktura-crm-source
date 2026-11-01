'use strict';

const {
  CATALOG_VERSION,
  FEATURE_CATALOG,
  FEATURE_IDS,
  normalizeFeatureIds
} = require('./license-catalog.cjs');

const CONFIG_FORMAT = 'SKOL_TARIFF_CONFIG';
const REQUEST_FORMAT = 'SKOL_LICENSE_REQUEST';
const MAX_PLANS = 30;
const MAX_DEVICES = 50;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultTariffConfig() {
  return {
    format: CONFIG_FORMAT,
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    product: 'SKOL_CRM',
    currency: 'RUB',
    featureIds: [...FEATURE_IDS],
    plans: [
      {
        id: 'START',
        name: 'START',
        description: 'Базовые клиенты, заявки, объекты и задачи.',
        price: null,
        maxDevices: MAX_DEVICES,
        features: [],
        enabled: true,
        displayOrder: 1
      },
      {
        id: 'PRO',
        name: 'PRO',
        description: 'Финансы, производство, инженерный расчёт и отчёты.',
        price: null,
        maxDevices: MAX_DEVICES,
        features: ['engineering', 'finance', 'production', 'reports'],
        enabled: true,
        displayOrder: 2
      },
      {
        id: 'BUSINESS',
        name: 'BUSINESS',
        description: 'Полный набор доступных модулей CRM.',
        price: null,
        maxDevices: MAX_DEVICES,
        features: [
          'engineering',
          'engineering_plans',
          'finance',
          'order_radar',
          'production',
          'reports',
          'web_browser'
        ],
        enabled: true,
        displayOrder: 3
      }
    ]
  };
}

function boundedString(value, field, maxLength, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string') throw new Error(`Поле ${field} должно быть текстом.`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(`Поле ${field} должно содержать от 1 до ${maxLength} символов.`);
  return result;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  if (!Number.isSafeInteger(price) || price < 0 || price > 100000000) {
    throw new Error('Стоимость тарифа должна быть целым числом от 0 до 100 000 000 рублей или оставаться пустой.');
  }
  return price;
}

function normalizePlan(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректная запись тарифа.');
  const allowed = new Set(['id', 'name', 'description', 'price', 'maxDevices', 'features', 'enabled', 'displayOrder']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Тариф содержит неизвестные поля.');
  const id = boundedString(input.id, 'id', 48).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(id)) throw new Error('ID тарифа может содержать латинские буквы, цифры, дефис и подчёркивание.');
  if (id === 'CUSTOM') throw new Error('ID тарифа CUSTOM зарезервирован для индивидуальной заявки с сайта.');
  const name = boundedString(input.name, 'name', 80);
  const description = boundedString(input.description ?? '', 'description', 300, { optional: true });
  const maxDevices = Number(input.maxDevices ?? MAX_DEVICES);
  if (!Number.isSafeInteger(maxDevices) || maxDevices < 1 || maxDevices > MAX_DEVICES) {
    throw new Error(`Лимит компьютеров должен быть от 1 до ${MAX_DEVICES}.`);
  }
  const enabled = input.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== 'boolean') throw new Error('Поле enabled должно быть логическим значением.');
  const displayOrder = Number(input.displayOrder ?? index + 1);
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 1 || displayOrder > 999) {
    throw new Error('Порядок отображения тарифа указан некорректно.');
  }
  return {
    id,
    name,
    description,
    price: normalizePrice(input.price),
    maxDevices,
    features: normalizeFeatureIds(input.features ?? []),
    enabled,
    displayOrder
  };
}

function normalizeTariffConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Файл конфигурации тарифов не является объектом JSON.');
  const allowed = new Set(['format', 'schemaVersion', 'catalogVersion', 'product', 'currency', 'featureIds', 'plans']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Конфигурация содержит неизвестные поля.');
  if (input.format !== CONFIG_FORMAT || input.schemaVersion !== 1 || input.catalogVersion !== CATALOG_VERSION || input.product !== 'SKOL_CRM') {
    throw new Error('Формат или версия конфигурации СКОЛ не поддерживается этой CRM.');
  }
  if (input.currency !== 'RUB') throw new Error('Для текущей версии поддерживаются только цены в RUB.');
  if (!Array.isArray(input.plans) || input.plans.length < 1 || input.plans.length > MAX_PLANS) {
    throw new Error(`Конфигурация должна содержать от 1 до ${MAX_PLANS} тарифов.`);
  }
  if (input.featureIds !== undefined) {
    const incoming = normalizeFeatureIds(input.featureIds);
    if (JSON.stringify(incoming) !== JSON.stringify([...FEATURE_IDS])) {
      throw new Error('Каталог модулей в конфигурации не соответствует каталогу этой версии CRM.');
    }
  }
  const plans = input.plans.map(normalizePlan);
  const ids = plans.map(plan => plan.id);
  if (new Set(ids).size !== ids.length) throw new Error('ID тарифов должны быть уникальными.');
  if (!plans.some(plan => plan.enabled)) throw new Error('Должен быть включён хотя бы один тариф.');
  return {
    format: CONFIG_FORMAT,
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    product: 'SKOL_CRM',
    currency: 'RUB',
    featureIds: [...FEATURE_IDS],
    plans: plans.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ru'))
  };
}

function normalizeLicenseRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Заявка на лицензию должна быть объектом JSON.');
  const allowed = new Set(['format', 'schemaVersion', 'catalogVersion', 'product', 'planId', 'planName', 'features', 'seatCount', 'customer', 'message']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('Заявка содержит неизвестные поля.');
  if (input.format !== REQUEST_FORMAT || input.schemaVersion !== 1 || input.catalogVersion !== CATALOG_VERSION || input.product !== 'SKOL_CRM') {
    throw new Error('Формат заявки не поддерживается этой версией CRM.');
  }
  const planId = boundedString(input.planId, 'planId', 48).toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{1,47}$/.test(planId)) throw new Error('ID тарифа в заявке указан некорректно.');
  const planName = boundedString(input.planName, 'planName', 80);
  const features = normalizeFeatureIds(input.features ?? []);
  const seatCount = Number(input.seatCount);
  if (!Number.isSafeInteger(seatCount) || seatCount < 1 || seatCount > MAX_DEVICES) {
    throw new Error(`Количество компьютеров должно быть от 1 до ${MAX_DEVICES}.`);
  }
  const customerInput = input.customer && typeof input.customer === 'object' && !Array.isArray(input.customer) ? input.customer : {};
  if (Object.keys(customerInput).some(key => !['name', 'contact'].includes(key))) throw new Error('Контактные данные заявки содержат неизвестные поля.');
  const customer = {
    name: boundedString(customerInput.name ?? '', 'customer.name', 80, { optional: true }),
    contact: boundedString(customerInput.contact ?? '', 'customer.contact', 120, { optional: true })
  };
  const message = boundedString(input.message ?? '', 'message', 1000, { optional: true });
  return {
    format: REQUEST_FORMAT,
    schemaVersion: 1,
    catalogVersion: CATALOG_VERSION,
    product: 'SKOL_CRM',
    planId,
    planName,
    features,
    seatCount,
    customer,
    message
  };
}

function serializeTariffConfig(input) {
  return JSON.stringify(normalizeTariffConfig(input), null, 2);
}

module.exports = {
  CONFIG_FORMAT,
  REQUEST_FORMAT,
  MAX_PLANS,
  MAX_DEVICES,
  createDefaultTariffConfig,
  normalizeTariffConfig,
  normalizeLicenseRequest,
  serializeTariffConfig
};
