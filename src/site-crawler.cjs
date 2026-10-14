'use strict';
const dns = require('node:dns').promises;
const net = require('node:net');

function isPublicAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const p = ip.split('.').map(Number);
    const [a,b] = p;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  if (family === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPublicAddress(x.slice(7));
    return x.startsWith('2') || x.startsWith('3'); // globally routed 2000::/3 only
  }
  return false;
}

async function validatePublicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Некорректный URL: ' + value); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Разрешены только HTTP и HTTPS.');
  if (url.username || url.password) throw new Error('URL с логином или паролем не поддерживается.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Разрешены только публичные домены.');
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new Error('Локальные и непубличные IP-адреса запрещены.');
  } else {
    let records;
    try { records = await dns.lookup(host, { all: true, verbatim: true }); }
    catch { throw new Error('Не удалось разрешить домен: ' + host); }
    if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error('Домен разрешается в непубличный IP и заблокирован.');
  }
  url.hash = '';
  return url;
}

function decodeEntities(text) {
  return String(text).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function plainText(html) {
  return decodeEntities(String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article|footer|header)\s*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[\t\f\v ]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
function extractPage(html, pageUrl) {
  const title = decodeEntities((String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1].replace(/<[^>]+>/g, ' ').trim());
  const h1 = decodeEntities((String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1].replace(/<[^>]+>/g, ' ').trim());
  const text = plainText(html).slice(0, 100000);
  const emails = [...new Set((String(html).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(x => x.replace(/[.,;:)]+$/, '').toLowerCase()))]
    .filter(email => !/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email));
  const phones = [...new Set((text.match(/(?:\+?7|8)?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g) || [])
    .map(phone => phone.replace(/\s+/g, ' ').trim()).filter(phone => phone.replace(/\D/g, '').length >= 10))].slice(0, 8);
  const links = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    try {
      const url = new URL(decodeEntities(match[2]), pageUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') { url.hash = ''; links.push(url.toString()); }
    } catch {}
  }
  const mailto = [...String(html).matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)].map(m => decodeEntities(m[1]).trim().toLowerCase());
  const genericHeading = /^(главная|контакты|контактная информация|о нас|контакт|contacts|contact|about us|home)$/i;
  const displayTitle = (h1 && !genericHeading.test(h1) ? h1 : title && !genericHeading.test(title) ? title : h1 || title || new URL(pageUrl).hostname);
  return { title: displayTitle.slice(0, 180), emails: [...new Set([...emails, ...mailto])].slice(0, 12), phones, links };
}
function robotsAllows(robotsText, pathname) {
  const groups = [];
  let current = null;
  for (const raw of String(robotsText || '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), value = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.rulesStarted) { current = { agents: [], rules: [], rulesStarted: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rulesStarted = true; if (value) current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  const matched = groups.filter(g => g.agents.some(a => a === '*' || a === 'struktura-crm'));
  const rules = matched.flatMap(g => g.rules).filter(r => pathname.startsWith(r.path)).sort((a,b) => b.path.length-a.path.length);
  return !rules.length || rules[0].allow;
}
async function fetchSafe(url, fetchImpl) {
  let current = await validatePublicUrl(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(current.toString(), {
      redirect: 'manual', signal: AbortSignal.timeout(9000),
      headers: { 'User-Agent': 'StrukturaCRM/0.3 (+public business contact discovery; respects robots.txt)', Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8' }
    });
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 3) throw new Error('Слишком много перенаправлений.');
      current = await validatePublicUrl(new URL(location, current).toString()); continue;
    }
    return { response, url: current };
  }
  throw new Error('Не удалось открыть страницу.');
}
async function crawlSites(seedUrls, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 12, 15));
  const delayMs = Math.max(700, Math.min(Number(options.delayMs) || 900, 2000));
  const discovered = new Map(), errors = [], checked = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  for (const seedRaw of seedUrls.slice(0, 8)) {
    let seed;
    try { seed = await validatePublicUrl(/^https?:\/\//i.test(seedRaw.trim()) ? seedRaw.trim() : 'https://' + seedRaw.trim()); }
    catch (error) { errors.push({ url: seedRaw, error: error.message }); continue; }
    const origin = seed.origin;
    let robots = '';
    try {
      const { response } = await fetchSafe(new URL('/robots.txt', origin).toString(), fetchImpl);
      if (response.ok) robots = (await response.text()).slice(0, 100000);
    } catch {}
    const queue = [seed.toString(), new URL('/contact', origin).toString(), new URL('/contacts', origin).toString(), new URL('/about', origin).toString()];
    const seen = new Set(); let pages = 0;
    while (queue.length && pages < maxPages) {
      const next = queue.shift();
      let url;
      try { url = await validatePublicUrl(next); } catch { continue; }
      if (url.origin !== origin || seen.has(url.toString())) continue;
      seen.add(url.toString());
      if (!robotsAllows(robots, url.pathname)) continue;
      try {
        const { response, url: finalUrl } = await fetchSafe(url.toString(), fetchImpl);
        if (finalUrl.origin !== origin) { errors.push({ url: url.toString(), error: 'Перенаправление на другой домен пропущено' }); continue; }
        if (!response.ok) { errors.push({ url: url.toString(), error: 'HTTP ' + response.status }); continue; }
        const type = response.headers.get('content-type') || '';
        if (!/text\/html|application\/xhtml\+xml/i.test(type)) continue;
        const html = (await response.text()).slice(0, 1200000); pages++; checked.push(finalUrl.toString());
        const extracted = extractPage(html, finalUrl.toString());
        if (extracted.emails.length || extracted.phones.length) {
          const key = finalUrl.hostname.replace(/^www\./,'');
          const prior = discovered.get(key) || { company_name: extracted.title, category: 'Компания с публичными контактами', service: options.service || 'demolition', region: options.region || 'Москва и Московская область', phone: '', email: '', website: origin, source_url: finalUrl.toString(), source_name: 'Веб-сайт', notes: '' };
          prior.phone ||= extracted.phones[0] || '';
          prior.email ||= extracted.emails[0] || '';
          prior.notes = [...new Set([prior.notes, ...extracted.phones.slice(1).map(x => 'Телефон: ' + x), ...extracted.emails.slice(1).map(x => 'Email: ' + x)].filter(Boolean))].join('\n').slice(0, 1800);
          if (extracted.title.length > prior.company_name.length && !/^(главная|контакты|контактная информация|о нас)$/i.test(extracted.title)) prior.company_name = extracted.title;
          discovered.set(key, prior);
        }
        const contactLinks = extracted.links.filter(link => {
          try { const u = new URL(link); return u.origin === origin && /contact|kontak|about|company|o-komp|requisite|rekvizit|связ|контакт|компан|реквизит|о-нас/i.test(u.pathname); } catch { return false; }
        });
        for (const link of contactLinks) if (!seen.has(link) && !queue.includes(link) && queue.length < maxPages * 3) queue.push(link);
      } catch (error) { errors.push({ url: url.toString(), error: error.name === 'TimeoutError' ? 'Истекло время ожидания' : error.message }); }
      await sleep(delayMs);
    }
  }
  return { prospects: [...discovered.values()], pagesChecked: checked.length, errors: errors.slice(0, 30), checkedUrls: checked.slice(0, 100) };
}
module.exports = { isPublicAddress, validatePublicUrl, plainText, extractPage, robotsAllows, crawlSites };
