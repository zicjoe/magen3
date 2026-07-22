# Magen3 Agent Shield Upgrade — Implementation Report

## Summary

This release upgrades the existing Magen3 application without replacing its architecture or visual identity. Agent Shield is now the live centerpiece of the platform, agents support multiple execution capabilities, onboarding is guided, decisions expose structured deterministic findings, audit records show a real execution timeline, and the frontend adds Security Coverage, recommendations, Integration Health, Agent Insights, and an authenticated Intent Playground.

The existing gateway route, authentication headers, Agent IDs, API-key model, wallet ownership flow, policy fields, audit routes, SDKs, MCP server, deployment configuration, Casper contract hash, and execution-confirmation behavior remain compatible.

## Major files changed

- `src/app/App.tsx`
  - Guided six-step agent registration
  - Capability packs and multi-capability selection
  - Agent Shield overview and honest Protection Modules matrix
  - Security Coverage, recommendations, Integration Health, and Agent Insights
  - Intent Playground using the real Gateway contract
  - Structured findings, Security Guidance, and audit execution timeline
  - Dashboard, Connected Agents, landing page, in-app Docs, wallet gating, fixed navigation, and audit auto-refresh improvements
- `src/app/lib/securityModel.ts`
  - Shared capabilities, protection statuses, templates, deterministic coverage scoring, recommendations, and health logic
- `backend/lib/securityModel.mjs`
  - Backend capability normalization, legacy mapping, module recommendations, templates, and pipeline helpers
- `backend/lib/policyEngine.mjs`
  - Deterministic structured findings and explainable risk aggregation while preserving existing decision outcomes
- `backend/store/memoryStore.mjs`
  - Capability-aware agents/policies, enriched audit evidence, proof timeline updates, and integration activity timestamps
- `backend/store/postgresStore.mjs`
  - PostgreSQL equivalents of the new model and timeline behavior
- `backend/db/schema.mjs`
  - Additive Drizzle schema fields
- `backend/db/migrate.mjs`
  - Safe additive migration and conservative legacy backfill
- `backend/server.mjs`
  - Versioned health output, aligned public product metadata, and expanded Gateway specification
- `backend/data/seed.mjs`
  - Agent Shield Protection Modules while retaining the existing bootstrap field for compatibility
- `backend/lib/policyEngine.test.mjs`
- `backend/lib/securityModel.test.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
  - Decision, capability, coverage, recommendation, and health tests
- `README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/README.md`
  - Unified product model, routes, security status, deployment, and troubleshooting documentation

## Database migration

The migration is additive and preserves existing rows.

### Agent additions

- `execution_capabilities`
- `capability_configuration`
- `onboarding_status`
- `last_intent_at`
- `last_decision_at`

Legacy agents are mapped conservatively from the existing `type`. Unknown or non-inferable agents receive `Custom`.

### Policy additions

- `template_type`
- `capability_scope`
- `structured_rules`

Existing policies inherit the registered agent's capability scope when possible.

### Audit additions

- `original_intent`
- `pipeline_stages`
- `module_findings`
- `primary_reason`
- `triggered_rule`
- `suggested_resolution`
- `capability_context`
- `proof_submitted_at`
- `proof_confirmed_at`

### Migration procedure

1. Back up the Railway PostgreSQL database.
2. Deploy the backend first. The PostgreSQL store runs `runMigrations()` during startup.
3. Alternatively, run `pnpm db:migrate` once with the production `DATABASE_URL` available.
4. Confirm `/api/health` reports `storage: "postgres"`.
5. Open an existing agent and confirm its Agent ID, credential preview, policy, and old audit history remain present.

The migration SQL was syntax-reviewed and the migration module passed Node syntax checks. A live PostgreSQL migration was not executed in the isolated test environment because no production-like PostgreSQL service or production data was available.

## Local run

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm dev:backend
```

In a second terminal:

```bash
pnpm dev:frontend
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`
- Health: `http://localhost:8787/api/health`

For temporary local storage, keep `ALLOW_MEMORY_STORE=true`. Production should use PostgreSQL and should not rely on memory mode.

## Railway deployment

No Railway configuration-file change is required.

1. Keep the existing PostgreSQL service and `DATABASE_URL`.
2. Keep `CORS_ORIGIN` aligned with the deployed Vercel frontend.
3. Deploy the updated backend.
4. Confirm the startup migration completes and `/api/health` returns `ok: true` and `storage: "postgres"`.
5. Confirm the relayer configuration before expecting Casper proofs to move from queued to recorded.

## Vercel deployment

No Vercel configuration-file change is required.

1. Set `VITE_API_URL` to the Railway backend URL.
2. Keep the existing Casper network, RPC, and contract-hash variables.
3. Deploy after the Railway backend is healthy.
4. Test wallet gating, agent bootstrap, and the Intent Playground against the production API.

## Environment variables

No new mandatory environment variable was introduced.

Existing required production values remain:

