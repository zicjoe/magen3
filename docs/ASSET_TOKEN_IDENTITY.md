# Asset & Token Identity

Milestone 16 adds deterministic, chain-aware asset identity to the protected-intent pipeline.

## What it does

Magen3 now resolves each referenced asset using the strongest available tuple: chain family, network or chain ID, asset type, and contract/mint/native identifier. Symbols and display names remain metadata and are never treated as globally unique identifiers.

Canonical IDs use this versioned shape:

`<chain-family>:<chain-id-or-network>:<asset-type>:<identifier>`

Examples:

- `evm:84532:native:native`
- `evm:84532:fungible_token:0x...`
- `casper:casper-test:native:native`

## Evidence

The audit context records canonical ID, chain family, network, chain ID, native/token classification, contract or mint identifier, token standard, symbol, decimals, metadata source, provenance, verification status, confidence, registry match, conflicts, and a deterministic identity hash.

## Policy

Optional `structuredRules.assetIdentity` fields:

- `required`
- `unresolvedAction`: `allow`, `warn`, `review`, or `block`
- `metadataConflictAction`
- `requireVerifiedMetadata`
- `allowedCanonicalIds`
- `blockedCanonicalIds`
- `registry`

Legacy policies remain valid. Unresolved token symbols are not silently converted into trusted identities.

## Boundaries

This milestone does not determine whether a token contract is safe. Proxy risk, mint authority, blacklists, transfer taxes, honeypots, bytecode reputation, and historical exploit evidence remain Milestone 17.

Stateful Simulation observes asset effects. Asset & Token Identity names the assets. Value & Exposure Limits consume the canonical identity. Casper decision proofs continue to contain privacy-preserving commitments rather than raw asset metadata.
