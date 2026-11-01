'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'src', 'theme-salesforce.css'), 'utf8');

test('core record screens expose dedicated reference-style detail panels', () => {
  for (const id of ['leadDetailPanel', 'clientDetailPanel', 'projectDetailPanel']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  for (const kind of ['lead', 'client', 'project']) {
    assert.match(renderer, new RegExp('data-record-kind="' + kind + '"'));
  }
  assert.match(renderer, /function renderRecordDetailPanel\(kind, record\)/);
  assert.match(renderer, /function selectRecord\(kind, id\)/);
});

test('all primary CRM views remain present and receive application-wide styling', () => {
  const views = [
    'dashboard', 'leads', 'clients', 'projects', 'production', 'finance',
    'browser', 'prospects', 'tasks', 'reports', 'plans', 'about', 'settings'
  ];
  for (const view of views) {
    assert.match(html, new RegExp('id="view-' + view + '"'));
    assert.match(theme, new RegExp('#view-' + view));
  }
});

test('record detail styling includes responsive split and stacked layouts', () => {
  assert.match(theme, /\.records-workspace\s*\{/);
  assert.match(theme, /\.record-detail-panel\s*\{/);
  assert.match(theme, /@media\s*\(max-width:\s*840px\)/);
  assert.match(theme, /@media\s*\(max-width:\s*600px\)/);
});
