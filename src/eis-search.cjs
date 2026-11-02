'use strict';

const EIS_SEARCH_URL = 'https://zakupki.gov.ru/epz/order/extendedsearch/results.html';
const ALLOWED_HOSTS = new Set(['zakupki.gov.ru', 'www.zakupki.gov.ru']);

function cleanText(value, max = 1200) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isAllowedEisUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol)
      && ALLOWED_HOSTS.has(url.hostname.toLowerCase())
      && !url.username && !url.password
      && url.pathname.toLowerCase().includes('/epz/order/');
  } catch {
    return false;
  }
}

function normalizeEisResult(raw = {}, query = '') {
  let url;
  try { url = new URL(String(raw.url || ''), 'https://zakupki.gov.ru'); } catch { return null; }
  if (!isAllowedEisUrl(url.toString())) return null;
  url.hash = '';
  const title = cleanText(raw.title, 240);
  if (!title) return null;
  let registryNumber = cleanText(raw.registryNumber, 80);
  if (!registryNumber) {
    const match = url.searchParams.get('regNumber') || '';
    registryNumber = cleanText(match, 80);
  }
  if (!registryNumber) {
    const match = cleanText(raw.number, 300).match(/(?:извещени[ея]|закупк[аи])\s*(?:№|N)?\s*([0-9]{8,})/i);
    if (match) registryNumber = match[1];
  }
  return {
    title,
    url: url.toString().slice(0, 1000),
    snippet: cleanText(raw.snippet, 1200),
    registryNumber,
    source: 'eis',
    engine: 'ЕИС',
    query: cleanText(query, 400)
  };
}

function parseEisSearchResults(html, query = '', { count = 20 } = {}) {
  const source = String(html || '');
  const starts = [];
  const cardStart = /<div\b[^>]*class=["'][^"']*\bregistry-entry__form\b[^"']*["'][^>]*>/gi;
  for (const match of source.matchAll(cardStart)) starts.push(match.index);
  const unique = new Map();
  for (let index = 0; index < starts.length; index += 1) {
    const block = source.slice(starts[index], starts[index + 1] ?? source.length);
    const titleBlock = block.match(/class=["'][^"']*registry-entry__body-value[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>|<\/span>)/i)
      || block.match(/class=["'][^"']*registry-entry__header-mid__title[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>|<\/span>)/i)
      || block.match(/class=["'][^"']*registry-entry__header-top__title[^"']*["'][^>]*>([\s\S]*?)(?:<\/div>|<\/span>)/i);
    const anchors = [...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const preferred = anchors.find(match => /regNumber=|\/epz\/order\//i.test(match[1])) || anchors[0];
    const title = cleanText(titleBlock?.[1] || preferred?.[2] || '');
    const href = preferred?.[1] || '';
    if (!title || !href) continue;
    const numberText = cleanText(block.match(/registry-entry__header-mid__number[^>]*>([\s\S]*?)(?:<\/div>|<\/span>)/i)?.[1] || '');
    const snippet = cleanText(block.replace(titleBlock?.[0] || '', ' '), 1200);
    const row = normalizeEisResult({ title, url: href, snippet, number: numberText }, query);
    if (!row) continue;
    const key = row.registryNumber || row.url;
    if (!unique.has(key)) unique.set(key, row);
    if (unique.size >= Math.max(1, Math.min(50, Number(count) || 20))) break;
  }
  return [...unique.values()];
}

async function searchEisProcurements(query, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 16000,
  count = 20
} = {}) {
  const safeQuery = cleanText(query, 300);
  if (!safeQuery) return { status: 'error', results: [], error: 'Пустой запрос для ЕИС.' };
  if (typeof fetchImpl !== 'function') return { status: 'unavailable', results: [], error: 'В этой версии Node.js недоступен fetch.' };

  const url = new URL(EIS_SEARCH_URL);
  url.searchParams.set('searchString', safeQuery);
  url.searchParams.set('morphology', 'on');
  url.searchParams.set('fz44', 'on');
  url.searchParams.set('fz223', 'on');
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('recordsPerPage', '_50');
  url.searchParams.set('sortBy', 'UPDATE_DATE');
  url.searchParams.set('sortDirection', 'false');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(45000, Number(timeoutMs) || 16000)));
  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    if (!response.ok) {
      const status = [401, 403, 429].includes(response.status) ? 'blocked' : 'unavailable';
      return { status, results: [], error: `ЕИС вернула HTTP ${response.status}; прямой доступ к источнику сейчас ограничен или недоступен.` };
    }
    if (response.url && !ALLOWED_HOSTS.has(new URL(response.url).hostname.toLowerCase())) {
      return { status: 'blocked', results: [], error: 'ЕИС перенаправила запрос за пределы официального домена; переход отклонён.' };
    }
    const html = await response.text();
    const results = parseEisSearchResults(html, safeQuery, { count });
    return {
      status: results.length ? 'ok' : 'empty',
      results,
      error: results.length ? '' : 'ЕИС ответила, но карточки закупок не найдены или формат страницы не распознан.'
    };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return {
      status: timedOut ? 'unavailable' : 'error',
      results: [],
      error: timedOut ? 'ЕИС не ответила за отведённое время.' : `Ошибка запроса к ЕИС: ${cleanText(error?.message || error, 240)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  EIS_SEARCH_URL,
  cleanText,
  isAllowedEisUrl,
  normalizeEisResult,
  parseEisSearchResults,
  searchEisProcurements
};
