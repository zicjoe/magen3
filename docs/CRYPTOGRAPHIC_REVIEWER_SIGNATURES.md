# Cryptographic Reviewer Signatures

Cryptographic Reviewer Signatures harden **Policy & Approval Controls → Human Approval & Quorum** by proving that each counted response was signed by its authorized Casper reviewer wallet.

## Status

**Foundation Available — implementation complete; deployed browser verification required before Live.**

The backend, PostgreSQL and memory stores, Casper Wallet UI flow, audit evidence, SDK response types, MCP guidance, and deterministic tests are implemented. Magen3 does not mark this control Live until a real deployed Casper Wallet extension flow is verified end to end for both supported account types where available.

## Signed challenge

For a signature-enabled policy, the reviewer flow is:

```text
Open Human Approval Queue
→ Choose Approve or Reject
→ Magen3 issues a one-time challenge
→ Casper Wallet signs the exact UTF-8 message
→ Magen3 verifies the signature
→ Challenge becomes Used
→ Only the verified response counts toward quorum
```

The challenge binds:

- Approval request ID
- Audit record ID
- Agent ID
- Exact approval binding hash
- `Approve` or `Reject`
- Reviewer public key
- Random 32-byte nonce
- Issued and expiry timestamps
- Domain `magen3.approval-response.v1`
- Casper chain name

Changing the response, reviewer, approval binding, chain, domain, message, or timing invalidates the challenge. A used, expired, or superseded challenge cannot be replayed.

## Supported Casper keys

- Ed25519 public keys with Casper tag `01`
- Secp256k1 public keys with Casper tag `02`

Verification is performed by the backend over the exact challenge bytes. Magen3 stores the signature hash, algorithm, challenge hash, nonce hash, verification timestamp, domain, and chain. It does not persist private keys, mnemonics, raw transaction signatures, or the raw reviewer signature in the approval response/audit evidence.

## Policy fields

```json
{
  "requireCryptographicReviewerSignature": true,
  "approvalSignatureLifetimeSeconds": 300,
  "requireReviewerChainBinding": true,
  "requireApprovalDomainSeparation": true,
  "approvalSignatureChainName": "casper-test"
}
```

Legacy policies with no `requireCryptographicReviewerSignature` field remain unsigned by default for backward compatibility. New starter policies enable signatures by default.

## API flow

Issue a challenge:

```http
POST /api/approvals/APR-.../challenge
Content-Type: application/json

{
  "walletAddress": "01...",
  "response": "Approve"
}
```

Sign the returned `challenge.message` with Casper Wallet, then submit:

```http
POST /api/approvals/APR-.../respond
Content-Type: application/json

{
  "walletAddress": "01...",
  "response": "Approve",
  "comment": "Reviewed exact amount and recipient",
  "challengeId": "APC-...",
  "signatureHex": "..."
}
```

The raw signature is accepted only on the protected reviewer response endpoint for verification and is not returned in approval or audit records.

## Failure behavior

Magen3 rejects:

- Unauthorized reviewer wallets
- Active-wallet mismatch
- Wrong signer
- Changed response
- Changed approval binding
- Expired challenge
- Used or superseded challenge
- Invalid chain or domain binding
- Corrupted challenge message
- Malformed Ed25519 or Secp256k1 signature
- Duplicate reviewer response

Quorum counts only `Approved` responses with `signatureVerified: true` when the active policy requires signatures. Execution authorization rechecks verified quorum and approval expiry.

## Security boundary

Signing the reviewer challenge records an approval decision only. It does not sign or submit the protected blockchain transaction. The external agent still stops until approval is complete, and the execution wallet separately signs the real action afterward.
