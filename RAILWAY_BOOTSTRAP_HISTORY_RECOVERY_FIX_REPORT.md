# Railway Bootstrap & Historical Data Recovery Fix

## Executive summary

After Milestone 28, the deployed Vercel frontend could report the Railway Gateway as online while wallet-scoped Dashboard/Settings and historical agents/policies/audits appeared empty. The root cause was a Milestone 28 migration wiring regression: the SQL creating `monitoring_monitors` and `monitoring_alerts` was placed inside the direct-execution-only block of `backend/db/migrate.mjs`, outside the exported `runMigrations()` function used during normal Railway backend startup.

Railway therefore started normally, PostgreSQL connected normally, and `/api/health` remained healthy, but `/api/bootstrap?walletAddress=...` attempted to query monitoring tables that had never been created and failed. Because the frontend clears wallet-scoped state before bootstrap repopulates it, the failure made existing persisted agents/history appear like a new account.

## Fixes implemented

1. Moved continuous-monitoring table/index creation into exported `runMigrations()` so Railway server startup creates the additive Milestone 28 tables automatically.
2. Removed the incorrect direct-execution-only duplicate migration path.
3. Hardened PostgreSQL bootstrap so optional Continuous Risk Monitoring storage failure degrades only monitoring state and can no longer suppress legacy agents, policies, audit logs, approvals, emergency pauses, or dashboard statistics.
4. Hardened the frontend wallet bootstrap refresh so a scoped account-data refresh failure no longer incorrectly marks a healthy Gateway offline or erases already-loaded historical state.
5. Added a regression test proving monitoring DDL is inside Railway's imported migration path and proving bootstrap isolates monitoring failure from core account history.

## Existing data safety

The fix is additive. It does not drop, rename, truncate, recreate, or overwrite existing agents, policies, audit logs, approvals, proof records, reconciliation records, bridge/x402 records, provider evidence, or other historical PostgreSQL data. `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are used for the monitoring storage.

On the next Railway deployment, `runMigrations()` will create the missing monitoring tables before the API begins serving bootstrap traffic. Existing agents/history remain in their existing tables and should become visible again when the same owner wallet reconnects.

## Deployment scope

Backend: Railway must be redeployed with this corrected source so the migration runs.

Frontend: Vercel should also be redeployed because the frontend bootstrap error-handling was hardened. Keep `VITE_API_URL=https://magen3-production.up.railway.app` (or the actual Railway public origin) without `/api` appended.

`CORS_ORIGIN=*` was not changed by this fix.

## Verification

- New migration/bootstrap regression tests: 2/2 passed.
- Continuous monitoring focused tests: passed.
- Focused Gateway/reconciliation/x402/monitoring regression: 27/27 passed.
- Integration contract verification: passed.
- Security verification: passed.
- Full backend suite: 521 discovered, 520 passed, 1 failed.
- Sole full-suite failure: `frontendSecurityModel.test.mjs` cannot import the absent `typescript` npm package in the extracted artifact environment; assertions do not execute. This is the same dependency/environment limitation seen in the preceding release and is unrelated to this fix.

## Files changed

- `backend/db/migrate.mjs`
- `backend/store/postgresStore.mjs`
- `src/app/App.tsx`
- `backend/lib/continuousRiskMonitoring.migration.regression.test.mjs`
- `RAILWAY_BOOTSTRAP_HISTORY_RECOVERY_FIX_REPORT.md`

## Root-cause confirmation

The previous code had monitoring `CREATE TABLE` statements after the closing brace of `runMigrations()` and inside `if (import.meta.url === file://...)`. Railway imports and calls `runMigrations()` from `createPostgresStore()`, so those statements were skipped during normal API startup. The corrected release places them within `runMigrations()` itself.
