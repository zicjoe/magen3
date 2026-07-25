# Gas Sponsorship & Fee Safety

**Status:** Foundation Available  
**Protection area:** Execution Integrity

Gas Sponsorship & Fee Safety determines whether public fee and sponsorship evidence is within the configured authorization boundary before wallet signing. It does not create sponsorships, certify a relayer or Paymaster, or guarantee final fee settlement.

## Public intent metadata

Trusted adapters may attach `action.feeSafety` with:

- `chainFamily`: `Casper`, `EVM`, or `Other`
- `chainName`
- `estimatedGas`, `gasLimit`, `gasPrice`, `priorityFee`, `maximumFee`, or `networkFee` where relevant
- `feeUnit`
- `sponsor` or EVM `paymaster`
- `sponsorshipId`, `sponsorshipExpiry`, and `sponsorshipScopes`
- `sponsorSignatureHash`, never the raw signature
- `expectedPayer` and `actualPayer`
- `sponsored` and `sponsorshipAvailable`
- rolling sponsored spend, operation count, and failed-operation count

Casper and EVM fields are isolated. A Casper intent carrying EVM-only Paymaster, gas-price, or priority-fee fields is blocked.

## Deterministic checks

Magen3 evaluates chain binding, numeric validity, gas-limit consistency, fee caps, approved sponsors and Paymasters, sponsorship availability, expiry, scope, evidence hash, payer binding, rolling budget, maximum sponsored operations, and repeated failed sponsored operations. Unavailable evidence follows explicit Warn, Review, or Block policy and never silently passes.

## Security boundary

Never submit sponsor credentials, Paymaster secrets, raw sponsor signatures, signed transactions, private keys, mnemonics, seed phrases, or wallet secrets. The audit trail stores only necessary public evidence and hashes.

## Maturity

The evaluator, Gateway integration, policy controls, audit model, UI, SDKs, MCP schema, and automated tests are complete. Promotion to Live requires a deployed transaction adapter to provide real Casper relayer and/or EVM Paymaster evidence end to end through Railway/PostgreSQL and the deployed frontend.
