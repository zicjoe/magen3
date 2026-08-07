# @magen3/sdk

> **Public beta:** This package is ready to publish under the npm `beta` tag. Its API may evolve before Magen3 SDK 1.0.

Install it in a server-side JavaScript or TypeScript application:

```bash
pnpm add @magen3/sdk@beta
```

```env
MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY
```

`MAGEN3_GATEWAY_URL` is the API base URL only. Do not append `/api/agent-gateway/intents`; the SDK derives every route. Existing `MAGEN3_AGENT_KEY` and `MAGEN3_AGENT_API_KEY` values are accepted temporarily for migration.

```ts
import { Magen3Client } from "@magen3/sdk";
const magen3 = Magen3Client.fromEnv(process.env);
```

Keep the Magen3 Agent API key in the application backend. Never expose it through browser code or a `VITE_` environment variable.

Official TypeScript SDK for Magen3, a modular, chain-agnostic Web3 execution firewall. The SDK checks proposed actions and reports execution state; it does not hold private keys, sign transactions, or broadcast transactions. Casper-specific examples below demonstrate supported Casper Testnet fields and do not make every protected execution a Casper execution.

## Wallet transfer

```ts
import { Magen3Client } from "@magen3/sdk";

const magen3 = new Magen3Client({ gatewayUrl, agentId, apiKey });
const decision = await magen3.checkIntent({
  executionWalletAddress: "CASPER_PUBLIC_KEY",
  action: {
    type: "Transfer",
    amount: 2,
    asset: "CSPR",
    target: "RECIPIENT_PUBLIC_KEY",
    targetType: "Wallet Address",
    preflight: {
      paymentAmountMotes: "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      timestamp: new Date().toISOString(),
    },
  },
});
```

## Contract call

```ts
const decision = await magen3.checkIntent({
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

For direct Contract Interaction/Contract Call actions, include a valid contract or package identifier and an entry point. High-level actions such as Swap remain backward compatible when the adapter has not yet resolved an exact entry point. `targetType: "Trusted Contract"` is descriptive only; the exact identifier must still match the agent's active policy. `contractVersion` is valid only for a package hash.

Execution Simulation is Foundation Available. Supplied preflight metadata is validated before signing, while full stateful speculative execution remains unavailable. Never put private keys, wallet approvals, transaction-level signatures, or raw signed transactions in an intent. Public contract arguments belong only inside `runtimeArgs`.

Use `requireAllowed()` when the caller must stop automatically for `Blocked` and `Review Required` decisions. The SDK never signs or broadcasts transactions.

The TypeScript response types expose `agentMessage`, `decisionExplanation`, `reviewResolution`, `moduleFindings`, `pipelineStages`, `primaryReason`, `triggeredRule`, and `suggestedResolution`. Render `getMagen3AgentMessage(response)` directly in the external agent instead of inventing a generic explanation.

A `Review Required` result always pauses execution, but it does not automatically mean a human is needed. Inspect `reviewResolution.humanActionRequired`:

```ts
import { getMagen3AgentMessage, isMagen3ExecutionApproved } from "@magen3/sdk";

