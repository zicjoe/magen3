# Production Compliance Provider Implementation Report

## Milestone

Milestone 27 — Production Compliance Provider

Source of truth: `magen3-production-oracle-integration-upgrade.zip` (Milestone 26 release).

Replacement target: `magen3-production-compliance-provider-upgrade.zip`.

Milestone 28 was not implemented.

## Executive summary

Milestone 27 upgrades the existing Compliance Controls foundation into a production-oriented, provider-backed screening architecture without creating a separate authorization engine. Magen3 now has a server-controlled compliance provider registry, request-scoped blockchain subject derivation, bounded evidence normalization, explicit provider availability/failure states, freshness/confidence policy controls, deterministic unavailable/disagreement handling, sanitized audit evidence, SDK/MCP status surfaces, and frontend provider health/configuration visibility.

The first genuine provider adapter targets the OFAC-API v4 screening endpoint at the fixed server-controlled origin `https://api.ofac-api.com`. It is implemented against the documented `/v4/screen` contract and uses the provider API key only on the backend. No live credentialed OFAC-API request was performed in the implementation environment. The adapter and request/response normalization were tested through deterministic mocked provider responses. Therefore the product capability is labeled **Preview**, not Live.

Provider results are evidence only. A provider match is normalized as a provider claim and is evaluated through the existing Compliance Controls and Risk Assessment path. It is not treated as a legal conclusion and never directly authorizes execution.

## Baseline state

The Milestone 26 source was inspected before modification. The repository already contained:

- the existing Compliance Controls foundation in `backend/lib/complianceControls.mjs`;
- the real `POST /api/agent-gateway/intents` protected-intent route;
- memory and Postgres stores that collect protection snapshots and call the shared policy/Risk Assessment engine;
- configured-feed, non-sensitive attestation, Travel Rule reference, jurisdiction, exact-indicator, and submitted screening controls;
- `GET /api/compliance-controls/status`;
- JavaScript and Python SDKs;
- MCP source and committed generated runtime;
- frontend Integration Health and policy configuration surfaces;
- Milestone 25 Threat Intelligence and Milestone 26 Oracle provider architectures.

The existing Compliance Controls foundation was intentionally reused. No second compliance decision engine was created.

Baseline focused Compliance/Oracle/Threat tests completed before Milestone 27 changes with 59 passed, 0 failed. The integration-contract verifier also passed.

## Architecture

The provider flow is:

Protected request
→ server-side compliance subject derivation
→ registered compliance provider adapter
→ provider request using fixed server-controlled origin and backend credential
→ bounded response parsing
→ normalized provider evidence
→ freshness/confidence/provider policy filtering
→ existing Compliance Controls findings
→ existing Risk Assessment/decision precedence
→ sanitized audit persistence
→ normal Gateway response

The provider adapter layer is implemented in `backend/lib/complianceProviders.mjs` and consumed by the existing `backend/lib/complianceControls.mjs` snapshot/evaluation path.

## Provider support

### OFAC-API v4 adapter

Implemented provider identifier: `ofac_api`.

Provider origin is fixed in backend code to:

`https://api.ofac-api.com`

Screening endpoint:

`/v4/screen`

The provider origin cannot be supplied by an Agent Gateway request. The API key is read from `COMPLIANCE_OFAC_API_KEY` only on the backend.

Implemented provider controls include:

- provider registration and capability discovery;
- provider version metadata;
- chain-aware request subject derivation;
- fixed provider origin;
- backend-only authentication;
- bounded provider responses;
- malformed-response handling;
- timeout/cancellation behavior;
- safe retry/backoff;
- rate limiting;
- bounded caching with provider/chain/subject isolation;
- circuit breaking;
- explicit health and unavailable states;
- provider disagreement representation;
- safe output normalization and credential redaction.

## Screening subjects

The request-scoped provider collector can derive supported non-personal blockchain subjects for roles including:

- execution wallet;
- recipient/contract target;
- token contract;
- bridge recipient;
- x402 recipient.

Subjects retain distinct roles even when two roles contain the same blockchain identifier. Canonical chain identity is reused from existing Magen3 foundations, including EVM and Casper-compatible identifiers where supported.

Magen3 does not require or solicit natural-person names, identity documents, biometrics, contact details, or other raw personal identity data for this provider path.

## Evidence model

Normalized provider evidence includes the repository equivalents of:

- provider and provider ID;
- provider version;
- canonical subject;
- subject type and role;
- chain family and chain ID;
- provider-defined risk categories;
- provider severity;
- provider confidence/match score threshold;
- bounded provider reference;
- provider claim;
- evidence timestamp and expiry;
- jurisdiction/dataset context;
- cached status;
- provider disagreement state;
- manual-review status;
- false-positive status;
- configured minimum match score;
- bounded source metadata;
- bounded match summaries;
- evidence hash;
- normalized provider verdict.

