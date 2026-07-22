# Execution Simulation Foundation Upgrade — July 22, 2026

Execution Simulation is now **Foundation Available**. The Agent Gateway deterministically validates safe transaction-construction metadata before wallet signing, persists structured findings and an adaptive pipeline stage, and explicitly reports full stateful Casper speculative execution as unavailable. No database migration, environment-variable change, Gateway route change, or Casper contract change is required.

See `Magen3-Execution-Simulation-Foundation-Report.md` in the release handoff for the complete verification and compatibility report.

---

# Magen3 Contract Validation Live Upgrade — Implementation Report

## Release summary

This release upgrades **Contract Validation** from **Foundation Available** to **Live** across the Magen3 Agent Shield execution path.

Contract-oriented intents are now evaluated deterministically before Magen3 returns Allowed, Blocked, or Review Required. The findings are included in the Gateway response, Risk Assessment, Security Pipeline, Audit Log, Security Coverage, Integration Health, Intent Playground, policy UI, official SDK guidance, MCP schema, README, and documentation.

The implementation preserves the existing Magen3 visual identity, Gateway endpoint, authentication headers, agent IDs, API-key model, policy records, Casper contract configuration, relayer flow, wallet flow, YieldBot compatibility, Codex flow, Railway configuration, and Vercel configuration.

## Live Contract Validation checks

Contract Validation runs whenever the normalized action or target classification is contract-oriented.

### 1. Contract-target classification

- `Contract Interaction`, `Swap`, and `Deposit to Vault` must use `Trusted Contract` or `Unknown Contract`.
- `RWA Proof Update` must use `RWA Registry`.
- `Oracle Data Update` must use `Oracle Feed`.
- A mismatched classification is blocked with evidence and remediation.

### 2. Casper contract identifier structure

Magen3 distinguishes:

- Contract Hash
- Contract Package Hash
- Ambiguous raw or `hash-...` 32-byte identifiers
- Wallet public keys
- Account hashes
- Malformed identifiers

Explicit forms such as `contract-...`, `contract-hash-...`, `contract-package-...`, and `contract-package-hash-...` are classified deterministically. A raw 64-character hash or `hash-...` value requires `contractIdentifierType` to state whether it is a Contract Hash or Package Hash.

Wallet public keys and `account-hash-...` values are rejected when used as contract identifiers.

### 3. Contract/package type consistency

When `contractIdentifierType` is supplied, it must match the actual identifier form. A Package Hash declared as a Contract Hash, or the reverse, is blocked.

### 4. Entry-point validation

- Direct `Contract Interaction` and user-friendly `Contract Call` actions require `entryPoint`.
- Entry points must use the supported deterministic character and length rules.
- High-level actions such as Swap remain backward compatible when the adapter has not resolved an exact entry point; identity and policy checks still run.
- When an entry point is supplied for any contract action, it is validated and can be restricted by policy.

### 5. Package-version semantics

- `contractVersion` is optional for Package Hash calls.
- A supplied package version must be a positive integer.
- `contractVersion` is rejected for a specific Contract Hash because that hash already identifies a concrete contract version.

### 6. Casper network consistency

When `chainName` is supplied, it must match the Gateway's configured `CASPER_CHAIN_NAME`. A mismatch is blocked.

When omitted, the finding records that the configured Gateway chain was used and recommends explicit network binding.

### 7. Explicit blocked-contract enforcement

`structuredRules.blockedContracts` is an exact deny list for Contract Hashes and Package Hashes. A matching contract is blocked regardless of the target label or risk mode.

### 8. Approved-contract enforcement

The existing `trustedContracts` policy list is now the exact approved-contract list.

- Approved exact identifier: pass
- Unapproved identifier under Conservative mode: Blocked
- Unapproved identifier under Balanced or Aggressive mode: Review Required

A `targetType` value such as `Trusted Contract` is descriptive only. It never grants trust by itself.

### 9. Entry-point allowlist

`structuredRules.allowedEntryPoints` optionally restricts the permitted entry-point names. A supplied entry point outside the list is blocked.

Every check produces a structured finding containing:

- Module
- Status: pass, warning, fail, skipped, or unavailable
- Severity
- Rule
- Message
- Evidence
- Remediation

## Gateway request additions

The existing request contract is preserved. The following optional action fields are now formally supported:

```json
{
  "action": {
    "type": "Contract Interaction",
    "target": "contract-package-hash-<64-hex-characters>",
    "targetType": "Trusted Contract",
    "contractIdentifierType": "Package Hash",
    "entryPoint": "deposit",
    "contractVersion": 1,
    "chainName": "casper-test"
  }
}
```

The Gateway also accepts a nested `action.contract` object and common snake_case equivalents without changing the canonical response shape.

`Contract Call` is normalized to the existing canonical `Contract Interaction` action so SDK and MCP clients can use a more familiar label without breaking policy behavior.

## Decision behavior

Contract Validation contributes directly to deterministic authorization:

- **Allowed** — the identifier, classification, network context, entry point, version semantics, approved-contract control, blocked-contract control, and configured entry-point rules pass.
- **Blocked** — a hard validation or policy rule fails, including malformed or ambiguous identity, wallet-as-contract misuse, incorrect target type, missing direct-call entry point, invalid package version, network mismatch, blocked contract, disallowed entry point, or Conservative-mode approval failure.
- **Review Required** — the contract is structurally valid but not approved under Balanced or Aggressive risk mode and no harder blocking rule applies.

No language model is used for authorization.

## Backward compatibility

The release preserves:

- `POST /api/agent-gateway/intents`
- `GET /api/agent-gateway/me`
- `x-magen3-agent-key`
- Bearer API-key authentication
- Existing Agent IDs and API-key hashes
- Existing policies and audit records
- Existing `trustedContracts` behavior, now enforced by exact contract identity
- Existing high-level Swap requests when no entry point has been resolved
- Existing Casper contract hash and decision-proof relayer
- Existing wallet signing boundary
- YieldBot, Codex, JavaScript SDK, Python SDK, and MCP authentication models
- Railway and Vercel configuration

Existing demo policies containing non-hash labels may need their approved target list replaced with exact Casper Contract Hashes or Package Hashes before those contract intents can be Allowed. This is an intentional security correction rather than an API break.

## Policy configuration

The Policies interface now supports:

- **Trusted Targets** — existing exact approved wallet/contract targets
- **Blocked Contracts** — stored in `structuredRules.blockedContracts`
- **Allowed Contract Entry Points** — stored in `structuredRules.allowedEntryPoints`

Existing structured policy data is preserved when a policy is edited.

## Security Pipeline and audit integration

Contract-oriented requests now expose a truthful pipeline containing a Contract Validation stage only when that module is evaluated.

New audit records preserve:

- Original contract intent
- Contract identifier type
- Entry point
- Package version when supplied
- Chain name
- Active policy
- Contract Validation findings
- Passed and failed checks
- Primary reason
- Triggered rule
- Suggested remediation
- Final decision
- Pipeline stages
- Casper decision-proof status and timestamps
- Execution hash when later attached

## Frontend changes

### Protection Modules

Contract Validation is now marked **Live**, with current checks and remaining future checks explained separately.

### Policies

Policy create/edit forms include blocked-contract and entry-point controls while preserving existing rule fields.

### Intent Playground

Added authenticated examples for:

- Approved contract call
- Unapproved contract
- Malformed contract identifier
- Missing direct-call entry point
- Wrong Casper chain

The request editor remains fully editable and uses the unchanged live Gateway route.

### Security Coverage

For contract-relevant agents, recent live protection coverage now requires actual Contract Validation evidence rather than decorative configuration points.

### Integration Health

The agent health model reports Contract Validation as:

- Healthy when the latest evaluated contract checks passed
- Attention when warnings or failures exist
- Unknown when no real Contract Validation evidence exists

## SDK and MCP changes

The TypeScript SDK action type now documents and accepts:

- `contractIdentifierType`
- `entryPoint`
- `contractVersion`
- `chainName`

The MCP input schema and intent-schema tool expose the same optional fields. Python remains dictionary-based and is compatible without a code-level API change. JavaScript, Python, MCP, Codex, and integration documentation now contain contract-call guidance.

## Major files changed

- `backend/lib/contractValidation.mjs`
- `backend/lib/contractValidation.test.mjs`
- `backend/lib/contractGateway.integration.test.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/lib/securityModel.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `backend/data/seed.mjs`
- `backend/server.mjs`
- `src/app/lib/securityModel.ts`
- `src/app/App.tsx`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-js/README.md`
- `packages/sdk-python/README.md`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`
- `README.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/OFFICIAL_SDKS.md`
- `docs/MCP_SERVER.md`
- `IMPLEMENTATION_REPORT.md`

## Database and migrations

This release introduces **no new database columns and no new migration**.

Approved contracts reuse `trustedContracts`. Blocked contracts and allowed entry points use the existing `structuredRules` JSON field. Contract intent metadata uses the existing original-intent and structured audit fields.

No database backup is required for the user's current disposable demo-data deployment workflow.

## Environment variables

No new environment variable is required.

Contract network validation uses the existing:

- `CASPER_CHAIN_NAME`

All current Railway, Vercel, database, RPC, contract-hash, CORS, wallet, and relayer variables remain unchanged.

## Verification completed

Verified in the implementation environment:

- Backend JavaScript syntax checks
- **40/40 backend and security tests**
- Authenticated HTTP Gateway smoke test
- Allowed direct contract call through the real server route
- `Contract Call` to `Contract Interaction` normalization
- Contract Validation findings in the Gateway response
- Contract Validation stage in the Security Pipeline
- Audit persistence
- **4/4 JavaScript SDK tests** using a generated local build
- **2/2 Python SDK tests**
- TypeScript/TSX syntax transpilation for **57 source files**
- Documentation and module-status consistency checks

The package registry returned HTTP 503, so a fresh workspace dependency installation, full root TypeScript project check, Vite production build, and compiled MCP protocol test could not be repeated in this sandbox. The edited MCP source passed TypeScript syntax transpilation. Run the normal complete verification locally before pushing:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

Live Casper Wallet signing, the funded relayer, Railway PostgreSQL, and production Vercel-to-Railway CORS still require verification in the deployed environment.

## Protection Module status after this release

### Live

- Identity and Authentication
- Policy Enforcement
- Wallet Validation
- **Contract Validation**
- Risk Assessment

### Foundation Available

- None

### Preview

- Execution Simulation
- Threat Intelligence

### Planned

- Oracle Validation
- Bridge Controls
- Compliance Controls

## Suggested commit message

```text
feat(contract-validation): enforce live Casper contract checks before execution
```

Suggested body:

```text
Add deterministic contract/package identity validation, target classification,
entry-point and package-version checks, network binding, exact approved and
blocked contract controls, entry-point allowlists, structured findings, audit
evidence, pipeline stages, Playground cases, SDK/MCP fields, coverage, health,
and documentation while preserving the existing Gateway and Casper contracts.
```
