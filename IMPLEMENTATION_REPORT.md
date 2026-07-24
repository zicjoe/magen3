# Magen3 Token Approval & Permit Safety — Implementation Report

## Release

- **Magen3 version:** 1.3.0
- **Immediate milestone:** Token Approval & Permit Safety
- **Location:** Agent Shield → Contract & Permission Safety → Token Permissions
- **Control status:** **Live**
- **Recommended next milestone:** Privileged Contract Action Classification

Magen3 remains a modular execution firewall for autonomous blockchain agents. This release adds one deterministic protection control inside the existing eight-area Agent Shield model. It does not create a new top-level product, sidebar page, signing service, wallet custodian, or language-model authorization path.

## Architecture verified before editing

### Frontend

- React, TypeScript, Vite, Tailwind-based application under `src/`
- Existing fixed navigation and wallet-gated product experience
- Dashboard, eight-area Agent Shield, Connected Agents, Agent Details, Policies, Human Approval Queue, Audit Logs, Intent Playground, Settings, and Docs
- Existing visual identity, spacing, color system, status badges, progressive disclosure, and low-motion design preserved

### Backend

- Node ESM HTTP server in `backend/server.mjs`
- Authenticated Agent Gateway at `POST /api/agent-gateway/intents`
- Deterministic evaluator modules combined by `backend/lib/policyEngine.mjs`
- Agent ID plus `x-magen3-agent-key`, with existing Bearer compatibility
- Hashed per-agent API credentials and existing lifecycle operations
- Memory store plus PostgreSQL/Drizzle implementation
- Casper decision-proof relayer and manual proof fallback

### Database and migrations

- Agents, policies, approval requests, Gateway requests, and audit logs already support flexible JSON evidence through `structured_rules`, `original_intent`, `module_findings`, and pipeline fields
- Token Permission replay evidence can safely reuse persisted audit intent data and existing lifecycle infrastructure
- **No new database column or migration is required for this milestone**
- Memory and PostgreSQL stores were updated with the same normalized Token Permission fields
- Security Coverage now deterministically includes capability-relevant Token Permission configuration and recent observed findings
- Integration Health now reflects actual Token Permission warnings, failures, and unavailable states instead of reporting a healthy state without evidence

### Gateway, policy, findings, audit, and approval

- Gateway request envelope remains unchanged; `action.tokenPermission` is additive and optional
- Advanced policy controls remain additive under `structuredRules`
- Findings continue to use `pass`, `warning`, `fail`, `unavailable`, or `skipped`, with rule, evidence, message, severity, and remediation
- Audit records retain the normalized original intent, control findings, pipeline stages, decision, approval state, Casper proof state, and execution state
- Human Approval continues to bind to the exact original intent and can be created by Token Permission findings that resolve to `Review Required`
- Reviewer signatures remain Foundation Available because separate cryptographic reviewer signing is not part of this milestone

### Existing control reality

**Live before this release:** agent authentication, credential lifecycle, policy enforcement, review thresholds, wallet validation and spend controls, contract validation, transaction preflight, lifecycle/replay, quote-bound structure, audit persistence, and Casper decision-proof submission when configured.

**Foundation Available:** Human Approval & Quorum, asset identity, execution/settlement reconciliation, stateful simulation, Oracle Validation, Bridge Controls, x402 authorization/settlement, Threat Intelligence, and Compliance Controls.

**Planned before this release:** Token Permissions and the remaining roadmap controls.

## What was implemented

### 1. Dedicated deterministic evaluator

Created `backend/lib/tokenPermissionControls.mjs` with explicit classification for:

- Fungible Token Approval
- Allowance Increase
- Allowance Decrease
- Allowance Reset
- Permit Authorization
- NFT Operator Approval
- Batch Approval
- Delegated Spender Permission

The evaluator activates only when explicit token-permission metadata is supplied. Generic contract calls remain compatible and return a `skipped` Token Permission finding rather than being misclassified.

### 2. Deterministic security checks

Implemented checks for:

- Supported permission classification
- Owner identity structure
- Token-contract identity structure
- Wallet or contract spender identity structure
- Owner/spender separation
- Exact owner binding to the execution wallet
- Exact token-permission network binding to the transaction network
- Approved spender list with safe Review behavior when no allowlist is configured
- Blocked spender list
- Positive amount semantics
- Maximum approval amount
- Approval-to-intended-transaction ratio
- Unlimited authority
- Permit/delegation network or chain binding
- Permit nonce presence and structure
- Permit deadline structure and expiration
- Maximum permit lifetime
- Reusable delegated authority
- NFT operator-for-all authority
- Batch item validity, approved/blocked batch spenders, exact aggregate binding, enablement, and maximum batch size
- Allowance-reset expectation
- Human Approval integration through the existing final decision path

