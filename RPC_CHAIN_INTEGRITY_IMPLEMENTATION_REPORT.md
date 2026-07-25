# Magen3 RPC & Chain Integrity Implementation Report

## Release summary

- **Release:** Magen3 2.3.0
- **Milestone:** RPC & Chain Integrity
- **Protection area:** Agent Shield → Execution Integrity → RPC & Chain Integrity
- **Control maturity:** Foundation Available
- **Source of truth:** `magen3-delegation-session-key-safety-upgrade.zip`
- **Database migration:** None
- **New required environment variables:** None
- **Casper contract change:** None
- **Relayer change:** None
- **Next roadmap milestone:** Gas Sponsorship & Fee Safety

RPC & Chain Integrity is implemented as a deterministic pre-signing control. It remains Foundation Available until deployed trusted RPC adapters collect and verify real provider observations end to end in Railway/PostgreSQL mode. It does not use a language model to determine Allowed, Blocked, or Review Required.

## 1. Architecture verified before editing

The source release contained:

- React, Vite, and TypeScript frontend with fixed navigation and wallet gating;
- Node ESM Gateway with independent deterministic protection evaluators;
- Blocked → Review Required → Allowed decision precedence;
- PostgreSQL/Drizzle and aligned memory-store behavior;
- additive JSON policy, normalized-intent, findings, pipeline, approval, and audit fields;
- exact-intent Human Approval, cryptographic reviewer-signature foundations, organizational quorum, and Emergency Circuit Breaker;
- Casper decision-proof submission and existing relayer configuration;
- JavaScript/TypeScript SDK, Python SDK, MCP, Codex, Railway, and Vercel integrations.

The milestone extends those systems rather than creating a second Gateway, audit, approval, or provider-health subsystem.

## 2. Gap found

RPC & Chain Integrity was marked Planned. The source release did not contain:

- normalized provider-observation metadata;
- approved RPC provider or endpoint policy;
- deterministic network identity and genesis binding;
- synchronization, TLS, block-freshness, or height-regression checks;
- provider quorum and disagreement checks;
- transaction-status or contract-state consistency checks;
- speculative endpoint isolation;
- auditable failover enforcement;
- a dedicated pipeline stage and response context;
- Security Coverage, Integration Health, Policy UI, Playground, SDK/MCP, status endpoint, documentation, or tests.

## 3. Backend implementation

A dedicated evaluator was added:

- `backend/lib/rpcChainIntegrity.mjs`

It uses the existing structured finding model:

- protection module;
- pass, warning, fail, unavailable, or skipped status;
- severity;
- deterministic rule;
- message;
- evidence;
- remediation.

The evaluator runs before downstream wallet, contract, and transaction-specific authorization. Its findings feed the existing risk engine and precedence rules.

## 4. Gateway metadata

The public Gateway route is unchanged:

```http
POST /api/agent-gateway/intents
```

Trusted adapters may add `action.rpcIntegrity` containing:

- expected chain name;
- expected network identifier;
- optional genesis or chain fingerprint;
- selected endpoint and provider ID;
- up to ten provider observations;
- provider endpoint and identity;
- TLS and synchronization state;
- latest block height and timestamp;
- response timestamp;
- timeout and rate-limit state;
- speculative endpoint flag;
- optional transaction-status and contract-state hashes;
- automatic failover state, source, and reason.

Aliases under RPC and chain-integrity naming are normalized without changing the existing Gateway envelope.

## 5. Deterministic enforcement

The control checks:

1. metadata structure and hash formats;
2. explicit selected-provider evidence;
3. approved endpoint or provider identity;
4. TLS transport policy;
5. synchronization evidence and state;
6. latest block height and timestamp presence;
7. latest-block freshness;
8. block-height regression against prior audited evidence;
9. expected chain, network, and optional genesis binding;
10. minimum usable-provider quorum;
11. cross-provider chain-identity agreement;
12. configured block-height tolerance;
13. transaction-status consistency;
14. contract-state consistency;
15. speculative endpoint isolation;
16. provider timeout and rate-limit behavior;
17. authorized, complete, and auditable automatic failover.

Wrong-network evidence, malformed protected evidence, block-height regression, and selecting a speculative endpoint fail closed. Other violations follow the configured Observe, Review, or Enforce mode and Warn, Review, or Block unavailable/disagreement actions.

