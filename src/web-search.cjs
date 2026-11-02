'use strict';

// Query templates are a deterministic fallback when the AI query planner is unavailable.
// Actual search is performed by public-web-search.cjs; no Brave API or paid search key is required.
const SERVICE_QUERIES = {
  demolition: [
    'подрядчик демонтаж офисов коммерческих помещений',
    'генподрядчик коммерческая недвижимость реконструкция бизнес центр',
    'управляющая компания бизнес центр эксплуатация ремонт'
  ],
  finishing: [
    'подрядчик отделка офисов fit out коммерческие помещения',
    'генподрядчик отделочные работы коммерческие объекты',
    'девелопер коммерческая недвижимость строительство офисов'
  ],
  raised_floor: [
    'монтаж фальшполов офис серверная подрядчик',
    'поставщик фальшполов коммерческие объекты',
    'генподрядчик инженерные системы дата центр офис'
  ]
};
function buildQueries(service, region) {
  const topics = SERVICE_QUERIES[service] || SERVICE_QUERIES.demolition;
  const safeRegion = String(region || 'Москва и Московская область').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return topics.map(topic => (topic + ' ' + safeRegion).trim());
}
function normalizeResult(item) {
  let url;
  try { url = new URL(String(item.url || '')); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  url.hash = '';
  const title = String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!title) return null;
  return {
    company_name: title.replace(/\s*[|–—-]\s*(официальный сайт|главная|сайт компании).*$/i, '').trim().slice(0, 180) || title,
    website: url.origin + '/',
    source_url: url.toString().slice(0, 500),
    snippet: String(item.description || item.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 700)
  };
}
module.exports = { buildQueries, normalizeResult };
