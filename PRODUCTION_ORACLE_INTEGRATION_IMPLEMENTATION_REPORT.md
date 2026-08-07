# Production Oracle Integration Implementation Report

## Executive summary

Milestone 26 upgrades Magen3's existing Oracle Validation foundation into a production-oriented provider-backed oracle architecture while preserving deterministic authorization and backward compatibility. Pyth Network Hermes is implemented as the first real provider adapter with a fixed backend-controlled origin and server-side asset/feed mapping. Provider evidence remains evidence only; the existing Oracle Validation evaluator and Risk Assessment/policy pipeline continue to determine Allowed, Blocked, or Review Required.

Milestones 27–28 were not implemented.

## Baseline state

The Milestone 25 source ZIP contained a genuine Production Threat Intelligence provider layer and a separate older Oracle Validation foundation based on operator-configured JSON/file/remote feeds. Baseline focused Threat Intelligence + Oracle tests passed 38/38 and the integration-contract verifier passed before Milestone 26 changes.

## Architecture

Added `backend/lib/oracleProviders.mjs` for provider registration, capability discovery, Pyth Hermes retrieval, server-controlled feed mapping, cache isolation, timeouts, bounded retries, rate limiting, response limits, explicit provider states, and circuit breaking.

Added `backend/lib/oracleDecimal.mjs` for canonical decimal parsing and `BigInt`-backed scaled arithmetic. Oracle deviation, median, source-spread, and derived-price calculations no longer rely on JavaScript floating-point arithmetic for authorization decisions.

The existing `backend/lib/oracleValidation.mjs` remains the single Oracle evaluator. It merges provider observations with the backward-compatible operator feed path, applies deterministic policy, and emits findings into the existing Risk Assessment path.

## Provider support

Implemented provider adapter:
- Pyth Network Hermes
- fixed origin: `https://hermes.pyth.network`
- endpoint family: `/api/latest_price_feeds`
- server-controlled `ORACLE_PYTH_FEED_MAP_JSON`
- exact feed-ID substitution checks
- latest price, exponent, confidence interval, publish-time normalization

A genuine live provider request was not performed in this implementation environment. Provider behavior was tested with mocked provider-shaped HTTP responses. Therefore provider-backed Oracle Integration remains **Preview**, not Live.

## Evidence model

Normalized provider evidence includes provider, provider ID/version, canonical asset ID, pair/reference currency, feed identifier, chain family/chain ID, raw price integer, normalized decimal price, exponent, confidence interval, update/retrieval timestamps, evidence age, provider reference, evidence hash, cached/fallback flags, provider-disagreement state, and normalization status.

Raw provider payloads and credentials are not retained in audit context or Casper proof material.

## Policy changes

Existing Oracle controls remain compatible. Additive rules support provider required/allowed-provider behavior, provider unavailable/disagreement actions, fallback allowance, required reference currency, stablecoin asset lists and peg ranges, while preserving max age, max deviation, source spread, confidence, source quorum, validation mode, and unavailable behavior.

Provider success cannot override any unrelated blocking finding.

## Gateway and Risk Assessment integration

`POST /api/agent-gateway/intents` remains unchanged. Both memory and PostgreSQL stores now request Oracle provider evidence using the normalized protected request, then pass the resulting snapshot into the existing `evaluateOracleValidation` call inside the policy/Risk Assessment engine.

No independent authorization engine was created.

## Audit and Casper proof integration

Bounded/sanitized provider evidence summaries and hashes are attached to the existing Oracle Validation context and therefore persist through the existing audit lifecycle. Casper proof behavior was not expanded to include raw oracle payloads, wallet/network operational metadata, or provider credentials.

## SDK integration

JavaScript SDK adds `getOracleValidationStatus()` and additive Oracle context fields for provider status/provenance and exact decimal representations. Generated JS runtime and declaration output were updated.

Python SDK adds `get_oracle_validation_status()`.

## MCP integration

MCP source and generated runtime add `magen3_get_oracle_validation_status` and update Oracle guidance to describe provider-backed evidence without implying provider authorization.

## Frontend integration

The existing Integration Health Oracle panel now surfaces configured providers, provider health, and request-scoped provider states. The product text explicitly states Pyth Hermes is Preview until a real live provider request is verified.

## Security protections

Milestone 26 adds or strengthens:
- fixed Pyth provider origin
- no request-controlled Oracle provider URLs
- server-side asset/feed mapping
- exact feed-ID substitution checks
- private/local production remote-feed rejection
- production legacy-feed hostname allowlist
- URL credential rejection
- bounded provider responses
- timeout/cancellation
- bounded retry/backoff
- provider rate limiting
- circuit breaking
- cache isolation by provider/canonical asset/pair/feed
- malformed JSON/shape rejection
- impossible timestamp rejection
- invalid/zero/negative price rejection
- exact decimal scaling with `BigInt`
- secret-safe public status
- explicit unsupported/unavailable/degraded/rate-limited states

## Backward compatibility

