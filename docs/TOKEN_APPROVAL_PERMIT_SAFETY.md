# Token Approval & Permit Safety

## Status and placement

**Status:** Foundation Available  
**Product placement:** Agent Shield → Contract & Permission Safety → Token Permissions

Token Approval & Permit Safety evaluates explicit token-authority metadata before wallet signing or blockchain execution. It is provider-agnostic and chain-aware. Casper remains the default network path; EVM-specific fields are evaluated only when an intent explicitly declares EVM token-permission metadata.

The control is Foundation Available rather than Live because Magen3 does not independently query on-chain allowance state, fetch or certify token metadata, decode arbitrary contract calldata, verify raw permit signatures, or guarantee that a submitted contract implements the declared token standard.

## Applicability

Magen3 evaluates this control only when sufficient explicit metadata is present. Supported classifications are:

- `Token Approval`
- `Allowance Increase`
- `Allowance Decrease`
- `Allowance Reset`
- `Permit Authorization`
- `NFT Operator Approval`
- `Batch Approval`
- `Delegated Spender Permission`

A generic `Contract Call` is not treated as an approval merely because its entry point resembles an approval method. The caller must provide a supported action type or an explicit `action.tokenPermission` object.

## Request schema

Token-permission metadata belongs under `action.tokenPermission`:

```json
{
  "executionWalletAddress": "0x1111111111111111111111111111111111111111",
  "targetChain": "eip155:1",
  "action": {
    "type": "Permit Authorization",
    "amount": 100,
    "asset": "USDC",
    "target": "0x2222222222222222222222222222222222222222",
    "targetType": "Token Contract",
    "tokenPermission": {
      "kind": "Permit Authorization",
      "standard": "ERC-20",
      "network": "eip155:1",
      "chainId": "1",
      "tokenContract": "0x2222222222222222222222222222222222222222",
      "owner": "0x1111111111111111111111111111111111111111",
      "spender": "0x3333333333333333333333333333333333333333",
      "intendedSpender": "0x3333333333333333333333333333333333333333",
      "approvalAmount": 100,
      "intendedTransactionAmount": 100,
      "deadline": "2026-07-23T12:30:00.000Z",
      "nonce": "7",
      "permitIdentifier": "order-173-permit-1",
      "oneTime": true
    }
  }
}
```

Casper token permissions may use supported Casper public keys, account hashes, Contract Hashes, or Package Hashes and a Casper network name such as `casper-test`.

### Safe optional hashes

A caller may submit:

- `permitSignatureHash`: SHA-256 or other 32-byte hash of a signature held outside Magen3
- `clientFingerprint`: caller-computed 32-byte canonical fingerprint for comparison

The Gateway rejects raw permit signatures, signed permit payloads, private keys, mnemonics, wallet approvals, and raw signed transactions before persistence.

## Deterministic checks

### Identity and binding

- Required token contract, owner, and spender
- Network-aware address and contract structure
- Token contract and action-target consistency
- Owner and execution-wallet consistency
- Intended-spender consistency
- Approved and blocked spender policy
- Existing trusted and blocked contract policy where applicable
- EIP-155 chain-reference and `chainId` consistency

A structurally valid address is not evidence that a token or spender is safe.

### Amount and authority

- Positive approval amount
- Maximum approval amount
- Approval-to-intended-transaction ratio
- Unlimited approval detection, including the maximum `uint256` value
- Batch size, item identity, aggregate approval amount, and multiple-spender risk
- NFT operator approval for all assets
- Reusable delegated authority
- Optional allowance-reset or one-time authorization requirement

### Lifetime

- Required expiration when configured
- Permit deadline
- Already-expired permission
- Maximum permission lifetime
- Long-lived reusable authority

A permit without a deadline is rejected when permit expiry is required. An already-expired permit is always blocked.

### Replay and mutation

The control reuses Magen3 audit history and canonical intent infrastructure. It computes a stable SHA-256 token-permission fingerprint and checks:

- Reused permission fingerprints
- Reused signature hashes
- Reused permit identifiers with changed parameters
- Optional nonce presence
- Chain, token, owner, spender, amount, and deadline binding

