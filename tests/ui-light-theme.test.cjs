'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'src/light-theme.css'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function luminance(hex) {
  const raw = hex.replace('#', '');
  const values = raw.match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
  const channels = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function cssToken(name) {
  const match = theme.match(new RegExp(name + ':\\s*(#[0-9a-fA-F]{6})'));
  assert.ok(match, 'light theme token ' + name + ' exists');
  return match[1];
}

test('SKOL 1.24.0 light theme is attached after every existing module stylesheet', () => {
  assert.equal(packageJson.version, '1.24.0', 'theme branch must preserve the requested application version');
  const cssLinks = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)">/g)].map((match) => match[1]);
  assert.deepEqual(cssLinks.slice(-4), [
    'styles.css',
    'engineering-calculator.css',
    'engineering-project-plan.css',
    'light-theme.css',
  ]);
});

test('all fourteen CRM workspaces remain present after the visual migration', () => {
  const actual = [...html.matchAll(/id="view-([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actual, [
    'dashboard', 'leads', 'clients', 'projects', 'production', 'engineering', 'finance',
    'browser', 'prospects', 'tasks', 'reports', 'plans', 'about', 'settings',
  ]);
});

test('light surfaces and primary controls meet WCAG AA contrast for normal text', () => {
  const surface = cssToken('--paper');
  const ink = cssToken('--ink');
  const muted = cssToken('--muted');
  const accentInk = cssToken('--accent-ink');
  const accent = cssToken('--accent');
  assert.ok(contrast(ink, surface) >= 7, 'main text contrast must be at least 7:1');
  assert.ok(contrast(muted, surface) >= 4.5, 'secondary text contrast must be at least 4.5:1');
  assert.ok(contrast(accentInk, surface) >= 4.5, 'accent text contrast must be at least 4.5:1');
  assert.ok(contrast('#ffffff', accent) >= 4.5, 'white text on primary buttons must be at least 4.5:1');
});

test('buttons, disabled states, keyboard focus and form fields have explicit light-theme styles', () => {
  assert.match(theme, /\.button\.primary[\s\S]*?color:\s*#fff/);
  assert.match(theme, /\.button:disabled[\s\S]*?background:\s*#eef1f4/);
  assert.match(theme, /button:focus-visible[\s\S]*?outline:\s*3px solid/);
  assert.match(theme, /input::placeholder, textarea::placeholder[\s\S]*?opacity:\s*1/);
  assert.match(theme, /input\[type="checkbox"\], input\[type="radio"\][\s\S]*?accent-color:/);
});

test('dark workspace shells and hero panels are replaced with light readable surfaces', () => {
  for (const selector of [
    '.sidebar {', '.welcome, #view-dashboard .welcome {', '.plans-hero {', '.about-hero {',
    '.about-pi-banner {', '.pin-lock-screen, .license-screen {', '.pin-lock-card {',
  ]) assert.ok(theme.includes(selector), 'theme includes ' + selector);
  assert.match(theme, /\.nav-item\.active[\s\S]*?color:\s*#9f4324/);
  assert.match(theme, /\.data-table th[\s\S]*?color:\s*#475467/);
});

test('the visible wordmarks use the dark asset on white surfaces', () => {
  assert.ok(html.includes('assets/skol-wordmark.svg'));
  assert.ok(!html.includes('skol-wordmark-inverse.svg'), 'inverse white wordmark must not be used on the light shell');
});
