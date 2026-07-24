# Magen3 Contract Argument Policies Implementation Report

Release: **1.9.0**  
Milestone: **Contract Argument Policies**  
Protection area: **Agent Shield → Contract & Permission Safety**  
Control status: **Live**

## 1. Source of truth

The implementation was made directly against `magen3-contract-upgrade-safety-upgrade.zip`. No older Magen3 source tree, schema, API contract, or assumed architecture was used as a substitute.

## 2. Architecture verified before editing

- Frontend: React, TypeScript, Vite, fixed-sidebar wallet-gated application in `src/app/App.tsx`.
- Backend: Node ESM HTTP service with deterministic protection evaluators composed by `backend/lib/policyEngine.mjs`.
- Persistence: PostgreSQL through Drizzle and an explicitly enabled memory-store fallback.
- Policy data: stable policy fields plus additive advanced `structuredRules` JSON.
- Audit data: normalized original intent, findings, pipeline stages, approval binding, Casper proof state, and execution reconciliation in existing JSON-capable records.
- Human Approval: exact normalized-intent binding, quorum, organizational groups, escalation, delays, windows, and optional reviewer-signature verification.
- Developer integrations: JavaScript/TypeScript SDK, Python SDK, MCP, Gateway specification, and Intent Playground.

The existing Gateway already normalized public `action.preflight.runtimeArgs`. The missing capability was deterministic per-contract and per-entry-point argument enforcement.

## 3. Implemented milestone

Contract Argument Policies now evaluates public unsigned runtime arguments before wallet signing.

### Exact scope binding

A rule matches only one canonical contract identifier and one exact entry point. Multiple matching rules fail closed. A configured control with no matching rule follows the explicit `Warn`, `Review`, or `Block` policy.

### Supported checks

- Required argument names
- Allowed argument names
- Unknown-argument behavior
- String and text values
- Numeric and decimal values
- Integer and Casper unsigned-integer families
- Boolean values
- Casper and EVM address formats
- Arrays, lists, tuples, objects, and maps
- Numeric minimum and maximum limits
- Address allowlists
- Address blocklists
- Allowed boolean values
- Allowed enum values
- Malformed or contradictory rule configuration

A blocked address hard-blocks in every mode. Relevant unavailable or malformed evidence never counts as a pass.

### CLValue-compatible public values

The evaluator accepts ordinary JSON values and public CLValue-style envelopes containing `parsed` or `value`. Numeric strings are supported so large Casper integer values can be evaluated without JavaScript rounding.

### Deterministic fingerprint

Magen3 computes a SHA-256 fingerprint over:

- canonical contract identifier;
- exact entry point;
- recursively canonicalized runtime arguments with stable key ordering.

The fingerprint is stored in the decision context and audit evidence.

### Human Approval binding

No duplicate approval mechanism was created. The existing Human Approval binding already covers the complete normalized intent, including `runtimeArgs`. Changing any protected argument changes the intent binding and argument fingerprint, invalidating the earlier authorization.

## 4. Decision behavior

The shared outcome precedence remains unchanged:

1. Blocked
2. Review Required
3. Allowed

Modes:

- `Observe`: ordinary violations produce non-blocking warnings.
- `Review`: ordinary violations produce Review Required.
- `Enforce`: ordinary violations block.

Policy fields:

- `contractArgumentControlsEnabled`
- `contractArgumentMode`
- `contractArgumentUnknownRuleAction`
- `contractArgumentUnknownArgumentAction`
- `contractArgumentRules`

Rule-level `unknownArgumentAction` can override the policy default.

## 5. Shared finding and pipeline integration

The new evaluator emits the existing structured finding model:

- `pass`
- `warning`
- `fail`
- `unavailable`
- `skipped`

Each finding contains the control, rule, message, received/expected evidence where applicable, and remediation.

The visible pipeline now includes the real `contract-argument-policies` stage only when the module produces relevant findings. No artificial delay or fake stage was added.

## 6. Audit integration

Audit records preserve:

- normalized public `runtimeArgs`;
- exact target and entry point;
- matching rule ID;
- required and allowed names;
- structured findings;
- received and expected values;
- violations;
- canonical parameter fingerprint;
- effective policy;
- final decision;
- exact Human Approval binding;
- Casper decision-proof state;
- later execution state where available.

