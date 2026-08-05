# Milestone 14 Implementation Report

## Verified pre-edit assessment

- Architecture: Vite/React TypeScript frontend, Node ESM backend, deterministic policy engine, memory and PostgreSQL stores, Drizzle schema, JavaScript/Python SDKs, MCP server, Casper proof subsystem.
- Existing milestones 11–13: RPC integrity, gas sponsorship safety, and execution reconciliation are present with tests and documentation.
- Policy persistence: numeric `maxTransaction`, `dailyLimit`, and `approvalThreshold` plus additive `structuredRules` JSONB.
- Legacy meaning: frontend and wallet validation explicitly displayed and enforced those numeric fields as CSPR.
- Oracle foundation: provider-attributed feed normalization, freshness, source quorum, confidence, spread, and execution-price deviation exist. It is not a production market-price service.
- Stablecoin handling: no general value-limit depeg enforcement existed.
- Reconciliation: pending/replaced/uncertain/final execution states and histories exist and are now reused for exposure reservation.
- Main gap: no explicit unit basis, canonical cross-chain value conversion, wallet-percentage limits, split-payment exposure accounting, or value-specific audit context.

## Implemented

- Added deterministic `Value & Exposure Limits` policy module.
- Added network-native registry for Casper, Ethereum/Base, Solana, and BNB Chain with additive custom registry support.
- Added explicit fiat/native/legacy basis behavior.
- Added provider evidence binding, freshness, disagreement, source attribution, confidence/source-count preservation, and evidence hash field.
- Added stablecoin peg deviation handling.
- Added automatic/review/maximum, hourly, daily, per-destination, wallet-percentage, hybrid, and asset-override evaluation.
- Added reconciliation-aware exposure accounting that reserves pending/uncertain/replacement state and excludes failed terminal state.
- Added structured findings, exact unit/value/threshold explanations, and fail-closed missing-price behavior.
- Added audit persistence for value evidence, thresholds, cumulative exposure, and triggered breach.
- Added JavaScript SDK types and MCP field descriptions.
- Added Settings → Policy Defaults and policy creation limit-basis controls with advanced limits collapsed.
- Preserved existing policies through explicit legacy behavior; no database rewrite or destructive migration was required because the existing JSONB rules field is additive.

## Files changed

- `backend/lib/valueExposureLimits.mjs`
- `backend/lib/valueExposureLimits.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `packages/sdk-js/src/index.ts`
- `packages/mcp-server/src/core.ts`
- `src/app/App.tsx`
- `docs/CHAIN_AGNOSTIC_VALUE_EXPOSURE_LIMITS.md`

## Database

No new table or destructive column migration. Policy configuration uses existing `structured_rules` JSONB. Audit value context is stored in existing `original_intent` JSONB and memory-store audit objects. Existing IDs, API-key hashes, policies, approvals, audits, reconciliation records, and migration history are unchanged.

## Compatibility

Gateway route, authentication headers, Agent IDs, API keys, Casper proof contract, approval binding, reconciliation methods, SDK client construction, MCP tools, and existing legacy policy fields remain available. Dedicated Bridge and x402 value controls remain authoritative for those action types and are not double-enforced by the generic module.

## Tests genuinely executed

- Node syntax checks for changed backend modules and stores.
- Full backend Node test discovery: 383 tests discovered; 382 passed.
- New value/exposure tests: 11 passed.

The one non-passing test could not start because the uploaded source ZIP correctly excludes `node_modules` and the sandbox registry returned HTTP 404 while Corepack attempted to obtain pnpm 10.14.0. The failing test imports the `typescript` package for frontend source inspection; no test assertion ran.

## Not executed here

- Frozen-lockfile install, TypeScript typecheck, Vite build, SDK/MCP build, Python SDK tests, npm dry-run, independent consumer install: blocked by unavailable pnpm/TypeScript dependencies.
- PostgreSQL live migration test: no database credentials/service.
- Railway, Vercel, Casper Testnet, live price provider, and real execution-wallet tests: no external credentials/infrastructure and therefore not claimed.

## Control status

`Value & Exposure Limits`: **Foundation Available**. Deterministic model, UI, SDK/MCP contract, audit evidence, fixtures, and reconciliation-aware calculations exist. Production provider-backed price acquisition and deployed end-to-end verification remain incomplete, so the control is not represented as Live.

## Known limitations

- USD is the only first-class reference currency in the UI.
- Price evidence is supplied by a trusted external adapter/provider; production oracle integration remains Milestone 26.
- Existing policy edit UI retains some historical CSPR summary labels outside the new-policy flow; legacy policies remain intentionally marked by preserved semantics rather than silently converted.

## Next milestone

15 — Real Stateful Execution Simulation.

## Conventional commit

`feat(policy): add chain-agnostic value and exposure limits`
