# Magen3 Production Browser API Path Fix Report

## Problem confirmed

The deployed Railway `/api/bootstrap?walletAddress=...` endpoint was manually opened in the browser and returned the historical agents, policies, audit logs, approvals, emergency state, and dashboard statistics. This proves the PostgreSQL connection, wallet ownership lookup, and Railway bootstrap route are operational.

The Vercel application nevertheless reported:

`Account data could not be refreshed: Magen3 API returned a non-JSON response.`

Therefore the remaining failure was isolated to the browser API request/response path rather than PostgreSQL.

## Root risk addressed

The frontend API client previously:

- concatenated `VITE_API_URL` without trimming whitespace or a trailing slash;
- sent `Content-Type: application/json` on every GET request, creating unnecessary CORS preflights;
- gave a generic non-JSON error that did not identify the host/status/content type;
- had no retry for transient GET responses;
- polled the now-large account bootstrap payload every six seconds.

The older API parser also silently converted malformed successful responses to `{}`, which could produce false-positive health states. The newer strict parser exposed the problem but still lacked production-safe diagnostics/recovery.

## Changes

### `src/app/lib/api.ts`

- Normalize `VITE_API_URL` using `trim()` and remove trailing slashes.
- Build API paths from one normalized base URL.
- Send `Accept: application/json` for API calls.
- Add `Content-Type: application/json` only when a request body exists.
- Use `cache: "no-store"` for GET requests.
- Retry GET requests once after a short bounded delay.
- Preserve strict JSON parsing.
- On a successful non-JSON response, report the actual response host, HTTP status, and content type instead of a generic error.
- Continue refusing malformed successful response bodies.

### `src/app/App.tsx`

- Reduce full account-bootstrap polling from every 6 seconds to every 30 seconds.
- Keep the existing last-successful-state behavior: a failed refresh reports an error but does not erase already loaded agents, policies, audit logs, approvals, or emergency state.

### Regression coverage

Updated `backend/lib/frontendRuntimeStatus.regression.test.mjs` to verify:

- runtime status objects cannot poison React state;
- Dashboard/Settings normalize status objects before `.status` reads;
- the browser API client normalizes its production base URL;
- GET calls request JSON without forcing JSON `Content-Type`;
- GET calls bypass cache and retry once;
- malformed successful HTML/non-JSON responses remain rejected with diagnostics;
- the large bootstrap payload is no longer polled every six seconds.

## Verification

- Frontend runtime/API regression tests: 4/4 passed.
- Integration contract verifier: passed.
- Security verifier: passed.
- Full backend suite: 528/529 passed.
- Sole failure: `backend/lib/frontendSecurityModel.test.mjs` cannot load the absent local `typescript` package before assertions; this is the same extracted-environment dependency limitation seen in prior releases.

## Deployment notes

Vercel must build with:

`VITE_API_URL=https://magen3-production.up.railway.app`

No `/api` suffix is required. The client now safely removes accidental trailing `/` characters.

Railway/PostgreSQL schema and stored account data are not modified by this fix.
