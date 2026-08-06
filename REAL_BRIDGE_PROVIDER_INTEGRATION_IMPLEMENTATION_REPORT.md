# Real Bridge Provider Integration Implementation Report

## Executive summary

Milestone 22 adds a real, testnet-only bridge-provider path to the existing Magen3 protected-intent pipeline. The initial adapter calls the Across testnet Swap API, normalizes a provider quote and exact unsigned source transaction, cryptographically binds the evidence to the protected Bridge intent, submits deterministic findings to the existing Risk Assessment Engine, returns executable unsigned transactions only after an Allowed decision, and uses the existing Execution & Settlement Reconciliation lifecycle to track provider-reported destination delivery.

The truthful product status is **Foundation Available**. The adapter is real and provider-backed, but the implementation environment could not resolve the public Across testnet host, so no real public-testnet quote or transaction was claimed.

## Baseline state

The source project already contained:

- metadata-only Bridge Controls
- RPC and chain-integrity controls
- gas and fee safety
- execution and settlement reconciliation
- chain-agnostic value and exposure limits
- real stateful simulation
- canonical asset identity
- asset-contract structural risk
- wallet behavioral controls
- MEV and execution-quality checks
- trading-route integrity
- deterministic market-risk signals
- authenticated Gateway, audit, SDK, MCP, frontend, Railway, and Vercel foundations

Bridge Controls could validate declared provider, chain, fee, quote, destination, and confirmation metadata, but it did not fetch a real bridge quote, construct a source transaction, or observe destination delivery.

## Architecture

The implementation adds `backend/lib/bridgeProviderIntegration.mjs`, a chain/provider adapter boundary with an initial `across-testnet` adapter. It is invoked before policy evaluation in both the memory and PostgreSQL Gateway stores.

```text
Authenticated Bridge Intent
  -> canonical Gateway normalization
  -> wallet, network, target, policy, and legacy Bridge Controls
  -> server-controlled Across testnet quote
  -> normalized and attested bridge evidence
  -> Bridge Provider Integration findings
  -> existing Risk Assessment Engine
  -> audit and privacy-preserving Casper decision proof
  -> Allowed-only unsigned approval/source transactions
  -> external wallet signing/submission
  -> existing reconciliation + provider delivery polling
```

Casper does not receive the execution wallet, provider response, route, token balances, calldata, or bridge delivery metadata. The existing off-chain audit and minimal proof-commitment boundary is preserved.

## Files added

- `backend/lib/bridgeProviderIntegration.mjs`
- `backend/lib/bridgeProviderIntegration.test.mjs`
- `backend/lib/bridgeProviderIntegration.gateway.integration.test.mjs`
- `docs/REAL_BRIDGE_PROVIDER_INTEGRATION.md`
- `REAL_BRIDGE_PROVIDER_INTEGRATION_IMPLEMENTATION_REPORT.md`

## Files modified

- `.env.example`
- `backend/lib/agentGateway.mjs`
- `backend/lib/assetIdentity.mjs`
- `backend/lib/bridgeControls.mjs`
- `backend/lib/contractValidation.mjs`
- `backend/lib/policyEngine.mjs`
- `backend/lib/walletValidation.mjs`
- `backend/server.mjs`
- `backend/store/memoryStore.mjs`
- `backend/store/postgresStore.mjs`
- `backend/lib/frontendSecurityModel.test.mjs`
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
- `packages/mcp-server/dist/*`
- `packages/mcp-server/test/core.test.mjs`
- `packages/mcp-server/README.md`
- `src/app/App.tsx`
- `src/app/lib/api.ts`
- `src/app/lib/securityModel.ts`
- `docs/BRIDGE_CONTROLS.md`
- `docs/README.md`
- `README.md`
- `scripts/integration/verify-integration-contract.mjs`
- `scripts/security/verify-security-patch.mjs`

## Database changes

No destructive database migration was required. Bridge evidence is retained additively in the existing audit JSON structures and reconciliation records. Existing agents, policies, API keys, approvals, audit logs, proofs, and reconciliation records remain compatible.

## Policy changes

The additive policy block is `structuredRules.bridgeProviderIntegration`. It supports enable/required state, allowed adapters, testnet enforcement, maximum evidence age, provider-simulation requirement, payload binding, and deterministic fallback actions for unsupported, unavailable, failed, or mismatched evidence.

Legacy policies continue to operate. A Bridge intent does not silently call a live provider unless a provider adapter is explicitly selected or the policy requires it.

## Adapter support

| Adapter | Environment | Quote | Unsigned tx | Approvals | Delivery tracking | Live network verification |
| --- | --- | --- | --- | --- | --- | --- |
| Across | Testnet | Implemented | Implemented | Implemented | Implemented | Not completed due DNS restriction |
| Other providers | — | Unsupported | Unsupported | Unsupported | Unsupported | Not tested |
| Across mainnet | Mainnet | Disabled | Disabled | Disabled | Disabled | Not tested |

The adapter uses `/swap/approval`, `/swap/chains`, `/swap/tokens`, and `/deposit/status`. Across testnet does not require a provider API key or integrator ID. Magen3 does not enable production authentication or mainnet routes in this milestone.

