const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.cjs'), 'utf8');
const start = main.indexOf("ipcMain.handle('estimate:exportQuotePdf'");
const end = main.indexOf("ipcMain.handle('updates:status'", start);
assert.ok(start >= 0 && end > start, 'quote PDF export handler exists');
const quote = main.slice(start, end);

test('commercial proposal uses the requested restrained architectural palette', () => {
  assert.match(quote, /--graphite:#25282B/i);
  assert.match(quote, /--paper:#F5F3EF/i);
  assert.match(quote, /--terracotta:#B66B4B/i);
  assert.doesNotMatch(quote, /linear-gradient\([^)]*(?:#00f|#0ff|#f0f|neon)/i);
  assert.doesNotMatch(quote, /backdrop-filter|glassmorphism/i);
});

test('PDF embeds content-specific technical illustrations directly in the document HTML', () => {
  assert.match(quote, /const coverIllustration = `<svg/);
  assert.match(quote, /const planIllustration = `<svg/);
  assert.match(quote, /const processIllustration = `<svg/);
  assert.match(quote, /\$\{coverIllustration\}/);
  assert.match(quote, /\$\{planIllustration\}/);
  assert.match(quote, /\$\{processIllustration\}/);
  assert.match(quote, /не является фотографией объекта или подтверждением ранее выполненных работ/i);
  assert.match(quote, /не представляют собой портфолио или фотографии реализованных объектов/i);
  assert.match(quote, /id="coverPhoto"[^>]*src="https:\/\/images\.unsplash\.com\//);
  assert.match(quote, /Steffen Lemmerzahl \/ Unsplash/);
  assert.match(quote, /coverIllustrationFallback/);
  assert.match(quote, /naturalWidth > 0/);
  assert.match(quote, /fallback\.hidden = false/);
  assert.match(quote, /img-src https:\/\/images\.unsplash\.com data:/);
});

test('PDF has separate cover, work scope, and execution sequence editorial pages', () => {
  assert.match(quote, /class="page cover-page"/);
  assert.match(quote, /class="page scope-page"/);
  assert.match(quote, /class="page process-page"/);
  assert.match(quote, /Состав и стоимость|Что входит в работу/);
  assert.match(quote, /Подготовка площадки/);
  assert.match(quote, /Основной этап/);
  assert.match(quote, /Передача результата/);
  assert.match(quote, /display:table-header-group|display:table-header-group/);
  assert.match(quote, /Итого к согласованию/);
  assert.match(quote, /СРЕДА/);
});

test('quote values and client details remain data-driven and escaped in the PDF', () => {
  for (const placeholder of [
    '${quoteEscape(title)}',
    '${quoteEscape(customer || \'Не указан\')}',
    '${quoteEscape(address || \'Адрес уточняется\')}',
    '${quoteEscape(contact || \'уточняется при согласовании\')}',
    '${quoteMoney(total)}',
    '${rows}'
  ]) assert.ok(quote.includes(placeholder), 'missing template placeholder: ' + placeholder);
});
