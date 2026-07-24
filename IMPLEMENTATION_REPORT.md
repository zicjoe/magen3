# Magen3 Approval Escalation & Organizational Quorum — Implementation Report

## Release summary

- **Release:** 1.7.0
- **Milestone:** Approval Escalation & Organizational Quorum
- **Protection area:** Agent Shield → Policy & Approval Controls → Approval Rules
- **Control status:** **Live**
- **Source baseline:** corrected Cryptographic Reviewer Signatures deployment-fix release
- **Next Phase 1 milestone:** Contract Upgrade Safety

Magen3 now resolves deterministic approval tiers, enforces named organizational-role quorums, activates explicitly configured backup or emergency reviewers over time, and constrains an approved intent with execution delays and bounded signing windows. The implementation extends the existing exact-bound Human Approval workflow; it does not create a second approval path or permit an agent to approve itself.

## 1. Architecture verified before editing

The source ZIP contains:

- React + TypeScript + Vite frontend with the existing fixed sidebar and wallet-gated experience.
- Node ESM backend with a deterministic evaluator/policy architecture.
- PostgreSQL/Drizzle persistence and an aligned memory-store fallback.
- Agent ID plus hashed API-key Gateway authentication.
- Structured findings and ordered Security Pipeline evidence.
- Exact-bound Human Approval, quorum, expiry, rejection, agent polling, and optional Casper reviewer-signature verification.
- Emergency Circuit Breaker enforcement.
- Audit persistence and Casper decision-proof submission.
- JavaScript/TypeScript SDK, Python SDK, MCP integration, Codex guidance, Intent Playground, and Developer Portal documentation.
- Railway Docker deployment and Vercel frontend deployment configuration.

## 2. Frontend structure

The existing `src/app/App.tsx` application remains intact. The release extends:

- **Policies:** organizational quorum enablement, named group JSON, deterministic tier JSON, organization defaults, escalation rules, emergency groups, delays, windows, strict validation, and safe presets.
- **Human Approval Queue:** resolved tier, group progress, active/escalated groups, missing roles, execution-delay state, window state, and whether wallet signing may proceed.
- **Security Coverage:** deterministic evidence for organizational configuration and successful evaluation.
- **Integration Health:** actual organizational finding states, pending groups, configuration failures, and observed pass evidence.
- **Agent Shield:** the control appears inside the existing Policy & Approval Controls area. No new sidebar item was introduced.

The prior Emergency Circuit Breaker deployment fix is retained: `StatusBadge` accepts all actual pause states and `EmergencyPause.status` remains a strict backend-compatible union.

## 3. Backend structure

A dedicated deterministic module was added:

- `backend/lib/organizationalApproval.mjs`

It handles:

- group, tier, default, and escalation normalization;
- deterministic tier matching and tie-breaking;
- distinct-wallet role quorum;
- backup-role substitution only after explicit activation;
- emergency-group activation;
- execution-delay and execution-window state;
- configuration validation;
- structured organizational findings;
- public approval progress summaries.

The module is integrated into the existing approval workflow, stores, Gateway result, Audit Logs, status routes, and execution confirmation gate.

## 4. Database and migrations

### New migration

**None required for this milestone.**

The existing policy `structured_rules`, approval `review_context`, approval response JSON, audit findings, and pipeline JSON fields can persist all organizational evidence without weakening relational integrity or changing existing records.

The cumulative project still includes prior additive migrations, including the reviewer-signature challenge table and emergency-pause table. Railway should continue running the existing migration command during normal deployment.

PostgreSQL and memory-store behavior were updated together. PostgreSQL persists refreshed escalation state, resolved tier, active group membership, group response evidence, timing state, and audit findings.

## 5. Gateway contract

The public Gateway endpoint is unchanged:

```text
POST /api/agent-gateway/intents
```

No new required intent field was introduced. The workflow uses existing normalized evidence:

