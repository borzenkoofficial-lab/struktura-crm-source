'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'theme-boot.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'struktura-design-system.css'), 'utf8');
const smoke = fs.readFileSync(path.join(__dirname, 'electron-layout-smoke.cjs'), 'utf8');

test('theme bootstrap runs before styles to prevent first-paint theme flash', () => {
  assert.ok(html.indexOf('theme-boot.js') < html.indexOf('styles.css'));
  assert.ok(boot.includes('localStorage.getItem(KEY)'));
  assert.ok(boot.includes('document.documentElement.dataset.theme = theme'));
});

test('theme switch is accessible and persistent', () => {
  assert.ok(html.includes('id="themeToggleBtn"'));
  assert.ok(renderer.includes("skol-theme-preference-v1"));
  assert.ok(renderer.includes("button.setAttribute('aria-pressed'"));
  assert.ok(renderer.includes("$('themeToggleBtn')?.addEventListener('click'"));
  assert.ok(renderer.includes("appTheme === 'dark' ? 'light' : 'dark'"));
});

test('design system defines semantic dark and light tokens and reduced motion', () => {
  for (const token of ['--st-bg', '--st-surface', '--st-line', '--st-ink', '--st-muted', '--st-accent', '--st-positive', '--st-warning', '--st-danger']) {
    assert.ok(css.includes(token), 'missing token ' + token);
  }
  assert.ok(css.includes('html[data-theme="dark"]'));
  assert.ok(css.includes('html[data-theme="light"]'));
  assert.ok(css.includes('prefers-reduced-motion: reduce'));
  assert.ok(css.includes('.dashboard-hero.welcome'));
  assert.ok(css.includes('.data-table thead th'));
});

test('existing page routes and feature code remain in place', () => {
  for (const id of ['view-dashboard', 'view-leads', 'view-clients', 'view-projects', 'view-production', 'view-finance', 'view-prospects', 'view-tasks', 'view-reports']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing existing workspace ' + id);
  }
  assert.ok(renderer.includes('function showView(name, options = {})'));
});

test('PI companion does not automatically cover workspaces and uses a technical mark', () => {
  assert.ok(renderer.includes('if (unseen && options.force === true && canAutoOpen)'));
  assert.ok(!renderer.includes('unseen.severity === \'danger\' || unseen.priority >= 88'));
  assert.ok(html.includes('class="pi-avatar-mark"'));
  assert.ok(!html.includes('class="pi-avatar-face"'));
  assert.ok(css.includes('.main { padding-bottom: 104px !important; }'));
});

test('real Electron geometry smoke guards the Dock rail and PI companion against overlap', () => {
  assert.ok(smoke.includes('metrics.mainBounds.bottom <= metrics.dockBounds.top + 1'));
  assert.ok(smoke.includes('metrics.piPopoverHidden'));
  assert.ok(smoke.includes('metrics.piAvatarOverlapsDock'));
  assert.ok(smoke.includes('metrics.piAvatarOverlapsWorkspace'));
});

test('dark theme explicitly covers legacy light surfaces in core workspaces', () => {
  for (const selector of [
    'html[data-theme="dark"] #view-leads .records-panel',
    'html[data-theme="dark"] #view-engineering .eng-card',
    'html[data-theme="dark"] #view-finance .finance-card',
    'html[data-theme="dark"] #view-settings .settings-card',
    'html[data-theme="dark"] #view-browser .browser-inspector'
  ]) assert.ok(css.includes(selector), 'missing dark surface override: ' + selector);
  assert.ok(smoke.includes('themeSurfaceLeaks'));
});

test('dark theme fixes legacy split panes, settings fields and Dock icon system', () => {
  assert.ok(css.includes('html[data-theme="dark"] .records-workspace'));
  assert.ok(css.includes('html[data-theme="dark"] #view-settings input'));
  assert.ok(css.includes('#skolDock .dock-item.active .dock-icon'));
  assert.ok(smoke.includes('.records-panel,.records-workspace,.records-list'));
});

