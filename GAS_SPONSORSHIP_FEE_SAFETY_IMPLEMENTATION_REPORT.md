# Magen3 Gas Sponsorship & Fee Safety Implementation Report

## Release

- Magen3 version: `2.4.0`
- Milestone: Gas Sponsorship & Fee Safety
- Protection area: Execution Integrity
- Maturity: Foundation Available
- Next milestone: Execution & Settlement Reconciliation

## Architecture verified

The release preserves the Vite/React/TypeScript frontend, Node ESM backend, deterministic evaluator pipeline, PostgreSQL/Drizzle store, explicit memory fallback, Human Approval binding, Casper proof relayer, JavaScript SDK, Python SDK, MCP server, Codex integration, Railway Docker deployment, and Vercel frontend deployment.

Gas Sponsorship & Fee Safety extends the existing additive `structuredRules`, normalized Gateway intent, structured findings, risk precedence, audit JSON, Security Pipeline, Security Coverage, and Integration Health models. No new database table is required.

## Implemented security control

The new deterministic evaluator is `backend/lib/gasSponsorshipFeeSafety.mjs`.

It evaluates:

- Casper, EVM, and Other chain-family binding
- Casper/EVM field isolation
- Numeric fee and gas validity
- Gas-limit versus estimated-gas consistency
- Maximum network fee
- Maximum gas price
- Maximum priority fee
- Approved sponsors and relayers
- Approved EVM Paymasters
- Sponsorship availability
- Sponsorship expiration
- Sponsorship scope
- Public sponsor-evidence SHA-256 hashes
- Expected payer versus actual payer
- Rolling sponsored budget
- Maximum sponsored-operation count
- Repeated failed sponsored operations
- Canonical protected-parameter fingerprinting

Blocked precedence remains higher than Review Required, and Review Required remains higher than Allowed.

## Security boundary

Magen3 accepts public unsigned fee and sponsorship evidence only. It rejects raw sponsor or Paymaster signatures, sponsor credentials, private keys, mnemonics, wallet secrets, and signed transactions.

Casper flows cannot silently carry EVM-only Paymaster, gas-price, or priority-fee fields. EVM-specific evidence remains isolated from Casper authorization.

## Gateway, audit, and approval integration

The Gateway accepts optional `action.feeSafety` metadata and normalizes it into deterministic evaluator inputs. The complete normalized fee evidence is included in the existing exact-intent approval binding. Changing sponsor, payer, fee, expiry, scope, or Paymaster after approval invalidates the authorization.

Audit records preserve sanitized evidence, findings, status, violations, and the canonical fingerprint. Raw signatures are never persisted.

The control has its own Security Pipeline stage and status endpoint:

- `GET /api/gas-sponsorship-fee-safety/status`

## Policy model

Added structured policy fields:

- `feeSafetyEnabled`
- `feeSafetyMode`
- `feeSafetyMaximumNetworkFee`
- `feeSafetyMaximumGasPrice`
- `feeSafetyMaximumPriorityFee`
- `feeSafetyApprovedSponsors`
- `feeSafetyApprovedPaymasters`
- `feeSafetySponsorshipUnavailableAction`
- `feeSafetySponsoredBudget`
- `feeSafetyMaximumSponsoredOperations`
- `feeSafetyMaximumFailedSponsoredOperations`
- `feeSafetyLookbackSeconds`
- `feeSafetyRequireSponsorshipExpiry`
- `feeSafetyRequireSponsorEvidence`

Legacy policies default safely to the disabled state. No existing policy is rewritten.

## Frontend and developer experience

The existing Policies surface now contains a progressive-disclosure Gas Sponsorship & Fee Safety editor. The Agent Shield catalog, Security Coverage, Integration Health, Settings endpoint list, and Intent Playground use actual backend evidence.

Playground examples include:

- Bounded Casper sponsorship
- Excessive network fee
- EVM Paymaster fields on a Casper request

