'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPinnedLookup, isPublicAddress } = require('../src/site-crawler.cjs');

test('pinned crawler lookup returns the validated IP without performing a new DNS lookup', async () => {
  const lookup = createPinnedLookup('public.example', ['93.184.216.34']);
  const result = await new Promise((resolve, reject) => lookup('public.example', {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(result, { address: '93.184.216.34', family: 4 });
});

test('pinned crawler lookup refuses non-public pinned addresses', () => {
  assert.throws(() => createPinnedLookup('public.example', ['127.0.0.1']), /проверенный публичный IP/);
  assert.equal(isPublicAddress('127.0.0.1'), false);
});
