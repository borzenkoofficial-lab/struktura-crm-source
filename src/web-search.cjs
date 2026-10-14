'use strict';

const SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
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
  const safeRegion = String(region || 'Москва и Московская область').trim().slice(0, 120);
  return topics.map(topic => `${topic} ${safeRegion}`.trim());
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
    website: `${url.protocol}//${url.host}/`,
    source_url: url.toString().slice(0, 500),
    snippet: String(item.description || item.extra_snippets?.[0] || '').replace(/\s+/g, ' ').trim().slice(0, 700)
  };
}

async function searchBrave(query, apiKey, { fetchImpl = globalThis.fetch, timeoutMs = 12000, count = 10 } = {}) {
  if (!String(apiKey || '').trim()) throw new Error('Сначала сохрани API-ключ Brave Search.');
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('q', String(query).slice(0, 400));
  url.searchParams.set('count', String(Math.max(1, Math.min(10, Number(count) || 10))));
  url.searchParams.set('country', 'RU');
  url.searchParams.set('search_lang', 'ru');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': String(apiKey).trim() },
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) throw new Error('Brave Search отклонил ключ. Проверь API-ключ и доступ к поисковому API.');
    if (response.status === 429) throw new Error('Brave Search ограничил частоту запросов. Попробуй позже.');
    if (!response.ok) throw new Error(`Brave Search вернул HTTP ${response.status}.`);
    const body = await response.json();
    const results = Array.isArray(body?.web?.results) ? body.web.results : [];
    return results.map(normalizeResult).filter(Boolean);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Поисковый запрос превысил лимит ожидания 12 секунд.');
    throw error;
  } finally { clearTimeout(timer); }
}

module.exports = { buildQueries, normalizeResult, searchBrave };
