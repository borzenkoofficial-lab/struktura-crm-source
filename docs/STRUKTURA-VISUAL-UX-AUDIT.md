# STRUKTURA SOURCE — visual / UX audit

Date: 2026-11-04  
Audit base: test/dock-visual-audit  
Implementation branch: test/visual-experience-transformation

## Product and runtime baseline

- Desktop application: Electron 35, Node.js, vanilla JavaScript and HTML/CSS.
- Persistence: local SQLite through better-sqlite3; do not migrate or rename the database as part of visual work.
- UI entry points: src/index.html, src/renderer.js, src/main.cjs, src/preload.cjs.
- Existing test commands: npm test, npm run test:ui, npm run dist:win.
- The UI is not a React application. Preserve the current stack and safe preload/IPC boundary.

## Workspace inventory

All 12 existing destinations are present in the current HTML/navigation:

1. dashboard — business overview and actual CRM metrics.
2. leads — lead pipeline and record detail.
3. clients — client directory and record detail.
4. projects — objects, estimates and project records.
5. production — production plans, shifts and plan/fact.
6. engineering — engineering calculator and calculation history.
7. finance — receipts, expenses and cash flow.
8. browser — integrated browser and public-site research.
9. prospects — order/prospect discovery and source review.
10. tasks — operational task planning.
11. reports — reports.
12. settings — security, local data, backups, integrations and product settings.

The interface also contains 21 native dialog elements and a persistent bottom Dock with the 12 primary destinations. Do not replace the Dock or remove destinations without a workflow-level reason.

## Confirmed structural findings

The application currently loads six CSS files, including four broad application-level layers:

| File | Size | Rules ({) | Media queries | !important |
|---|---:|---:|---:|---:|
| styles.css | 163,593 chars | 1,926 | 72 | 62 |
| theme-salesforce.css | 31,710 chars | 393 | 9 | 15 |
| theme-salesforce-light.css | 45,188 chars | 479 | 6 | 434 |
| ui-layout-hardening.css | 96,424 chars | 721 | 43 | 570 |

This is a confirmed cascade-maintenance problem: the light theme and layout-hardening layer contain many high-priority overrides. Adding another page-specific override layer would increase regressions and make theme parity harder to maintain.

Additional findings:

- The original dark and light stylesheets are both loaded globally. A deterministic theme state must therefore be applied before first paint and the final theme layer must own the shared semantic surfaces.
- The current renderer changes workspaces through showView(); navigation and data loaders are already wired to real workflows. Keep those loaders and the feature/license gates intact.
- Existing CSS already includes responsive rules and reduced-motion handling, but the rules are distributed across multiple files.
- The current navigation is a bottom Dock, not a conventional left sidebar. The redesign should refine this established interaction model rather than silently replace it.
- The dashboard already uses live CRM element IDs and contains explicit copy distinguishing actual local records from demonstration metrics. Preserve those data bindings.

## Initial severity ranking

### P0 — foundation
- Establish one semantic token contract for surfaces, text, borders, semantic states, radii, spacing and motion.
- Make dark/light theme state explicit, persistent and available before styles paint.
- Reduce the need for new !important overrides; do not perform a risky wholesale CSS rewrite in one commit.

### P1 — application shell
- Standardize Dock, topbar, page title, workspace width, focus states and command access.
- Establish consistent page-entry motion and dialog transitions.
- Keep keyboard navigation, active destination, compact window behavior and accessible names.

### P1 — data-heavy workspaces
- Audit tables, split record panes, filters, toolbars, selection, sorting, empty/loading/error states and contextual actions across leads, clients, projects, production, finance and prospects.
- Preserve real values and all current CRUD paths.

### P2 — specialist workspaces
- Audit engineering calculator, integrated browser, reports and settings independently; these modules have distinct information architectures and should not be forced into generic cards.

### P2 — motion and feedback
- Replace inconsistent local transitions with a restrained motion scale.
- Respect prefers-reduced-motion; never animate fake AI activity or invent data.

## Changes introduced in this branch

- theme-boot.js: reads the saved theme before stylesheet evaluation to avoid first-paint theme flash.
- struktura-design-system.css: introduces semantic technical-premium tokens, shared interaction states, page/dialog motion and legacy dark-surface coverage.
- Header theme control: toggles and persists dark/light mode; exposes an accessible label and aria-pressed.
- tests/design-system.test.cjs: regression contracts for bootstrap ordering, theme persistence, tokens, reduced motion and preservation of existing workspaces.

## Validation gate

This branch is intentionally separate from main. It must pass the repository unit suite and the Windows Electron responsive UI job. The installed app still needs visual verification on Windows at the target resolutions and DPI settings. Do not merge based on static CSS inspection alone.

## Visual evidence added to the audit

The latest available real-Electron screenshots from the successful Windows run 1270 (2026-11-02) reveal overlay defects not covered by the current geometry assertions:

- At 1024×768, the automatically opened PI coach covers the dashboard KPI cards and obscures the Settings PIN form.
- At 1440×900, the PI coach overlaps the dashboard KPI row.
- The fixed Dock covers lower dashboard content because the main workspace has insufficient bottom safe-area padding.
- The PI avatar is rendered as a cartoon face with orbit/spark effects; this conflicts with the technical-premium enterprise direction.
- The dashboard hero leaves a large low-information area on the right while the floating coach consumes another part of the working canvas.

These are real screenshot observations, not inferred issues. The current geometry smoke test checks container bounds and horizontal overflow, but it does not assert that fixed overlays avoid covering important controls.

## Additional changes in progress

- PI insights no longer open a floating panel automatically during routine background refresh. They remain available through the PI control; an explicit forced refresh can still open the panel.
- The PI control is being restyled as a compact technical signal mark instead of a character mascot.
- The workspace receives bottom safe-area padding so the fixed Dock does not sit on top of the final content.
