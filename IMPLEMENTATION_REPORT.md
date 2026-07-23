# Magen3 Execution Integrity and Protection-Area Consolidation

## Release summary

This release reorganizes Agent Shield from a long flat list of security modules into eight coherent protection areas. Individual technical evaluators remain visible in Gateway findings and Audit Logs, but the product UI now presents related controls together so the platform remains understandable as it grows.

It also adds **Lifecycle & Replay Protection** as a Live control inside **Execution Integrity**. The control deterministically binds an unsigned intent to a canonical fingerprint and evaluates intent identity, idempotency, time bounds, duplicate state, sequence, transaction-hash reuse, and safe retry or replacement behavior before wallet signing.

## Eight protection areas

1. **Agent Trust & Access**
2. **Policy & Approval Controls**
3. **Wallet & Asset Safety**
4. **Contract & Permission Safety**
5. **Execution Integrity**
6. **Market & Oracle Integrity**
7. **Cross-chain & Payment Controls**
8. **Threat & Compliance**

The Protection Modules interface now shows status at the **control level** rather than implying that every control inside a broad area has the same implementation status.

## Lifecycle & Replay Protection

### Supported request metadata

New integrations may add the following optional object inside the existing `action` object:

```json
{
  "lifecycle": {
    "intentId": "intent:transfer:000001",
    "idempotencyKey": "idempotency:transfer:000001",
    "sequence": 1,
    "createdAt": "2026-07-23T10:00:00.000Z",
    "expiresAt": "2026-07-23T10:10:00.000Z",
    "retryOf": "",
    "replacementOf": "",
    "attempt": 0,
    "intentFingerprint": "optional-client-sha256"
  }
}
```

Magen3 computes its own canonical SHA-256 fingerprint from the protected execution parameters. A client fingerprint, when provided, must match Magen3's result exactly.

### Deterministic checks

- Unique per-agent intent ID
- Idempotency-key reuse
- Parameter mutation under an existing idempotency key
- Canonical execution-intent fingerprint
- Optional client-fingerprint binding
- ISO-8601 creation time and expiration
- Maximum intent age
- Maximum future clock skew
- Maximum authorization lifetime
- Optional monotonically increasing sequence
- Duplicate intent fingerprint inside the configured replay window
- Reused transaction hash
- Explicit `retryOf` and `replacementOf` audit references
- Retry prevention while an earlier execution is pending or uncertain
- Retry or replacement prevention after confirmed execution
- Maximum retry attempts
- Mandatory prior-audit reference for non-zero attempts

### Findings and audit evidence

Execution Integrity emits structured `pass`, `warning`, `fail`, `unavailable`, and `skipped` findings. The Gateway response and Audit Log include:

- Canonical fingerprint
- Intent ID
- Idempotency key
- Sequence
- Creation and expiration timestamps
- Retry or replacement reference
- Attempt number
- Prior ID, key, and fingerprint match counts
- Replay-window and retry-limit context
- Triggered rule and remediation

## Backward compatibility

Preserved without changes:

- Existing Agent IDs
- Existing API keys and hashes
- Existing policies
- Existing audit records
- Existing Gateway endpoint
- Existing authentication headers
- Existing request envelope
- Existing Casper contract hash and decision-proof flow
- Wallet connection and signing boundary
- YieldBot integration
- Codex integration
- JavaScript and Python SDK authentication
- MCP authentication
- Railway and Vercel configuration

Legacy policies do **not** silently enable duplicate-fingerprint blocking. Existing integrations that do not send `action.lifecycle` remain accepted under legacy policy defaults. New starter policies enable the control with secure, configurable defaults and use `Warn` for missing optional metadata unless the operator selects Review or Block.

## Database and environment

- **Database migration:** None
- **New mandatory environment variables:** None
- Lifecycle metadata and fingerprints are stored inside the existing structured audit JSON fields.
- No Casper contract change is required.

## Product and UI changes

- Consolidated the Protection Modules page into eight protection areas.
- Added control-level Live, Foundation Available, and Planned badges.
- Kept technical evaluator names visible in pipeline findings and audits.
- Added Lifecycle & Replay policy configuration to create and edit flows.
- Added lifecycle status to Security Coverage and Integration Health.
- Added Execution Integrity context to Intent Playground results.
- Added Playground examples for:
  - Fresh lifecycle-bound transfer
  - Duplicate lifecycle intent submitted twice
  - Expired lifecycle intent
- Added `/api/execution-integrity/status` to operational status surfaces.
- Updated in-app Docs, README, Gateway API documentation, integration guidance, TypeScript SDK, Python SDK tests, and MCP schema guidance.

## Control-level status matrix

### Agent Trust & Access

**Live**
- Agent authentication
- Credential rotation and revocation

**Planned**
- Instruction provenance
- Tool and MCP integrity
- Delegation and session permissions

### Policy & Approval Controls

**Live**
- Deterministic policy enforcement
- Review thresholds

**Planned**
- Human approval and quorum
- Emergency circuit breaker

### Wallet & Asset Safety

**Live**
- Wallet identity and destination validation
- Wallet spending controls