### 3. Permit fingerprinting and replay protection

Magen3 computes a canonical SHA-256 fingerprint over protected authority parameters, including:

- Permission type
- Owner
- Token contract and standard
- Spender
- Approval amount
- Intended transaction amount
- Unlimited state
- Permit ID and nonce
- Deadline
- Chain/network binding
- Reusable state
- Protocol label
- NFT operator state
- Batch entries
- Allowance-reset expectation

Persisted audit history is reused to detect:

- Exact permit replay
- Reuse of a permit ID with changed protected parameters
- Reuse of a token-scoped nonce with changed protected parameters

Replay and protected-parameter mutation fail closed. No duplicate replay table was added.

### 4. Decision precedence and policy modes

- Intrinsically unsafe conditions such as malformed identities, execution-wallet/network binding mismatch, blocked spenders, contradictory batch totals, expired permits, exact replay, and parameter mutation hard-block
- Configurable violations follow `Observe`, `Review`, or `Enforce`
- Explicit `Block` actions always block, including in Observe mode
- `Blocked` remains higher precedence than `Review Required`, which remains higher precedence than `Allowed`

### 5. Additive policy fields

Implemented and exposed:

- `tokenPermissionControlsEnabled`
- `tokenPermissionMode`
- `tokenPermissionUnknownSpenderAction`
- `tokenPermissionUnlimitedApprovalAction`
- `tokenPermissionMaxApprovalAmount`
- `tokenPermissionMaxApprovalToTransactionRatio`
- `tokenPermissionMaxLifetimeSeconds`
- `tokenPermissionRequireExpiry`
- `tokenPermissionRequireAllowanceReset`
- `tokenPermissionApprovedSpenders`
- `tokenPermissionBlockedSpenders`
- `tokenPermissionAllowNftOperatorApproval`
- `tokenPermissionAllowBatchApproval`
- `tokenPermissionRequireChainBinding`
- `tokenPermissionRequireNonce`
- `tokenPermissionMaximumBatchSize`

Starter policies enable the control for Trading, Wallet Management, Treasury Operations, dApp Interactions, and Enterprise Automation agents. Legacy requests without `action.tokenPermission` continue working.

### 6. Gateway and audit integration

The Gateway now normalizes optional `action.tokenPermission` metadata and passes it through both stores to the policy engine. Audit records retain sanitized permission evidence, the canonical fingerprint, replay status, structured findings, and pipeline stage.

The Gateway continues to reject private keys, mnemonics, wallet approvals, raw signed transactions, raw signed x402 payloads, and token-permission/permit signatures before persistence.

### 7. Security Pipeline

Added the real evaluator stage:

`Token Permission Controls`

It appears only when the evaluator is relevant. No artificial delay or fake backend stage was added.

### 8. Frontend and experience

Preserved the existing navigation and eight-area Agent Shield structure.

Policies now show:

- Essential Token Permission settings first
- Live control status
- Approved and blocked spender controls
- Amount and ratio limits
- Unlimited-approval behavior
- Advanced permit, NFT, batch, and allowance-reset settings inside a collapsed disclosure

Intent Playground now includes:

- Bounded token approval
- Unlimited token approval
- Unknown token spender
- Expired token permit
- Permit replay — submit twice
- NFT operator approval
- Batch token approval

Settings exposes the operational status endpoint without adding a new sidebar page.

### 9. SDK and MCP

#### TypeScript SDK

Added:

- `Magen3TokenPermission`
- `Magen3TokenPermissionBatchItem`
- `Magen3TokenPermissionControlsContext`
- `action.tokenPermission`
- `result.tokenPermissionControlsContext`

#### Python SDK

Documented and tested the same dictionary shape. The SDK remains transport-only and never signs.

#### MCP

Added `action.tokenPermission` to the schema and intent guidance. MCP instructions explicitly direct agents to submit unsigned permission metadata and never expose wallet secrets or permit signatures.

### 10. Documentation and status

Added `docs/TOKEN_PERMISSION_CONTROLS.md` and updated platform, Gateway, SDK, MCP, and main README documentation. Token Permissions is now marked Live at control level under Contract & Permission Safety.

## Security behavior examples

### Allowed

A bounded approval to an approved spender, within amount and ratio limits, with valid owner/token/spender metadata and no replay evidence.

### Review Required

An unknown spender or policy-sensitive reusable permission when the active rule uses Review behavior. Existing Human Approval can create an exact-intent request.

