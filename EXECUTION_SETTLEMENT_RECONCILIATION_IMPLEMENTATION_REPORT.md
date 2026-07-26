# Execution & Settlement Reconciliation Implementation Report

## 1. Release summary

- **Product:** Magen3
- **Roadmap phase:** Phase 3 — Infrastructure and execution
- **Completed milestone:** 13. Execution & Settlement Reconciliation
- **Release version:** 2.5.0
- **Control location:** Agent Shield → Execution Integrity → Reconciliation
- **Control status:** **Foundation Available**
- **Recommended next milestone:** 14. Real Stateful Execution Simulation

Magen3 now preserves the execution lifecycle after authorization instead of ending the audit at `Allowed`, `Blocked`, or `Review Required`. Authenticated agents and adapters can report submission, pending, confirmation, failure, uncertainty, replacement, refund, and delivery state. An optional backend-only polling adapter can query configured Casper or EVM RPC providers and feed the observation through the same deterministic reconciliation state machine.

The control is not marked Live. A deployed real-network transaction-to-finality test is still required before that status is justified.

## 2. Architecture preserved

The implementation preserves the existing architecture and product boundaries:

- React/Vite frontend and current Magen3 visual identity.
- Node ESM backend and existing Agent Gateway.
- PostgreSQL through Drizzle plus memory-store fallback.
- Deterministic Policy Engine and Risk Assessment.
- Existing structured finding model.
- Human Approval, exact binding, quorum, escalation, and execution windows.
- Casper decision-proof relayer and existing contract hash.
- Wallet-controlled signing flow.
- Existing x402 settlement route.
- JavaScript/TypeScript SDK, Python SDK, MCP, and Codex integration.
- Railway and Vercel deployment structure.
- Eight Agent Shield protection areas and fixed navigation.

No existing Agent ID, API key, API-key hash, policy, audit, approval request, Gateway intent route, authentication header, or Casper proof contract needs to be recreated.

## 3. Backend implementation

### Shared reconciliation state machine

New module: `backend/lib/executionReconciliation.mjs`

Canonical states:

- `not_submitted`
- `submitted`
- `pending`
- `confirmed`
- `failed`
- `uncertain`
- `replaced`
- `refunded`
- `delivered`

The state machine enforces:

- Agent API-key authentication and audit ownership.
- Execution authorization from `Allowed`, or an exact-bound approved review that is still executable.
- Transaction identifier binding.
- Equivalent comparison of Casper `transaction-hash-`, `deploy-hash-`, raw 64-hex, and `0x` forms without rewriting stored evidence.
- Monotonic state transitions.
- Maximum submission attempts.
- A higher attempt number for a retry after failure.
- No duplicate attempt while the prior transaction is pending or uncertain.
- Explicit replacement permission.
- Replacement transaction and replacement-audit links.
- Required confirmations or explicit finality.
- Configurable finality timeout and transition to `uncertain`.
- Delivery only after confirmation.
- Refund state.
- Failure reason.
- Append-only reconciliation history, capped to the latest 100 events.
- Rejection of raw signed transactions, wallet signatures, private keys, mnemonics, seeds, and payment signatures.

### Authenticated reporting

Endpoint:

```http
POST /api/agent-gateway/executions/reconcile
```

The endpoint uses the existing `x-magen3-agent-key` or supported Bearer authentication and requires the audit to belong to the authenticated connected agent.

### Optional real provider polling

New module: `backend/lib/executionReconciliationPoller.mjs`

Endpoint:

```http
POST /api/agent-gateway/executions/poll
```

Supported adapters:

- Casper transaction lookup with `info_get_transaction`, falling back to `info_get_deploy`.
- EVM receipt lookup with `eth_getTransactionReceipt` plus `eth_blockNumber` confirmation calculation.

Security boundary:

- RPC endpoints come only from backend environment variables.
- Request bodies cannot submit `rpcUrl`, `rpcEndpoint`, `providerUrl`, or `endpoint`.
- Only HTTPS is accepted, except localhost HTTP for local development.
- Public status responses expose configuration booleans, never URLs or credentials.
- Poll observations are not written directly; they pass through the same reconciliation state machine.

