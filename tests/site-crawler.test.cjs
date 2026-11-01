'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicAddress, validatePublicUrl, plainText, extractPage, robotsAllows, crawlSites } = require('../src/site-crawler.cjs');

test('crawler rejects loopback, private and link-local IP addresses', () => {
  for (const ip of ['127.0.0.1', '10.0.0.4', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
});

test('crawler rejects unsafe URL schemes, credentials and local IP URLs', async () => {
  await assert.rejects(validatePublicUrl('file:///etc/passwd'), /только HTTP и HTTPS/i);
  await assert.rejects(validatePublicUrl('https://user:pass@example.com'), /логином или паролем/i);
  await assert.rejects(validatePublicUrl('http://127.0.0.1'), /непубличные IP/i);
  await assert.rejects(validatePublicUrl('http://169.254.169.254/latest/meta-data'), /непубличные IP/i);
});

test('HTML text extraction tolerates malformed numeric entities', () => {
  assert.doesNotThrow(() => plainText('Компания &#999999999999999999999; телефон +7 999 123-45-67'));
  assert.match(plainText('A&#x110000;B'), /A�B/);
  assert.match(plainText('A&#xD800;B'), /A�B/);
  const result = extractPage('<title>ООО &#999999999999999999999;</title><p>mail@example.org</p>', 'https://example.org/');
  assert.match(result.title, /ООО �/);
  assert.deepEqual(result.emails, ['mail@example.org']);
});

test('robots rules respect the longest matching path and allow override', () => {
  const robots = 'User-agent: *\nDisallow: /\nAllow: /public/\nDisallow: /public/private';
  assert.equal(robotsAllows(robots, '/'), false);
  assert.equal(robotsAllows(robots, '/public/page'), true);
  assert.equal(robotsAllows(robots, '/public/private/page'), false);
  assert.equal(robotsAllows('', '/anything'), true);
});

test('crawler handles missing or malformed seed input without throwing', async () => {
  assert.deepEqual(await crawlSites(null), { prospects: [], pagesChecked: 0, errors: [], checkedUrls: [] });
  assert.deepEqual(await crawlSites({ url: 'https://example.org' }, null), { prospects: [], pagesChecked: 0, errors: [], checkedUrls: [] });
});
