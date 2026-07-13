# @magen3/sdk

Official TypeScript SDK for Magen3, a modular Web3 execution firewall.

```ts
import { Magen3Client } from "@magen3/sdk";

const magen3 = new Magen3Client({ gatewayUrl, agentId, apiKey });
const decision = await magen3.checkIntent({
  executionWalletAddress: "CASPER_PUBLIC_KEY",
  action: { type: "Transfer", amount: 2, asset: "CSPR", target: "RECIPIENT", targetType: "Wallet Address" }
});
```

Use `requireAllowed()` when the caller must stop automatically for `Blocked` and `Review Required` decisions. The SDK never signs or broadcasts transactions.