### Lifecycle and retry integration

`backend/lib/executionIntegrity.mjs` now reads reconciliation state when evaluating `retryOf` and `replacementOf` behavior. It no longer assumes that the presence of any transaction hash means final execution. Pending and uncertain states block unsafe retries according to the active policy.

### Existing x402 compatibility

`POST /api/agent-gateway/x402/settlements` remains unchanged for current integrations. Its existing settlement result also updates the general reconciliation fields and pipeline, without removing the x402 fingerprint, facilitator, or resource-delivery contract.

## 4. Policy model

The following optional fields are enforced from `structuredRules`:

```json
{
  "reconciliationEnabled": true,
  "maximumSubmissionAttempts": 3,
  "pendingRetryAction": "Block",
  "uncertainRetryAction": "Block",
  "requiredConfirmations": 1,
  "finalityTimeoutSeconds": 3600,
  "replacementAllowed": true,
  "resourceDeliveryRequired": false
}
```

Legacy policies receive safe additive defaults. Existing policy JSON remains valid.

## 5. Database and migrations

The migration is additive. New `audit_logs` fields are:

- `execution_attempt_count`
- `execution_confirmations`
- `execution_required_confirmations`
- `execution_finality_deadline`
- `execution_finalized_at`
- `execution_replacement_of`
- `execution_replacement_audit_id`
- `execution_replaced_by`
- `execution_replaced_by_audit_id`
- `execution_failure_reason`
- `settlement_status`
- `resource_delivery_status`
- `refund_status`
- `reconciliation_provider`
- `reconciliation_last_checked_at`
- `execution_reconciliation` JSONB
- `execution_history` JSONB

Indexes were added for execution status and reconciliation check time. Existing migration history is preserved, and all additions use `ADD COLUMN IF NOT EXISTS` or `CREATE INDEX IF NOT EXISTS`.

### Migration instructions

Railway uses the existing backend startup migration path. Deploy normally; no manual SQL merge or data deletion is required.

For local PostgreSQL:

```bash
pnpm db:migrate
```

For memory-store mode, no migration is required; the same fields and transition rules are implemented in memory.

## 6. Audit and Security Pipeline

Each reconciliation update can now preserve:

- Current execution state.
- Bound transaction hash.
- Attempt count.
- Confirmation count and policy requirement.
- Finality deadline and finalization time.
- Replacement transaction and audit links.
- Failure reason.
- Settlement status.
- Resource-delivery status.
- Refund status.
- Provider label and opaque reference.
- Last checked time.
- Current normalized reconciliation object.
- Append-only event history.

The existing pipeline is updated with relevant real stages:

- Execution Submitted
- Execution Confirmed or Failed
- Settlement Reconciled

A structured `Execution & Settlement Reconciliation` finding is stored in the existing Audit Log. No fake animation stage or artificial delay was added.

## 7. Frontend and UX

Preserved:

- Existing design language.
- Fixed sidebar.
- Wallet gating.
- Existing page hierarchy.
- Eight protection areas.

Added:

- Reconciliation policy controls under Execution Integrity.
- Unresolved execution attention on the Dashboard.
- Unresolved execution summary on Connected Agent details.
- Integration Health reconciliation status.
- Audit details for attempts, confirmations, finality, provider, replacement, failure, delivery, refund, and history.
- Developer endpoint listing for reporting and polling.
- Updated product documentation and roadmap.

Only unresolved records needing attention are elevated; no decorative analytics were added.

## 8. SDK and MCP integration

### TypeScript SDK

Added:

- `Magen3ExecutionReconciliationState`
- `Magen3ExecutionReconciliationUpdate`
- `Magen3ExecutionReconciliationPollOptions`
- `Magen3ExecutionReconciliationRecord`
- `reportExecutionReconciliation()`
- `pollExecutionReconciliation()`

### Python SDK

Added:

- `report_execution_reconciliation()`
- `poll_execution_reconciliation()`

### MCP

Added:

- `magen3_report_execution_reconciliation`
- `magen3_poll_execution_reconciliation`

The MCP package version and existing official Tool & MCP Integrity identity remain unchanged for compatibility. The new polling schema does not accept an RPC URL.

