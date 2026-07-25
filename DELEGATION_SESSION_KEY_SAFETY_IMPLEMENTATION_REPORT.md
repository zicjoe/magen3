# Magen3 Delegation & Session Key Safety Implementation Report

## Release summary

- **Release:** Magen3 2.2.0
- **Milestone:** Delegation & Session Key Safety
- **Protection area:** Agent Shield → Agent Trust & Access → Delegated Permissions
- **Control maturity:** Foundation Available
- **Source of truth:** `magen3-tool-mcp-integrity-upgrade.zip`
- **Database migration:** None
- **New required environment variables:** None
- **Casper contract change:** None
- **Relayer change:** None
- **Next roadmap milestone:** RPC & Chain Integrity

Delegation & Session Key Safety is implemented as a deterministic pre-signing evaluator. Its code maturity remains Foundation Available until a deployed Casper Wallet or smart-account adapter completes the published end-to-end Live criteria. It verifies a domain-separated Casper-signed delegated-permission attestation and enforces exact signer, wallet, delegate, session-key, network, contract, method, asset, amount, frequency, lifetime, revocation, depth, and redelegation boundaries. It does not use a language model to determine Allowed, Blocked, or Review Required.

## 1. Architecture verified before editing

The source release contained:

- React, Vite, and TypeScript frontend with the existing fixed sidebar and wallet-gated experience;
- Node ESM Gateway and independent deterministic security evaluators;
- final-decision precedence of Blocked → Review Required → Allowed;
- PostgreSQL through Drizzle and an aligned memory-store fallback;
- additive JSON policy, intent, findings, pipeline, and audit fields;
- exact-intent Human Approval, cryptographic reviewer signatures, organizational quorum, escalation, and execution windows;
- Casper decision-proof submission and relayer configuration;
- JavaScript/TypeScript SDK, Python SDK, official MCP server, and Codex integration;
- Railway Docker deployment and Vercel frontend deployment.

The implementation extends these systems instead of creating a second authentication, approval, audit, or execution path.

## 2. Gap found

Delegation and session permissions were marked Planned. The source release did not have:

- a canonical delegated-authority attestation;
- delegating Casper wallet signature verification;
- normalized delegation/session-key metadata;
- delegate allowlists, blocklists, and policy revocation IDs;
- lifetime, depth, redelegation, scope, amount, or frequency enforcement;
- a dedicated Security Pipeline stage or response context;
- sanitized delegation audit evidence;
- Policy UI, Security Coverage, Integration Health, Playground examples, status endpoint, SDK/MCP schemas, documentation, or dedicated tests.

## 3. Backend implementation

A dedicated evaluator was added at:

- `backend/lib/delegationSafety.mjs`

It exports the canonical attestation message/hash builders and the deterministic evaluator. The evaluator returns the existing structured finding model:

- module;
- status;
- severity;
- rule;
- message;
- evidence;
- remediation.

The policy engine evaluates Delegation & Session Key Safety after Agent Instruction Integrity and Tool & MCP Integrity and before transaction-specific wallet, contract, and spend controls. It contributes to the existing risk precedence and never bypasses other protection controls.

## 4. Gateway contract

The Gateway endpoint remains unchanged:

```http
POST /api/agent-gateway/intents
```

Optional delegated-authority metadata is accepted under `action.delegation`:

- `delegationId`;
- `delegatingWallet`;
- `delegate`;
- optional public `sessionKey`;
- `allowedNetworks`;
- `allowedContracts`;
- `allowedMethods`;
- `allowedAssets`;
- `nativeAmountLimit`;
- `tokenAmountLimits`;
- `maxTransactionAmount`;
- `maxFrequency`;
- `validFrom`;
- `expiresAt`;
- `revocationStatus`;
- `delegationDepth`;
- `redelegationAllowed`;
- `nonce`;
- `chainName`;
- optional `attestationHash`;
- transient `attestationSignature`.

Aliases under delegated-permission and session-key naming are normalized without changing the public Gateway envelope.

The Gateway still rejects private keys, seed phrases, mnemonics, wallet secrets, raw signed transactions, and unrelated raw signatures. The delegation attestation signature is a narrowly scoped exception used transiently for verification.

## 5. Canonical Casper attestation

The canonical message uses:

- domain `magen3.delegation.v1`;
- chain binding;
- exact delegation and Agent IDs;
- delegating wallet, delegate, and optional public session key;
- canonical sorted scope arrays;
- normalized native and token limits;
- maximum transaction amount and hourly frequency;
- validity, revocation, depth, redelegation, and nonce.

The message states that signing authorizes only the bounded delegation and does not sign or submit a blockchain transaction.

Magen3 verifies Casper Wallet message signatures for:

- Ed25519 public keys;
- Secp256k1 public keys.

When an adapter supplies `attestationHash`, Magen3 recomputes the SHA-256 hash from normalized fields and rejects substitution or mutation.

