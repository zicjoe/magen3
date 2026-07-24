# Magen3 Cryptographic Reviewer Signatures Implementation Report

## Release

- **Release:** Magen3 1.6.0
- **Milestone:** Cryptographic Reviewer Signatures
- **Protection area:** Policy & Approval Controls
- **Control:** Human Approval & Quorum → Reviewer Signature Verification
- **Control status:** Foundation Available
- **Implementation state:** Backend verification, persistent one-time challenges, browser signing workflow, verified-quorum enforcement, audit evidence, SDK/MCP response support, and automated tests are complete. The control remains Foundation Available until the deployed Casper Wallet browser flow is verified end to end.
- **Source baseline:** `magen3-emergency-circuit-breaker-upgrade.zip`
- **Compatibility approach:** Additive database migration, additive policy fields, additive response fields, and no changes to existing Agent IDs, API keys, API-key hashes, Gateway authentication headers, approval IDs, approval binding format, Casper contract configuration, relayer configuration, SDK methods, MCP tool names, Railway configuration, or Vercel configuration.

## 1. Architecture found in the source ZIP

The source release preserves Magen3 as a modular execution firewall with these layers:

1. React/Vite/TypeScript operator application with fixed navigation and wallet-gated operational pages.
2. Node.js ESM backend with deterministic protection evaluators and risk precedence.
3. Agent Gateway authentication using Agent ID plus a hashed API credential.
4. Agent capability configuration and additive structured policy rules.
5. Structured findings with `pass`, `warning`, `fail`, `unavailable`, and `skipped` statuses.
6. Deterministic final outcomes: `Blocked` → `Review Required` → `Allowed` precedence.
7. PostgreSQL persistence through Drizzle plus an aligned memory-store fallback.
8. Exact-bound Human Approval and Quorum workflow.
9. Emergency Circuit Breaker, audit persistence, and Casper decision-proof submission.
10. JavaScript/TypeScript SDK, Python SDK, MCP server, Codex integration, Intent Playground, Developer Portal, and embedded documentation.
11. Railway backend and Vercel frontend deployment configuration.

The current Magen3 visual identity, fixed sidebar, wallet flow, eight broad protection areas, Agent Shield, Connected Agents, Policies, Human Approval Queue, Audit Logs, Developer Portal, Intent Playground, SDKs, MCP, Casper proof system, and deployment configuration were preserved.

## 2. Pre-implementation gap

The previous Human Approval workflow already supported:

- Exact-intent approval binding.
- Authorized reviewer-wallet lists.
- Distinct-wallet quorum.
- Approval expiry.
- Requester/approver separation where configured.
- Rejection comments.
- Duplicate-response prevention.
- Agent polling.
- Execution gating.
- Approval evidence in audit records.
- Approval-gated emergency-pause resume.

However, reviewer identity was accepted from the submitted public wallet address. The workflow did not yet provide:

- A one-time cryptographic challenge.
- Reviewer-wallet proof through Casper Wallet message signing.
- Ed25519 or Secp256k1 signature verification.
- Domain separation.
- Chain binding.
- Response binding.
- Challenge expiry.
- Nonce replay protection.
- Persistent challenge state across Railway restarts.
- Verified-response-only quorum calculation.
- Sanitized signature-verification evidence in audits and SDK responses.
- A browser flow that requests the challenge, opens Casper Wallet, signs, and submits the response.

That limitation meant Human Approval & Quorum correctly remained Foundation Available.

## 3. Implemented cryptographic challenge model

A dedicated deterministic approval-signature module was added.

### Challenge domain

```text
magen3.approval-response.v1
```

### Exact challenge binding

Every challenge binds all of the following:

- Approval request ID.
- Audit record ID.
- Agent ID.
- Exact approval binding hash.
- Reviewer response: Approve or Reject.
- Reviewer Casper public key.
- One-time 32-byte nonce.
- Issued timestamp.
- Expiry timestamp.
- Domain.
- Casper chain name.

Changing the reviewer, response, approval binding, chain, domain, nonce, message, or expiry causes verification to fail.

