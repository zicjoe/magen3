# Magen3 Platform Guide

## Product definition

**Magen3 is a modular execution firewall for autonomous blockchain agents.**

It protects an agent before wallet signing or blockchain execution. Magen3 is not the external agent and does not sign transactions. It is the separate gateway, identity, policy, protection, risk, audit, and proof layer that an agent must pass before execution.

```text
External Agent
→ Magen3 Gateway
→ Agent Shield
→ Authenticate Agent
→ Load Agent Configuration
→ Load Effective Policy
→ Run Relevant Protection Checks
→ Risk Assessment
→ Allowed / Blocked / Review Required
→ Audit Log
→ Casper Decision Proof
→ Return Decision
→ Wallet signing only if Allowed, or if an exact-bound Review Required request is approved before expiry
```

## Platform architecture

| Component | Responsibility |
| --- | --- |
| Gateway | Receives authenticated action intents from external agents. |
| Agent Shield | Coordinates the complete pre-execution protection flow. |
| Agent Registry | Stores wallet-scoped agent identity, status, capabilities, and credential metadata. |
| Policy Engine | Enforces supported structured rules attached to each agent. |
| Approval Workflow | Converts configured Review Required outcomes into exact-bound single or quorum review requests. |
| Protection Modules | Produce pass, warning, fail, unavailable, or skipped findings. |
| Risk Assessment | Deterministically combines findings into a final decision. |
| Audit Engine | Stores the original intent, pipeline, findings, explanations, decisions, and proof state. |
| Casper Proof Engine | Records the decision through the existing Casper Testnet audit registry when configured. |
| Developer Portal | Provides current routes, headers, examples, SDKs, MCP, Codex skills, and integration guidance. |
| Intent Playground | Sends the real current Gateway request format using a registered agent. |

## Execution capabilities

An agent is not restricted to one rigid type. At least one capability is required, and multiple capabilities may be selected.

| Capability | Description |
| --- | --- |
| Trading | Autonomous swaps, routing, staking, yield actions, and trade execution. |
| Wallet Management | Transfers, wallet operations, destination management, and balance actions. |
| Treasury Operations | DAO or organization fund management, high-value actions, and approval-controlled execution. |
| dApp Interactions | Contract calls, DeFi protocols, vaults, staking, borrowing, bridging, and application workflows. |
| Enterprise Automation | Organization workflows, internal permissions, compliance, and controlled automation. |
| Custom | Developer-defined capability outside the standard categories. |

Capability packs are convenience presets only:

- Trading Automation Pack: Trading, Wallet Management, dApp Interactions
- Treasury Automation Pack: Treasury Operations, Wallet Management, dApp Interactions
- Enterprise Operations Pack: Enterprise Automation, Treasury Operations, dApp Interactions

Capabilities drive module and starter-policy recommendations. The active policy remains the authorization source.

## Guided registration

The registration wizard follows this flow:

1. Agent Details
2. Execution Capabilities
3. Recommended Protection
4. Starter Policy
5. Review
6. Integration Credentials and Quick Start

The wizard preserves the existing per-agent API-key model. Raw keys are shown only after registration or rotation; the backend stores a digest and preview.

Existing policies can be selected as templates. Their values are cloned into a new policy for the new agent; the original policy is not rebound.

## Protection areas and control-level status

Agent Shield groups related security controls into eight broad protection areas. The UI shows a compact area summary first and reveals control-level status on demand. This avoids a long, repetitive module catalog without hiding what is actually implemented.

| Protection area | Live | Foundation Available | Planned |
| --- | --- | --- | --- |
| Agent Trust & Access | Authentication; credential lifecycle | — | Instruction provenance; Tool/MCP integrity; delegation/session permissions |
| Policy & Approval Controls | Policy enforcement; review thresholds | Human approval and quorum | Emergency circuit breaker |
| Wallet & Asset Safety | Wallet/destination validation; spending controls | Asset identity/network consistency | Token behavior and economic risk |
| Contract & Permission Safety | Contract identity, allowlists, entry points, package versions | Token Approval & Permit Safety | Privileged actions |
| Execution Integrity | Transaction preflight; Lifecycle & Replay | Settlement reconciliation; stateful simulation | RPC integrity; gas sponsorship |
| Market & Oracle Integrity | Slippage/output structure | Oracle price integrity | MEV/execution quality; market-risk signals |
| Cross-chain & Payment Controls | — | Bridge routes; x402 authorization and settlement | Additional native payment adapters |
| Threat & Compliance | — | Threat screening; compliance evidence | Managed provider adapters |

