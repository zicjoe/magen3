# Oracle Validation Foundation

Oracle Validation compares a price-sensitive intent with a configured, freshness-checked multi-source oracle feed before wallet signing. It is **Foundation Available**, not Live, because Magen3 does not bundle or certify a production oracle provider and does not consume a cryptographically verified on-chain price attestation in the current Gateway.

## Security boundary

Oracle Validation is deterministic. It does not use a language model and does not claim that an operator-supplied feed represents absolute market truth. It verifies that the data presented to Magen3 satisfies the active policy:

- the intent declares a base asset, quote asset, execution price, and quote timestamp;
- a fresh configured feed is available;
- the requested asset pair has fresh observations;
- the minimum number of independent sources is present;
- aggregate confidence meets the policy threshold;
- the spread between sources is within policy;
- the execution quote is fresh;
- the proposed execution price is within the allowed deviation from the median reference price.

A stale or unavailable feed never counts as a pass.

## Intent fields

Price-sensitive actions may include:

```json
{
  "action": {
    "type": "Swap",
    "amount": 10,
    "asset": "CSPR",
    "outputAsset": "USD",
    "target": "contract-package-...",
    "oracle": {
      "baseAsset": "CSPR",
      "quoteAsset": "USD",
      "executionPrice": 0.025,
      "quoteTimestamp": "2026-07-22T15:00:00.000Z"
    }
  }
}
```

`executionPrice` is expressed as quote asset per base asset. When it is absent, Magen3 may derive it from `expectedOutput / amount` if both values are valid and `outputAsset` is supplied.

## Feed format

Configure exactly one source through `ORACLE_VALIDATION_FEED_JSON`, `ORACLE_VALIDATION_FEED_PATH`, or `ORACLE_VALIDATION_FEED_URL`.

```json
{
  "version": "1",
  "source": "Reviewed oracle adapter",
  "generatedAt": "2026-07-22T15:00:00.000Z",
  "observations": [
    {
      "id": "cspr-usd-source-a",
      "baseAsset": "CSPR",
      "quoteAsset": "USD",
      "price": 0.025,
      "confidence": 95,
      "source": "source-a",
      "observedAt": "2026-07-22T15:00:00.000Z"
    }
  ]
}
```

Every production adapter should preserve independent source names. Magen3 compares source identifiers case-insensitively and keeps only the newest fresh observation from each source, so duplicate records from one provider cannot satisfy quorum or skew the median. Deliberately relabelling one provider as several sources remains an operator-integrity failure and must not be treated as genuine diversity.

## Policy controls

Oracle settings are stored under `policy.structuredRules`:

```json
{
  "oracleValidationMode": "Review",
  "oracleValidationMaxAgeSeconds": 120,
  "oracleValidationMaxDeviationBps": 300,
  "oracleValidationMaxSourceSpreadBps": 500,
  "oracleValidationMinConfidence": 70,
  "oracleValidationMinSources": 2,
  "oracleValidationUnavailableAction": "Warn"
}
```

- `Observe` records anomalies without changing authorization.
- `Review` changes policy violations to `Review Required`.
- `Enforce` blocks policy violations.
- `Warn`, `Review`, or `Block` controls behavior when the feed or requested pair is unavailable.

Legacy policies default to Observe-compatible behavior unless Oracle Validation fields are explicitly configured, preserving existing integrations.

## Feed loading and operational status

Optional environment variables:

```env
ORACLE_VALIDATION_FEED_PATH=backend/data/oracle-validation.example.json
ORACLE_VALIDATION_CACHE_TTL_MS=60000
ORACLE_VALIDATION_MAX_FEED_AGE_MS=300000
ORACLE_VALIDATION_REQUEST_TIMEOUT_MS=2500
```

For a remote provider:

```env
ORACLE_VALIDATION_FEED_URL=https://oracle.example/feed.json
ORACLE_VALIDATION_API_KEY=provider-secret
```

The public operational endpoint is:

```http
GET /api/oracle-validation/status
```

It returns sanitized source state, timestamps, observation count, and pair count. It never returns provider credentials or raw observations.

## Synthetic demonstration feed

`backend/data/oracle-validation.example.json` contains synthetic values for controlled testnet demonstrations only. It is not market data. Refresh its timestamps immediately before use:

```bash
pnpm oracle:refresh-example-feed
```

Then configure:

```env
ORACLE_VALIDATION_FEED_PATH=backend/data/oracle-validation.example.json
```

## Decision examples

- **Allowed:** fresh feed, sufficient sources and confidence, and proposed price within policy deviation.
- **Review Required:** policy uses Review mode and the quote is stale, divergent, low-confidence, or outside the deviation limit.
- **Blocked:** policy uses Enforce mode and a required integrity rule fails, or unavailable behavior is configured as Block.
- **Unavailable:** feed cannot be loaded and policy is configured to Warn.

All results are persisted as structured findings, pipeline stages, decision guidance, and audit evidence.

## Current limitations

- No managed provider is bundled or endorsed.
- No cryptographic attestation verification is implemented.
- No automatic on-chain oracle discovery is implemented.
- Exact asset-pair matching is used; inverse or derived pairs are not inferred.
- Oracle Validation does not replace Contract Validation, Execution Simulation, or wallet signing.
- A valid price check does not guarantee the target contract will execute successfully or safely.