### Lifetime

- Default challenge lifetime: 300 seconds.
- Policy-configurable range: 30–1,800 seconds.
- A challenge can never outlive its approval request.
- Expired challenges cannot count toward quorum.

### Supported Casper reviewer keys

- Ed25519 public keys with Casper algorithm tag `01`.
- Secp256k1 public keys with Casper algorithm tag `02`.

Unsupported, malformed, or mismatched reviewer keys fail closed.

### Verification behavior

The backend:

1. Loads the exact pending approval request.
2. Confirms that cryptographic signatures are enabled by the active approval context.
3. Confirms that the reviewer is authorized.
4. Confirms that the challenge belongs to the same approval, audit, agent, binding, reviewer, response, domain, and chain.
5. Confirms that the challenge is pending and unexpired.
6. Reconstructs and hashes the canonical message.
7. Verifies the Ed25519 or Secp256k1 signature.
8. Atomically marks the challenge used.
9. Stores only the signature hash and verification metadata.
10. Counts the response toward quorum only after verification succeeds.

Raw reviewer signatures are processed transiently for verification and are not returned in public approval records or persisted in approval responses.

## 4. Replay and mutation protection

The challenge store enforces one-time use.

The implementation rejects:

- Reusing a consumed challenge.
- Using a challenge for a changed Approve/Reject response.
- Using a challenge with a different reviewer wallet.
- Using a challenge after expiry.
- Using a challenge after the approval binding changes.
- Using a challenge against another request, audit record, or agent.
- Using a challenge with a different domain or chain.
- Using a signature from the wrong Casper key.
- Submitting a second response from the same reviewer.

When a reviewer requests a replacement challenge for the same approval and response, older pending challenges for that reviewer are superseded so only the current challenge can be used.

## 5. Database and migration

An additive `approval_signature_challenges` table was added.

It stores:

- Challenge ID.
- Approval request, audit, and agent binding.
- Approval binding hash.
- Expected response.
- Reviewer wallet.
- One-time nonce.
- Issued and expiry timestamps.
- Domain and chain name.
- Canonical message and challenge hash.
- Pending, Used, Superseded, or Expired state.
- Used timestamp.
- Signature hash.
- Signature algorithm.
- Verification status and sanitized verification error.
- Created and updated timestamps.

Indexes were added for:

- Approval request ID.
- Reviewer wallet.
- Challenge status.
- Expiry timestamp.

No existing table, record, migration history, agent, API key, policy, approval request, audit record, emergency pause, or Casper proof was deleted or rewritten.

### Migration command

```bash
pnpm db:migrate
```

The existing PostgreSQL store startup path still runs the migration function during initialization, so Railway remains compatible with the established deployment flow.

### Memory-store parity

The memory store implements the same challenge creation, supersession, expiry, verification, one-time use, response counting, audit synchronization, and public-status behavior as PostgreSQL.

## 6. Human Approval and quorum enforcement

Signature-enabled approval requests now expose:

- `signatureRequired`.
- `verifiedApprovalsReceived`.
- Sanitized verified-response metadata.
- Signature domain and chain.
- Remaining approval count.
- `mayProceedToSigning`.

For signature-enabled policies:

- Unsigned reviewer responses are rejected.
- Invalid signatures are rejected.
- Only verified responses count toward quorum.
- Only verified approvals can make `mayProceedToSigning` true.
- Execution authorization rechecks verified quorum instead of trusting a previously calculated count.
- Verified rejection signatures terminate the workflow according to existing rejection rules.
- Invalid responses cannot be mixed into quorum.

The existing exact approval binding, authorized reviewer list, distinct-wallet requirement, expiry, requester separation, rejection comment, duplicate prevention, agent polling, execution gating, and emergency-resume approval flow remain in place.

## 7. Backward compatibility and policy defaults

The existing `structuredRules` policy model was extended with:

- `requireCryptographicReviewerSignature`
- `approvalSignatureLifetimeSeconds`
- `requireReviewerChainBinding`
- `requireApprovalDomainSeparation`
- `approvalSignatureChainName`

### Legacy policies

