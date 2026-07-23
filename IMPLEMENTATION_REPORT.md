# Magen3 Human Approval & Quorum — Implementation Report

## Release objective

This release adds Human Approval & Quorum inside the existing **Policy & Approval Controls** protection area. It does not introduce another top-level product or sidebar page.

A deterministic `Review Required` decision can now create an exact-bound approval request. The original decision remains `Review Required`; a completed, unexpired approval permits only progression to the existing human-controlled wallet-signing boundary.

## Product status

**Human Approval & Quorum: Foundation Available**

It is not labeled Live because the current Magen3/Casper Wallet integration associates reviewer responses with the connected Casper public-key address but does not require a separate cryptographic message signature from the reviewer.

## Implemented workflow

```text
External agent submits intent
→ Agent Shield authenticates and evaluates it
→ Decision is Review Required
→ Audit record is stored
→ Magen3 computes an exact-intent SHA-256 binding
→ Approval request enters Pending or Configuration Required
→ Eligible wallets approve or reject
→ Required distinct quorum completes before expiry
→ Agent polls the request with its existing API key
→ Exact unchanged request may proceed to wallet signing
→ Real execution hash can be attached after submission
```

## Deterministic controls

- SHA-256 binding over audit ID, agent, action, amount, target, target type, execution wallet, active policy, and original intent
- Single-approver and quorum modes
- One to ten required approvals
- Explicit eligible approver wallet list
- Optional owner-wallet fallback
- Approval expiry from five minutes to seven days
- Optional separation of requester and approver
- Required rejection comments
- Distinct approver counting
- Duplicate-response prevention
- Unauthorized-reviewer rejection
- Immediate finality after one authorized rejection
- Expiry after approval when execution has not yet occurred
- Execution-hash rejection until the approval is completed and current
- Parameter-change invalidation through the exact binding hash

## Workflow states

- `Configuration Required`
- `Pending`
- `Approved`
- `Rejected`
- `Expired`

## UI changes

### Policies

A **Human Approval Queue** now appears above policy management. It shows:

- Request state
- Action, amount, and destination
- Active policy and deterministic reason
- Approval quorum progress
- Expiration
- Exact-intent binding hash
- Previous reviewer responses
- Approve and Reject controls
- Eligibility and already-responded states

Policy create and edit forms now support:

- Enable Approval Workflow
- Single or Quorum mode
- Required approval count
- Approval expiry
- Owner-wallet fallback
- Separation of duties
- Mandatory rejection comments
- Authorized approver wallets

### Dashboard

The Platform Status area now shows the number of requests waiting in the approval queue. When action is required, a direct link opens Policies → Human Approval Queue.

### Intent Playground

A `Review Required` result displays:

- Approval request ID
- Current state
- Quorum progress
- Expiration
- Binding hash
- Clear instruction not to sign yet
- Link to the reviewer queue

New approval records are placed into frontend state immediately and are also refreshed through the existing six-second wallet-scoped bootstrap polling.

### Audit Logs

Audit detail now displays:

- Approval request ID
- State
- Required and received approvals
- Expiration and resolution
- Exact binding hash
- Human-approval Security Pipeline stage
- Execution state after approval, rejection, or expiry

## Backend API

### Agent polling

```http
GET /api/agent-gateway/approvals/:approvalOrAuditId?agentId=MAG-AGENT-...
x-magen3-agent-key: AGENT_API_KEY
```

The approval ID or related audit ID may be used. The agent can read status but cannot approve through this route.

### Reviewer queue

```http
GET /api/approvals?walletAddress=CASPER_PUBLIC_KEY
```

### Reviewer response

```http
POST /api/approvals/:approvalId/respond
Content-Type: application/json

{
  "walletAddress": "CASPER_APPROVER_PUBLIC_KEY",
  "response": "Approve",
  "comment": "Reviewed exact target and amount"
}
```

### Operational status

```http
GET /api/approval-workflow/status
GET /api/approval-workflow/status?walletAddress=CASPER_PUBLIC_KEY
```

