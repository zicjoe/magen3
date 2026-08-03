# Magen3 Tool & MCP Integrity Implementation Report

## Release summary

- **Release:** Magen3 2.1.0
- **Milestone:** Tool & MCP Integrity
- **Protection area:** Agent Trust & Access
- **Control maturity:** Live
- **Source of truth:** `magen3-agent-instruction-integrity-upgrade.zip`
- **Database migration:** None
- **New required environment variables:** None
- **Casper contract change:** None
- **Relayer change:** None

Tool & MCP Integrity is implemented as a deterministic pre-signing evaluator. It verifies the exact MCP server and tool identity, version, approved hashes, transport assertion, origin, credential scope, permission scopes, and agent capability boundary. It does not use a language model to determine authorization.

## 1. Architecture found in the source ZIP

The source release contains:

- React, Vite, and TypeScript frontend
- Node ESM backend and Gateway
- Independent deterministic security evaluators
- Risk Assessment precedence: Blocked → Review Required → Allowed
- PostgreSQL storage with Drizzle migrations
- Aligned memory-store fallback
- Structured findings and ordered Security Pipeline
- Exact-intent Human Approval and organizational quorum
- Casper decision-proof submission
- JavaScript/TypeScript SDK
- Python SDK
- Official MCP server and Codex integration
- Railway Docker deployment
- Vercel frontend deployment

The implementation extends these systems rather than introducing a second authorization path.

## 2. Frontend structure

The existing fixed-sidebar and wallet-gated interface remains intact. The milestone was integrated into:

- Agent Shield → Agent Trust & Access
- Protection Modules catalog
- Policy creation and editing
- Security Coverage
- Integration Health
- Intent Playground
- Developer Portal status links
- Embedded MCP documentation

No new sidebar item or generic dashboard was added.

## 3. Backend structure

A new evaluator was added at:

- `backend/lib/toolMcpIntegrity.mjs`

It is called by the existing policy engine and returns the standard finding structure:

- module
- status
- severity
- rule
- message
- evidence
- remediation

The evaluator contributes to the existing final-decision precedence and does not bypass Wallet Validation, Contract Validation, Instruction Integrity, lifecycle/replay, policy limits, Human Approval, audit persistence, or Casper proofs.

## 4. Database and migrations

No database migration is required.

Existing JSON-backed fields already support:

- policy configuration in `structuredRules`
- normalized tool metadata in `originalIntent`
- structured findings
- pipeline stages
- final decision evidence

Both memory and PostgreSQL stores normalize and persist the same sanitized Tool & MCP evidence.

## 5. Gateway contract

The existing endpoint remains unchanged:

```http
POST /api/agent-gateway/intents
```

Optional public unsigned metadata is accepted under:

```json
{
  "action": {
    "toolIntegrity": {
      "mcpServerId": "magen3-official-mcp",
      "toolName": "magen3_check_intent",
      "toolVersion": "0.4.0",
      "manifestHash": "SHA256",
      "schemaHash": "SHA256",
      "descriptionHash": "SHA256",
      "permissionScopes": ["magen3:intent:check"],
      "credentialScope": "agent-gateway",
      "tls": true,
      "toolOrigin": "@magen3/mcp-server",
      "approvedAt": "OPTIONAL_ISO_8601"
    }
  }
}
```

Supported aliases are normalized without changing the public Gateway envelope.

The Gateway continues rejecting private keys, wallet signatures, raw signed transactions, API secrets inside intent JSON, and other signing material.

## 6. Policy model

The control uses additive `structuredRules` fields:

- `toolIntegrityEnabled`
- `toolIntegrityMode`
- `approvedMcpServers`
- `approvedTools`
- `requireManifestHash`
- `requireSchemaHash`
- `requireTls`
- `allowToolVersionChanges`
- `unknownToolAction`
- `permissionExpansionAction`

Server binding format:

```text
server-id|https://server.example|manifestSha256
```

The URL may be blank for an approved local stdio adapter.

Tool binding format:

```text
server-id|tool.name|version|manifestHash|schemaHash|descriptionHash|scope1,scope2|credential-scope|origin
```

Legacy policies without `toolIntegrityEnabled: true` remain compatible.

## 7. Finding and decision model

The evaluator performs deterministic checks for:

- structurally valid server and tool metadata
- approved MCP server ID or URL
- server manifest binding
- approved server/tool pair
- required manifest hash
- required schema hash
- tool manifest binding
- tool schema binding
- tool description binding
- version changes
- tool-origin binding
- secure HTTPS or trusted local stdio transport assertion
- permission-scope containment
- credential-scope containment
- registered-agent capability containment for `capability:*` scopes

Decision behavior:

- Explicit malformed evidence and critical material mismatches fail closed.
- Unknown servers and tools follow `unknownToolAction`.
- Permission expansion follows `permissionExpansionAction`.
- Required unavailable evidence never counts as a pass.
- Observe mode records non-critical policy violations without authorizing unsafe hard-block conditions.
- Review mode produces Review Required for configured review conditions.
- Enforce mode blocks configured violations and unavailable required evidence.

## 8. Audit model

Audit records store sanitized evidence only:

- server ID and URL
- tool name and version
- manifest, schema, and description hashes
- permission scopes
- credential-scope label
- transport assertion
- origin
- approval timestamp
- approved-server result
- approved-tool result
- material-change state
- violations
- structured findings and remediation

MCP credentials and secret tool output are not stored.

## 9. Human Approval integration

Tool & MCP Integrity reuses the existing exact-intent approval binding. A Review Required result can create the current Human Approval request when the active policy enables it. Tool identity, hashes, origin, scopes, and all normalized intent fields are protected by the same exact-intent binding.

The control does not create a parallel approval system and does not weaken organizational quorum or reviewer-signature requirements.

## 10. Eight protection-area implementation

The eight-area model remains unchanged. Tool & MCP Integrity appears inside:

- **Agent Trust & Access**

It is not added as a ninth area or a new sidebar section.

## 11. Official MCP integration

The official `@magen3/mcp-server` now automatically injects stable integrity evidence when the caller does not supply downstream-tool metadata.

Official server binding:

- server ID: `magen3-official-mcp`
- package version: `0.4.0`
- origin: `@magen3/mcp-server`
- credential-scope label: `agent-gateway`
- transport: trusted local stdio assertion

Official tools:

- `magen3_check_intent`
- `magen3_require_allowed`

Each tool has an exact manifest, schema, description, and least-privilege permission-scope binding. New policy forms include these exact bindings by default. Explicit downstream `action.toolIntegrity` metadata is preserved and is not overwritten.

This verifies deterministic adapter evidence. It does not certify arbitrary tool source code or eliminate supply-chain risk.

## 12. SDK and MCP structures

### JavaScript/TypeScript SDK

Added typed request metadata and response context for Tool & MCP Integrity. The SDK preserves public unsigned evidence and never accepts tool credentials as part of the control contract.

### Python SDK

The existing dictionary-based client preserves Tool & MCP request metadata and returned context. Dedicated tests verify the behavior.

### MCP

The MCP intent schema, Zod schema, security boundary, documentation, and core tests now include Tool & MCP Integrity. The official adapter injects its own stable evidence when appropriate.

## 13. Security Coverage and Integration Health

Security Coverage includes Tool & MCP Integrity only when:

- the control is enabled
- an approved server is configured
- an approved tool is configured
- required binding controls are configured
- a recent relevant evaluation produced a real pass

Integration Health reports attention when recent Tool & MCP findings fail or required evidence is unavailable. It does not report Healthy solely because policy fields exist.

## 14. Intent Playground

Added examples for:

- approved unchanged MCP tool
- changed schema
- unknown tool
- permission-scope expansion

The Playground displays the real Gateway decision, findings, pipeline, context, audit ID, and remediation.

## 15. Compatibility

Preserved:

- Agent IDs
- API keys and hashes
- existing policies
- existing audits and approvals
- Gateway endpoint and authentication headers
- wallet flow
- Casper contract hash and decision proofs
- relayer configuration
- Railway and Vercel configuration
- JavaScript SDK methods
- Python SDK methods
- MCP tools
- Codex integration
- x402 integration
- legacy requests without tool metadata

No agent, key, or policy recreation is required.

## 16. Major files changed

- `backend/lib/toolMcpIntegrity.mjs`
- `backend/lib/toolMcpIntegrity.test.mjs`
- `backend/lib/toolMcpIntegrity.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/securityModel.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `docs/TOOL_MCP_INTEGRITY.md`
- supporting README and integration documentation

## 17. Verification executed

Successfully executed:

- **296/296 backend tests**
- **11/11 focused Tool & MCP backend tests**
- **20/20 frontend security-model tests**
- **18/18 JavaScript SDK tests**
- **13/13 Python SDK tests**
- **15/15 MCP core tests**
- JavaScript SDK TypeScript compilation
- MCP core TypeScript compilation
- frontend ES2020 semantic TypeScript project check
- 57 TypeScript/TSX source parser checks
- 92 JavaScript/ESM syntax checks
- 14 JSON parse checks
- memory-store HTTP health and status checks
- authenticated memory-store HTTP Gateway flow with exact official MCP bindings
- Allowed decision, approved server/tool context, dedicated pipeline stage, and audit persistence

The exact root build command was attempted:

```bash
pnpm run build
```

Corepack could not download pnpm 10.14.0 because the configured package endpoint returned HTTP 503. Therefore, this report does not claim that the dependency-installed Vite build ran in this environment.

The full MCP stdio protocol test also requires the unavailable external MCP dependencies. MCP core compilation and tests were run with the compiled workspace SDK and temporary minimal type/runtime stubs; those temporary files are excluded from the release ZIP.

## 18. Local run

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
pnpm run build
pnpm test:backend
pnpm sdk:test
pnpm mcp:test
```

