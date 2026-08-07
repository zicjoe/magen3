# @magen3/mcp-server

Official local MCP server for Magen3, a modular Web3 execution firewall.

It exposes six tools over `stdio`:

- `magen3_verify_agent`
- `magen3_get_intent_schema`
- `magen3_check_intent`
- `magen3_require_allowed`
- `magen3_get_approval`
- `magen3_report_x402_settlement`

`magen3_require_allowed` is the recommended fail-closed gate. It returns an MCP error for Blocked, Review Required, authentication errors, schema errors, timeouts, and network failures.

The server never reads browser-wallet storage, handles private keys, signs transactions, broadcasts transactions, or deploys contracts.

## Environment

```text
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=private-connected-agent-key
MAGEN3_TIMEOUT_MS=15000
MAGEN3_AUTH_MODE=header
```

`MAGEN3_GATEWAY_URL` must be the Magen3 API base URL only. The MCP server adds the Agent Gateway routes. Existing deployments using `MAGEN3_AGENT_KEY` or `MAGEN3_AGENT_API_KEY` remain supported as temporary aliases.

## Build and run

```bash
pnpm mcp:build
node packages/mcp-server/dist/server.js
```

See `docs/MCP_SERVER.md` for Codex setup and testing.


## AI-native review routing

When an intent returns `Review Required`, stop execution and show `agentMessage`. Inspect `reviewResolution.humanActionRequired`. When it is `false`, follow `decisionExplanation.agentInstruction`, correct or supply the requested evidence, and resubmit the same bound goal; do not create or poll a human approval. When it is `true`, call `magen3_get_approval` with the approval ID or audit ID and continue only when `mayProceedToSigning` is true. The MCP server cannot create challenges, receive reviewer signatures, approve a request, or impersonate a reviewer.

## Contract intents

Contract-oriented actions may include these optional action fields:

- `contractIdentifierType`: `Contract Hash` or `Package Hash` when an ambiguous raw/hash-prefixed identifier needs explicit semantics
- `entryPoint`: required for direct Contract Interaction/Contract Call actions; optional for high-level actions such as Swap when the adapter has not resolved it
- `contractVersion`: optional positive package version; invalid with a Contract Hash
- `chainName`: optional Casper chain name checked against the Gateway configuration

A `targetType` value such as `Trusted Contract` never grants trust by itself. The exact contract or package identifier must be approved by the active Magen3 policy.


## Execution preflight

Actions may include a `preflight` object with `paymentAmountMotes`, `gasPriceTolerance`, `ttl`, `timestamp`, optional swap bounds, runtime arguments, and an optional transaction hash. Magen3 validates this metadata before signing. Full stateful speculative execution remains unavailable, and signing material is never accepted by the intent endpoint.


## Threat Intelligence

The response can include structured Threat Intelligence findings and sanitized `threatIntelligenceContext`. The backend operator configures the feed; MCP clients never send provider credentials. Stale or unavailable feeds never count as a pass, and the final decision remains the only authorization signal.

## Oracle Validation

For Swap and other oracle-sensitive actions, an MCP client may provide `outputAsset` and `action.oracle` with `baseAsset`, `quoteAsset`, `executionPrice`, and `quoteTimestamp`. Magen3 compares the submitted quote with a configured multi-source reference feed and returns deterministic findings for freshness, source quorum, confidence, cross-source spread, and price deviation.

The MCP client never sends oracle-provider credentials. Those remain backend environment variables. Oracle Validation is Foundation Available, not Live, because Magen3 does not bundle or certify a production oracle feed. Treat the final Magen3 decision—not an individual oracle finding—as the authorization result.


## Bridge Controls

For `Bridge` actions, provide `action.bridge` with the provider-supplied source and destination chains, provider, route ID, destination address, asset, fee, output bounds, quote timestamps, and confirmation requirements. Inspect `bridgeControlsContext` and structured Bridge Controls findings before continuing.

Bridge Controls is Foundation Available. It validates declared route metadata and configured policy boundaries but does not certify a bridge provider, destination-chain finality, or cross-chain message delivery.