Raw provider responses and provider credentials are not persisted as public evidence.

A clean OFAC-API response does not claim artificial 100% confidence. Its normalized evidence records the configured provider matching threshold, while a returned match retains its provider score.

## Unsupported and unavailable states

Provider failures are explicit rather than represented as a successful clean result. The adapter models conditions including:

- unsupported subject/chain;
- authentication unavailable;
- provider unavailable;
- timeout;
- rate limited;
- degraded/circuit-open state;
- malformed response.

The existing deterministic policy determines whether required unavailable evidence becomes Warning, Review Required, or Blocked.

## Policy changes

Additive Compliance Controls policy fields include:

- `complianceProviderRequired`;
- `complianceProviderUnavailableAction`;
- `complianceProviderDisagreementAction`;
- `complianceAllowedProviders`;
- `complianceBlockedCategories`;
- `complianceReviewCategories`;
- `complianceMinimumProviderConfidence`;
- `complianceMaxProviderEvidenceAgeSeconds`;
- `complianceManualReviewRequired`;
- `complianceFalsePositiveOverrides`.

Existing Compliance Controls fields and behavior remain available.

False-positive overrides are evidence-hash based and do not silently convert a provider claim into an Allowed decision. An authorized override remains visible and routes to review semantics rather than erasing the provider evidence.

## Decision integration

Provider findings feed the existing Compliance Controls module and existing Risk Assessment engine. No independent compliance authorization engine was introduced.

A successful compliance provider result cannot override a Blocked or Review Required result produced by another protection module. Existing decision precedence is preserved.

Provider matches remain provider claims. Magen3 policy determines the deterministic action. Magen3 does not present provider output as a legal conclusion or legal advice.

## Gateway integration

The existing `POST /api/agent-gateway/intents` route remains unchanged as the protected-intent entry point.

Both memory and Postgres stores now collect request-scoped Compliance Controls snapshots so production provider evidence reaches the actual Gateway protection pipeline before policy/Risk Assessment evaluation.

No request shape was removed and no authentication header changed.

The existing `GET /api/compliance-controls/status` route now exposes bounded provider configuration, capability, availability, and health summaries without provider credentials or raw provider payloads.

## Audit integration

Provider evidence is represented through bounded sanitized Compliance Controls findings/context and therefore reaches existing audit persistence through the same pipeline as other protection-module evidence.

The Gateway integration test verifies that provider-backed Compliance Controls evidence reaches the persisted audit record.

No raw provider API key, Authorization header, or unbounded provider payload is stored in the audit surface tested by this milestone.

## Casper proof integration

No raw compliance response was added to Casper proof payloads. The milestone leaves the existing privacy-preserving decision/audit proof architecture intact. Provider evidence remains off-chain; only the existing decision/audit commitments are eligible for proof anchoring.

## Database changes

No database migration was required.

The milestone reuses existing audit/policy persistence and adds request-scoped provider evidence through existing bounded finding/context structures. Existing agents, API keys, policies, audits, approvals, proofs, reconciliation, bridge, x402, Threat Intelligence, and Oracle records remain compatible.

## JavaScript SDK

Added additive client method:

`getComplianceControlsStatus()`

Extended Compliance Controls response typing with bounded provider status/capability/evidence/policy fields.

Existing SDK methods and signatures remain intact.

Committed generated JavaScript runtime and declaration output were updated manually because the extracted source ZIP did not contain installed workspace dependencies and pnpm could not be restored from the execution environment's internal package mirror.

## Python SDK

Added additive client method:

`get_compliance_controls_status()`

Existing Python SDK methods remain unchanged.

## MCP integration

Added MCP functionality for sanitized Compliance Provider status:

`magen3_get_compliance_controls_status`

The MCP result includes the explicit boundary that provider screening is evidence only and is not a legal conclusion. It does not expose provider credentials or raw screening payloads.

MCP source plus committed generated runtime (`dist/core.js`, declarations, and server registration) were updated.

## Frontend integration

The existing Magen3 visual structure is preserved.

Integration Health now exposes truthful Compliance Provider information including:

- configured provider IDs;
- available provider IDs;
- provider health;
- provider disagreement state;
- provider capability information.

The policy editor now exposes the additive production-provider policy controls.

The security capability model distinguishes the existing Compliance Controls foundation from **Production compliance provider screening — Preview**.

The UI explicitly states that OFAC-API provider support remains Preview until a deployment performs a genuine credentialed provider request.

