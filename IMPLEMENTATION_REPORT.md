# Magen3 Compliance Controls Foundation — Implementation Report

## Release summary

Compliance Controls has moved from **Planned** to **Foundation Available**.

This release adds a deterministic, provider-agnostic compliance evidence layer to the existing Magen3 Gateway before wallet signing. It preserves the current Gateway endpoint, per-agent authentication, agent and policy records, audit model, Casper decision-proof contract, relayer, wallet boundary, SDK authentication, MCP authentication, Railway configuration, and Vercel configuration.

Compliance Controls is not labeled Live because Magen3 does not bundle or certify a KYC/KYB provider, sanctions-data provider, legal rules engine, or jurisdiction-specific compliance determination. The module validates operator-configured policy, non-sensitive evidence, and exact configured-feed matches honestly.

## Implemented evidence model

Policy-covered intents may include `action.compliance` with:

- Originator and beneficiary two-letter jurisdiction codes
- Counterparty type
- Originator and beneficiary attestation status
- Evidence-provider labels
- Opaque attestation references
- Attestation issue and expiry times
- Travel Rule workflow status
- Opaque Travel Rule reference
- Optional 32-byte data hash
- Screening status, provider, opaque reference, and timestamp
- Low, Medium, High, or Critical risk rating
- Opaque originator and beneficiary VASP identifiers

The Gateway rejects raw names, dates of birth, passport and identity-document numbers, national or tax identifiers, residential addresses, email addresses, phone numbers, uploaded documents, selfies, and biometric data.

## Deterministic checks

Compliance Controls now evaluates:

1. Whether the action is covered by the active compliance policy.
2. Required evidence presence.
3. Originator and beneficiary attestation status.
4. Evidence-provider allowlists.
5. Attestation issue-time freshness and expiry.
6. Travel Rule workflow status above the configured amount threshold.
7. Screening status and freshness.
8. Originator and beneficiary jurisdiction format and policy.
9. Allowed, review, and blocked jurisdictions.
10. Allowed counterparty types.
11. Maximum risk rating.
12. Exact wallet, account-hash, Contract Hash, Package Hash, and VASP-ID matches from an operator feed.
13. Exact configured jurisdiction restrictions.
14. Feed generated time, freshness, record expiry, size, count, cache, timeout, and source safety.
15. Warn, Review, or Block behavior when required evidence or configured intelligence is unavailable.

A configured hard-block identity match, blocked jurisdiction, screening match, or rejected required attestation stops execution. A stale, unavailable, or incomplete source never silently becomes a pass.

## Policy controls

The existing `structuredRules` object now supports:

- `complianceControlsEnabled`
- `complianceControlMode`: `Observe`, `Review`, or `Enforce`
- `complianceUnavailableAction`: `Warn`, `Review`, or `Block`
- `complianceRequiredActions`
- `complianceRequireOriginatorAttestation`
- `complianceRequireBeneficiaryAttestation`
- `complianceRequireTravelRule`
- `complianceTravelRuleThreshold`
- `complianceRequireSanctionsScreening`
- `complianceAllowedJurisdictions`
- `complianceBlockedJurisdictions`
- `complianceReviewJurisdictions`
- `complianceAllowedCounterpartyTypes`
- `complianceAcceptedProviders`
- `complianceMaxAttestationAgeSeconds`
- `complianceMaxScreeningAgeSeconds`
- `complianceMaximumRiskRating`

Legacy policies without compliance fields remain backward compatible and skip the module rather than changing existing decisions.

## Optional configured feed

The backend supports one optional source, with this precedence:

1. `COMPLIANCE_CONTROLS_FEED_JSON`
2. `COMPLIANCE_CONTROLS_FEED_PATH`
3. `COMPLIANCE_CONTROLS_FEED_URL`

Optional operating variables:

- `COMPLIANCE_CONTROLS_API_KEY`
- `COMPLIANCE_CONTROLS_CACHE_TTL_MS`
- `COMPLIANCE_CONTROLS_MAX_AGE_MS`
- `COMPLIANCE_CONTROLS_REQUEST_TIMEOUT_MS`

Remote production feeds require HTTPS. Redirects, oversized responses, excessive record counts, stale feed timestamps, and expired entries are handled safely. Public status responses do not expose credentials, raw paths, raw URLs, loader details, or feed contents.

The included `backend/data/compliance-controls.example.json` is entirely synthetic. Refresh it before a controlled testnet demonstration with:

```bash
pnpm compliance:refresh-example-feed
```

## Product integration

Compliance Controls is connected to:

