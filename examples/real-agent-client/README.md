# Magen3 Real Agent Client

This example is a small external agent client. It does not use the Magen3 UI. It sends structured Web3 action intents directly to the Magen3 Agent Gateway API.

The goal is to prove the real product flow:

```text
External agent → Magen3 Agent Gateway → Policy decision → Audit log → Casper proof payload
```

## Start Magen3 backend

From the project root:

```bash
pnpm dev:backend
```

The local API should be available at:

```text
http://localhost:8787
```

## Run demo scenarios

Safe allowed action:

```bash
pnpm agent:test:safe
```

Risky blocked action:

```bash
pnpm agent:test:risky
```

Human review action:

```bash
pnpm agent:test:review
```

Blocked oracle action:

```bash
pnpm agent:test:oracle
```

## Run a custom goal

```bash
pnpm agent:test -- --goal "Stake 15 CSPR to 0xStakingContract123"
```

```bash
pnpm agent:test -- --goal "Transfer 9000 CSPR to unknown-wallet-demo"
```

## Use Railway backend

```bash
pnpm agent:test:safe -- --api https://YOUR-BACKEND.up.railway.app
```

## Use gateway API key

If Railway has `AGENT_GATEWAY_API_KEY` set:

```bash
pnpm agent:test:safe -- --api https://YOUR-BACKEND.up.railway.app --api-key YOUR_KEY
```

## Output

The client prints:

- Magen3 decision
- risk level and risk score
- whether execution is approved
- audit log ID
- next action for the agent
- Casper payload hash

It also saves the latest Casper payload here:

```text
examples/real-agent-client/last-casper-payload.json
```

You can use that payload with:

```bash
pnpm casper:record:cmd -- --payload=./examples/real-agent-client/last-casper-payload.json
```
