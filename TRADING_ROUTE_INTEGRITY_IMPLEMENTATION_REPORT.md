# Trading Route Integrity Implementation Report

## Executive summary

Milestone 20 adds deterministic Trading Route Integrity to the real Magen3 protected-intent pipeline. Swap route evidence is normalized by the existing Agent Gateway, evaluated before signing by the existing Risk Assessment Engine, retained in audits, and exposed through the JavaScript SDK and MCP guidance.

The implementation does not create a second authorization engine. It produces standard Agent Shield findings and respects existing decision precedence.

## Baseline state

The source project was the complete Milestone 19 replacement ZIP. It already contained Stateful Simulation, Asset & Token Identity, Asset Contract Risk, Wallet Behavioral Controls, and MEV & Execution Quality.

During implementation, inspection found that several previously supplied contexts were passed into `withStructuredResult` but were not declared or returned by that helper. This release repairs that result propagation for:

- Asset & Token Identity;
- Asset Contract Risk;
- Stateful Simulation;
- MEV & Execution Quality;
- Trading Route Integrity.

This repair is additive and allows the existing audit and SDK wiring to receive the evidence it expected.

## Architecture

New evaluator:

```text
backend/lib/tradingRouteIntegrity.mjs
```

Flow:

```text
Agent Gateway normalization
  → canonical route snapshot
  → deterministic route fingerprint
  → router/asset/amount/path/pool/fee checks
  → calldata and payload binding
  → standard Agent Shield findings
  → existing Risk Assessment Engine
  → audit and Gateway response
```

## Files added

- `backend/lib/tradingRouteIntegrity.mjs`
- `backend/lib/tradingRouteIntegrity.test.mjs`
- `backend/lib/tradingRouteIntegrity.integration.test.mjs`
- `docs/TRADING_ROUTE_INTEGRITY.md`
- `TRADING_ROUTE_INTEGRITY_IMPLEMENTATION_REPORT.md`

## Files modified

- `backend/lib/agentGateway.mjs`
- `backend/lib/agentGateway.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/server.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/README.md`
- `src/app/lib/securityModel.ts`
- `scripts/integration/verify-integration-contract.mjs`
- `README.md`
- `docs/README.md`

## Database changes

No schema migration was required. Existing audit payloads are stored in JSON structures, so Trading Route Integrity evidence is additive. Existing agents, policies, API keys, audits, approvals, reconciliation records, and Casper proofs are preserved.

## Gateway integration

The primary route remains:

```text
POST /api/agent-gateway/intents
```

Optional `action.tradingRoute` metadata is normalized into bounded route fields. Existing request and response fields are preserved.

## Evidence model

The normalized context includes:

- schema version and evaluation timestamp;
- action applicability;
- quote provider and quote ID;
- router, aggregator, and protocol;
- ordered pools and token path;
- input/output assets and amounts;
- output bounds and execution mode;
- route fees and recipients;
- intermediary contracts;
- calldata hash and computed calldata hash;
- route-authorized payload hash;
- Stateful Simulation payload hash;
- deterministic route fingerprint;
- authorized route hash;
- unexpected intermediary/pool/recipient summaries;
- applied configuration and final status.

## Canonical binding

The route fingerprint uses deterministic object-key ordering while preserving array order. This is important because changing the order of token or pool paths changes execution semantics.

Bindings implemented:

- transaction target ↔ route router;
- protected input asset ↔ route input asset;
- protected output asset ↔ route output asset;
- protected amount ↔ route input amount;
- quoted output ↔ route expected output;
- protected minimum received ↔ route minimum output;
- token-path endpoints ↔ input/output assets;
- supplied calldata ↔ declared calldata hash;
- route-authorized payload hash ↔ Stateful Simulation payload hash;
- authorized route fingerprint ↔ complete submitted route snapshot.

## Policy changes

Optional policy configuration was added under `structuredRules.tradingRouteIntegrity`. Legacy policies remain compatible because route enforcement is disabled unless explicitly enabled or required.

Policy actions support `allow`, `warn`, `review`, and `block`.

## Decision integration

Trading Route Integrity findings enter the existing Risk Assessment Engine. Hard-block and review states participate in the existing precedence calculation. A passing route cannot override a blocking result from authentication, wallet validation, contract validation, simulation, asset risk, value limits, fee safety, human approval, or any other module.

## Audit integration

Applicable route context is retained in both memory and PostgreSQL audit paths. It is also exposed in the Gateway response as `tradingRouteIntegrity` and inside the result as `tradingRouteIntegrityContext`.

## SDK integration

The JavaScript SDK now exposes:

- `Magen3TradingRoute`;
- `Magen3TradingRouteIntegrityContext`;
- `Magen3Action.tradingRoute`;
- `Magen3DecisionResult.tradingRouteIntegrityContext`;
- `Magen3IntentResponse.tradingRouteIntegrity`.

No existing method signature was removed.

## MCP integration

The existing MCP tool remains unchanged. Guidance now explains the exact `action.tradingRoute` evidence agents should send and explicitly states that MCP must not invent route evidence.

## Frontend integration

The product security model now identifies Trading Route Integrity as `Foundation Available`, describing the implemented route and payload bindings without claiming live quote-provider authentication or market-risk feeds.

