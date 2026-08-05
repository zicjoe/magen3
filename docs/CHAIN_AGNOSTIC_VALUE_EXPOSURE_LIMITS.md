# Chain-Agnostic Value & Exposure Limits

Milestone 14 adds deterministic limit denominations and cumulative exposure controls without changing the public Gateway route.

## Policy model

New policies store configuration additively under `structuredRules.valueExposure`:

- `limitBasis`: `Fiat Value` or `Network Native Asset`
- `referenceCurrency`: currently `USD`
- `automaticLimit`, `reviewLimit`, `maximumTransactionLimit`
- `hourlyLimit`, `dailyLimit`, `perDestinationLimit`
- `walletPercentageLimit`
- `assetOverrides`, `networkAssetRegistry`, `stablecoinPeg`
- `maxPriceAgeSeconds`

Existing policies without an explicit basis remain `Legacy Native Amount`. Their values are not converted to fiat or to another network asset. The historical Casper UI meaning remains CSPR for Casper-native actions; non-native assets are not silently reinterpreted.

## Intent evidence

Value-bearing actions should include exact `executionNetwork`, `asset`, `assetContractAddress` where relevant, `assetDecimals`, and fresh `valueEvidence`. Percentage policies additionally require `walletBalanceEvidence`.

Magen3 verifies asset/network binding, timestamp freshness, source disagreement, stablecoin peg deviation, configured thresholds, and cumulative exposure. Missing or stale price evidence returns `Review Required` and keeps execution unapproved.

## Exposure accounting

Submitted, pending, uncertain, replaced, confirmed, finalized, and delivered records reserve exposure. Failed, reverted, dropped, cancelled, and refunded records do not. Exposure is scoped to the agent and execution wallet and may additionally be scoped to asset and destination.