console.log(getMagen3AgentMessage(decision));
if (isMagen3ExecutionApproved(decision)) {
  // Submit only the exact evaluated parameters.
} else if (decision.reviewResolution?.humanActionRequired) {
  // Poll the exact-bound approval request.
} else {
  // Follow decisionExplanation.agentInstruction, remediate, and resubmit the same bound goal.
}
```

## Human approval polling

Poll human approval only when `decision.reviewResolution?.humanActionRequired === true` and `decision.approval` is present:

```ts
const { approval } = await magen3.getApproval(decision.approval.id);
if (!approval.mayProceedToSigning) return;
```

The path accepts the approval ID or related audit ID. `Pending`, `Configuration Required`, `Rejected`, and `Expired` all require the agent to remain stopped. For signature-enabled policies, the response exposes `signatureRequired`, `verifiedApprovalsReceived`, and sanitized verified-response evidence. Only verified Casper Ed25519 or Secp256k1 reviewer responses count toward quorum. Human Approval & Quorum remains Foundation Available pending deployed browser verification. The agent SDK can read the workflow but cannot create approval challenges, approve, access a reviewer wallet, sign, or broadcast. Organizational policies also return resolved tier, group progress, escalation, execution delay, and signing-window evidence. Continue only when `mayProceedToSigning` is true; `Approved` alone is insufficient when a delay or expired window applies.

## Oracle Validation

Trading and DeFi intents may include an exact asset pair and execution quote:

```ts
const decision = await client.evaluateIntent({
  action: {
    type: "Swap",
    amount: 10,
    token: "CSPR",
    outputAsset: "USD",
    target: "contract-package-<64-hex>",
    oracle: {
      baseAsset: "CSPR",
      quoteAsset: "USD",
      executionPrice: 0.025,
      quoteTimestamp: new Date().toISOString(),
    },
  },
});
```

The response may include `oracleValidationContext` plus structured Oracle Validation findings. These report feed availability, pair coverage, reference price, execution-price deviation, source count, confidence, and source spread. Oracle Validation is Foundation Available and requires an operator-configured feed; a passing comparison does not guarantee market accuracy or execution success.


## Bridge Controls metadata

Bridge actions can include provider-supplied route metadata:

```ts
const result = await magen3.checkIntent({
  executionWalletAddress,
  action: {
    type: "Bridge",
    amount: 10,
    asset: "CSPR",
    target: "contract-package-hash-...",
    targetType: "Bridge Contract",
    contractIdentifierType: "Package Hash",
    chainName: "casper-test",
    bridge: {
      sourceChain: "casper-test",
      destinationChain: "ethereum-sepolia",
      provider: "Reviewed Bridge Adapter",
      routeId: "route-001",
      destinationAddress: "0x0000000000000000000000000000000000000001",
      asset: "CSPR",
      feeBps: 50,
      expectedOutput: 9.95,
      minimumReceived: 9.8,
      quoteTimestamp: new Date().toISOString(),
      quoteExpiresAt: new Date(Date.now() + 300000).toISOString(),
      sourceConfirmations: 2,
      destinationConfirmations: 12,
    },
  },
});
```

The response may include `bridgeControlsContext` and structured Bridge Controls findings. Bridge Controls is Foundation Available: it validates submitted route metadata and policy boundaries, but does not certify provider solvency, destination finality, or message delivery.

## Compliance Controls evidence

TypeScript integrations may provide `action.compliance` with non-sensitive status, provider, opaque reference, timestamp, jurisdiction, hash, risk-rating, and VASP-ID fields. The response may include sanitized `complianceControlsContext` and structured findings. Raw personal identity data is rejected. Compliance Controls is Foundation Available and does not make a legal determination.

## x402 Payment Controls

Authorize the decoded payment requirements before creating `PAYMENT-SIGNATURE`:

```ts
const requirementsReceivedAt = new Date().toISOString();
const decision = await magen3.checkIntent({
  executionWalletAddress: "0x2222222222222222222222222222222222222222",
  action: {
    type: "x402 Payment",
    amount: 1,
    asset: "USDC",
    target: "https://api.example.com/data",
    targetType: "x402 Merchant",
    x402: {
      version: 2,
      scheme: "exact",
      resourceUrl: "https://api.example.com/data",
      method: "GET",
      merchantDomain: "api.example.com",
      payTo: "0x1111111111111111111111111111111111111111",
      asset: "USDC",
      network: "eip155:84532",
      facilitator: "https://x402.org/facilitator",
      amountAtomic: "1000000",
      maxTimeoutSeconds: 300,
      requirementsReceivedAt,
      requestId: `payment-${Date.now()}`,
      paymentRequiredHash: "b".repeat(64),
    },
  },
});
```

Create and submit the real payment only when `decision.result.decision === "Allowed"`. Then reconcile it:

```ts
await magen3.reportX402Settlement({
  auditLogId: String(decision.auditLog.id),
  status: "confirmed",
  requestFingerprint: decision.result.x402PaymentControlsContext!.requestFingerprint!,
  transactionHash: "0x...",
  attempt: 1,
  resourceDelivered: true,
});
```

The SDK never accepts or transmits `PAYMENT-SIGNATURE` through the intent API. x402 Payment Controls is Foundation Available and does not certify merchant content or facilitator availability.

## Token approvals and permits

Use `action.tokenPermission` only for explicit approval, permit, NFT operator, batch, or delegated spender authority. The SDK exposes `Magen3TokenPermission` and the response can include `tokenPermissionControlsContext`. Never include permit signatures, wallet signatures, private keys, or raw signed authority payloads.


## Privileged Action Controls

Use the typed `Magen3PrivilegedAction` object at `action.privilegedAction` for supported administrative calls. The response can include `privilegedActionControlsContext` with deterministic classification, parameter fingerprint, and approval/quorum requirements. Generic calls may omit the object. Never include administrator keys, signatures, or raw signed transactions.

## Emergency Circuit Breaker responses

The SDK does not create, resume, or bypass emergency pauses. Every `checkIntent` or `requireAllowed` request is evaluated against active scoped pause state. The response may include `result.emergencyControlsContext` and a top-level `emergencyPause` with the matching scope, trigger, reason, enforcement action, expiry, and resume requirements.

Treat both `Blocked` and `Review Required` as a hard stop. Do not retry with another tool, action label, route, provider, wallet, or idempotency key to evade the pause. Pause administration remains an owner-wallet application and REST API operation.


## Contract Upgrade Safety

For proxy or implementation changes, pass unsigned `action.contractUpgrade` metadata with the current and requested implementation, optional code hashes, upgrade administrator, network, and any configured `executeAfter` time. The response may include `contractUpgradeSafetyContext` with the exact parameter fingerprint, policy mode, delay, and required approval quorum. Never include administrator private keys, signatures, or raw signed transactions.

## Contract Argument Policies

Put public unsigned contract arguments in `action.preflight.runtimeArgs`. When the active policy enables Contract Argument Policies, Magen3 matches the exact contract and entry point, then enforces required/allowed names, type rules, numeric ranges, address allowlists or blocklists, boolean restrictions, and enum values. The response may include `contractArgumentPoliciesContext` with the matching rule ID and canonical parameter fingerprint. Never place private keys, signatures, wallet approvals, raw signed transactions, or secret application data in `runtimeArgs`.

## Agent Instruction Integrity

Use the official binding helper instead of manually building provenance hashes. It captures the exact normalized protected parameters so Magen3 can explain whether the amount, destination, asset, network, contract, method, action type, or runtime arguments changed.

```ts
import {
  createMagen3InstructionIntegrityBinding,
  getMagen3AgentMessage,
} from "@magen3/sdk";