## Security protections

- Bounded path, pool, contract, and recipient arrays.
- Deterministic canonical route hashing.
- Order-sensitive token and pool paths.
- Field-specific mismatch findings.
- SHA-256 calldata binding.
- Stateful Simulation payload-hash comparison.
- No agent-controlled provider URLs.
- Existing signing-material rejection remains active.
- No private keys, signatures, raw signed transactions, or provider credentials are persisted.

## Backward compatibility

Preserved:

- agent IDs and API keys;
- Gateway route and authentication headers;
- existing action envelopes;
- policies and audit logs;
- approval and quorum flows;
- Casper proof flow;
- gas sponsorship;
- reconciliation;
- SDK and MCP entry points;
- Railway and Vercel configuration;
- YieldBot-facing response compatibility.

## Tests added

Unit coverage includes:

- exact approved route;
- router mutation;
- token-path endpoint mutation;
- unexpected intermediary asset;
- payload-hash mismatch;
- authorized route fingerprint mutation;
- non-swap applicability.

Integration coverage includes:

- Gateway route normalization;
- Risk Assessment pass evidence;
- Risk Assessment route block;
- successful route evidence not overriding another block.

## Live-verification limitations

No live quote provider, DEX router, pool, public testnet transaction, private relay, Railway deployment, Vercel deployment, wallet, or external agent was exercised in the implementation environment.

The evaluator is deterministic and operational against trusted adapter-supplied evidence, but provider authentication and router-specific calldata decoding were not live-tested.

## Status

**Trading Route Integrity: Foundation Available**

It should not be marked fully Live until at least one trusted quote-provider adapter supplies authenticated route evidence and a supported router decoder or equivalent provider proof is tested on testnet.

## Not implemented

This release does not implement:

- live quote-provider API integration or authentication;
- universal ABI and calldata decoding;
- on-chain pool-state validation;
- live liquidity depth;
- volatility signals;
- bid/ask spread signals;
- stablecoin depeg detection;
- transaction-order simulation;
- private-relay submission;
- bridge-provider execution;
- x402 settlement;
- production threat-intelligence providers;
- production oracle providers;
- production compliance providers;
- continuous background monitoring.

## Roadmap compatibility

Milestone 21 can consume the route's input/output assets, amounts, expected output, minimum output, provider timestamp, route fees, pools, and fingerprint without changing Milestone 20's responsibility.

Milestones 21–28 were not prematurely implemented.

## Recommended starting point for Milestone 21

Implement deterministic Market Risk Signals through typed provider evidence adapters. Keep external liquidity, volatility, spread, depeg, and manipulation evidence separate from route identity. Milestone 20 answers whether the route is the authorized route; Milestone 21 should answer whether current market conditions make that route unsafe.

## Verification results

Commands completed successfully:

```text
node --check backend/lib/tradingRouteIntegrity.mjs
node --check backend/lib/agentGateway.mjs
node --check backend/lib/policyEngine.mjs
node --check backend/store/memoryStore.mjs
node --check backend/store/postgresStore.mjs
node --check backend/server.mjs
node scripts/integration/verify-integration-contract.mjs
node scripts/security/verify-security-patch.mjs
tsc -p packages/sdk-js/tsconfig.json --pretty false
node --test packages/sdk-js/test/*.mjs
PYTHONPATH=packages/sdk-python/src python -m unittest discover -s packages/sdk-python/tests -v
```

Focused Milestones 14–20 and Gateway tests:

```text
Total: 61
Passed: 61
Failed: 0
Skipped: 0
```

Full backend regression:

```text
Total: 429
Passed: 428
Failed: 1
Skipped: 0
```

The remaining backend failure is unchanged:

```text
backend/lib/frontendSecurityModel.test.mjs
ERR_MODULE_NOT_FOUND: Cannot find package 'typescript'
```

This is an extracted-environment dependency failure. It is not a failed Magen3 assertion.

JavaScript SDK:

```text
TypeScript compilation: passed
Tests: 36 passed, 0 failed, 0 skipped
```

Python SDK:

```text
Tests: 29 passed, 0 failed
```

Integration verification:

```text
Passed
```

Security verification:

```text
Passed
```

Root application type-check attempt:

```text
tsc -b --pretty false
```

This could not complete because project dependencies were not installed in the extracted environment. Reported missing packages included React, React DOM, Vite, the Vite React plugin, Tailwind Vite integration, and Node type declarations. The command did not report a Trading Route Integrity TypeScript error before dependency resolution failed.

MCP TypeScript compilation could not complete because `@types/node` was unavailable in the extracted environment.

No lint script exists in the root `package.json`, so no lint result is claimed.

No full Vite production build is claimed because the project dependency tree was unavailable.

## Environment variables

Milestone 20 adds no required environment variables. It consumes trusted route evidence supplied through the existing Gateway action envelope and reuses Stateful Simulation evidence already produced by server-controlled providers.

## Deployment notes

No database migration or deployment configuration change is required. After dependency installation, run the normal repository verification and build commands before deployment:

```text
pnpm install --frozen-lockfile
pnpm verify
pnpm run build
```