test('dashboard places actionable attention signals before finance and historical progress', () => {
  const attention = html.indexOf('data-dashboard-widget="attention"');
  const finance = html.indexOf('data-dashboard-widget="finance"');
  const progress = html.indexOf('data-dashboard-widget="progress"');
  assert.ok(attention > 0 && attention < finance && finance < progress);
  assert.ok(html.includes('id="dashboardAttention"'));
  assert.ok(html.includes('id="piHomeSummary"'));
});

test('dashboard refresh exposes an accessible pending state and always restores the control', () => {
  assert.ok(renderer.includes("dashboardView?.setAttribute('aria-busy', 'true')"));
  assert.ok(renderer.includes("refreshButton.setAttribute('aria-busy', 'true')"));
  assert.ok(renderer.includes("refreshButton.disabled = false"));
  assert.ok(renderer.includes("dashboardView?.removeAttribute('aria-busy')"));
  assert.ok(css.includes('#view-dashboard .dashboard-refresh-glyph'));
});

test('dashboard chart motion respects reduced-motion preferences', () => {
  assert.ok(css.includes('@keyframes st-dashboard-bar-enter'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('#view-dashboard .dashboard-ring-progress'));
});

test('lead, client and project rows are keyboard-selectable and expose selection state', () => {
  for (const kind of ['lead', 'client', 'project']) {
    assert.ok(renderer.includes('data-record-kind="' + kind + '"'));
  }
  assert.ok(renderer.includes('tabindex="0" aria-current='));
  assert.ok(renderer.includes("document.addEventListener('keydown', event => {"));
  assert.ok(renderer.includes("row.setAttribute('aria-current', selected ? 'true' : 'false')"));
});

test('record tables use sticky semantic headers and visible selection/focus states', () => {
  assert.ok(css.includes('.records-list .data-table thead th'));
  assert.ok(css.includes('position: sticky'));
  assert.ok(css.includes('tr.record-row.is-selected'));
  assert.ok(css.includes('tr.record-row:focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion'));
});

test('finance payment and expense records support keyboard selection with current-item semantics', () => {
  assert.ok(renderer.includes('data-finance-kind="payment"'));
  assert.ok(renderer.includes('data-finance-kind="expense"'));
  assert.ok(renderer.includes('tabindex="0" aria-current='));
  assert.ok(renderer.includes("selectFinanceRecord(row.dataset.financeKind, row.dataset.financeId)"));
  assert.ok(renderer.includes("row.setAttribute('aria-current', selected ? 'true' : 'false')"));
});

test('finance dashboard surfaces use responsive semantic token layouts', () => {
  for (const selector of ['#view-finance .finance-grid', '#view-finance .income-period-grid', '#view-finance .finance-forecast-grid', '#view-finance .finance-alert']) {
    assert.ok(css.includes(selector), 'missing finance visual system selector ' + selector);
  }
  assert.ok(css.includes('@media (max-width: 700px)'));
});

test('production workspace uses a responsive plan/fact hierarchy and reduced-motion progress', () => {
  for (const selector of ['#view-production .production-stats', '#view-production .production-project-grid', '#view-production .production-model-note', '#view-production #productionHistory .data-table thead th']) {
    assert.ok(css.includes(selector), 'missing production layout selector ' + selector);
  }
  assert.ok(css.includes('@keyframes st-production-progress-enter'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(html.includes('id="productionProjectCards"'));
  assert.ok(renderer.includes('forecast.teamShiftsRemaining'));
});

test('engineering workspace separates inputs, assumptions and calculated output', () => {
  for (const selector of ['#view-engineering .eng-hero', '#view-engineering .eng-stat-grid', '#view-engineering .eng-layout', '#view-engineering .eng-form-grid', '#view-engineering .eng-note']) {
    assert.ok(css.includes(selector), 'missing engineering layout selector ' + selector);
  }
  assert.ok(css.includes('@media (max-width: 1180px)'));
  assert.ok(html.includes('id="engCalculateBtn"'));
  assert.ok(html.includes('id="engWarnings"'));
  assert.ok(html.includes('id="engProjectCalendar"'));
});

test('prospects workspace presents search tools, evidence and commercial orders as one responsive research system', () => {
  for (const selector of ['#view-prospects .crawler-panel', '#view-prospects .order-radar-metrics', '#view-prospects .commercial-order-card', '#view-prospects .commercial-order-actions', '#view-prospects .radar-item']) {
    assert.ok(css.includes(selector), 'missing prospects workspace selector ' + selector);
  }
  assert.ok(html.includes('id="commercialOrdersList"'));
  assert.ok(renderer.includes('source_page_text'));
  assert.ok(renderer.includes('fact_evidence'));
});

test('reports use semantic KPI cards and an evidence note without altering report data', () => {
  assert.ok(css.includes('#view-reports .report-stats'));
  assert.ok(css.includes('#view-reports .report-data-note'));
  assert.ok(html.includes('id="sourceReport"'));
  assert.ok(renderer.includes('window.crm.reportsSummary()'));
});

test('settings cards and local data actions have a responsive administration layout', () => {
  for (const selector of ['#view-settings .settings-page-grid', '#view-settings .settings-card-body', '#view-settings .settings-data-actions', '#view-settings .about-settings-details']) {
    assert.ok(css.includes(selector), 'missing settings layout selector ' + selector);
  }
  assert.ok(css.includes('@media (max-width: 820px)'));
  assert.ok(html.includes('id="backupBtn"'));
  assert.ok(html.includes('id="restoreBackupBtn"'));
});

test('tasks and integrated browser use responsive, theme-aware work surfaces', () => {
  for (const selector of ['#view-tasks .task-stats', '#view-tasks .table-panel', '#view-browser .browser-toolbar', '#view-browser .browser-workspace', '#view-browser .browser-inspector']) {
    assert.ok(css.includes(selector), 'missing workspace selector ' + selector);
  }
  assert.ok(html.includes('id="tasksTable"'));
  assert.ok(html.includes('id="browserAddressForm"'));
  assert.ok(html.includes('id="browserInspectorContent"'));
  assert.ok(css.includes('@media (max-width: 1100px)'));
});

test('only the unified Dock command palette handles Ctrl+K and the command button', () => {
  assert.ok(!html.includes('commandPaletteDialog'));
  assert.ok(!renderer.includes('commandPaletteDialog'));
  assert.ok(renderer.includes("$('openCommandPaletteBtn')?.addEventListener('click', dockOpenPalette)"));
  assert.ok(renderer.includes("event.key.toLowerCase() === 'k'"));
  assert.ok(html.includes('id="dockPaletteDialog"'));
  assert.ok(html.includes('id="dockPaletteSearch"'));
});

test('dark theme covers legacy PI summary, order evidence cards and inline notices', () => {
  for (const selector of ['.pi-home-summary', '.pi-alert', '.pi-no-alerts', '.pi-order-summary', '.commercial-order-card', '.notice.inline-notice']) {
    assert.ok(css.includes('html[data-theme="dark"]') && css.includes(selector), 'missing dark-theme parity for ' + selector);
  }
  assert.ok(smoke.includes('.pi-home-summary,.pi-alert,.pi-no-alerts,.pi-order-summary'));
  assert.ok(smoke.includes('.commercial-order-card'));
  assert.ok(smoke.includes('.notice.inline-notice'));
});

test('dark theme styles the Brave API status and manual search query tiles', () => {
  assert.ok(css.includes('#view-prospects :where(.search-api-status, .domain-query)'));
  assert.ok(css.includes('html[data-theme="dark"] #view-prospects .domain-query strong'));
  assert.ok(smoke.includes('.domain-query,.search-api-status'));
});


test('dashboard workspace exposes persistent widget catalogue, ordering and resize controls', () => {
  assert.ok(html.includes('id="dashboardWidgetGrid"'));
  assert.ok(html.includes('id="dashboardCustomizeDialog"'));
  assert.ok(html.includes('id="dashboardWidgetCatalog"'));
  for (const id of ['kpis','attention','finance','pipeline','portfolio','progress','recent']) assert.ok(html.includes('data-dashboard-widget="' + id + '"'), 'missing dashboard widget ' + id);
  assert.ok(renderer.includes("const DASHBOARD_LAYOUT_KEY = 'struktura-dashboard-layout-v1'"));
  assert.ok(renderer.includes('dashboardApplyLayout'));
  assert.ok(renderer.includes('dashboard-size-half'));
  assert.ok(renderer.includes('dashboardLayoutReset'));
  assert.ok(renderer.includes('dashboardSaveLayout'));
});
test('dashboard business charts are derived from actual CRM lead and project statuses', () => {
  assert.ok(renderer.includes('dashboardRenderBusinessCharts(snapshot)'));
  assert.ok(renderer.includes("dashboardRenderStatusChart('dashboardPipelineChart'"));
  assert.ok(renderer.includes("dashboardRenderStatusChart('dashboardPortfolioChart'"));
  assert.ok(html.includes('id="dashboardPipelineChart"'));
  assert.ok(html.includes('id="dashboardPortfolioChart"'));
});


test('dashboard personalisation includes KPI card preferences and cashflow chart controls', () => {
 assert.ok(html.includes('id="dashboardKpiPreferences"'));
 assert.ok(html.includes('data-cashflow-months="12"'));
 assert.ok(html.includes('data-cashflow-series="income"'));
 assert.ok(renderer.includes('dashboardApplyKpiPreferences'));
 assert.ok(renderer.includes('dashboardCashflowMonths = 6'));
 assert.ok(renderer.includes('dashboardCashflowVisibility'));
 assert.ok(css.includes('.dashboard-kpi-options'));
});


test('dashboard widgets can be reordered without drag and drop using accessible move controls', () => {
 assert.ok(renderer.includes('dashboard-move-up'));
 assert.ok(renderer.includes('dashboard-move-down'));
 assert.ok(renderer.includes('dashboardLayout.order='));
 assert.ok(renderer.includes('aria-label="Переместить блок выше"'));
});


test('dashboard exposes persistent workspace presets and information density controls', () => {
 assert.ok(html.includes('data-dashboard-preset="overview"'));
 assert.ok(html.includes('data-dashboard-preset="sales"'));
 assert.ok(html.includes('data-dashboard-preset="finance"'));
 assert.ok(html.includes('data-dashboard-density="compact"'));
 assert.ok(renderer.includes("dashboardLayout.preset=preset"));
 assert.ok(renderer.includes("dashboardLayout.density=button.dataset.dashboardDensity"));
 assert.ok(css.includes('.dashboard-density-compact'));
});

test('precision pass keeps dense data tables and form controls readable', () => {
  assert.match(css, /\.data-table\s*\{[^}]*font-size:\s*13px\s*!important/s);
  assert.match(css, /\.data-table thead th\s*\{[^}]*font-size:\s*10px\s*!important/s);
  assert.match(css, /\.data-table tbody td\s*\{[^}]*line-height:\s*1\.5\s*!important/s);
  assert.match(css, /min-height:\s*40px/);
  assert.match(css, /min-height:\s*96px/);
  assert.ok(css.includes('font-variant-numeric: tabular-nums'));
});

test('native dialogs share theme-aware surfaces, readable fields and compact mobile geometry', () => {
  assert.ok(css.includes('dialog.modal,'));
  assert.ok(css.includes('dialog.modal::backdrop'));
  assert.ok(css.includes('dialog.modal :where(input,select,textarea)'));
  assert.ok(css.includes('html[data-theme="light"] dialog.modal::backdrop'));
  assert.ok(css.includes('@media (max-width: 640px)'));
  assert.ok(html.includes('<dialog id="leadDialog"'));
});

test('Windows installer validation runs for test-branch pushes as well as pull requests', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-windows.yml'), 'utf8');
  assert.ok(workflow.includes("github.event_name == 'push' && startsWith(github.ref, 'refs/heads/test/')"));
  assert.ok(workflow.includes("github.event_name == 'pull_request'"));
});
