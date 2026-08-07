# Threat Intelligence Foundation

Threat Intelligence screens normalized Casper wallet and contract identifiers before wallet signing. It is **Foundation Available**, not Live, because Magen3 does not bundle an external reputation provider and cannot guarantee the provenance, completeness, or accuracy of an operator-supplied feed.

## Current security boundary

The module performs deterministic exact matching for identifiers already present in an intent:

- Ed25519 or Secp256k1 Casper public keys
- `account-hash-...` identifiers
- Contract Hashes
- Contract Package Hashes

It does not:

- derive an account hash from a submitted public key
- infer related wallets or ownership
- equate Contract Hashes with Package Hashes
- inspect bytecode or contract upgrade authority
- discover phishing infrastructure
- claim that a no-match target is safe
- use a language model to authorize execution

Wallet and contract structure is normalized by the existing live Wallet Validation and Contract Validation modules. Invalid identities are skipped by Threat Intelligence and remain subject to those modules' deterministic failures.

## Feed sources

Configure exactly one source. Precedence is inline JSON, local file, then remote URL.

### Inline JSON

```env
THREAT_INTELLIGENCE_FEED_JSON={"version":"1","source":"Reviewed feed","generatedAt":"2026-07-22T12:00:00.000Z","indicators":[]}
```

This is normally the simplest Railway option because the JSON can be stored as a protected environment variable.

### Local or mounted file

```env
THREAT_INTELLIGENCE_FEED_PATH=/secure/config/threat-feed.json
```

The repository includes `backend/data/threat-intelligence.example.json` for a controlled testnet demonstration. Its indicators are synthetic and are not production intelligence.

### Remote HTTPS feed

```env
THREAT_INTELLIGENCE_FEED_URL=https://security.example/threat-feed.json
THREAT_INTELLIGENCE_API_KEY=provider-secret
```

The optional API key is sent as a Bearer credential. Redirects are rejected, production URLs must use HTTPS, the response is size-limited, and the key is never exposed through health, status, decision, or audit responses.

## Feed schema

```json
{
  "version": "1",
  "source": "Reviewed Casper intelligence",
  "generatedAt": "2026-07-22T12:00:00.000Z",
  "indicators": [
    {
      "id": "indicator-001",
      "value": "01...",
      "severity": "high",
      "confidence": 95,
      "categories": ["phishing"],
      "label": "Reviewed phishing destination",
      "description": "Provider-reviewed evidence summary.",
      "source": "Internal Security Team",
      "firstSeenAt": "2026-07-20T08:00:00.000Z",
      "lastSeenAt": "2026-07-22T11:30:00.000Z",
      "expiresAt": "2026-08-22T00:00:00.000Z",
      "references": ["https://security.example/case/001"]
    }
  ]
}
```

### Required feed fields

- `generatedAt`: valid ISO timestamp. Missing or invalid timestamps make the feed stale rather than implicitly fresh.
- `indicators`: array. Invalid identifiers are discarded.

### Indicator fields

- `value`: supported wallet, account-hash, Contract Hash, or Package Hash identifier.
- `severity`: `info`, `low`, `medium`, `high`, or `critical`; invalid values normalize to `medium`.
- `confidence`: number from `0` to `100`; invalid values normalize to `50`.
- `identifierType`: optional `Contract Hash` or `Package Hash` hint for ambiguous raw or `hash-...` identifiers.
- `expiresAt`: optional expiry. Expired records are ignored during evaluation.
- Other metadata is optional and is used only for evidence and remediation.

Duplicate canonical identifiers are deduplicated. Magen3 retains the higher-severity record; when severity is equal, it retains the higher-confidence record.

## Freshness and cache

```env
THREAT_INTELLIGENCE_CACHE_TTL_MS=300000
THREAT_INTELLIGENCE_MAX_AGE_MS=86400000
THREAT_INTELLIGENCE_REQUEST_TIMEOUT_MS=2500
```

