# Magen3 Frontend

Magen3 is a Web3 execution firewall for autonomous agents, smart contracts, DAOs, RWA protocols, and oracle-driven actions.

This frontend is generated from the Figma Make export and wrapped as a runnable Vite + React + TypeScript app using **pnpm**.

## Current status

This is the frontend shell. It uses mock data and placeholder handlers so the backend, Casper wallet, policy engine, and Casper Testnet audit transactions can be wired cleanly.

## Pages included

- Landing Page
- Dashboard
- Shields
- Agent Shield
- Policies
- Action Review
- Audit Log
- Settings

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

## Next wiring targets

- Casper wallet connection
- Magen3 policy engine service
- Backend API for agents, policies, action reviews, and audit records
- Casper Testnet contract calls for recording policies and decisions

## Package manager note

This project intentionally uses pnpm. Do not commit `package-lock.json` or `yarn.lock`. Run dependency commands with `pnpm`.
