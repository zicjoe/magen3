# Magen3 Frontend

Magen3 is a Web3 execution firewall for autonomous agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions.

This version is a runnable Vite + React + TypeScript app using **pnpm**. It now includes the first interactive Magen3 product flow: agent registration, policy activation, action analysis, and audit log updates.

## Current status

This is still a frontend-first prototype, but it is no longer just static mock UI.

Implemented locally:

- Mock Casper wallet connection state
- Shared app state for agents, policies, and audit logs
- Register Agent flow
- Create / Activate Policy flow
- Magen3 rule-based policy decision engine
- Action Review flow with Allowed / Blocked / Review Required decisions
- Record Decision on Casper placeholder that generates a mock Casper transaction hash
- Audit Log that updates after policy activation, action recording, and rejection
- Audit detail drawer with record-on-chain placeholder

Next wiring targets:

- Real Casper wallet connection
- Backend API persistence for agents, policies, action reviews, and audit records
- Casper Testnet smart contract for policy and decision records
- Real transaction hashes from Casper deploys instead of generated placeholders

## Pages included

- Landing Page
- Dashboard
- Shields
- Agent Shield
- Policies
- Action Review
- Audit Log
- Settings

## Product flow

```text
Connect wallet
→ Register agent
→ Create policy
→ Simulate Web3 action
→ Magen3 analyzes policy rules
→ Decision: Allowed / Blocked / Review Required
→ Record decision placeholder
→ Audit log updates
```

## Requirements

- Node.js 20+
- pnpm 10+

If pnpm is not installed yet, enable it with Corepack:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

## Local setup

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:5173
```

## Production build

```bash
pnpm build
```

## Preview production build

```bash
pnpm preview
```

## Environment variables

Copy `.env.example` to `.env` when wiring live services:

```bash
cp .env.example .env
```

## Package manager note

This project intentionally uses pnpm. Do not commit `package-lock.json` or `yarn.lock`. Run dependency commands with `pnpm`.
