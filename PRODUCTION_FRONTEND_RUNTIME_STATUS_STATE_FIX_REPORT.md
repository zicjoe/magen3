# Production Frontend Runtime Status State Fix

## Executive summary

This release fixes the production Dashboard/Settings crash reported as:

`Cannot read properties of undefined (reading 'status')`

The live `/api/bootstrap?walletAddress=...` response supplied from Railway already contains historical agents, policies, audit logs, approvals, shield modules, dashboard statistics, and an empty `bootstrapWarnings` array. That proves the core PostgreSQL → Railway bootstrap path is functioning for the connected wallet.

The remaining failure was in the Vercel frontend runtime-service status path.

## Root cause

Dashboard and Settings both read runtime-service state for:

- Threat Intelligence
- Oracle Validation
- Compliance Controls
- x402 Payment Controls
- Continuous Risk Monitoring (Settings)

The existing refresh effects assigned nested API values directly into React state, for example:

`setOracleValidationStatus(payload.oracleValidation)`

If a successful HTTP response did not contain that nested object, React state became `undefined`. Dashboard and Settings then dereferenced `.status` directly and threw.

The shared API helper also used:

`response.json().catch(() => ({}))`

so a malformed/non-JSON successful response was silently converted to `{}` instead of being treated as an API failure. That made the undefined-state poisoning path possible without triggering the existing catch fallback.

## Changes

### 1. Runtime status normalization

Added stable default status objects and a shared `normalizeStatusObject` helper for Threat Intelligence, Oracle Validation, Compliance Controls, Continuous Risk Monitoring, and x402 Payment Controls.

Every runtime-status refresh now normalizes the nested payload before committing it to React state. A missing nested payload becomes an explicit unavailable state instead of `undefined`.

### 2. Catch-path hardening

Catch handlers also normalize previous state before applying unavailable/error metadata, so a previously poisoned value cannot remain unsafe.

### 3. Render-time defense

Dashboard and Settings normalize their runtime-status props before reading `.status` or other provider fields. This makes the pages resilient even if an unexpected caller passes `undefined` in the future.

### 4. API response validation

The frontend API helper no longer silently turns malformed successful bodies into `{}`.

- successful non-JSON responses now throw;
- non-object successful JSON responses now throw;
- HTTP error handling remains intact.

This routes malformed runtime-status responses through the existing safe unavailable fallback instead of poisoning state.

## Scope

No PostgreSQL schema or data changes.

No agent, policy, audit, approval, API key, Casper proof, monitoring record, provider credential, Gateway route, SDK, or MCP behavior is removed or recreated.

The fix is limited to frontend runtime-state validation and its regression coverage.

## Files changed

- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `backend/lib/productionDashboardHistory.regression.test.mjs`
- `backend/lib/frontendRuntimeStatus.regression.test.mjs` (new)

## Verification

### Targeted production regression

Command:

```bash
node --test \
  backend/lib/frontendRuntimeStatus.regression.test.mjs \
  backend/lib/productionDashboardHistory.regression.test.mjs \
  backend/lib/continuousRiskMonitoring.migration.regression.test.mjs
```

Result: **9 passed, 0 failed**.

The regression specifically verifies that runtime status refreshes normalize missing payloads, Dashboard/Settings do not read raw unvalidated runtime status objects, and the API client no longer silently converts malformed successful responses to empty objects.

### Full backend

Command:

```bash
node --test backend/**/*.test.mjs
```

Result: **528 discovered, 527 passed, 1 failed**.

The sole failure is the existing extracted-environment dependency issue: `backend/lib/frontendSecurityModel.test.mjs` cannot import the absent npm `typescript` package and fails before its assertions run.

### Integration contract

`node scripts/integration/verify-integration-contract.mjs` — **passed**.

### Security verifier

`node scripts/security/verify-security-patch.mjs` — **passed**.

### TypeScript parse check

The available global TypeScript compiler parsed the modified files. The remaining diagnostics are dependency/environment resolution failures for absent React/Vite/Lucide types and generated globals in the extracted ZIP; no new syntax diagnostic from this patch was reported.

## Expected production behavior

After the GitHub push triggers Vercel/Railway deployment:

1. Core bootstrap data remains unchanged and continues to load from PostgreSQL.
2. A malformed/unavailable runtime provider-status response is represented as `Unavailable` rather than `undefined`.
3. Dashboard no longer throws `Cannot read properties of undefined (reading 'status')` because of runtime service state.
4. Settings no longer throws for the same reason.
5. Provider/runtime status failures remain visible as degraded/unavailable service state rather than taking down the panel.
