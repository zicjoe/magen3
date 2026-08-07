# Continuous Risk Monitoring Implementation Report

## Executive summary

Milestone 28 — Continuous Risk Monitoring is implemented on top of the supplied `magen3-production-compliance-provider-upgrade.zip`. The milestone adds bounded, deterministic continuous evaluation of existing Magen3 state: registered agents, active policies, API-key age, provider health/state transitions, pending and uncertain execution reconciliation, bridge-delivery delay, x402 settlement/resource-delivery delay, existing exposure findings, and configuration drift. It reuses the existing Emergency Circuit Breaker for the subset of automated safe actions that can be represented safely with current Magen3 controls. It does not create a second per-intent authorization engine, settlement state machine, exposure engine, provider system, or Casper data model.

## Baseline state

A clean extraction of the supplied Milestone 27 ZIP was independently checked before release packaging. The Milestone 27 focused compliance/oracle/threat regression suite passed **68/68** and `node scripts/integration/verify-integration-contract.mjs` passed. Code inspection confirmed the Production Compliance Provider, Production Oracle Integration, and Production Threat Intelligence foundations were present and wired to the protected Gateway/Risk Assessment path.

## Architecture

The monitoring architecture consists of:

- `backend/lib/continuousRiskMonitoring.mjs`: deterministic monitor normalization/evaluation, canonical evidence hashes, checkpoint production, alert deduplication/recovery, acknowledgement/status transitions, and policy-authorized automated-action selection.
- `backend/lib/monitoringScheduler.mjs`: opt-in bounded scheduler with a minimum 60-second interval, process-local overlap protection, due-time evaluation, and an unref'd timer.
- Existing memory/PostgreSQL stores: monitor/alert persistence, tenant scoping, checkpoint updates, provider snapshot consumption, scheduled/manual cycles, and existing Emergency Circuit Breaker execution.
- Existing server: public capability status, owner-scoped administration, authenticated agent polling, manual execution, alert updates, and optional scheduler startup.
- Existing SDK/MCP/frontend surfaces: additive monitoring status, bounded alert polling, and Settings/Dashboard health/recovery workflows.

Monitoring consumes existing subsystem evidence. It does **not** modify the deterministic `Allowed / Blocked / Review Required` decision produced by the protected-intent pipeline. When explicitly authorized by both monitor configuration and active policy, monitoring can activate an existing emergency pause/review control that affects later protected actions through the already-existing enforcement path.

## Monitor definitions and subjects

A monitor is owner-wallet and agent scoped and stores a bounded name, subject, subject type, selected categories, cadence, enabled state, severity threshold, automated-action preferences, bounded configuration, persistent checkpoint, and last/next evaluation timestamps. Cadence is bounded to 60–86,400 seconds.

Typed categories include agent/integration/API-key health, policy/configuration drift, provider/RPC health, wallet behavior, exposure/approval exposure, execution, bridge delivery, x402 settlement, metered authorization, resource delivery, asset/contract risk, Threat Intelligence, Oracle, Compliance, simulation, and market risk. Current direct evaluators cover the conditions listed in the Executive summary; remaining typed categories are extension points that must consume their existing Magen3 subsystem rather than duplicate it.

## Alert model

Alerts persist:

- Alert ID and monitor ID
- Owner and agent scope
- Subject and subject type
- Severity/category/trigger
- Bounded sanitized evidence and SHA-256 evidence hash
- First/last observed time
- Occurrence count
- Stable deduplication key
- Status (`Open`, `Acknowledged`, `Investigating`, `Resolved`, `Suppressed`, `Recovered`)
- Acknowledgement
- Assigned reviewer
- Recovery status
- Optional automated-action metadata
- Audit reference where an automated emergency action is executed
- Suggested resolution
- Bounded history (maximum 50 entries)

Repeated observations update the same alert. A cleared condition becomes `Recovered`; it does not generate a second recovery alert.

## Database changes

Additive PostgreSQL tables were added:

- `monitoring_monitors`
- `monitoring_alerts`

They include due-time/deduplication indexes and bounded JSON fields. An additive `history` column safeguard is included. No existing columns or records are renamed or deleted. Existing agents, API keys, policies, audits, approvals, proofs, reconciliation records, bridge/x402 state, Threat Intelligence, Oracle, and Compliance state are preserved.

## Deterministic automated safe actions

Automated action selection requires **both**:

1. The monitor definition to opt into the action; and
2. The active policy to authorize the exact action in `structuredRules.monitoringAutomatedActions`.

Supported direct actions are:

- `agent-pause` → existing Agent-scope Emergency Circuit Breaker, `Blocked`
- `bridge-retry-prevention` → existing Bridge-scope Emergency Circuit Breaker, `Blocked`
- `x402-pause` → existing x402-scope Emergency Circuit Breaker, `Blocked`
- `increased-review` → existing Agent-scope Emergency Circuit Breaker, `Review Required`

