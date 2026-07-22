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
