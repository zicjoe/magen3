# Magen3 Privileged Contract Action Classification — Implementation Report

## Release summary

This release implements the second Phase 1 milestone, **Privileged Contract Action Classification**, as a Live control under **Agent Shield → Contract & Permission Safety → Privileged Actions**.

It preserves the existing eight-area product model, Gateway endpoint, Agent IDs, credentials, policies, audit history, Human Approval workflow, Casper decision proofs, SDKs, MCP, Railway, Vercel, and generic contract integrations.

## Implemented

- Dedicated deterministic `Privileged Action Controls` evaluator
- Seventeen supported administrative classifications
- Explicit adapter metadata plus supported entry-point and method-signature classification
- Contradictory classification hard block
- Contract, package, target, and network binding
- Approved administrator and implementation controls
- Blocked and review-required action matrices
- Required role, recipient, amount, and material-change checks
- SHA-256 protected-parameter fingerprint
- Existing Human Approval exact-intent binding integration
- Action-specific quorum without silent quorum reduction
- Audit persistence in memory and PostgreSQL stores
- Security Pipeline findings and risk precedence
- API health, status endpoint, and Gateway specification updates
- Policy creation, editing, starter defaults, and progressive-disclosure UI
- Security Coverage and Integration Health evidence
- Intent Playground scenarios
- JavaScript/TypeScript SDK types and tests
- Python SDK tests and examples
- MCP schema, safety boundary, and tests
- Product, Gateway, SDK, MCP, and control documentation

## Verification executed

- Backend and security-model suite: **211/211 passed**
- Focused Privileged Action evaluator and authenticated Gateway integration tests: **20/20 passed**
- JavaScript/TypeScript SDK: build completed; **13/13 tests passed**
- Python SDK: **9/9 tests passed**
- MCP core: **6/6 tests passed** using temporary local transpilation of `core.ts`
- Frontend security-model tests: **9/9 passed**
- TypeScript/TSX syntax validation: **57 source files passed**
- JavaScript module syntax validation: **67 source files passed**
- Memory-store HTTP smoke test: `/api/health` and `/api/privileged-action-controls/status` passed against a real local server process

The backend suite exercises memory-store registration, policy creation, authenticated Gateway decisions, structured findings, exact-bound approval creation, action-specific quorum, audit persistence, status endpoints, and generic-contract compatibility.

## Checks requiring installed or external services

The configured package registry returned HTTP 503 for pnpm 10.14.0, so the full dependency-backed root `pnpm verify`, Vite production build, and installed MCP stdio-server build could not be executed in this environment. The official JavaScript SDK was built with the available system TypeScript compiler, and all source files passed parser/syntax validation.

The following also require the user's deployed infrastructure and were not falsely reported as completed:

- Railway PostgreSQL connection and startup path
- Live Casper Testnet proof submission and relayer confirmation
- Casper Wallet reviewer and execution flows
- Vercel deployment
- External threat, oracle, bridge, x402, or compliance providers

No new external provider is required by this milestone.

## Database and migrations

No database migration is required.

The existing additive JSON fields are sufficient:

- `policies.structured_rules`
- `audit_logs.original_intent`
- `audit_logs.module_findings`
- `audit_logs.pipeline_stages`

Memory-store and PostgreSQL persistence paths were updated together.

## New policy fields

- `privilegedActionControlsEnabled`
- `privilegedActionMode`
- `privilegedActionsRequiringReview`
- `privilegedActionsBlocked`
- `approvedAdministrators`
- `approvedImplementations`
- `privilegedActionQuorumRules`
- `unknownPrivilegedAction`

Legacy policies use a non-breaking disabled default until the operator explicitly enables the control.

## New Gateway metadata

Use `action.privilegedAction` with unsigned, non-secret metadata. See `docs/PRIVILEGED_ACTION_CONTROLS.md`.

## API additions

- `GET /api/privileged-action-controls/status`
- `/api/health` includes `privilegedActionControls`
- `/api/agent-gateway/spec` documents request metadata, policy fields, supported classifications, checks, and the security boundary
- Gateway responses may include `result.privilegedActionControlsContext`

## Major files changed

- `backend/lib/privilegedActionControls.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/approvalWorkflow.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/lib/securityModel.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `src/app/lib/api.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- documentation and tests

## Compatibility notes

- No agent or API-key recreation is required.
- No Casper contract hash or relayer change is required.
- No environment-variable change is required.
- Existing authentication headers are unchanged.
- Existing generic contract calls are skipped unless a supported method is deterministically recognized.
- Existing approval bindings remain valid for their original intents.
- SDK methods and MCP tool names are unchanged.

## Deployment

### Railway

Replace the project files while preserving `.git`, `.env`, and the private relayer key. Push the commit. Railway can use the existing `railway:start` command. No migration or new environment variable is required.

### Vercel

Push the same commit. The existing Vite build and `VITE_API_URL` setup remain unchanged.

## Local run

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm dev:backend
corepack pnpm dev:frontend
```

## Manual QA

1. Connect the Casper Wallet and verify wallet gating.
2. Open an active policy.
3. Enable Privileged Action Controls.
4. Configure review and blocked action lists.
5. Add an approved administrator and approved implementation.
6. Optionally configure `Ownership Transfer=2` in per-action quorum rules and provide two eligible approvers.
7. Submit **Approved privileged mint** in Intent Playground.
8. Confirm `Privileged Action Controls` findings and the parameter fingerprint appear in Audit Logs.
9. Submit **Ownership transfer requiring review**.
10. Confirm the approval request binds to the exact audit and uses the configured quorum.
11. Confirm execution is blocked before quorum and allowed to continue only after approval.
12. Submit **Unapproved proxy implementation**.
13. Submit **Unknown privileged method** and verify the configured unknown-action behavior.
14. Submit **Contradictory privileged classification** and confirm it is Blocked.
15. Submit a normal generic contract call and confirm it is not misclassified.
16. Verify new audit records appear without reconnecting the wallet or refreshing the page.
17. Verify desktop, mobile, fixed sidebar, and Docs navigation.

## Control status after this release

### Live

- Agent Authentication
- Credential Lifecycle
- Policy Enforcement
- Wallet Validation
- Contract Validation
- Transaction Preflight
- Lifecycle & Replay
- Token Approval & Permit Safety
- Privileged Contract Action Classification
- Audit Persistence
- Casper Decision-Proof Submission

### Foundation Available

- Human Approval & Quorum
- Execution Simulation
- Execution & Settlement Reconciliation
- Threat Intelligence
- Oracle Validation
- Bridge Controls
- x402 Payment Controls
- Compliance Controls

### Planned

The remaining roadmap items remain planned. No unrelated control was partially presented as Live.

## Roadmap progress

Phase 1:

1. Token Approval & Permit Safety — **Completed / Live**
2. Privileged Contract Action Classification — **Completed / Live**
3. Emergency Circuit Breaker — **Next recommended milestone**
4. Cryptographic Reviewer Signatures — Planned
5. Approval Escalation and Organizational Quorum — Planned
6. Contract Upgrade Safety — Planned
7. Contract Argument Policies — Planned

## Conventional commit

```text
feat(contract-safety): add privileged action classification
```