## Compliance Controls

The MCP schema accepts non-sensitive compliance evidence under `action.compliance` and rejects raw names, identity documents, addresses, contact information, documents, selfies, and biometrics. Inspect the final decision, structured Compliance Controls findings, and sanitized `complianceControlsContext`. A clear result or feed no-match does not guarantee legal compliance.

## x402 Payment Controls

Use `action.type: "x402 Payment"`, `targetType: "x402 Merchant"`, and an `action.x402` object containing the selected v2 exact-scheme requirements. Supply either an explicit expiration or `maxTimeoutSeconds` plus the stable `requirementsReceivedAt` time. For unsafe HTTP methods, bind the exact request body with `requestBodyHash`.

After an Allowed decision and real facilitator activity, call `magen3_report_x402_settlement`. Confirmed status requires a transaction hash, delivery can be recorded only after confirmation, and settlement state cannot regress. Never send `PAYMENT-SIGNATURE`, signed payment payloads, wallet approvals, or private keys through MCP.

## Token Permission Controls

The MCP intent schema exposes `action.tokenPermission` for explicit unsigned token-authority metadata. Magen3 returns deterministic Token Permission Controls findings and replay context. The MCP server never accepts permit signatures, wallet signatures, private keys, or raw signed authority payloads.


## Privileged Action Controls

The MCP intent schema accepts unsigned `action.privilegedAction` metadata for supported administrative calls. Inspect Privileged Action Controls findings, the parameter fingerprint, and any exact-bound Human Approval requirement. The server rejects administrator keys, signatures, and raw signed transactions. Generic contract calls remain compatible.

## Emergency Circuit Breaker

Every MCP intent is evaluated against persistent scoped pause state before ordinary authorization. `magen3_require_allowed` fails closed for both `Blocked` and `Review Required`. Surface the Emergency Circuit Breaker finding and matching scope, trigger, reason, expiry, and remediation to the operator.

The MCP server deliberately exposes no pause-management tool. An agent must not activate, resume, or bypass a pause through MCP, alternate tools, modified action labels, routes, providers, wallets, or idempotency keys. Owner pause management remains in the Magen3 application and REST API.


## Approval escalation and organizational quorum

`magen3_get_approval` reports deterministic tier, named group, escalation, delay, and execution-window evidence. MCP never submits a reviewer response or changes those controls. The tool remains fail closed until `mayProceedToSigning` is true, including when total quorum is complete but an execution delay is still active.

## Contract Upgrade Safety

For proxy or implementation changes, the MCP intent schema accepts unsigned `action.contractUpgrade` metadata. Magen3 checks target/network binding, current and proposed implementations, implementation policy, optional code hashes, upgrade administrator, delay, fingerprint, and exact approval quorum before signing. The MCP tool cannot approve upgrades and must never receive private keys, administrator signatures, or raw signed transactions.

## Contract Argument Policies

The MCP tool submits public unsigned `action.preflight.runtimeArgs` only. Magen3 may evaluate them against an exact contract and entry-point policy and return `contractArgumentPoliciesContext`. MCP cannot change the active argument rule or approve a violation. Never include private keys, signatures, wallet approvals, raw signed transactions, or secret application data in runtime arguments.

## Agent Instruction Integrity

The intent schema accepts `action.instructionIntegrity` with a stable goal ID, original goal hash, source provenance, external-content confirmation, protected-parameter hashes, `originalProtectedParameters`, and original/current permission scopes. Supplying the non-secret original snapshot allows Magen3 to name the exact changed field instead of returning only a hash mismatch. Gateway responses may include `decisionExplanation.code`, `field`, `expected`, `received`, and `mismatchFields`; show `agentMessage` to users and keep these fields for developer diagnostics. Tool output cannot authorize its own payment or expand its own scope. Send only hashes, normalized public transaction fields, and minimal labels—never private prompts, tool credentials, document contents, or wallet secrets. This control verifies supplied deterministic evidence and does not claim universal prompt-injection detection.


