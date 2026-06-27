# External Agent Demo

This demo is designed to show the real-world Magen3 product flow:

```text
Customer's own AI agent
→ Magen3 Gateway API
→ Allowed / Blocked / Review Required
→ Feedback shown back inside the agent
→ Audit log and Casper proof inside Magen3
```

## Why this exists

Magen3 is not trying to replace a user's agent. Magen3 is the security checkpoint that the agent calls before it signs, stakes, transfers, swaps, or calls a contract.

The External Agent Demo page behaves like a separate customer agent called YieldBot. It is still inside this repo for convenience, but the screen is intentionally designed to look and feel separate from the main Magen3 admin dashboard.

## Demo flow

1. Open Magen3.
2. Connect Casper Wallet.
3. Register or use an existing agent.
4. Create an active policy for the agent.
5. Open **External Agent** from the sidebar.
6. Ask the agent to do a task, for example:
   - `Stake 15 CSPR to trusted-validator-demo`
   - `Transfer 9000 CSPR to unknown-wallet`
7. The external agent prepares the action intent.
8. The agent calls:

```text
POST /api/agent-gateway/intents
```

9. Magen3 returns a decision.
10. The agent shows the feedback in its own chat.
11. Magen3 creates an audit record.
12. Open Audit Log to view Casper Proof.

## What to say in the demo

> This is a separate customer agent experience. The user gives the agent a task, but the agent does not execute directly. It first asks Magen3 Gateway if the action is safe. Magen3 checks the policy, returns Allowed, Blocked, or Review Required, and the agent shows that feedback to the user. The decision is also saved in Magen3 and can be anchored on Casper.

## Safe test

```text
Stake 15 CSPR to trusted-validator-demo
```

Expected result:

```text
Allowed — Low risk
```

## Risky test

```text
Transfer 9000 CSPR to unknown-wallet
```

Expected result:

```text
Blocked — High or Critical risk
```