### Blocked

- Explicitly blocked spender
- Malformed owner, token, or spender
- Owner equals spender
- Expired or malformed permit
- Exact permit replay
- Permit ID or token-scoped nonce reused with changed protected parameters
- Any configurable violation under Enforce or explicit Block behavior

## Major files changed

### Backend

- `backend/lib/tokenPermissionControls.mjs` — new evaluator
- `backend/lib/tokenPermissionControls.test.mjs` — new deterministic unit tests
- `backend/lib/tokenPermissionControls.gateway.integration.test.mjs` — new authenticated Gateway tests
- `backend/lib/agentGateway.mjs` — optional metadata normalization and secret rejection path
- `backend/lib/policyEngine.mjs` — evaluator, risk precedence, context, and pipeline integration
- `backend/store/memoryStore.mjs` — request and audit integration
- `backend/store/postgresStore.mjs` — matching PostgreSQL integration
- `backend/lib/securityModel.mjs` — control status updated to Live
- `backend/server.mjs` — version, health, status route, and Gateway specification
- `backend/lib/x402PaymentControls.mjs` — existing deterministic time-window calculation corrected to use the supplied evaluation clock

### Frontend

- `src/app/App.tsx` — policy UI, starter rules, Playground examples, and operational link
- `src/app/lib/api.ts` — health and status typing
- `src/app/lib/securityModel.ts` — Live control status and description

### Integrations

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`

### Documentation

- `docs/TOKEN_PERMISSION_CONTROLS.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- `docs/README.md`
- `README.md`
- `IMPLEMENTATION_REPORT.md`

## Database and migration instructions

No new migration is required for Token Approval & Permit Safety. Existing JSON fields store the additive policy configuration, original permission metadata, fingerprint, findings, and pipeline evidence.

Normal deployment behavior is unchanged. Railway should continue running the repository's existing startup migration path for prior schema history. A manual migration command remains available when needed:

```bash
pnpm db:migrate
```

## Environment-variable changes

**None.**

No provider credential, signing key, or new environment variable was introduced.

## Local run instructions

