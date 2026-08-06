# Market Risk Signals Implementation Report

## Executive summary

Milestone 21 adds a deterministic Market Risk Signals module to the real Magen3 protected-intent pipeline. The module consumes bounded operator-configured provider evidence, selects observations for the exact protected asset pair and route context, evaluates freshness, source quorum, confidence, provider disagreement, volatility, liquidity, spread, divergence, depeg, imbalance, volume deterioration, and manipulation indicators, then submits findings to the existing Risk Assessment Engine.

The truthful product status is **Foundation Available**. No production market-data provider was bundled or live-tested.

## Baseline state

The source ZIP was `magen3-trading-route-integrity-upgrade.zip`, representing the repository after Milestone 20.

Baseline backend test discovery:

- total: 429
- passed: 428
- failed: 1
- skipped: 0

The single baseline failure was `backend/lib/frontendSecurityModel.test.mjs` because the extracted environment did not contain the `typescript` package.

## Architecture

Added `backend/lib/marketRiskSignals.mjs` with:

- inline, bounded local-file, and HTTPS feed adapters;
- server-controlled configuration and credentials;
- feed normalization and schema limits;
- cache isolation and freshness checks;
- source deduplication;
- canonical/symbol pair matching;
- optional network, chain-family, venue, pool, amount, quote, and route-fingerprint narrowing;
- exact protected-amount binding for liquidity-coverage evidence;
- per-signal deterministic median aggregation;
- source confidence and disagreement evidence;
- stable SHA-256 evidence fingerprints;
- deterministic policy findings.

## Gateway and pipeline integration

Market Risk Signals is integrated into:

- `POST /api/agent-gateway/intents`;
- request normalization;
- memory store;
- PostgreSQL store;
- Risk Assessment;
- pipeline stages;
- audits;
- Gateway responses;
- TypeScript SDK;
- Python SDK pass-through documentation/tests;
- MCP schema guidance;
- frontend protection capability model;
- operational status and settings endpoint lists.

The new public status route is:

```text
GET /api/market-risk-signals/status
```

## Milestone 20 propagation correction

Inspection found that Milestone 20 normalized `action.executionQuality` and `action.tradingRoute`, but the memory/PostgreSQL Gateway request mapping did not forward those normalized fields into the real policy request. This release adds those fields to both stores. The correction is additive and required so Milestones 19, 20, and 21 operate in the actual protected-intent Gateway path.

## Evidence model

The normalized evidence model includes:

- feed status and source classification;
- generated/fetched timestamps and age;
- protected base/output pair;
- optional canonical pair;
- chain family and network;
- venue and pool;
- independent provider count;
- aggregate confidence;
- newest observation time;
- per-signal value, minimum, maximum, source count, disagreement, and completeness;
- evidence fingerprint;
- policy thresholds;
- final status.

Unavailable metrics remain `unavailable`; no missing category is represented as zero.

## Supported signals

- `volatilityBps`
- `spreadBps`
- `priceDeviationBps`
- `oracleDivergenceBps`
- `stablecoinDepegBps`
- `liquidityCoverageBps`
- `poolImbalanceBps`
- `liquidityLossBps`
- `volumeDropBps`
- `manipulationScore`

## Policy changes

Added optional `structuredRules.marketRiskSignals` configuration. Legacy policies remain compatible because the module is disabled unless explicitly enabled or required.

Actions can independently be configured as `allow`, `warn`, `review`, or `block` for unavailable evidence, missing evidence, provider disagreement, volatility, spread, deviation, depeg, liquidity, imbalance, and manipulation.

## Audit integration

The audit original-intent evidence contains the sanitized Market Risk Signals context, findings, source summary, metric completeness, policy thresholds, and evidence fingerprint. Raw provider credentials and unbounded provider responses are not stored.

## SDK integration

TypeScript SDK additions:

- `Magen3MarketRiskRequest`
- `Magen3MarketRiskMetricSummary`
- `Magen3MarketRiskSignalsContext`
- `Magen3Action.marketRisk`
- `Magen3DecisionResult.marketRiskSignalsContext`
- `Magen3IntentResponse.marketRiskSignals`

The Python SDK remains additive/pass-through and does not need a restrictive model change.

## MCP integration

MCP schema guidance explains the supported pair/route selectors and explicitly states that MCP must never invent volatility, liquidity, spread, divergence, depeg, or manipulation evidence.

