# TypeScript Navigation Build Fix

## Failure

The Railway/Vercel production build failed during `tsc -b` because two new unresolved-execution UI actions navigated to `"audit"`, while the authoritative `Page` union defines the Audit Logs route as `"audit-log"`.

## Fix

Updated both reconciliation navigation actions in `src/app/App.tsx`:

- Dashboard unresolved-execution alert
- Connected Agent unresolved-execution alert

Both now call `onNavigate("audit-log")`.

## Verification

- Static route-contract check: every literal passed to `onNavigate(...)` or `setPage(...)` is contained in the `Page` union.
- Backend regression suite: 369 passed, 0 failed.
- Frozen-lockfile workspace fix remains preserved.
- No dependency, database, API, Gateway, SDK, MCP, policy, or environment-variable changes were made.