The default EVM allowlist is limited to chain IDs `421614`, `84532`, `168587773`, `808813`, `37111`, `4202`, `919`, `11155420`, `80002`, `11155111`, `129399`, and `1301`. Solana Devnet is not included because the initial adapter validates EVM addresses and transactions. Provider discovery remains the preferred source for route availability.

## Evidence model

The versioned evidence contains:

- adapter and provider identity/version
- testnet environment
- requested, completed, and expiry times
- source and destination chain IDs/networks
- depositor and recipient
- input/output token addresses
- exact input and output base-unit amounts
- approval transactions
- exact source transaction
- provider quote ID and provider response hash
- request-binding hash
- route fingerprint
- payload hash
- evidence hash
- HMAC attestation
- fee and provider-simulation evidence
- completeness labels
- bounded normalized errors

## Payload binding

Magen3 proves that the source transaction returned after an Allowed decision is the transaction evaluated by policy. The module detects drift in chain, wallet/depositor, recipient, input/output token, exact input amount, provider router, calldata, value, quote ID, route fingerprint, and payload hash. Stale or modified evidence becomes invalidated and cannot authorize execution.

## Decision integration

Bridge Provider Integration findings enter the existing Risk Assessment Engine. The module does not create a separate authorization engine and cannot override authentication, wallet, chain, target, fee, exposure, simulation, approval, behavioral, market-risk, or reconciliation findings.

## Audit integration

The existing audit record receives a sanitized provider summary including provider, environment, source/destination context, exact asset/amount binding, quote ID, route and payload hashes, evidence hash, attestation key reference/signature hash, source transaction, approval transactions, fee summary, evidence completeness, timestamps, and normalized errors.

## Reconciliation integration

After source submission, `/api/agent-gateway/bridge/poll` calls the provider's deposit-status endpoint using the bound source transaction hash. Provider states are normalized into the existing lifecycle: pending, delivered, refunded, failed, or uncertain. Source confirmation, transaction-hash binding, duplicate retry protection, replacement behavior, and monotonic transitions remain owned by Milestone 13.

## Gateway integration

The primary route remains:

```text
POST /api/agent-gateway/intents
```

Additive routes:

```text
GET  /api/bridge-provider-integration/status
GET  /api/bridge-providers/status
GET  /api/bridge-providers/chains
GET  /api/bridge-providers/tokens?chainId=...
POST /api/bridge-provider-integration/quotes
POST /api/bridge-provider-integration/transfers/status
POST /api/agent-gateway/bridge/poll
```

Existing headers and response fields remain compatible. `bridgeProviderExecution` is returned only for Allowed provider-bound Bridge intents.

## SDK integration

The JavaScript SDK includes provider status, chain/token discovery, quote requests, evidence/transaction/context types, Allowed-only execution response, and delivery polling. The Python SDK includes quote and bridge-provider polling helpers. Both reject request-controlled provider URLs and credentials.

## MCP integration

The MCP intent schema documents the exact provider, chain, token, amount, depositor, recipient, and exact-input fields. It adds `magen3_get_bridge_provider_status`, `magen3_request_bridge_provider_quote`, and `magen3_poll_bridge_provider`. The quote tool returns the protected intent and exact unsigned provider transactions; the polling tool applies provider observations through reconciliation. MCP never signs, broadcasts, or accepts provider endpoints, credentials, signed transactions, or wallet secrets.

## Frontend integration

The existing Agent Shield information architecture is preserved. Real Bridge Provider Integration appears under Cross-chain & Payment Controls as **Foundation Available**. Policy forms expose the provider-integration settings, Intent Playground technical evidence can show the provider context, and Settings lists the additive status, quote, and polling endpoints.

## Security protections

- server-only provider configuration
- testnet-only chain allowlist
- HTTPS and host allowlist
- no request-controlled provider URL
- no provider API key in client schemas
- response-size limits
- timeouts and abort signals
- strict EVM address, chain, calldata, and integer validation
- base-unit arithmetic using strings/BigInt
- deterministic canonicalization and SHA-256 hashes
- server HMAC evidence attestation
- quote freshness/expiry and intent-binding checks
- sanitized errors
- no private keys, mnemonics, signatures, or authorization headers stored

## Backward compatibility

Existing agents, IDs, API keys, policies, Bridge Controls metadata, Gateway authentication, audit logs, Casper proof flow, SDK methods, MCP tools, YieldBot integration, CORS, deployment configuration, and reconciliation remain additive and compatible.

## Tests run

Commands and exact final results:

```text
node --test backend/lib/bridgeProviderIntegration.test.mjs backend/lib/bridgeProviderIntegration.gateway.integration.test.mjs
19 passed, 0 failed, 0 skipped
```

```text
node --test backend/lib/bridgeControls*.test.mjs backend/lib/bridgeProviderIntegration*.test.mjs
36 passed, 0 failed, 0 skipped
```

