# Magen3 Platform Guide

## What is Magen3?

Magen3 is a Web3 execution firewall and security gateway for autonomous agents. It sits between agent intent and blockchain execution, checks proposed actions before wallet signing, returns `Allowed`, `Blocked`, or `Review Required`, and records policy decisions for auditability.

Magen3 is not the external agent. It is the gateway, policy, and audit layer that independent agents connect to before taking Web3 actions.

## Platform Architecture

```text
External agent
-> Magen3 Gateway API
-> Policy engine
-> Allowed / Blocked / Review Required
-> Wallet signing only if allowed
-> Casper Decision Proof
```

The core platform layers are:

| Layer | Purpose |
| --- | --- |
| Shield Modules | Grouped protection modules for execution, infrastructure, and intelligence risk surfaces. |
| Policy Engine | Evaluates agent identity, action type, amount, target, risk mode, and trusted targets. |
| Gateway API | Receives action intents from external agents before wallet signing. |
| Audit Logs | Stores decisions, reasons, risk levels, proof status, and execution state. |
| Casper Proof Layer | Records Magen3 decisions on Casper Testnet for verifiable audit trails. |

## Cross-chain Model

Magen3 is chain-agnostic at the gateway and policy layer. The current implementation records decision proofs on Casper Testnet, while external agents can include the intended target chain in the intent payload.

Examples of target environments:

- Casper
- EVM chains
- Solana
- Bridge routes
- DAO treasury systems
- Oracle-driven workflows

Magen3 reviews the intent before execution. It does not replace target-chain wallets or sign transactions itself.

## Quick Start

1. Connect Casper Wallet as the Magen3 owner wallet.
2. Register a Connected Agent.
3. Copy the Agent ID, Gateway URL, Verify URL, and one-time API key.
4. Create and activate a policy for that agent.
5. Configure the external agent to call Magen3 before wallet signing.
6. Review audit logs and Casper Decision Proof status inside Magen3.

## Core Concepts

| Concept | Meaning |
| --- | --- |
| Connected Agent | The external AI app, bot, or autonomous system calling Magen3. |
| Agent ID | Public identifier for the connected agent. |
| Agent API Key | Secret credential for that specific connected agent. |
| Owner Wallet | Wallet that registers and manages the agent in Magen3. |
| Execution Wallet | Wallet that signs the real transaction in the external agent. |
| Policy | Rules attached to an agent. |
| Decision | `Allowed`, `Blocked`, or `Review Required`. |
| Decision Proof | Casper record proving Magen3 reviewed the action. |
| Execution Proof | Real transaction/deploy hash after wallet signing. |

## Shield Modules

Agent Shield is live. Other Shield modules are preview modules that describe the broader Magen3 security platform.

| Group | Shield | Status | Purpose |
| --- | --- | --- | --- |
| Execution Shields | Agent Shield | Live | Protects AI-agent actions before wallet or protocol execution. |
| Execution Shields | Wallet Shield | Preview | Reviews transaction requests, spending limits, and wallet-connected execution before signing. |
| Execution Shields | Contract Shield | Preview | Reviews risky contract calls, upgrades, and admin permission changes. |
| Execution Shields | DAO Shield | Preview | Checks treasury execution against governance intent. |
| Infrastructure Shields | Bridge Shield | Preview | Checks routes, destination addresses, and transfer constraints before cross-chain movement. |
| Infrastructure Shields | Oracle Shield | Preview | Reviews oracle and data-feed updates before they trigger execution. |
| Infrastructure Shields | Access Shield | Preview | Reviews privileged access, signer roles, admin changes, and sensitive permissions. |
| Intelligence Shields | RWA Shield | Preview | Checks asset verification, proof expiry, and risk state. |
| Intelligence Shields | Simulation Shield | Preview | Simulates high-risk execution paths and highlights policy conflicts. |
| Intelligence Shields | Threat Intel Shield | Preview | Uses risk signals and known threat patterns to flag unsafe targets or behavior. |

## Agent Shield Flow

```text
External agent receives task
-> prepares structured Web3 intent
-> calls Magen3 with Agent ID and API key
-> Magen3 checks active policy
-> Magen3 returns Allowed / Blocked / Review Required
-> external agent requests wallet signing only if allowed
-> Magen3 audit log records the decision and proof state
```

## Connected Agents

Connected Agents are external systems that can call Magen3. Each connected agent has its own Agent ID and API key. Policies attach to agents, so one agent can be restricted differently from another.

Raw API keys are shown once after registration or rotation. If the raw key is lost, rotate the key.

## Gateway API Example

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json
```

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The agent prepared this action and needs Magen3 approval.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
```

## Security Model

- One API key per Connected Agent.
- Policies attach to agents.
- Owner wallet manages agent configuration.
- Execution wallet signs the actual transaction outside Magen3.
- Raw keys are shown once.
- Revoked agents cannot call the gateway.
- Unknown agents fail closed.
- Agents without active policies fail closed.
- Magen3 records decisions for auditability.

Magen3 is designed to reduce preventable execution failures by enforcing policy before execution. It does not claim to prevent every possible exploit.

## Case Study: Wallet-connected Agents Need Guardrails

Public reporting about the Lobstar Wilde wallet-connected AI-agent incident described an unexpected token transfer after the agent processed an external request. The exact impact depends on valuation and liquidity assumptions, but the security lesson is clear: autonomous agents with wallet access need hard execution policies before they can move assets.

Agent Shield is designed to reduce this class of preventable execution failure by requiring external agent actions to pass through policy checks before wallet signing. This is a guardrail, not a claim that every possible exploit is automatically prevented.

## Casper Decision Proof vs Execution Proof

| Proof | Meaning | When it appears |
| --- | --- | --- |
| Casper Decision Proof | Proves Magen3 reviewed and recorded the decision. | Can appear for `Allowed`, `Blocked`, or `Review Required`. |
| Execution Proof | Proves the execution wallet signed/submitted the real transaction. | Only appears after an allowed action is actually executed. |

Blocked and review-required actions should not have execution hashes because they should not proceed to wallet signing.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Gateway Unavailable | Confirm backend is running and `VITE_API_URL` points to the backend deployment. |
| Invalid API key | Rotate the key or confirm the external agent is using the latest one-time key. |
| No active policy | Create and activate a policy for the connected agent. |
| Casper Wallet not detected | Install, unlock, and approve Casper Wallet in the browser. |
| Decision proof pending | Check relayer configuration or retry proof recording from the audit log. |

## FAQ

| Question | Answer |
| --- | --- |
| Is Magen3 only Agent Shield? | No. Agent Shield is the first live Shield. Magen3 is a modular Shield platform. |
| Can Magen3 be cross-chain? | Yes at the gateway and policy layer. Casper Testnet is the current proof layer. |
| Is it one API key for the whole app? | No. It is one API key per Connected Agent. |
| Is it one API key per policy? | No. Policies attach to agents. API keys authenticate agents. |
| Can execution wallet differ from owner wallet? | Yes. The owner wallet manages the agent; the execution wallet signs in the external app. |
| Does Magen3 sign transactions? | No. Magen3 checks and records decisions. Wallet signing happens outside Magen3. |
| What does Casper Testnet do? | Casper Testnet records Magen3 decision proofs for auditability. |