For temporary memory mode only:

```bash
ALLOW_MEMORY_STORE=true pnpm dev:backend
```

## 19. Railway notes

- Preserve the existing Dockerfile and `railway.json`.
- No migration is required.
- No new environment variable is required.
- Confirm `GET /api/health` reports version `2.1.0`.
- Confirm `GET /api/tool-mcp-integrity/status` reports `live`.
- Railway should run the normal frozen-lockfile build.

## 20. Vercel notes

- Preserve `vercel.json` and the current Vite settings.
- Keep `VITE_API_URL` pointed at the Railway backend.
- Confirm policy creation/editing, Intent Playground, and embedded Docs render after deployment.
- Vercel should run the normal TypeScript and Vite build.

## 21. Environment-variable changes

None.

The existing MCP environment remains:

- `MAGEN3_GATEWAY_URL`
- `MAGEN3_AGENT_ID`
- `MAGEN3_API_KEY`
- optional `MAGEN3_TIMEOUT_MS`
- optional `MAGEN3_AUTH_MODE`

These credentials remain local MCP configuration and are never copied into intent metadata.

## 22. Updated control statuses

### Newly Live

- Tool & MCP Integrity

### Existing Live controls preserved

- Agent Authentication
- Credential Lifecycle
- Policy Enforcement
- Emergency Circuit Breaker
- Approval Escalation & Organizational Quorum
- Wallet Validation
- Contract Validation
- Token Approval & Permit Safety
- Privileged Contract Action Classification
- Contract Upgrade Safety
- Contract Argument Policies
- Agent Instruction Integrity
- Transaction Preflight
- Lifecycle & Replay
- Risk Assessment
- Audit persistence
- Casper decision-proof submission

### Foundation Available controls preserved

- Human Approval & Quorum overall workflow maturity
- Cryptographic Reviewer Signatures pending deployed browser verification
- Execution Simulation
- Execution and Settlement Reconciliation
- Threat Intelligence provider integration
- Oracle Validation provider integration
- Bridge provider integration
- x402 live settlement integration
- Compliance provider integration

### Next Planned milestone

- Delegation & Session Key Safety

## 23. Roadmap progress

- Phase 1 deterministic permission and approval safety: complete
- Phase 2 Agent-native trust:
  - Agent Instruction Integrity: Live
  - Tool & MCP Integrity: Live
  - Delegation & Session Key Safety: next

Magen3 is not finished.

## 24. Conventional commit

```text
feat(agent-trust): add tool and MCP integrity controls
```

## 25. Manual QA checklist

- [ ] Create a new policy and confirm the official MCP bindings are prefilled.
- [ ] Save and reopen the policy; verify all hashes and scopes persist.
- [ ] Submit the approved official MCP example; expect Allowed when all other policy checks pass.
- [ ] Change the schema hash; expect Blocked.
- [ ] Change the manifest hash; expect Blocked.
- [ ] Use an unknown MCP server; expect the configured Warn, Review, or Block behavior.
- [ ] Use an unknown tool; expect the configured behavior.
- [ ] Add an unapproved permission scope; expect the configured permission-expansion behavior.
- [ ] Request a `capability:*` scope the agent does not possess; expect Blocked.
- [ ] Set `tls: false` under a TLS-required policy; expect Blocked.
- [ ] Confirm the audit detail displays hashes and scopes but no credentials.
- [ ] Confirm Security Coverage explains missing configuration or missing observed pass evidence.
- [ ] Confirm Integration Health reports attention after a failed Tool & MCP evaluation.
- [ ] Run `magen3_check_intent` through the official MCP server without explicit downstream metadata and inspect the injected official binding.
- [ ] Run with explicit downstream metadata and confirm it is preserved.
- [ ] Confirm legacy non-tool Gateway requests continue working.
- [ ] Confirm fixed sidebar, wallet gating, mobile layout, and Docs navigation remain intact.

## 26. Recommended next milestone

**Delegation & Session Key Safety** under Agent Trust & Access.

## 27. Packaged artifact verification

The replacement ZIP was extracted into a clean directory and independently retested:

- 296/296 backend tests passed
- 18/18 JavaScript SDK tests passed after SDK compilation
- 13/13 Python SDK tests passed
- 15/15 MCP core tests passed after core compilation
- frontend ES2020 semantic TypeScript validation passed
- packaged memory-store HTTP health and status checks passed
- packaged authenticated official-MCP Gateway request returned Allowed
- approved server and approved tool evidence were true
- the `tool-mcp-integrity` pipeline stage was present
- sanitized tool identity persisted in the packaged audit record