**Foundation Available**
- Asset identity and network consistency

**Planned**
- Token behavior and economic risk

### Contract & Permission Safety

**Live**
- Contract identity and allowlists
- Entry-point and package-version controls

**Planned**
- Privileged contract actions
- Token approvals and permits

### Execution Integrity

**Live**
- Transaction construction preflight
- Lifecycle and replay protection

**Foundation Available**
- Execution and settlement reconciliation
- Stateful execution simulation

**Planned**
- RPC and chain integrity
- Gas sponsorship and fee safety

### Market & Oracle Integrity

**Live**
- Slippage and output bounds

**Foundation Available**
- Oracle price integrity

**Planned**
- MEV and execution quality
- Asset market-risk signals

### Cross-chain & Payment Controls

**Foundation Available**
- Bridge route controls
- x402 exact-payment authorization
- x402 settlement reconciliation

**Planned**
- Additional native payment adapters

### Threat & Compliance

**Foundation Available**
- Threat-intelligence screening
- Compliance evidence controls

**Planned**
- Managed provider adapters

## Major files changed

### Backend

- `backend/lib/executionIntegrity.mjs`
- `backend/lib/executionIntegrity.test.mjs`
- `backend/lib/executionIntegrity.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/agentGateway.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/lib/securityModel.test.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/data/seed.mjs`
- `backend/server.mjs`

### Frontend

- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `src/app/lib/api.ts`

### Developer integrations

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`

### Documentation

- `README.md`
- `docs/EXECUTION_INTEGRITY.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/README.md`

## Verification completed

- **161/161 backend and security-model tests passed**
- **9 focused Execution Integrity tests passed**, including direct and authenticated Gateway integration tests
- **10/10 TypeScript SDK tests passed**
- **6/6 Python SDK tests passed**
- **5/5 MCP core tests passed**
- TypeScript SDK typecheck and build passed with the available compiler
- Focused frontend semantic typecheck passed using temporary dependency declarations
- Frontend Security Coverage and Integration Health tests passed
- **57 TypeScript/TSX source files** passed syntax transpilation
- All backend and script `.mjs` files passed Node syntax checks
- Memory-store backend startup passed
- `/api/health` passed
- `/api/execution-integrity/status` passed and returned sanitized control status
- Audit persistence of the canonical lifecycle fingerprint passed
- Fresh-intent Allowed, replay Blocked, parameter-mutation Blocked, and expired-intent Blocked behavior passed

## Verification limitation

A fresh root dependency installation and complete dependency-backed Vite/MCP production build could not be rerun in the sandbox because the configured package registry returned HTTP 503 while Corepack attempted to retrieve `pnpm@10.14.0`.

Run these checks locally before pushing:

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

The backend still requires `DATABASE_URL` by default. Temporary memory mode is available only when explicitly enabled:

```env
ALLOW_MEMORY_STORE=true
```

Do not use memory mode for production.

## Deployment

No Railway or Vercel configuration changes are required.

1. Preserve the existing `.git`, `.env`, and private relayer-key files.
2. Replace the old project files with this release.
3. Run the local checks above.
4. Commit and push to the connected branch.
5. Verify Railway starts with PostgreSQL.
6. Verify Vercel reaches the Railway API.
7. Submit the new Playground lifecycle examples.
8. Confirm the Execution Integrity findings and canonical fingerprint appear in Audit Logs.

## Suggested commit

```text
feat(execution-integrity): consolidate protection areas and add lifecycle replay guard
```

Suggested body:

```text
Group Agent Shield controls into eight coherent protection areas with control-level statuses.

Add deterministic intent IDs, idempotency keys, canonical fingerprints, expiry, sequence, duplicate detection, transaction-hash replay checks, and safe retry or replacement handling before wallet signing.

Integrate Execution Integrity with policies, Security Pipeline, Audit Logs, Security Coverage, Integration Health, Intent Playground, SDKs, MCP, operational status, README, and Docs while preserving existing Gateway, database, Casper proof, Railway, and Vercel contracts.
```

## Manual QA checklist

- Open Agent Shield and confirm exactly eight protection-area cards are shown.
- Confirm every card shows status per control rather than one misleading blanket status.
- Create a new policy and inspect Lifecycle & Replay settings.
- Edit an existing legacy policy and confirm strict duplicate blocking is not silently enabled.
- Open Intent Playground and submit **Fresh lifecycle-bound transfer**.
- Confirm the decision is Allowed when all other active policy controls pass.
- Confirm the Execution Integrity context shows a canonical SHA-256 fingerprint.
- Submit **Duplicate lifecycle intent — run twice** twice without reloading it.
- Confirm the second submission is Blocked and cites replay or duplicate evidence.
- Submit **Expired lifecycle intent** and confirm it is Blocked.
- Open Audit Logs and confirm lifecycle metadata, findings, remediation, pipeline stage, and fingerprint are visible.
- Confirm ordinary legacy YieldBot or SDK requests without lifecycle metadata still follow their existing policy behavior.
- Verify Casper proof submission remains unchanged.
- Verify desktop and mobile Protection Modules layouts remain usable.