## 9. Major files changed

### New

- `backend/lib/executionReconciliation.mjs`
- `backend/lib/executionReconciliation.test.mjs`
- `backend/lib/executionReconciliation.gateway.integration.test.mjs`
- `backend/lib/executionReconciliationPoller.mjs`
- `backend/lib/executionReconciliationPoller.test.mjs`
- `docs/EXECUTION_SETTLEMENT_RECONCILIATION.md`
- `EXECUTION_SETTLEMENT_RECONCILIATION_IMPLEMENTATION_REPORT.md`

### Updated

- `backend/db/schema.mjs`
- `backend/db/migrate.mjs`
- `backend/lib/executionIntegrity.mjs`
- `backend/server.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/src/magen3/client.py`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/test/protocol.test.mjs`
- README and integration documentation files.

## 10. Environment-variable changes

All new variables are optional and backend-only:

```env
# Disabled unless explicitly true
RECONCILIATION_POLLING_ENABLED=true

# Dedicated Casper URL; CASPER_RPC_URL remains the fallback
RECONCILIATION_CASPER_RPC_URL=https://node.testnet.casper.network/rpc

# Optional EVM adapter
RECONCILIATION_EVM_RPC_URL=https://approved-evm-rpc.example

# 1,000–60,000 ms; default 10,000
RECONCILIATION_POLL_TIMEOUT_MS=10000
```

No Vercel variable is required. Do not prefix these variables with `VITE_`.

## 11. Local run instructions

Keep your existing private `.env` and relayer key outside the replacement operation.

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:backend
pnpm dev:frontend
```

Verification command:

```bash
pnpm verify
```

There is no separate lint script in the current project.

## 12. Railway notes

- Replace the project files while preserving the deployed environment variables and relayer key path.
- Railway will use the existing `Dockerfile`, `railway.json`, startup command, and migration path.
- The new migration is additive.
- Existing `CASPER_RPC_URL` can be reused by the polling adapter.
- Keep `RECONCILIATION_POLLING_ENABLED` unset or `false` until the selected RPC is ready for deployed validation.
- When enabling it, use a trusted HTTPS endpoint and verify `/api/execution-reconciliation/status`.
- No new provider URL is exposed through public status or frontend configuration.

## 13. Vercel notes

- No new frontend environment variable is required.
- Preserve the existing `VITE_API_URL`, Casper Wallet configuration, and current Vercel project settings.
- The frontend calls the existing Railway backend origin.
- No rewrite, navigation, wallet-gating, or fixed-sidebar configuration was removed.

## 14. Compatibility notes

Preserved:

- Existing Agent IDs.
- Existing API keys and hashes.
- Existing policies.
- Existing audits and approval requests.
- Existing Gateway endpoint and headers.
- Existing wallet and Casper proof flow.
- Existing contract hash and relayer.
- Existing CORS behavior.
- YieldBot and Codex flows.
- Existing SDK and MCP package versions.
- Existing x402 settlement contract.
- Existing manual execution-confirmation route and legacy `executed` aliases.

New request fields and policy fields are optional. Generic contract calls and requests with no reconciliation metadata remain compatible.

## 15. Test report

### Executed and passed

- **Backend:** 369/369 tests passed.
- **Reconciliation/lifecycle focused suite:** 26/26 tests passed.
- **TypeScript SDK:** compiled with TypeScript 5.8.3 and 26/26 tests passed.
- **Python SDK:** 21/21 tests passed.
- **MCP core handlers:** strict TypeScript core check passed with isolated dependency declarations; 21/21 core tests passed.
- Backend server, stores, schema, migration, and reconciliation modules passed Node syntax checks.
- Changed TypeScript/TSX files passed TypeScript syntax transpilation.
- Python client and tests passed bytecode compilation.
- Memory-store behavior was exercised by Gateway integration tests.
- Casper and EVM poll behavior was exercised with controlled provider responses.
- Signed-material rejection, unauthenticated access, caller-provided RPC URL rejection, retry prevention, replacement, confirmation, finality, and status-summary behavior were tested.

### Could not be executed in this workspace

