# Real Stateful Execution Simulation

Milestone 15 adds a provider-backed, pre-signing simulation stage under Agent Shield → Execution Integrity.

## Current truthful support

| Chain family | Adapter | Capability | Status |
|---|---|---|---|
| EVM | configured trusted JSON-RPC | `eth_chainId`, block-pinned `eth_call`, `eth_estimateGas` | Foundation Available |
| Casper | none in this release | no fabricated speculative-execution RPC | Unsupported |
| Other families | adapter extension point | explicit unsupported result | Planned |

The EVM provider URL is controlled only by server environment variables. Requests cannot submit custom RPC URLs. Use testnets unless mainnet is explicitly approved.

## Evidence and binding

The adapter canonicalizes the exact unsigned payload, hashes it with stable key ordering, binds it to chain identity and pinned block context, and records a versioned result hash. Network mismatch, expiry, mutation, stale evidence, revert, timeout, and unsupported capability remain distinct statuses. Empty evidence arrays are not used to imply that unsupported tracing found nothing.

The basic EVM adapter observes execution success/revert, runtime return bytes, gas estimate, chain ID, block number, block hash, and provider timestamp. Balance deltas, token deltas, allowances, events, traces, and storage diffs are explicitly marked unsupported until a trusted adapter can supply them.

## Policy

Optional structured policy fields:

- `statefulSimulationRequired`
- `statefulSimulationUnavailableAction`: `Warn`, `Review`, or `Block`
- `statefulSimulationMaximumAgeSeconds`

Legacy policies remain compatible and do not require simulation by default. Required missing evidence fails according to policy. A successful simulation never overrides another blocking module.

## Security

Provider configuration is server-side, HTTPS-only outside tests, bounded by timeout and response-size limits, sanitized, and never persisted with credentials. Payload values use canonical hexadecimal quantities; unsafe or fractional JavaScript numbers are rejected by canonicalization.

## Relationship to other milestones

Simulation predicts one exact payload before signing. Milestone 12 evaluates fee limits, Milestone 13 observes real submission and settlement, and Milestone 14 evaluates value/exposure. Milestones 16–28 remain future work; the evidence model provides typed chain, asset, counterparty, freshness, block, payload-hash, and capability extension points without implementing those systems.