```text
node --test backend/lib/bridgeProviderIntegration.test.mjs backend/lib/bridgeProviderIntegration.gateway.integration.test.mjs backend/lib/bridgeControls*.test.mjs backend/lib/walletValidation*.test.mjs backend/lib/contractValidation*.test.mjs backend/lib/executionReconciliation*.test.mjs backend/lib/marketRiskSignals*.test.mjs
95 passed, 0 failed, 0 skipped
```

Clean extracted-environment backend discovery:

```text
find backend -name '*.test.mjs' -print0 | sort -z | xargs -0 node --test
472 discovered, 471 passed, 1 failed, 0 skipped
```

The one clean-extraction failure was `backend/lib/frontendSecurityModel.test.mjs`, because the extracted environment did not contain the repository-pinned `typescript` package. It was an environment import failure, not a failed Magen3 assertion.

A supplemental run temporarily mapped the available global TypeScript installation without modifying or packaging project dependencies:

```text
find backend -name '*.test.mjs' -print0 | sort -z | xargs -0 node --test
498 passed, 0 failed, 0 skipped
```

```text
tsc -p packages/sdk-js/tsconfig.json
passed

node --test packages/sdk-js/test/*.test.mjs
40 passed, 0 failed, 0 skipped
```

```text
PYTHONPATH=packages/sdk-python/src python -m unittest discover -s packages/sdk-python/tests -p 'test_*.py'
34 passed, 0 failed
```

```text
node --test packages/mcp-server/test/core.test.mjs
29 passed, 0 failed, 0 skipped
```

The MCP protocol suite could not load because `@modelcontextprotocol/sdk` was not installed in the extracted environment. The MCP core suite passed through a temporary local workspace-SDK mapping, and the temporary mapping was removed before packaging.

Additional verification:

```text
node scripts/integration/verify-integration-contract.mjs
passed

node scripts/security/verify-security-patch.mjs
passed
```

```text
node --check backend/lib/bridgeProviderIntegration.mjs
node --check backend/lib/agentGateway.mjs
node --check backend/lib/policyEngine.mjs
node --check backend/lib/walletValidation.mjs
node --check backend/lib/contractValidation.mjs
node --check backend/store/memoryStore.mjs
node --check backend/store/postgresStore.mjs
node --check backend/server.mjs
passed
```

Frontend and MCP TypeScript source files passed `typescript.transpileModule` syntax diagnostics. A local in-memory backend smoke test passed for `/api/health` and `/api/bridge-provider-integration/status`, including sanitized capability reporting and the twelve configured EVM Across testnet chain IDs.

The root TypeScript build could not resolve React, Vite, Node, and related local type packages because dependencies were not installed. The complete `pnpm run build` could not be executed because Corepack received HTTP 404 while retrieving the repository-pinned `pnpm@10.14.0` from the available package mirror. Railway and Vercel deployment are therefore not claimed.

## Live-verification limitations

A direct request to `https://testnet.across.to/api/swap/chains` was attempted from the implementation environment, but DNS resolution failed. Therefore no public Across testnet quote, approval transaction, source transaction, wallet signature, broadcast, fill, refund, or real destination delivery is claimed.

## Environment variables

- `BRIDGE_PROVIDER_ACROSS_BASE_URL`
- `BRIDGE_PROVIDER_ALLOWED_HOSTS`
- `BRIDGE_PROVIDER_ALLOWED_TESTNET_CHAIN_IDS`
- `BRIDGE_PROVIDER_REQUEST_TIMEOUT_MS`
- `BRIDGE_PROVIDER_MAX_EVIDENCE_AGE_SECONDS`
- `BRIDGE_PROVIDER_EVIDENCE_SECRET`
- `BRIDGE_PROVIDER_EVIDENCE_KEY_ID`

## Deployment notes

Set a random `BRIDGE_PROVIDER_EVIDENCE_SECRET` of at least 32 characters in Railway. Keep the default testnet URL and chain allowlist unless intentionally narrowing them. No frontend secret is required. The application still deploys when the adapter is unconfigured, but a policy requiring bridge-provider evidence will fail according to its configured fallback.

## Known limitations

Not implemented:

- mainnet
- production Across API authentication/integrator ID
- other bridge providers
- automatic signing or submission
- gasless bridge execution
- destination embedded actions
- universal asset mapping
- `minOutput`, `exactOutput`, or capped-input models
- independent destination-chain event verification beyond provider status and existing reconciliation
- bridge solvency/risk scoring
- continuous background monitoring
- x402 settlement

## Roadmap compatibility

Milestone 22 reuses asset identity, contract risk, simulation, fee safety, exposure, MEV, route integrity, market risk, and reconciliation extension points without duplicating those systems. The evidence includes stable provider, route, payload, asset, chain, timestamp, and audit identifiers for later threat intelligence, oracle, compliance, and continuous monitoring enrichment.

Milestones 23–28 were not prematurely implemented.

## Recommended starting point for Milestone 23

Implement Live x402 Testnet Authorization & Settlement through the existing generic execution-intent, exact resource/request binding, value/exposure controls, audit, Casper proof, and reconciliation layers. Do not merge x402 payer/recipient identity with bridge depositor/recipient or execution/proof wallets.