A policy created before this release and lacking `requireCryptographicReviewerSignature` remains unsigned by default. This prevents existing approval integrations from breaking immediately after deployment.

### New starter policies

New starter policies enable cryptographic reviewer signatures by default and use safe chain/domain binding defaults.

### Existing integrations preserved

No user must recreate:

- Agents.
- Agent IDs.
- API keys.
- API-key hashes.
- Policies.
- Approval requests.
- Audit records.
- Emergency pauses.
- SDK clients.
- MCP integrations.
- Casper decision proofs.

## 8. API changes

### Existing approval response endpoint preserved

```http
POST /api/approvals/:approvalId/respond
```

For a signature-enabled request, its body additionally requires:

- `challengeId`
- `signatureHex`

### New challenge endpoint

```http
POST /api/approvals/:approvalId/challenge
```

The request specifies:

- Public reviewer wallet.
- Intended response: Approve or Reject.

The response contains the public one-time challenge message and sanitized challenge metadata needed for Casper Wallet message signing.

### Approval workflow status

```http
GET /api/approval-workflow/status
```

The status response now documents:

- Foundation Available maturity.
- Challenge endpoint.
- Ed25519 and Secp256k1 support.
- Replay protection.
- Exact response binding.
- Domain separation.
- Security boundary.

### Agent polling preserved

```http
GET /api/agent-gateway/approvals/:approvalOrAuditId?agentId=...
```

Agents continue polling the same endpoint. They receive sanitized verified-quorum evidence but never receive the raw reviewer signature.

## 9. Casper Wallet browser workflow

The existing Casper Wallet integration was extended with message signing.

For a signature-enabled request, the Human Approval Queue now performs this flow:

1. Validate the selected reviewer wallet and required rejection comment.
2. Request a short-lived challenge from the backend.
3. Confirm the currently connected Casper Wallet public key matches the authorized reviewer.
4. Open Casper Wallet message signing for the canonical challenge.
5. Submit the returned signature with the challenge ID.
6. Let the backend verify the signature and update quorum.
7. Refresh the exact approval and audit state.

The UI displays:

- Casper signature required.
- Sign & Approve or Sign & Reject actions.
- Verified response state.
- Verification algorithm.
- Sanitized signature-hash evidence.
- Verified approval count.

The UI does not display or preserve the raw signature after verification.

## 10. Structured findings, Security Pipeline, and Audit

A dedicated `Cryptographic Reviewer Signatures` finding is added to the existing Policy & Approval Controls evidence.

The finding explains:

- Whether the policy requires a signature.
- Whether a verified response exists.
- Verification algorithm.
- Domain and chain binding.
- Challenge and signature hashes.
- Reviewer and verification timestamp.
- Remaining quorum state.
- Remediation where verification is missing or invalid.

Audit synchronization records only necessary evidence. It does not store:

- Private keys.
- Seed phrases.
- Mnemonics.
- Wallet secrets.
- Full API keys.
- Raw transaction signatures.
- Raw reviewer signatures in approval response evidence.
- Raw signed transactions.

Existing Casper decision-proof submission remains unchanged and can anchor the deterministic final decision and audit evidence through the current proof pipeline.

## 11. Security Coverage and Integration Health

Security Coverage remains deterministic and explainable.

When a policy requires cryptographic reviewer signatures, approval coverage requires observed signature-verification evidence rather than treating an unsigned approval workflow as complete protection.

Integration Health consumes the real Policy & Approval Controls findings. Invalid, unavailable, or missing required reviewer-signature evidence cannot be reported as a healthy passing control.

This remains configured protection coverage, not a trust score or guarantee of safety.

## 12. Frontend and UX changes

The current interface and navigation were preserved. No sidebar item was added.

The milestone appears through progressive disclosure in:

- **Policies:** Require Casper Wallet Signature, signature lifetime, chain binding, domain separation, and reviewer chain name.
- **Human Approval Queue:** Signature-required status, challenge request, wallet signing, and verified response evidence.
- **Agent Details:** Updated Human Approval maturity and recent signature findings.
- **Security Coverage:** Configured and observed signature coverage.
- **Integration Health:** Real Policy & Approval signature state.
- **Docs:** Dedicated Cryptographic Reviewer Signatures documentation and updated approval/developer references.

