# Agent Instruction Integrity

Agent Instruction Integrity is a Live deterministic control under **Agent Shield → Agent Trust & Access**. It checks whether a sensitive execution remains bound to the originating goal, approved provenance, protected parameters, and the tool permission scope that existed when the goal was established.

It does not use a language model to decide Allowed, Blocked, or Review Required, and it does not claim to detect every prompt-injection or semantic-manipulation attack. It verifies the provenance and hashes supplied by trusted agent adapters, then applies explicit policy rules.

## Intent metadata

Submit public, non-sensitive evidence under `action.instructionIntegrity`:

```json
{
  "goalId": "goal:treasury-payment-2026-07-24-001",
  "originalUserGoalHash": "<64-character SHA-256>",
  "initiatedBy": "user",
  "intentSource": "user",
  "toolName": "treasury-agent",
  "toolServer": "approved-mcp",
  "sourceDomains": ["operations.example"],
  "externalContentUsed": false,
  "userConfirmed": true,
  "sourceTrustLevel": "trusted",
  "parameterChangeReason": "",
  "originalParameterHash": "<optional 64-character SHA-256>",
  "currentParameterHash": "<optional adapter-computed SHA-256>",
  "originalProtectedParameters": {
    "actionType": "Transfer",
    "amount": 25,
    "asset": "USDC",
    "target": "0x...",
    "chainName": "base-sepolia"
  },
  "originalPermissionScopes": ["treasury:propose"],
  "currentPermissionScopes": ["treasury:propose"]
}
```

Do not send private prompts, email bodies, document contents, API keys, wallet secrets, signatures, or provider credentials. Store those outside Magen3 and submit only the minimum provenance labels and hashes required for enforcement.

## Deterministic checks

- Stable goal identifier and original goal hash for configured sensitive actions
- Structural consistency of hashes, source domains, and permission scopes
- Blocked and allowed source-domain policy
- Protected amount, destination, asset, contract, network, action, and runtime-argument fingerprinting
- Parameter-change detection after the original goal
- Required reason and user confirmation for controlled parameter changes
- External resource self-authorization prevention for x402 payments
- Tool/MCP permission-scope expansion prevention
- Review or blocking of high-risk actions derived from untrusted external content

A blocked source, malformed or contradictory provenance, x402 self-authorization, tool scope expansion, or a supplied current hash that does not match Magen3's normalized parameters fails closed. When an original protected-parameter snapshot is supplied, Magen3 compares it field by field and identifies the exact mismatch.

## Policy fields

The active policy stores the control in `structuredRules`:

- `instructionIntegrityEnabled`
- `instructionIntegrityMode`: `Observe`, `Review`, or `Enforce`
- `requireGoalBindingForActions`
- `requireUserConfirmationForExternalContent`
- `allowedSourceDomains`
- `blockedSourceDomains`
- `externalContentHighRiskAction`: `Warn`, `Review`, or `Block`
- `allowParameterChangesAfterGoal`
- `requireParameterChangeReason`

Legacy policies without the control remain backward compatible. When enabled, missing required provenance is never represented as a pass.

## Decision and audit evidence

The Gateway returns `instructionIntegrityContext` with the goal ID, source category, domains, confirmation state, original and computed parameter hashes, original/current protected-parameter snapshots, field differences, permission scopes, change state, deterministic violations, and the explicit limitation of the control. Audit Logs persist the same normalized evidence and structured findings without storing raw external content.

Every Blocked or Review Required response also includes a user-ready `agentMessage` and structured `decisionExplanation`. Instruction-integrity failures use stable codes and may expose `field`, `expected`, `received`, and `mismatchFields`. For example, an amount mismatch can say that the user requested 5 USDC but the prepared transaction contains 10 USDC, while malformed hashes and missing goal bindings receive separate explanations. Ordinary agents should display `agentMessage`; developer tooling may show the structured details.

The existing Human Approval workflow binds the complete normalized intent. If protected parameters change after approval, the approval binding changes and the prior authorization cannot be reused.

## Live criteria met

- Deterministic backend enforcement
- Stable goal and parameter binding
- Source-domain and confirmation policy
- Tool permission-scope containment
- Gateway, policy, audit, Security Pipeline, Security Coverage, and Integration Health integration
- Intent Playground examples
- JavaScript SDK, Python SDK, and MCP support
- Memory-store and PostgreSQL parity through the existing JSON intent/audit model
- Automated Allowed, Review Required, Blocked, malformed, scope-expansion, self-payment, and backward-compatibility tests

Real external agent adapters are still responsible for producing trustworthy provenance. A malicious or compromised adapter can submit false metadata; Tool & MCP Integrity is the next roadmap control intended to strengthen tool identity and manifest binding.