## Frontend integration

The existing Magen3 interface was preserved. The Asset Market Risk controls now show **Foundation Available** in the existing protection areas. Settings include the status endpoint. No generic dashboard or separate application was created.

## Environment variables

```env
MARKET_RISK_SIGNALS_FEED_JSON=
MARKET_RISK_SIGNALS_FEED_PATH=
MARKET_RISK_SIGNALS_FEED_URL=
MARKET_RISK_SIGNALS_API_KEY=
MARKET_RISK_SIGNALS_CACHE_TTL_MS=60000
MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS=300000
MARKET_RISK_SIGNALS_REQUEST_TIMEOUT_MS=2500
```

Exactly one feed source should be configured. Optional configuration fails safely. Policies that require unavailable evidence follow their configured fail-closed action.

## Security protections

- no request-controlled feed URL;
- HTTPS required for remote production feeds;
- embedded URL credentials rejected;
- redirect refusal;
- bounded response size;
- bounded observation count;
- bounded identifiers and evidence references;
- strict integer metric normalization;
- request timeout and AbortController;
- cache keyed by exact source/configuration;
- future-skew and staleness rejection;
- source deduplication;
- credentials excluded from public status and audits;
- synthetic example explicitly labelled non-production.

## Database changes

No database migration was required. Existing JSON audit/request structures support additive evidence.

## Files added

- `backend/lib/marketRiskSignals.mjs`
- `backend/lib/marketRiskSignals.test.mjs`
- `backend/lib/marketRiskSignals.integration.test.mjs`
- `backend/lib/marketRiskSignals.gateway.integration.test.mjs`
- `backend/data/market-risk-signals.example.json`
- `scripts/market-risk/refresh-example-feed.mjs`
- `docs/MARKET_RISK_SIGNALS.md`
- `MARKET_RISK_SIGNALS_IMPLEMENTATION_REPORT.md`

## Major files modified

