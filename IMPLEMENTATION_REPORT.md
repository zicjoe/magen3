# Magen3 Emergency Circuit Breaker Implementation Report

## Release

- **Release:** Magen3 1.5.0
- **Milestone:** Emergency Circuit Breaker
- **Protection area:** Policy & Approval Controls
- **Control status:** Live
- **Source baseline:** `magen3-privileged-contract-action-classification-upgrade.zip`
- **Compatibility approach:** Additive database migration, additive policy fields, additive API response fields, and no changes to existing Agent IDs, API-key hashes, Casper contract configuration, approval binding format, SDK methods, or MCP tool names.

## 1. Architecture found in the source ZIP

Magen3 remains a modular execution firewall with these major layers:

1. React/Vite/TypeScript operator application.
2. Node.js ESM backend and deterministic evaluator modules.
3. Agent Gateway authentication using Agent ID plus hashed API credentials.
4. Structured policy rules and deterministic findings.
5. Risk Assessment with `Blocked` precedence over `Review Required`, and `Review Required` precedence over `Allowed`.
6. PostgreSQL persistence through Drizzle plus an aligned memory-store fallback.
7. Human Approval and Quorum with exact-intent binding.
8. Audit persistence and Casper decision-proof submission.
9. JavaScript/TypeScript SDK, Python SDK, MCP server, Codex workflow, Intent Playground, and embedded documentation.
10. Railway backend and Vercel frontend deployment configuration.

The existing visual identity, fixed sidebar, wallet gating, eight broad protection areas, Connected Agents, Policies, Approval Queue, Audit Logs, Developer Portal, Intent Playground, and Docs were preserved.

## 2. Pre-implementation gap

The previous release had no independent persistent emergency-control state. A legacy agent-status label was not an enforceable circuit breaker and was unsuitable for scoped pauses, expiry, automatic triggers, approval-gated resume, or execution-confirmation rechecks.

Missing capabilities included:

- Persistent pause records.
- Platform, agent, capability, action, policy, Trading, Contract, Bridge, x402, and all-execution scopes.
- Deterministic Gateway pause evaluation.
- `Blocked` versus `Review Required` pause behavior.
- Automatic incident triggers.
- Expiry and indefinite pauses.
- Authorized direct resume.
- Human Approval quorum for resume.
- Audit records for activation, resume request, and resume.
- Integration Health and Security Coverage evidence.
- Operator UI and policy configuration.
- SDK, MCP, Gateway specification, and Intent Playground visibility.
- PostgreSQL and memory-store parity.

## 3. Implemented control model

Emergency Circuit Breaker now persists security-control records independently from agent status, credentials, and policies.

### Supported scopes

- `Platform`
- `All Execution`
- `Agent`
- `Capability`
- `Action`
- `Policy`
- `Trading`
- `Contract`
- `Bridge`
- `x402`

Agent-related scopes require an agent owned by the connected wallet. Capability scopes must match one of the selected agent's configured execution capabilities. Policy scopes require a valid owned policy. Action scopes bind to an exact normalized action type.

### Enforcement behavior

- A matching `Blocked` pause stops authorization.
- A matching `Review Required` pause stops autonomous execution and routes the intent to the existing Human Approval workflow where configured.
- `Blocked` takes precedence when multiple pauses match.
- Expired pauses no longer apply.
- The Gateway evaluates pause state before ordinary security controls.
- Execution confirmation evaluates pause state again so a transaction authorized before an incident cannot be recorded after a relevant pause becomes active.
- External agents, SDKs, and MCP integrations cannot bypass pause state.

### Pause lifecycle

Each pause stores:

- Owner wallet.
- Optional agent and policy binding.
- Scope and exact scope value.
- Enforcement action.
- Manual or automatic trigger.
- Trigger rule and sanitized evidence.
- Reason.
- Creation actor and timestamp.
- Expiry or indefinite state.
- Resume-authority wallet list.
- Approval-gated resume setting and quorum.
- Approval request binding where applicable.
- Resume actor, reason, and timestamp.
- Current status.

### Manual activation and resume

Owners can activate pauses from the existing Magen3 application or REST API. Duplicate active pauses for the same effective scope are rejected.

Resume requires:

- An active, unexpired pause.
- A wallet in the configured resume-authority set.
- A meaningful incident-resolution reason.
- Either direct authorization or the configured exact-bound Human Approval quorum.

When approval-gated resume is enabled, the pause remains active until quorum completes. Rejection or expiry does not resume execution.

### Automatic triggers

Automatic activation is opt-in and policy-controlled. Supported deterministic trigger candidates include:

