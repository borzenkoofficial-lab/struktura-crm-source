'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../src/styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');

test('Industrial Premium design tokens define the dark graphite and emerald system', () => {
  for (const token of ['--st-bg: #0b0f12','--st-sidebar: #10161a','--st-surface: #171f24','--st-surface-raised: #202b31','--st-text: #f1f5f4','--st-accent: #27d7a0','--st-warning: #f2b84b','--st-danger: #ff6470']) assert.ok(css.includes(token), 'missing design token: ' + token);
  assert.match(css, /color-scheme:\s*dark/);
});

test('global visual layer styles navigation, data tables, forms and dialogs consistently', () => {
  for (const selector of ['.sidebar','.nav-item.active','.button.primary','.stat-card','.data-table th','.data-table td','.modal, dialog.modal','.modal input','.modal select','.modal textarea','.settings-card']) assert.ok(css.includes(selector), 'missing global style target: ' + selector);
  assert.match(css, /dialog\.modal\[open\]\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.ok(css.lastIndexOf('dialog.modal,dialog.modal[open]{background-color:#fff!important') < css.lastIndexOf('.modal, dialog.modal, dialog.modal[open] {'), 'dark dialog override must follow the legacy light override');
});

test('motion system respects reduced-motion preferences and keeps fallback styling', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition-duration:\s*\.01ms\s*!important/);
  assert.match(css, /@supports not[\s\S]*?backdrop-filter/);
});

test('visual refresh does not replace the existing app views or renderer entry points', () => {
  for (const id of ['view-dashboard','view-leads','view-clients','view-projects','view-production','view-finance','view-prospects','view-tasks','view-reports','view-settings','view-about']) assert.ok(html.includes('id="' + id + '"'), 'existing view missing: ' + id);
  assert.match(html, /src="renderer\.js"/);
  assert.match(html, /src="production-intelligence\.js"/);
  assert.match(html, /id="pinLockScreen"/);
});

test('legacy production, browser, estimator and command-palette surfaces receive the dark tokens', () => {
  for (const selector of ['.finance-card, .browser-shell, .browser-inspector','.production-stats article, .production-project-card','.estimate-lines-table th','.command-palette','.app-shell input:not([type="checkbox"]):not([type="radio"])']) assert.ok(css.includes(selector), 'missing dark surface rule: ' + selector);
  assert.match(css, /\.browser-address-form input\s*\{[^}]*background:\s*transparent\s*!important/);
  assert.match(css, /\.production-project-card:hover/);
});

test('global interaction layer covers keyboard focus, disabled controls, modal lifecycle and reduced motion', () => {
  for (const selector of [':focus-visible', ':disabled', '.data-table tbody tr:hover td', 'dialog.modal::backdrop', '.modal input[type="checkbox"]', '.command-palette input:focus', '.toast.success', '.toast.error']) assert.ok(css.includes(selector), 'missing interaction rule: ' + selector);
  assert.match(css, /\.app-shell \.modal\.command-palette input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):focus/);
  assert.match(css, /@keyframes\s+st-dialog-enter/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/);
  assert.match(css, /@supports not\s*\(backdrop-filter:\s*blur\(8px\)\)/);
});

test('every workspace view and HTML dialog remains covered by the shared visual layer', () => {
  const views = [...html.matchAll(/id="view-[^"]+"/g)];
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>/g)].map(match => match[0]);
  assert.equal(views.length, 13, 'all 13 workspace views remain present');
  assert.equal(dialogs.length, 17, 'all 17 dialogs remain present');
  assert.ok(dialogs.every(dialog => /class="[^"]*\bmodal\b/.test(dialog)), 'every dialog uses the shared modal class');
  assert.match(css, /\.app-shell \.modal,[\s\S]*?\.app-shell dialog\.modal/);
});

test('navigation and all active workspace views use the shared motion system', () => {
  assert.match(css, /\.app-shell \.nav-item\.active::before/);
  assert.match(css, /\.app-shell \.view\.active\s*\{\s*animation:\s*st-view-enter/);
  assert.match(css, /@keyframes\s+st-view-enter/);
});


test('system reduced-motion preference constrains animations and transitions across all workspace surfaces', () => {
  const block = css.match(/@media\\s*\\(prefers-reduced-motion:\\s*reduce\\)[\\s\\S]*?animation-duration:\\s*0\\.01ms\\s*!important;[\\s\\S]*?transition-duration:\\s*0\\.01ms\\s*!important;[\\s\\S]*?transition-delay:\\s*0ms\\s*!important;[\\s\\S]*?\\}/);
  assert.ok(block, 'global reduced-motion override must cap animations and transitions');
  for (const selector of ['.app-shell *', '.app-shell *::before', '.app-shell *::after', '#pinLockScreen *']) assert.ok(block[0].includes(selector), 'reduced-motion override misses ' + selector);
});
