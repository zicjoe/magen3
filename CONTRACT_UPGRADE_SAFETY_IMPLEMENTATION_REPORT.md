# Magen3 Contract Upgrade Safety Implementation Report

## Release

- Version: 1.8.0
- Milestone: Phase 1 — Contract Upgrade Safety
- Protection area: Agent Shield → Contract & Permission Safety
- Control maturity: Live
- Source of truth: corrected Approval Escalation & Organizational Quorum release

## Architecture verified

Magen3 remains a React/Vite/TypeScript frontend with a Node ESM backend, deterministic evaluator modules, PostgreSQL/Drizzle persistence, aligned memory-store fallback, exact-bound Human Approval, organizational quorum, Casper decision proofs, JavaScript and Python SDKs, and MCP integration.

Contract Upgrade Safety reuses Contract Validation, Privileged Action Controls, Human Approval, organizational quorum, the Security Pipeline, Audit Logs, and Casper proofs. It does not create a parallel approval or replay system.

## Implemented

The Gateway accepts optional `action.contractUpgrade` metadata containing:

- contract and package identifiers
- current and requested implementation
- current and requested code hash
- package version
- upgrade administrator
- request time and execute-after time
- network binding

The deterministic evaluator enforces:

- exact transaction-target binding
- network binding
- current implementation evidence
- requested implementation format and change
- approved and blocked implementation rules
- optional required code hash
- authorized upgrade administrator
- configured upgrade delay
- exact protected-parameter SHA-256 fingerprint
- Human Approval requirement and minimum quorum

A policy delay remains enforced after quorum approval. Wallet signing is not authorized until the later of the organizational approval delay and the contract-upgrade execute-after time. This timing state is persisted in the approval request and rechecked before execution confirmation.

Generic contract calls remain backward compatible unless explicit contract-upgrade metadata or a supported upgrade classification is supplied.

## Major files changed

- `backend/lib/contractUpgradeSafety.mjs`
- `backend/lib/contractUpgradeSafety.test.mjs`
- `backend/lib/contractUpgradeSafety.gateway.integration.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/approvalWorkflow.mjs`
- `backend/lib/organizationalApproval.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `README.md`
- `docs/CONTRACT_UPGRADE_SAFETY.md`
- developer and SDK documentation

## Database and migrations

No new database migration is required. The existing JSON intent, finding, audit, policy, and approval fields persist the additive contract-upgrade evidence and timing state. PostgreSQL and memory-store behavior are aligned.

## Environment variables

No new environment variables are required.

## Compatibility

Preserved:

- existing agents and Agent IDs
- API keys and API-key hashes
- legacy policies and audit records
- Gateway endpoint and authentication headers
- Human Approval and organizational quorum bindings
- Emergency Circuit Breaker
- Casper contract, proof relayer, and wallet flow
- Railway and Vercel configuration
- JavaScript SDK, Python SDK, MCP, Codex, YieldBot, and x402 integrations

Legacy policies safely skip Contract Upgrade Safety until the control is explicitly enabled. Existing generic contract calls remain compatible.

## Verification executed

- Backend regression suite: 258/258 passed
- Focused Contract Upgrade Safety tests: 8/8 passed
- JavaScript SDK tests: 15/15 passed
- Python SDK tests: 10/10 passed
- MCP core tests: 10/10 passed using temporary local transpilation
- Frontend ES2020 semantic TypeScript project check: passed
- JavaScript/ESM syntax validation: passed
- TypeScript SDK compilation: passed

The exact dependency-installed `pnpm run build` could not execute because Corepack's configured package endpoint returned HTTP 503 while downloading pnpm 10.14.0. No Vite build success is claimed. Railway and Vercel must run the complete frozen-lockfile build after deployment.

## Local run

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm dev
```

## Railway

- Preserve the current PostgreSQL connection and relayer configuration.
- No migration or environment-variable change is required.
- Confirm `pnpm run build` completes.
- Confirm `/api/health` reports version 1.8.0.
- Confirm `/api/contract-upgrade-controls/status` reports the control as Live.

## Vercel

- No configuration change is required.
- Confirm the production TypeScript/Vite build completes.
- Verify Policy creation/editing, Agent Details, Intent Playground, Security Coverage, and Integration Health.

## Manual QA

1. Create or edit a policy and enable Contract Upgrade Safety.
2. Configure an approved implementation, approved administrator, quorum, code-hash rule, and optional delay.
3. Submit the Intent Playground unapproved proxy implementation example.
4. Confirm an unknown implementation becomes Review Required or Blocked according to mode.
5. Confirm a blocked implementation is Blocked.
6. Confirm a changed target or wrong network is Blocked.
7. Confirm missing required code hash cannot silently pass.
8. Confirm unauthorized administrator is Blocked.
9. Complete the configured reviewer quorum.
10. Confirm signing remains locked until the upgrade delay elapses.
11. Confirm signing is available only inside the execution window.
12. Confirm the Audit Log contains implementation binding, code hash, administrator, fingerprint, approval, and timing evidence.
13. Confirm ordinary contract calls without upgrade metadata remain unchanged.
14. Confirm mobile layout, fixed sidebar, wallet gating, and Docs navigation.

## Control status update

Live Phase 1 controls:

- Token Approval & Permit Safety
- Privileged Contract Action Classification
- Emergency Circuit Breaker
- Approval Escalation & Organizational Quorum
- Contract Upgrade Safety

Foundation Available:

- Cryptographic Reviewer Signatures, pending deployed Casper Wallet browser verification
- existing provider-backed and settlement controls according to their documented maturity

## Roadmap

The next Phase 1 milestone is Contract Argument Policies.

## Conventional commit

`feat(contract-safety): add contract upgrade protections`
