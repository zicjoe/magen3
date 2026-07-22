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

Contract Validation checks identifier structure, action/target classification, required entry-point presence for direct contract calls, optional package version, network context, approved contracts, blocked contracts, and allowed entry points. Execution Simulation additionally evaluates supplied payment, gas, TTL, timestamp, freshness, transaction-hash, swap-bound, and runtime-argument metadata. Threat Intelligence can evaluate the same normalized wallet and contract identities against an operator-configured freshness-checked exact-match feed. Full stateful speculative execution and comprehensive reputation discovery remain unavailable. A descriptive `targetType` never grants trust without an exact policy match.

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

## Threat Intelligence response types

The TypeScript result exposes `threatIntelligenceContext` with sanitized feed status, source type/name, freshness timestamps, indicator count, policy mode, confidence threshold, checked identities, and matched indicator summaries. Provider credentials are not part of the SDK response. Python callers receive the same JSON object as a dictionary.

An `Allowed` response can still contain an observed low-confidence or Observe-mode warning. Always authorize from the final decision and `executionApproved`, while presenting module findings for operator awareness.

## Environment variables for examples

```text
MAGEN3_GATEWAY_URL=https://YOUR-MAGEN3-BACKEND
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_AGENT_KEY=shown-once-agent-key
CASPER_EXECUTION_WALLET=public-key
CASPER_TARGET=recipient-or-contract
```

Never commit the API key. Run the examples only on Casper Testnet.