The control does not accept or require private keys, mnemonics, wallet signatures, raw signed transactions, wallet approvals, provider credentials, or secret application data.

## 7. Frontend and product experience

The existing visual identity and navigation were preserved.

### Policies

Contract Argument Policies appears in the existing Contract & Permission Safety policy section with:

- enable/disable;
- Observe, Review, or Enforce mode;
- no-matching-rule action;
- unknown-argument action;
- collapsed advanced JSON rule editor;
- rule validation and duplicate contract/entry-point rejection.

The control defaults to disabled until an exact rule is deliberately configured. This prevents unrelated existing contract calls from being unexpectedly routed to review.

### Agent Shield and Agent Details

- The broad eight-area model remains unchanged.
- Contract Argument Policies is marked Live within Contract & Permission Safety.
- Security Coverage requires deterministic configuration and an observed passing evaluation.
- Integration Health surfaces pass, warning, fail, and unavailable states from actual findings.

### Intent Playground

A rule-matched contract-call example is generated from the first configured Contract Argument Policy rule. It uses the existing Playground and Gateway flow rather than a separate demo subsystem.

## 8. API, SDK, and MCP

### API

- Health version updated to `1.9.0`.
- Health capabilities include Contract Argument Controls.
- Added `GET /api/contract-argument-controls/status`.
- Gateway response may include `contractArgumentPoliciesContext`.
- Gateway specification documents the context and security boundary.

### JavaScript/TypeScript SDK

- Added typed `Magen3ContractArgumentPoliciesContext` support.
- Public runtime arguments continue through the existing intent envelope.
- Context, violations, and fingerprint remain available to clients.

### Python SDK

- Existing dictionary-based contract remains backward compatible.
- Dedicated tests verify runtime-argument and returned context pass-through.

### MCP

- Intent schema documents `runtimeArgs`.
- Security boundary states that MCP may submit public unsigned values but cannot approve, sign, override policy, or send secrets.
- Dedicated core tests verify the boundary.

## 9. Database and migrations

No migration is required.

The milestone reuses existing fields:

- policy `structuredRules`;
- normalized original intent JSON;
- module findings JSON;
- pipeline stages JSON;
- approval binding;
- audit context.

PostgreSQL and memory-store authorization paths share the same evaluator and data contract. No schema history was removed or rewritten.

## 10. Backward compatibility

Preserved:

- Agent IDs
- API keys and hashes
- Existing agents
- Existing policies
- Existing audits
- Existing approvals
- Gateway endpoint and authentication headers
- Wallet flow
- Casper contract and proof system
- Railway and Vercel configuration
- YieldBot and Codex integration contracts
- JavaScript SDK methods
- Python SDK methods
- MCP tools
- Emergency Circuit Breaker
- Token Permission Controls
- Privileged Action Controls
- Contract Upgrade Safety

Legacy policies do not activate Contract Argument Policies automatically. Existing requests without new policy configuration remain compatible.

## 11. Major files changed

### Added

- `backend/lib/contractArgumentPolicies.mjs`
- `backend/lib/contractArgumentPolicies.test.mjs`
- `backend/lib/contractArgumentPolicies.gateway.integration.test.mjs`
- `docs/CONTRACT_ARGUMENT_POLICIES.md`
- `CONTRACT_ARGUMENT_POLICIES_IMPLEMENTATION_REPORT.md`

### Updated

- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- JavaScript SDK, Python SDK, and MCP tests and documentation
- Gateway, platform, SDK, MCP, and root documentation
- `package.json`

## 12. Verification actually executed

Successful checks:

- **271/271 backend tests passed**
- **11/11 dedicated Contract Argument evaluator and Gateway tests passed**
- **16/16 frontend security-model tests passed**
- **16/16 JavaScript SDK tests passed**
- **11/11 Python SDK tests passed**
- **11/11 MCP core tests passed**
- JavaScript SDK TypeScript compilation passed
- Frontend ES2020 semantic TypeScript project validation passed
- **57** TypeScript/TSX implementation files passed parser validation
- **83** JavaScript/ESM source files passed `node --check`
- **14** JSON files parsed successfully
- Source scan found no `.at()`, `replaceAll()`, `Object.hasOwn()`, `Array.fromAsync()`, or `Promise.withResolvers()` usage in TypeScript sources
- Memory-store HTTP health and status endpoints passed
- Authenticated memory-store HTTP Gateway flow passed
- Allowed decision, matching rule ID, fingerprint, pipeline stage, and audit persistence were verified

