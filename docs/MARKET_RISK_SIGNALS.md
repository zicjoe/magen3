# Market Risk Signals

Milestone 21 adds deterministic, freshness-checked market-risk evidence to the protected-intent pipeline under **Agent Shield → Market & Oracle Integrity → Market Risk Signals**.

The capability is **Foundation Available**. Magen3 can consume a bounded operator-configured inline, local-file, or HTTPS JSON feed and evaluate it before wallet signing. Magen3 does not bundle, certify, or claim live connectivity to a production market-data provider.

## Purpose

A transaction can be technically valid, route-bound, and successfully simulated while market conditions are still unsafe. Market Risk Signals evaluates provider evidence for the exact protected pair and, where supplied, the network, venue, and pool.

Supported signal categories are:

- volatility;
- bid-ask or route spread;
- market price deviation;
- oracle-to-market divergence;
- stablecoin peg deviation;
- liquidity coverage relative to the quoted trade;
- pool imbalance;
- recent liquidity loss;
- recent volume deterioration;
- provider-produced manipulation indicators;
- evidence freshness, source quorum, confidence, and provider disagreement.

Missing evidence is represented as `unavailable`; it is never converted into a verified zero value.

## Security boundary

The Gateway accepts only pair and route selectors from the agent:

```json
{
  "action": {
    "type": "Swap",
    "asset": "USDC",
    "outputAsset": "DAI",
    "marketRisk": {
      "baseAsset": "USDC",
      "quoteAsset": "DAI",
      "baseCanonicalId": "evm:84532:fungible_token:0x...",
      "quoteCanonicalId": "evm:84532:fungible_token:0x...",
      "chainFamily": "EVM",
      "network": "base-sepolia",
      "venue": "approved-aggregator",
      "poolId": "pool-1"
    }
  }
}
```

Agents, SDKs, and MCP tools must not submit their own volatility, liquidity, spread, depeg, or manipulation scores. Those metrics come from the server-controlled configured feed.

The module is deterministic and does not use an LLM for authorization.

## Feed configuration

Configure exactly one source:

```env
MARKET_RISK_SIGNALS_FEED_JSON=
MARKET_RISK_SIGNALS_FEED_PATH=
MARKET_RISK_SIGNALS_FEED_URL=
MARKET_RISK_SIGNALS_API_KEY=
MARKET_RISK_SIGNALS_CACHE_TTL_MS=60000
MARKET_RISK_SIGNALS_MAX_FEED_AGE_MS=300000
MARKET_RISK_SIGNALS_REQUEST_TIMEOUT_MS=2500
```

Remote feeds must use HTTPS in production. Agent requests cannot supply a feed URL or provider credentials.

The operational endpoint is:

```http
GET /api/market-risk-signals/status
```

It returns sanitized availability, source classification, timestamps, observation count, and pair count. It does not return raw observations or credentials.

## Feed schema

```json
{
  "version": "1",
  "source": "Reviewed market-data adapter",
  "generatedAt": "2026-08-06T10:30:00.000Z",
  "observations": [
    {
      "id": "usdc-dai-source-a",
      "baseAsset": "USDC",
      "quoteAsset": "DAI",
      "baseCanonicalId": "evm:84532:fungible_token:0x...",
      "quoteCanonicalId": "evm:84532:fungible_token:0x...",
      "chainFamily": "EVM",
      "network": "base-sepolia",
      "venue": "approved-aggregator",
      "poolId": "pool-1",
      "inputAmount": "10",
      "quoteId": "quote-123",
      "routeFingerprint": "optional-milestone-20-route-fingerprint",
      "source": "provider-a",
      "confidence": 92,
      "observedAt": "2026-08-06T10:30:00.000Z",
      "volatilityBps": 45,
      "spreadBps": 12,
      "priceDeviationBps": 18,
      "oracleDivergenceBps": 20,
      "stablecoinDepegBps": 8,
      "liquidityCoverageBps": 45000,
      "poolImbalanceBps": 600,
      "liquidityLossBps": 200,
      "volumeDropBps": 300,
      "manipulationScore": 8,
      "evidenceReference": "opaque-provider-reference"
    }
  ]
}
```

Basis-point metrics are non-negative integers. `manipulationScore` is an integer from 0–100. Magen3 retains only bounded normalized evidence.

`liquidityCoverageBps` is accepted only from observations whose decimal-string `inputAmount` exactly matches the protected amount. It describes available executable depth relative to that exact amount: `10000` means one times the protected amount, `20000` means two times, and so on. The provider adapter is responsible for binding that metric to the quoted amount and route.

## Policy configuration

