# Magen3 Agent Gateway API

Magen3 is not the agent. Magen3 is the security gate that a real external agent calls before asking a wallet or execution layer to sign a Web3 action.

## Endpoint

```http
POST /api/agent-gateway/intents
```

The endpoint receives a structured action intent, runs the existing Magen3 policy engine, stores a real audit log, and returns a Casper `record_decision` payload that can be anchored on Casper Testnet.

## Optional production auth

Set this Railway variable to require an agent API key:

```env
AGENT_GATEWAY_API_KEY=replace-with-a-long-random-secret
```

Then external agents must send either:

```http
Authorization: Bearer <key>
```

or:

```http
x-magen3-agent-key: <key>
```

If `AGENT_GATEWAY_API_KEY` is empty, the gateway stays open for local/demo testing.

## Example request

```bash
curl -X POST "http://localhost:8787/api/agent-gateway/intents" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "external-yield-agent",
    "agentId": "MAG-AGENT-001",
    "walletAddress": "01ff33ad9195be34ec2b2f2afc2ed9e3d06f82bcb373df2505dbb14c4e1442a670",
    "goal": "Stake idle funds safely",
    "reason": "User strategy allows low-risk staking",
    "action": {
      "type": "Stake",
      "amount": 15,
      "asset": "CSPR",
      "target": "trusted-validator-demo",
      "targetType": "Trusted Contract"
    }
  }'
```

## Response meaning

The response includes:

- `result.decision`: `Allowed`, `Blocked`, or `Review Required`
- `executionApproved`: true only when Magen3 says the action is allowed
- `auditLog`: the stored Magen3 decision record
- `casperPayload`: the exact payload to pass into the Casper `record_decision` flow
- `nextAction`: plain-English instruction for the external agent

## Production rule

Even if the decision is `Allowed`, Magen3 does not move funds by itself. The agent still needs the normal wallet/signing layer or execution system to perform the actual transaction. Magen3 decides whether the action is safe enough to continue.
