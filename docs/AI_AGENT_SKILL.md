# Magen3 Agent Skill

Use this skill when Claude, Codex, YieldBot AI, or another external agent needs to execute Web3 actions through Magen3.

## Purpose

Magen3 is the safety, policy, approval, API, and audit gateway. The external agent remains independent. Before the agent asks a Casper Wallet to sign an action, it must ask Magen3 for a decision.

## Required Integration Values

- `MAGEN3_AGENT_ID`: the Agent ID from Connected Agents.
- `MAGEN3_AGENT_KEY`: the raw API key shown after registration or key rotation.
- `MAGEN3_GATEWAY_URL`: `/api/agent-gateway/intents` on the Magen3 backend.
- `MAGEN3_VERIFY_URL`: `/api/agent-gateway/me` on the Magen3 backend.

Store API keys in secrets or environment variables. Do not put raw API keys in prompts, logs, commits, or public docs.

## In The Magen3 App

Open **Connected Agents**, select an agent, then use **Agent Skill Kit**.

Available exports:

- **Claude**: paste into Claude Project instructions or a Claude chat that controls an external agent.
- **Codex**: download or copy as `SKILL.md` for a Codex skill folder.
- **Custom Agent**: paste into system/developer instructions for another agent runtime.
- **.env**: copy into the external agent's local secret configuration.
- **API Snippet**: copy into the external agent's source code.

The kit is generated per connected agent, so it includes that agent's ID, gateway URLs, API key status, and Magen3 execution rules.

## Rules For External Agents

1. Identify to Magen3 with Agent ID plus API key.
2. Treat the wallet connected inside the external agent as the execution wallet.
3. The execution wallet does not need to match the Magen3 owner/admin wallet.
4. Call the verify endpoint before sending an intent when starting a session.
5. Never execute a Web3 action before Magen3 returns `Allowed`.
6. Stop when Magen3 returns `Blocked`.
7. Pause for human/admin approval when Magen3 returns `Review Required`.
8. After real execution, send the real Casper deploy hash back to Magen3 audit.

## Proof Rule

Magen3 can record every decision on Casper as a Decision Proof Hash. Only execute and return an Execution Deploy Hash when Magen3 returns `Allowed`. If Magen3 returns `Blocked` or `Review Required`, do not ask the execution wallet to sign.

## Verify The Agent

```js
const agentId = process.env.MAGEN3_AGENT_ID;
const agentApiKey = process.env.MAGEN3_AGENT_KEY;

const verify = await fetch(`${process.env.MAGEN3_VERIFY_URL}?agentId=${encodeURIComponent(agentId)}`, {
  headers: { "x-magen3-agent-key": agentApiKey },
});

const gatewayStatus = await verify.json();
if (!gatewayStatus.gatewayReady) {
  throw new Error(gatewayStatus.reason || "Magen3 gateway is not ready for this agent");
}
```

## Send An Intent

```js
const executionWalletAddress = await getConnectedCasperWalletPublicKey();

const response = await fetch(process.env.MAGEN3_GATEWAY_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-magen3-agent-key": process.env.MAGEN3_AGENT_KEY,
  },
  body: JSON.stringify({
    source: "YieldBot-AI",
    agentId: process.env.MAGEN3_AGENT_ID,
    walletAddress: executionWalletAddress,
    executionWalletAddress,
    goal: "Stake 15 CSPR to trusted-validator-demo",
    reason: "External agent prepared this action and is requesting approval before execution.",
    action: {
      type: "Stake",
      amount: 15,
      asset: "CSPR",
      target: "trusted-validator-demo",
      targetType: "Trusted Contract",
    },
  }),
});

const decision = await response.json();
if (!decision.executionApproved) {
  throw new Error(decision.result?.reason || "Magen3 did not approve execution");
}
```

## Mental Model

| Concept | Source | Purpose |
| --- | --- | --- |
| Agent ID | Magen3 Connected Agents | Identifies the registered external agent |
| API key | Magen3 Connected Agents | Authenticates the external agent |
| Owner wallet | Magen3 admin wallet | Owns agents, policies, and audit logs |
| Execution wallet | External agent app | Signs the real Casper transaction after approval |
| Active policy | Magen3 Policies | Controls allowed, blocked, or review-required decisions |
