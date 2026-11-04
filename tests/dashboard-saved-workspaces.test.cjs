'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../src/struktura-design-system.css'), 'utf8');

test('named dashboard workspaces expose save, load and delete controls', () => {
  for (const id of ['dashboardWorkspaceName', 'dashboardWorkspaceSave', 'dashboardWorkspaceSelect', 'dashboardWorkspaceLoad', 'dashboardWorkspaceDelete']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'dashboard dialog contains ' + id);
  }
  for (const handler of ['dashboardSaveNamedWorkspace', 'dashboardLoadNamedWorkspace', 'dashboardDeleteNamedWorkspace', 'dashboardRenderSavedWorkspaces']) {
    assert.match(renderer, new RegExp('function ' + handler + '\\('), handler + ' is implemented');
  }
  assert.match(renderer, /DASHBOARD_SAVED_WORKSPACES_KEY\s*=\s*'struktura-dashboard-workspaces-v1'/);
  assert.match(renderer, /items\.length>=12/, 'saved workspace count is capped');
  assert.match(renderer, /dashboardNormalizeSavedLayout/, 'loaded workspace data is normalized against known widget IDs');
  assert.match(styles, /\.dashboard-saved-workspaces-controls/, 'saved workspace controls have dedicated responsive styling');
});

test('named workspace controls are wired to real user interactions', () => {
  assert.match(renderer, /dashboardWorkspaceSave.*addEventListener\('click',dashboardSaveNamedWorkspace\)/);
  assert.match(renderer, /dashboardWorkspaceLoad.*addEventListener\('click',dashboardLoadNamedWorkspace\)/);
  assert.match(renderer, /dashboardWorkspaceDelete.*addEventListener\('click',dashboardDeleteNamedWorkspace\)/);
  assert.match(renderer, /dashboardWorkspaceName.*addEventListener\('keydown'/);
});
