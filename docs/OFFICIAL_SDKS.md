# Official Magen3 SDKs

Magen3 includes official TypeScript and Python SDKs for external AI agents, DeFi agents, automation services, and agent frameworks.

## Security boundary

The SDKs only authenticate an agent and submit a structured execution intent to Magen3. They do not access browser-wallet storage, private keys, seed phrases, sign deploys, or broadcast transactions. `Allowed` means the caller may move to a separate wallet-signing step; it does not mean Magen3 signed anything.

## TypeScript

```bash
pnpm add @magen3/sdk@beta
```

```env
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=shown-once-agent-key
```

`MAGEN3_GATEWAY_URL` is the API base URL only. Do not append an Agent Gateway route.

```ts
import { Magen3Client } from "@magen3/sdk";
const client = Magen3Client.fromEnv(process.env);
const response = await client.checkIntent(intent);
```

Use `requireAllowed(intent)` to make an agent fail closed whenever the decision is `Blocked` or `Review Required`.


## Contract-call intent

```ts
const response = await client.checkIntent({
  executionWalletAddress: "CASPER_PUBLIC_KEY",
  targetChain: "casper-testnet",
  action: {
    type: "Contract Call",
    target: "contract-package-hash-<64-hex-characters>",
    targetType: "Trusted Contract",
    contractIdentifierType: "Package Hash",
    entryPoint: "deposit",
    contractVersion: 1,
    chainName: "casper-test",
    preflight: {
      paymentAmountMotes: "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      timestamp: new Date().toISOString(),
      runtimeArgs: { amount: "1000000000" },
    },
  },
});
```

Contract Validation checks identifier structure, action/target classification, required entry-point presence for direct contract calls, optional package version, network context, approved contracts, blocked contracts, and allowed entry points. Execution Simulation additionally evaluates supplied payment, gas, TTL, timestamp, freshness, transaction-hash, swap-bound, and runtime-argument metadata. Threat Intelligence can evaluate normalized wallet and contract identities against an operator-configured freshness-checked exact-match feed. Oracle Validation can compare a declared execution price with a configured multi-source feed using freshness, quorum, confidence, spread, and deviation limits. Full stateful speculative execution, comprehensive reputation discovery, and certified production oracle coverage remain unavailable. A descriptive `targetType` never grants trust without an exact policy match.

## Python

```bash
python -m pip install -e packages/sdk-python
```

```python
from magen3 import Magen3Client
client = Magen3Client.from_env()
response = client.check_intent(intent)
```

Use `require_allowed(intent)` for fail-closed execution control.

## Human Approval & Quorum polling

`Review Required` is not execution authorization. Show `agentMessage`, inspect `reviewResolution.humanActionRequired`, remediate and resubmit autonomous reviews, and poll the exact-bound workflow only when an approval request is present.

TypeScript:

```ts
const decision = await client.checkIntent(intent);

if (decision.result.decision === "Review Required" && decision.approval) {
  const { approval } = await client.getApproval(decision.approval.id);
  if (!approval.mayProceedToSigning) {
    // Pending, Configuration Required, Rejected, or Expired: do not sign.
    return;
  }
}
```

Python:

```python
decision = client.check_intent(intent)
approval_request = decision.get("approval")

if decision["result"]["decision"] == "Review Required" and approval_request:
    approval = client.get_approval(approval_request["id"])["approval"]
    if not approval.get("mayProceedToSigning"):
        # Do not sign or broadcast.
        return
```

Approval is bound to the exact agent, action, amount, target, execution wallet, policy, and original intent. Changing those parameters requires a new Gateway decision. For signature-enabled policies, only backend-verified Casper Ed25519 or Secp256k1 responses count toward quorum. SDK and MCP clients receive sanitized fields such as `signatureRequired`, `verifiedApprovalsReceived`, verification algorithm, challenge hash, signature hash, domain, chain, and verification time; they never receive the raw reviewer signature or create approval challenges. Human Approval & Quorum remains Foundation Available until the deployed Casper Wallet browser flow is verified end to end.

