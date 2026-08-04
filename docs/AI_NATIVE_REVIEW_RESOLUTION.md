# AI-Native Review Resolution

Magen3 protects autonomous agents without treating every uncertain action as a request for a person.

## Decision meanings

- **Allowed** — the exact evaluated parameters may reach signing only when `executionApproved` is `true`.
- **Blocked** — the action is terminal for this attempt. Nothing may be signed or sent.
- **Review Required** — execution is paused because the available evidence is not sufficient for automatic authorization. It is not automatically a human-approval request.

Every non-Allowed response includes an agent-ready explanation:

- `agentMessage` — concise text safe to show directly in the external agent.
- `decisionExplanation.primaryReason` — the exact reason.
- `decisionExplanation.triggeredRule` — the rule that caused the outcome.
- `decisionExplanation.suggestedResolution` — the recommended correction.
- `decisionExplanation.agentInstruction` — what the external agent should do next.
- `reviewResolution` — whether remediation is autonomous or human-governed.

## Review-resolution strategies

### Autonomous

Ordinary review conditions are returned to the external agent as deterministic remediation. No approval request is created. The agent corrects or supplies the requested evidence, preserves the same business-goal binding, and resubmits for a fresh decision.

Explicit governance conditions—such as a privileged action whose policy requires human approval—still escalate.

### Balanced

Low- and medium-risk review conditions use agent remediation. Explicit governance findings, high or critical findings, and very high aggregate risk escalate to the configured human or organizational approval workflow.

### Human Governed

Every Review Required decision enters the configured approval workflow. This is intended for organizations that deliberately require people or an organizational quorum for questioned actions.

Protection strictness and review resolution are separate. A strict policy can remain autonomous, while a standard policy can be human-governed.

## Gateway response example

```json
{
  "result": {
    "decision": "Review Required",
    "primaryReason": "The destination is valid but is not trusted by the active policy.",
    "triggeredRule": "Destination trust policy",
    "suggestedResolution": "Provide verified destination evidence or use a trusted destination.",
    "decisionExplanation": {
      "humanActionRequired": false,
      "reviewMode": "agent_remediation",
      "reviewState": "awaiting_agent_remediation",
      "canAgentRetry": true,
      "agentInstruction": "Stop this attempt, supply the required evidence, and resubmit the same business goal."
    },
    "reviewResolution": {
      "strategy": "Autonomous",
      "mode": "agent_remediation",
      "state": "awaiting_agent_remediation",
      "humanActionRequired": false,
      "canAgentRetry": true
    }
  },
  "executionApproved": false,
  "agentMessage": "Magen3 paused this action because the destination is valid but is not trusted by the active policy. No human approval is required yet. Nothing was signed or sent. Provide verified destination evidence or use a trusted destination.",
  "approval": null
}
```

The external agent should display `agentMessage`, keep signing disabled, follow `decisionExplanation.agentInstruction`, and resubmit only after the missing evidence or policy conflict is resolved.

## Human escalation

When `reviewResolution.humanActionRequired` is `true`, the response includes an exact-bound `approval` object when the workflow is configured. The external agent displays the reason, polls that approval, and continues only when `mayProceedToSigning` is `true` and protected parameters remain unchanged.

## Security boundary

Autonomous remediation does not mean self-approval. The requesting agent cannot convert Review Required into Allowed. It must provide the requested evidence or corrected parameters to Magen3 and receive a new deterministic decision. Magen3 remains fail-closed throughout the process.