No heavy animation, additional glow, generic dashboard redesign, or artificial pipeline delay was introduced.

## 13. SDK, MCP, and developer boundaries

### JavaScript/TypeScript SDK

The existing approval polling method remains unchanged. Approval types now expose sanitized fields including:

- Signature-required state.
- Verified approval count.
- Sanitized response verification evidence.

The agent SDK cannot create reviewer challenges, access a reviewer wallet, sign approval responses, approve a request, or broadcast a transaction.

### Python SDK

The dictionary response preserves the same sanitized approval fields. No approval-signing method was added.

### MCP and Codex

`magen3_get_approval` reports whether cryptographically verified quorum has completed and continues to fail closed until `mayProceedToSigning` is true.

The MCP server cannot:

- Create reviewer challenges.
- Receive reviewer signatures.
- Impersonate a reviewer.
- Approve or reject a request.
- Access wallet secrets.

Human approval stays inside the wallet-gated Magen3 operator interface.

## 14. Major files changed

### Backend and persistence

- `backend/lib/approvalSignatures.mjs` — canonical challenge creation and Ed25519/Secp256k1 verification.
- `backend/lib/approvalSignatures.test.mjs` — deterministic cryptographic unit tests.
- `backend/lib/approvalSignatures.gateway.integration.test.mjs` — signed approval and replay integration tests.
- `backend/lib/approvalWorkflow.mjs` — policy normalization, verified-response-only quorum, public summaries, and signature findings.
- `backend/store/memoryStore.mjs` — challenge persistence and approval integration.
- `backend/store/postgresStore.mjs` — PostgreSQL challenge persistence and atomic one-time claim.
- `backend/db/schema.mjs` — additive challenge table.
- `backend/db/migrate.mjs` — additive migration and indexes.
- `backend/server.mjs` — challenge route, workflow status, API specification, and version 1.6.0.
- `package.json` — release version 1.6.0.

### Frontend

- `src/app/App.tsx` — policy controls and signed Human Approval Queue flow.
- `src/app/lib/api.ts` — challenge API client.
- `src/app/lib/casperWallet.ts` — Casper Wallet message signing.
- `src/app/lib/securityModel.ts` — control catalog, Security Coverage, and maturity state.

### SDK and MCP

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`

### Documentation

- `docs/CRYPTOGRAPHIC_REVIEWER_SIGNATURES.md`
- `docs/HUMAN_APPROVAL_WORKFLOW.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/EMERGENCY_CIRCUIT_BREAKER.md`
- `docs/PRIVILEGED_ACTION_CONTROLS.md`
- `README.md`

## 15. Environment variables

No new required environment variable was introduced.

The implementation uses the existing Casper network configuration where available and otherwise derives the configured policy chain name. New starter policies default to `casper-test` for the current testnet workflow.

No private key, mnemonic, reviewer key, or signature belongs in `.env`.

## 16. Local run instructions

Preserve your current `.env`, then run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:backend
```

In another terminal:

```bash
pnpm dev:frontend
```

For the complete configured verification workflow:

```bash
pnpm verify
```

## 17. Railway notes

- Keep the existing `DATABASE_URL`.
- Keep the current Casper relayer variables and private PEM path unchanged.
- The backend start command remains `node backend/server.mjs`.
- The additive challenge-table migration runs through the existing store startup/migration flow.
- No API-key rotation or agent recreation is required.
- Verify challenge creation, signature verification, approval audit synchronization, and agent polling against the deployed PostgreSQL store after deployment.

## 18. Vercel notes

- Existing Vercel configuration is unchanged.
- Existing frontend API-base configuration is unchanged.
- Confirm that the deployed frontend reaches the upgraded Railway backend.
- Test both Casper Ed25519 and Secp256k1 reviewer accounts where available.
- Verify wallet cancellation, wrong connected wallet, expired challenge, valid approval, valid rejection, and refreshed audit state.