Organizational policies also expose `resolvedTier`, `groupProgress`, `organizationalQuorum`, `escalationHistory`, `nextEscalation`, `executionNotBefore`, `executionWindowEndsAt`, `executionDelayRemainingSeconds`, and `executionWindowStatus`. SDK callers must use only `mayProceedToSigning` as the final authorization. They cannot activate escalation, shorten delays, extend windows, or submit human approval responses.

## Threat Intelligence response types

The TypeScript result exposes `threatIntelligenceContext` with sanitized feed status, source type/name, freshness timestamps, indicator count, policy mode, confidence threshold, checked identities, and matched indicator summaries. Provider credentials are not part of the SDK response. Python callers receive the same JSON object as a dictionary.

An `Allowed` response can still contain an observed low-confidence or Observe-mode warning. Always authorize from the final decision and `executionApproved`, while presenting module findings for operator awareness.


## Oracle Validation request and response types

The TypeScript SDK accepts `action.outputAsset` and `action.oracle` with `baseAsset`, `quoteAsset`, `executionPrice`, and optional `quoteTimestamp`. The result exposes `oracleValidationContext` with sanitized feed state, requested pair, execution and reference prices, deviation, source spread, source count, confidence, and active policy limits. Python callers receive the same JSON structures as dictionaries.

The SDK does not load oracle providers or accept provider credentials; those remain backend operator configuration.

## x402 Payment Controls request and settlement types

The TypeScript SDK exposes `Magen3X402Payment`, `Magen3X402PaymentControlsContext`, and `Magen3X402SettlementUpdate`. Python callers use the same JSON fields as dictionaries. Submit decoded v2 exact-scheme requirements before creating `PAYMENT-SIGNATURE`; use `amountAtomic`, configured asset decimals, `maxTimeoutSeconds` plus `requirementsReceivedAt` or an explicit expiry, request-binding hashes, and a unique request ID.

After real facilitator activity, call `reportX402Settlement()` or `report_x402_settlement()`. Magen3 validates the audit ID, connected-agent credential, request fingerprint, attempt limit, transaction-hash continuity, confirmation, and resource-delivery state. Never send signing material through either SDK. See `X402_PAYMENT_CONTROLS.md`.

## Compliance Controls request and response types

The TypeScript SDK accepts `action.compliance` with non-sensitive jurisdiction codes, counterparty type, attestation statuses, provider labels, opaque references, timestamps, Travel Rule workflow status/reference/hash, screening status, risk rating, and opaque VASP IDs. The response can include sanitized `complianceControlsContext` and structured Compliance Controls findings. Python callers receive the same JSON structures as dictionaries.

Do not place names, identity documents, dates of birth, addresses, contact information, documents, selfies, or biometric data in SDK requests. Compliance Controls is Foundation Available and provider-agnostic; it validates configured evidence and policy boundaries but does not make a legal determination.

## Environment variables for examples

```text
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=shown-once-agent-key
CASPER_EXECUTION_WALLET=public-key
CASPER_TARGET=recipient-or-contract
```

Never commit the API key. Run the examples only on Casper Testnet.

Token permissions use the typed `Magen3TokenPermission` object at `action.tokenPermission`. The response exposes `tokenPermissionControlsContext` with normalized authority metadata, the canonical fingerprint, and replay state. Never include permit signatures or raw signed authority payloads.



## Privileged Action Controls types

The TypeScript SDK exposes `Magen3PrivilegedAction`, `Magen3PrivilegedActionName`, and `Magen3PrivilegedActionControlsContext`. Place unsigned administrative intent metadata at `action.privilegedAction`; Python callers use the same JSON object as a dictionary. The response reports the resolved classification, parameter fingerprint, Human Approval requirement, and action-specific quorum. Never send administrator private keys, wallet signatures, or raw signed transactions.

## Emergency Circuit Breaker response types

The TypeScript SDK exposes `Magen3EmergencyPause` and `Magen3EmergencyControlsContext`. Every Gateway response can report whether pause state was evaluated, whether a pause matched, the effective decision, scope, trigger, reason, and expiry. When the current intent activates an automatic circuit breaker, the top-level response may include `emergencyPause`.

