# SKOL Offline Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline, device-bound Ed25519 license activation and plan-based module access to SKOL CRM for Windows.

**Architecture:** A standalone local CLI signs compact license payloads with a private Ed25519 key that never ships with the app. Electron main process verifies tokens with an embedded public key, stores the signed token in the existing SQLite settings table, and enforces entitlements centrally at IPC boundaries. Renderer provides activation UI and hides unavailable modules.

**Tech Stack:** Electron 35, Node.js 22 built-in `node:crypto`, SQLite via existing `better-sqlite3`, Node test runner.

**Spec:** `docs/superpowers/specs/skol-offline-license.md`

## Global Constraints

- Windows 10/11 remains the target platform.
- Keep Electron 35 and Node.js 22; add no runtime dependencies.
- Do not rename or recreate the existing SQLite database or user-data directory.
- Never commit private signing keys or customer license tokens.
- License validation and feature enforcement must run in Electron main process.
- Do not require internet for activation or normal CRM operation.
- Keep changes isolated on `fix/skol-offline-licensing-2026-10`; do not modify `main`.

## Review Focus

- Malformed and oversized license tokens must fail closed without crashing startup.
- A valid token signed for a different Device ID must be rejected.
- Expiry boundary and invalid date values must be handled deterministically.
- Renderer must not bypass IPC entitlements by calling channels directly.
- Missing/corrupt license settings must preserve user data and permit reactivation.

---

### Task 1: License core and deterministic tests

**Files:**
- Create: `src/license-core.cjs`
- Create: `tests/license-core.test.cjs`

**Interfaces:**
- `createLicenseToken(payload, privateKeyPem) -> string`
- `verifyLicenseToken(token, publicKeyPem, expectedDeviceId, nowMs?) -> { valid, license, reason }`
- `getFeaturesForEdition(edition) -> string[]`
- `normalizeLicenseToken(value) -> string`

- [ ] Write tests for all editions, valid signature, tampered payload/signature, wrong device, unknown edition/feature, expired token, malformed and oversized input.
- [ ] Run `npm test` through CI on the feature branch and confirm the new test fails because the module is absent.
- [ ] Implement the minimal pure module with Node built-in Ed25519 crypto and strict payload validation.
- [ ] Run the full test suite and confirm all tests pass.

### Task 2: Device identity and offline generator

**Files:**
- Create: `src/license-device.cjs`
- Create: `tools/license-generator.cjs`
- Create: `tests/license-device.test.cjs`
- Modify: `.gitignore`

**Interfaces:**
- `createDeviceId(machineGuid) -> 64-char lowercase hex`
- `readWindowsMachineGuid(execFileSyncImpl?) -> string`
- CLI: `node tools/license-generator.cjs --edition PRO --device-id <id> --private-key <path>`
- The production public key is embedded at `src/license-public-key.pem`; the matching private PEM is delivered separately and never committed.

- [ ] Write tests for deterministic device hashing, invalid MachineGuid, and registry output parsing.
- [ ] Verify the tests fail before implementation.
- [ ] Implement Windows MachineGuid reading and a CLI that signs a license for one device. Support `--license-id`, `--seat-index`, `--seat-count`, `--updates-until`, and `--expires-at`.
- [ ] Add ignore rules for private key material and generated license output.
- [ ] Verify generator help and a round-trip token test using an ephemeral test key pair.

### Task 3: Main-process activation and IPC enforcement

**Files:**
- Create: `src/license-service.cjs`
- Create: `tests/license-service.test.cjs`
- Modify: `src/main.cjs`
- Modify: `src/db.cjs` only if a migration is demonstrably required (prefer existing settings table).

**Interfaces:**
- `createLicenseService({ getSetting, setSetting, publicKeyPem, deviceId, now })`
- `getStatus() -> activation status + public license summary + deviceId`
- `activate(token) -> activation status + license summary`
- `featureForChannel(channel) -> feature ID or null`

- [ ] Write tests for activation, persisted token revalidation, invalid saved token, and feature/channel mapping.
- [ ] Verify tests fail before implementation.
- [ ] Implement service and wire `license:status`, `license:activate`, and `license:deviceId` IPC handlers.
- [ ] Extend the existing central IPC wrapper to reject all non-license/PIN operations before activation and to reject unavailable feature channels after activation.
- [ ] Keep PIN lock behavior intact and allow license/PIN recovery channels while either gate is locked.
- [ ] Run the full test suite.

### Task 4: Activation UI and entitlement-aware navigation

**Files:**
- Modify: `src/preload.cjs`
- Modify: `src/index.html`
- Modify: `src/renderer.js`
- Modify: `src/styles.css`
- Create: `tests/license-ui-contract.test.cjs`

**Interfaces:**
- Preload exposes `getLicenseStatus()`, `activateLicense({ key })`, and `getLicenseDeviceId()`.
- Renderer runs license gate before PIN gate and dashboard initialization.

- [ ] Write static contract tests for activation controls, Device ID display, and feature attributes on protected navigation/views.
- [ ] Verify tests fail before UI implementation.
- [ ] Add activation screen with key input, Device ID copy affordance, error feedback, and active tariff display.
- [ ] Hide protected navigation and views based on the signed feature list.
- [ ] Ensure a successful activation resumes the existing PIN/startup flow; a failed activation leaves all business data untouched.
- [ ] Run the full test suite.

### Task 5: Build, security review, and release verification

**Files:**
- Modify: `package.json` only if a documented generator script is useful.
- Create: `docs/superpowers/verification/skol-offline-license-checklist.md`

- [ ] Add end-to-end test cases for START/PRO/BUSINESS channel boundaries.
- [ ] Run full `npm test`.
- [ ] Run Windows installer workflow and inspect the result.
- [ ] Confirm private key paths are absent from tracked files and installer inputs.
- [ ] Review changed files for startup regressions, IPC bypasses, and data-loss risks.
- [ ] Record the exact CI run and build result; do not merge until all required checks pass.