- Replay attempts.
- Threat-intelligence hard matches.
- Oracle disagreement.
- Privileged-action failures.
- Repeated blocked requests.
- Request-frequency breaches.
- Spending spikes.
- Excessive unresolved executions.
- Excessive unresolved x402 settlements.
- Bridge failure thresholds.
- Casper proof or configured provider failures.

Automatic triggers use configured lookback windows, thresholds, enforcement action, duration, resume rules, and quorum. They do not use an opaque machine-learning score.

## 4. Database and migrations

An additive `emergency_pauses` table was added with indexes for owner, agent, status, and active-scope access patterns.

No existing table, migration history, agent, API key, policy, approval, audit record, or Casper proof field was removed or rewritten.

### Migration command

```bash
pnpm db:migrate
```

The PostgreSQL store also calls the existing migration runner during initialization, so Railway startup remains compatible with the established deployment flow.

### Memory-store parity

The memory store implements the same pause lifecycle, scope matching, automatic triggers, expiry, approval-gated resume, audit events, and execution-confirmation recheck as PostgreSQL.

## 5. Gateway and API changes

### Existing Gateway endpoint preserved

```http
POST /api/agent-gateway/intents
```

Existing Agent ID and API-key authentication headers remain unchanged.

### Additive response evidence

Gateway decisions may now include:

- `result.emergencyControlsContext`
- `emergencyPause`
- Emergency Circuit Breaker structured findings.
- Relevant Security Pipeline stages.
- Audit evidence with pause ID, scope, trigger, reason, enforcement action, and expiry.

### New owner-management endpoints

```http
GET  /api/emergency-controls/status?walletAddress=PUBLIC_OWNER_WALLET
GET  /api/emergency-pauses?walletAddress=PUBLIC_OWNER_WALLET
POST /api/emergency-pauses
POST /api/emergency-pauses/:id/resume
```

These endpoints follow the existing wallet-scoped operator-application boundary. This release does **not** claim that pause administration uses a separate cryptographic operator challenge.

## 6. Policy model

The existing `structuredRules` JSON model was extended with additive fields:

- `emergencyControlsEnabled`
- `automaticPauseEnabled`
- `emergencyAutomaticPauseAction`
- `emergencyRepeatedBlockThreshold`
- `emergencyReplayAttemptThreshold`
- `emergencyRequestFrequencyThreshold`
- `emergencyLookbackSeconds`
- `emergencySpendingSpikeMultiplier`
- `emergencyProviderFailureThreshold`
- `emergencyUnresolvedExecutionThreshold`
- `emergencyUnresolvedX402Threshold`
- `emergencyBridgeFailureThreshold`
- `emergencyPauseDurationSeconds`
- `emergencyResumeRequiresApproval`
- `emergencyResumeQuorum`
- `emergencyPauseOnThreatMatch`
- `emergencyPauseOnOracleDisagreement`
- `emergencyPauseOnPrivilegedActionFailure`

Automatic activation defaults to disabled. Existing policies receive safe, non-breaking derived defaults.

## 7. Finding and Risk Assessment integration

The evaluator emits structured findings using the existing model:

- `pass` when pause state was evaluated and no active pause applies.
- `warning` when a matching pause requires review.
- `fail` when a matching pause blocks execution.

Every finding includes the module, control rule, severity, message, evidence, and remediation. An unavailable or malformed pause state is never represented as a passing security result.

Risk precedence remains:

1. `Blocked`
2. `Review Required`
3. `Allowed`

## 8. Audit and Casper proof integration

Audit events are created for:

- Emergency Pause Activated.
- Emergency Resume Requested.
- Emergency Pause Resumed.
- Gateway requests affected by a pause.
- Automatic pause activation.
- Execution confirmation rejected because a pause became active.

The audit trail stores only necessary public and control evidence. It does not store private keys, mnemonics, wallet secrets, full API keys, raw signed transactions, or raw signed payment payloads.

Existing Casper decision-proof submission remains unchanged and receives the new deterministic audit evidence through the current proof pipeline.

## 9. Human Approval integration

Approval-gated resume reuses the existing exact-intent binding, authorized reviewer list, distinct reviewer responses, quorum, expiry, duplicate-response prevention, rejection behavior, and audit binding.

Human Approval & Quorum remains **Foundation Available** because reviewer responses are identified by wallet address but are not yet separately cryptographically signed. This release does not overstate that maturity.

## 10. Frontend and UX

The existing interface was preserved. No sidebar item was added for the control.

Emergency Controls now appear through progressive disclosure in:

