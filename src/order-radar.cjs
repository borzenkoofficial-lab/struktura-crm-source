'use strict';

const ORDER_QUERIES = {
  demolition: [
    'тендер закупка демонтаж коммерческих помещений',
    '"ищем подрядчика" демонтаж офисов',
    'тендер на выполнение работ по демонтажу Москва подрядчик',
    'site:zakupki.gov.ru демонтаж OR site:roseltorg.ru демонтаж OR site:b2b-center.ru демонтаж'
  ],
  finishing: [
    'тендер закупка отделка офисов fit out',
    '"ищем подрядчика" отделочные работы коммерческие помещения',
    'тендер на выполнение отделочных работ Москва подрядчик',
    'site:zakupki.gov.ru отделка OR site:roseltorg.ru отделка OR site:b2b-center.ru отделка'
  ],
  raised_floor: [
    'тендер закупка демонтаж фальшпол',
    'заказчик ищет подрядчика фальшпол серверная',
    'тендер на монтаж или демонтаж фальшпола подрядчик',
    'site:zakupki.gov.ru фальшпол OR site:roseltorg.ru фальшпол OR site:b2b-center.ru фальшпол'
  ]
};

const SIGNALS = [
  { key: 'tender', label: 'Закупка / тендер', weight: 30, re: /тендер|закупк|запрос предложен|электронн.{0,12}торг|запрос.{0,20}коммерческ.{0,12}предлож/iu },
  { key: 'contractor', label: 'Поиск подрядчика', weight: 30, re: /ищ.{0,12}подрядчик|требуется подрядчик|приглашаем подрядчик|выбор подрядчик|подрядн.{0,12}организац/iu },
  { key: 'demolition', label: 'Демонтаж', weight: 25, re: /демонтаж|демонтир|разборк.{0,12}(помещ|перегород|покрыт|здан)/iu },
  { key: 'renovation', label: 'Ремонт / реконструкция', weight: 15, re: /ремонт|реконструкц|отделк|fit.?out|капитальн.{0,12}ремонт/iu },
  { key: 'raised_floor', label: 'Фальшполы', weight: 25, re: /фальшпол|поднят.{0,8}пол|двойн.{0,8}пол|техническ.{0,8}пол/iu },
  { key: 'commercial', label: 'Коммерческий объект', weight: 10, re: /офис|магазин|торгов.{0,12}центр|бизнес.?центр|склад|коммерческ.{0,12}помещ|нежил.{0,12}помещ/iu }
];

function classifyOrderSource(url, fallback = 'web') {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 't.me' || host.endsWith('.t.me') || host === 'telegram.me' || host.endsWith('.telegram.me')) return 'telegram';
    if (host === 'avito.ru' || host.endsWith('.avito.ru')) return 'avito';
    if (['zakupki.gov.ru','roseltorg.ru','b2b-center.ru','rts-tender.ru','etp-ets.ru','fabrikant.ru'].some(domain => host === domain || host.endsWith('.' + domain))) return 'tenders';
  } catch {}
  return ['web','telegram','avito','tenders','files'].includes(fallback) ? fallback : 'web';
}

function buildOrderQueries(service = 'demolition', region = 'Москва и Московская область', source = 'web') {
  const base = ORDER_QUERIES[service] || ORDER_QUERIES.demolition;
  const terms = service === 'finishing' ? 'отделка ремонт fit-out' : service === 'raised_floor' ? 'фальшпол технический пол' : 'демонтаж разборка';
  const sourceQueries = {
    all: [
      `(${terms}) (тендер OR закупка OR заказчик OR подрядчик)`,
      `(site:t.me OR site:telegram.me) (${terms}) (заказ OR подрядчик OR тендер OR закупка)`,
      `site:avito.ru (${terms}) (заказ OR подрядчик OR услуги)`,
      `(site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru OR site:rts-tender.ru) (${terms}) (тендер OR закупка)`
    ],
    web: base,
    telegram: [`site:t.me (${terms}) (заказ OR подрядчик OR тендер OR закупка)`, `site:telegram.me (${terms}) (ищем подрядчика OR заказ)`],
    avito: [`site:avito.ru (${terms}) (заказ OR подрядчик OR услуги)`, `site:avito.ru Москва Московская область (${terms})`],
    tenders: [`site:zakupki.gov.ru (${terms})`, `(site:roseltorg.ru OR site:b2b-center.ru OR site:rts-tender.ru) (${terms})`, `тендер закупка (${terms}) подрядчик`]
  };
  const queries = sourceQueries[source] || base;
  const safeRegion = String(region || 'Москва и Московская область').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 120);
  return queries.map(query => [query, safeRegion].filter(Boolean).join(' ').trim());
}

