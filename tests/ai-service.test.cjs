'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonObject, createAnyModelClient } = require('../src/ai-service.cjs');
const { parseDuckDuckGo, parseBing, safeResult, searchPublicWeb } = require('../src/public-web-search.cjs');

test('AI JSON parser accepts fenced and embedded JSON', () => {
  assert.deepEqual(parseJsonObject('```json\n{"items":[1]}\n```'), { items: [1] });
  assert.deepEqual(parseJsonObject('Result: {"ok":true}'), { ok: true });
});
test('AI JSON parser rejects non-JSON and array roots', () => {
  assert.throws(() => parseJsonObject('plain text'), /неверном формате/);
  assert.throws(() => parseJsonObject('[1,2]'), /неверном формате/);
});
test('AnyModel client sends OpenAI-compatible request', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        model: 'am/free',
        choices: [{ message: { content: 'OK' } }],
        usage: { total_tokens: 4 }
      })
    };
  };
  const client = createAnyModelClient({ fetchImpl });
  const result = await client.complete({ apiKey: 'test-key', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(request.url, 'https://anymodel.org/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(request.options.body).stream, false);
  assert.equal(result.content, 'OK');
});
test('AnyModel authentication failure is actionable', async () => {
  const client = createAnyModelClient({ fetchImpl: async () => ({ status: 401, ok: false }) });
  await assert.rejects(() => client.complete({ apiKey: 'test-key', messages: [{ role: 'user', content: 'x' }] }), /отклонил ключ/);
});
test('DuckDuckGo parser extracts external links', () => {
  const html = '<div class="result"><a class="result__a" href="https://example.org/path">Example Company</a><a class="result__snippet">Office contractor</a></div>';
  const rows = parseDuckDuckGo(html, 'contractor');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://example.org/path');
});
test('Bing parser extracts organic results', () => {
  const html = '<li class="b_algo"><h2><a href="https://example.org/">Example</a></h2><p>Description</p></li>';
  const rows = parseBing(html, 'company');
  assert.equal(rows[0].title, 'Example');
});
test('search result validator rejects unsafe and engine links', () => {
  assert.equal(safeResult('javascript:alert(1)', 'bad', '', 'test', ''), null);
  assert.equal(safeResult('https://duckduckgo.com/?q=x', 'bad', '', 'test', ''), null);
  assert.equal(safeResult('http://127.0.0.1/private', 'local', '', 'test', ''), null);
  assert.equal(safeResult('http://localhost:8080/private', 'local', '', 'test', ''), null);
});
test('public search falls back when first engine has no parsed results', async () => {
  let calls = 0;
  const result = await searchPublicWeb('test query', {
    fetchImpl: async () => ({
      ok: true,
      text: async () => ++calls === 1
        ? '<html>captcha</html>'
        : '<li class="b_algo"><h2><a href="https://example.org/">Example</a></h2></li>'
    })
  });
  assert.equal(result.engine, 'Bing');
  assert.equal(result.results.length, 1);
});