No destructive database migration was introduced. Existing agents, IDs, API keys, policies, audits, approvals, Casper proofs, Gateway request/response semantics, bridge/x402/reconciliation systems, Threat Intelligence, JavaScript SDK behavior, Python SDK behavior, MCP tools, Railway/Vercel startup behavior, and operator Oracle feeds are preserved additively.

Legacy production remote Oracle feeds now require explicit hostname allowlisting for SSRF safety.

## Environment variables

New optional provider variables:
- `ORACLE_PROVIDERS`
- `ORACLE_PYTH_ENABLED`
- `ORACLE_PYTH_FEED_MAP_JSON`
- `ORACLE_PROVIDER_TIMEOUT_MS`
- `ORACLE_PROVIDER_MAX_RETRIES`
- `ORACLE_PROVIDER_CACHE_TTL_MS`
- `ORACLE_PROVIDER_RATE_LIMIT_PER_MINUTE`
- `ORACLE_PROVIDER_MAX_RESPONSE_BYTES`
- `ORACLE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD`
- `ORACLE_PROVIDER_CIRCUIT_OPEN_MS`

Legacy remote-feed hardening adds:
- `ORACLE_VALIDATION_ALLOWED_FEED_HOSTS`

Optional provider absence does not prevent application startup. A policy requiring provider evidence does not silently treat unavailable evidence as a zero-price success.

## Database changes

No schema migration was required.

## Reconciliation integration

No new settlement or monitoring state machine was introduced. Milestone 13 reconciliation, Milestones 23–24 x402 lifecycle/accounting, and Milestone 22 bridge delivery remain unchanged.

## Live-verification limitations

No genuine live Pyth Hermes request, wallet signature, blockchain transaction, Railway deployment, Vercel deployment, or Casper submission was performed by this implementation environment. Mock provider tests must not be interpreted as live-provider verification.

## Roadmap compatibility

Milestone 27 can add compliance provider adapters without reusing Oracle evidence as compliance evidence. Milestone 28 can later monitor Oracle provider health/staleness by consuming the provider capability/evidence model added here. No compliance-provider screening or continuous monitoring was implemented in Milestone 26.

## Tests run and exact results

Baseline before modification:
- `node --test backend/lib/threatIntelligenceProviders.test.mjs backend/lib/threatIntelligence.test.mjs backend/lib/oracleValidation.test.mjs backend/lib/oracleValidation.integration.test.mjs` — 38 passed / 0 failed.
- `node scripts/integration/verify-integration-contract.mjs` — passed.

Milestone 26 focused Oracle suite:
- `node --test backend/lib/oracleProviders.test.mjs backend/lib/oracleValidation.test.mjs backend/lib/oracleValidation.integration.test.mjs` — 26 passed / 0 failed / 0 skipped.

Final combined Oracle + Threat focused suite:
- `node --test backend/lib/oracleProviders.test.mjs backend/lib/oracleValidation.test.mjs backend/lib/oracleValidation.integration.test.mjs backend/lib/threatIntelligenceProviders.test.mjs backend/lib/threatIntelligence.test.mjs` — 47 passed / 0 failed / 0 skipped.

JavaScript SDK:
- `node --test packages/sdk-js/test/sdk.test.mjs` — 43 passed / 0 failed / 0 skipped.

Python SDK:
- `node scripts/testing/run-python-sdk-tests.mjs` — 37 passed / 0 failed.

MCP:
- Direct execution initially failed before tests because the source ZIP has no installed workspace dependency link for `@magen3/sdk`.
- With a temporary local workspace symlink used only for test execution and removed immediately afterward: `node --test packages/mcp-server/test/core.test.mjs` — 31 passed / 0 failed / 0 skipped.

Full backend regression:
- `node --test backend/lib/*.test.mjs` — 495 discovered; 494 passed; 1 failed; 0 skipped.
- The single failure is environmental and matches the prior release: `backend/lib/frontendSecurityModel.test.mjs` cannot import the absent `typescript` package, so no application assertion in that file ran.

Verification/security:
- `node scripts/integration/verify-integration-contract.mjs` — passed.
- `node scripts/security/verify-security-patch.mjs` — passed.
- `node --check` on changed backend/generated JavaScript files — passed.

Typecheck/build/lint:
- `pnpm` is not installed in the execution environment.
- `corepack pnpm --version` attempted to restore the repository-declared pnpm 10.14.0 but the environment's internal npm mirror returned HTTP 404.
- Therefore `pnpm typecheck` and `pnpm build` could not run; direct attempts returned command-not-found before compilation.
- The repository has no standalone `lint` script in root `package.json`, so no separate lint command was available.

Live provider verification:
- Not performed. No genuine Pyth Hermes request is claimed.

## Starting point for next milestone

The next incomplete roadmap item is Milestone 27 — Production Compliance Provider. It should consume the existing provider-runtime patterns, deterministic fallback semantics, Risk Assessment integration, audit minimization, SDK/MCP/frontend conventions, and must remain separate from Oracle evidence.