The normalized `tokenPermission` object is stored inside `originalIntent`. Human Approval & Quorum therefore binds the exact token authority to the approval hash. Changing the spender, amount, token, owner, network, deadline, nonce, batch, or other protected metadata requires a new decision and, where applicable, a new human approval.

## Policy fields

All fields below are evaluated by the backend when present in `structuredRules`:

| Field | Meaning |
| --- | --- |
| `tokenPermissionControlsEnabled` | Enables the control for explicit token-permission intents. |
| `tokenPermissionMode` | `Observe`, `Review`, or `Enforce` for mode-governed violations. |
| `tokenPermissionUnknownSpenderAction` | `Warn`, `Review`, or `Block`. |
| `tokenPermissionUnlimitedApprovalAction` | `Warn`, `Review`, or `Block`. |
| `tokenPermissionMaxApprovalAmount` | Maximum display-unit approval amount; `0` means no configured maximum. |
| `tokenPermissionMaxApprovalToTransactionRatio` | Maximum approval divided by intended transaction amount; `0` disables the ratio limit. |
| `tokenPermissionMaxLifetimeSeconds` | Maximum approval or permit lifetime. |
| `tokenPermissionRequireExpiry` | Requires an explicit deadline or expiration. |
| `tokenPermissionRequireAllowanceReset` | Requires one-time authority or an explicit post-use reset plan. |
| `tokenPermissionApprovedSpenders` | Exact normalized spender allowlist. |
| `tokenPermissionBlockedSpenders` | Exact normalized spender blocklist. |
| `tokenPermissionAllowNftOperatorApproval` | Allows NFT operator-wide authority. |
| `tokenPermissionAllowBatchApproval` | Allows batch approval requests. |
| `tokenPermissionRequireChainBinding` | Requires and validates network/chain binding. |
| `tokenPermissionRequireNonce` | Requires a nonce for permits. |
| `tokenPermissionMaximumBatchSize` | Maximum number of batch items, from 1 to 100. |

Legacy policies without `tokenPermissionControlsEnabled: true` remain compatible. Explicit token-permission metadata is recorded with a disabled/skipped control result rather than silently changing legacy authorization behavior.

## Decision behavior

Examples that can remain `Allowed`:

- Approved spender
- Bounded positive amount
- Acceptable ratio
- Valid token, owner, spender, network, nonce, and deadline binding
- No replay or parameter mutation
- Policy permits the approval type

Examples that can become `Review Required`:

- Unknown but structurally valid spender under a Review action
- Long lifetime under Review mode
- NFT operator or batch authority configured for review
- Long-lived reusable authority

Examples that become `Blocked`:

- Blocked spender or contract
- Unlimited approval configured to Block
- Expired permit
- Reused fingerprint or signature hash
- Reused permit identifier with changed parameters
- Chain or token-contract mismatch
- Malformed token, owner, or spender
- Missing required nonce or deadline
- Disallowed NFT operator or batch approval
- Oversized batch or batch item that violates enforced policy

The final authorization remains the ordinary Magen3 `Allowed`, `Blocked`, or `Review Required` decision. Individual findings never replace that result.

## Audit and UI evidence

Audit details may show:

- Token contract and declared standard
- Owner and spender
- Approval and intended transaction amounts
- Approval ratio and unlimited status
- Network and chain binding
- Nonce, deadline, and lifetime
- Canonical fingerprint and replay result
- Batch size and aggregate result
- Active policy, triggered rule, remediation, and final decision
- Human-approval binding statement where relevant

Raw signatures and signed permit payloads are never displayed or persisted.

## Deployment and migration

No new database table is required. Policy extensions are stored in the existing structured-policy JSON, and token-permission evidence is stored in the existing audit `originalIntent` and evaluator-context JSON. Existing Human Approval migrations remain unchanged.

After deployment, verify:

```http
GET /api/token-permission-controls/status
GET /api/agent-gateway/spec
```

Then test the bounded, unlimited, unknown-spender, blocked-spender, expired-permit, replay, NFT-operator, and batch examples in Intent Playground.
