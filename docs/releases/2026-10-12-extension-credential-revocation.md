# Release Record: AgiesAI Sentinel Extension Credential Revocation

- **Feature Name:** Extension Credential Revocation
- **Release Date:** 2026-10-12
- **Feature Commit Hash:** `c2d334648593f907e2aa41c4869d42cdf27a551b`
- **Feature Commit Message:** `feat: add secure extension credential revocation`
- **Production Service URL:** `https://agiesai-sentinel-unified.onrender.com`
- **Repository:** `https://github.com/shivam123yadav/Agies_AI.git`
- **Branch:** `main`

---

## Production Verification Status

The user has tested and confirmed that all production verification steps succeeded on `https://agiesai-sentinel-unified.onrender.com`.

### Verified Checklist
- [x] **Production Health Endpoint:** Verified service availability and operational readiness.
- [x] **Admin Dashboard Access:** Authenticated administrators can access employee details and management views.
- [x] **Updated Extension ZIP Download:** Distribution package `/downloads/extension.zip` delivers the updated Manifest V3 extension with revocation feedback.
- [x] **Extension Pairing & Risk Analysis:** Legitimate pairing code generation, extension pairing, and pre-submit prompt analysis on ChatGPT succeed.
- [x] **Admin Credential Revocation:** Revoking an employee's extension via dashboard immediately clears credentials and un-pairs the extension.
- [x] **Old Credential Rejection & Disconnected Status:** Authenticated requests using the revoked credential return HTTP 401; the extension updates state to disconnected/revoked and prompts re-pairing.
- [x] **Fresh Pairing After Revocation:** A newly generated pairing code issued strictly after revocation successfully reconnects the extension.
- [x] **Rejection of Pre-Revocation Pairing Codes:** Pairing codes created before revocation are rejected (HTTP 400), even if pending-code invalidation had been bypassed or failed.

---

## Pre-Release Validation Summary

Prior to production deployment and release verification, the following automated test suites and static analysis checks were executed and passed:

1. **Full Backend Test Suite:**
   - **Result:** 220 / 220 tests passed (100%) against isolated test database (`agiesai_sentinel_test`).
   - Covered authentication, CSRF protection, rate limiting, route protection, extension pairing, and credential revocation with concurrency controls.
2. **Frontend & Extension Unit Tests:**
   - **Result:** 16 / 16 tests passed (`tests/frontend_auth.test.mjs` and `tests/extension.test.mjs`).
   - Validated dashboard API client, 401/403 response handling, late-response race condition prevention, and fail-closed pre-submit decisions.
3. **TypeScript Typecheck:**
   - **Command:** `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`)
   - **Result:** 0 errors.
4. **Production Build:**
   - **Command:** `npm run build` (`vite build`)
   - **Result:** Succeeded without errors.
5. **Git Diff Hygiene:**
   - **Command:** `git diff --check`
   - **Result:** Clean (0 whitespace or line-ending errors).

---

## Verification Scope Note

This document records reported test results and user-confirmed production verification behavior. It does not claim independently collected server-side telemetry or external monitoring logs.

- **Verified Release Commit:** `c2d334648593f907e2aa41c4869d42cdf27a551b`