Executed actions receive existing emergency audit handling. Monitoring alerts store the action metadata and resulting audit reference. Trigger evidence supplied to the emergency workflow is limited to monitor ID plus bounded observation hashes.

Credential revocation, provider disablement, direct payment-authorization revocation, and automatic creation of a human-approval case are **not** silently simulated. They remain operator workflows because the current repository does not provide a safe reversible primitive for them that can be invoked without expanding this final milestone into a competing identity/provider/payment/approval engine.

## Provider and existing-system integration

Each cycle consumes the existing sanitized Threat Intelligence, Oracle Validation, and Compliance Controls snapshots and detects unhealthy/degraded/stale/unavailable states and state transitions. Existing audit/reconciliation data is reused for pending/uncertain execution, bridge, x402, resource-delivery, and exposure conditions. Provider credentials and raw provider payloads never enter monitoring definitions or alerts.

## Security protections

Implemented protections include:

- Owner/tenant scoping for monitor and alert administration.
- Existing Agent ID/API-key authentication for agent-facing polling.
- Stable evidence hashing and stable deduplication keys.
- Bounded evaluated audits, observations, evidence, alert history, categories, cadence, and UI/API output.
- Explicit rejection of request-controlled provider/RPC endpoints and credential-like configuration fields such as API keys, authorization values, private keys, seed phrases, and secrets.
- Scheduler overlap guard and minimum interval to reduce duplicate jobs/retry storms.
- Due-time checkpoints and idempotent alert reconciliation.
- No raw monitoring/provider evidence added to Casper proofs.
- Automated actions require active-policy authorization and reuse existing audited emergency controls.
- No private keys, signing material, provider credentials, or raw authorization headers stored.

## Gateway/server integration

Additive routes:

- `GET /api/continuous-risk-monitoring/status`
- `GET /api/monitoring?walletAddress=...`
- `GET /api/agent-gateway/monitoring?agentId=...`
- `POST /api/monitoring/monitors`
- `POST /api/monitoring/monitors/:id`
- `POST /api/monitoring/run`
- `POST /api/monitoring/alerts/:id`

The canonical protected route `POST /api/agent-gateway/intents` is unchanged. Monitoring does not become an alternate authorization route.

## JavaScript SDK

Added additive monitoring types plus:

- `getContinuousRiskMonitoringStatus()`
- `getMonitoringStatus()`

The second method uses existing agent credentials and returns that agent's bounded monitoring state. Source, committed generated runtime, declarations, README, and tests were updated.

## Python SDK

Added:

- `get_continuous_risk_monitoring_status()`
- `get_monitoring_status()`

README/tests were updated. Existing methods remain compatible.

## MCP

Added:

- `magen3_get_continuous_risk_monitoring_status`
- `magen3_get_monitoring_alerts`

Source and committed generated runtime/declarations were updated. Output is bounded and authenticated agent alert polling does not expose credentials, provider payloads, or signing material.

## Frontend

The existing Magen3 visual structure was preserved. Dashboard attention/service-health surfaces now include Continuous Risk Monitoring. Settings → Provider Services includes truthful monitoring capability/scheduler state plus Continuous Monitoring Operations for creating per-agent monitors, running an evaluation, viewing alerts, acknowledging Open alerts, and observing automatic Recovery states. No generic replacement monitoring dashboard was introduced.

## Environment and deployment

Added:

```env
MONITORING_SCHEDULER_ENABLED=false
MONITORING_SCHEDULER_INTERVAL_MS=60000
```

Scheduling defaults off so an unconfigured Railway/Vercel deployment starts safely. Interval is bounded to 60,000–3,600,000 ms. For multi-replica deployments, enable the in-process scheduler on only one scheduler-owning replica or move ownership to a durable job coordinator; process-local overlap protection cannot provide distributed locking across replicas.

## Files added

- `backend/lib/continuousRiskMonitoring.mjs`
- `backend/lib/continuousRiskMonitoring.test.mjs`
- `backend/lib/continuousRiskMonitoring.integration.test.mjs`
- `backend/lib/continuousRiskMonitoring.security.test.mjs`
- `backend/lib/monitoringScheduler.mjs`
- `backend/lib/monitoringScheduler.test.mjs`
- `docs/CONTINUOUS_RISK_MONITORING.md`
- `CONTINUOUS_RISK_MONITORING_IMPLEMENTATION_REPORT.md`

## Principal files modified

