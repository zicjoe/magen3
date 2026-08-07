# Production Oracle Integration

Milestone 26 upgrades the existing Oracle Validation foundation into a production-oriented provider architecture. Oracle providers supply bounded price evidence; Magen3 validates and normalizes that evidence and the existing deterministic policy/Risk Assessment pipeline remains the only authorization authority.

## Provider architecture

The first provider-backed adapter is **Pyth Network Hermes**. The backend origin is fixed to `https://hermes.pyth.network`; agent requests cannot supply or override provider URLs. Feed identifiers are mapped server-side with `ORACLE_PYTH_FEED_MAP_JSON`, using canonical asset identity and/or explicit pair keys. A response is rejected if the returned feed identifier does not exactly match the configured mapping.

The provider runtime includes bounded response handling, timeout/cancellation, bounded retry/backoff, per-provider rate limiting, cache isolation by provider + canonical asset + pair + feed ID, provider health, and circuit breaking. Unsupported mappings, unavailable providers, timeouts, malformed responses, rate limiting, and degraded circuits remain explicit states.

## Decimal and evidence safety

Production provider prices use canonical decimal strings and `BigInt`-backed scaled arithmetic for normalization, median, source spread, and execution-price deviation. JavaScript floating-point arithmetic is not used to make price-limit decisions. Legacy numeric fields remain exposed for backward-compatible display only.

Normalized provider evidence includes provider and version, canonical asset ID, pair/reference currency, feed identifier, raw price, normalized price, exponent, confidence interval, update/retrieval timestamps, evidence age, provider reference, cache/fallback flags, normalization status, and a deterministic evidence hash. Raw provider payloads are not persisted in audit context or Casper proofs.

## Policy controls

Existing Oracle Validation controls remain compatible. Additive structured rules include:

- `oracleValidationProviderRequired`
- `oracleValidationAllowedProviders`
- `oracleValidationProviderUnavailableAction`
- `oracleValidationProviderDisagreementAction`
- `oracleValidationFallbackAllowed`
- `oracleValidationRequiredReferenceCurrency`
- `oracleValidationStablecoinAssets`
- `oracleValidationStablecoinPegMinBps`
- `oracleValidationStablecoinPegMaxBps`

The existing max age, execution deviation, source spread, confidence, source quorum, mode, and unavailable-action controls still apply. Provider success never overrides a block from any other protection module.

## Legacy/operator feeds

Inline and local operator feeds remain supported for backward compatibility. Remote operator feeds remain optional, but production deployments must explicitly list their hostname in `ORACLE_VALIDATION_ALLOWED_FEED_HOSTS`; credentials in URLs and private/local production destinations are rejected. This reduces SSRF and feed-substitution risk while allowing controlled migration from the old foundation.

## SDK, MCP, frontend and audits

`GET /api/oracle-validation/status` now returns sanitized provider capabilities and health. JavaScript and Python SDKs expose dedicated Oracle status methods. MCP adds `magen3_get_oracle_validation_status`. The frontend Integration Health surface shows configured providers, provider health, and explicit request-scoped provider states, and labels Pyth provider support as Preview until a genuine live request is verified in the deployment environment.

Provider evidence is attached to the existing Oracle Validation context in bounded/sanitized form so normal audit persistence receives evidence hashes and provenance. Casper continues to receive only the existing privacy-preserving decision/audit commitment material, not raw oracle responses or operational data.

## Environment variables

```env
ORACLE_PROVIDERS=pyth_hermes
ORACLE_PYTH_ENABLED=true
ORACLE_PYTH_FEED_MAP_JSON={"ETH/USD":"<64-hex-pyth-feed-id>"}
ORACLE_PROVIDER_TIMEOUT_MS=2500
ORACLE_PROVIDER_MAX_RETRIES=1
ORACLE_PROVIDER_CACHE_TTL_MS=15000
ORACLE_PROVIDER_RATE_LIMIT_PER_MINUTE=120
ORACLE_PROVIDER_MAX_RESPONSE_BYTES=524288
ORACLE_PROVIDER_CIRCUIT_FAILURE_THRESHOLD=4
ORACLE_PROVIDER_CIRCUIT_OPEN_MS=30000
```

Legacy remote feeds additionally require `ORACLE_VALIDATION_ALLOWED_FEED_HOSTS` in production.

## Capability status

The architecture and real Pyth Hermes HTTP adapter are implemented and mock-tested against provider-shaped fixtures. A genuine live Pyth request was **not** performed in the implementation environment, so provider-backed Oracle Integration must remain **Preview**, not Live, until deployment verifies a real call with an actual configured feed ID. The operator-feed Oracle foundation remains available for controlled demonstrations.

## Roadmap boundary

Milestone 26 does **not** implement compliance-provider screening, continuous oracle monitoring, background stale-feed alerts, continuous price monitoring, or threat/compliance monitoring. Those remain Milestones 27 and 28.