Missing synchronization, height, or required network-identity evidence is explicitly unavailable and cannot receive a successful network-binding pass.

## 6. Policy model

Added `structuredRules` fields:

- `rpcIntegrityEnabled`;
- `rpcIntegrityMode`;
- `approvedRpcEndpoints`;
- `rpcIntegrityRequireTls`;
- `rpcIntegrityMaximumBlockAgeSeconds`;
- `rpcIntegrityMinimumProviders`;
- `rpcIntegrityMaximumHeightDifference`;
- `rpcIntegrityDisagreementAction`;
- `rpcIntegrityUnavailableAction`;
- `rpcIntegrityRequireNetworkIdentity`;
- `rpcIntegrityAllowAutomaticFailover`.

Legacy policies remain compatible because the control is disabled unless explicitly configured.

## 7. Audit and privacy model

Memory and PostgreSQL stores preserve aligned sanitized evidence inside existing audit JSON:

- expected network identity;
- selected provider and endpoint;
- provider observations;
- provider, usable, and approved counts;
- verified network-identity result;
- provider, transaction-status, and contract-state agreement;
- failover state and reason;
- structured findings and violations.

Magen3 does not store RPC credentials, private provider configuration, wallet secrets, signed transactions, or private keys. No database migration was needed because existing policy, intent, findings, pipeline, and audit JSON fields already support the evidence.

## 8. Security Pipeline and decisions

A dedicated `rpc-chain-integrity` stage appears only when relevant. The final outcomes remain:

- Allowed;
- Blocked;
- Review Required.

Blocked retains precedence over Review Required. Unavailable provider evidence never counts as a pass.

## 9. Frontend implementation

The existing design and navigation were preserved. Added:

- Foundation Available RPC & Chain Integrity control under Execution Integrity;
- policy creation and editing fields;
- approved endpoint/provider configuration;
- freshness, quorum, disagreement, unavailable, TLS, network, and failover controls;
- deterministic Security Coverage contribution;
- Integration Health from actual findings;
- Developer Portal status endpoint;
- Playground scenarios for approved, stale, wrong-network, and unavailable providers.

No new sidebar item or generic dashboard was added.

## 10. SDK and MCP implementation

Updated:

- JavaScript SDK RPC request and response types;
- Python SDK pass-through verification;
- MCP intent schema, descriptions, boundary, and tests;
- SDK and MCP documentation.

SDKs and MCP relay public observations from trusted adapters. They do not invent provider state, query private endpoints, certify providers, or gain wallet-signing authority.

## 11. Status endpoint

Added:

```http
GET /api/rpc-chain-integrity/status
```

The health endpoint reports Magen3 version `2.3.0` and the Foundation Available control state. The status endpoint exposes no credentials.

## 12. Database and migrations

- No schema migration.
- PostgreSQL and memory-store paths use the same normalized contract.
- Existing migration history is unchanged.
- Existing Railway startup behavior is unchanged.

## 13. Environment variables

No new required environment variable was introduced.

Current Casper RPC and relayer environment variables remain unchanged. Provider observations are supplied by the trusted integration adapter, not read from a new secret environment variable in this milestone.

## 14. Backward compatibility

Preserved:

- existing Agent IDs and API keys;
- existing authentication headers and Gateway endpoint;
- existing agents, policies, approvals, audit records, and emergency pauses;
- Casper contract hash, relayer, and decision proofs;
- Human Approval bindings and organizational quorum;
- JavaScript SDK, Python SDK, MCP, Codex, YieldBot, Railway, and Vercel behavior;
- requests and policies without RPC metadata or enabled RPC controls.

## 15. Major files changed

- `backend/lib/rpcChainIntegrity.mjs`
- `backend/lib/rpcChainIntegrity.test.mjs`
- `backend/lib/rpcChainIntegrity.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/test/core.test.mjs`
- `docs/RPC_CHAIN_INTEGRITY.md`
- platform, Gateway, SDK, MCP, Execution Integrity, README, and roadmap documentation.

## 16. Tests executed

Successfully executed from the working source:

- **332/332 backend tests**;
- **18/18 focused RPC evaluator and authenticated Gateway tests**;
- **24/24 frontend security-model tests** as part of the backend suite;
- **21/21 JavaScript SDK tests**;
- **16/16 Python SDK tests**;
- **17/17 MCP core tests**;
- JavaScript SDK TypeScript compilation;
- MCP core TypeScript compilation;
- frontend ES2020 semantic TypeScript project check;
- JavaScript/ESM syntax validation;
- memory-store HTTP health and status endpoints;
- authenticated memory-store HTTP Allowed workflow with two approved providers, dedicated pipeline stage, and audit persistence.

