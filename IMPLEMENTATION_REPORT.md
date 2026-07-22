# Magen3 Bridge Controls Foundation — Implementation Report

## Release summary

Bridge Controls has moved from **Planned** to **Foundation Available**.

This release adds deterministic, provider-agnostic cross-chain route validation to the existing Magen3 Gateway. It preserves the current API endpoint, per-agent authentication model, wallet connection flow, policy records, audit records, Casper proof contract, relayer configuration, SDK authentication, MCP authentication, Railway configuration, and Vercel configuration.

Bridge Controls is not labeled Live because Magen3 does not currently operate a bridge adapter, maintain a certified bridge-provider registry, verify provider liquidity or solvency, observe destination-chain finality, or prove cross-chain message delivery. The module evaluates submitted route metadata and policy boundaries honestly before wallet signing.

## Implemented behavior

Bridge and cross-chain transfer intents can include provider-supplied `action.bridge` metadata:

- Source chain
- Destination chain
- Provider
- Route ID
- Destination address
- Bridged asset
- Absolute fee and/or fee in basis points
- Expected destination output
- Minimum received
- Quote timestamp
- Quote expiry
- Source confirmation requirement
- Destination confirmation requirement

The Gateway normalizes these fields without changing the top-level intent endpoint or authentication headers.

## Deterministic checks

Bridge Controls now evaluates:

1. Required route metadata completeness.
2. Provider-name and route-ID structure.
3. Approved bridge providers.
4. Distinct source and destination chains.
5. Approved source chains.
6. Approved destination chains.
7. Explicitly blocked destination chains.
8. Allowed bridge assets.
9. Maximum bridge amount.
10. Maximum route fee in basis points.
11. Expected-output and minimum-received consistency.
12. Quote timestamp validity and freshness.
13. Quote expiry presence and validity when required.
14. Casper destination public-key or account-hash structure.
15. EVM destination address structure for recognized EVM chain families.
16. Minimum source confirmation requirements.
17. Minimum destination confirmation requirements.

Unknown destination-chain address families produce `unavailable`, not `pass`.

## Policy controls

The existing policy `structuredRules` object now supports:

- `bridgeControlMode`: `Observe`, `Review`, or `Enforce`
- `bridgeControlUnavailableAction`: `Warn`, `Review`, or `Block`
- `bridgeAllowedProviders`
- `bridgeAllowedSourceChains`
- `bridgeAllowedDestinationChains`
- `bridgeBlockedDestinationChains`
- `bridgeAllowedAssets`
- `bridgeMaxAmount`
- `bridgeMaxFeeBps`
- `bridgeMaxQuoteAgeSeconds`
- `bridgeRequireQuoteExpiry`
- `bridgeMinSourceConfirmations`
- `bridgeMinDestinationConfirmations`

An explicitly blocked destination chain always blocks execution. Other violations follow the selected Observe, Review, or Enforce mode. Incomplete or unsupported route information follows the configured Warn, Review, or Block unavailable behavior.

## Product integration

Bridge Controls is connected to:

- Agent Gateway normalization
- Deterministic Policy Engine
- Risk Assessment
- Structured module findings
- Security Pipeline
- Decision explanations and remediation
- Audit persistence
- Original-intent audit evidence
- Intent Playground
- Security Coverage
- Integration Health
- Protection Modules status
- Agent registration starter-policy defaults
- Policy creation and editing
- Policy summary cards
- TypeScript SDK request and response types
- Python SDK pass-through tests and documentation
- MCP schema, boundary guidance, and tests
- README and platform documentation

## Intent Playground examples

The Playground includes:

- Bridge route within policy
- Unapproved bridge destination
- Expired bridge quote

The result view displays provider, source and destination chains, route ID, asset and amount, fee limits, destination address family and validity, quote expiry, and confirmation requirements.

## Decision behavior

### Allowed

A complete route can remain Allowed when its provider, chains, asset, amount, fee, quote, destination format, output bounds, and confirmations satisfy the active policy and all other Magen3 modules pass.

### Review Required

Review mode can pause execution for an unapproved provider or chain, insufficient confirmations, excessive route fee, stale quote, unsupported destination-chain address family, or missing route controls.

### Blocked

Enforce mode blocks route violations. An explicitly blocked destination chain always blocks. Expired routes, malformed destination addresses, invalid output bounds, excessive limits, and other enforced route failures stop execution before wallet signing.

## Security boundary

A passing Bridge Controls result does not prove:

- Provider liquidity or solvency
- Bridge smart-contract safety
- Destination-chain liveness or finality
- Recipient ownership of the destination address
- Route execution success
- Cross-chain message delivery