const intent = {
  targetChain: "base-sepolia",
  executionWalletAddress,
  action: {
    type: "Transfer",
    amount: 5,
    asset: "USDC",
    target: recipient,
    targetType: "Wallet Address",
  },
};

intent.action.instructionIntegrity = await createMagen3InstructionIntegrityBinding(intent, {
  goalId: stableGoalId,
  originalUserRequest,
  initiatedBy: "user",
  intentSource: "user",
  userConfirmed: true,
});

const decision = await magen3.checkIntent(intent);
console.log(getMagen3AgentMessage(decision));
```

Preserve the returned `goalId`, `originalUserGoalHash`, `originalParameterHash`, and `originalProtectedParameters` while retrying the same user goal. When the agent legitimately changes a protected field, include a clear `parameterChangeReason` and obtain confirmation when the policy requires it.

The response can expose field-specific diagnostics under `decisionExplanation`:

```ts
{
  code: "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH",
  module: "Agent Instruction Integrity",
  field: "amount",
  expected: 5,
  received: 10,
  mismatchFields: ["amount"]
}
```

Render `agentMessage` to ordinary users. Keep hashes and structured diagnostic fields in developer details. Submit hashes and minimal source labels only; never send private prompts, raw emails or documents, API keys, wallet secrets, signatures, or provider credentials. Magen3 verifies supplied provenance and exact parameter bindings; it does not claim to detect every prompt-injection attack.


## Tool & MCP Integrity

Use typed `action.toolIntegrity` metadata for an exact MCP server/tool identity, version, SHA-256 manifest/schema/description hashes, transport assertion, origin, credential-scope label, and least-privilege scopes. The response may include `toolMcpIntegrityContext`. The SDK preserves this public unsigned evidence but does not certify external tools or transmit their credentials.


## Delegation & Session Key Safety

Use `action.delegation` for Casper-signed, short-lived delegated execution. Scope the authority to exact networks, contracts, methods, assets, amount/frequency limits, validity, depth, and redelegation behavior. `attestationSignature` is transient verification input; Magen3 does not persist it raw and returns sanitized `delegationSafetyContext`. Never place private session keys, wallet secrets, mnemonics, or signed transactions in the intent.

### Build the canonical delegation message

Use `buildMagen3DelegationAttestationMessage({ agentId, ...delegation })` to create the exact domain-separated message the delegating Casper wallet must sign. The helper is deterministic and does not access a wallet or private key. Attach the returned wallet signature as transient `action.delegation.attestationSignature`; the Gateway recomputes the same message and verifies it.


## RPC & Chain Integrity

Submit public `action.rpcIntegrity` evidence only when it was collected by a trusted adapter. Magen3 checks approved provider identity, expected network binding, freshness, quorum agreement, and failover policy. Never send provider credentials or fabricate observations.


## Gas Sponsorship & Fee Safety

The JavaScript SDK passes through `action.feeSafety` and the returned `gasSponsorshipFeeSafetyContext`. Trusted adapters must collect real fee, sponsor, payer, expiry, and budget evidence. The SDK never creates sponsorships or signs transactions.

## Execution & Settlement Reconciliation

```ts
await client.reportExecutionReconciliation({
  auditLogId: "AUD-...",
  status: "pending",
  transactionHash: "0x...",
  attempt: 1,
});

