# First Agent Onboarding Implementation Report

## Scope

This release introduces a product-level first-user experience while preserving the existing advanced registration workflow and all Magen3 security contracts.

## Source of truth

Implementation was applied to the latest project version containing the restored preferred Audit Logs panel and the preceding Dashboard, Agent Shield, Connected Agents, Policies, Settings, Playground, Docs, and global-shell polish.

## Implemented experience

### Guided Setup

The default four-step flow is:

1. **Use case** — Trading, Wallet, Treasury, DeFi/dApp, Enterprise, Custom, or a clearly labelled demo configuration.
2. **Agent** — Name, purpose, optional execution wallet, and integration target.
3. **Protection** — Standard, Strict, or Custom, with capability-aware policy and protection recommendations.
4. **Connect and test** — One-time API key, integration-specific instructions, and a real authenticated protected test.

### Advanced Setup

The prior six-step wizard remains available unchanged in purpose:

- Agent Details
- Capabilities
- Recommended Protection
- Starter Policy
- Review
- Quick Start

Advanced Setup begins with blank agent-purpose input and does not silently reuse a guided Trading description.

### Secure preset behaviour

Guided use cases select existing capability and policy-template structures. Standard and Strict modes change existing enforced policy values rather than introducing a second policy engine. Strict mode applies conservative limits and review-oriented unavailable-data behaviour. Custom mode exposes core limits before creation and remains editable in Policies.

### First protected test

The completion experience uses the existing authenticated Gateway callback with the created Agent ID and one-time API key. It evaluates a synthetic 1 CSPR transfer with lifecycle and preflight metadata. It creates the normal decision and audit record and uses the existing Casper proof path.

It does not:

- Sign a transaction
- Request wallet approval
- Submit an execution deploy
- Store a raw signed payload
- Bypass policy enforcement

### Failure handling

Agent creation and policy creation are represented separately. If policy creation fails after agent registration:

- The agent and credential remain accessible.
- The UI does not claim the agent is protected.
- The protected test is disabled.
- The user is directed to Policies.
- Retrying does not silently create another agent from the same completion state.

### Setup checklist

Dashboard tracks onboarding milestones only for agents created with the new onboarding metadata. This avoids forcing legacy agents into a browser-local setup workflow.

### Empty-state improvements

New-user guidance was added to:

- Dashboard
- Agent Shield
- Connected Agents
- Policies
- Audit Logs
- Intent Playground
- Settings

Each empty state explains the next meaningful action instead of displaying an empty operational panel.

### Credential acknowledgement

Copying or downloading a one-time API key records browser-local checklist progress without automatically dismissing the credential panel. The explicit acknowledgement action closes the panel. Magen3 still stores only the existing digest and preview server-side.

## Files changed

- `src/app/App.tsx`
- `README.md`
- `docs/FIRST_AGENT_SETUP.md`
- `FIRST_AGENT_ONBOARDING_IMPLEMENTATION_REPORT.md`

## Backend and contract impact

No backend route, database table, migration, policy contract, Gateway response, authentication header, SDK, MCP, Casper contract, relayer, Railway setting, Vercel setting, or environment variable was changed.

## Verification executed

- Application TSX transpilation: passed with zero diagnostics.
- Application-level TypeScript semantic check using the project source and local external-module stubs: passed.
- Backend regression suite: 369 tests passed, 0 failed.
- Workspace and lockfile remained unchanged.

A clean dependency installation and Vite production build could not be executed in this environment because Corepack received HTTP 503 while retrieving the pinned `pnpm@10.14.0` package. This limitation is external to the project source and must be rechecked in Vercel/Railway or a local environment with registry access.

## Manual QA checklist

1. Connect a Casper Wallet with no existing agents.
2. Confirm Dashboard shows Guided and Advanced Setup rather than empty analytics.
3. Start Guided Setup and test each use-case card.
4. Confirm demo configuration is clearly labelled and never claims real execution.
5. Confirm agent name and integration target are required.
6. Compare Standard, Strict, and Custom summaries.
7. Create an agent and verify an active policy is assigned.
8. Copy and download the one-time API key.
9. Run the protected test and confirm no wallet-signing request appears.
10. Open the exact Audit Log record from the completion screen.
11. Confirm Dashboard checklist updates after agent, policy, credential, intent, and proof milestones.
12. Start Advanced Setup and confirm the original six-step workflow remains available.
13. Check empty states on Agent Shield, Connected Agents, Policies, Audit Logs, and Intent Playground.
14. Verify mobile layouts, wizard scrolling, sticky footer actions, and modal close behaviour.
15. Verify an agent-policy creation failure is not presented as protected and the test remains disabled.

## Conventional commit

`feat(onboarding): add guided first-agent setup and protected test`