## Tool & MCP Integrity

The official server injects stable integrity evidence for `magen3_check_intent` and `magen3_require_allowed` when downstream metadata is absent. New Magen3 policy forms include exact default bindings for these official tools. Explicit downstream `action.toolIntegrity` metadata is preserved. This evidence is deterministic but does not certify arbitrary tool code or eliminate supply-chain risk.


## Delegation & Session Key Safety

The MCP intent schema accepts public `action.delegation` evidence for a bounded Casper delegation. The MCP server does not create a delegation signature, hold session-key secrets, or grant itself authority. A connected wallet adapter must create any `attestationSignature`, and Magen3 verifies it before authorization while storing only sanitized hashes and scope findings.


## RPC & Chain Integrity

Submit public `action.rpcIntegrity` evidence only when it was collected by a trusted adapter. Magen3 checks approved provider identity, expected network binding, freshness, quorum agreement, and failover policy. Never send provider credentials or fabricate observations.


## Gas Sponsorship & Fee Safety

The official MCP server may relay public `action.feeSafety` evidence produced by a trusted transaction adapter. MCP never creates sponsorships, holds sponsor credentials, or relays raw signatures. The returned `gasSponsorshipFeeSafetyContext` is sanitized.

## Execution & Settlement Reconciliation

- `magen3_report_execution_reconciliation` records authenticated public execution state.
- `magen3_poll_execution_reconciliation` queries a bound transaction through the backend-configured Casper or EVM adapter.

The MCP schema cannot provide RPC URLs. Both tools preserve Audit ownership and never receive signed transactions or wallet secrets.

## Trading Route Integrity

For swaps, the MCP caller may supply public `action.tradingRoute` evidence. The MCP server relays the exact quote ID, router, ordered token/pool path, amounts, fee recipients, and trusted calldata/payload hashes to Magen3. It does not create or infer route evidence, authenticate quote providers, or sign transactions.


## Market Risk Signals

For Swap, Trade, Exchange, or Bridge actions, clients may include additive `action.marketRisk` selectors such as the exact base/output assets, canonical asset IDs, network, venue, and pool. Volatility, liquidity, spread, divergence, depeg, imbalance, and manipulation metrics must come from the server-configured feed; clients and MCP tools must never invent those values. Responses may include `marketRiskSignalsContext` and `marketRiskSignals`. See `docs/MARKET_RISK_SIGNALS.md`.

## Real Bridge Provider Integration

Use `magen3_get_bridge_provider_status` to verify that the server-side Across testnet adapter and evidence-attestation key are configured. Use `magen3_request_bridge_provider_quote` with exact source/destination chain IDs, token addresses, base-unit input amount, depositor, recipient, and `tradeType: "exactInput"`. The response contains the protected Bridge metadata plus any approval transactions and the exact unsigned source transaction.

Submit that protected intent through `magen3_require_allowed`. Magen3 fetches and attests the quote server-side; MCP must not invent provider evidence or send provider URLs, API keys, wallet secrets, signatures, or signed transactions. After the externally controlled wallet submits the exact Allowed source transaction, use `magen3_poll_bridge_provider` with the audit ID and source transaction hash. The polling tool applies provider observations through the existing reconciliation state machine and does not treat a quote as submission, settlement, or destination delivery.

## Metered / upto x402 tools

`magen3_create_x402_authorization` creates a bounded upto/metered authorization only from an Allowed audit. `magen3_apply_x402_authorization_event` applies idempotent reserve/capture/settle/release/refund/usage/revoke/dispute accounting while preserving resource/provider/session binding.

### Threat Intelligence

`magen3_get_threat_intelligence_status` reports sanitized provider capabilities and health for the production Threat Intelligence adapter layer. Provider secrets and raw responses are excluded.

### Production Oracle Integration

Use `magen3_get_oracle_validation_status` for sanitized provider capability and health state. Oracle providers supply evidence only; deterministic Magen3 policy remains the authorization authority.