JavaScript SDK, Python SDK, MCP schema, Gateway documentation, and platform documentation now expose the same public metadata and sanitized response context.

The official MCP identity remains version `0.5.0` with its existing hashes. The new optional public fee-evidence field does not expand MCP permission scope, so existing deployed Tool & MCP Integrity bindings remain compatible.

## Major files changed

- `backend/lib/gasSponsorshipFeeSafety.mjs`
- `backend/lib/gasSponsorshipFeeSafety.test.mjs`
- `backend/lib/gasSponsorshipFeeSafety.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/server.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `docs/GAS_SPONSORSHIP_FEE_SAFETY.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/MAGEN3_PLATFORM.md`
- `README.md`

## Database and migrations

No migration is required. Existing JSON policy, intent, findings, pipeline, and audit fields support this milestone in both PostgreSQL and memory-store modes.

## Environment variables

No new environment variable is required.

Existing Railway variables, Casper contract hash, relayer key, CORS configuration, and Vercel configuration remain unchanged.

## Compatibility

Preserved:

- Agent IDs and API keys
- Existing policies and audit records
- Existing approval bindings
- Gateway endpoint and authentication headers
- Casper Wallet and decision proofs
- Relayer and contract hash
- Railway and Vercel configuration
- JavaScript SDK, Python SDK, MCP, Codex, and YieldBot flows
- Requests without `action.feeSafety`

## Verification executed

- Backend regression suite: `350/350` passed
- Focused Gas Sponsorship & Fee Safety and Gateway tests: `18/18` passed
- Frontend security-model suite: passed
- JavaScript SDK: `22/22` passed
- Python SDK: `17/17` passed
- MCP core: `18/18` passed
- JavaScript SDK TypeScript compilation: passed
- Frontend application semantic TypeScript check: passed
- Memory-store health and status HTTP checks: passed
- Health version: `2.4.0`
- Control status: `foundation_available`

The exact dependency-installed root `pnpm run build` could not be executed because Corepack received HTTP 503 while downloading pnpm `10.14.0`. The locally available dependency tree contains TypeScript and source-level stubs but not the real Vite plugins. Railway and Vercel must run the final frozen-lockfile `tsc -b && vite build`.

## Local run

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm run build
ALLOW_MEMORY_STORE=true pnpm run dev:backend
```

For normal persistent use, configure `DATABASE_URL` and do not enable the memory store.

## Railway notes

- No migration change
- No Dockerfile change
- No new environment variable
- Existing `pnpm install --frozen-lockfile` and `pnpm run build` remain the deployment path
- Confirm `/api/health` reports `2.4.0`
- Confirm `/api/gas-sponsorship-fee-safety/status` reports `foundation_available`

## Vercel notes

- No configuration change
- Confirm the frontend build completes
- Verify the Policies editor and Intent Playground examples
- Verify the frontend API base URL still points to Railway

## Manual QA checklist

1. Open Agent Shield and confirm Gas Sponsorship & Fee Safety is Foundation Available under Execution Integrity.
2. Create or edit a policy and enable the control.
3. Configure an approved Casper relayer and bounded network fee.
4. Submit the bounded sponsorship Playground example.
5. Confirm Allowed when all configured evidence passes.
6. Submit the excessive-fee example and confirm Review Required or Blocked according to mode.
7. Submit the Casper request containing EVM Paymaster fields and confirm Blocked.
8. Confirm raw sponsor-signature fields are rejected.
9. Confirm the dedicated pipeline stage and structured findings appear.
10. Confirm audit details contain only sanitized evidence and hashes.
11. Confirm existing requests without fee metadata still work.
12. Confirm official MCP/Codex requests retain their existing Tool & MCP Integrity binding.

## Conventional commit

`feat(execution-integrity): add gas sponsorship and fee safety`

## Roadmap

Phase 3 now contains RPC & Chain Integrity and Gas Sponsorship & Fee Safety as Foundation Available. The next milestone is Execution & Settlement Reconciliation.