- **Agent Details:** Active pause summary, scoped activation, expiry, resume authority, and incident-resolution workflow.
- **Settings:** Platform and owner-level control management.
- **Policies:** Essential configuration first, with automatic thresholds in a collapsed advanced section.
- **Dashboard:** Active-pause attention state and operational counts.
- **Connected Agents:** Paused-agent indicators.
- **Integration Health:** Actual active-pause and latest-finding state.
- **Security Coverage:** Deterministic configured and observed control contribution.
- **Intent Playground:** Matching pause evidence, automatic-trigger state, reason, scope, enforcement action, and expiry.
- **Docs:** Embedded product documentation and repository documentation.

No artificial delays, heavy backgrounds, extra glows, or decorative analytics were added.

## 11. SDK, MCP, and developer experience

### JavaScript/TypeScript SDK

Added response types for:

- `Magen3EmergencyPause`
- `Magen3EmergencyControlsContext`
- `Magen3DecisionResult.emergencyControlsContext`
- `Magen3IntentResponse.emergencyPause`

No existing method signature changed. The SDK cannot activate, resume, or bypass a pause.

### Python SDK

The existing dictionary-based response contract passes through Emergency Circuit Breaker context and pause evidence. No authentication or execution method changed.

### MCP

The MCP intent schema and server instructions explain that active pause state overrides ordinary authorization. `magen3_require_allowed` remains fail-closed for both `Blocked` and `Review Required`.

No pause-management MCP tool was added. Agent tools cannot administer or evade owner emergency controls.

## 12. Major files changed

### New files

- `backend/lib/emergencyControls.mjs`
- `backend/lib/emergencyPauseWorkflow.mjs`
- `backend/lib/emergencyControls.test.mjs`
- `backend/lib/emergencyControls.gateway.integration.test.mjs`
- `docs/EMERGENCY_CIRCUIT_BREAKER.md`

### Core backend and persistence

- `backend/db/schema.mjs`
- `backend/db/migrate.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`

### Frontend

- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`

### Developer integrations

- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/tests/test_client.py`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`

### Documentation and release metadata

- `README.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/MCP_SERVER.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/README.md`
- `package.json`

## 13. Verification actually executed

### Passed

- **225/225 backend tests**.
- Emergency control unit tests.
- Authenticated Gateway integration tests.
- Manual Blocked pause and authorized resume.
- Review Required pause and Human Approval creation.
- Approval-gated resume and automatic resume after quorum.
- Automatic repeated-block trigger.
- Expiry and scope matching.
- Blocked precedence across matching pauses.
- Execution confirmation rejection after a later pause.
- Memory-store and policy-engine paths.
- Security Coverage and Integration Health tests.
- **14/14 JavaScript SDK tests**.
- JavaScript SDK TypeScript build using the available system TypeScript compiler.
- **10/10 Python SDK tests**.
- **6/6 MCP core tests** using temporary source transpilation.
- **57 TypeScript/TSX source files** passed syntax transpilation.
- **71 JavaScript/ESM source files** passed Node syntax validation.
- Real memory-mode HTTP smoke test for health, status, activation, listing, direct resume, and final active count.

### Not executed and not claimed

- Root dependency-installed TypeScript project build.
- Vite production build.
- Full MCP stdio protocol test with installed external dependencies.
- Live Railway PostgreSQL migration and request flow.
- Live Casper Testnet proof confirmation.
- Live relayer submission.
- Browser Casper Wallet interaction.
- Live Vercel deployment.
- External threat, oracle, compliance, bridge, facilitator, or x402 provider calls.

The configured package registry returned HTTP 503 when Corepack attempted to retrieve pnpm, so dependency-backed root and MCP protocol builds could not be completed in this environment.

## 14. Local run instructions

Preserve your existing `.env` and install dependencies from the project root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:backend
```

In another terminal:

```bash
pnpm dev:frontend
```

Recommended verification after dependencies are available:

```bash
pnpm typecheck
pnpm test:backend
pnpm sdk:test
pnpm mcp:test
pnpm build
```

For temporary local memory mode only:

```bash
ALLOW_MEMORY_STORE=true pnpm dev:backend
```

Do not use memory mode as durable production storage.

## 15. Railway notes

- Keep the existing `DATABASE_URL`.
- Keep the current Casper contract hash and relayer configuration.
- Keep the private relayer key outside the ZIP and repository.
- Existing startup uses `node backend/server.mjs` and initializes the PostgreSQL store, which runs additive migrations.
- No destructive migration is introduced.
- Confirm the Railway logs show the `emergency_pauses` migration and successful server startup.
- Test activation, listing, Gateway enforcement, resume, and audit persistence against the deployed backend.

## 16. Vercel notes