## 13. Checks not claimed

The exact dependency-installed command was attempted:

```bash
pnpm run build
```

Corepack could not download pnpm 10.14.0 because the configured package endpoint returned HTTP 503. Therefore, the dependency-installed Vite production build is not claimed as executed locally.

The source did pass semantic ES2020 TypeScript validation specifically intended to catch the same unsupported-library and component-prop errors that previously stopped Railway and Vercel builds.

The following require deployed infrastructure and were not claimed:

- Live Railway PostgreSQL migration/startup check
- Live Vercel deployment
- Casper Testnet relayer submission
- Casper Wallet browser signing
- External threat/oracle/compliance providers

## 14. Environment variables

No new environment variable is required.

Keep existing Railway and Vercel variables unchanged. Do not add `ALLOW_MEMORY_STORE=true` to the production Railway service.

## 15. Deployment instructions

1. Extract the replacement ZIP.
2. Replace the files in the current Magen3 project.
3. Preserve `.git`, `.env`, and the private relayer key.
4. Commit and push.
5. Confirm Railway runs its normal frozen-lockfile build and backend startup.
6. Confirm Vercel completes `tsc -b && vite build`.
7. Confirm:
   - `/api/health` reports `1.9.0`;
   - `/api/contract-argument-controls/status` reports `live`;
   - an Allowed rule-matched Playground request returns `contractArgumentPoliciesContext`;
   - a blocked-address or over-limit example returns Blocked or Review Required according to policy;
   - Audit Logs update without reconnecting the wallet.

## 16. Manual QA checklist

- [ ] Existing wallet connection and gating still work.
- [ ] Existing agents and API keys remain usable.
- [ ] Create a policy with Contract Argument Policies disabled and confirm legacy behavior.
- [ ] Enable the control and save one exact rule.
- [ ] Confirm malformed JSON cannot be saved.
- [ ] Confirm duplicate contract/entry-point rules cannot be saved.
- [ ] Submit a matching Allowed request.
- [ ] Submit a missing-required-argument request.
- [ ] Submit an unknown-argument request.
- [ ] Submit a type mismatch.
- [ ] Submit a numeric value below and above its range.
- [ ] Submit an address outside the allowlist.
- [ ] Submit an explicitly blocked address and confirm hard Blocked.
- [ ] Submit a forbidden boolean.
- [ ] Submit an invalid enum.
- [ ] Confirm Review mode creates exact-bound Human Approval where enabled.
- [ ] Change one runtime argument and confirm the fingerprint and approval binding change.
- [ ] Confirm pipeline and audit details contain the new findings.
- [ ] Confirm Security Coverage explains missing configuration.
- [ ] Confirm Integration Health shows attention for a violation.
- [ ] Confirm desktop, mobile navigation, fixed sidebar, Docs, and Intent Playground remain usable.

## 17. Updated control status and roadmap

### Live

- Agent authentication and credential lifecycle
- Policy enforcement
- Emergency Circuit Breaker
- Organizational approval escalation and quorum rules
- Wallet Validation
- Contract Validation
- Token Approval & Permit Safety
- Privileged Contract Action Classification
- Contract Upgrade Safety
- Contract Argument Policies
- Transaction preflight
- Lifecycle & Replay
- Deterministic Risk Assessment
- Audit persistence
- Casper decision-proof submission

### Foundation Available

- Human Approval & Quorum end-to-end browser maturity
- Cryptographic Reviewer Signatures pending deployed Casper Wallet verification
- Execution Simulation
- Execution and Settlement Reconciliation
- Threat Intelligence provider foundation
- Oracle Validation provider foundation
- Bridge Controls provider foundation
- Compliance Controls provider foundation
- x402 authorization and settlement foundation

### Planned next

Phase 1 deterministic permission and approval safety is complete. The recommended next milestone is **Agent Instruction Integrity**, beginning Phase 2 — Agent-native trust.

## 18. Conventional commit

```text
feat(contract-safety): add contract argument policies
```