## SDK and MCP updates

### TypeScript SDK

```ts
const { approval } = await client.getApproval(approvalOrAuditId);
if (!approval.mayProceedToSigning) return;
```

### Python SDK

```python
approval = client.get_approval(approval_or_audit_id)["approval"]
if not approval.get("mayProceedToSigning"):
    return
```

### MCP

New tool:

```text
magen3_get_approval
```

Its guidance is fail-closed: Pending, Configuration Required, Rejected, and Expired all mean **do not sign or broadcast**.

## Database migration

This release includes additive PostgreSQL changes.

### `action_reviews`

Added workflow ownership, audit binding, quorum, approver, response, expiry, resolution, rejection, and context fields.

### `audit_logs`

Added approval request ID, status, binding hash, quorum counts, expiry, and resolution timestamps.

### Deployment behavior

`createPostgresStore()` continues to call `runMigrations()` before serving PostgreSQL-backed requests, so Railway applies the additive migration during backend startup.

The user's current records are demo data, so a backup is not required for their chosen workflow. The migration is still written to preserve existing rows with defaults.

Manual command if needed:

```bash
pnpm db:migrate
```

## Backward compatibility

Preserved:

- Existing agent IDs
- Existing API-key hashes and headers
- Existing Gateway endpoint and request envelope
- Existing policies and audits
- Existing three decision states
- Casper contract hash and proof relayer
- Wallet signing boundary
- YieldBot and Codex integrations
- x402 authorization and settlement flow
- TypeScript and Python SDK authentication
- MCP authentication
- Railway and Vercel configuration

Legacy policies do not create approval requests unless `approvalWorkflowEnabled` is explicitly true.

## Verification completed

- **171/171 backend and security-model tests passed**
- **8 focused Human Approval & Quorum unit tests passed**
- **2 approval Gateway integration tests passed**
- **11/11 TypeScript SDK tests passed**
- **7/7 Python SDK tests passed**
- **6/6 MCP core tests passed**
- All backend and script `.mjs` files passed Node syntax checking
- **57 TypeScript/TSX files** passed syntax transpilation
- Changed frontend files passed focused semantic TypeScript checking with temporary dependency declarations
- Running memory-mode HTTP smoke test verified:
  - Review Required
  - approval creation
  - reviewer queue
  - execution rejection before quorum
  - reviewer approval
  - authenticated agent polling
  - progression to signing boundary
  - execution-hash persistence
  - operational-status counts

## Checks not completed in this environment

- Full dependency-backed root typecheck and Vite production build
- Full MCP protocol startup using installed external packages
- Live PostgreSQL migration against Railway
- Live Casper Wallet browser interaction
- Cryptographic reviewer signature, because it is not implemented in this Foundation release
- Live Casper Testnet transaction and relayer confirmation
- Production Vercel-to-Railway CORS check

The package registry returned HTTP 503 when Corepack attempted to retrieve pnpm 10.14.0. Run the complete verification locally before pushing:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Major files changed

- `backend/lib/approvalWorkflow.mjs`
- `backend/lib/approvalWorkflow.test.mjs`
- `backend/lib/approvalWorkflow.gateway.integration.test.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/db/schema.mjs`
- `backend/db/migrate.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-python/src/magen3/client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `docs/HUMAN_APPROVAL_WORKFLOW.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- `README.md`

## Security limitation and next hardening step

The current application identifies a reviewer using the connected wallet public key, but the approval response itself is not backed by a separate cryptographic wallet signature. The UI and API report this limitation explicitly, and the control remains Foundation Available.

The next hardening milestone should add a cryptographic approval attestation or an onchain approval proof bound to the exact approval hash. Until that is implemented and independently tested, this workflow should be used as a controlled testnet/product foundation rather than represented as a cryptographically signed enterprise approval system.

## Suggested commit

```text
feat(policy-controls): add exact-bound human approval and quorum workflow
```
