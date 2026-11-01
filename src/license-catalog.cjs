'use strict';

// Stable entitlement IDs. This catalogue lists only modules with a real UI/IPC
// enforcement point in the current SKOL CRM codebase.
const CATALOG_VERSION = 1;
const FEATURE_CATALOG = Object.freeze({
  engineering: Object.freeze({
    id: 'engineering',
    name: 'Инженерный расчёт',
    shortName: 'Расчёт объекта',
    description: 'Расчёт стоимости, состава и трудоёмкости работ.',
    category: 'Расчёт',
    requires: Object.freeze([])
  }),
  engineering_plans: Object.freeze({
    id: 'engineering_plans',
    name: 'Инженерные планы',
    shortName: 'Инженерные планы',
    description: 'Работа с инженерными планами и ведомостями.',
    category: 'Расчёт',
    requires: Object.freeze([])
  }),
  finance: Object.freeze({
    id: 'finance',
    name: 'Финансы и платежи',
    shortName: 'Финансы',
    description: 'Платежи, поступления, расходы и финансовые показатели.',
    category: 'Управление',
    requires: Object.freeze([])
  }),
  order_radar: Object.freeze({
    id: 'order_radar',
    name: 'Радар заказов',
    shortName: 'Радар заказов',
    description: 'Поиск и обработка потенциальных заказов и заявок.',
    category: 'Продажи',
    requires: Object.freeze([])
  }),
  production: Object.freeze({
    id: 'production',
    name: 'Производство и ПИ',
    shortName: 'Производство',
    description: 'Планирование производства и инструменты производственной аналитики.',
    category: 'Управление',
    requires: Object.freeze([])
  }),
  reports: Object.freeze({
    id: 'reports',
    name: 'Отчёты',
    shortName: 'Отчёты',
    description: 'Отчётные представления и сводки по работе компании.',
    category: 'Аналитика',
    requires: Object.freeze([])
  }),
  web_browser: Object.freeze({
    id: 'web_browser',
    name: 'Встроенный браузер',
    shortName: 'Браузер',
    description: 'Встроенный браузер для поиска и просмотра веб-источников.',
    category: 'Продажи',
    requires: Object.freeze([])
  })
});

const FEATURE_IDS = Object.freeze(Object.keys(FEATURE_CATALOG).sort());
const LEGACY_ONLY_FEATURE_IDS = Object.freeze(['advanced_analytics']);

function normalizeFeatureIds(value) {
  if (!Array.isArray(value)) throw new Error('Список разрешений должен быть массивом feature ID.');
  if (value.length > FEATURE_IDS.length) throw new Error('В лицензии слишком много разрешённых модулей.');
  const features = value.map(item => {
    if (typeof item !== 'string') throw new Error('Feature ID должен быть строкой.');
    const id = item.trim();
    if (!Object.prototype.hasOwnProperty.call(FEATURE_CATALOG, id)) {
      throw new Error(`Неизвестный или неподдерживаемый модуль лицензии: ${id}.`);
    }
    return id;
  });
  if (new Set(features).size !== features.length) throw new Error('Список модулей содержит повторяющиеся ID.');
  const selected = new Set(features);
  for (const id of features) {
    for (const dependency of FEATURE_CATALOG[id].requires) {
      if (!selected.has(dependency)) {
        throw new Error(`Модуль ${id} требует включить ${dependency}.`);
      }
    }
  }
  return [...features].sort();
}

module.exports = {
  CATALOG_VERSION,
  FEATURE_CATALOG,
  FEATURE_IDS,
  LEGACY_ONLY_FEATURE_IDS,
  normalizeFeatureIds
};