- No new build command or deployment architecture is required.
- Keep the existing backend API URL and CORS configuration.
- Deploy after Railway has applied the additive migration.
- Verify Agent Details, Settings, Policies, Dashboard alerts, Intent Playground, mobile layout, wallet gating, and fixed-sidebar behavior.

## 17. Environment-variable changes

**No new environment variable is required.**

Existing database, API, Casper, relayer, feed, CORS, and frontend API variables remain unchanged.

## 18. Backward compatibility

Preserved:

- Existing Agent IDs.
- Existing API keys and hashes.
- Existing authentication headers.
- Existing policies and safe defaults.
- Existing audit records.
- Existing approval requests and binding behavior.
- Existing Gateway endpoint and intent envelope.
- Existing wallet connection.
- Existing Casper contract hash and proof flow.
- Existing relayer configuration.
- Existing Railway and Vercel setup.
- Existing YieldBot, Codex, SDK, MCP, x402, and Human Approval flows.
- Existing generic requests without emergency metadata.

Users do not need to recreate agents, credentials, policies, or approvals.

## 19. Updated control statuses

### Live

- Agent Authentication.
- Credential Lifecycle.
- Policy Enforcement.
- Emergency Circuit Breaker.
- Wallet Validation.
- Contract Validation.
- Transaction Preflight.
- Lifecycle & Replay.
- Token Approval & Permit Safety.
- Privileged Contract Action Classification.
- Deterministic Risk Assessment.
- Audit Persistence.
- Casper Decision-Proof Submission.

### Foundation Available

- Human Approval & Quorum.
- Asset Identity.
- Execution & Settlement Reconciliation.
- Stateful Execution Simulation.
- Oracle Validation.
- Bridge Controls.
- x402 Payment Controls.
- Threat Intelligence.
- Compliance Controls.

These controls retain their existing maturity because this release did not add the external verification required to promote them to Live.

### Planned roadmap controls

- Cryptographic Reviewer Signatures.
- Approval Escalation & Organizational Quorum.
- Contract Upgrade Safety.
- Contract Argument Policies.
- Agent Instruction Integrity.
- Tool & MCP Integrity.
- Delegation & Session Key Safety.
- RPC & Chain Integrity.
- Gas Sponsorship & Fee Safety.
- Production-grade reconciliation and simulation.
- Remaining asset, trading, bridge, x402, provider, and continuous-monitoring roadmap items.

## 20. Roadmap progress

Phase 1 now has three completed Live milestones:

1. Token Approval & Permit Safety.
2. Privileged Contract Action Classification.
3. Emergency Circuit Breaker.

Magen3 is not finished.

### Recommended next milestone

**Cryptographic Reviewer Signatures**

This should bind each approval or rejection to a one-time Casper Wallet challenge, verify the signer, reject replay and response mutation, and count only verified signatures toward quorum.

## 21. Manual QA checklist

- [ ] Existing wallet connects without regression.
- [ ] Dashboard remains available under the established wallet-gating rules.
- [ ] Other protected pages remain wallet gated.
- [ ] Fixed sidebar remains fixed during scrolling.
- [ ] Agent Details shows Emergency Controls.
- [ ] Settings shows owner-level Emergency Controls.
- [ ] Platform pause can be activated and listed.
- [ ] Agent pause applies only to the selected agent.
- [ ] Capability pause applies only to the selected configured capability.
- [ ] Action pause uses the exact normalized action type.
- [ ] Policy pause applies only when that policy is effective.
- [ ] Trading, Contract, Bridge, and x402 scopes match correctly.
- [ ] `Blocked` pause overrides a simultaneous `Review Required` pause.
- [ ] Expired pause no longer affects new requests.
- [ ] Direct authorized resume records a reason and audit event.
- [ ] Unauthorized resume is rejected.
- [ ] Approval-gated resume leaves the pause active until quorum.
- [ ] Rejected or expired resume approval leaves the pause active.
- [ ] Automatic triggers remain inactive until enabled in policy.
- [ ] Repeated blocked requests activate the configured automatic pause.
- [ ] Intent Playground shows exact pause evidence.
- [ ] Audit Logs update without full-page refresh or wallet reconnection.
- [ ] Execution confirmation is rejected when a matching pause becomes active after authorization.
- [ ] Security Coverage explains the emergency-control contribution.
- [ ] Integration Health reports active pauses as attention, not healthy.
- [ ] JavaScript SDK preserves emergency context.
- [ ] Python SDK preserves emergency context.
- [ ] MCP fails closed for paused intents.
- [ ] Desktop and mobile layouts remain usable.
- [ ] Railway migration creates `emergency_pauses` without modifying existing data.
- [ ] Casper proof submission remains compatible.

## 22. Conventional commit

```text
feat(policy-controls): add emergency circuit breaker
```
