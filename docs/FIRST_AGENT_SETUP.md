# Magen3 First Agent Setup

Magen3 provides a guided first-user path without removing advanced security configuration.

## Guided Setup

Guided Setup is the default entry point for a new agent.

### 1. Choose what to protect

Available use cases:

- Trading Agent
- Wallet Assistant
- Treasury Agent
- DeFi or dApp Agent
- Enterprise Automation
- Custom Agent

The selected use case determines recommended execution capabilities, a policy template, relevant protection areas, and the first sample intent. Users may choose a clearly labelled demo configuration. The demo path does not perform blockchain execution.

### 2. Add the agent

The user supplies an agent name and can refine its purpose or optional execution wallet. They also choose an integration target:

- Codex
- MCP
- JavaScript
- Python
- Custom API
- Integrate later

### 3. Choose protection

- **Standard** applies the selected use-case template with balanced defaults.
- **Strict** lowers limits, routes more unknown or unavailable evidence to review, and applies conservative risk handling.
- **Custom** exposes the core limits before creation and remains editable later in Policies.

Magen3 displays the inferred capabilities and relevant protection areas before creating anything.

### 4. Save credentials and test

The completion screen presents the one-time API key, an integration-specific snippet, and a protected test action.

The protected test:

- Uses the real authenticated Agent Gateway.
- Uses the newly created Agent ID and active policy.
- Evaluates a synthetic 1 CSPR transfer request.
- Creates the normal deterministic decision and audit record.
- Uses the existing Casper decision-proof flow.
- Does not request a wallet signature.
- Does not submit an execution transaction.

If starter-policy creation fails, Magen3 reports the agent as registered but not protected, disables the protected test, and directs the user to Policies.

## Advanced Setup

Advanced Setup preserves the existing six-step workflow for developers and security teams:

1. Agent Details
2. Execution Capabilities
3. Recommended Protection
4. Starter Policy
5. Review
6. Integration Credentials and Quick Start

## Setup checklist

For agents created through Guided or Advanced Setup, Dashboard tracks:

- Wallet connected
- First agent registered
- Starter policy active
- Credential acknowledgement in the current browser
- First protected intent received
- First real Casper decision proof recorded

Legacy agents are not forced into the checklist.

## Empty states

New-user empty states on Dashboard, Agent Shield, Connected Agents, Policies, Audit Logs, and Intent Playground explain the next action and link directly to Guided Setup or a protected test.

## Security boundaries

Guided Setup does not change deterministic authorization, Gateway authentication, API-key hashing, policy enforcement, audit persistence, Human Approval, Casper proof submission, execution reconciliation, or wallet-signing boundaries.