- `.env.example`
- `package.json`
- `backend/lib/agentGateway.mjs`
- `backend/lib/agentGateway.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `packages/sdk-js/src/index.ts`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/dist/core.js` and `packages/mcp-server/dist/core.d.ts`
- `packages/mcp-server/test/core.test.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `scripts/integration/verify-integration-contract.mjs`
- `README.md`
- `docs/README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/TRADING_ROUTE_INTEGRITY.md`
- `docs/MEV_EXECUTION_QUALITY.md`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- SDK and MCP documentation

## Testing

### Baseline

Command:

```bash
node --test backend/**/*.test.mjs
```

Baseline result from the unmodified Milestone 20 ZIP:

- tests discovered: 429
- passed: 428
- failed: 1
- skipped: 0

The failure was a dependency-load failure in `backend/lib/frontendSecurityModel.test.mjs`: the extracted environment did not contain the repository-pinned `typescript` package.

### Focused Milestone 21 tests

Command:

```bash
node --test backend/lib/marketRiskSignals.test.mjs backend/lib/marketRiskSignals.integration.test.mjs backend/lib/marketRiskSignals.gateway.integration.test.mjs
```

Result:

- tests: 23
- passed: 23
- failed: 0
- skipped: 0

Coverage includes feed normalization, provenance, freshness, source quorum, confidence, provider disagreement, volatility, spread, depeg, unavailable fail-closed behavior, unsupported/missing evidence, exact protected-amount binding for liquidity coverage, cache isolation, feed staleness, source deduplication, observation and response-size limits, remote timeouts, HTTPS enforcement, credential-in-URL rejection, sanitized public errors, Risk Assessment integration, Gateway propagation, audit persistence, and decision precedence.

Gateway schema regression command:

```bash
node --test backend/lib/agentGateway.test.mjs
```

Result: 10 passed, 0 failed, 0 skipped. This includes verification that caller-supplied risk metrics are ignored while bounded pair/route selectors are retained.

### Full backend regression

Clean extracted-environment command:

```bash
node --test backend/**/*.test.mjs
```

Result:

- tests discovered: 453
- passed: 452
- failed: 1
- skipped: 0

The only failure remained the missing `typescript` package load for `frontendSecurityModel.test.mjs`. No Magen3 assertion failed.

A supplemental run mapped the already-installed global TypeScript 5.8.3 package into a temporary test-only `node_modules/typescript` path. No temporary dependency path is included in the replacement ZIP. Under that test harness:

- tests: 478
- passed: 478
- failed: 0
- skipped: 0

The higher count occurs because the frontend security-model file contains 26 individual tests; without TypeScript, Node reports that entire file as one failed test file before discovering those tests. The repository itself pins TypeScript 6.0.3, so the supplemental mapping is not represented as a repository dependency installation or production build.

### SDK and MCP

TypeScript SDK command:

```bash
/opt/nvm/versions/node/v22.16.0/bin/tsc -p packages/sdk-js/tsconfig.json
node --test packages/sdk-js/test/*.test.mjs
```

Result: compilation passed with the available global TypeScript 5.8.3; 37 tests passed, 0 failed, 0 skipped.

Python SDK command:

```bash
node scripts/testing/run-python-sdk-tests.mjs
```

Result: 30 tests passed, 0 failed.

MCP core command, using a temporary workspace symlink for the already-built local SDK:

```bash
node --test packages/mcp-server/test/core.test.mjs
```

Result: 26 tests passed, 0 failed, including the Market Risk Signals schema boundary. The MCP protocol suite could not load because `@modelcontextprotocol/sdk` was not installed in the extracted environment. No protocol test is claimed as passed.

### Frontend and repository verification

The frontend security-model tests passed 26/26 under the temporary global-TypeScript test mapping.

The following checks passed:

```bash
node --check backend/lib/marketRiskSignals.mjs
node --check backend/lib/agentGateway.mjs
node --check backend/lib/policyEngine.mjs
node --check backend/store/memoryStore.mjs
node --check backend/store/postgresStore.mjs
node --check backend/server.mjs
node --check scripts/market-risk/refresh-example-feed.mjs
node scripts/integration/verify-integration-contract.mjs
node scripts/security/verify-security-patch.mjs
```

### Local backend smoke test

A local backend process was started with `ALLOW_MEMORY_STORE=true` and a fresh temporary configured feed. Both endpoints returned HTTP 200 and sanitized data:

```text
GET /api/health
GET /api/market-risk-signals/status
```

Verified:

- `marketRiskSignals.status` was `available`;
- one observation and one pair were reported;
- raw observations were not returned;
- the configured local file path was not exposed;
- the service health response included the same sanitized Market Risk Signals summary.

### Type-check and build limitations

Root type-check was attempted with the available global TypeScript 5.8.3:

```bash
tsc -b
```

It could not complete because the extracted project had no installed React, React DOM, Lucide, Vite, Tailwind Vite plugin, or Node type dependencies.

The repository-pinned package manager could not be activated:

```bash
corepack pnpm --version
```

Corepack received HTTP 404 from the available package mirror for `pnpm@10.14.0`. Consequently, the full root `pnpm run build`, pinned TypeScript 6.0.3 type-check, and full MCP protocol build/test were not claimed.

## Live-verification limitations

Not live-tested:

- public testnet market provider;
- managed remote market-data service;
- Railway;
- Vercel;
- wallets;
- external agents;
- streaming/WebSocket market data;
- real pools or exchanges.

Mock/configured-feed tests are not described as public-network verification.

## Not implemented

- managed production market-data adapters;
- provider certification;
- cryptographic market-data attestations;
- automatic pool discovery;
- live order-book or mempool streaming;
- sandwich/front-running prediction;
- market-making or execution routing;
- production oracle infrastructure from Milestone 26;
- bridge-provider execution from Milestone 22;
- continuous monitoring from Milestone 28.

## Roadmap compatibility

Milestone 21 consumes canonical asset identity, simulation context, execution-quality context, and trading-route context without taking ownership of those modules. Its evidence model is ready to be consumed by Milestone 22 bridge routes and later monitoring, while Production Oracle Integration remains a separate Milestone 26 responsibility.

Milestones 22–28 were not prematurely implemented.

## Recommended starting point for Milestone 22

Begin Milestone 22 with a provider-adapter registry for real testnet bridge quotes and source transaction construction. Reuse:

- Milestone 16 canonical source/destination asset IDs;
- Milestone 20 route/payload binding;
- Milestone 21 source/destination market-risk evidence;
- Milestone 13 settlement reconciliation;
- existing RPC integrity and fee-safety boundaries.

Do not make a bridge provider responsible for Magen3 policy decisions.
