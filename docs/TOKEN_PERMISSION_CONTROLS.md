# Token Approval & Permit Safety

Token Permission Controls is a **Live** deterministic control inside:

`Agent Shield → Contract & Permission Safety → Token Permissions`

It evaluates explicit unsigned token-authority metadata before wallet signing. It does not sign approvals, permits, NFT operator transactions, or delegated permissions.

## Supported classifications

Magen3 classifies a request only when `action.tokenPermission` is supplied with sufficient metadata:

- Fungible Token Approval
- Allowance Increase
- Allowance Decrease
- Allowance Reset
- Permit Authorization
- NFT Operator Approval
- Batch Approval
- Delegated Spender Permission

Generic contract calls that omit `action.tokenPermission` remain backward compatible and are not treated as approvals.

## Request schema

```json
{
  "source": "external-agent",
  "agentId": "AGT-...",
  "executionWalletAddress": "01...",
  "action": {
    "type": "Contract Interaction",
    "amount": 10,
    "asset": "TOKEN",
    "target": "contract-...",
    "targetType": "Trusted Contract",
    "contractIdentifierType": "Contract Hash",
    "entryPoint": "approve",
    "chainName": "casper-test",
    "tokenPermission": {
      "permissionType": "Fungible Token Approval",
      "owner": "01...",
      "tokenContract": "contract-...",
      "tokenStandard": "CEP-18",
      "spender": "01...",
      "approvalAmount": 10,
      "intendedTransactionAmount": 10,
      "unlimited": false,
      "network": "casper-test",
      "approvedProtocol": "router-name",
      "allowanceResetExpected": false
    }
  }
}
```

Permit and delegated-authority requests can additionally include:

```json
{
  "permissionType": "Permit Authorization",
  "nonce": "permit-nonce-42",
  "permitId": "permit-42",
  "deadline": "2026-07-24T10:30:00.000Z",
  "reusable": false,
  "chainId": "optional-chain-identifier",
  "network": "casper-test"
}
```

Batch entries use `batchItems` with optional `tokenContract`, `spender`, `amount`, and `tokenId` fields. Every item must resolve to a valid token identifier, valid wallet/contract spender, and positive amount. The top-level `approvalAmount`, when supplied, must equal the exact aggregate of all batch item amounts.

## Deterministic checks

The evaluator checks:

- Supported permission classification
- Owner, token-contract, and wallet/contract spender structure
- Owner and spender separation
- Exact owner binding to the execution wallet
- Exact token-permission network binding to the transaction network
- Approved and blocked spender policy, with safe Review defaults when no allowlist exists
- Positive and bounded approval amount
- Approval-to-intended-transaction ratio
- Unlimited authority handling
- NFT operator-for-all policy
- Batch item validity, approved/blocked spenders, exact aggregate binding, enablement, and maximum size
- Permit chain or network binding
- Permit nonce presence and structure
- Permit deadline, expiry, and maximum lifetime
- Reusable delegated authority
- Allowance-reset requirement
- Exact permit fingerprint replay
- Reuse of a permit ID or nonce with changed protected parameters

Exact blocked-spender matches, malformed identities, expired permits, exact replay, and protected-parameter mutation fail closed. Other configurable rules follow the policy's Observe, Review, or Enforce mode.

## Policy fields

Token Permission Controls uses additive `structuredRules` fields:

```json
{
  "tokenPermissionControlsEnabled": true,
  "tokenPermissionMode": "Review",
  "tokenPermissionUnknownSpenderAction": "Review",
  "tokenPermissionUnlimitedApprovalAction": "Review",
  "tokenPermissionMaxApprovalAmount": 1000,
  "tokenPermissionMaxApprovalToTransactionRatio": 2,
  "tokenPermissionMaxLifetimeSeconds": 3600,
  "tokenPermissionRequireExpiry": true,
  "tokenPermissionRequireAllowanceReset": false,
  "tokenPermissionApprovedSpenders": ["01..."],
  "tokenPermissionBlockedSpenders": ["01..."],
  "tokenPermissionAllowNftOperatorApproval": false,
  "tokenPermissionAllowBatchApproval": false,
  "tokenPermissionRequireChainBinding": true,
  "tokenPermissionRequireNonce": true,
  "tokenPermissionMaximumBatchSize": 10
}
```

`Warn`, `Review`, and `Block` are supported for the unknown-spender and unlimited-approval actions. A policy-level `Block` always blocks, including in Observe mode.

## Replay and parameter binding

Magen3 computes a canonical SHA-256 fingerprint over protected token-authority parameters, including permission type, owner, token, spender, amount, intended amount, unlimited state, nonce, permit ID, deadline, chain/network, reusable state, NFT operator state, batch entries, and allowance-reset expectation.

The fingerprint and non-sensitive normalized metadata are stored in the audit record. A later request is blocked when:

- The same permit ID or token-scoped nonce is submitted with the same fingerprint.
- The same permit ID or token-scoped nonce is submitted with changed protected parameters.

This reuses the existing persisted audit and lifecycle infrastructure instead of creating a second replay database.

## Human Approval

When a Token Permission rule produces `Review Required`, execution remains paused. If `reviewResolution.humanActionRequired` is `false`, the agent follows the returned remediation and resubmits the same bound goal. If it is `true`, the existing exact-intent approval workflow creates an approval request. The approval binding includes the original intent, so changing the token, spender, amount, deadline, nonce, or another protected parameter requires a new Gateway decision and a new approval.

## Audit evidence

Audit records preserve:

- Classification
- Owner
- Token contract and standard
- Spender
- Approval and intended amounts
- Ratio findings
- Unlimited state
- Permit ID and nonce
- Deadline and chain/network binding
- Reusable state
- NFT operator state
- Batch entries
- Allowance-reset expectation
- Canonical fingerprint
- Replay status
- Structured findings
- Human Approval state
- Casper decision-proof state

Magen3 never needs or accepts raw permit signatures, wallet signatures, private keys, mnemonics, or raw signed token-authority payloads through the pre-signing Gateway.

## SDK and MCP

The TypeScript SDK exposes `Magen3TokenPermission` and `Magen3TokenPermissionControlsContext`. The Python SDK accepts the same dictionary shape. The MCP intent schema exposes `action.tokenPermission` and explicitly prohibits permit signatures and wallet secrets.

## Intent Playground

Included examples:

- Bounded token approval
- Unlimited token approval
- Unknown token spender
- Expired token permit
- Permit replay — submit the exact payload twice
- NFT operator approval
- Batch token approval

## Security boundary

A valid token contract or spender format is not proof that it is economically safe, audited, reputable, or controlled by the expected party. Token Permission Controls enforces submitted metadata and configured deterministic policy. Asset-contract analysis, production threat-provider coverage, and broader privileged-action classification remain separate roadmap controls.
