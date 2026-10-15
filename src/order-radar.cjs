'use strict';

const ORDER_QUERIES = {
  demolition: [
    'тендер закупка демонтаж коммерческих помещений',
    '"ищем подрядчика" демонтаж офисов',
    'закупка демонтаж ремонт реконструкция коммерческий объект',
    'site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru демонтаж'
  ],
  finishing: [
    'тендер закупка отделка офисов fit out',
    '"ищем подрядчика" отделочные работы коммерческие помещения',
    'закупка ремонт реконструкция коммерческий объект',
    'site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru отделка'
  ],
  raised_floor: [
    'тендер закупка демонтаж фальшпол',
    'заказчик ищет подрядчика фальшпол серверная',
    'закупка ремонт серверной коммерческий объект',
    'site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru фальшпол'
  ]
};

const SIGNALS = [
  { key: 'tender', label: 'Закупка / тендер', weight: 30, re: /тендер|закупк|запрос предложен|электронн.{0,12}торг|коммерческ.{0,12}предлож/iu },
  { key: 'contractor', label: 'Поиск подрядчика', weight: 30, re: /ищ.{0,12}подрядчик|требуется подрядчик|приглашаем подрядчик|выбор подрядчик|подрядн.{0,12}организац/iu },
  { key: 'demolition', label: 'Демонтаж', weight: 25, re: /демонтаж|демонтир|разборк.{0,12}(помещ|перегород|покрыт|здан)/iu },
  { key: 'renovation', label: 'Ремонт / реконструкция', weight: 15, re: /ремонт|реконструкц|отделк|fit.?out|капитальн.{0,12}ремонт/iu },
  { key: 'commercial', label: 'Коммерческий объект', weight: 10, re: /офис|магазин|торгов.{0,12}центр|бизнес.?центр|склад|коммерческ.{0,12}помещ|нежил.{0,12}помещ/iu }
];

function buildOrderQueries(service = 'demolition', region = 'Москва и Московская область') {
  const queries = ORDER_QUERIES[service] || ORDER_QUERIES.demolition;
  const safeRegion = String(region || 'Москва и Московская область')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
  return queries.map(query => [query, safeRegion].filter(Boolean).join(' ').trim());
}

function normalizeOrderResult(item = {}, query = '', service = 'demolition', region = 'Москва и Московская область') {
  let url;
  try { url = new URL(String(item.url || '')); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  url.hash = '';

  const title = String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!title) return null;
  const snippet = String(item.description || item.extra_snippets?.[0] || '')
    .replace(/\s+/g, ' ').trim().slice(0, 1200);

  // Score only evidence in the actual result, never keywords from our own search query.
  const evidence = title + ' ' + snippet;
  const signals = SIGNALS.filter(signal => signal.re.test(evidence));
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));

  return {
    title,
    source_url: url.toString().slice(0, 700),
    source_name: url.hostname.replace(/^www\./i, ''),
    snippet,
    search_query: String(query).slice(0, 500),
    service: ['demolition', 'finishing', 'raised_floor'].includes(service) ? service : 'demolition',
    region: String(region || 'Москва и Московская область').slice(0, 120),
    signal_score: score,
    signal_labels: signals.map(signal => signal.label),
    relevance: score >= 30 && signals.some(signal => ['tender', 'contractor'].includes(signal.key))
      ? 'potential_order'
      : 'review'
  };
}

function normalizeBraveOrderResult(item = {}, query = '', service = 'demolition', region = 'Москва и Московская область') {
  // searchBrave() exposes company_name/source_url/snippet, not title/url/description.
  return normalizeOrderResult({
    title: item.company_name,
    url: item.source_url,
    description: item.snippet
  }, query, service, region);
}

function deduplicateOrders(items = []) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.source_url || seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });
}

module.exports = { buildOrderQueries, normalizeOrderResult, normalizeBraveOrderResult, deduplicateOrders };
