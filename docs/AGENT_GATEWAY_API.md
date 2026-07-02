# Magen3 Agent Gateway API

Magen3 is not the agent. Magen3 is the security gateway that an external agent calls before asking an execution wallet to sign a Web3 action.

## Identity Model

External agents identify themselves with:

- `agentId`
- `x-magen3-agent-key` or `Authorization: Bearer <api-key>`

The wallet submitted in an intent is the execution wallet. It can be any Casper Wallet and does not need to match the Magen3 owner/admin wallet that registered the agent.

Magen3 uses the registered agent's owner wallet internally to find the active policy and to scope the admin dashboard audit logs.

## Sync / Verify Endpoint

```http
GET /api/agent-gateway/me?agentId=MAG-AGENT-...
```

Headers:

```http
x-magen3-agent-key: magen3_live_...
```

Ready response:

```json
{
  "ok": true,
  "agent": {
    "id": "MAG-AGENT-...",
    "name": "YieldBot AI",
    "status": "Active",
    "apiKeyPreview": "magen3_live...abc123"
  },
  "activePolicy": {
    "id": "POL-...",
    "name": "Safe Yield Policy",
    "status": "Active"
  },
  "gatewayReady": true,
  "endpoint": "/api/agent-gateway/intents"
}
```

If the agent has no active policy:

```json
{
  "ok": true,
  "agent": { "id": "MAG-AGENT-...", "status": "Active" },
  "activePolicy": null,
  "gatewayReady": false,
  "endpoint": "/api/agent-gateway/intents",
  "reason": "No active policy assigned to this agent."
}
```

Wrong or missing keys return `401`. Unknown agent IDs return `404`.

## Intent Endpoint

```http
POST /api/agent-gateway/intents
```

Example:

```bash
curl -X POST "https://your-magen3-api.up.railway.app/api/agent-gateway/intents" \
  -H "Content-Type: application/json" \
  -H "x-magen3-agent-key: magen3_live_..." \
  -d '{
    "source": "YieldBot-AI",
    "agentId": "MAG-AGENT-...",
    "walletAddress": "execution-wallet-public-key",
    "executionWalletAddress": "execution-wallet-public-key",
    "goal": "Stake 15 CSPR to trusted-validator-demo",
    "reason": "YieldBot prepared this action and is requesting approval before execution.",
    "action": {
      "type": "Stake",
      "amount": 15,
      "asset": "CSPR",
      "target": "trusted-validator-demo",
      "targetType": "Trusted Contract"
    }
  }'
```

## Response Meaning

- `result.decision`: `Allowed`, `Blocked`, or `Review Required`
- `executionApproved`: true only when Magen3 says the action is allowed
- `auditLog.agentOwnerWalletAddress`: wallet that registered and controls the connected agent in Magen3
- `auditLog.executionWalletAddress`: wallet that the external agent will ask to sign execution
- `casperPayload`: payload for the Casper decision proof flow
- `nextAction`: plain-English instruction for the external agent

Even when the decision is `Allowed`, Magen3 does not move funds by itself. The external agent must still request a real signature from the execution wallet and attach the execution deploy hash back to Magen3.
