import test from "node:test";
import assert from "node:assert/strict";
import { buildDecisionExplanation, resolveReviewStrategy } from "./decisionExplanation.mjs";

const reviewFinding = {
  module: "RPC & Chain Integrity",
  status: "warning",
  severity: "medium",
  rule: "RPC evidence unavailable",
  message: "Trusted RPC evidence was not supplied.",
  remediation: "Collect fresh evidence from an approved RPC provider and resubmit.",
};

test("autonomous review routes ordinary uncertainty to agent remediation", () => {
  const resolution = resolveReviewStrategy({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Autonomous", approvalWorkflowEnabled: true } },
    riskScore: 60,
    moduleFindings: [reviewFinding],
    suggestedResolution: reviewFinding.remediation,
  });
  assert.equal(resolution.mode, "agent_remediation");
  assert.equal(resolution.humanActionRequired, false);
  assert.equal(resolution.canAgentRetry, true);
});

test("explicit privileged approval remains human governed in autonomous mode", () => {
  const resolution = resolveReviewStrategy({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Autonomous" } },
    moduleFindings: [{
      module: "Privileged Action Controls",
      status: "warning",
      severity: "high",
      rule: "Privileged action human approval",
      message: "Ownership Transfer requires exact-bound Human Approval before wallet signing.",
      evidence: { approvalRequired: true, requiredApprovalCount: 2 },
      remediation: "Complete exact-bound Human Approval before wallet signing.",
    }],
  });
  assert.equal(resolution.mode, "human_approval");
  assert.equal(resolution.humanActionRequired, true);
});

test("balanced strategy keeps medium-risk uncertainty autonomous", () => {
  const resolution = resolveReviewStrategy({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Balanced" } },
    riskScore: 60,
    moduleFindings: [reviewFinding],
  });
  assert.equal(resolution.mode, "agent_remediation");
  assert.equal(resolution.humanActionRequired, false);
});

test("balanced strategy escalates high-severity uncertainty", () => {
  const resolution = resolveReviewStrategy({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Balanced" } },
    riskScore: 70,
    moduleFindings: [{ ...reviewFinding, severity: "high" }],
  });
  assert.equal(resolution.mode, "human_approval");
  assert.equal(resolution.humanActionRequired, true);
});

test("human governed strategy sends every review to approval", () => {
  const resolution = resolveReviewStrategy({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Human Governed" } },
    moduleFindings: [reviewFinding],
  });
  assert.equal(resolution.mode, "human_approval");
  assert.equal(resolution.humanActionRequired, true);
});

test("blocked explanation is ready to show inside an external agent", () => {
  const explanation = buildDecisionExplanation({
    decision: "Blocked",
    policy: { structuredRules: {} },
    primaryReason: "Amount exceeds the maximum transaction limit.",
    triggeredRule: "Maximum transaction amount",
    suggestedResolution: "Reduce the amount to 10 CSPR or less.",
    moduleFindings: [{ status: "fail", severity: "high", rule: "Maximum transaction amount", message: "Amount exceeds the maximum transaction limit.", remediation: "Reduce the amount to 10 CSPR or less." }],
  });
  assert.match(explanation.userMessage, /Magen3 blocked this action because/i);
  assert.match(explanation.userMessage, /Nothing was signed or sent/i);
  assert.equal(explanation.humanActionRequired, false);
});

test("agent-remediation explanation says human approval is not required yet", () => {
  const explanation = buildDecisionExplanation({
    decision: "Review Required",
    policy: { structuredRules: { reviewResolutionMode: "Autonomous" } },
    primaryReason: reviewFinding.message,
    triggeredRule: reviewFinding.rule,
    suggestedResolution: reviewFinding.remediation,
    moduleFindings: [reviewFinding],
  });
  assert.match(explanation.userMessage, /No human approval is required yet/i);
  assert.equal(explanation.reviewMode, "agent_remediation");
});

test("structured diagnostics are copied from the primary finding", () => {
  const explanation = buildDecisionExplanation({
    decision: "Blocked",
    policy: { structuredRules: { reviewResolutionMode: "Autonomous" } },
    risk: "Critical",
    riskScore: 96,
    primaryReason: "The prepared amount changed from 5 to 10.",
    triggeredRule: "Protected parameter binding",
    suggestedResolution: "Restore the original amount.",
    triggerFinding: {
      module: "Agent Instruction Integrity",
      evidence: {
        code: "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH",
        field: "amount",
        expected: 5,
        received: 10,
        mismatchFields: ["amount"],
        differences: [{ field: "amount", expected: 5, received: 10 }],
      },
    },
    moduleFindings: [{ status: "fail", severity: "critical", rule: "Protected parameter binding", message: "The prepared amount changed from 5 to 10.", remediation: "Restore the original amount." }],
  });
  assert.equal(explanation.code, "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH");
  assert.equal(explanation.module, "Agent Instruction Integrity");
  assert.equal(explanation.field, "amount");
  assert.equal(explanation.expected, 5);
  assert.equal(explanation.received, 10);
  assert.deepEqual(explanation.mismatchFields, ["amount"]);
  assert.match(explanation.userMessage, /because the prepared amount changed/i);
});