- amount;
- action type;
- agent execution capabilities;
- contract/target identity;
- effective policy;
- privileged-action minimum quorum where relevant.

For `Review Required`, the existing approval object now additionally exposes sanitized:

- resolved tier;
- organizational quorum state;
- role/group progress;
- escalation history and next escalation;
- execution-not-before time;
- execution-window end;
- delay remaining;
- window status;
- `mayProceedToSigning`.

## 6. Policy model

The control extends `structuredRules` with:

- `approvalOrganizationalQuorumEnabled`
- `approvalGroups`
- `approvalTiers`
- `approvalOrganizationDefaults`
- `approvalEscalationRules`
- `approvalEmergencyGroupIds`
- `approvalExecutionDelaySeconds`
- `approvalExecutionWindowSeconds`

When organizational quorum is enabled, the resolved tier or organizational default determines the approval count instead of applying one flat legacy count to every tier. Privileged-action policy may still raise that minimum.

Legacy policies without organizational fields retain their existing flat Single/Quorum behavior.

## 7. Finding model

The control uses the existing structured finding contract:

- evaluator/protection area;
- control;
- `pass`, `warning`, `fail`, `unavailable`, or `skipped`;
- severity;
- rule;
- message;
- evidence;
- remediation.

Important behaviors:

- malformed, contradictory, impossible, or missing organizational configuration becomes `unavailable`/`Configuration Required` rather than passing;
- pending role quorum or timing gates produce explained warnings;
- approved, role-complete, in-window requests produce pass evidence;
- rejected, expired, or cancelled requests produce fail evidence.

## 8. Audit model

Audit evidence now includes:

- resolved tier and matching context;
- effective required total approvals;
- required groups and quotas;
- reviewer membership groups;
- roles each response satisfied;
- active backup/emergency groups;
- escalation history;
- execution delay and signing window;
- current timing status;
- exact approval binding;
- cryptographic verification evidence where enabled;
- whether signing is currently authorized.

No private keys, mnemonics, full API keys, raw reviewer signatures, raw signed transactions, or personal identity data are stored.

## 9. Human Approval implementation

The existing Human Approval workflow remains the only approval authority. This release adds:

- deterministic tier resolution;
- named role requirements;
- distinct-wallet group counting;
- explicit backup substitution;
- timed escalation;
- value-, capability-, action-, and contract-aware quorum;
- action-specific quorum floors;
- execution delay;
- bounded signing window;
- fresh-intent requirement after window expiry;
- execution-confirmation recheck.

Cryptographic Reviewer Signatures remains **Foundation Available** until the deployed Casper Wallet browser flow is verified. Organizational quorum itself is **Live** because its deterministic backend enforcement, persistence, execution gate, HTTP workflow, and integration tests were executed successfully.

## 10. Eight protection areas and current control status

### Agent Trust & Access

- Agent Authentication — Live
- Credential Lifecycle — Live
- Instruction Integrity — Planned
- Tool & MCP Integrity — Planned
- Delegation & Session Key Safety — Planned

### Policy & Approval Controls

- Deterministic Policy Enforcement — Live
- Review Thresholds — Live
- Human Approval & Quorum — Foundation Available
- Cryptographic Reviewer Signatures — Foundation Available
- Approval Escalation & Organizational Quorum — **Live**
- Emergency Circuit Breaker — Live

### Wallet & Asset Safety

- Wallet Identity and Destination Validation — Live
- Wallet Spending Controls — Live
- Asset Identity and Network Consistency — Foundation Available
- Asset Contract/Market Risk — Planned

### Contract & Permission Safety

- Contract Identity and Allowlists — Live
- Entry Point and Package Version Controls — Live
- Token Approval & Permit Safety — Live
- Privileged Contract Action Classification — Live
- Contract Upgrade Safety — Planned
- Contract Argument Policies — Planned

### Execution Integrity

- Transaction Preflight — Live
- Lifecycle & Replay — Live
- Execution and Settlement Reconciliation — Foundation Available
- Stateful Simulation — Foundation Available
- RPC & Chain Integrity — Planned
- Gas Sponsorship & Fee Safety — Planned