The authenticated HTTP result confirmed:

- decision `Allowed`;
- RPC context status `passed`;
- two provider observations;
- network agreement `true`;
- `rpc-chain-integrity` pipeline stage;
- selected provider persisted in the audit record.

## 17. Build limitation

The exact root build was attempted, but Corepack received HTTP 503 while downloading pnpm 10.14.0 from the configured package endpoint. Therefore the dependency-installed `vite build` was not executed locally.

The frontend passed `tsc -p tsconfig.app.json --noEmit` using an ES2020-compatible dependency declaration set. This covers the application source-level type, JSX, union, and target-library failures that previously stopped Railway and Vercel. Railway and Vercel must still run the complete frozen-lockfile build after deployment.

The full MCP stdio server project could not be dependency-built locally for the same package availability reason. MCP core compiled and all core tests passed.

## 18. Control statuses after this release

### Live

- Agent Authentication and credential lifecycle;
- Policy Enforcement;
- Wallet Validation;
- Contract Validation;
- Transaction Preflight;
- Lifecycle & Replay;
- Token Approval & Permit Safety;
- Privileged Contract Action Classification;
- Emergency Circuit Breaker;
- Approval Escalation & Organizational Quorum;
- Contract Upgrade Safety;
- Contract Argument Policies;
- Agent Instruction Integrity;
- Tool & MCP Integrity;
- Audit persistence;
- Casper decision-proof submission.

### Foundation Available

- Human Approval & Quorum;
- Cryptographic Reviewer Signatures;
- Delegation & Session Key Safety;
- RPC & Chain Integrity;
- Execution Simulation;
- Execution & Settlement Reconciliation;
- Threat Intelligence;
- Oracle Validation;
- Bridge Controls;
- Compliance Controls;
- x402 Payment Controls.

### Planned next

- Gas Sponsorship & Fee Safety.

Later roadmap phases remain unchanged.

## 19. Local run

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm run dev:backend
pnpm run dev:frontend
```

For temporary local memory mode only:

```bash
ALLOW_MEMORY_STORE=true pnpm run dev:backend
```

## 20. Railway notes

- Preserve `DATABASE_URL`, CORS configuration, Casper contract hash, relayer settings, and private relayer key.
- No migration command is newly required for this release.
- Confirm `/api/health` reports `2.3.0`.
- Confirm `/api/rpc-chain-integrity/status` reports `foundation_available`.
- Test a policy-approved provider observation through the deployed Gateway.
- Verify unavailable and wrong-network evidence route according to policy.

## 21. Vercel notes

- No new environment variables.
- Preserve the existing backend API base URL.
- Confirm Policies, Security Coverage, Integration Health, Developer Portal, and Intent Playground render the RPC control.
- Run the complete Vercel production build.

## 22. Manual QA checklist

- [ ] Enable RPC & Chain Integrity on a test policy.
- [ ] Configure at least one approved HTTPS provider.
- [ ] Submit the approved-provider Playground example.
- [ ] Confirm Allowed and the dedicated pipeline stage.
- [ ] Confirm audit provider evidence and no credentials.
- [ ] Submit stale provider evidence and confirm policy behavior.
- [ ] Submit missing synchronization evidence and confirm it is unavailable.
- [ ] Submit missing required network identity and confirm no pass finding.
- [ ] Submit wrong-network evidence and confirm Blocked.
- [ ] Submit provider disagreement and confirm configured action.
- [ ] Test timeout/rate-limit evidence.
- [ ] Test unauthorized failover.
- [ ] Test authorized complete failover.
- [ ] Confirm legacy agents and policies still execute normally.
- [ ] Confirm Casper decision proof behavior is unchanged.
- [ ] Verify desktop, mobile, fixed sidebar, wallet gating, and Docs navigation.

## 23. Conventional commit

```text
feat(execution-integrity): add RPC and chain integrity controls
```

## 24. Recommended next milestone

**Gas Sponsorship & Fee Safety** is the next Phase 3 milestone. It should reuse the existing policy, findings, audit, approval, and chain-integrity evidence rather than introducing a parallel fee-authorization path.