Agent SDKs do not create or resume pauses. Those are owner-wallet administrative operations performed through the Magen3 application or REST management endpoints. An MCP or SDK client must stop on an active `Blocked` or `Review Required` pause and must never retry through another tool to bypass it.

## Contract Argument Policies

Both official SDKs pass public unsigned contract parameters through `action.preflight.runtimeArgs`. The response may expose `contractArgumentPoliciesContext` with the exact matching rule, parameter fingerprint, evaluated names, and violations. SDK clients must not place private keys, signatures, raw signed transactions, wallet approvals, or secret application data in runtime arguments. See `CONTRACT_ARGUMENT_POLICIES.md`.


## Agent Instruction Integrity

Both official SDKs pass `action.instructionIntegrity` through the existing intent envelope and provide binding helpers that generate backend-compatible goal hashes, parameter hashes, and a non-secret `originalProtectedParameters` snapshot. Use `createMagen3InstructionIntegrityBinding` in TypeScript or `create_instruction_integrity_binding` in Python. Preserve the original binding for retries of the same user goal so Magen3 can name the exact changed field. Responses may include `decisionExplanation.code`, `field`, `expected`, `received`, and `mismatchFields`. The helpers do not certify that an adapter is honest and do not make universal prompt-injection claims.


## Tool & MCP Integrity

The TypeScript SDK exposes typed `action.toolIntegrity` metadata and `toolMcpIntegrityContext`. The Python SDK preserves the same dictionaries without transformation. SDKs do not generate trust claims for arbitrary external tools; trusted adapters must supply exact server/tool identities and hashes. Never include MCP credentials or secret tool output.

## Delegation & Session Key Safety

Both official SDKs accept public `action.delegation` metadata and expose sanitized `delegationSafetyContext`. Use a trusted connected-wallet adapter to construct and sign the canonical Magen3 delegation attestation. The SDKs do not generate private session keys, read wallet secrets, or sign on behalf of the delegating wallet. Never include a private key, mnemonic, seed phrase, or raw signed transaction in an intent.

The JavaScript SDK exports `buildMagen3DelegationAttestationMessage`, and the Python SDK exports `build_delegation_attestation_message` plus `hash_delegation_attestation`. These helpers produce the backend-compatible canonical message without accessing wallet secrets.


## RPC & Chain Integrity

Both official SDKs pass through `action.rpcIntegrity` and the returned `rpcChainIntegrityContext`. A trusted external adapter must collect real provider observations; the SDK does not fabricate network identity, synchronization, block freshness, provider agreement, or failover evidence. See `RPC_CHAIN_INTEGRITY.md`.


## Gas Sponsorship & Fee Safety

Both official SDKs pass through `action.feeSafety` and the returned `gasSponsorshipFeeSafetyContext`. Trusted adapters must collect real fee, sponsor, payer, expiry, and budget evidence. The SDK never creates sponsorships or signs transactions.

## Execution & Settlement Reconciliation

The TypeScript SDK exposes `reportExecutionReconciliation` and `pollExecutionReconciliation`. The Python SDK exposes `report_execution_reconciliation` and `poll_execution_reconciliation`. Reporting accepts public state evidence; polling selects only a backend-configured Casper or EVM adapter. Both require the original Magen3 Audit ID and connected-agent credentials. Neither method accepts raw signed transactions, wallet secrets, or caller-selected RPC URLs. See `EXECUTION_SETTLEMENT_RECONCILIATION.md`.


## Market Risk Signals

For Swap, Trade, Exchange, or Bridge actions, clients may include additive `action.marketRisk` selectors such as the exact base/output assets, canonical asset IDs, network, venue, and pool. Volatility, liquidity, spread, divergence, depeg, imbalance, and manipulation metrics must come from the server-configured feed; clients and MCP tools must never invent those values. Responses may include `marketRiskSignalsContext` and `marketRiskSignals`. See `docs/MARKET_RISK_SIGNALS.md`.
