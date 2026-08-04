# Delegation & Session Key Safety

## Status

**Foundation Available** under **Agent Shield → Agent Trust & Access → Delegated Permissions**. Backend enforcement, canonical SDK builders, audit integration, and automated cryptographic verification are complete. Promotion to Live requires a deployed Casper Wallet or smart-account flow and end-to-end delegated execution verification.

Delegation & Session Key Safety lets an autonomous agent operate through a constrained, expiring authority instead of treating possession of a broad wallet credential as unlimited permission. Magen3 verifies a canonical Casper-signed delegation attestation and deterministically checks that the requested execution remains inside the delegated network, contract, method, asset, amount, frequency, lifetime, depth, and redelegation boundaries.

The final outcomes remain only:

- Allowed
- Blocked
- Review Required

No language model determines authorization.

## Gateway metadata

Submit public delegation evidence under `action.delegation`:

```json
{
  "action": {
    "type": "Transfer",
    "amount": 5,
    "asset": "CSPR",
    "target": "01...",
    "targetType": "Wallet Address",
    "chainName": "casper-test",
    "delegation": {
      "delegationId": "delegation:treasury-session-001",
      "delegatingWallet": "01...",
      "delegate": "treasury-agent-session",
      "sessionKey": "01...",
      "allowedNetworks": ["casper-test"],
      "allowedContracts": [],
      "allowedMethods": ["Transfer"],
      "allowedAssets": ["CSPR"],
      "nativeAmountLimit": 25,
      "tokenAmountLimits": {},
      "maxTransactionAmount": 10,
      "maxFrequency": 5,
      "validFrom": "2026-07-25T00:00:00.000Z",
      "expiresAt": "2026-07-25T01:00:00.000Z",
      "revocationStatus": "Active",
      "delegationDepth": 0,
      "redelegationAllowed": false,
      "nonce": "delegation-nonce-001",
      "chainName": "casper-test",
      "attestationHash": "OPTIONAL_SHA256",
      "attestationSignature": "TRANSIENT_CASPER_MESSAGE_SIGNATURE"
    }
  }
}
```

`attestationSignature` is accepted only as transient verification input. It is not persisted raw.

## Canonical attestation

Magen3 builds a domain-separated canonical message containing:

- domain `magen3.delegation.v1`;
- chain name;
- delegation ID and Agent ID;
- delegating wallet;
- delegate and optional public session key;
- allowed networks, contracts, methods, and assets;
- native and token amount limits;
- maximum transaction amount and rolling hourly frequency;
- activation and expiry times;
- revocation status;
- delegation depth and redelegation flag;
- nonce.

The delegating Casper wallet signs this exact message. Magen3 supports Casper Ed25519 and Secp256k1 public keys and verifies the signature before the delegated authority can count as valid.

An adapter may submit the SHA-256 `attestationHash`. When supplied, it must equal Magen3's hash of the normalized canonical message.

## Deterministic checks

The control evaluates:

1. Required identifiers and structurally valid metadata.
2. Exact canonical attestation-hash binding.
3. Casper wallet signature verification.
4. Execution-wallet and delegating-wallet equality.
5. Approved and blocked delegate policy.
6. Policy and request revocation state.
7. `validFrom`, `expiresAt`, and maximum lifetime.
8. Maximum delegation depth.
9. Redelegation prohibition.
10. Exact network scope.
11. Exact contract scope when a contract is used.
12. Exact method or action scope.
13. Exact asset scope.
14. Native and per-token amount limits.
15. Maximum transaction amount.
16. Rolling hourly frequency for the delegation ID.

Malformed evidence, invalid signatures, wallet substitution, blocked delegates, revocation, expiry, excessive depth, forbidden redelegation, and scope or limit violations fail closed. Missing signer evidence and unknown delegates follow the configured Warn, Review, or Block behavior.

## Policy fields

The control uses additive `structuredRules` fields:

- `delegationControlsEnabled`
- `delegationMode`
- `requireExpiringDelegation`
- `maximumDelegationLifetime`
- `maximumDelegationDepth`
- `allowRedelegation`
- `approvedDelegates`
- `blockedDelegates`
- `revokedDelegationIds`
- `unknownDelegateAction`
- `requireScopeBinding`
- `requireCryptographicDelegationAttestation`
- `delegationUnavailableAction`

Existing policies without the control remain backward compatible. New policy forms enable bounded signed delegation controls by default.

## Audit evidence

Audit records may store:

- delegation ID;
- delegating wallet;
- delegate and public session key;
- normalized scopes and limits;
- validity and revocation evidence;
- depth and redelegation state;
- canonical attestation hash;
- signature verification result;
- signature hash and algorithm;
- rolling historical usage count;
- deterministic violations and remediation.

Audit records do not store:

- private session keys;
- private wallet keys;
- seed phrases or mnemonics;
- raw Casper delegation signatures;
- raw signed transactions.

## Human Approval and execution

A `Review Required` delegation finding always pauses execution, but it does not automatically require a person. Magen3 inspects the active review-resolution strategy: autonomous reviews return deterministic remediation for the agent to satisfy and resubmit, while explicitly escalated reviews use the exact-intent Human Approval workflow. When approval is required, the normalized delegation fields are part of the approval binding. Changing a delegate, scope, limit, expiry, nonce, target, action, or amount produces a different bound intent and requires a new authorization.

Approval does not repair an invalid signature, revoked delegation, expired authority, forbidden redelegation, or hard scope violation.

## SDK and MCP boundary

The JavaScript and Python SDKs pass public delegation metadata and return sanitized `delegationSafetyContext`. They do not create private session keys or sign on behalf of a wallet.

The MCP schema can carry a transient attestation signature supplied by a trusted connected-wallet adapter. The official MCP server does not hold wallet secrets and does not manufacture signed delegation evidence.

## Intent Playground

The static Playground includes:

- missing Casper signature;
- revoked delegation;
- method outside scope.

A genuine Allowed delegation cannot be safely fabricated as static JSON. It must be generated and signed by the actual delegating Casper wallet through a trusted adapter.

## Status endpoint

```http
GET /api/delegation-safety/status
```

The endpoint reports the control maturity, supported signature algorithms, enforced boundaries, policy fields, security boundary, and external-revocation limitation.

## Limitation

Magen3 can immediately enforce revocation configured in its policy or supplied as trusted request evidence. A revocation made only inside an external wallet, smart account, or delegation provider cannot be known until a trusted adapter or provider updates Magen3's evidence. Structural validity and a valid signature establish authority and scope; they do not guarantee that the delegate or transaction is economically safe.