- `.env.example`
- `README.md`
- `backend/db/schema.mjs`
- `backend/db/migrate.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/dist/index.js`
- `packages/sdk-js/dist/index.d.ts`
- `packages/sdk-js/README.md`
- `packages/sdk-js/test/*` monitoring coverage
- `packages/sdk-python/src/magen3/client.py`
- `packages/sdk-python/tests/*` monitoring coverage
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/dist/core.js`
- `packages/mcp-server/dist/core.d.ts`
- `packages/mcp-server/dist/server.js`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`
- `scripts/integration/verify-integration-contract.mjs`
- `docs/README.md`

## Exact tests and verification

### Clean-source baseline

- Milestone 27 focused compliance/oracle/threat suite: **68 passed, 0 failed, 0 skipped**.
- Existing integration-contract verifier: **passed**.

### Milestone 28 focused/backend-adjacent regression

Command included Continuous Risk Monitoring unit/integration/security/scheduler tests plus Milestone 25–27 Threat/Oracle/Compliance suites.

- **79 passed, 0 failed, 0 skipped**.

### Full backend regression

`node --test backend/**/*.test.mjs`

- **518 discovered**
- **517 passed**
- **1 failed**
- **0 skipped**

The only failure is `backend/lib/frontendSecurityModel.test.mjs`, which fails before assertions because the extracted ZIP has no installed `typescript` npm package. This is the same dependency-environment class documented in the previous release and is not a failed Milestone 28 assertion.

### JavaScript SDK

`node --test packages/sdk-js/test/*.test.mjs`

- **45 passed, 0 failed, 0 skipped**.

### Python SDK

`PYTHONPATH=packages/sdk-python/src python -m unittest discover -s packages/sdk-python/tests -v`

- **39 passed, 0 failed**.

An initial invocation without `PYTHONPATH` failed to import local package `magen3`; the correct source-tree invocation above passes completely.

### MCP

With a temporary local workspace symlink for the source ZIP's absent installed `@magen3/sdk` dependency:

`node --test packages/mcp-server/test/core.test.mjs`

- **33 passed, 0 failed, 0 skipped**.

The temporary symlink was removed before packaging. `packages/mcp-server/test/protocol.test.mjs` cannot start because `@modelcontextprotocol/sdk` is not installed in the extracted ZIP; no protocol assertion executes.

### Verification/security/syntax

- `node scripts/integration/verify-integration-contract.mjs`: **passed**.
- `node scripts/security/verify-security-patch.mjs`: **passed**.
- `node --check` on changed backend/generated JavaScript/verifier files: **passed**.

### Typecheck/build/lint

- `pnpm`: **not available** in the execution environment (`command not found`).
- `tsc -b`: **cannot complete** because source dependencies such as `react`, `lucide-react`, `vite`, React JSX runtime/types, and Node/Vite types are not installed in the extracted ZIP. During this check one Milestone 28 UI type omission (`occurrenceCount`) was detected and fixed; rerunning shows only missing-dependency/environment errors, not that Milestone 28 field error.
- A legitimate Vite production build therefore could not be run.
- No separate repository lint command could be run without the package-manager/dependency installation.

## Live/public deployment verification

- No Railway deployment was performed.
- No Vercel deployment was performed.
- No new external provider call is introduced by Milestone 28.
- The in-process scheduler was unit tested, including opt-in startup and minimum interval, but was not operated as a long-running deployed background worker.
- No blockchain transaction or wallet signature was performed or claimed.

## Backward compatibility

The canonical Gateway route, agent IDs/API keys, policies, audits, approval/quorum flows, Casper proofs, sponsorship, reconciliation, exposure controls, simulation, asset identity/risk, wallet behavior, MEV, route integrity, market risk, bridges, x402/metered payments, Threat Intelligence, Oracle, Compliance, SDK/MCP existing methods, CORS, and existing environment variables remain intact. Database changes are additive.

## Known limitations

- In-process scheduler ownership is suitable only when one application replica owns scheduling. Distributed multi-worker ownership requires a durable coordinator/lease before enabling every replica.
- Typed monitoring categories for integration health, approval accumulation, direct asset/contract change detection, simulation freshness, market evidence freshness, and metered-authorization exhaustion are extension points; this release does not fabricate observations when a canonical existing subsystem cannot yet supply a trustworthy snapshot.
- Direct credential revocation/provider disablement/payment-authorization revocation/human-approval creation are not automated for the reasons documented above.
- Full frontend build/typecheck and MCP protocol tests remain dependency-gated in this extracted environment.

## Roadmap compatibility and explicit boundary

This release implements **Milestone 28 only** and is the final milestone in the supplied Milestones 26–28 roadmap. It consumes Milestones 11–27. It does not create a post-roadmap feature, add a new provider, enable mainnet, replace Risk Assessment, duplicate reconciliation, or place raw monitoring evidence on Casper.
