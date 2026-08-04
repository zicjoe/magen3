const REVIEW_MODES = new Set(["Autonomous", "Balanced", "Human Governed"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeMode(value) {
  const raw = clean(value).toLowerCase();
  if (raw === "human governed" || raw === "human-governed" || raw === "human") return "Human Governed";
  if (raw === "balanced") return "Balanced";
  if (raw === "autonomous" || raw === "automatic") return "Autonomous";
  return "Autonomous";
}

function severityRank(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "critical") return 5;
  if (normalized === "high") return 4;
  if (normalized === "medium") return 3;
  if (normalized === "low") return 2;
  return 1;
}

function actionableFindings(findings = []) {
  return findings.filter((item) => ["warning", "unavailable", "fail"].includes(clean(item?.status).toLowerCase()));
}

function explicitlyRequiresHumanApproval(finding = {}) {
  const rule = clean(finding.rule).toLowerCase();
  const message = clean(finding.message).toLowerCase();
  const remediation = clean(finding.remediation).toLowerCase();
  const evidence = finding.evidence && typeof finding.evidence === "object" ? finding.evidence : {};

  if (evidence.approvalRequired === true || Number(evidence.requiredApprovalCount || 0) > 0) return true;
  if (rule.includes("privileged action human approval")) return true;
  if (rule.includes("upgrade approval required")) return true;
  if (rule.includes("resume approval required")) return true;
  if (rule.includes("organizational approval quorum")) return true;
  if (rule.includes("human approval quorum")) return true;
  if (message.includes("requires human approval")) return true;
  if (remediation.includes("complete exact-bound human approval")) return true;
  return false;
}

function uniqueActions(findings = [], fallback = "Review the protected parameters and resubmit with policy-compliant evidence.") {
  const actions = [];
  for (const item of findings) {
    const remediation = clean(item?.remediation);
    if (remediation && !actions.some((value) => value.toLowerCase() === remediation.toLowerCase())) actions.push(remediation);
  }
  if (actions.length === 0 && fallback) actions.push(fallback);
  return actions.slice(0, 5);
}

function sentence(value) {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function resolveReviewStrategy({ decision, policy, risk = "Medium", riskScore = 50, moduleFindings = [], primaryReason = "", triggeredRule = "", suggestedResolution = "" } = {}) {
  const structuredRules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const configuredMode = normalizeMode(structuredRules.reviewResolutionMode);
  const findings = actionableFindings(moduleFindings);
  const explicitHuman = findings.some(explicitlyRequiresHumanApproval);
  const highestSeverity = findings.reduce((highest, finding) => Math.max(highest, severityRank(finding?.severity)), 0);
  const balancedHuman = configuredMode === "Balanced" && (explicitHuman || highestSeverity >= 4 || Number(riskScore || 0) >= 75);
  const humanActionRequired = decision === "Review Required" && (configuredMode === "Human Governed" || explicitHuman || balancedHuman);

  if (decision === "Allowed") {
    return {
      strategy: configuredMode,
      mode: "not_required",
      state: "resolved",
      humanActionRequired: false,
      agentActionRequired: false,
      canAgentRetry: false,
      mayAutoResume: true,
      requiredActions: [],
      summary: "Magen3 authorized the exact submitted action.",
    };
  }

  if (decision === "Blocked") {
    return {
      strategy: configuredMode,
      mode: "blocked",
      state: "terminal",
      humanActionRequired: false,
      agentActionRequired: true,
      canAgentRetry: true,
      mayAutoResume: false,
      requiredActions: uniqueActions(findings, suggestedResolution),
      summary: "Magen3 blocked the action. The agent must not sign, submit, or bypass the decision.",
    };
  }

  if (humanActionRequired) {
    return {
      strategy: configuredMode,
      mode: "human_approval",
      state: "awaiting_human_approval",
      humanActionRequired: true,
      agentActionRequired: false,
      canAgentRetry: false,
      mayAutoResume: false,
      requiredActions: uniqueActions(findings, suggestedResolution || "Complete the exact-bound approval workflow before signing."),
      summary: "Magen3 paused the action and the active policy requires an independent human or organizational approval.",
    };
  }

  return {
    strategy: configuredMode,
    mode: "agent_remediation",
    state: "awaiting_agent_remediation",
    humanActionRequired: false,
    agentActionRequired: true,
    canAgentRetry: true,
    mayAutoResume: false,
    requiredActions: uniqueActions(findings, suggestedResolution),
    summary: "Magen3 paused the action for autonomous remediation. Human approval is not required unless a later policy rule explicitly escalates it.",
  };
}

export function buildDecisionExplanation({ decision, policy, risk = "Medium", riskScore = 50, moduleFindings = [], primaryReason = "", triggeredRule = "", suggestedResolution = "", reason = "", recommendedAction = "" } = {}) {
  const effectiveReason = clean(primaryReason || reason || "Magen3 could not authorize the action.");
  const effectiveRule = clean(triggeredRule || "Policy evaluation");
  const effectiveResolution = clean(suggestedResolution || recommendedAction || "Review the policy findings before retrying.");
  const reviewResolution = resolveReviewStrategy({ decision, policy, risk, riskScore, moduleFindings, primaryReason: effectiveReason, triggeredRule: effectiveRule, suggestedResolution: effectiveResolution });

  let userMessage;
  let agentInstruction;
  if (decision === "Allowed") {
    userMessage = `Magen3 allowed this action. ${sentence(effectiveReason)} The exact submitted parameters may proceed to the execution layer.`;
    agentInstruction = "Proceed only with the exact parameters evaluated by Magen3. After a real submission, report the execution status and transaction hash.";
  } else if (decision === "Blocked") {
    userMessage = `Magen3 blocked this action because ${sentence(effectiveReason)} Nothing was signed or sent. ${sentence(effectiveResolution)}`;
    agentInstruction = `Stop execution. Do not sign, submit, retry unchanged, or bypass Magen3. ${sentence(effectiveResolution)}`;
  } else if (reviewResolution.humanActionRequired) {
    userMessage = `Magen3 paused this action because ${sentence(effectiveReason)} Human approval is required by the active policy. Nothing was signed or sent. ${sentence(effectiveResolution)}`;
    agentInstruction = "Stop execution and surface the exact reason to the user. Poll the bound approval request and continue only when mayProceedToSigning is true and the protected parameters are unchanged.";
  } else {
    userMessage = `Magen3 paused this action because ${sentence(effectiveReason)} No human approval is required yet. Nothing was signed or sent. ${sentence(effectiveResolution)}`;
    agentInstruction = `Stop this attempt, correct or supply the required evidence, and resubmit the same business goal with stable lifecycle binding. ${sentence(effectiveResolution)}`;
  }

  return {
    decision,
    strategy: reviewResolution.strategy,
    summary: reviewResolution.summary,
    primaryReason: effectiveReason,
    triggeredRule: effectiveRule,
    suggestedResolution: effectiveResolution,
    userMessage,
    agentInstruction,
    humanActionRequired: reviewResolution.humanActionRequired,
    reviewMode: reviewResolution.mode,
    reviewState: reviewResolution.state,
    canAgentRetry: reviewResolution.canAgentRetry,
    requiredActions: reviewResolution.requiredActions,
  };
}

export function supportedReviewResolutionModes() {
  return [...REVIEW_MODES];
}
