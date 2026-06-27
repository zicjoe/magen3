# Magen3 Demo Walkthrough

## One-line pitch

Magen3 is a Web3 execution firewall for autonomous agents. It checks agent actions before execution and records the final security decision on Casper for verifiable audit proof.

## Demo goal

Show that Magen3 is not just a dashboard. It connects to a real Casper wallet, reviews an agent action, creates a security decision, stores the audit record, and anchors proof on Casper Testnet.

## Demo route

### 1. Landing page

Say:

> Magen3 protects autonomous agents before they execute risky Web3 actions. The first module is Agent Shield.

Click **Launch App**.

### 2. Connect wallet

Click **Connect Wallet** and approve through Casper Wallet.

Show:

- Real Casper public key in the top bar
- Casper Testnet badge
- API online status when backend is running

### 3. Dashboard

Show the **Demo Readiness** card.

Point out:

- Real wallet connected
- Agent registered
- Active policy
- Action reviewed
- Casper proof confirmed

### 4. Agent Shield

Register a sample agent:

```text
Name: YieldBot
Type: DeFi Agent
Purpose: Manage staking, vault deposits, and yield actions under policy control.
Permission: Limited Execution
```

Explain:

> The agent is not trusted by default. It needs a policy before Magen3 allows execution.

### 5. Policies

Create a policy:

```text
Policy name: YieldBot Safety Policy
Max transaction: 100 CSPR
Daily limit: 500 CSPR
Approval threshold: 50 CSPR
Risk mode: Balanced
```

Activate it.

Explain:

> This policy becomes the firewall rule set for the agent.

### 6. Action Review

Create an example action:

```text
Action: Stake
Amount: 15 CSPR
Target: Trusted validator / protocol target
Target type: Trusted Contract
```

Click analyze.

Show:

- Decision
- Risk level
- Risk score
- Passed checks
- Failed checks if any
- Recommended action

### 7. Record decision

Click **Record on Casper** / create the audit log record.

Explain:

> The decision is now part of Magen3's audit trail. Next, we anchor proof to Casper.

### 8. Audit Log and Casper Proof

Open **Audit Log**, click the record, and show **Casper Proof**.

Show:

- Status: Recorded on Casper
- Network: Casper Testnet
- Entrypoint: record_decision
- Contract hash
- Deploy hash
- CSPR.live explorer link

### 9. Closing line

Say:

> Magen3 gives teams a verifiable security layer for autonomous Web3 execution: pre-execution policy checks, risk decisions, database history, and Casper-backed proof.

## Backup proof values

Contract hash:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

First real record_decision deploy hash:

```text
c95359f46a5709cc10d4e014dadc29b6b9734629b475b5d58f8ba2fa0394f668
```
