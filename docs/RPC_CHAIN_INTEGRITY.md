# RPC & Chain Integrity

## Status

**Foundation Available** under **Agent Shield → Execution Integrity → RPC & Chain Integrity**.

The deterministic evaluator, policy configuration, structured findings, audit evidence, SDK/MCP contracts, Playground scenarios, memory/PostgreSQL behavior, and automated tests are implemented. Promotion to **Live** requires deployed trusted RPC adapters that collect real provider observations and complete end-to-end verification against the configured Casper network and failover path.

## Purpose

RPC & Chain Integrity prevents authorization from silently relying on stale, inconsistent, wrong-network, speculative, or unapproved chain data.

The control answers:

> Is the unsigned intent being evaluated against fresh, approved, mutually consistent chain evidence for the exact expected network?

It does not certify an RPC operator, guarantee canonical chain truth, or replace transaction finality and settlement reconciliation.

## Request metadata

Trusted adapters may attach `action.rpcIntegrity`:

```json
{
  "expectedChainName": "casper-test",
  "expectedNetworkIdentifier": "casper-testnet",
  "expectedGenesisHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "selectedEndpoint": "https://node.testnet.casper.network/rpc",
  "selectedProviderId": "casper-testnet-primary",
  "providerObservations": [
    {
      "providerId": "casper-testnet-primary",
      "endpoint": "https://node.testnet.casper.network/rpc",
      "chainName": "casper-test",
      "networkIdentifier": "casper-testnet",
      "genesisHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "tls": true,
      "synced": true,
      "latestBlockHeight": 125000,
      "latestBlockTimestamp": "2026-07-25T00:00:00.000Z",
      "responseTimestamp": "2026-07-25T00:00:05.000Z",
      "timedOut": false,
      "rateLimited": false,
      "speculative": false,
      "transactionStatusHash": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "contractStateHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
  ],
  "automaticFailoverUsed": false,
  "failoverFrom": "",
  "failoverReason": ""
}
```

Provider observations are public technical evidence. Do not send RPC credentials, private provider URLs, private keys, signed transactions, wallet signatures, or secret application payloads.

## Deterministic checks

- Expected chain name, network identifier, and optional genesis or chain fingerprint.
- Exact approved provider ID or RPC endpoint.
- TLS requirement.
- Provider synchronization state.
- Latest-block freshness.
- Block-height regression against prior audited evidence for the same provider.
- Minimum usable-provider quorum.
- Cross-provider chain-identity agreement.
- Maximum block-height spread.
- Transaction-status consistency when hashes are supplied.
- Contract-state consistency when hashes are supplied.
- Speculative endpoint isolation.
- Timeout and rate-limit handling.
- Authorized and auditable automatic failover.

Wrong-network evidence, malformed identity evidence, block-height regression, or selecting a speculative endpoint for execution fails closed. Other violations follow the configured mode and Warn, Review, or Block action.

## Policy fields

```json
{
  "rpcIntegrityEnabled": true,
  "rpcIntegrityMode": "Review",
  "approvedRpcEndpoints": [
    "https://node.testnet.casper.network/rpc|casper-testnet-primary|casper-test|casper-testnet|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ],
  "rpcIntegrityRequireTls": true,
  "rpcIntegrityMaximumBlockAgeSeconds": 120,
  "rpcIntegrityMinimumProviders": 1,
  "rpcIntegrityMaximumHeightDifference": 5,
  "rpcIntegrityDisagreementAction": "Block",
  "rpcIntegrityUnavailableAction": "Review",
  "rpcIntegrityRequireNetworkIdentity": true,
  "rpcIntegrityAllowAutomaticFailover": false
}
```

Approved providers may also be represented as objects with `id`, `endpoint`, `chainName`, `networkIdentifier`, and `genesisHash`.

## Outcomes

- **Allowed** when applicable evidence passes or produces only non-blocking warnings.
- **Review Required** when review-mode or unavailable-evidence policy triggers.
- **Blocked** for hard network-integrity failures or fail-closed policy violations.

Blocked retains precedence over Review Required.

## Audit evidence

Audit records may contain:

- Expected chain identity.
- Selected provider and endpoint.
- Sanitized provider observations.
- Freshness and provider count.
- Provider agreement result.
- Automatic failover state and reason.
- Structured findings and remediation.
- Final decision and Casper decision proof state.

Unavailable evidence never counts as a pass.

## Playground scenarios

- Approved fresh provider.
- Stale provider.
- Wrong-network provider.
- Provider timeout or unavailable evidence.

Enable and configure the control in the active policy before using these examples.

## Status endpoint

```text
GET /api/rpc-chain-integrity/status
```

The endpoint reports control maturity, supported evidence, and its security boundary. It does not expose provider credentials.

## Live criteria

Promotion from Foundation Available to Live requires:

1. A deployed trusted adapter queries real approved RPC providers.
2. Network identity is verified against the configured Casper environment.
3. Freshness, timeout, disagreement, and failover behavior are tested end to end.
4. Provider evidence affects authorization in Railway/PostgreSQL mode.
5. Audit evidence and the final decision proof are verified in the deployed application.
