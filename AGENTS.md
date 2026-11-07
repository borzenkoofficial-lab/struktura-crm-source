# Repository instructions for AI agents

## Source of truth

- The canonical and only production source of truth is `main` (СКОЛ CRM 1.28.0).
- Start every task from the latest `main`. New work must use a short-lived branch created directly from `main` and a pull request back to `main`.
- Do not create duplicate `installer-build/*`, `test/*`, `ui/*`, or `redesign/*` branches for the same interface. Never promote an old branch over a newer canonical commit.
- Before changing code, inspect this file, `README.md`, `package.json`, the current branch and the latest commit. Confirm that the branch is based on `main`.

## Product identity and architecture

- Product name: **СКОЛ CRM**.
- This is a local-first Windows desktop application built with Electron and SQLite.
- Preserve the established Windows application ID `ru.struktura.crm`, the existing user-data paths, database filename and compatibility behavior. These are upgrade/data-retention boundaries.
- Do not introduce a server dependency, paid service or new recurring cost without explicit approval.
- Keep privileged operations in Electron main process and expose only validated, narrow IPC methods through preload.

## Approved interface baseline

- Default fresh-install theme: **light / white with lime accent**. The optional dark theme remains available.
- Semantic accent tokens live in `src/struktura-design-system.css`; the light accent is `#a4d52f`. Do not scatter new hard-coded accent colors through components.
- Main navigation is a persistent **bottom Dock**. Do not move it to the top or restore the legacy top/side navigation.
- The dashboard supports user-controlled widget visibility, drag reordering, size presets, saved layouts and workspace presets. Preserve these behaviors and their persistence.
- Keep the existing CRM information architecture and page layouts. Changes should be targeted improvements, not a concept redesign.
- Respect reduced-motion preferences, keyboard access, responsive breakpoints and text visibility. Avoid clipping, overlap and horizontal overflow.

## Business logic and data integrity

- Do not modify estimate formulas, engineering calculations, financial calculations, production productivity formulas, PI logic, licensing rules, SQLite schema or IPC contracts as part of visual work.
- Any required business-logic change must have a focused regression test and an explicit explanation of the data-flow impact.
- Never delete, reset, replace or migrate a user's SQLite database without a tested backup and rollback path.
- Preserve the distinction between customer-confirmed budget, calculated revenue, cost and estimated profit. Never substitute one for another.
- Do not add fabricated demo values to dashboards or reports; metrics must come from actual local records.

## Unmerged feature proposals

The following proposals were closed during consolidation and their source branches were preserved as a **closed integration backlog**. They are **not part of main** and must not be treated as installed product functionality:

- PR #61 — AnyModel AI integration / search provider change.
- PR #62 — direct EIS procurement search connector.
- PR #68 — restore client linkage on lead creation and editing.
- PR #69 — stricter SQLite backup/restore schema validation.

These proposals were developed against older branch histories. Do not merge their branches wholesale or use them as a base. Re-audit each against current `main`, port only the required feature/fix, preserve current UI and data contracts, then run focused tests plus the full verification suite. Older 1.14–1.16 PRs are also closed historical proposals, not a current release base.

## Required verification

Run from the repository root on Node.js 22:

```powershell
npm ci --no-audit --no-fund
npm test
npm run test:ui
npm run dist:win
```

- `npm test` must finish with zero failures.
- `npm run test:ui` must be run in Electron and cover the supported workspaces and viewport sizes.
- A successful source test is not proof that the Windows installer works. Verify the Windows x64 installer and packaged-app smoke test in GitHub Actions before claiming release readiness.
- Record the exact commit SHA, workflow run, test totals, installer artifact and any skipped checks in the handoff.
- Do not claim a task is complete based only on a code diff or another AI agent's report.

## Versioning and delivery

- Keep `package.json` and both version fields in `package-lock.json` aligned.
- Every functional change needs regression coverage. Every release candidate needs a green test job and Windows packaging/runtime job.
- Keep PRs focused and based on `main`. Do not merge draft PRs or branches with failed checks.
- Before branch cleanup, preserve the merged commit as the recovery point and verify that no open PR or unique unmerged work depends on a branch.
