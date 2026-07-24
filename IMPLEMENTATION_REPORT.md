# Magen3 Token Approval & Permit Safety — Implementation Report

## Release

- **Release version:** 1.3.0
- **Control:** Token Approval & Permit Safety
- **Product placement:** Agent Shield → Contract & Permission Safety → Token Permissions
- **Reported status:** Foundation Available
- **Database migration:** None required for this release

## What changed

This release adds a deterministic, provider-agnostic, chain-aware token-authority evaluator without changing the current Magen3 navigation or replacing any existing protection area. It preserves the Casper-first path while isolating EVM-specific approval and permit handling to intents that explicitly declare EVM token-permission metadata.

Supported explicit action classifications:

- Token Approval
- Allowance Increase
- Allowance Decrease
- Allowance Reset
- Permit Authorization
- NFT Operator Approval
- Batch Approval
- Delegated Spender Permission

Generic contract calls are not guessed to be approvals.

## Backend

### New evaluator

`backend/lib/tokenPermissionControls.mjs` implements:

- Token, owner, spender, intended-spender, action-target, and network binding
- Casper and EVM structural validation
- Approved and blocked spender checks
- Existing trusted and blocked contract reuse
- Positive, maximum, and unlimited amount handling
- Approval-to-transaction ratio
- Deadline, expiry, and maximum lifetime
- One-time, reusable, and allowance-reset behavior
- Permit nonce, identifier, chain ID, and optional signature-hash checks
- Canonical SHA-256 token-permission fingerprint
- Audit-backed replay and changed-parameter detection
- NFT operator approval policy
- Batch enablement, maximum size, item validation, spender policy, unlimited items, aggregate amount, and multiple-spender risk
- Structured findings, deterministic score impact, final decision integration, and sanitized context

### Gateway and policy integration

The Gateway now normalizes a bounded `action.tokenPermission` object, including bounded nested batch items. Raw permit signatures, signed permit payloads, wallet approvals, private keys, mnemonics, and raw signed transactions are rejected before persistence.

The policy engine invokes the evaluator only when explicit token-permission metadata or a supported approval action is present. Legacy policies remain compatible unless `tokenPermissionControlsEnabled` is explicitly enabled.

### Existing control cooperation

- **Contract Validation:** validates Casper token contracts and skips only the Casper-specific evaluator for explicitly EVM-bound token permissions.
- **Wallet Validation:** retains Casper signing-key validation by default and accepts an EVM execution wallet only for explicit EVM token-permission intents.
- **Execution Integrity:** includes `tokenPermission` in the protected canonical intent and reuses audit history for replay evidence.
- **Human Approval & Quorum:** binds the full normalized token-permission object through the existing original-intent approval hash.
- **Audit stores:** persist normalized unsigned metadata, computed fingerprint, and optional signature hash in existing JSON fields.

### API surfaces

- `GET /api/token-permission-controls/status`
- Token-permission action, target, request, policy, response-context, boundary, and decision rules in `GET /api/agent-gateway/spec`
- Token Permission Controls status in `/api/health` and `/api/public-config`

## Policy fields enforced

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

No decorative policy field was added without backend enforcement.

## Frontend

The existing interface was extended in place:

- Protection Modules shows Token Approval & Permit Safety inside Contract & Permission Safety → Token Permissions.
- Agent registration recommends the control for Trading, Wallet Management, Treasury Operations, dApp Interactions, and Enterprise Automation.
- Policy create/edit forms use progressive disclosure for essential and advanced token-permission settings.
- Agent Details shows control status, mode, spender lists, limits, recent findings, and recent decisions.
- Intent Playground includes bounded, unlimited, unknown-spender, blocked-spender, expired-permit, replay, NFT-operator, and batch examples.
- Audit details show sanitized token authority, amount, ratio, lifetime, binding, replay, policy, rule, remediation, and human-approval evidence.
- Dashboard alerts appear only when relevant; no permanent card clutter was added.

## SDK and MCP

- TypeScript SDK request and response types include token-permission metadata and sanitized evaluator context.
- Python SDK forwards the same JSON-compatible metadata without signing behavior.
- MCP schema and intent instructions include explicit token-permission fields and security boundaries.
- Raw signatures and signed permit payloads remain outside all SDK and MCP schemas.

## Documentation

Added:

- `docs/TOKEN_APPROVAL_PERMIT_SAFETY.md`

Updated the README, platform documentation, Gateway API, integration guide, official SDK guide, MCP guide, and package READMEs.

## Honest security boundary

The control remains **Foundation Available**, not Live, because this release does not:

- Query current on-chain allowance state
- Decode arbitrary contract calldata
- Fetch or certify token symbol, decimals, or implementation metadata
- Verify a raw permit signature cryptographically
- Prove that a structurally valid contract implements the declared token standard
- Sign, broadcast, or settle an approval transaction

Magen3 evaluates declared unsigned metadata and optional hashes before the separate wallet-signing boundary.

## Database and deployment

No additive migration is needed. Existing structured-policy JSON stores the policy extension, and existing audit JSON stores normalized intent and evaluator evidence. The Human Approval & Quorum migration from the prior release remains required where it has not already been applied.

Railway and Vercel configuration files remain unchanged. After deployment, verify:

- `/api/health`
- `/api/token-permission-controls/status`
- `/api/agent-gateway/spec`
- Intent Playground token-permission examples
- Policy create/edit persistence
- Agent Details and Audit evidence

## Test coverage

The release includes focused evaluator, Gateway normalization, policy-engine integration, wallet/contract interoperability, SDK, MCP, replay, and backward-compatibility tests. See the final delivery response for the exact executed test counts and any environment-limited checks.
