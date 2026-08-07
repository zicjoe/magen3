# Production Dashboard & History Render Fix Report

## Summary

This corrective release addresses the production symptoms observed after the Milestone 28 deployment on Vercel + Railway:

- Dashboard becomes blank after wallet connection/navigation.
- Settings can also render blank.
- Existing PostgreSQL-backed agents/audits can appear as if the wallet is a new account.

## Root causes addressed

### 1. Optional Continuous Risk Monitoring state could crash core pages
Dashboard and Settings directly dereferenced Monitoring arrays/status. Continuous Risk Monitoring is additive and must not be able to crash core product pages. Both pages now defensively normalize missing/malformed Monitoring state and fall back to explicit unavailable status.

### 2. Legacy wallet ownership lookups were case-sensitive
The PostgreSQL agent, audit, emergency-pause, and monitoring ownership lookups used exact text equality for wallet addresses. Existing approval lookup already handled wallet identity case-insensitively. The corrected store now uses a parameterized lower-case comparison at query time so the same Casper public-key text is matched even if a wallet connector changes hexadecimal letter casing. Existing rows are not rewritten or deleted.

## Files modified

- `src/app/App.tsx`
- `backend/store/postgresStore.mjs`

## Files added

- `backend/lib/productionDashboardHistory.regression.test.mjs`
- `PRODUCTION_DASHBOARD_HISTORY_RENDER_FIX_REPORT.md`

## Data safety

- No destructive migration.
- No agent/policy/audit deletion.
- No historical row rewrite.
- Existing PostgreSQL records remain the source of truth.

## Tests

Focused production regression:
- 14 passed, 0 failed.

Verification:
- Integration contract verifier: passed.
- Security patch verifier: passed.

Full backend:
- 523 discovered.
- 522 passed.
- 1 failed before assertions because the extracted source environment does not contain the `typescript` package required by `frontendSecurityModel.test.mjs`.

The corrected App.tsx was also parsed by the available global TypeScript compiler; remaining diagnostics were dependency-resolution errors for absent React/Vite/Lucide/type packages rather than a new syntax error.

## Deployment

This repository is intended for the existing production flow where one GitHub push automatically triggers Railway and Vercel. No manual deployment ordering is required.

Keep Vercel configured with the Railway API base URL, for example:

`VITE_API_URL=https://magen3-production.up.railway.app`

Do not append `/api`.
