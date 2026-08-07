# Milestone 24 — Metered or upto x402 Payments — Implementation Report

## Executive summary

Milestone 24 extends the existing Milestone 23 exact x402 testnet lifecycle with deterministic bounded `upto` and `metered` authorization accounting. It does not replace the existing Gateway, Risk Assessment Engine, reconciliation system, or Base Sepolia testnet settlement path.

## Baseline state

The source ZIP already contained Milestone 23 exact-payment controls, live testnet facilitator verification/settlement, resource retry/delivery verification, audit persistence, JavaScript/Python SDK surfaces, MCP source/runtime surfaces, and frontend capability reporting. Baseline focused x402 tests were 23/23 passing and the integration-contract verifier passed.

## Architecture

Added `backend/lib/x402MeteredPayments.mjs`. A bounded authorization is created only from an existing Allowed x402 audit. The authorization remains inside the existing audit JSON lifecycle so both memory and PostgreSQL stores use the same data model without a destructive migration.

## Files added

- `backend/lib/x402MeteredPayments.mjs`
- `backend/lib/x402MeteredPayments.test.mjs`
- `docs/METERED_UPTO_X402_PAYMENTS.md`
- `METERED_UPTO_X402_PAYMENTS_IMPLEMENTATION_REPORT.md`

## Files modified

Backend Gateway normalization, x402 controls, value/exposure helper, memory/PostgreSQL stores, server routes/status, JavaScript SDK source/runtime/types, Python SDK, MCP source/runtime, frontend capability status, integration verification, and related documentation/tests.

## Database changes

No schema migration was required. Authorization and usage history are additively persisted under the existing audit `originalIntent.action.x402.authorization` JSON structure. Existing agents, policies, audits, approvals, proofs, reconciliation records, and bridge records are unchanged.

## Policy changes

The existing `x402AllowedSchemes` policy extension point now supports `exact`, `upto`, and `metered`. Existing policies that only allow `exact` remain exact-only. Metered requests require deterministic `usageUnit` and positive `unitPriceAtomic` binding.

## Provider support

No new provider is introduced. Milestone 23's server-controlled Base Sepolia x402 facilitator path remains the only live payment settlement path. Milestone 24 accounting is provider-neutral and does not invent an unsupported x402 protocol method.

## Evidence model

Authorization events include event ID, idempotency key, type, amount, usage quantity, unit price, resource/provider/session binding, optional delivery reference, bounded provider attestation, timestamp, and evidence hash. Event histories are bounded to 500 entries.

## Binding model

`upto` and `metered` fingerprints extend the existing canonical x402 request binding with maximum authorized amount, usage unit, unit price, session ID, and provider ID. The Milestone 23 `exact` fingerprint remains byte-for-byte backward-compatible.

## Decision integration

The original authorization request still goes through the existing x402 Payment Controls findings and Risk Assessment Engine. A controlled authorization cannot be created unless that audit decision is `Allowed`. No independent authorization decision engine was introduced.

## Audit integration

Authorization state and bounded event history are stored in the existing structured audit lifecycle. Execution status/note timestamps are updated for authorization state changes.

## Reconciliation integration

Actual blockchain settlement continues to use Milestone 23/Milestone 13 settlement reconciliation. Milestone 24 adds reservation/capture/usage/release/refund accounting before and around that settlement lifecycle rather than creating a second transaction state machine.

## Exposure integration

Milestone 14 exposure semantics are reused by `buildReservedExposureSnapshot`, providing maximum, reserved, actual/captured, settled, released, refunded, remaining, and net-settled base-unit exposure. Authorization arithmetic remains integer-safe.

## Gateway integration

Preserved `POST /api/agent-gateway/intents`. Added authenticated additive routes:

- `POST /api/agent-gateway/x402/authorizations`
- `POST /api/agent-gateway/x402/authorization-events`

Existing Milestone 23 routes remain unchanged.

## SDK integration

JavaScript SDK adds `createX402Authorization` and `applyX402AuthorizationEvent`, with new types and `exact | upto | metered` x402 fields. Python SDK adds `create_x402_authorization` and `apply_x402_authorization_event`.

## MCP integration

Added `magen3_create_x402_authorization` and `magen3_apply_x402_authorization_event`. Source and generated runtime were updated. Existing x402 exact execution and settlement tools remain available.

## Frontend integration

The existing x402 capability panel now truthfully reports `exact`, `upto`, and `metered`, bounded authorization support, usage accounting, and Live Testnet status without redesigning navigation or visual identity.

## Security protections

Base-unit BigInt accounting; overcharge prevention; duplicate event/usage prevention; cross-resource/provider/session isolation; expiry and revocation enforcement; bounded identifiers and event history; no provider URLs or credentials; no wallet secrets; exact-payment fingerprint compatibility.

## Backward compatibility

Milestone 23 exact payment fingerprints and routes remain compatible. Existing exact-only policies remain exact-only. No destructive migration or agent/policy recreation is required.

## Tests run

Final exact command/results are recorded in the delivery response. Focused implementation tests cover creation, invariants, reserve/capture/settle/release/refund, metered usage, idempotency, cross-binding rejection, revocation, existing exact payments, Gateway persistence, replay prevention, and settlement reconciliation.

## Live-verification limitations

No new public-testnet payment was executed for Milestone 24. No funded wallet or live metered/upto provider usage source was available in this environment. The live blockchain settlement path remains the already implemented Milestone 23 Base Sepolia architecture.

## Environment variables

No new mandatory environment variables. Existing Milestone 23 `X402_TESTNET_FACILITATOR_URL` configuration remains applicable.

## Deployment notes

No database migration is required. Deploy the complete replacement project normally on Railway/Vercel. Existing optional provider configuration remains fail-safe.

## Known limitations

A real third-party provider-specific metering attestation format is not standardized here; bounded opaque provider attestations/evidence hashes are accepted as evidence and never treated as direct authorization. Live provider metered usage was not tested.

## Roadmap compatibility

Milestone 25 can add production threat-intelligence evidence without changing the authorization accounting model. Milestones 26–28 remain clean extension points.

## Explicitly not implemented

Production threat-intelligence provider integration, production oracle integration, production compliance provider integration, continuous monitoring/background rescreening, mainnet activation, new payment facilitators, or unlimited spending authority.

## Later milestone confirmation

Milestones 25–28 were not implemented.

## Recommended next milestone

Milestone 25 — Production Threat Intelligence.

## Final verification results

- Focused x402 suite: 30 passed, 0 failed.
- Full backend regression: 507 passed, 0 failed, 0 skipped (with a temporary local symlink to the globally installed TypeScript package solely so the existing frontend-security-model test could import TypeScript; the symlink was removed before packaging).
- JavaScript SDK runtime tests: 41 passed, 0 failed.
- Python SDK tests: 35 passed, 0 failed using `PYTHONPATH=packages/sdk-python/src`.
- Security verification: passed.
- Integration-contract verification: passed.
- Generated JavaScript SDK runtime syntax: passed.
- Generated MCP runtime syntax: passed.
- Changed TypeScript/TSX source syntax transpilation: passed.
- MCP behavioral tests: not runnable in this environment because the ZIP intentionally contains no `node_modules` and the package mirror cannot install `@magen3/sdk` / `@modelcontextprotocol/sdk` dependencies.
- Full TypeScript project type-check and Vite build: not runnable here because `pnpm@10.14.0` cannot be downloaded from the environment's internal npm mirror (HTTP 404). Railway previously demonstrated that its build environment can install the lockfile dependencies.
- Live provider/testnet verification for Milestone 24: not performed; no funded wallet or real metered/upto provider usage source was available.
