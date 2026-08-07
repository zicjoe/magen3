# Magen3 Production Same-Origin API Proxy Fix Report

## Problem confirmed from production

The production Railway bootstrap endpoint returns valid `application/json` when requested directly and contains the historical Magen3 account data, while the Vercel-hosted browser application reports that the same Railway bootstrap request returns HTTP 200 with `text/html; charset=utf-8`.

The Magen3 Node backend cannot intentionally produce that HTML response for `/api/bootstrap`: its shared response helper serializes API responses and errors as JSON. This isolates the failure to the browser-to-Railway cross-origin path / intermediary behavior rather than PostgreSQL or bootstrap ownership queries.

## Fix

### 1. Same-origin browser API path in production

`src/app/lib/api.ts`

- Production browser requests now use relative `/api/*` URLs.
- Development continues to use `VITE_API_URL` / the local backend URL.
- `api.baseUrl` remains the configured public Railway API base so SDK/developer/integration UI continues to show the canonical external Magen3 API URL.
- Response diagnostics now use `response.url` where available.

### 2. Vercel reverse proxy before SPA fallback

`vercel.json`

The first rewrite now proxies:

`/api/:path* -> https://magen3-production.up.railway.app/api/:path*`

Only after the API rule does the SPA fallback rewrite remaining routes to `/index.html`.

This means the browser talks only to the Vercel origin. Vercel performs the API request to Railway server-to-server, avoiding the cross-origin browser path that returned HTML.

### 3. API responses are explicitly non-cacheable

`backend/server.mjs`

All Magen3 API responses now include:

- `Cache-Control: no-store, no-cache, must-revalidate`
- `X-Content-Type-Options: nosniff`
- `X-Magen3-API: 1`

This is particularly important for wallet-scoped bootstrap/account data when it is proxied through an edge/CDN.

## Preserved behavior

- PostgreSQL schema and stored data are unchanged.
- Agent ownership and wallet lookup semantics are unchanged.
- `POST /api/agent-gateway/intents` is unchanged.
- Railway remains the backend/runtime and PostgreSQL host.
- Vercel remains the frontend host.
- `VITE_API_URL=https://magen3-production.up.railway.app` can remain configured for canonical public API display and local/dev semantics.
- SDK and MCP integrations continue to use the public Railway API URL directly.

## Verification performed

Passed:

- `node scripts/testing/verify-production-same-origin-api-proxy.mjs`
- `node scripts/integration/verify-integration-contract.mjs`
- `node scripts/security/verify-security-patch.mjs`

The extracted workspace did not contain installed npm dependencies, so a full Vite/TypeScript build was not represented as executed here. Vercel will run the repository's configured `pnpm install --frozen-lockfile` and `pnpm run build` during deployment.

## Deployment expectation

After deployment, browser network requests for account bootstrap should be addressed to the Vercel origin path `/api/bootstrap?...`, not directly to `magen3-production.up.railway.app`. Vercel then proxies that request to Railway and returns the JSON response to the browser.
