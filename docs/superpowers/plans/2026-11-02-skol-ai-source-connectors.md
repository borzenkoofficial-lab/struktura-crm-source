# SKOL AI Source Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route order discovery through a source-aware orchestrator and connect the first dedicated public procurement source (EIS) directly to the CRM.

**Architecture:** Keep the existing AnyModel planning/ranking and local SQLite workflow. Add a dedicated EIS adapter for the public procurement search page, merge its verified records with public-web results, and preserve the existing commercial-order schema by classifying EIS records as `tenders` until a deliberate database migration introduces a more granular source type. Failed or blocked EIS access must be reported as a source error, never disguised as successful results.

**Tech Stack:** Electron 35, Node.js CommonJS, built-in fetch/AbortController, node:test, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-11-02-skol-ai-source-connectors-design.md`

## Global Constraints

- No paid providers or infrastructure without user approval.
- No CAPTCHA, login, paywall, rate-limit or access-control bypass.
- Secrets stay in Electron safeStorage and never enter logs, prompts or Git.
- LLM output is advisory; source facts must remain traceable to the original URL.
- Existing CRM records and manual review statuses must be preserved.
- Windows desktop build and the full existing test suite remain required.

## Review Focus

- EIS blocks or changes its HTML: report an explicit source error and preserve other-source results.
- Unexpected/malicious result links: accept only HTTP(S) URLs on zakupki.gov.ru.
- Duplicate EIS notices: normalize registry number and canonical URL before deduplication.
- Search results without a registry number/title: discard rather than create empty CRM records.
- EIS source filtering: map the current UI's EIS mode to the existing `tenders` DB category without changing the DB CHECK constraint.

---

### Task 1: EIS adapter contract

**Files:**
- Create: `src/eis-search.cjs`
- Test: `tests/eis-search.test.cjs`

**Interfaces:**
- `searchEisProcurements(query, options) -> { results, error, status }`
- `parseEisSearchResults(html, query) -> normalized result[]`
- `normalizeEisResult(raw, query) -> result | null`

- [x] Write tests for valid EIS cards, registry-number extraction, URL allowlisting, empty/malformed markup, duplicate records and HTTP errors.
- [x] Tests were authored before the adapter implementation; the first integrated CI run exposed a fixture/parser precedence mismatch, which was corrected.
- [x] Implement the adapter using the public EIS extended-search page, strict host validation, bounded timeouts and explicit error states.
- [x] Full CI test suite passed: 451 tests, 451 passed, 0 failed (commit `0f765d57`).
- [x] Adapter and tests committed on `feat/skol-ai-source-connectors`.

### Task 2: Connect EIS to the existing order-search flow

**Files:**
- Modify: `src/main.cjs`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Test: `tests/order-radar.test.cjs` and adapter tests

**Interfaces:**
- `runAiWebSearch({ kind, service, region, sourceType, seedQueries })` additionally calls EIS when source mode is `eis`, `tenders`, or `all`.
- EIS records enter the same AI ranking and existing `commercial_orders` upsert flow.
- EIS records use the existing `tenders` DB source type until a future schema migration is justified.
- `orders:list` maps the EIS filter to `tenders`.

- [x] Added adapter-level normalization, routing integration and EIS filter coverage; full suite passed.
- [x] EIS results are merged with web results for `all`/`tenders`; source errors are isolated and EIS-only mode remains direct.
- [x] Updated the order-radar source explanation.
- [x] Full test suite passed; existing SQLite source-type constraint is preserved and EIS records use the existing `tenders` category.
- [x] Integration committed on `feat/skol-ai-source-connectors`.

### Task 3: Connector readiness and next sources

**Files:**
- Modify: `src/main.cjs`
- Modify: `src/preload.cjs`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Create/modify tests as needed

- [ ] Expose connector health/status separately from search result counts.
- [ ] Add explicit connection states for sources that require user credentials or authorized membership.
- [ ] Investigate and implement only documented/authorized API paths for commercial platforms, Avito and Telegram; do not claim third-party listing discovery through APIs that only expose the user's own account.
- [ ] Keep file import as a supported local source and extend parsing only where current dependencies support it.
- [ ] Run full tests, UI smoke test, Windows package build and CI. Record any source that remains gated by user credentials.
