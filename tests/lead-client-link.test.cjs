'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');

test('lead form exposes a client selector and loads existing clients for create and edit', () => {
  assert.match(html, /<select name="client_id" id="leadClientSelect">/);
  assert.match(renderer, /async function populateLeadClientOptions\(clientId = ''\)/);
  assert.match(renderer, /await populateLeadClientOptions\(lead\.client_id\)/);
  assert.match(renderer, /'id','title','client_id','service','source','budget_rub','address','notes'/);
});

test('lead create and update persist a validated client relation', () => {
  assert.match(main, /INSERT INTO leads\(client_id,title,service,source,budget_rub,address,notes\)/);
  assert.match(main, /UPDATE leads SET client_id=\?, title=\?, service=\?, source=\?, budget_rub=\?, address=\?, notes=\?/);
  assert.equal((main.match(/Выбранный клиент не найден\./g) || []).length >= 2, true);
  assert.match(main, /SELECT l\.\*, c\.name client_name FROM leads l LEFT JOIN clients c ON c\.id=l\.client_id/);
});

test('lead list shows client and client name participates in search', () => {
  assert.match(renderer, /<th>Клиент<\/th>/);
  assert.match(renderer, /esc\(l\.client_name \|\| '—'\)/);
  assert.match(renderer, /l\.client_name \|\| ''/);
});
