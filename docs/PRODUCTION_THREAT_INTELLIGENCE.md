# Production Threat Intelligence

Milestone 25 upgrades Magen3 Threat Intelligence from an operator-feed foundation to a provider-adapter architecture. External providers supply evidence only; deterministic Magen3 policy and the existing Risk Assessment Engine determine Allowed, Review Required, or Blocked.

## Provider architecture

The provider registry exposes capability metadata and uses server-controlled origins, bounded responses, timeouts, bounded retries, rate limiting, per-subject caching, circuit breaking, evidence expiry, normalized provider states, and safe degradation. Request payloads cannot choose provider URLs.

The first production adapter is GoPlus Address Security for EVM addresses. Its server-controlled endpoint is `https://api.gopluslabs.io/api/v1/address_security/{address}` with an explicit chain ID. Enable it with `THREAT_INTELLIGENCE_GOPLUS_ENABLED=true` or include `goplus` in `THREAT_INTELLIGENCE_PROVIDERS`. `GOPLUS_API_KEY` is optional where provider access permits anonymous calls.

## Subjects and evidence

Magen3 can normalize chain-aware wallets, contracts, token/asset contracts, payment recipients, bridge counterparties, routers, domains, URL origins, RPC hosts, protocols, and resource providers. Unsupported provider/subject combinations remain explicitly Unsupported rather than being treated as clean.

Normalized evidence records provider/version, subject/type, chain family and chain ID, indicator categories, severity, confidence, provider verdict, evidence/retrieval timestamps, expiry, evidence hash, provider reference, cache state, and normalization status. Raw provider payloads and credentials are not written to audits or Casper proofs.

## Policy controls

Policies can require Threat Intelligence, restrict allowed providers, set minimum confidence and maximum evidence age, define blocked/review categories, choose actions for provider unavailability, disagreement or unknown subjects, require a provider quorum, disable cached evidence, and configure explicit false-positive overrides. Successful provider evidence cannot override a blocking finding from another Agent Shield module.

## Security

The implementation rejects request-controlled provider URLs, isolates cache entries by provider/chain/subject, bounds JSON responses, uses abortable timeouts, rate limits calls, opens a circuit after repeated failures, redacts secrets, and never interprets provider failure as no-risk evidence.

## Status and limitations

The legacy operator feed remains backward compatible. GoPlus EVM address screening is implemented and mock/integration tested against its documented response contract. A real external GoPlus request is not claimed unless a deployment actually performs one. Non-EVM subjects are retained as typed extension points and are explicitly Unsupported by GoPlus where applicable.

## Roadmap boundary

Milestone 25 does not implement Production Oracle Integration, Production Compliance Provider, or Continuous Risk Monitoring. Those remain Milestones 26–28.
