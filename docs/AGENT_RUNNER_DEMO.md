# Magen3 Agent Runner Demo

The Agent Runner Demo turns a natural-language Web3 goal into a structured action request, then sends that request through Agent Shield before any execution can happen.

## Why it exists

Magen3 is a Web3 execution firewall for AI agents. The strongest product demo is not only a user typing a form. It is an agent receiving a goal, creating an intended Web3 action, and being forced through the Magen3 policy gate.

## Demo flow

1. Connect a real Casper Wallet.
2. Open **Agent Runner**.
3. Select a registered agent with an active policy.
4. Enter a goal, for example:
   - `Stake 15 CSPR to trusted-validator-demo`
   - `Transfer 9000 CSPR to unknown-wallet`
   - `Call unknown contract to mint 5000 tokens`
5. Click **Generate Agent Action**.
6. Review the generated structured request.
7. Click **Send to Magen3 Review**.
8. Magen3 returns `Allowed`, `Blocked`, or `Review Required`.
9. Click **Record Decision** to add the decision to the audit log.
10. Open **Audit Log** and use the Casper Proof section to prepare/confirm the real Casper deploy hash.

## Current MVP behavior

The agent runner is intentionally safe for the buildathon MVP:

- It does not move funds.
- It does not execute a wallet transaction directly.
- It converts goals into action requests.
- It sends requests through the existing Magen3 policy engine.
- It records the decision in the same audit log used by the Casper proof flow.

This shows the key product promise: autonomous agents can create intent, but Magen3 controls whether that intent is allowed to proceed.
