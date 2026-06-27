# Real Agent Client Demo

This version adds a small external agent test client. It is not a UI simulation. It calls the Magen3 backend like a separate agent, bot, or automation system would.

## Why this matters

Magen3 is a Web3 execution firewall. In production, external agents should not go directly from AI intent to wallet signing. They should submit their intended action to Magen3 first.

```text
External agent
→ POST /api/agent-gateway/intents
→ Magen3 policy engine
→ Allowed / Blocked / Review Required
→ audit log
→ Casper record_decision payload
```

## Run locally

Terminal 1:

```bash
pnpm dev:backend
```

Terminal 2:

```bash
pnpm agent:test:safe
```

You should see an `Allowed` decision for:

```text
Stake 15 CSPR to 0xStakingContract123
```

Then run:

```bash
pnpm agent:test:risky
```

You should see a `Blocked` decision for:

```text
Transfer 9000 CSPR to unknown-wallet-demo
```

Then run:

```bash
pnpm agent:test:review
```

You should see a `Review Required` decision for:

```text
Deposit 120 CSPR into 0xYieldVault456
```

## Custom external-agent goal

```bash
pnpm agent:test -- --goal "Stake 15 CSPR to 0xStakingContract123"
```

```bash
pnpm agent:test -- --goal "Call unknown contract to mint 5000 tokens"
```

The script turns the plain-language goal into a structured Web3 intent and sends it to the gateway.

## Use deployed backend

```bash
pnpm agent:test:safe -- --api https://YOUR-BACKEND.up.railway.app
```

If `AGENT_GATEWAY_API_KEY` is enabled:

```bash
pnpm agent:test:safe -- --api https://YOUR-BACKEND.up.railway.app --api-key YOUR_KEY
```

## Casper proof handoff

Every successful gateway request creates an audit log and returns a Casper payload. The agent client saves the latest payload here:

```text
examples/real-agent-client/last-casper-payload.json
```

Generate the Casper `record_decision` command:

```bash
pnpm casper:record:cmd -- --payload=./examples/real-agent-client/last-casper-payload.json
```

Then run the printed Casper command from Ubuntu/WSL using your funded key.

## Demo line

Use this in the demo:

> This is not a form inside Magen3. This is an external agent client sending an action intent to the Magen3 Gateway API. Magen3 reviews the action before execution and returns whether the agent may continue, must stop, or needs human review.