The package registry returned HTTP 503 and later DNS resolution failed. Therefore a clean `pnpm install --frozen-lockfile` could not be completed, and these commands could not be honestly completed with the project’s exact locked dependency set:

- Root `pnpm typecheck`.
- Full Vite production build.
- Full MCP server build and stdio protocol test with the real `@modelcontextprotocol/sdk` and `zod` packages.
- Browser-based desktop/mobile manual testing.
- Deployed Railway/PostgreSQL migration execution.
- Deployed Vercel verification.
- Real Casper/EVM network polling and finality test.

The TypeScript SDK and MCP core were independently checked using the available global TypeScript compiler. No claim is made that this substitutes for the final clean-install build.

## 16. Manual QA checklist

After deployment:

- [ ] Confirm Railway startup migrations complete.
- [ ] Confirm `/api/health` reports version `2.5.0`.
- [ ] Confirm `/api/execution-reconciliation/status` returns Foundation Available.
- [ ] Create or use an existing agent without recreating its API key.
- [ ] Confirm legacy Allowed, Blocked, and Review Required intents still work.
- [ ] Confirm approved Review Required execution remains bound to its valid approval window.
- [ ] Report `submitted` with a real testnet transaction hash.
- [ ] Report or poll `pending` and confirm the Audit timeline updates without reconnecting the wallet.
- [ ] Attempt a duplicate retry while pending and confirm it is stopped.
- [ ] Confirm the configured confirmation threshold.
- [ ] Confirm finality timeout becomes `uncertain`.
- [ ] Confirm a failed execution requires a higher attempt for a retry.
- [ ] Confirm replacement linking updates both audits.
- [ ] Confirm resource delivery cannot be reported before confirmation.
- [ ] Confirm delivery/refund state appears in Audit Logs and Agent Details.
- [ ] Confirm caller-provided RPC URLs are rejected.
- [ ] Confirm public status does not expose RPC URLs or credentials.
- [ ] Confirm existing x402 settlement still works and updates shared reconciliation fields.
- [ ] Confirm Casper decision proofs still submit and confirm.
- [ ] Confirm Dashboard shows only unresolved items needing attention.
- [ ] Confirm wallet gating, fixed sidebar, Docs navigation, desktop, and mobile layouts.
- [ ] Run `pnpm verify` from a machine with working package-registry access.

## 17. Updated control statuses

### Live — unchanged

- Agent Authentication.
- Credential rotation and revocation.
- Agent Instruction Integrity.
- Tool & MCP Integrity.
- Deterministic Policy Enforcement and Review Thresholds.
- Approval Escalation & Organizational Quorum.
- Emergency Circuit Breaker.
- Wallet identity, destination, and spending controls.
- Contract identity, entry-point controls, Privileged Actions, Contract Upgrade Safety, Contract Argument Policies, and Token Permissions.
- Transaction Preflight and Lifecycle & Replay.
- Slippage and output bounds.

### Foundation Available

- Delegation & Session Key Safety.
- Human Approval & Quorum.
- Cryptographic Reviewer Signatures.
- Asset identity and network consistency.
- RPC & Chain Integrity.
- Gas Sponsorship & Fee Safety.
- **Execution & Settlement Reconciliation — completed in this release.**
- Stateful Execution Simulation.
- Oracle Validation.
- Bridge Controls.
- x402 authorization and settlement.
- Threat Intelligence.
- Compliance Controls.

### Planned — unchanged

- Asset Contract Risk and wallet behavioral expansion.
- MEV & Execution Quality.
- Trading Route Integrity and Market Risk Signals.
- Real bridge-provider integration.
- Live x402 and metered payments.
- Production threat, oracle, and compliance providers.
- Continuous Risk Monitoring.

## 18. Roadmap progress

Completed Phase 3 milestones:

11. RPC & Chain Integrity
12. Gas Sponsorship & Fee Safety
13. Execution & Settlement Reconciliation

Next:

14. **Real Stateful Execution Simulation**

Magen3 is not finished, and provider-backed controls remain Foundation Available until their published Live criteria are satisfied.

## 19. Conventional commit

```text
feat(execution): add settlement reconciliation and safe retry tracking
```