## Security protections

Milestone 27 specifically defends against:

- request-controlled provider URLs;
- provider credential leakage;
- raw Authorization header exposure;
- cross-chain/cross-subject cache collisions;
- stale provider evidence;
- malformed JSON/provider responses;
- oversized responses;
- timeout exhaustion;
- retry storms;
- rate-limit exhaustion;
- circuit-breaker failure storms;
- provider evidence substitution through canonical subject binding;
- unsupported/unavailable evidence being represented as clean;
- unbounded provider match output;
- accidental personal-data expansion;
- provider verdicts becoming direct authorization decisions.

The pre-existing Gateway PII rejection boundary remains intact.

## Environment variables

Milestone 27 adds/uses:

- `COMPLIANCE_PROVIDERS`
- `COMPLIANCE_OFAC_API_ENABLED`
- `COMPLIANCE_OFAC_API_KEY`
- `COMPLIANCE_OFAC_API_MIN_SCORE`
- `COMPLIANCE_PROVIDER_TIMEOUT_MS`
- `COMPLIANCE_PROVIDER_MAX_RETRIES`
- `COMPLIANCE_PROVIDER_CACHE_TTL_MS`
- `COMPLIANCE_PROVIDER_RATE_LIMIT_PER_MINUTE`
- `COMPLIANCE_PROVIDER_MAX_RESPONSE_BYTES`
- `COMPLIANCE_PROVIDER_FAILURE_THRESHOLD`
- `COMPLIANCE_PROVIDER_CIRCUIT_COOLDOWN_MS`

The application starts safely when the optional provider is unconfigured. If a policy requires production-provider evidence, unconfigured/unavailable evidence follows `complianceProviderUnavailableAction` and is never silently treated as clear.

## Files added

- `backend/lib/complianceProviders.mjs`
- `backend/lib/complianceProviders.test.mjs`
- `backend/lib/complianceProviders.gateway.integration.test.mjs`
- `docs/PRODUCTION_COMPLIANCE_PROVIDER.md`
- `PRODUCTION_COMPLIANCE_PROVIDER_IMPLEMENTATION_REPORT.md`

## Principal files modified

- `backend/lib/complianceControls.mjs`
- `backend/lib/complianceControls.test.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `.env.example`
- `README.md`
- `docs/COMPLIANCE_CONTROLS.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- `docs/INTEGRATION_CONFIGURATION.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/README.md`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/dist/index.js`
- `packages/sdk-js/dist/index.d.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/src/magen3/client.py`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/dist/core.js`
- `packages/mcp-server/dist/core.d.ts`
- `packages/mcp-server/dist/server.js`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `scripts/integration/verify-integration-contract.mjs`

## Tests run and exact observed results

### Baseline before Milestone 27 changes

- Focused Compliance/Oracle/Threat baseline: 59 passed, 0 failed.
- Integration-contract verification: passed.

### Final focused backend regression

Command used:

`node --test backend/lib/complianceProviders.test.mjs backend/lib/complianceProviders.gateway.integration.test.mjs backend/lib/complianceControls.test.mjs backend/lib/complianceControls.integration.test.mjs backend/lib/complianceControls.gateway.integration.test.mjs backend/lib/oracleProviders.test.mjs backend/lib/oracleValidation.test.mjs backend/lib/threatIntelligenceProviders.test.mjs backend/lib/threatIntelligence.test.mjs`

Result: 68 passed, 0 failed, 0 skipped.

### JavaScript SDK

Command:

`node --test packages/sdk-js/test/sdk.test.mjs`

Result: 44 passed, 0 failed, 0 skipped.

### Python SDK

Command:

`PYTHONPATH=packages/sdk-python/src python -m unittest discover -s packages/sdk-python/tests -p 'test_*.py'`

Result: 38 passed, 0 failed.

### MCP core

The extracted ZIP does not contain workspace-installed dependencies. A temporary local workspace symlink for `@magen3/sdk` was created only for the test and removed immediately after.

Command equivalent:

`node --test packages/mcp-server/test/core.test.mjs`

Result: 32 passed, 0 failed, 0 skipped.

The separate `protocol.test.mjs` could not start because `@modelcontextprotocol/sdk` is absent from the extracted ZIP. This is an environment/dependency availability limitation, not a test assertion failure in Milestone 27 code.

### Full backend regression

Command:

`node --test backend/**/*.test.mjs`

Result: 507 discovered, 506 passed, 1 failed, 0 skipped.

The sole failure is `backend/lib/frontendSecurityModel.test.mjs`. It fails before executing assertions because the `typescript` npm package is absent from the extracted ZIP (`ERR_MODULE_NOT_FOUND`). This is the same dependency-only limitation present in the Milestone 26 environment.