await client.pollExecutionReconciliation({
  auditLogId: "AUD-...",
  chainFamily: "casper",
  chainName: "casper-test",
});
```

Polling uses only RPC endpoints configured on the Magen3 backend. Do not send signed transactions, wallet signatures, private keys, or provider URLs.
## Trading Route Integrity

For protected swaps, provide `action.tradingRoute` with the exact quote ID, router, ordered token and pool path, input/output amounts, explicit fee recipients, and available calldata/payload hashes. The response may include `result.tradingRouteIntegrityContext` and top-level `tradingRouteIntegrity`. See `docs/TRADING_ROUTE_INTEGRITY.md` in the main repository.


## Market Risk Signals

For Swap, Trade, Exchange, or Bridge actions, clients may include additive `action.marketRisk` selectors such as the exact base/output assets, canonical asset IDs, network, venue, and pool. Volatility, liquidity, spread, divergence, depeg, imbalance, and manipulation metrics must come from the server-configured feed; clients and MCP tools must never invent those values. Responses may include `marketRiskSignalsContext` and `marketRiskSignals`. See `docs/MARKET_RISK_SIGNALS.md`.

## Real Bridge Provider Integration

The JavaScript SDK can discover the configured testnet bridge provider, request a server-attested quote, submit the exact protected Bridge intent, and poll delivery after source submission:

```ts
const status = await client.getBridgeProviderStatus();
const chains = await client.listBridgeProviderChains();
const tokens = await client.listBridgeProviderTokens(11155420);

const quote = await client.requestBridgeProviderQuote({
  providerId: "across-testnet",
  sourceChainId: 11155420,
  destinationChainId: 84532,
  inputToken: "0xSourceToken",
  outputToken: "0xDestinationToken",
  amountAtomic: "1000000",
  depositor: "0xExecutionWallet",
  recipient: "0xDestinationRecipient",
  tradeType: "exactInput",
});

// Submit quote.protectedIntent through checkIntent/requireAllowed before signing.
// After the exact source transaction is sent by the wallet layer:
await client.pollBridgeProvider({
  auditLogId: "AUD-...",
  transactionHash: "0xSourceTransactionHash",
});
```

The SDK does not accept provider URLs, API keys, private keys, signatures, or signed transactions for this flow. `bridgeProviderExecution` is returned only after an Allowed decision. Testnet quotes are not proof of destination delivery.

## Metered / upto x402

After an `Allowed` x402 intent, use `createX402Authorization()` for `upto` or `metered`, then `applyX402AuthorizationEvent()` for idempotent reserve/capture/settle/release/refund/usage/revoke/dispute updates. Amounts are positive base-unit integer strings.

### Threat Intelligence status

`client.getThreatIntelligenceStatus()` returns sanitized configured-provider, capability, and health information for Milestone 25. It does not expose credentials or raw provider payloads.

### Oracle provider status

Use `await client.getOracleValidationStatus()` to inspect sanitized Production Oracle capability/provider state. Pyth Hermes provider support remains Preview until the deployment verifies a genuine live provider request.


### Production Compliance Provider (Milestone 27)
The SDK exposes a sanitized compliance-provider status endpoint. Provider credentials and raw provider payloads are never returned. OFAC-API v4 screening support is Preview until live credentials are configured and a genuine provider request is verified. Provider results are evidence only; Magen3 policy remains responsible for Allowed, Review Required, or Blocked.
