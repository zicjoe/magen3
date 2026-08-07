# Gateway Development Startup Fix Report

## Issue

Launching the application with the repository's default `pnpm dev` command started only Vite. The frontend therefore rendered successfully while its default API origin (`http://localhost:8787`) had no backend process, causing the UI to truthfully display **Gateway unavailable**.

A direct backend launch also remains intentionally strict: without `DATABASE_URL`, it exits unless `ALLOW_MEMORY_STORE=true` is explicitly enabled.

## Fix

- Changed the default `pnpm dev` script to `node scripts/dev/start-dev.mjs`.
- Added a dependency-free, cross-platform development launcher that starts both `backend/server.mjs` and Vite.
- The launcher reads `.env` and `.env.local` for backend configuration while keeping already-exported process environment variables authoritative.
- For local development only, when neither `DATABASE_URL` nor `ALLOW_MEMORY_STORE` is configured, the launcher explicitly sets `ALLOW_MEMORY_STORE=true` and prints a warning. This reuses the repository's existing supported temporary memory store; it does not change production storage behavior.
- Production `start`, `backend:start`, and `railway:start` commands are unchanged.
- Added a regression test verifying that the default dev command launches the combined runner and preserves the explicit storage safety boundary.
- Updated README troubleshooting/startup guidance.

## Verification

- `node --check scripts/dev/start-dev.mjs` — passed.
- `node --test backend/lib/devLauncher.test.mjs` — passed (1/1).
- Combined launcher smoke test with a stand-in Vite executable — backend started and `GET http://localhost:8787/api/health` returned `{ ok: true, service: "magen3-api", network: "casper-testnet", storage: "memory" }`.
- Production backend strictness was not weakened: direct `node backend/server.mjs` without `DATABASE_URL`/`ALLOW_MEMORY_STORE=true` still exits with `DATABASE_URL is required`.

## Deployment note

This fix targets local startup ergonomics. A hosted frontend still requires `VITE_API_URL` to reference the live backend origin, and the hosted backend still requires its normal Railway/PostgreSQL configuration.