## 6. Deterministic enforcement

The evaluator checks:

1. structural validity of IDs, public keys, scopes, times, limits, depth, and hash;
2. canonical attestation-hash equality;
3. Casper signer verification;
4. execution-wallet and delegating-wallet equality;
5. approved and blocked delegates;
6. policy and request revocation state;
7. activation and expiration;
8. maximum delegation lifetime;
9. maximum delegation depth;
10. redelegation permission;
11. exact network scope;
12. exact contract scope for contract execution;
13. exact method/action scope;
14. exact asset scope;
15. native and per-token amount limits;
16. maximum transaction amount;
17. rolling hourly frequency from prior audit history.

Malformed or invalid signatures, wallet substitution, blocked delegates, revoked or expired authority, excessive delegation depth, forbidden redelegation, and hard scope/limit violations fail closed. Unknown delegates and unavailable required signer evidence follow policy-configured Warn, Review, or Block behavior.

## 7. Policy model

The milestone adds these `structuredRules` fields:

- `delegationControlsEnabled`;
- `delegationMode`;
- `requireExpiringDelegation`;
- `maximumDelegationLifetime`;
- `maximumDelegationDepth`;
- `allowRedelegation`;
- `approvedDelegates`;
- `blockedDelegates`;
- `revokedDelegationIds`;
- `unknownDelegateAction`;
- `requireScopeBinding`;
- `requireCryptographicDelegationAttestation`;
- `delegationUnavailableAction`.

Existing policies without the control remain compatible. New policy forms default to short-lived, cryptographically signed, least-privilege delegation in Review mode.

## 8. Audit and privacy model

Memory and PostgreSQL stores persist aligned sanitized evidence inside the existing audit JSON:

- delegation ID;
- delegating wallet;
- delegate and public session key;
- scopes, limits, validity, revocation, depth, and redelegation state;
- canonical attestation hash;
- signer-verification result;
- signature hash and algorithm;
- rolling historical use count;
- violations and remediation.

They do not persist:

- raw delegation signatures;
- private session keys;
- wallet private keys;
- mnemonics or seed phrases;
- raw signed transactions.

No database migration was required because the existing `structured_rules`, original-intent, findings, pipeline, and audit JSON fields already support the evidence.

## 9. Human Approval and execution compatibility

Review Required results reuse the current exact-bound Human Approval system. The normalized delegation fields are included in the existing intent and approval binding. Changing the delegate, session key, network, contract, method, asset, amount, expiry, nonce, or other protected value creates a different bound request.

Human Approval cannot override an invalid signature, revoked or expired delegation, wallet substitution, forbidden redelegation, or a hard scope/limit violation.

Existing cryptographic reviewer signatures, organizational quorum, execution delays, signing windows, Emergency Circuit Breaker, execution confirmation, audit reconciliation, and Casper decision proofs remain unchanged.

## 10. Frontend implementation

The existing design and navigation were preserved. Added:

- Live Delegation & Session Key Safety control inside Agent Trust & Access;
- policy creation and editing fields;
- collapsed advanced delegate/revocation configuration;
- deterministic Security Coverage contribution;
- Integration Health status from actual findings;
- Developer Portal status endpoint;
- Intent Playground examples for missing signature, revoked authority, and method outside scope.

The static Playground does not fabricate an Allowed wallet signature. It explains that a real Allowed delegated execution must be constructed and signed by a trusted connected-wallet adapter.

## 11. SDK and MCP implementation

Updated:

- JavaScript/TypeScript SDK request and response types plus a backend-compatible canonical attestation-message builder;
- Python SDK pass-through coverage, canonical message/hash helpers, and documentation;
- MCP Zod intent schema;
- MCP schema descriptions and security boundary;
- official MCP package metadata and tests.

SDKs and MCP can carry public metadata and a transient connected-wallet signature. They do not generate or receive private session keys and do not sign on behalf of the delegating wallet.

## 12. Major files changed

- `backend/lib/delegationSafety.mjs`
- `backend/lib/delegationSafety.test.mjs`
- `backend/lib/delegationSafety.gateway.integration.test.mjs`
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
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `docs/DELEGATION_SESSION_KEY_SAFETY.md`
- related README, Gateway, SDK, MCP, and platform documents.

## 13. Verification actually executed

Successful checks:

- 312/312 backend tests;
- 14/14 focused Delegation evaluator and authenticated Gateway tests;
- 22/22 frontend security-model tests;
- 20/20 JavaScript SDK tests;
- JavaScript SDK TypeScript compilation;
- 15/15 Python SDK tests;
- 16/16 MCP core tests;
- MCP core TypeScript compilation;
- frontend ES2020 semantic TypeScript project check;
- 57 TypeScript/TSX source files passed parser validation;
- 92 JavaScript/ESM source files passed Node syntax validation;
- 13 JSON files passed parsing;
- authenticated memory-store HTTP workflow with a generated Ed25519 Casper keypair;
- version, status endpoint, signature verification, Allowed outcome, pipeline stage, audit signature hash, and raw-signature exclusion.

