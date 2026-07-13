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

## Environment variables for examples

```text
MAGEN3_GATEWAY_URL=https://YOUR-MAGEN3-BACKEND
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_AGENT_KEY=shown-once-agent-key
CASPER_EXECUTION_WALLET=public-key
CASPER_TARGET=recipient-or-contract
```

Never commit the API key. Run the examples only on Casper Testnet.