- `DATABASE_URL`
- `CORS_ORIGIN`
- `PUBLIC_API_BASE_URL`
- `VITE_API_URL`
- `VITE_CASPER_NETWORK`
- `VITE_CASPER_RPC_URL`
- `VITE_MAGEN3_CONTRACT_HASH`
- `MAGEN3_CONTRACT_HASH`
- `CASPER_NETWORK`
- `CASPER_CHAIN_NAME`
- `CASPER_RPC_URL`
- `CASPER_RECORDING_MODE`

For automatic Casper Decision Proofs, configure exactly one relayer secret source:

- `CASPER_RELAYER_SECRET_KEY_B64` — recommended on Railway
- `CASPER_RELAYER_SECRET_KEY_PEM`
- `CASPER_RELAYER_SECRET_KEY_PATH` — local/server filesystem only

Never commit the raw relayer key or agent API keys.

## Compatibility notes

Preserved:

- Existing Agent IDs and API-key hashes
- One-time raw-key display and masked previews
- `POST /api/agent-gateway/intents`
- `GET /api/agent-gateway/me`
- `x-magen3-agent-key` and Bearer authentication
- Existing request field names
- Existing policy fields and deterministic outcomes
- Existing audit and execution-confirmation routes
- Casper contract hash and proof payload contract
- YieldBot, Codex, JavaScript SDK, Python SDK, and MCP authentication model
- Railway and Vercel configuration

The bootstrap response still exposes `shieldModules` so older frontend consumers do not break, but the records now describe Agent Shield Protection Modules rather than separate product shields.

The Intent Playground does not recover stored secrets. It uses a raw key still available from the current registration/rotation session or a key entered locally by the developer. The key is not persisted by the Playground.

## Protection-module status

### Live

- Identity and Authentication
- Policy Enforcement
- Risk Assessment

### Foundation Available

- Wallet Validation
- Contract Validation

These currently use trusted-target controls and execution-wallet evidence. They are not represented as full address-reputation or contract-analysis systems.

### Preview

- Execution Simulation
- Threat Intelligence

The backend reports relevant unavailable checks honestly. These modules do not silently contribute a pass.

### Planned

- Oracle Validation
- Bridge Controls
- Compliance Controls

No live authorization claim is made for these modules.

## Verification completed

Passed:

- TypeScript project type checking
- 12 backend/security-model tests
- JavaScript/TypeScript SDK build and 3 tests
- Python SDK 2 tests
- MCP server build and 4 tests
- Production Vite build
- Node syntax checks for backend server, stores, migration, and seed data
- Memory-store HTTP smoke test covering:
  - Multi-capability registration
  - Policy creation
  - Agent credential verification
  - Allowed
  - Review Required
  - Blocked by amount
  - Blocked by action rule
  - Structured findings
  - Completed audit-storage stage
  - Queued proof state when relayer is intentionally disabled
  - Updated Protection Modules bootstrap data

The repository has no configured lint script, so a separate linter could not be run. TypeScript, builds, automated tests, source scans, and syntax checks were used instead.

## External checks not performed in the isolated environment

These require the user's live services or browser environment:

- Casper Wallet extension connection and signing
- A funded production relayer submitting and confirming a Casper Testnet proof
- Migration against the user's Railway PostgreSQL data
- Vercel-to-Railway production CORS behavior
- Live YieldBot, Codex, browser-use, and external-agent credentials
- Responsive visual inspection in the user's target browsers and physical mobile device

## Suggested commit message

```text
feat(platform): upgrade Magen3 Agent Shield onboarding and security pipeline
```

## Manual QA checklist

- [ ] Back up Railway PostgreSQL before deployment.
- [ ] Confirm `/api/health` reports PostgreSQL and the expected Casper configuration.
- [ ] Connect and disconnect Casper Wallet; verify every protected page shows a consistent wallet gate.
- [ ] Register an agent with two or more capabilities.
- [ ] Test each capability pack and customize its selection.
- [ ] Create a recommended policy, clone an existing policy as a template, and create a custom policy.
- [ ] Copy the one-time API key, close onboarding, and confirm the raw key is not recoverable afterward.
- [ ] Verify the agent using the Developer Portal or cURL.
- [ ] Use the Intent Playground for Allowed, Blocked, and Review Required examples.
- [ ] Confirm findings, primary reason, triggered rule, remediation, and pipeline stages match the request.
- [ ] Confirm a new audit record appears automatically without reconnecting the wallet or manually refreshing.
- [ ] Confirm the proof timeline changes from queued/submitted to recorded or failed according to the real relayer result.
- [ ] Attach an execution hash only to an Allowed record and confirm non-Allowed records reject it.
- [ ] Check Security Coverage recommendations link to the relevant page.
- [ ] Check Agent Insights counts and common reason/rule summaries against audit history.
- [ ] Verify the fixed desktop sidebar, mobile menu, Docs navigation, keyboard focus, empty states, and modal scrolling.
- [ ] Run the deployed YieldBot, Codex, SDK, and MCP integrations without changing their existing Agent ID/key contract.