- Cache TTL defaults to five minutes.
- Maximum feed age defaults to 24 hours.
- A source timestamp more than five minutes in the future is treated as stale.
- Remote timeout defaults to 2.5 seconds.
- A stale or unavailable feed never produces a pass.
- The health endpoint returns sanitized status only.

Inspect status:

```bash
curl https://YOUR_API_HOST/api/threat-intelligence/status
```

## Policy controls

Threat Intelligence settings are stored under `policy.structuredRules`:

```json
{
  "threatIntelligenceMode": "Review",
  "threatIntelligenceMinConfidence": 70,
  "threatIntelligenceUnavailableAction": "Warn"
}
```

### Modes

| Mode | High or critical match | Medium match | Low or info match |
| --- | --- | --- | --- |
| `Observe` | Warning; decision unchanged | Warning; decision unchanged | Warning; decision unchanged |
| `Review` | Review Required | Review Required | Warning; decision unchanged |
| `Enforce` | Blocked | Review Required | Warning; decision unchanged |

A match below `threatIntelligenceMinConfidence` remains visible as a warning but is not enforced.

### Feed unavailable behavior

| Setting | Result when feed is stale or unavailable |
| --- | --- |
| `Warn` | Records `unavailable`; does not change authorization. |
| `Review` | Returns Review Required unless another module blocks. |
| `Block` | Returns Blocked. Use only when the operational feed is reliable enough for fail-closed behavior. |

Legacy policies without these fields default to `Observe`, a 70% threshold, and `Warn`, preserving existing integrations.

## Gateway response

The normal `result.moduleFindings` includes Threat Intelligence findings. The result also includes a sanitized context:

```json
{
  "threatIntelligenceContext": {
    "status": "available",
    "sourceType": "remote",
    "sourceName": "Reviewed Casper intelligence",
    "generatedAt": "2026-07-22T12:00:00.000Z",
    "indicatorCount": 182,
    "activeIndicatorCount": 176,
    "mode": "Review",
    "unavailableAction": "Warn",
    "minConfidence": 70,
    "checkedEntities": [
      { "role": "target", "kind": "ed25519-public-key", "canonical": "wallet:01..." }
    ],
    "matchedIndicators": []
  }
}
```

The API never returns the configured provider credential. Internal file paths, raw remote feed URLs, and raw loader errors are sanitized before public exposure. `indicatorCount` reports feed records; `activeIndicatorCount` excludes expired records at evaluation time.

## Audit and Security Pipeline

Each applicable request records:

1. Threat Intelligence applicability
2. Feed availability and freshness
3. Exact indicator match result
4. Evidence and remediation
5. Threat Intelligence pipeline stage
6. Final deterministic decision

An unavailable module stage is shown as a warning, not as completed protection.

## Intent Playground

The Playground includes a synthetic exact-match example. To use it:

1. Configure `backend/data/threat-intelligence.example.json` as the local feed.
2. Ensure its `generatedAt` remains within the configured maximum age.
3. Select the `Threat intelligence feed match` example.
4. Use a policy in Review or Enforce mode.
5. Submit and inspect the structured indicator evidence and audit record.

Do not present the synthetic record as a real malicious wallet or contract.

## Production checklist

- Review the legal basis and permitted use of the intelligence source.
- Verify feed provenance, timestamp semantics, and update frequency.
- Keep provider credentials in Railway or another secret manager.
- Begin with `Observe` or `Review` before using `Enforce`.
- Use `Warn` or `Review` for feed outages until availability is proven.
- Monitor false positives and expired indicators.
- Keep the feed under the one-megabyte and 10,000-indicator safety limits.
- Treat a no-match result as absence of a configured exact indicator, not proof of safety.

## Milestone 25 production provider upgrade

See `docs/PRODUCTION_THREAT_INTELLIGENCE.md` for the provider registry, GoPlus EVM address-security adapter, normalized evidence model, provider disagreement/availability semantics, cache isolation, policy controls, and roadmap boundary. The original operator-configured feed remains supported for backward compatibility.
