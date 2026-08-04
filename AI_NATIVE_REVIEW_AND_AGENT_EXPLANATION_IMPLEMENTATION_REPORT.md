# AI-Native Review Resolution and Agent Explanation Implementation Report

## Objective

Magen3 previously treated many `Review Required` outcomes as if they automatically needed a person. That reduced the usefulness of an execution firewall for autonomous agents and made external agents return vague messages such as “review required” without clearly explaining the exact reason.

This release separates two independent policy concerns:

1. **Protection strictness** — how aggressively Magen3 questions or stops an action.
2. **Review-resolution strategy** — how a questioned action is resolved.

The three public decisions remain unchanged:

- `Allowed`
- `Blocked`
- `Review Required`

`Review Required` remains non-executable. It now routes either to deterministic agent remediation or to an explicit human/organizational approval workflow.

## Review-resolution strategies

### Autonomous

Ordinary review findings produce `agent_remediation`. Magen3 creates no human-approval request. The external agent receives the exact reason and required action, corrects or supplies the missing evidence, preserves the business-goal binding, and resubmits for a fresh deterministic decision.

Explicit governance requirements—such as a privileged action that the policy marks as requiring human approval—still escalate.

### Balanced

Medium-risk ordinary uncertainty remains autonomous. Explicit governance findings, high or critical findings, or a risk score of 75 or above escalate to the configured human or organizational approval workflow.

### Human Governed

Every `Review Required` result uses the configured approval workflow. This preserves the deliberate governance model for organizations that want it.

New guided onboarding defaults to **Autonomous** review resolution while keeping the existing protection-level choice independent.

## Agent-ready decision explanations

Every Gateway decision now exposes a structured explanation:

```json
{
  "agentMessage": "Magen3 paused this action because ... No human approval is required yet. Nothing was signed or sent. ...",
  "decisionExplanation": {
    "primaryReason": "...",
    "triggeredRule": "...",
    "suggestedResolution": "...",
    "userMessage": "...",
    "agentInstruction": "...",
    "humanActionRequired": false,
    "reviewMode": "agent_remediation",
    "reviewState": "awaiting_agent_remediation",
    "canAgentRetry": true,
    "requiredActions": ["..."]
  },
  "reviewResolution": {
    "strategy": "Autonomous",
    "mode": "agent_remediation",
    "state": "awaiting_agent_remediation",
    "humanActionRequired": false,
    "agentActionRequired": true,
    "canAgentRetry": true,
    "mayAutoResume": false,
    "requiredActions": ["..."]
  }
}
```

External agents can display `agentMessage` directly instead of inventing a generic response. The detailed fields remain available for developer interfaces and remediation logic.

### Blocked message behavior

A blocked response states:

- why the action was blocked;
- which rule triggered;
- what can be changed safely;
- that nothing was signed or sent.

### Review Required message behavior

An autonomous review states:

- why the action was paused;
- that no human approval is required yet;
- what evidence or correction is required;
- that the agent must resubmit and receive a fresh decision.

A human-escalated review states:

- why the action was paused;
- that human or organizational approval is required by the active policy;
- the exact-bound approval status and next action.

## Backend changes

- Added `backend/lib/decisionExplanation.mjs`.
- Added deterministic strategy selection and explanation generation.
- Updated Policy Engine responses with `decisionExplanation` and `reviewResolution`.
- Updated memory and PostgreSQL stores with identical response behavior.
- Autonomous reviews no longer create approval requests.
- Human or organizational approval requests are created only when `humanActionRequired` is `true`.
- Added separate audit pipeline stages:
  - `agent-remediation`
  - `human-approval`
- Audit records preserve decision context without a database migration.
- Updated Gateway status and next-action guidance.
- Updated review-threshold wording in wallet and x402 controls.
- Preserved fail-closed execution: signing remains available only for `Allowed` plus `executionApproved: true`.

## Product and UI changes

- Added Review Resolution to guided onboarding and policy controls.
- Added Autonomous, Balanced, and Human Governed choices.
- Kept protection level and review resolution independent.
- Updated the Approval Queue to contain only human-escalated reviews.
- Added a separate Integration Health status for Autonomous review resolution.
- Prevented autonomous remediation from being mislabeled as a human-approval problem.
- Updated protected-test messages to use the Gateway-provided `agentMessage`.
- Updated generated Agent Skills and in-app integration instructions.

## SDK and MCP changes

### TypeScript SDK

Release version: `@magen3/sdk@0.4.0-beta.2`

Added:

- `getMagen3AgentMessage(response)`
- `isMagen3ExecutionApproved(response)`
- typed `decisionExplanation`
- typed `reviewResolution`

`requireAllowed()` now fails closed unless both conditions are true:

```text
result.decision === "Allowed"
executionApproved === true
```

### Python SDK

Release version: `magen3-sdk 0.4.2`

Added:

- `get_agent_message(response)`
- `is_execution_approved(response)`
- fail-closed `require_allowed()` behavior

### MCP server

- `magen3_check_intent` tells the agent to remediate and resubmit for autonomous reviews.
- It tells the agent to poll approval only when `humanActionRequired` is `true`.
- `magen3_require_allowed` remains the preferred fail-closed execution boundary.

The MCP package version remains `0.5.0` because its official server/tool identity bindings are unchanged.

## Documentation changes

Added:

- `docs/AI_NATIVE_REVIEW_RESOLUTION.md`

Updated public Gateway, SDK, MCP, platform, integration, delegation, token-permission, human-approval, and Agent Skill documentation.

## Compatibility

- No database migration is required.
- No environment-variable change is required.
- Existing Agent IDs and API keys remain valid.
- Existing policies can be edited to select a review-resolution strategy.
- Policies without the new field resolve to `Autonomous` unless an explicit governance rule requires human approval.
- The public decision names and Gateway route remain unchanged.
- Casper contract and decision-proof behavior are unchanged.

## Verification completed

- Backend tests: **389 passed, 0 failed**
- TypeScript SDK tests: **33 passed, 0 failed**
- Python SDK tests: **27 passed, 0 failed**
- MCP core tests: **25 passed, 0 failed**
- TypeScript SDK compilation: passed
- MCP core TypeScript semantic check: passed
- Frontend application and security-model TypeScript semantic check with local dependency declarations: passed
- Integration-contract verification: passed
- Security verification: passed
- npm package dry run: passed with exactly five intended SDK files

## Environment limitation

A complete dependency installation and Vite production build could not be executed in the artifact environment because the configured package-manager registry returned HTTP 404 for pnpm and package downloads. The source-level checks and complete project tests listed above passed. Run the definitive repository command after replacing the files:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

## Current limitation

Autonomous review remediation is deterministic and agent-facing, but Magen3 does not yet fetch every possible external evidence source on behalf of the agent. When evidence is missing, the external agent must currently follow `decisionExplanation.agentInstruction`, obtain the required provider evidence or correct the parameters, and resubmit. Full managed evidence orchestration can be expanded in a later milestone.

## Deployment and SDK update

```bash
pnpm install --frozen-lockfile
pnpm verify
git add -A
git commit -m "feat(reviews): add AI-native resolution and agent explanations"
git push origin main
```

After Railway and Vercel deploy successfully, publish the updated TypeScript SDK:

```bash
cd packages/sdk-js
npm publish --access public --tag beta
```

External agents update with:

```bash
pnpm update @magen3/sdk@beta
```

## Conventional commit

```text
feat(reviews): add AI-native resolution and agent explanations
```