- Agent Gateway normalization and raw-PII rejection
- Policy Engine and deterministic Risk Assessment
- Structured module findings
- Security Pipeline
- Decision explanations and remediation
- Audit persistence
- Security Coverage
- Integration Health
- Dashboard and Settings status
- Agent registration starter policies
- Policy creation and editing
- Intent Playground examples
- TypeScript SDK
- Python SDK pass-through tests
- MCP schema and instructions
- Public config, health, and sanitized status endpoints
- README and product/integration documentation

## Status endpoint

```http
GET /api/compliance-controls/status
```

It returns sanitized availability, source type/name, freshness, record counts, and safe error information.

## Intent Playground cases

- Compliance evidence complete
- Incomplete Travel Rule evidence
- Rejected beneficiary attestation
- Configured compliance feed match

The response displays Compliance Controls findings, policy rule, non-sensitive evidence, suggested remediation, pipeline state, audit identifier, and proof state.

## Database and deployment

There is **no database migration** and no new mandatory environment variable.

No change was made to:

- Agent IDs or API-key hashes
- Gateway endpoint or authentication headers
- Existing policies or audit records
- Casper contract hash
- Decision-proof relayer flow
- Wallet connection or signing boundary
- YieldBot or Codex authentication flow
- Railway or Vercel configuration

## Verification performed

- 130 backend and security tests passed.
- 16 focused Compliance Controls tests passed.
- Authenticated Allowed, Review Required, and Blocked compliance outcomes were verified and persisted.
- Raw personal identity fields were verified as rejected before audit persistence.
- 8 TypeScript SDK tests passed after a real SDK TypeScript build.
- 4 Python SDK tests passed.
- 4 MCP core tests passed using a temporary local build harness.
- Every backend and script `.mjs` file passed Node syntax checking.
- 57 TypeScript/TSX source files passed TypeScript syntax transpilation.
- A partial root TypeScript check showed no project-local diagnostics beyond missing third-party packages and their type declarations.
- `/api/health` and `/api/compliance-controls/status` were exercised against the running memory-store server with the synthetic feed.

## Verification limitation

The configured package registry returned HTTP 503 before dependencies could be installed. Therefore, the full dependency-backed root typecheck, Vite production build, MCP protocol startup test, and complete `pnpm verify` command could not be run in this environment.

Run locally before pushing:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Major files changed

- `backend/lib/complianceControls.mjs`
- `backend/lib/complianceControls.test.mjs`
- `backend/lib/complianceControls.integration.test.mjs`
- `backend/lib/complianceControls.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/data/compliance-controls.example.json`
- `backend/data/seed.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `scripts/compliance/refresh-example-feed.mjs`
- `.env.example`
- `README.md`
- `docs/COMPLIANCE_CONTROLS.md`
- Gateway, SDK, MCP, and platform documentation

## Current protection-module status

### Live

- Identity and Authentication
- Policy Enforcement
- Wallet Validation
- Contract Validation
- Risk Assessment

### Foundation Available

- Execution Simulation
- Threat Intelligence
- Oracle Validation
- Bridge Controls
- Compliance Controls

### Preview

- None

### Planned

- None

## Suggested commit

```text
feat(compliance-controls): add non-sensitive compliance evidence foundation
```

Suggested body:

```text
Add policy-driven attestation, Travel Rule evidence, jurisdiction,
counterparty, screening, risk-rating, freshness, and exact configured-feed
checks before wallet signing.

Reject raw personal identity data and persist only non-sensitive status,
provider, opaque-reference, timestamp, jurisdiction, and hash evidence.

Integrate Compliance Controls with the Gateway, Risk Assessment, Security
Pipeline, Audit Logs, policies, Security Coverage, Integration Health,
Intent Playground, SDKs, MCP, status endpoints, and documentation while
preserving existing API, Casper proof, Railway, and Vercel contracts.
```

## Manual QA checklist

1. Connect Casper Wallet and open Policies.
2. Enable Compliance Controls for a test agent.
3. Select Review mode and configure required actions and evidence.
4. Run `Compliance evidence complete` in Intent Playground.
5. Confirm Compliance Controls appears in findings and the Security Pipeline.
6. Run `Incomplete Travel Rule evidence` and confirm Review Required.
7. Run `Rejected beneficiary attestation` and confirm Blocked.
8. Refresh and configure the synthetic feed, then run `Configured compliance feed match`.
9. Confirm no raw personal identity data appears in the request, response, or audit record.
10. Confirm new audit records appear automatically and retain the Casper proof flow.
11. Check `/api/compliance-controls/status` and Settings operational status.
12. Repeat on desktop and mobile layouts.