The Security Pipeline retains evaluator-level evidence. Findings still identify Wallet Validation, Contract Validation, Token Approval & Permit Safety, Execution Integrity, Threat Intelligence, Oracle Validation, Bridge Controls, x402 Payment Controls, Compliance Controls, and other exact evaluators. An unavailable control never silently returns pass.

### Execution Integrity decision model

Execution Integrity combines deterministic transaction-construction preflight with Live lifecycle and replay protection. New policies can require a unique intent ID, idempotency key, creation time, expiry, and optional monotonic sequence. Magen3 computes a canonical SHA-256 fingerprint over protected intent parameters and checks prior audit records for duplicate IDs, mutated idempotency keys, duplicate fingerprints, reused transaction hashes, unsafe retries, and already confirmed execution.

Legacy policies remain non-breaking. Duplicate-fingerprint enforcement is activated only when the policy explicitly enables it. Full stateful simulation and RPC-provider agreement remain Foundation or Planned controls and are never represented as implicit passes. See `EXECUTION_INTEGRITY.md`.

### Human Approval & Quorum foundation

Human Approval & Quorum is a Foundation Available control inside Policy & Approval Controls. When enabled and the deterministic result is `Review Required`, Magen3 creates an approval request bound to the audit record, agent, action, amount, target, execution wallet, active policy, and original intent.

The workflow supports single or quorum approval, explicit approver wallets, optional owner fallback, expiry, separation of duties, mandatory rejection comments, duplicate-response prevention, and one-rejection resolution. Agents poll the workflow with their existing API key but cannot approve themselves through the agent endpoint. Reviewers use the wallet-scoped queue under Policies.

An Approved request does not sign or broadcast. It permits the exact unchanged intent to progress to the existing human-controlled wallet-signing boundary before expiry. The current reviewer response is associated with the connected wallet address but is not separately cryptographically signed, so the control remains Foundation Available. See `HUMAN_APPROVAL_WORKFLOW.md`.

### Token Approval & Permit Safety foundation

Token Approval & Permit Safety is a Foundation Available control inside Contract & Permission Safety → Token Permissions. It runs only for explicitly classified approval/permit actions or intents containing `action.tokenPermission`; it does not infer authority from a generic contract call.

It checks network-aware token, owner, spender and target identity; approved and blocked spenders; bounded and unlimited amounts; approval-to-transaction ratio; deadline and maximum lifetime; permit nonce and chain binding; canonical fingerprint and replay history; NFT operator authority; batch size, item integrity and aggregate amount; and exact binding after Human Approval. Raw signatures and signed permit payloads are rejected before persistence. EVM fields are isolated to explicit EVM token-permission intents and do not alter the Casper default path.

The control remains Foundation Available because it does not query live allowance state, certify token metadata or standards, decode arbitrary calldata, or verify a permit signature cryptographically. See `TOKEN_APPROVAL_PERMIT_SAFETY.md`.

### Wallet Validation decision model

Wallet Validation is a live deterministic module. It evaluates every authenticated gateway intent and emits structured findings for:

1. Execution-wallet presence and Casper signing-public-key format.
2. Independent owner-wallet and execution-wallet context.
3. Wallet-target classification for transfer actions.
4. Destination public-key or account-hash format.
5. Exact submitted-identifier self-transfer prevention.
6. Active-policy Trusted Targets membership.
7. Maximum transaction amount.
8. Daily wallet spending projection.
9. Human-review threshold.

The module can emit `pass`, `warning`, `fail`, or `skipped`. A malformed wallet or hard-limit violation never becomes a warning. A valid unapproved destination is handled according to the active risk mode.

This validates structure and configured policy coverage. It does not prove wallet ownership, balance, address reputation, sanctions status, or the absence of compromise. Those require separate verified modules or providers.

