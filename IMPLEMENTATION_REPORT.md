# Magen3 Threat Intelligence Foundation — Implementation Report

**Release:** 1.2.0  
**Date:** 2026-07-22  
**Module status:** Foundation Available

## Summary

This release upgrades Threat Intelligence from Preview to Foundation Available. Magen3 can now screen normalized Casper wallet and contract identifiers against an operator-configured, freshness-checked JSON feed before wallet signing. The implementation is deterministic, policy-controlled, auditable, and backward compatible.

Threat Intelligence is not marked Live because no external reputation provider is bundled and Magen3 cannot guarantee the provenance, completeness, availability, or accuracy of an operator-supplied feed. A no-match result means only that the configured exact-match feed did not contain the submitted normalized identifier.

## Implemented behavior

### Supported identities

- Casper Ed25519 public keys
- Casper Secp256k1 public keys
- `account-hash-...` identifiers
- Contract Hashes
- Contract Package Hashes

The module evaluates the execution wallet and target when they can be normalized by the existing Wallet Validation or Contract Validation modules. It does not derive related identities or equate public keys with account hashes.

### Feed sources

Configure one source. Precedence is inline JSON, local file, then remote URL:

- `THREAT_INTELLIGENCE_FEED_JSON`
- `THREAT_INTELLIGENCE_FEED_PATH`
- `THREAT_INTELLIGENCE_FEED_URL`

Optional remote credential:

- `THREAT_INTELLIGENCE_API_KEY`

Operational controls:

- `THREAT_INTELLIGENCE_CACHE_TTL_MS`
- `THREAT_INTELLIGENCE_MAX_AGE_MS`
- `THREAT_INTELLIGENCE_REQUEST_TIMEOUT_MS`

Remote production feeds must use HTTPS. Redirects are rejected. Feed payloads are limited to one megabyte and 10,000 submitted indicators. Provider credentials, raw file paths, raw remote URLs, and raw loader errors are not exposed through public status responses.

### Feed integrity and freshness

- `generatedAt` must be a valid timestamp.
- Missing or invalid timestamps make the feed stale.
- Timestamps more than five minutes in the future make the feed stale.
- Feed age is checked against the configured maximum age.
- Expired indicators are ignored during evaluation.
- Duplicate identifiers retain the higher-severity record; equal-severity duplicates retain the higher-confidence record.
- Stale or unavailable feeds never count as a pass.

### Policy controls

Threat Intelligence settings are stored in `policy.structuredRules`:

```json
{
  "threatIntelligenceMode": "Review",
  "threatIntelligenceMinConfidence": 70,
  "threatIntelligenceUnavailableAction": "Warn"
}
```

Modes:

- `Observe`: record matches without changing authorization.
- `Review`: medium, high, or critical matches at or above the confidence threshold require review.
- `Enforce`: high or critical matches block; medium matches require review.

Unavailable-feed behavior:

- `Warn`: record an unavailable finding and preserve the decision from other implemented modules.
- `Review`: require human review unless another module blocks.
- `Block`: fail closed.

Legacy policies default internally to `Observe`, 70% confidence, and `Warn`, preserving prior integrations.

### Gateway, audit, and UI

Threat Intelligence is integrated into:

- Agent Gateway authorization
- Structured module findings
- Risk Assessment
- Adaptive Security Pipeline
- Audit evidence and remediation
- Intent Playground
- Policy create/edit forms
- Security Coverage
- Integration Health
- Dashboard platform status
- Settings feed status
- TypeScript SDK response types
- MCP guidance and schema
- README and Docs

New public status route:

```http
GET /api/threat-intelligence/status
```

The normal Gateway result can include sanitized `threatIntelligenceContext` with feed state, record counts, active-record counts, policy mode, normalized identities, and match summaries.

## Example feed

A synthetic testnet-only example is included at:

```text
backend/data/threat-intelligence.example.json
```

Its entries are not real malicious identities and must not be presented as production intelligence. Update its `generatedAt` timestamp before a controlled demo or configure a suitable maximum age.

## Database migration

No database migration is required. Threat Intelligence policy settings use the existing `structuredRules` JSON object, while findings and evidence use the existing audit JSON fields.

## Compatibility

Preserved without contract changes:

- Existing Agent IDs
- Existing API-key hashes and authentication headers
- Existing policies and audit records
- Gateway endpoint and request envelope
- Casper contract hash and proof relayer
- Wallet connection and signing boundary
- YieldBot and Codex integration model
- TypeScript SDK, Python SDK, and MCP authentication model
- Railway and Vercel deployment configuration

Existing integrations that omit Threat Intelligence settings continue working.

## Major files changed

### Backend

- `backend/lib/threatIntelligence.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/lib/securityModel.mjs`
- `backend/data/seed.mjs`
- `backend/data/threat-intelligence.example.json`

### Tests

- `backend/lib/threatIntelligence.test.mjs`
- `backend/lib/threatIntelligence.integration.test.mjs`
- `backend/lib/threatIntelligence.gateway.integration.test.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `packages/mcp-server/test/core.test.mjs`

### Frontend and shared models

- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`

### SDK, MCP, and documentation

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/README.md`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/README.md`
- `docs/THREAT_INTELLIGENCE.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/MCP_SERVER.md`
- `docs/OFFICIAL_SDKS.md`
- `README.md`
- `.env.example`

## Local configuration

For the included synthetic feed:

```env
THREAT_INTELLIGENCE_FEED_PATH=backend/data/threat-intelligence.example.json
THREAT_INTELLIGENCE_CACHE_TTL_MS=300000
THREAT_INTELLIGENCE_MAX_AGE_MS=86400000
THREAT_INTELLIGENCE_REQUEST_TIMEOUT_MS=2500
```

For Railway, inline JSON is usually simplest:

```env
THREAT_INTELLIGENCE_FEED_JSON={"version":"1","source":"Reviewed feed","generatedAt":"CURRENT_ISO_TIMESTAMP","indicators":[]}
```

Do not set a real provider credential in a committed `.env` file. Store it in Railway variables or another secret manager.

## Verification completed

- 78 backend and security-model tests passed.
- 13 focused Threat Intelligence unit tests passed within that suite.
- Authenticated memory-store Gateway integration covered Allowed, Blocked, and Review Required outcomes.
- Audit findings and Threat Intelligence pipeline stages were verified.
- Five TypeScript SDK tests passed.
- Two Python SDK tests passed.
- Four MCP core tests passed using the compiled SDK and transpiled core module.
- All backend `.mjs` files passed Node syntax checking.
- 58 TypeScript/TSX files passed syntax transpilation.
- Modified frontend files passed a local semantic TypeScript check with temporary dependency stubs.

The package registry returned HTTP 503, so a fresh dependency installation, full project typecheck against installed React dependency types, Vite production build, and full MCP protocol test could not be repeated in this environment. Run the normal verification locally before pushing:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Deployment

No Railway or Vercel configuration file changed. Add the chosen Threat Intelligence environment variables to Railway, then deploy the backend before or alongside the frontend. The frontend reads actual feed state from the backend status endpoint.

Begin production rollout with `Observe` or `Review`. Use `Enforce` and fail-closed outage behavior only after the feed's quality, legal basis, update cadence, and uptime have been validated.

## Manual QA checklist

1. Deploy without a configured feed and confirm Settings shows `unavailable` rather than healthy.
2. Confirm a policy with unavailable action `Warn` records an unavailable finding without changing an otherwise Allowed decision.
3. Confirm unavailable action `Review` returns Review Required.
4. Confirm unavailable action `Block` returns Blocked.
5. Configure the synthetic feed with a fresh timestamp.
6. Submit a safe wallet transfer and confirm Threat Intelligence reports a fresh no-match pass.
7. Submit the Playground feed-match example in Review mode and confirm Review Required.
8. Repeat in Enforce mode and confirm Blocked.
9. Confirm the audit record contains Threat Intelligence findings, evidence, remediation, and a pipeline stage.
10. Confirm `/api/threat-intelligence/status` does not expose a file path, feed URL, credential, or raw loader error.
11. Make the feed timestamp stale and confirm it never counts as a pass.
12. Confirm existing YieldBot, SDK, Codex, and MCP intents that omit Threat Intelligence fields remain compatible.

## Current module status

### Live

- Identity and Authentication
- Policy Enforcement
- Wallet Validation
- Contract Validation
- Risk Assessment

### Foundation Available

- Execution Simulation
- Threat Intelligence

### Preview

- None

### Planned

- Oracle Validation
- Bridge Controls
- Compliance Controls

## Suggested commit message

```text
feat(threat-intelligence): add configurable Casper identity screening foundation
```
