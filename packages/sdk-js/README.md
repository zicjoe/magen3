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
  },
});
```

For direct Contract Interaction/Contract Call actions, include a valid contract or package identifier and an entry point. High-level actions such as Swap remain backward compatible when the adapter has not yet resolved an exact entry point. `targetType: "Trusted Contract"` is descriptive only; the exact identifier must still match the agent's active policy. `contractVersion` is valid only for a package hash.

Use `requireAllowed()` when the caller must stop automatically for `Blocked` and `Review Required` decisions. The SDK never signs or broadcasts transactions.
