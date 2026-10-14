'use strict';

function resolveBrowserInput(raw) {
  const value = String(raw ?? '').trim().slice(0, 1500);
  if (!value) throw new Error('Введи адрес сайта или поисковый запрос.');
  try {
    const candidate = new URL(value.includes('://') ? value : `https://${value}`);
    if (['http:', 'https:'].includes(candidate.protocol) && candidate.hostname.includes('.') && !candidate.username && !candidate.password) {
      return candidate.toString();
    }
  } catch {}
  return `https://yandex.ru/search/?text=${encodeURIComponent(value)}`;
}

function validateBrowserNavigation(raw) {
  let url;
  try { url = new URL(String(raw ?? '').trim()); }
  catch { throw new Error('Некорректный адрес страницы.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Встроенный браузер разрешает только обычные HTTP/HTTPS-сайты.');
  }
  return url.toString();
}

function companyNameFromPage(title, hostname) {
  const cleanTitle = String(title ?? '').trim().slice(0, 180);
  const host = String(hostname ?? '').replace(/^www\./i, '').slice(0, 180);
  if (!cleanTitle || cleanTitle === hostname) return host;
  const cleaned = cleanTitle.replace(/\s*[|—–-]\s*[^|—–-]+$/, '').trim().slice(0, 180);
  return cleaned || host;
}

module.exports = { resolveBrowserInput, validateBrowserNavigation, companyNameFromPage };
