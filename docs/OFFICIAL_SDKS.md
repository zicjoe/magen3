# Official Magen3 SDKs

Magen3 includes official TypeScript and Python SDKs for external AI agents, DeFi agents, automation services, and agent frameworks.

## Security boundary

The SDKs only authenticate an agent and submit a structured execution intent to Magen3. They do not access browser-wallet storage, private keys, seed phrases, sign deploys, or broadcast transactions. `Allowed` means the caller may move to a separate wallet-signing step; it does not mean Magen3 signed anything.

## TypeScript

```bash
pnpm --filter @magen3/sdk build
```

```ts
import { Magen3Client } from "@magen3/sdk";
const client = new Magen3Client({ gatewayUrl, agentId, apiKey });
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
client = Magen3Client(gateway_url, agent_id, api_key)
response = client.check_intent(intent)
```

Use `require_allowed(intent)` for fail-closed execution control.

## Human Approval & Quorum polling

`Review Required` is not execution authorization. When the response contains an approval request, stop automatic execution and poll the exact-bound workflow by approval ID or audit ID.

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

Approval is bound to the exact agent, action, amount, target, execution wallet, policy, and original intent. Changing those parameters requires a new Gateway decision. The current Foundation workflow records wallet-address-scoped reviewer responses but does not claim a separate cryptographic approval signature.

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
MAGEN3_GATEWAY_URL=https://YOUR-MAGEN3-BACKEND
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_AGENT_KEY=shown-once-agent-key
CASPER_EXECUTION_WALLET=public-key
CASPER_TARGET=recipient-or-contract
```

Never commit the API key. Run the examples only on Casper Testnet.

Token permissions use the typed `Magen3TokenPermission` object at `action.tokenPermission`. The response exposes `tokenPermissionControlsContext` with normalized authority metadata, the canonical fingerprint, and replay state. Never include permit signatures or raw signed authority payloads.



## Privileged Action Controls types

The TypeScript SDK exposes `Magen3PrivilegedAction`, `Magen3PrivilegedActionName`, and `Magen3PrivilegedActionControlsContext`. Place unsigned administrative intent metadata at `action.privilegedAction`; Python callers use the same JSON object as a dictionary. The response reports the resolved classification, parameter fingerprint, Human Approval requirement, and action-specific quorum. Never send administrator private keys, wallet signatures, or raw signed transactions.
