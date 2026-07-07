# Magen3 Agent Gateway API

External agents call the Magen3 Gateway before requesting wallet signing. Magen3 validates the connected agent, checks its active policy, returns a decision, and records the decision for auditability.

## Authentication

Every Connected Agent has its own API key.

- One API key per Connected Agent.
- Not one key for the entire app.
- Not one key per policy.
- Policies attach to agents.
- Raw API keys are shown once after registration or rotation.

Send the key with either header:

```http
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

or:

```http
Authorization: Bearer YOUR_AGENT_API_KEY
```

## Verify Agent

```http
GET /api/agent-gateway/me?agentId=MAG-AGENT-...
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

Use this endpoint from an external agent to confirm that the Agent ID, API key, owner wallet scope, and active policy are valid before attempting execution.

## Submit Intent

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The agent prepared this action and needs Magen3 approval before execution.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
```

## Response Shape

```json
{
  "ok": true,
  "executionApproved": true,
  "result": {
    "decision": "Allowed",
    "risk": "Low",
    "riskScore": 18,
    "reason": "The action matches the active policy.",
    "recommendedAction": "Request wallet signature before execution"
  },
  "auditLog": {
    "id": "audit-...",
    "shield": "Agent Shield",
    "decision": "Allowed",
    "txHash": "CASPER_DECISION_PROOF_HASH_OR_EMPTY",
    "executionTxHash": ""
  },
  "nextAction": "Request wallet signature before execution"
}
```

## Owner Wallet vs Execution Wallet

The owner wallet registers and manages the Connected Agent inside Magen3.

The execution wallet is supplied by the external agent in each gateway request and signs the real transaction only after Magen3 returns `Allowed`.

These wallets can be different.

## Decision Proof vs Execution Proof

| Field | Meaning |
| --- | --- |
| `auditLog.txHash` | Casper Decision Proof hash for Magen3's policy decision. |
| `auditLog.executionTxHash` | Real execution transaction/deploy hash after wallet signing. |

Blocked and review-required actions can have decision proofs, but they should not have execution hashes.

## Failure States

| State | Meaning |
| --- | --- |
| Unknown agent | Magen3 blocks by default. |
| Invalid API key | The external agent is not authenticated. |
| Revoked agent | The agent can no longer call the gateway. |
| No active policy | Magen3 fails closed. |
| Policy violation | Magen3 returns `Blocked` or `Review Required`. |

Magen3 does not sign transactions. It checks intent, returns decisions, and records audit evidence.
