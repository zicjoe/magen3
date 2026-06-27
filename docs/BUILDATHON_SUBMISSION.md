# Magen3 Buildathon Submission Copy

## Project name

Magen3

## Short description

Magen3 is a Web3 execution firewall for autonomous agents. It reviews AI-agent Web3 actions before execution, classifies them as Allowed, Blocked, or Review Required, stores the audit trail, and records the final decision on Casper Testnet for verifiable proof.

## Problem

Autonomous agents can move faster than human reviewers. As agents begin to stake, transfer, swap, call contracts, update oracles, and manage treasury or RWA workflows, teams need a way to enforce policy before execution and keep a trustworthy record of security decisions.

## Solution

Magen3 introduces Shield modules. The MVP focuses on Agent Shield:

```text
Connect Casper wallet
→ Register AI agent
→ Create policy
→ Review requested action
→ Generate risk decision
→ Store audit log
→ Record proof on Casper Testnet
```

## Why Casper

Casper acts as the audit and trust layer. Magen3 records security decisions on Casper Testnet, giving teams a verifiable on-chain reference for what the agent requested, what policy was used, and what decision Magen3 made.

## MVP features

- Real Casper Wallet connection
- Agent registration
- Policy creation and activation
- Rule-based action review engine
- Allowed / Blocked / Review Required decisions
- Audit Log with database-backed records
- Casper Testnet audit registry contract
- Real `record_decision` transaction on Casper
- Casper Proof section with deploy hash and explorer link

## Casper contract

Magen3 audit registry contract hash:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

First real audit decision deploy hash:

```text
c95359f46a5709cc10d4e014dadc29b6b9734629b475b5d58f8ba2fa0394f668
```

## Tech stack

- Vite
- React
- TypeScript
- Tailwind/shadcn-style UI
- Node backend API
- PostgreSQL on Railway
- Drizzle ORM
- Casper Wallet
- Casper Testnet smart contract
- Rust/Wasm contract build

## Future roadmap

- Wallet-signed `record_decision` directly from the app
- Contract Shield for smart-contract execution review
- DAO Shield for governance and treasury operations
- RWA Shield for off-chain proof and registry updates
- Oracle Shield for oracle-driven action review
- Multi-policy simulation and team approvals


## Agent Runner proof

Magen3 includes an Agent Runner demo that simulates a real autonomous-agent workflow. A user gives the agent a goal, the runner converts it into a structured Web3 action, and Magen3 reviews the action before any execution. The result is stored in the audit log and can be anchored on Casper Testnet as proof.
