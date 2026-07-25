# Execution Integrity

Execution Integrity protects the unsigned transaction lifecycle before wallet signing. It is a broad Agent Shield protection area rather than another sidebar product.

## Control-level status

| Control | Status |
| --- | --- |
| Transaction construction preflight | Live |
| Lifecycle and replay protection | Live |
| Execution and settlement reconciliation | Foundation Available |
| Stateful execution simulation | Foundation Available |
| RPC and chain integrity | Planned |
| Gas sponsorship and Paymaster safety | Planned |

## Lifecycle request schema

Add optional lifecycle metadata inside the existing `action` object:

```json
{
  "agentId": "MAG-AGENT-...",
  "executionWalletAddress": "01...",
  "action": {
    "type": "Transfer",
    "amount": 5,
    "asset": "CSPR",
    "target": "01...",
    "targetType": "Wallet Address",
    "lifecycle": {
      "intentId": "intent:transfer-20260723-0001",
      "idempotencyKey": "idempotency:transfer-20260723-0001",
      "sequence": 42,
      "createdAt": "2026-07-23T10:00:00.000Z",
      "expiresAt": "2026-07-23T10:10:00.000Z",
      "attempt": 0
    }
  }
}
```

`intentFingerprint` is optional. Magen3 always computes its own canonical SHA-256 fingerprint. When a client supplies one, Magen3 verifies exact equality.

## Deterministic checks

- Unique intent ID per agent.
- Unique idempotency key for one logical request.
- Hard block when an idempotency key is reused after amount, recipient, contract, network, asset, payment, bridge, compliance, oracle, or other protected parameters change.
- ISO-8601 creation time and expiry.
- Maximum intent age, future clock skew, and authorization lifetime.
- Optional monotonically increasing agent sequence.
- Duplicate canonical fingerprint detection inside the configured replay window.
- Transaction-hash replay detection.
- `retryOf` and `replacementOf` references to an existing audit owned by the same agent.
- No retry or replacement after confirmed execution.
- No retry while the prior execution is pending or uncertain when the policy prevents ambiguous retries.
- Maximum retry attempts.

## Policy fields

```json
{
  "lifecycleControlsEnabled": true,
  "lifecycleControlMode": "Enforce",
  "lifecycleUnavailableAction": "Warn",
  "lifecycleRequireIntentId": true,
  "lifecycleRequireIdempotencyKey": true,
  "lifecycleRequireCreatedAt": true,
  "lifecycleRequireExpiry": true,
  "lifecycleRequireSequence": false,
  "lifecyclePreventDuplicateFingerprint": true,
  "lifecyclePreventRetryAfterUncertain": true,
  "lifecyclePreventParameterMutation": true,
  "lifecycleMaxIntentAgeSeconds": 600,
  "lifecycleMaxFutureSkewSeconds": 120,
  "lifecycleMaxLifetimeSeconds": 900,
  "lifecycleReplayWindowSeconds": 86400,
  "lifecycleMaxRetryAttempts": 3
}
```

### Modes

- **Observe** records violations without changing an otherwise valid decision, except hard replay and malformed-binding failures.
- **Review** routes policy violations to Review Required.
- **Enforce** blocks policy violations.
- **Warn, Review, or Block** controls how missing required metadata affects authorization.

## Retry flow

1. Do not automatically retry after an RPC timeout or uncertain broadcast.
2. Read the original Magen3 audit and execution state.
3. Reconcile the original transaction first.
4. When a retry is genuinely safe, create a new intent ID and idempotency key.
5. Set `retryOf` to the prior Magen3 audit ID and increment `attempt`.
6. A replacement transaction uses `replacementOf`, never both fields together.

## Backward compatibility

Existing agent IDs, API keys, policies, Gateway routes, headers, and audit records remain valid. Legacy policies do not silently enable strict duplicate-fingerprint enforcement. New starter policies enable the lifecycle controls with secure defaults.

## Security boundary

Magen3 accepts unsigned intent metadata only. Never send private keys, mnemonics, wallet approvals, transaction signatures, signed deploys, or signed x402 payment payloads.


## RPC & Chain Integrity

RPC & Chain Integrity complements lifecycle and replay protection by checking whether authorization relies on fresh, approved, network-bound provider evidence. It evaluates `action.rpcIntegrity` before downstream wallet, contract, and execution decisions. The control is Foundation Available pending deployed real-provider adapter verification. See [RPC & Chain Integrity](./RPC_CHAIN_INTEGRITY.md).


## Gas Sponsorship & Fee Safety

Gas Sponsorship & Fee Safety complements lifecycle and RPC controls by evaluating bounded fee, approved sponsor or Paymaster, expiry, scope, payer, rolling budget, operation count, and failure evidence before signing. See [Gas Sponsorship & Fee Safety](./GAS_SPONSORSHIP_FEE_SAFETY.md).
