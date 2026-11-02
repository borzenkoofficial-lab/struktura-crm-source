'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_BASE_URL, normalizeBaseUrl, normalizeModel, readResponseText,
  extractCitationUrls, parseJsonPayload, chatCompletion, webResearch
} = require('../src/ai-service.cjs');

test('locks the API credential to the official HTTPS AnyModel endpoint', () => {
  assert.equal(normalizeBaseUrl(DEFAULT_BASE_URL), DEFAULT_BASE_URL);
  assert.throws(() => normalizeBaseUrl('http://anymodel.org/v1'), /HTTPS/);
  assert.throws(() => normalizeBaseUrl('https://example.com/v1'), /официальный/);
  assert.throws(() => normalizeBaseUrl('https://user:pass@anymodel.org/v1'), /официальный/);
});

test('validates model identifiers and keeps configured route names intact', () => {
  assert.equal(normalizeModel('xai/grok-4.7', 'am/free'), 'xai/grok-4.7');
  assert.equal(normalizeModel('', 'am/free'), 'am/free');
  assert.throws(() => normalizeModel('https://evil.test', 'am/free'), /идентификатор/);
});

test('parses strict JSON, fenced JSON and JSON embedded in explanatory text', () => {
  assert.deepEqual(parseJsonPayload('{"results":[1,2]}'), { results: [1, 2] });
  assert.deepEqual(parseJsonPayload('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(parseJsonPayload('Результат:\n{"items":[{"name":"A"}]}\nГотово.'), { items: [{ name: 'A' }] });
  assert.throws(() => parseJsonPayload('не JSON'), /некорректный JSON/);
});

test('reads Responses API output text and URL citations', () => {
  const payload = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"results":[]}', annotations: [{ type: 'url_citation', url: 'https://example.org/tender/1', title: 'Tender' }] }] }] };
  assert.equal(readResponseText(payload), '{"results":[]}');
  assert.deepEqual(extractCitationUrls(payload), [{ url: 'https://example.org/tender/1', title: 'Tender' }]);
});

test('calls AnyModel chat completions with the encrypted-key bearer header contract', async () => {
  let request;
  const result = await chatCompletion({
    apiKey: 'test-anymodel-key-123',
    model: 'am/free',
    prompt: 'Ответь OK',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 2 } }) };
    }
  });
  assert.equal(request.url, 'https://anymodel.org/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-anymodel-key-123');
  assert.equal(JSON.parse(request.options.body).model, 'am/free');
  assert.equal(result.text, 'OK');
});

test('calls Responses API with real web_search tool and returns verifiable citations', async () => {
  let request;
  const payload = { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"results":[{"name":"Example"}]}', annotations: [{ type: 'url_citation', url: 'https://example.org/order/4', title: 'Tender notice' }] }] }] };
  const result = await webResearch({
    apiKey: 'test-anymodel-key-123',
    prompt: 'Найди закупку и верни JSON',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => payload };
    }
  });
  assert.equal(request.url, 'https://anymodel.org/v1/responses');
  assert.deepEqual(JSON.parse(request.options.body).tools, [{ type: 'web_search' }]);
  assert.equal(result.citations[0].url, 'https://example.org/order/4');
  assert.match(result.text, /Example/);
});

test('translates authentication, balance and rate limit failures', async () => {
  for (const [status, expected] of [[401, /отклонил ключ/], [402, /недостаточно средств/], [429, /ограничил частоту/]]) {
    await assert.rejects(() => chatCompletion({
      apiKey: 'test-anymodel-key-123', prompt: 'test',
      fetchImpl: async () => ({ ok: false, status, json: async () => ({}) })
    }), expected);
  }
  await assert.rejects(() => chatCompletion({ apiKey: '', prompt: 'test' }), /API-ключ AnyModel/);
});