Format reference: [Casper Accounts and Cryptographic Keys](https://docs.casper.network/concepts/accounts-and-keys).

### Contract Validation decision model

Contract Validation is a live deterministic module for contract-oriented intents. It evaluates:

1. Action and target-type consistency.
2. Casper Contract Hash or Contract Package Hash structure.
3. Explicit Contract Hash versus Package Hash semantics for ambiguous `hash-...` identifiers.
4. Rejection of wallet public keys and account hashes used as contract targets.
5. Required and structurally valid contract entry points.
6. Package-version rules.
7. Optional chain-name consistency against `CASPER_CHAIN_NAME`.
8. Exact blocked-contract matches from `structuredRules.blockedContracts`.
9. Exact approved-contract matches from Trusted Targets.
10. Optional method restrictions from `structuredRules.allowedEntryPoints`.

A `Trusted Contract` target label never grants trust. The exact contract identifier must be approved by policy. A valid unapproved contract is blocked in Conservative mode and requires review in Balanced or Aggressive mode.

Structural validation does not claim that a contract is audited, verified, or safe from every exploit. On-chain metadata discovery, upgrade/admin analysis, and verification signals remain future work.

References: [Calling Contracts](https://docs.casper.network/developers/cli/calling-contracts) and [Contract Hash vs. Package Hash](https://docs.casper.network/next/developers/writing-onchain-code/contract-hash-vs-package-hash).

### Execution Simulation foundation

Execution Simulation evaluates deterministic preflight metadata before wallet signing. Supported checks include payment amount in motes, gas-price tolerance, TTL, timestamp freshness, optional transaction-hash structure, swap slippage structure, quote-bound consistency, and contract runtime-argument structure.

The module intentionally returns an `unavailable` finding for full stateful speculative execution. The Agent Gateway accepts high-level intent metadata and rejects private keys, wallet approvals, transaction-level signatures, and raw signed transactions. Public contract arguments remain available inside `runtimeArgs`. This preserves the pre-signing security boundary while making malformed transaction-construction data enforceable.


### Oracle Validation foundation

Oracle Validation is a deterministic, provider-agnostic price-integrity layer for priced Swap, vault, DeFi, and explicit oracle-data intents. It compares the proposed execution price with the median of fresh observations for an exact asset pair.

Current checks:

1. Base asset, quote asset, execution price, and quote-timestamp metadata.
2. Fresh configured feed availability.
3. Exact asset-pair availability and observation freshness.
4. Minimum independent-source quorum.
5. Aggregate confidence threshold.
6. Maximum cross-source spread in basis points.
7. Maximum execution-price deviation from the median reference.
8. Observe, Review, or Enforce policy behavior.
9. Warn, Review, or Block behavior when the feed or requested pair is unavailable.

It remains Foundation Available because no production provider or cryptographically verified on-chain attestation is bundled. A successful result means the submitted price satisfied the configured source and policy constraints; it is not a guarantee of universal market truth or successful contract execution. See `ORACLE_VALIDATION.md`.

## Policies and templates

Enforced policy fields:

- Maximum transaction amount
- Daily spending limit
- Human-review threshold
- Human Approval & Quorum: workflow enablement, mode, approvers, required count, expiry, separation of duties, and rejection-comment requirement
- Token Permissions: enablement, mode, spender allow/block lists, unlimited-approval action, amount, ratio, lifetime, expiry/reset, chain/nonce, NFT, and batch limits
- Trusted contract or destination list
- Blocked contracts through `structuredRules.blockedContracts`
- Optional allowed contract entry points through `structuredRules.allowedEntryPoints`
- Blocked action types
- Risk mode
- Threat Intelligence mode, confidence, and unavailable-feed behavior
- Oracle Validation mode, quote age, deviation, source spread, confidence, quorum, and unavailable-feed behavior

Available starter presets:

- Conservative Trading
- Balanced Trading
- Wallet Safety
- Treasury Safe Mode
- DeFi Automation
- Enterprise Controlled Automation
- Custom

The current backend validates structural swap bounds and transaction-construction metadata, but it does not enforce a policy-specific maximum slippage or run full stateful simulation. Threat Intelligence and Oracle Validation can enforce deterministic checks from configured fresh feeds. Managed provider coverage, cryptographic oracle attestations, bridge risk, and compliance screening remain future work.

## Structured findings

Each protection finding can contain:

```json
{
  "module": "Policy Enforcement",
  "status": "warning",
  "severity": "medium",
  "rule": "Human review threshold",
  "message": "The requested amount requires human review.",
  "evidence": {
    "received": 30,
    "reviewThreshold": 20
  },
  "remediation": "Reduce the amount below the threshold or obtain authorized review."
}
```

Supported finding states:

- `pass`
- `warning`
- `fail`
- `unavailable`
- `skipped`

## Security Pipeline

New gateway records can display this state-driven timeline:

```text
Intent received
→ Agent authenticated
→ Agent configuration loaded
→ Policy loaded
→ Relevant protection checks completed
→ Risk assessment completed
→ Decision returned
→ Human approval requested when configured and Review Required
→ Audit stored
→ Casper decision proof queued / confirmed / failed
→ Execution recorded when available
```

Only relevant modules are represented as evaluated. There are no fake animation delays. A Review Required request remains blocked until the exact-bound approval workflow reaches Approved before expiry.

## Decision guidance

Blocked and Review Required records can show:

- Primary reason
- Active policy
- Triggered rule
- Module that produced the finding
- Received and allowed values
- Suggested resolution
- Safe retry guidance

The guidance is derived from deterministic backend evidence. It is not presented as a conversational AI model.

## Security Coverage

Security Coverage is an explainable configuration-coverage score. It is not a reputation score, trust score, or guarantee against exploits.

Example factors:

- At least one execution capability
- Active policy
- Spend limits for relevant capabilities
- Destination controls for wallet actions
- Contract controls for dApp actions
- Review thresholds for treasury actions
- Active API credential
- Recent gateway activity
- Casper proof observation
- Completed active configuration

The UI shows each weighted check and the exact recommendation for missing coverage.

## Smart recommendations

Recommendations are generated from capability and configuration gaps, for example:

- Trading enabled without appropriate limits
- Wallet Management enabled without trusted destinations
- dApp Interactions enabled without trusted contracts
- Treasury Operations enabled without a review threshold
- No active policy
- No active credential preview
- No recent gateway request
- No observed Casper proof

Recommendations link to Connected Agents, Policies, Intent Playground, or Audit Logs as appropriate.

## Integration Health

Integration Health uses actual state:

- Gateway connectivity
- API credential status
- Active policy
- Last received intent
- Last decision
- Casper proof service state
- Audit synchronization

It does not return Healthy when those data points are unavailable.

## Intent Playground

Intent Playground submits to the real existing route:

```http
POST /api/agent-gateway/intents
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

It supports editable examples for schema-supported actions:

- Swap
- Transfer
- Stake
- Contract Interaction

The key is kept in page state and sent only in the authentication header. It is not written into request JSON or persistent storage.

## Gateway API request

```json
{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The external agent prepared this action and needs approval before execution.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
```

Authentication accepts either:

```http
x-magen3-agent-key: YOUR_AGENT_API_KEY
```

or:

```http
Authorization: Bearer YOUR_AGENT_API_KEY
```

The owner wallet and execution wallet may be different.

## Audit records

A new audit record may include:

- Original intent
- Agent identity and owner wallet
- Execution wallet
- Execution capabilities
- Active policy
- Modules checked
- Structured findings
- Final decision and risk score
- Primary reason
- Triggered rule
- Suggested resolution
- Pipeline stages
- Decision payload hash
- Casper decision proof status and hash
- Execution status and hash
- Proof and execution timestamps

The app refreshes wallet-scoped bootstrap data every six seconds while the wallet remains connected.

## Casper Decision Proof versus Execution Proof

| Proof | Meaning | Availability |
| --- | --- | --- |
| Casper Decision Proof | Magen3 reviewed and recorded the proposed action and decision. | Allowed, Blocked, or Review Required. |
| Execution Proof | The external wallet actually signed and submitted the approved action. | Only after an Allowed action executes. |

Current runtime contract hash:

```text
hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf
```

The platform upgrade does not change the contract or existing proof history.

## SDK, MCP, Codex, and autonomous runtimes

Supported integration paths remain:

- Direct HTTP and cURL
- Official TypeScript SDK
- Official Python SDK
- Official MCP server
- Codex skill instructions
- Claude or custom-agent instruction exports
- Browser-use style runtimes that can make authenticated HTTP requests and obey the separate signing boundary

See:

- `AGENT_GATEWAY_API.md`
- `GATEWAY_INTEGRATION.md`
- `OFFICIAL_SDKS.md`
- `MCP_SERVER.md`

## Backward compatibility

The upgrade preserves:

- Existing agent IDs
- Existing API-key hashes and previews
- Existing policy records
- Existing gateway endpoint
- Existing request headers
- Existing audit logs
- Existing Casper contract hash and entrypoint
- Existing wallet connection
- Existing Railway and Vercel setup
- Existing YieldBot, Codex, SDK, and MCP contracts

Database changes are additive. Legacy agents receive conservative capability mappings or `Custom` when no reliable mapping exists.

## Deployment and migration

Run the additive migration before using the upgraded production frontend:

```bash
pnpm db:migrate
```

Then verify:

```bash
pnpm verify
```

Railway continues to use the existing Dockerfile and `railway.json`. Vercel continues to use the existing Vite configuration and `vercel.json`.

### Threat Intelligence deployment

No database migration is required. Configure one of `THREAT_INTELLIGENCE_FEED_JSON`, `THREAT_INTELLIGENCE_FEED_PATH`, or `THREAT_INTELLIGENCE_FEED_URL`. A remote feed may use `THREAT_INTELLIGENCE_API_KEY`. Cache, freshness, and timeout are controlled by `THREAT_INTELLIGENCE_CACHE_TTL_MS`, `THREAT_INTELLIGENCE_MAX_AGE_MS`, and `THREAT_INTELLIGENCE_REQUEST_TIMEOUT_MS`. Confirm `/api/threat-intelligence/status` after backend deployment.



### Oracle Validation deployment

No database migration is required. Configure one of `ORACLE_VALIDATION_FEED_JSON`, `ORACLE_VALIDATION_FEED_PATH`, or `ORACLE_VALIDATION_FEED_URL`. A remote source may use `ORACLE_VALIDATION_API_KEY`. Cache, source freshness, and timeout use `ORACLE_VALIDATION_CACHE_TTL_MS`, `ORACLE_VALIDATION_MAX_FEED_AGE_MS`, and `ORACLE_VALIDATION_REQUEST_TIMEOUT_MS`. The included synthetic feed can be refreshed for a controlled demo with `pnpm oracle:refresh-example-feed`. Confirm `/api/oracle-validation/status` after deployment.

## Security model

- Agent identity is Agent ID plus per-agent API key.
- Owner wallet administration is separate from execution-wallet signing.
- Unknown, revoked, unauthenticated, or policy-less agents fail closed.
- Core authorization is deterministic.
- Raw API keys are not stored or returned after their intended one-time display.
- Preview and Planned modules do not authorize execution.
- `Allowed` means the agent may proceed to a separate wallet-signing step; it is not a signature.
- Security Coverage describes configured protection, not invulnerability.

## Demo flow

1. Explain the execution-risk problem.
2. Show Agent Shield and honest module statuses.
3. Register a multi-capability agent.
4. Review the recommended protection and starter policy.
5. Copy one-time credentials.
6. Submit Allowed, Review Required, and Blocked examples through Intent Playground.
7. Open the audit detail and show pipeline, findings, guidance, proof status, and execution state.
8. Show the Casper decision-proof hash and a separate execution hash where available.

## Troubleshooting

| Issue | Check |
| --- | --- |
| Gateway unavailable | Backend health and `VITE_API_URL`. |
| Invalid API key | Use the latest key or rotate the agent credential. |
| No active policy | Complete the registration policy step or create a policy manually. |
| Legacy agent shows Custom | Add capabilities through the upgraded control flow when editing support is available; the legacy integration remains valid. |
| Audit appears stale | Confirm the wallet remains connected and `/api/bootstrap` is reachable. |
| Decision proof pending | Relayer key, funding, contract hash, RPC, and audit proof error. |
| Playground rejects request | Ensure the selected Agent ID matches the JSON and an `action` object is present. |
| Casper Wallet unavailable | Install, unlock, and approve the browser extension. |

## FAQ

### Is Magen3 a group of separate live Shields?

No. Agent Shield is the live product centerpiece. Protection modules live under Agent Shield and are labeled according to actual implementation status.

### Can one agent have several execution capabilities?

Yes. Multiple capabilities are supported and at least one is required for new registrations.

### Can the execution wallet differ from the owner wallet?

Yes. The owner wallet administers the agent in Magen3. The execution wallet signs in the external agent after an Allowed decision.

### Does Magen3 sign transactions?

No. It evaluates and records decisions. Wallet signing remains outside Magen3.

### Is the gateway cross-chain?

The gateway and policy model are chain-agnostic. Casper Testnet is the current decision-proof layer. Target-chain execution adapters remain separate.
