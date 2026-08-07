# Production Compliance Provider — Milestone 27

Milestone 27 upgrades the existing Compliance Controls foundation with request-scoped production provider evidence while preserving Magen3's deterministic authorization model.

## Architecture

External providers supply evidence only. Magen3 validates and normalizes that evidence, checks provenance/freshness/confidence, applies the active policy, sends findings into the existing Risk Assessment path, and persists bounded sanitized evidence. Provider claims are not legal conclusions and never directly authorize execution.

The first provider adapter is `ofac_api`, backed by the fixed server-controlled origin `https://api.ofac-api.com` and the v4 `/screen` endpoint. The adapter supports blockchain-address/contract identifier screening using `cryptoId`; API credentials are supplied only by backend environment configuration. Request-controlled provider URLs and credentials are not accepted.

## Subjects

Request-scoped subject collection currently covers supported execution wallets, recipients/contracts, token contracts, bridge recipients, and x402 recipients when those identifiers are present in the normalized protected intent. Natural-person names, identity documents, biometrics, contact details, and similar raw PII remain rejected by the Gateway compliance boundary.

## Evidence model

Normalized provider evidence includes provider/version, canonical subject and role, subject type, chain family/id, risk categories, provider severity/confidence, provider claim, source references, evidence timestamps/expiry, cache state, manual-review state, false-positive state, provider verdict, and a SHA-256 evidence hash. Raw provider responses are not persisted in decision contexts or exposed by status APIs.

## Deterministic policy controls

Additive structured-rule controls include:

- `complianceProviderRequired`
- `complianceProviderUnavailableAction` (`Warn`, `Review`, `Block`)
- `complianceProviderDisagreementAction`
- `complianceAllowedProviders`
- `complianceBlockedCategories`
- `complianceReviewCategories`
- `complianceMinimumProviderConfidence`
- `complianceMaxProviderEvidenceAgeSeconds`
- `complianceManualReviewRequired`
- `complianceFalsePositiveOverrides` (authorized evidence-hash overrides)

Existing Compliance Controls rules and external/operator-feed evidence remain backward compatible.

## Security

The provider layer uses fixed origins, bounded responses, HTTPS, timeouts, AbortController cancellation, bounded retries/backoff, rate limiting, cache isolation by provider/chain/subject, circuit breaking, malformed-response rejection, secret redaction, and explicit unsupported/unavailable/authentication states. Empty provider evidence is never interpreted as a successful clean check when provider evidence is required.

## SDK, MCP, and frontend

- JavaScript: `client.getComplianceControlsStatus()`
- Python: `client.get_compliance_controls_status()`
- MCP: `magen3_get_compliance_controls_status`
- Integration Health displays sanitized provider configuration/health/disagreement.

The capability is labeled **Preview** until a deployment performs a genuine live credentialed OFAC-API call. Mock and integration tests do not count as live verification.

## Privacy and Casper proofs

Provider credentials, raw provider payloads, raw personal identity data, and unnecessary operational metadata are never written into Casper decision proofs. Audits receive bounded normalized findings/evidence hashes through the existing off-chain audit model.

## Roadmap boundary

Milestone 27 does **not** implement continuous rescreening, monitoring jobs, compliance-change alerts, automatic reaction to future provider-status changes, or Continuous Risk Monitoring. Those responsibilities remain Milestone 28.