The existing Casper signature verifier's test suite also covers Secp256k1 verification.

## 14. Build limitation

The exact dependency-installed root build was attempted:

```bash
pnpm run build
```

Corepack could not download pnpm 10.14.0 because the configured package endpoint returned HTTP 503. Therefore this report does not claim that the full dependency-backed Vite production build ran locally.

To catch the Railway/Vercel failure classes previously encountered, the frontend passed an ES2020 semantic TypeScript project check. The source was also scanned for unsupported newer-library calls including `.at()`, `replaceAll()`, and `Object.hasOwn()`; none were present.

Railway and Vercel must still run the frozen-lockfile `tsc -b && vite build` after push.

## 15. Railway and Vercel notes

- No migration command is required for this milestone.
- No new environment variable is required.
- No Dockerfile, Railway, Vercel, CORS, database, Casper contract, or relayer configuration changed.
- Preserve the current `.git`, `.env`, and private relayer key when replacing files.
- Confirm `/api/health` reports version `2.2.0`.
- Confirm `/api/delegation-safety/status` reports `foundation_available`; promote only after deployed connected-wallet end-to-end verification.
- Test a real connected-wallet signed delegation on the deployed backend.

## 16. Compatibility

Preserved:

- existing Agent IDs and API keys;
- existing policies and audit records;
- existing approval and emergency-pause state;
- Gateway endpoint and authentication headers;
- Casper contract hash, proof relayer, and decision-proof flow;
- JavaScript and Python SDK methods;
- MCP and Codex configuration;
- wallet-gated frontend and navigation;
- generic non-delegated requests.

Requests without `action.delegation` remain compatible. The control is evaluated only when enabled and delegation metadata is supplied.

## 17. Control status and roadmap

### Live

- Agent authentication and credential lifecycle
- Agent Instruction Integrity
- Tool & MCP Integrity
- Deterministic policy enforcement and review thresholds
- Emergency Circuit Breaker
- Wallet identity, destination, and spending controls
- Contract identity and entry-point controls
- Token Permissions
- Privileged Contract Actions
- Contract Upgrade Safety
- Contract Argument Policies
- Transaction preflight and lifecycle/replay
- Slippage and output bounds
- Audit persistence and Casper decision-proof submission

### Foundation Available

- Delegation & Session Key Safety — backend enforcement complete; deployed connected-wallet verification pending
- Human Approval and quorum, including reviewer-signature foundation
- Asset identity
- Execution and settlement reconciliation
- Stateful simulation
- Oracle Validation
- Bridge Controls
- x402 authorization and settlement
- Threat Intelligence
- Compliance Controls

### Planned

- RPC & Chain Integrity
- Gas Sponsorship & Fee Safety
- Asset Contract Risk and Wallet Behavioral Controls
- MEV, route, and market-risk controls
- live provider-backed bridge, x402, threat, oracle, and compliance integrations
- Continuous Risk Monitoring

Phase 2 implementation is complete, but Delegation & Session Key Safety still requires deployed connected-wallet verification before promotion to Live. The next engineering milestone begins Phase 3: **RPC & Chain Integrity**.

## 18. Professional commit message

```text
feat(agent-trust): add delegation and session key safety
```

## 19. Manual QA checklist

- [ ] Extract the replacement ZIP while preserving `.git`, `.env`, and the private relayer key.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm run build`.
- [ ] Run `pnpm test` and SDK/MCP test commands.
- [ ] Confirm Railway starts with the existing PostgreSQL configuration.
- [ ] Confirm Vercel completes `tsc -b && vite build`.
- [ ] Open Agent Shield → Agent Trust & Access and confirm Delegation & Session Key Safety is Foundation Available until the deployed connected-wallet verification is complete.
- [ ] Create or edit a policy and verify delegation fields persist.
- [ ] Submit a valid Ed25519 delegated execution and confirm Allowed.
- [ ] Submit a valid Secp256k1 delegated execution and confirm Allowed.
- [ ] Omit the signature and confirm the configured review/unavailable action.
- [ ] Use a wrong signer and confirm Blocked.
- [ ] Change the attestation-bound fields after signing and confirm Blocked.
- [ ] Test expired and not-yet-valid delegations.
- [ ] Test policy and request revocation.
- [ ] Test network, contract, method, asset, amount, and frequency scope violations.
- [ ] Test delegation depth and redelegation restrictions.
- [ ] Confirm raw signatures and private session keys do not appear in Audit Logs.
- [ ] Confirm Review Required still creates the existing exact-bound approval request.
- [ ] Confirm non-delegated legacy requests behave unchanged.