function buildManualOrderSearchUrl(service = 'demolition', region = 'Москва и Московская область', source = 'web') {
  const terms = service === 'finishing' ? 'отделка ремонт fit-out' : service === 'raised_floor' ? 'фальшпол технический пол' : 'демонтаж разборка';
  const domains = {
    all: '(site:t.me OR site:telegram.me OR site:avito.ru OR site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru OR site:rts-tender.ru)',
    web: '',
    telegram: 'site:t.me OR site:telegram.me',
    avito: 'site:avito.ru',
    tenders: 'site:zakupki.gov.ru OR site:roseltorg.ru OR site:b2b-center.ru OR site:rts-tender.ru'
  };
  const safeRegion = String(region || 'Москва и Московская область').replace(/[\\r\\n]+/g, ' ').trim().slice(0, 120);
  const query = [terms, safeRegion, '(тендер OR закупка OR заказ OR подрядчик)', domains[source] || ''].filter(Boolean).join(' ');
  return 'https://yandex.ru/search/?text=' + encodeURIComponent(query);
}

function normalizeOrderResult(item = {}, query = '', service = 'demolition', region = 'Москва и Московская область') {
  let url;
  try { url = new URL(String(item.url || '')); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  url.hash = '';
  // Remove common analytics parameters so the same publication is not stored as multiple orders.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|yclid|ysclid|_openstat|from)$/i.test(key)) url.searchParams.delete(key);
  }

  const title = String(item.title || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!title) return null;
  const snippet = String(item.description || item.extra_snippets?.[0] || '')
    .replace(/\s+/g, ' ').trim().slice(0, 1200);

  // Score only evidence in the actual result, never keywords from our own search query.
  const evidence = title + ' ' + snippet;
  const signals = SIGNALS.filter(signal => signal.re.test(evidence));
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  const serviceSignal = {
    demolition: 'demolition',
    finishing: 'renovation',
    raised_floor: 'raised_floor'
  }[service] || 'demolition';
  const hasServiceEvidence = signals.some(signal => signal.key === serviceSignal);
  const hasProcurementEvidence = signals.some(signal => ['tender', 'contractor'].includes(signal.key));

  return {
    title,
    source_url: url.toString().slice(0, 700),
    source_name: url.hostname.replace(/^www\./i, ''),
    source_type: classifyOrderSource(url.toString()),
    snippet,
    search_query: String(query).slice(0, 500),
    service: ['demolition', 'finishing', 'raised_floor'].includes(service) ? service : 'demolition',
    region: String(region || 'Москва и Московская область').slice(0, 120),
    signal_score: score,
    signal_labels: signals.map(signal => signal.label),
    relevance: score >= 30 && hasProcurementEvidence && hasServiceEvidence
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

function leadSourceForOrderType(sourceType) {
  return ({ avito: 'avito', telegram: 'telegram', web: 'website', tenders: 'website', files: 'other' })[sourceType] || 'website';
}

function orderRefreshAction(status) {
  if (!status) return 'insert';
  if (status === 'relevant' || status === 'rejected') return 'protect';
  return 'update';
}

function deduplicateOrders(items = []) {
  const seen = new Set();
  return items.filter(item => {
    if (!item?.source_url || seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });
}

module.exports = { buildOrderQueries, buildManualOrderSearchUrl, normalizeOrderResult, normalizeBraveOrderResult, orderRefreshAction, deduplicateOrders, classifyOrderSource, leadSourceForOrderType };