## 19. Verification performed

### Passed

- **235/235 backend tests**.
- **20/20 focused approval and cryptographic-signature tests** within the backend suite.
- **14/14 JavaScript SDK tests**.
- **10/10 Python SDK tests**.
- **7/7 MCP core tests**.
- **74 JavaScript/ESM files** passed Node syntax validation.
- **58 TypeScript/TSX files** passed parser-level syntax validation.
- Real memory-store HTTP workflow passed:
  - Health version 1.6.0.
  - Agent registration.
  - Signature-enabled policy creation.
  - Authenticated `Review Required` Gateway decision.
  - Challenge creation.
  - Ed25519 message signing.
  - Backend verification.
  - Verified quorum completion.
  - `mayProceedToSigning` true.
  - Agent polling.
  - No raw signature exposed in the public approval response.

### Not executed or unavailable

- The pinned pnpm package manager and dependencies could not be downloaded because the configured Corepack package endpoint returned HTTP 503.
- Therefore, the dependency-installed root `tsc -b`, Vite production build, and full MCP stdio protocol test were not executed.
- JavaScript SDK compilation used the available system TypeScript compiler, not the unavailable pinned TypeScript 6.0.3 package.
- MCP core tests used temporary transpilation and did not include the dependency-backed stdio protocol test.
- A real browser Casper Wallet extension flow could not be run in the container.
- Live Railway PostgreSQL, Casper Testnet, relayer, and Vercel deployment checks require the deployed environment.

No test is reported as passed unless it was actually executed.

## 20. Manual QA checklist

1. Replace project files while preserving `.git`, `.env`, and the private relayer key.
2. Run the additive database migration.
3. Deploy Railway and confirm `/api/health` reports version 1.6.0.
4. Open a new starter policy and verify Casper reviewer signatures default to enabled.
5. Open a legacy policy and confirm an absent signature field remains disabled until explicitly enabled.
6. Configure one or more authorized reviewer Casper wallets.
7. Trigger `Review Required` from Intent Playground or an external agent.
8. Confirm the Approval Queue shows Casper signature required.
9. Try approval with the wrong connected wallet and confirm rejection.
10. Request a challenge, cancel wallet signing, and confirm quorum does not change.
11. Sign and approve with an authorized Ed25519 wallet.
12. Where available, repeat with a Secp256k1 wallet.
13. Confirm only verified responses count toward quorum.
14. Confirm the same challenge cannot be reused.
15. Confirm an expired challenge cannot be submitted.
16. Confirm a challenge for Approve cannot be used for Reject.
17. Confirm a rejection follows the comment requirement and ends the workflow.
18. Confirm the agent polling endpoint reports verified quorum and permits signing only after completion.
19. Confirm Audit Logs show signature verification evidence but not the raw signature.
20. Confirm an approved action can continue to wallet signing and execution confirmation.
21. Confirm emergency-pause resume approvals still work with signature-enabled policy rules.
22. Confirm mobile layout, fixed sidebar, Docs navigation, and wallet gating remain intact.

## 21. Updated control status and roadmap

### Completed Phase 1 milestones

1. Token Approval & Permit Safety — **Live**.
2. Privileged Contract Action Classification — **Live**.
3. Emergency Circuit Breaker — **Live**.
4. Cryptographic Reviewer Signatures — **Foundation Available; implementation complete, deployed Casper Wallet browser verification pending**.

### Existing relevant controls

- Human Approval & Quorum — **Foundation Available**.
- Execution Simulation — **Foundation Available**.
- Threat Intelligence — **Foundation Available**.
- Oracle Validation — **Foundation Available**.
- Bridge Controls — **Foundation Available**.
- Compliance Controls — **Foundation Available**.
- x402 Payment Controls — **Foundation Available**.

Magen3 is not finished. The next Phase 1 milestone is **Approval Escalation & Organizational Quorum**, followed by Contract Upgrade Safety and Contract Argument Policies.

## 22. Recommended conventional commit

```text
feat(policy-controls): add cryptographic reviewer signatures
```
