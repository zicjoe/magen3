# Magen3 Agent Instruction Integrity Implementation Report

## Release

- Milestone: Agent Instruction Integrity
- Protection area: Agent Shield → Agent Trust & Access
- Control status: Live
- Application version: 2.0.0
- Source baseline: `magen3-contract-argument-policies-upgrade.zip`
- Next roadmap milestone: Tool & MCP Integrity

## 1. Architecture found before editing

The source release contained a Vite/React/TypeScript frontend, Node ESM backend, deterministic independent evaluators combined by `policyEngine.mjs`, PostgreSQL through Drizzle, an aligned memory-store fallback, flexible JSON policy and audit fields, exact-bound Human Approval, Casper decision-proof submission, JavaScript and Python SDKs, MCP/Codex integration, Railway and Vercel configuration, and the existing eight-area Agent Shield interface.

The existing Gateway already accepted additive nested action metadata and persisted the normalized intent and structured findings. This allowed Instruction Integrity to reuse the current policy, approval, audit, and storage architecture without a new database table.

## 2. Gap found

Instruction Integrity was marked Planned. The release did not have:

- a deterministic provenance and goal-binding evaluator;
- normalized instruction-provenance metadata;
- source-domain or external-content policy;
- protected-parameter fingerprints for original-goal comparison;
- tool permission-scope containment;
- x402 external-resource self-authorization prevention;
- policy fields, UI, audit context, Security Coverage, Integration Health, Playground examples, SDK/MCP schemas, documentation, or dedicated tests.

## 3. Implementation

### Gateway metadata

The Gateway now accepts optional unsigned metadata under `action.instructionIntegrity`:

- `goalId`
- `originalUserGoalHash`
- `initiatedBy`
- `intentSource`
- `toolName`
- `toolServer`
- `sourceDomains`
- `externalContentUsed`
- `userConfirmed`
- `sourceTrustLevel`
- `parameterChangeReason`
- `originalParameterHash`
- `currentParameterHash`
- `originalPermissionScopes`
- `currentPermissionScopes`

Aliases under `action.provenance`, snake_case fields, and the existing additive body normalization pattern remain supported.

### Deterministic checks

The new `Agent Instruction Integrity` evaluator enforces:

- stable goal ID and original user-goal hash for configured sensitive actions;
- SHA-256 and structural validation of supplied provenance;
- deterministic current-parameter fingerprinting over action, amount, assets, destination, contract, network, entry point, and runtime arguments;
- supplied-current-hash comparison against Magen3's normalized fingerprint;
- allowed and blocked source domains, including subdomains;
- protected-parameter change detection after goal creation;
- policy-controlled change reason and explicit user confirmation;
- high-risk action handling for untrusted external content;
- prevention of an external x402 resource authorizing payment to its own merchant domain without independent confirmation;
- prevention of tool/MCP output expanding its own permission scope.

Blocked sources, malformed or contradictory provenance, current-hash substitution, x402 self-authorization, and tool scope expansion fail closed. Other violations follow Observe, Review, or Enforce policy behavior.

### Decision model

The final outcomes remain only:

- Allowed
- Blocked
- Review Required

Blocked retains precedence over Review Required, which retains precedence over Allowed. No language model participates in authorization.

### Policy fields

Added to `structuredRules`:

- `instructionIntegrityEnabled`
- `instructionIntegrityMode`
- `requireGoalBindingForActions`
- `requireUserConfirmationForExternalContent`
- `allowedSourceDomains`
- `blockedSourceDomains`
- `externalContentHighRiskAction`
- `allowParameterChangesAfterGoal`
- `requireParameterChangeReason`

New starter policies enable Review mode with goal binding for sensitive execution, external-content confirmation, and parameter-change protection. Existing policies without the control remain backward compatible.

### Audit and pipeline

Audit records now preserve minimal normalized provenance and hashes inside the existing original-intent JSON. They do not require raw prompts, emails, documents, credentials, signatures, or wallet secrets.

The Security Pipeline adds the relevant `Agent Instruction Integrity` stage only when evaluated. The response includes `instructionIntegrityContext` with goal, source, confirmation, fingerprints, permission scopes, violations, and the explicit limitation of the control.

### Frontend

The existing visual design and navigation were preserved. Added:

- Instruction Integrity policy fields under Agent Trust & Access;
- progressive disclosure for advanced domain and parameter controls;
- Security Coverage contribution and recommendations;
- Integration Health status based on actual findings;
- Intent Playground examples for trusted goal binding, external destination change, tool scope expansion, and missing goal evidence;
- decision-result provenance context;
- Settings link to the status endpoint.

No new sidebar item or flat protection-module card was added.

### Developer integrations

Updated:

- JavaScript/TypeScript SDK metadata and response types;
- Python SDK examples and pass-through tests;
- MCP intent description and Zod request schema;
- MCP fail-closed security boundary;
- Gateway API, integration, SDK, MCP, platform, README, and dedicated control documentation.

SDKs and MCP submit metadata only. They do not read private prompts, approve execution, access wallet secrets, or sign transactions.

## 4. Major files changed

- `backend/lib/instructionIntegrity.mjs`
- `backend/lib/instructionIntegrity.test.mjs`
- `backend/lib/instructionIntegrity.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `docs/AGENT_INSTRUCTION_INTEGRITY.md`
- related README and integration documents

## 5. Database and migration instructions

No database migration is required.

The control uses existing additive JSON fields for:

- structured policy rules;
- normalized original intent;
- structured findings;
- pipeline stages;
- Human Approval binding;
- audit context.

PostgreSQL and memory-store code paths normalize and persist the same evidence. A live PostgreSQL database was not available in the local environment, so deployed Railway PostgreSQL remains a manual verification item.

## 6. Environment variables

No new environment variable is required.

Existing Railway, Vercel, Casper relayer, CORS, database, and wallet settings remain unchanged.

## 7. Local run

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm run build
pnpm test
```