### Market & Oracle Integrity

- Slippage and Output Bounds — Live
- Oracle Validation — Foundation Available
- MEV & Execution Quality — Planned
- Trading Route Integrity — Planned
- Market Risk Signals — Planned

### Cross-chain & Payment Controls

- Bridge Controls — Foundation Available
- x402 Authorization — Foundation Available
- x402 Settlement Reconciliation — Foundation Available
- Real provider/facilitator integrations — Planned

### Threat & Compliance

- Threat Intelligence — Foundation Available
- Compliance Controls — Foundation Available
- Production providers and Continuous Monitoring — Planned

## 11. SDK and MCP structures

### JavaScript/TypeScript SDK

Approval response types now expose:

- organizational tier;
- group progress;
- escalation evidence;
- timing/window state;
- reviewer membership and satisfied-role groups.

### Python SDK

The existing dictionary-preserving client returns the same sanitized evidence. Regression tests confirm it remains compatible.

### MCP

MCP agents may poll organizational approval state but cannot:

- approve or reject;
- request reviewer-signature challenges;
- add reviewers;
- activate escalation early;
- shorten delays;
- extend signing windows;
- bypass missing role groups.

MCP guidance fails closed while role quorum, delay, or window conditions are incomplete.

## 12. Gap analysis completed

Before this release, Magen3 had flat authorized-wallet quorum but lacked:

- named organizational roles;
- deterministic value/action/capability/contract tiers;
- backup and emergency approver activation;
- timed escalation;
- role-specific quorum;
- execution delays;
- bounded signing windows;
- organizational evidence in Audit, SDK, MCP, Security Coverage, and Integration Health.

All milestone gaps above are implemented.

## 13. Exact implementation plan executed

1. Verify the corrected reviewer-signature release.
2. Add deterministic organizational normalization and validation.
3. Resolve immutable approval tiers at request creation.
4. Enforce role quotas and distinct total quorum.
5. Reuse exact-intent and cryptographic-signature infrastructure.
6. Add backup/emergency escalation without weakening original roles.
7. Gate execution with delays and bounded windows.
8. Persist memory/PostgreSQL state and audit evidence.
9. Add Policy and Approval Queue UX.
10. Extend Security Coverage and Integration Health.
11. Extend SDK, Python, MCP, API, and product documentation.
12. Execute regression, semantic type, HTTP, and packaging checks.

## 14. Genuine blockers and unavailable checks

The configured Corepack package endpoint returned HTTP 503 when downloading pnpm 10.14.0. Therefore, this environment could not execute the dependency-installed root command:

```text
pnpm run build
```

To prevent a repeat of the earlier Railway/Vercel TypeScript defect, the release did execute a semantic TypeScript project check over the frontend using the system TypeScript compiler and module declarations, plus parser validation over every TypeScript/TSX source.

External checks that require deployed infrastructure were not claimed:

- Railway PostgreSQL migration/startup;
- deployed Casper Wallet browser signing;
- Casper Testnet relayer confirmation;
- Vercel production deployment;
- full dependency-installed MCP stdio protocol test.

## 15. Major files changed

### Added

- `backend/lib/organizationalApproval.mjs`
- `backend/lib/organizationalApproval.test.mjs`
- `backend/lib/organizationalApproval.gateway.integration.test.mjs`
- `docs/APPROVAL_ESCALATION_ORGANIZATIONAL_QUORUM.md`

### Updated

- `backend/lib/approvalWorkflow.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `backend/server.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/test/core.test.mjs`
- SDK/MCP/API/platform/Human Approval documentation
- `README.md`
- `package.json`

## 16. Local run instructions

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm run build
pnpm test:backend
pnpm sdk:test
pnpm mcp:test
pnpm dev
```

For deliberate local memory mode only:

```bash
ALLOW_MEMORY_STORE=true CASPER_RECORDING_MODE=manual pnpm dev:backend
```

## 17. Railway notes

- Keep the existing `DATABASE_URL` and relayer environment.
- The release adds no new migration, but Railway should run cumulative migrations normally.
- No new required environment variable exists.
- Confirm `/api/health` reports version `1.7.0`.
- Confirm `/api/approval-workflow/status` reports `approvalEscalationAndOrganizationalQuorum: live`.
- Test a real PostgreSQL organizational approval request after deployment.

## 18. Vercel notes

- No Vercel configuration change is required.
- Preserve the existing API base URL and CORS configuration.
- Verify Policy preset/edit validation and Human Approval Queue timing states after deployment.
- Run the production build before merging if CI is available.

## 19. Environment-variable changes

**None required.**

## 20. Compatibility notes

Preserved:

- existing Agent IDs and API keys;
- existing API-key hashes;
- existing policies and flat quorum;
- existing approval requests and responses;
- exact approval bindings;
- reviewer-signature challenges;
- emergency pauses;
- audit records;
- Gateway endpoint and authentication headers;
- Casper contract hash, proof payload, and relayer;
- Railway and Vercel setup;
- JavaScript/Python SDK methods;
- MCP and Codex integration;
- YieldBot and legacy requests.

Existing approval requests remain governed by their persisted context. Policy edits do not silently rewrite an approval already under review.

## 21. Verification executed

- Backend/security regression: **249/249 passed**
- JavaScript SDK: **15/15 passed**
- Python SDK: **10/10 passed**
- MCP core: **10/10 passed** through temporary dependency-free transpilation
- JavaScript/ESM syntax: **77 files passed**
- TypeScript/TSX parser validation: **58 files passed**
- Frontend semantic TypeScript check: **passed**
- Memory-store HTTP flow: version, control status, tier resolution, role quorum, approval, and signing authorization **passed**

## 22. Manual QA checklist

- [ ] Create a Treasury policy using the Team Quorum preset.
- [ ] Create a Treasury + Security policy with at least four distinct authorized wallets.
- [ ] Verify under-1,000, 1,000–10,000, and over-10,000 CSPR tier resolution.
- [ ] Verify two Treasury approvals do not satisfy a required Security role.
- [ ] Verify one wallet cannot count twice toward distinct quorum.
- [ ] Verify an unauthorized wallet cannot respond.
- [ ] Verify backup reviewers are ineligible before escalation.
- [ ] Verify an activated backup satisfies only its configured original role.
- [ ] Verify signing remains blocked during the execution delay.
- [ ] Verify signing opens only inside the configured window.
- [ ] Verify window expiry requires a fresh intent/approval.
- [ ] Verify protected parameter changes invalidate the old approval binding.
- [ ] Verify signed organizational approvals with Casper Wallet.
- [ ] Verify Audit Logs show tier, groups, responses, escalation, delay, and window.
- [ ] Verify agent SDK/MCP polling shows missing roles and timing gates.
- [ ] Verify mobile and desktop Policy/Approval Queue layout.
- [ ] Verify Railway PostgreSQL persistence after restart.

## 23. Roadmap progress

Completed Phase 1 milestones:

1. Token Approval & Permit Safety — Live
2. Privileged Contract Action Classification — Live
3. Emergency Circuit Breaker — Live
4. Cryptographic Reviewer Signatures — Foundation Available pending deployed wallet verification
5. Approval Escalation & Organizational Quorum — **Live**

Remaining Phase 1:

6. Contract Upgrade Safety
7. Contract Argument Policies

## 24. Conventional commit

```text
feat(policy-controls): add organizational approval escalation
```

## 25. Recommended next milestone

**Contract Upgrade Safety** under:

```text
Agent Shield
→ Contract & Permission Safety
→ Contract Upgrades
```

It should reuse Privileged Action Classification, exact approval binding, organizational quorum, execution delays, and approved implementation lists rather than duplicating those systems.
