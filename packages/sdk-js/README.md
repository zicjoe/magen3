# @magen3/sdk

Official TypeScript SDK for Magen3, a modular Web3 execution firewall.

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

The TypeScript response types expose `moduleFindings`, `pipelineStages`, `primaryReason`, `triggeredRule`, `suggestedResolution`, and sanitized `threatIntelligenceContext`, so integrations can render deterministic preflight and exact-match intelligence guidance without parsing free-form text. Threat Intelligence remains Foundation Available and requires an operator-configured fresh feed.

## Human approval polling

A `Review Required` result is not permission to sign. When `decision.approval` is present, stop execution and poll the exact-bound request:

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
