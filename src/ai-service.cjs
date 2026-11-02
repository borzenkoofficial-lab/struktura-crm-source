'use strict';

const DEFAULT_BASE_URL = 'https://anymodel.org/v1';
const DEFAULT_CHAT_MODEL = 'am/free';
const DEFAULT_SEARCH_MODEL = 'xai/grok-4.7';

function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  let url;
  try { url = new URL(String(value || DEFAULT_BASE_URL)); }
  catch { throw new Error('Некорректный адрес AnyModel API.'); }
  if (url.protocol !== 'https:' || !['anymodel.org', 'www.anymodel.org'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error('Для защиты ключа разрешён только официальный HTTPS-адрес AnyModel: https://anymodel.org/v1.');
  }
  return url.toString().replace(/\/+$/, '');
}

function normalizeModel(value, fallback) {
  const model = String(value || fallback).trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{1,119}$/.test(model)) throw new Error('Некорректный идентификатор модели AnyModel.');
  return model;
}

function readResponseText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (typeof part.text === 'string' && part.text.trim()) chunks.push(part.text.trim());
    }
  }
  return chunks.join('\n').trim();
}

function extractCitationUrls(payload) {
  const found = new Map();
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    const type = String(node.type || '').toLowerCase();
    const candidate = node.url || node.uri || (node.url_citation && (node.url_citation.url || node.url_citation.uri));
    if (candidate && (type.includes('citation') || type.includes('source') || node.url_citation || node.title)) {
      try {
        const url = new URL(String(candidate));
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
          url.hash = '';
          found.set(url.toString(), { url: url.toString(), title: String(node.title || node.url_citation?.title || '').slice(0, 240) });
        }
      } catch {}
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'url' || key === 'uri' || key === 'title') continue;
      visit(value, depth + 1);
    }
  };
  visit(payload);
  return [...found.values()];
}

function parseJsonPayload(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('ИИ вернул пустой ответ вместо структурированных данных.');
  const unfenced = raw.replace(/^\uFEFF/, '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(unfenced); } catch {}
  const starts = [...unfenced].map((char, index) => ({ char, index })).filter(item => item.char === '{' || item.char === '[');
  for (const start of starts) {
    const opening = start.char, closing = opening === '{' ? '}' : ']';
    let depth = 0, quoted = false, escaped = false;
    for (let i = start.index; i < unfenced.length; i++) {
      const char = unfenced[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === opening) depth++;
      else if (char === closing && --depth === 0) {
        try { return JSON.parse(unfenced.slice(start.index, i + 1)); } catch { break; }
      }
    }
  }
  throw new Error('ИИ вернул некорректный JSON. Повтори поиск; карточки из такого ответа не импортированы.');
}

async function postJson(path, apiKey, body, options = {}) {
  const key = String(apiKey || '').trim();
  if (key.length < 12 || /\s/.test(key)) throw new Error('Сначала сохрани действующий API-ключ AnyModel в настройках СКОЛ.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('В этой версии среды недоступен сетевой запрос. Обнови СКОЛ до актуальной версии.');
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const timeoutMs = Math.max(1000, Math.min(120000, Number(options.timeoutMs) || 45000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(baseUrl + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) throw new Error('AnyModel отклонил ключ. Проверь API-ключ и доступ к выбранной модели.');
    if (response.status === 402) throw new Error('На балансе AnyModel недостаточно средств или токенов для этого запроса.');
    if (response.status === 429) throw new Error('AnyModel ограничил частоту запросов. Подожди и повтори попытку.');
    if (!response.ok) {
      let detail = '';
      try { const data = await response.json(); detail = data?.error?.message || data?.message || ''; } catch {}
      throw new Error('AnyModel вернул HTTP ' + response.status + (detail ? ': ' + String(detail).slice(0, 240) : '.'));
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AnyModel не ответил за отведённое время. Проверь интернет и повтори запрос.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function chatCompletion({ apiKey, model = DEFAULT_CHAT_MODEL, messages, system, prompt, maxTokens = 1800, fetchImpl, baseUrl, timeoutMs } = {}) {
  const normalizedModel = normalizeModel(model, DEFAULT_CHAT_MODEL);
  const conversation = Array.isArray(messages) ? messages : [
    ...(system ? [{ role: 'system', content: String(system) }] : []),
    { role: 'user', content: String(prompt || '') }
  ];
  if (!conversation.length || !conversation.some(item => item?.role === 'user')) throw new Error('Для ИИ-запроса не задан пользовательский вопрос.');
  const response = await postJson('/chat/completions', apiKey, {
    model: normalizedModel,
    messages: conversation,
    max_tokens: Math.max(128, Math.min(6000, Number(maxTokens) || 1800)),
    temperature: 0.2
  }, { fetchImpl, baseUrl, timeoutMs });
  const content = response?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content.trim()
    : Array.isArray(content) ? content.map(part => part?.text || '').join('\n').trim() : '';
  if (!text) throw new Error('AnyModel вернул ответ без текста.');
  return { text, model: normalizedModel, usage: response.usage || null };
}

async function webResearch({ apiKey, model = DEFAULT_SEARCH_MODEL, prompt, fetchImpl, baseUrl, timeoutMs } = {}) {
  const normalizedModel = normalizeModel(model, DEFAULT_SEARCH_MODEL);
  const query = String(prompt || '').trim();
  if (!query) throw new Error('Не задано задание для веб-поиска.');
  const response = await postJson('/responses', apiKey, {
    model: normalizedModel,
    input: [
      { role: 'system', content: 'Ты исследователь рынка для строительной компании. Выполняй реальный поиск в интернете через инструмент web_search. Не придумывай сайты, публикации, компании, контакты, бюджеты и сроки. Отделяй факты источника от предположений. Верни структурированный результат по заданному формату.' },
      { role: 'user', content: query }
    ],
    tools: [{ type: 'web_search' }]
  }, { fetchImpl, baseUrl, timeoutMs: timeoutMs || 90000 });
  const text = readResponseText(response);
  if (!text) throw new Error('AnyModel завершил веб-поиск без текстового результата.');
  return { text, model: normalizedModel, citations: extractCitationUrls(response), usage: response.usage || null, rawStatus: response.status || '' };
}

module.exports = {
  DEFAULT_BASE_URL, DEFAULT_CHAT_MODEL, DEFAULT_SEARCH_MODEL,
  normalizeBaseUrl, normalizeModel, readResponseText, extractCitationUrls,
  parseJsonPayload, chatCompletion, webResearch
};
