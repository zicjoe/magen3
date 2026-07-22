# Magen3 Execution Simulation Foundation Release Report

## Release summary

This release upgrades **Execution Simulation** from **Preview** to **Foundation Available**.

Magen3 now performs deterministic transaction-construction preflight inside the real Agent Gateway before wallet signing. It does **not** claim that a transaction executed against Casper global state.

Full stateful Casper speculative execution remains unavailable in this release. Casper exposes speculative execution through a separately enabled node service and expects a constructed deploy or transaction. The current Magen3 Gateway intentionally accepts high-level intent and safe construction metadata, not wallet secrets, approvals, signatures, or raw signed transactions.

Official references:

- https://docs.casper.network/developers/json-rpc/json-rpc-transactional
- https://docs.casper.network/developers/transactions/estimating-gas-costs
- https://docs.casper.network/operators/setup/basic-node-configuration

## Implemented preflight checks

Execution Simulation now evaluates:

- Whether preflight applies to the requested action
- Positive execution amount for value-bearing actions
- Positive integer payment budget in motes
- Positive integer gas-price tolerance
- Transaction TTL structure
- Strict ISO-8601 transaction timestamp structure
- Transaction freshness and expiry when timestamp and TTL are available
- Optional transaction-hash structure
- Swap slippage structure from 0 to 10,000 basis points
- Expected-output and minimum-received consistency
- Contract runtime-argument object structure
- An explicit `unavailable` finding for full stateful speculative execution

## Decision behavior

### Allowed

A request may remain Allowed when its supported preflight metadata is valid and all live Wallet, Contract, and Policy checks pass. The response still states that full stateful simulation was unavailable.

### Review Required

Review is required for deterministic warning conditions such as:

- A structurally valid TTL longer than the conservative two-hour review threshold
- A transaction timestamp more than five minutes in the future

The threshold is a Magen3 review safeguard, not a claim about the current network chainspec maximum.

### Blocked

The request is blocked for conditions including:

- Zero or negative value-bearing action amount
- Invalid payment budget
- Invalid gas-price tolerance
- Malformed TTL
- Non-ISO timestamp
- Expired construction metadata
- Malformed transaction hash
- Invalid swap slippage structure
- Inconsistent swap output bounds
- Invalid runtime-argument structure

## Gateway request extension

Existing request routes and headers are unchanged. Integrations may optionally add:

```json
{
  "action": {
    "preflight": {
      "paymentAmountMotes": "3000000000",
      "gasPriceTolerance": 1,
      "ttl": "30m",
      "timestamp": "2026-07-22T13:00:00.000Z",
      "slippageBps": 300,
      "expectedOutput": 9.8,
      "minimumReceived": 9.5,
      "runtimeArgs": {
        "amount": "1000000000"
      },
      "transactionHash": "optional-64-character-hex-hash"
    }
  }
}
```

Legacy integrations that omit `action.preflight` remain compatible. Omitted metadata produces transparent warnings or skipped findings rather than a false simulation pass.

## Security boundary

The intent endpoint rejects private keys, secret keys, mnemonics, transaction approvals, transaction-level signatures, and raw signed transactions.

Public contract runtime arguments may legitimately use names such as `signature`, `approval`, or `seed`; these are preserved when they are inside the explicit `runtimeArgs` object. Private or secret-key fields remain rejected.

## Audit and product integration

Execution Simulation findings now appear in:

- Gateway responses
- Risk Assessment
- Security Pipeline
- Audit records
- Decision explanations and remediation
- Agent Security Coverage
- Integration Health
- Intent Playground
- Agent Shield Protection Modules
- SDK and MCP schemas
- README and product documentation

Audit records retain only the safe preflight metadata. No signing secrets are logged.

## Intent Playground cases

Added or upgraded examples include:

- Valid transfer preflight
- Valid swap bounds
- Valid staking preflight
- Valid contract-call runtime arguments
- Expired preflight
- Invalid payment budget
- Invalid swap bounds

## Compatibility

Preserved without change:

- Existing Agent IDs
- Existing API keys and authentication headers
- `POST /api/agent-gateway/intents`
- Existing policy records and decision states
- Existing audit records
- Casper contract hash and decision-proof relayer
- Casper Wallet signing boundary
- YieldBot and Codex authentication flow
- JavaScript SDK, Python SDK, and MCP authentication model
- Railway and Vercel configuration

There is **no database migration** and **no new mandatory environment variable**.

## Major files changed

- `backend/lib/executionSimulation.mjs`
- `backend/lib/executionSimulation.test.mjs`
- `backend/lib/executionSimulation.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/agentGateway.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/policyEngine.test.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/lib/securityModel.mjs`
- `backend/data/seed.mjs`
- `src/app/lib/securityModel.ts`
- `src/app/App.tsx`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- SDK, MCP, and example READMEs

## Verification completed

- 58/58 backend and security-model tests passed
- 5/5 JavaScript SDK tests passed
- 2/2 Python SDK tests passed
- 4/4 MCP core tests passed
- Authenticated HTTP Gateway smoke test passed
- Allowed, Blocked, and Review Required preflight outcomes verified
- Execution Simulation findings and pipeline stage verified
- Safe preflight audit persistence verified
- 57 TypeScript/TSX files passed syntax transpilation
- All backend `.mjs` files passed Node syntax checking

The package registry returned HTTP 503, so a fresh dependency installation, full project typecheck, full MCP dependency build, and production Vite build could not be repeated in this sandbox. Run the normal repository verification locally before pushing:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Local run

```powershell
pnpm install --frozen-lockfile
pnpm dev:backend
```

In another terminal:

```powershell
pnpm dev:frontend
```

## Deployment

No deployment configuration changed. Replacing the project files while retaining `.git` and local secret files, then pushing to the connected branch, should trigger the existing Railway and Vercel deployments.

## Current protection-module status

### Live

- Identity and Authentication
- Policy Enforcement
- Wallet Validation
- Contract Validation
- Risk Assessment

### Foundation Available

- Execution Simulation

### Preview

- Threat Intelligence

### Planned

- Oracle Validation
- Bridge Controls
- Compliance Controls

## Suggested commit

```text
feat(execution-simulation): add deterministic pre-signing transaction preflight
```

Suggested body:

```text
Validate payment, gas, TTL, timestamps, freshness, optional transaction hashes, swap bounds, and contract runtime-argument structure before wallet signing. Persist structured findings and pipeline evidence while preserving the high-level Gateway contract and explicitly reporting full Casper speculative execution as unavailable.
```

## Manual QA checklist

1. Connect Casper Wallet and open the Intent Playground.
2. Select a registered agent with an active policy.
3. Submit the valid transfer example and confirm Allowed when other policy checks pass.
4. Confirm the Execution Simulation stage appears in the timeline.
5. Confirm the stateful speculative-execution finding is `unavailable`, not `pass`.
6. Submit the expired-preflight example and confirm Blocked.
7. Submit the invalid-payment example and confirm Blocked.
8. Submit the long-TTL request and confirm Review Required.
9. Submit the invalid-swap-bounds example and confirm Blocked.
10. Confirm each decision appears automatically in Audit Logs with its safe preflight metadata.
11. Confirm no private key, approval, or signed transaction is accepted by the Agent Gateway.
12. Verify Railway and Vercel deployment logs after pushing.