Contract Validation still checks the exact Casper bridge Contract Hash or Package Hash. Execution Simulation preflight now also treats Bridge as a value-bearing action. Wallet signing remains outside Magen3 and requires explicit user approval.

## Database and environment

- No database migration is required.
- No new mandatory environment variable is required.
- Existing policies remain backward compatible.
- Existing policies without Bridge Controls fields default to non-breaking Observe/Warn behavior internally.
- The Casper contract hash is unchanged.
- Railway and Vercel configuration files are unchanged.

## Major files changed

- `backend/lib/bridgeControls.mjs`
- `backend/lib/bridgeControls.test.mjs`
- `backend/lib/bridgeControls.integration.test.mjs`
- `backend/lib/bridgeControls.gateway.integration.test.mjs`
- `backend/lib/agentGateway.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/contractValidation.mjs`
- `backend/lib/executionSimulation.mjs`
- `backend/lib/securityModel.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/server.mjs`
- `backend/data/seed.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
- `src/app/App.tsx`
- `src/app/lib/securityModel.ts`
- `packages/sdk-js/src/index.ts`
- `packages/sdk-js/test/sdk.test.mjs`
- `packages/mcp-server/src/core.ts`
- `packages/mcp-server/src/server.ts`
- `packages/mcp-server/test/core.test.mjs`
- `packages/sdk-python/tests/test_client.py`
- `README.md`
- `SECURITY.md`
- `docs/BRIDGE_CONTROLS.md`
- `docs/AGENT_GATEWAY_API.md`
- `docs/GATEWAY_INTEGRATION.md`
- `docs/MAGEN3_PLATFORM.md`
- `docs/MCP_SERVER.md`
- SDK and MCP README files

## Verification completed

- 114 backend and security tests passed.
- 15 focused Bridge Controls unit and policy-integration tests passed.
- 2 authenticated memory-store Gateway persistence tests passed.
- Allowed, Review Required, and Blocked bridge outcomes were verified.
- Bridge findings, pipeline stages, context, and original route metadata were verified in audit records.
- 7 TypeScript SDK tests passed.
- 3 Python SDK tests passed.
- 4 MCP core tests passed.
- Every backend `.mjs` file passed Node syntax checking.
- 57 TypeScript/TSX source files passed syntax transpilation.
- The changed frontend application and security model passed a focused semantic TypeScript check using temporary dependency declarations.
- The TypeScript SDK passed a real TypeScript build.

## Verification limitation

A full fresh dependency installation, complete Vite production build, and full MCP protocol build could not be run in the sandbox because the configured package registry returned HTTP 503 and the public npm registry was not reachable from the environment. No claim is made that those unavailable checks ran here.

Run locally before pushing:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm sdk:test
pnpm mcp:test
pnpm build
```

## Local run

```powershell
pnpm install --frozen-lockfile
pnpm dev:backend
```

In another terminal:

```powershell
pnpm dev:frontend
```

## Deployment

No deployment-command changes are required. After local verification, commit and push to the branch watched by Railway and Vercel. Railway will use the existing backend start command and Vercel will use the existing frontend configuration.

## Suggested commit

```text
feat(bridge-controls): add deterministic cross-chain route protection
```

Suggested body:

```text
Add provider, chain, asset, destination-format, fee, quote-freshness,
output-bound, amount, and confirmation checks for Bridge intents.

Integrate structured findings with the Gateway, Risk Assessment,
Security Pipeline, Audit Logs, policies, Security Coverage, Integration
Health, Intent Playground, SDKs, MCP, and documentation.

Preserve the existing API, authentication, database, Casper proof,
wallet, YieldBot, Codex, Railway, and Vercel contracts.
```

## Manual QA checklist

1. Connect Casper Wallet.
2. Open Policies and configure approved bridge providers, source chains, destination chains, assets, fee limits, quote age, and confirmation requirements.
3. Add the exact bridge Contract Hash or Package Hash to Trusted Targets.
4. Open Intent Playground and select `Bridge route within policy`.
5. Confirm Bridge Controls appears in the Security Pipeline and module findings.
6. Confirm the route context displays provider, chains, fee, destination format, expiry, and confirmations.
7. Run `Unapproved bridge destination` and confirm Review Required in Review mode.
8. Switch Bridge Controls to Enforce and confirm the same violation becomes Blocked.
9. Run `Expired bridge quote` and confirm it cannot proceed under Enforce mode.
10. Confirm the new decisions appear automatically in Audit Logs with original bridge metadata.
11. Confirm the Casper decision-proof flow remains available.
12. Test the layout on desktop and mobile widths.