Preserve the user's current `.env`, then run:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:backend
pnpm dev:frontend
```

Complete verification:

```bash
pnpm verify
```

The current repository has no separate lint script.

## Railway notes

- Keep the current Railway service, PostgreSQL database, `DATABASE_URL`, relayer key path, Casper variables, CORS configuration, and start command
- No new variable is required
- Existing startup migration behavior remains valid
- After deployment, confirm:
  - `/api/health`
  - `/api/token-permission-controls/status`
  - `/api/agent-gateway/spec`
- Submit a bounded approval through the deployed Gateway and inspect its audit record and Casper proof state

## Vercel notes

- Keep the current Vercel project and `VITE_API_URL`
- No new variable is required
- Verify wallet gating, fixed sidebar, Policies create/edit, Token Permission advanced disclosure, Playground examples, audit auto-refresh, desktop layout, and mobile layout

## Backward compatibility

Preserved:

- Existing Agent IDs
- Existing API-key hashes, creation, rotation, and revocation
- Existing Gateway endpoint and authentication headers
- Existing policy records
- Existing audit records
- Existing approval requests and exact-intent bindings
- Existing Casper contract hash and relayer
- Existing wallet flow
- Existing YieldBot and Codex flows
- Existing TypeScript and Python SDK authentication
- Existing MCP tools
- Existing x402, Bridge, Oracle, Threat Intelligence, Compliance, lifecycle, and Human Approval flows
- Existing Railway and Vercel configuration

Requests without `action.tokenPermission` remain compatible. Users do not need to recreate agents, policies, or API keys.

## Verification actually executed

- **190/190 backend and security-model tests passed**
- **18/18 focused Token Permission tests passed**
  - 13 evaluator tests
  - 5 authenticated Gateway integration tests
- **12/12 TypeScript SDK tests passed**
- **8/8 Python SDK tests passed**
- **6/6 MCP core tests passed**
- **61 backend/script `.mjs` files passed Node syntax checking**
- **57 TypeScript/TSX source files passed syntax transpilation**
- Memory-store HTTP smoke test verified:
  - backend version 1.3.0
  - Token Permission status route
  - agent registration and one-time API key
  - active policy creation
  - authenticated bounded approval
  - `Allowed`
  - `executionApproved: true`
  - Token Permission findings
  - canonical fingerprint
  - audit persistence
- Memory/PostgreSQL Token Permission request-field parity was checked
- Database migration script passed Node syntax checking

## Checks not completed in this environment

The package registry returned HTTP 503 or timed out while Corepack/npm attempted dependency installation. Therefore these dependency-backed checks could not be honestly reported as completed here:

- Root `pnpm typecheck`
- Vite production build
- Full installed MCP server build and stdio startup with `zod` and `@modelcontextprotocol/sdk`
- Live PostgreSQL migration and Gateway test against Railway
- Live Casper Wallet browser signing
- Live Casper Testnet proof submission and relayer confirmation
- Production Vercel-to-Railway CORS verification
- External provider-backed Oracle, Bridge, x402 facilitator, Threat Intelligence, and Compliance checks

The dependency-independent backend, SDK, MCP core, syntax, and memory HTTP checks above were executed successfully. Run `pnpm verify` after dependency installation and before production deployment.

## Updated control status

### Live

- Agent authentication
- Credential lifecycle
- Deterministic policy enforcement
- Review thresholds
- Wallet identity and destination validation
- Wallet spending controls
- Contract identity and allowlists
- Entry-point and package-version controls
- **Token Approval & Permit Safety**
- Transaction construction preflight
- Lifecycle and replay protection
- Slippage and output-bound structure
- Audit persistence
- Casper decision-proof submission when configured

### Foundation Available

- Human Approval & Quorum
- Asset identity and network consistency
- Execution and settlement reconciliation
- Stateful execution simulation
- Oracle Validation
- Bridge Controls
- x402 exact-payment authorization and settlement reconciliation
- Threat Intelligence
- Compliance Controls

### Planned

- Privileged Contract Action Classification
- Emergency Circuit Breaker
- Cryptographic Reviewer Signatures
- Approval Escalation and Organizational Quorum
- Contract Upgrade Safety
- Contract Argument Policies
- Agent Instruction Integrity
- Tool & MCP Integrity
- Delegation & Session Key Safety
- RPC & Chain Integrity
- Gas Sponsorship & Fee Safety
- Real stateful simulation/provider integration
- Asset contract risk and wallet behavior controls
- MEV, route, and market-risk controls
- Real bridge and x402 provider integrations
- Production threat, oracle, and compliance providers
- Continuous Risk Monitoring

## Roadmap progress

**Phase 1 item 1 is complete:** Token Approval & Permit Safety.

Magen3 is not finished. The immediate next recommended milestone is:

**Privileged Contract Action Classification**

That milestone should reuse Contract Validation, Token Permission evidence, Human Approval binding, and the existing deterministic finding/risk pipeline rather than creating parallel policy or replay systems.

## Conventional commit

```text
feat(contract-safety): add token approval and permit protections
```

## Manual QA checklist

- [ ] Extract the replacement ZIP over the current project while preserving `.git`, `.env`, and the private relayer key
- [ ] Run `pnpm install --frozen-lockfile`
- [ ] Run `pnpm verify`
- [ ] Run `pnpm db:migrate`
- [ ] Start backend and frontend locally
- [ ] Connect Casper Wallet and verify wallet-gated navigation
- [ ] Open Agent Shield → Contract & Permission Safety and confirm Token Permissions is Live
- [ ] Create a new relevant-capability agent and confirm Token Permission recommendations
- [ ] Create a policy and configure approved/blocked spenders
- [ ] Confirm advanced fields are collapsed by default
- [ ] Submit Bounded token approval and inspect Allowed findings
- [ ] Submit Unknown token spender and inspect Review Required or Blocked according to policy
- [ ] Submit Unlimited token approval in Warn, Review, and Block configurations
- [ ] Submit Expired token permit and confirm Blocked
- [ ] Submit Permit replay twice and confirm the second request is Blocked
- [ ] Submit NFT operator approval in disabled and enabled configurations
- [ ] Submit Batch token approval below and above the configured maximum
- [ ] Confirm Human Approval is created for Review Required when enabled
- [ ] Confirm audit detail includes original permission metadata, fingerprint, findings, and pipeline stage
- [ ] Confirm new audits appear without wallet reconnection or full-page refresh
- [ ] Confirm generic contract calls without `action.tokenPermission` behave as before
- [ ] Confirm permit signatures and signed authority payloads are rejected
- [ ] Confirm TypeScript SDK, Python SDK, MCP, and Codex examples use unsigned metadata
- [ ] Verify desktop and mobile policy layout
- [ ] Verify fixed sidebar and Docs navigation
- [ ] Deploy Railway and confirm health/status/spec endpoints
- [ ] Deploy Vercel and run the same Playground flow against Railway
- [ ] Confirm Casper decision proof and relayer behavior remain unchanged
