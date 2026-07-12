# Contributing to Magen3

Thank you for contributing to Magen3, a modular Web3 execution firewall.

## Before You Start

- Search existing issues and pull requests.
- Open an issue for substantial behavior or architecture changes.
- Never include secrets, private keys, production credentials, or private user data.
- Preserve the current product architecture and terminology.

## Local Setup

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:backend
```

In another terminal:

```bash
pnpm dev
```

## Required Verification

Before opening a pull request, run:

```bash
pnpm verify
```

This runs TypeScript checks, backend tests, and the production build.

## Pull Requests

- Keep changes focused and reviewable.
- Explain the problem, solution, security impact, and verification performed.
- Update documentation when behavior or configuration changes.
- Do not weaken policy checks, API-key handling, auditability, or fail-closed behavior.
- Ensure the application remains functional at every commit.

## Commit Style

Use clear conventional commits where practical, for example:

```text
feat(gateway): add decision proof status polling
fix(audit): refresh logs after agent decision
chore(repo): add GitHub security and community standards
```