### Syntax checks

Passed:

- `node --check backend/lib/complianceProviders.mjs`
- `node --check backend/lib/complianceControls.mjs`
- `node --check backend/store/memoryStore.mjs`
- `node --check backend/store/postgresStore.mjs`
- `node --check packages/sdk-js/dist/index.js`
- `node --check packages/mcp-server/dist/core.js`
- `node --check packages/mcp-server/dist/server.js`
- `python -m py_compile packages/sdk-python/src/magen3/client.py`

### Security verification

Command:

`node scripts/security/verify-security-patch.mjs`

Result: passed.

### Type checking

A global `tsc` executable exists, but project dependencies are absent from the source ZIP. `tsc -b` therefore fails on missing modules such as `react`, `lucide-react`, `vite`, `@vitejs/plugin-react`, and their type declarations before a normal repository typecheck can be performed.

### pnpm / build

`pnpm` is not installed in the extracted environment. Corepack attempted to fetch the repository-declared `pnpm@10.14.0`, but the execution environment's internal npm mirror returned HTTP 404. Consequently the repository's normal `pnpm typecheck`, SDK/MCP build, and Vite build could not be performed honestly.

## Live provider verification

No genuine credentialed OFAC-API request was performed. No OFAC-API key was available in this implementation environment. Real adapter request construction and response normalization were tested with mocks/fixtures against the documented API contract.

Capability status: **Preview**.

## Deployment notes

For a deployment that intends to use the provider:

1. set `COMPLIANCE_PROVIDERS=ofac_api`;
2. set `COMPLIANCE_OFAC_API_ENABLED=true`;
3. set backend-only `COMPLIANCE_OFAC_API_KEY`;
4. tune minimum score and provider reliability controls if needed;
5. configure policy-level `complianceProviderRequired`, unavailable/disagreement actions, confidence/freshness requirements, and category handling;
6. perform a credentialed provider verification in the deployment environment before relabeling the capability Live.

No frontend provider secret is required or permitted.

Railway and Vercel were not deployed from this environment, so deployment is not claimed.

## Backward compatibility

Preserved:

- existing agent IDs and API keys;
- existing policies and legacy Compliance Controls fields;
- Gateway path and authentication behavior;
- decision response semantics;
- audit/proof architecture;
- JavaScript SDK existing methods;
- Python SDK existing methods;
- existing MCP tools;
- Threat Intelligence;
- Oracle Integration;
- x402 exact/upto/metered accounting;
- bridge/reconciliation state machines;
- Casper proof separation;
- Railway/Vercel configuration shape.

No user needs to recreate agents or policies.

## Known limitations

- OFAC-API has not been live-called in this environment.
- Only the first production compliance provider adapter (`ofac_api`) is implemented; the registry is designed for additive providers.
- Provider-specific natural-person identity screening is intentionally not added to the Agent Gateway because Magen3's current privacy boundary rejects raw personal identity data.
- The provider capability remains Preview until live credentialed verification occurs.
- Full TypeScript/build/MCP protocol verification is dependency-gated by the extracted ZIP/environment as described above.

## Roadmap compatibility and explicit boundary

Milestone 27 intentionally does **not** implement:

- continuous rescreening;
- background compliance polling;
- automated reactions to future compliance-status changes;
- continuous Threat Intelligence monitoring;
- continuous Oracle monitoring;
- general monitoring jobs, checkpoints, alerts, acknowledgements, recovery, or automated safe actions.

Those responsibilities remain for Milestone 28 — Continuous Risk Monitoring.

The provider registry, normalized evidence/status semantics, freshness metadata, and deterministic provider health output are clean extension points that Milestone 28 can consume without creating another compliance engine.

## Starting point for the next milestone

The next incomplete roadmap milestone is:

Milestone 28 — Continuous Risk Monitoring.

Use the Milestone 27 replacement ZIP as the next source of truth. Verify this implementation against code/tests first, then build monitoring as a consumer of existing reconciliation, exposure, simulation, asset/contract risk, wallet behavior, MEV, route, market, bridge, x402, Threat Intelligence, Oracle, and Compliance foundations rather than duplicating them.

## Final integration verification

Command:

`node scripts/integration/verify-integration-contract.mjs`

Result: passed (`Magen3 integration contract verified`). The verifier includes Milestone 27 checks for the fixed provider origin, production provider policy/evidence integration, request-scoped memory/Postgres Gateway wiring, status route, JavaScript SDK, Python SDK, MCP source/generated runtime, frontend status, environment configuration, documentation, and explicit Milestone 28 boundary.