```json
{
  "structuredRules": {
    "marketRiskSignals": {
      "enabled": true,
      "required": true,
      "maxEvidenceAgeSeconds": 120,
      "minSources": 2,
      "minConfidence": 70,
      "maxProviderDisagreementBps": 500,
      "maxVolatilityBps": 1500,
      "maxSpreadBps": 300,
      "maxPriceDeviationBps": 500,
      "maxOracleDivergenceBps": 500,
      "maxStablecoinDepegBps": 300,
      "minLiquidityCoverageBps": 10000,
      "maxPoolImbalanceBps": 3000,
      "maxLiquidityLossBps": 3000,
      "maxVolumeDropBps": 5000,
      "maxManipulationScore": 70,
      "requiredSignals": ["volatilityBps", "spreadBps", "liquidityCoverageBps"],
      "unavailableAction": "block",
      "missingEvidenceAction": "review",
      "providerDisagreementAction": "review",
      "volatilityAction": "review",
      "spreadAction": "review",
      "deviationAction": "review",
      "depegAction": "block",
      "liquidityAction": "review",
      "imbalanceAction": "review",
      "manipulationAction": "block"
    }
  }
}
```

Supported actions are `allow`, `warn`, `review`, and `block`. Legacy policies remain unchanged because the module is disabled unless `enabled` or `required` is set.

## Evidence selection and aggregation

Magen3:

1. derives the protected base/output pair from canonical asset identities where available, otherwise normalized asset references;
2. narrows evidence by chain family, network, venue, pool, exact input amount, quote ID, and route fingerprint when those bindings are supplied;
3. rejects stale and future-skewed observations;
4. keeps only the newest observation from each case-insensitive source identifier;
5. computes a deterministic median for each available signal;
6. records source count, confidence, minimum, maximum, and provider disagreement;
7. hashes the exact requested context, evidence, timestamps, sources, and policy into a stable evidence fingerprint.

One provider cannot satisfy a multi-source quorum by duplicating observations under the same source name.

## Decision semantics

Market Risk Signals submits normal Agent Shield findings to the existing Risk Assessment Engine.

- **Allowed** may occur when all required evidence is fresh and within policy and no other module blocks or reviews the action.
- **Blocked** may occur for configured hard conditions such as severe depeg, manipulation evidence, unavailable required feeds, or another existing module.
- **Review Required** may occur for incomplete evidence, low confidence, provider disagreement, volatility, poor liquidity coverage, excessive spread, divergence, or imbalance according to policy.

A passing market-risk result never overrides Authentication, Asset Identity, Asset Contract Risk, Value & Exposure Limits, Stateful Simulation, MEV & Execution Quality, Trading Route Integrity, or any other blocking module.

## Audit, SDK, and MCP

The audit record and Gateway response include `marketRiskSignalsContext` / `marketRiskSignals` with:

- requested pair and route selectors;
- sanitized feed status;
- source count and aggregate confidence;
- per-signal value, source count, disagreement, and completeness;
- evidence fingerprint;
- policy thresholds;
- final module status.

The TypeScript SDK includes `Magen3MarketRiskRequest` and `Magen3MarketRiskSignalsContext`. The Python SDK passes the additive `action.marketRisk` object and response context through unchanged. MCP guidance explicitly prohibits inventing market metrics.

## Synthetic demonstration feed

`backend/data/market-risk-signals.example.json` is synthetic and intended only for controlled testnet/local demonstrations. It is not real market data.

Refresh its timestamps before a demonstration:

```bash
pnpm market-risk:refresh-example-feed
```

Then configure:

```env
MARKET_RISK_SIGNALS_FEED_PATH=backend/data/market-risk-signals.example.json
```

## Relationship to adjacent milestones

- Milestone 15 supplies simulation state and predicted output.
- Milestone 16 supplies canonical asset identity.
- Milestone 19 evaluates quote freshness, slippage, simulation deviation, and execution channel.
- Milestone 20 verifies the exact route and payload.
- Milestone 21 evaluates external market-condition evidence for that pair and route.
- Milestone 26 remains responsible for production-grade oracle adapters, feed mapping, confidence intervals, round identifiers, and fallback/provider-disagreement infrastructure.

## Current limitations

- No production market-data provider is bundled, certified, or live-tested.
- No cryptographic provider attestation is verified.
- No managed WebSocket or streaming feed is implemented.
- No automatic on-chain pool discovery or pool-state reader is implemented.
- No real-time mempool or transaction-order analysis is implemented.
- No market conditions are guaranteed to remain unchanged after evaluation.
- Passing signals do not guarantee execution, settlement, delivery, price, liquidity, or final inclusion-block quality.

## Roadmap boundary

Milestone 22 — Real Bridge Provider Integration and Milestones 23–28 were not implemented in this release. No bridge provider, x402 settlement provider, production threat-intelligence provider, production oracle provider, compliance provider, or continuous background monitoring loop was added.
