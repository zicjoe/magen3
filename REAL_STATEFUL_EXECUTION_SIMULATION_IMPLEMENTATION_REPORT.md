# Real Stateful Execution Simulation Implementation Report

## Executive summary
Milestone 15 replaces the prior high-level-only simulation limitation with a real server-controlled EVM JSON-RPC simulation path. It performs chain identity verification, block-pinned `eth_call`, and `eth_estimateGas`, then converts normalized evidence into deterministic Agent Shield findings handled by the existing Risk Assessment Engine.

## Baseline state
The ZIP contained a deterministic execution-preflight module that explicitly reported stateful speculative execution as unavailable. Baseline backend run: 383 tests discovered, 382 passed, 1 failed because `typescript` was not installed and pnpm could not be fetched from the available package mirror.

## Architecture
Added `backend/lib/statefulSimulation.mjs`: canonical hashing, EVM payload validation, trusted adapter configuration, bounded JSON-RPC execution, versioned evidence, freshness, capability reporting, and deterministic finding generation. Memory and PostgreSQL Gateway paths invoke it before policy evaluation. The existing decision engine remains authoritative.

## Files added
- `backend/lib/statefulSimulation.mjs`
- `backend/lib/statefulSimulation.test.mjs`
- `docs/REAL_STATEFUL_EXECUTION_SIMULATION.md`
- `REAL_STATEFUL_EXECUTION_SIMULATION_IMPLEMENTATION_REPORT.md`

## Files modified
- `backend/lib/policyEngine.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `packages/sdk-js/src/index.ts`
- `scripts/integration/verify-integration-contract.mjs`
- `.env.example`

## Database changes
No migration was required. Bounded normalized simulation evidence is stored inside the existing structured audit `originalIntent` JSON field and findings collection.

## Policy changes
Added optional backward-compatible fields: `statefulSimulationRequired`, `statefulSimulationUnavailableAction`, and `statefulSimulationMaximumAgeSeconds`.

## Adapter support and capability matrix
Real EVM JSON-RPC support: chain identity, block pinning, execution success/revert, runtime return bytes, and gas estimate. Tracing, token/balance/allowance deltas, events, storage diffs, and state overrides are explicitly unsupported. Casper and other families return structured unsupported results; no RPC methods were invented.

## Payload binding
Canonical SHA-256 hashes bind the exact unsigned payload and network/block context. Chain mismatch produces invalidated evidence. Expired or invalidated evidence blocks when evaluated.

## Decision, audit, reconciliation, Gateway, SDK, MCP, and frontend integration
Findings enter the existing Risk Assessment Engine and preserve precedence. Evidence is persisted in audits. Payload hashes are available for Milestone 13 reconciliation binding. Gateway routes remain unchanged and accept additive `action.simulation`. JS SDK types were extended. MCP continues passing the SDK intent shape and receives concise findings without raw traces. The existing Agent Shield navigation remains unchanged; documentation truthfully marks support as Foundation Available rather than universally Live.

## Security protections
Server-only provider URL, HTTPS outside tests, no request-controlled provider, timeout, abort, response-size bound, strict hex/address validation, safe canonicalization, sanitized errors, no signing material, no credentials, and no floating-point blockchain enforcement.

## Backward compatibility
Legacy requests and policies do not require simulation. Existing IDs, keys, routes, proofs, approvals, fee controls, exposure controls, reconciliation, deployments, and integrations are preserved.

## Tests run
- `node --test backend/**/*.test.mjs` baseline: 383 total, 382 passed, 1 failed due missing `typescript` dependency.
- `node --test backend/lib/statefulSimulation.test.mjs`: 7 total, 7 passed.
- Post-change backend run: 390 total, 389 passed, 1 failed for the same missing `typescript` dependency; the seven focused Milestone 15 tests all passed.

## Live-verification limitations
No public testnet provider was called from this environment. Provider behavior was integration-tested with a protocol-faithful JSON-RPC test adapter. Railway, Vercel, wallets, Casper testnet, and external agents were not live-tested. pnpm/typecheck/build/SDK/MCP package tests could not run unless dependencies were already available because the package mirror returned 404 for pnpm 10.14.0.

## Environment variables
`STATEFUL_SIMULATION_EVM_RPC_URL`, `STATEFUL_SIMULATION_EVM_PROVIDER_ID`, `STATEFUL_SIMULATION_EVM_CHAIN_ID`, `STATEFUL_SIMULATION_TIMEOUT_MS`, `STATEFUL_SIMULATION_MAX_AGE_SECONDS`.

## Deployment notes
Configure a trusted testnet EVM RPC and exact chain ID. Optional configuration may remain empty; policies that require simulation will fail closed according to their fallback.

## Known limitations
The initial real adapter does not provide traces, logs, state diffs, token movements, allowance changes, or decoded events. These categories remain explicit unsupported evidence rather than false zero values.

## Roadmap compatibility
Milestones 16–28 were not implemented. Versioned asset/counterparty/capability/freshness/payload/block fields provide extension points without duplicating canonical asset identity, token risk, behavioral, MEV, route, market, bridge, x402, threat, oracle, compliance, or monitoring systems.

## Recommended Milestone 16 starting point
Introduce canonical chain-aware asset identifiers and provenance, then map simulation-observed asset references to that registry without changing the simulation adapter contract.