Memory-store development still requires the existing explicit opt-in:

```bash
ALLOW_MEMORY_STORE=true pnpm dev:api
```

## 8. Railway notes

- No migration is required for this milestone.
- Preserve `DATABASE_URL`, Casper relayer variables, contract hash, CORS, and private relayer key.
- Railway should run `pnpm install --frozen-lockfile` and `pnpm run build` through the existing Dockerfile.
- After deployment, verify `GET /api/health` reports version `2.0.0` and `GET /api/instruction-integrity/status` reports `live`.
- Submit one trusted goal-bound request and inspect the persisted audit evidence.

## 9. Vercel notes

- No Vercel configuration or environment-variable change is required.
- Confirm the Policies page exposes Instruction Integrity settings.
- Confirm the Intent Playground loads the new examples and displays the returned context.
- Confirm no wallet-gating or fixed-sidebar regression.

## 10. Backward compatibility

Preserved:

- existing Agent IDs and API keys;
- existing policy and audit records;
- existing Human Approval and organizational quorum bindings;
- Casper contract hash, relayer, and decision proofs;
- Gateway endpoint and authentication headers;
- JavaScript SDK, Python SDK, MCP, Codex, and YieldBot flows;
- generic requests without provenance when the active policy does not require the control;
- Railway, Vercel, and CORS behavior.

No user must recreate an agent, API key, or policy.

## 11. Verification actually executed

- Backend and security regression suite: **283/283 passed**
- Focused Instruction Integrity tests: **10/10 passed**
- Frontend security-model tests: **18/18 passed**
- JavaScript SDK tests: **17/17 passed**
- Python SDK tests: **12/12 passed**
- MCP core tests: **12/12 passed**
- JavaScript SDK TypeScript compilation: passed
- Frontend ES2020 semantic TypeScript project check: passed
- TypeScript/TSX parser validation: **58 files passed**
- JavaScript/ESM syntax validation: **89 files passed**
- JSON parsing: **15 files passed**
- Memory-store HTTP health endpoint: passed
- Memory-store Instruction Integrity status endpoint: passed
- Unsupported newer-library scan across frontend and developer packages: no matches

### Build limitation

The exact dependency-installed root command `pnpm run build` could not be executed because Corepack's configured package endpoint returned HTTP 503 while downloading pnpm 10.14.0. A matching prior lockfile dependency directory contained TypeScript only, not React/Vite, so it could not substitute for the complete build.

The frontend nevertheless passed an ES2020 semantic project check with module declarations, and the JavaScript SDK compiled with the system TypeScript compiler. Railway and Vercel must still perform the final frozen-lockfile `tsc -b && vite build` after deployment. This report does not claim that the local Vite production build passed.

Live Casper Wallet, Casper Testnet proof submission, relayer confirmation, Railway PostgreSQL, and Vercel browser checks require the deployed environment and were not claimed as locally executed.

## 12. Updated control statuses

### Newly Live

- Agent Instruction Integrity

### Existing Live retained

- Agent Authentication and credential lifecycle
- Deterministic Policy Enforcement
- Emergency Circuit Breaker
- Approval Escalation & Organizational Quorum
- Wallet Validation
- Contract Validation
- Token Approval & Permit Safety
- Privileged Contract Action Classification
- Contract Upgrade Safety
- Contract Argument Policies
- Transaction Preflight
- Lifecycle & Replay
- Audit persistence
- Casper decision-proof submission

### Foundation Available retained

- Human Approval & Quorum
- Cryptographic Reviewer Signatures pending deployed Casper Wallet verification
- Execution and settlement reconciliation
- Stateful simulation
- Oracle Validation
- Bridge Controls
- x402 Payment Controls
- Threat Intelligence
- Compliance Controls

### Planned next

- Tool & MCP Integrity
- Delegation & Session Key Safety
- Later Phase 3–5 controls from the retained roadmap

## 13. Roadmap progress

Phase 1 deterministic permission and approval safety remains complete. Phase 2 agent-native trust has started, and Agent Instruction Integrity is now implemented. Magen3 is not finished.

Recommended next milestone: **Tool & MCP Integrity**.

## 14. Conventional commit

```text
feat(agent-trust): add instruction integrity controls
```

## 15. Manual QA checklist

- Create a new policy and inspect Agent Trust & Access → Instruction Integrity.
- Confirm advanced source-domain and parameter-change controls remain progressively disclosed.
- Register a new agent and confirm the starter policy enables Review mode.
- Run the trusted goal-bound Playground example and inspect the pass findings.
- Run the missing-goal example and confirm Review Required under Review mode.
- Run the external webpage destination-change example and inspect parameter hashes and confirmation findings.
- Run the tool scope-expansion example and confirm Blocked.
- Add a blocked source domain and confirm it fails closed.
- Submit an x402 payment whose source domain matches its merchant without user confirmation and confirm Blocked.
- Inspect Audit Logs for goal ID, source domains, fingerprints, confirmation state, scopes, violations, and no raw source content.
- Confirm Security Coverage requires both deterministic configuration and an observed pass.
- Confirm Integration Health shows attention after a provenance failure.
- Confirm an existing legacy agent and policy still accept the existing request shape.
- Confirm wallet gating, fixed sidebar, Docs navigation, mobile layout, API-key rotation, Human Approval, Casper proofs, and prior controls remain functional.
