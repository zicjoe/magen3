import { normalizeExecutionCapabilities } from "./securityModel.mjs";

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDailyUsed(agentId, auditLogs) {
  const now = new Date();
  return auditLogs
    .filter((log) => log.agentId === agentId && log.decision === "Allowed" && isSameDay(new Date(log.timestamp), now))
    .reduce((sum, log) => sum + Number(log.amount || 0), 0);
}

function targetIsTrusted(request, policy) {
  const normalizedTarget = String(request.target || "").trim().toLowerCase();
  const trustedList = (policy.trustedContracts || []).map((contract) => String(contract).trim().toLowerCase());
  return request.targetType === "Trusted Contract" || Boolean(normalizedTarget && trustedList.includes(normalizedTarget));
}

function finding({ module, status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module, status, severity, rule, message, evidence, remediation };
}

function primaryFailure(findings) {
  return findings.find((item) => item.status === "fail") || findings.find((item) => item.status === "warning");
}

function pipelineStages({ timestamp, decision, agentFound, policyFound }) {
  const finalStatus = decision === "Allowed" ? "completed" : decision === "Blocked" ? "failed" : "warning";
  return [
    { id: "intent-received", label: "Intent received", status: "completed", timestamp },
    { id: "agent-authentication", label: agentFound ? "Agent authenticated" : "Agent authentication failed", status: agentFound ? "completed" : "failed", timestamp },
    { id: "agent-configuration", label: agentFound ? "Agent configuration loaded" : "Agent configuration unavailable", status: agentFound ? "completed" : "skipped", timestamp },
    { id: "policy-loaded", label: policyFound ? "Active policy loaded" : "Active policy unavailable", status: policyFound ? "completed" : agentFound ? "failed" : "skipped", timestamp },
    { id: "protection-checks", label: "Relevant protection checks completed", status: policyFound ? finalStatus : "skipped", timestamp },
    { id: "risk-assessment", label: "Risk assessment completed", status: finalStatus, timestamp },
    { id: "decision", label: `Decision returned: ${decision}`, status: finalStatus, timestamp },
    { id: "audit-stored", label: "Audit stored", status: "pending", timestamp: "" },
    { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
  ];
}

function withStructuredResult({
  decision,
  risk,
  riskScore,
  checksPassed,
  checksFailed,
  reason,
  recommendedAction,
  moduleFindings,
  timestamp,
  agent,
  policy,
}) {
  const trigger = primaryFailure(moduleFindings);
  return {
    decision,
    risk,
    riskScore,
    policyChecksPassed: checksPassed,
    policyChecksFailed: checksFailed,
    reason,
    recommendedAction,
    primaryReason: trigger?.message || reason,
    triggeredRule: trigger?.rule || "All evaluated policy rules passed",
    suggestedResolution: trigger?.remediation || recommendedAction,
    moduleFindings,
    modulesEvaluated: [...new Set(moduleFindings.map((item) => item.module))],
    capabilityContext: normalizeExecutionCapabilities(agent?.executionCapabilities, agent?.type),
    activePolicy: policy ? { id: policy.id, name: policy.name, templateType: policy.templateType || "Custom" } : null,
    pipelineStages: pipelineStages({ timestamp, decision, agentFound: Boolean(agent), policyFound: Boolean(policy) }),
  };
}

export function evaluateAction({ request, agents, policies, auditLogs }) {
  const timestamp = new Date().toISOString();
  const agent = agents.find((item) => item.id === request.agentId);
  const policy = policies.find((item) => item.agentId === request.agentId && item.status === "Active");
  const checksPassed = [];
  const checksFailed = [];
  const moduleFindings = [];

  if (!agent) {
    moduleFindings.push(finding({
      module: "Identity and Authentication",
      status: "fail",
      severity: "critical",
      rule: "Registered agent required",
      message: "Selected agent is not registered in Magen3.",
      evidence: { agentId: request.agentId },
      remediation: "Register the agent and use its Agent ID plus API key before retrying.",
    }));
    return withStructuredResult({
      decision: "Blocked",
      risk: "High",
      riskScore: 82,
      checksPassed: [],
      checksFailed: ["Selected agent is not registered in Magen3"],
      reason: "Magen3 cannot allow execution from an unknown agent.",
      recommendedAction: "Register the agent before allowing any Web3 action.",
      moduleFindings,
      timestamp,
      agent: null,
      policy: null,
    });
  }

  if (agent.status === "Revoked") {
    moduleFindings.push(finding({
      module: "Identity and Authentication",
      status: "fail",
      severity: "critical",
      rule: "Active agent required",
      message: `Agent ${agent.name} has been revoked.`,
      evidence: { agentId: agent.id, status: agent.status },
      remediation: "Register or reactivate an authorized agent before retrying. Revoked credentials must not be reused.",
    }));
    return withStructuredResult({
      decision: "Blocked",
      risk: "High",
      riskScore: 90,
      checksPassed: [],
      checksFailed: ["The selected agent has been revoked"],
      reason: "Magen3 cannot allow execution from a revoked agent.",
      recommendedAction: "Stop execution and use an active authorized agent.",
      moduleFindings,
      timestamp,
      agent,
      policy: null,
    });
  }

  moduleFindings.push(finding({
    module: "Identity and Authentication",
    status: "pass",
    severity: "info",
    rule: "Registered active agent",
    message: `Agent ${agent.name} is registered and active.`,
    evidence: { agentId: agent.id, status: agent.status },
  }));
  checksPassed.push(`Agent ${agent.name} is registered`);

  if (!policy) {
    moduleFindings.push(finding({
      module: "Policy Enforcement",
      status: "fail",
      severity: "critical",
      rule: "Active policy required",
      message: "No active security policy is assigned to this agent.",
      evidence: { agentId: agent.id },
      remediation: "Create or activate a policy for this agent before retrying.",
    }));
    return withStructuredResult({
      decision: "Blocked",
      risk: "High",
      riskScore: 78,
      checksPassed,
      checksFailed: ["No active security policy found for this agent"],
      reason: "This agent has no active policy, so Magen3 blocks execution by default.",
      recommendedAction: "Create and activate a policy for this agent first.",
      moduleFindings,
      timestamp,
      agent,
      policy: null,
    });
  }

  moduleFindings.push(finding({
    module: "Policy Enforcement",
    status: "pass",
    severity: "info",
    rule: "Active policy loaded",
    message: `Active policy loaded: ${policy.name}.`,
    evidence: { policyId: policy.id, policyName: policy.name, riskMode: policy.riskMode },
  }));

  const amount = Number(request.amount || 0);
  const dailyUsed = getDailyUsed(request.agentId, auditLogs);
  const dailyAfterAction = dailyUsed + amount;
  const isTrusted = targetIsTrusted(request, policy);
  const isBlockedAction = (policy.blockedActions || []).includes(request.actionType);
  const strictMode = policy.riskMode === "Conservative";
  const relaxedMode = policy.riskMode === "Aggressive";
  const targetModule = String(request.targetType || "").includes("Wallet") ? "Wallet Validation" : "Contract Validation";
  let score = 5;

  checksPassed.push(`Active policy found: ${policy.name}`);

  if (isBlockedAction) {
    const message = `Action type is blocked by policy: ${request.actionType}`;
    checksFailed.push(message);
    score += 35;
    moduleFindings.push(finding({
      module: "Policy Enforcement",
      status: "fail",
      severity: "critical",
      rule: "Blocked actions",
      message,
      evidence: { received: request.actionType, blockedActions: policy.blockedActions || [] },
      remediation: "Use an action permitted by the active policy, or update the policy if authorized.",
    }));
  } else {
    const message = `Action type is not blocked: ${request.actionType}`;
    checksPassed.push(message);
    moduleFindings.push(finding({
      module: "Policy Enforcement",
      status: "pass",
      rule: "Blocked actions",
      message,
      evidence: { received: request.actionType },
    }));
  }

  if (amount > Number(policy.maxTransaction)) {
    const message = `Amount exceeds max transaction limit (${amount} > ${policy.maxTransaction} CSPR)`;
    checksFailed.push(message);
    score += 30;
    moduleFindings.push(finding({
      module: "Risk Assessment",
      status: "fail",
      severity: "high",
      rule: "Maximum transaction amount",
      message,
      evidence: { received: amount, maximum: Number(policy.maxTransaction), asset: "CSPR" },
      remediation: `Reduce the amount to ${policy.maxTransaction} CSPR or less, or update the policy if authorized.`,
    }));
  } else {
    const message = `Amount within max transaction limit (${amount} ≤ ${policy.maxTransaction} CSPR)`;
    checksPassed.push(message);
    moduleFindings.push(finding({
      module: "Risk Assessment",
      status: "pass",
      rule: "Maximum transaction amount",
      message,
      evidence: { received: amount, maximum: Number(policy.maxTransaction), asset: "CSPR" },
    }));
  }

  if (dailyAfterAction > Number(policy.dailyLimit)) {
    const message = `Daily limit would be exceeded (${dailyAfterAction} > ${policy.dailyLimit} CSPR)`;
    checksFailed.push(message);
    score += 25;
    moduleFindings.push(finding({
      module: "Risk Assessment",
      status: "fail",
      severity: "high",
      rule: "Daily spending limit",
      message,
      evidence: { usedToday: dailyUsed, requested: amount, projected: dailyAfterAction, maximum: Number(policy.dailyLimit) },
      remediation: "Reduce the amount or wait until the daily window resets. Only an authorized policy owner should raise the limit.",
    }));
  } else {
    const message = `Daily limit remains valid (${dailyAfterAction} ≤ ${policy.dailyLimit} CSPR)`;
    checksPassed.push(message);
    moduleFindings.push(finding({
      module: "Risk Assessment",
      status: "pass",
      rule: "Daily spending limit",
      message,
      evidence: { usedToday: dailyUsed, requested: amount, projected: dailyAfterAction, maximum: Number(policy.dailyLimit) },
    }));
  }

  if (isTrusted) {
    const message = "Target is trusted or policy-approved";
    checksPassed.push(message);
    moduleFindings.push(finding({
      module: targetModule,
      status: "pass",
      rule: "Approved destination or contract",
      message,
      evidence: { target: request.target, targetType: request.targetType },
    }));
  } else {
    const message = "Target is not in the trusted target list";
    checksFailed.push(message);
    score += strictMode ? 35 : 25;
    moduleFindings.push(finding({
      module: targetModule,
      status: strictMode || request.targetType === "Unknown Contract" ? "fail" : "warning",
      severity: strictMode || request.targetType === "Unknown Contract" ? "high" : "medium",
      rule: "Approved destination or contract",
      message,
      evidence: { target: request.target, targetType: request.targetType, trustedContracts: policy.trustedContracts || [] },
      remediation: "Use a policy-approved destination or contract, or add this target after authorized review.",
    }));
  }

  if (amount > Number(policy.approvalThreshold)) {
    const message = `Amount exceeds approval threshold (${amount} > ${policy.approvalThreshold} CSPR)`;
    checksFailed.push(message);
    score += relaxedMode ? 10 : 18;
    moduleFindings.push(finding({
      module: "Policy Enforcement",
      status: "warning",
      severity: "medium",
      rule: "Human review threshold",
      message,
      evidence: { received: amount, threshold: Number(policy.approvalThreshold), asset: "CSPR" },
      remediation: `Reduce the amount to ${policy.approvalThreshold} CSPR or less, or obtain authorized human review.`,
    }));
  } else {
    const message = `Amount below approval threshold (${amount} ≤ ${policy.approvalThreshold} CSPR)`;
    checksPassed.push(message);
    moduleFindings.push(finding({
      module: "Policy Enforcement",
      status: "pass",
      rule: "Human review threshold",
      message,
      evidence: { received: amount, threshold: Number(policy.approvalThreshold), asset: "CSPR" },
    }));
  }

  if (["Swap", "Deposit to Vault", "Contract Interaction"].includes(request.actionType)) {
    moduleFindings.push(finding({
      module: "Execution Simulation",
      status: "unavailable",
      severity: "info",
      rule: "Pre-execution simulation",
      message: "Execution simulation is not enforced by the current backend and did not contribute a pass result.",
      evidence: { actionType: request.actionType },
      remediation: "Treat simulation as Preview until a verified simulation provider is configured.",
    }));
  }

  const hardBlock =
    isBlockedAction ||
    amount > Number(policy.maxTransaction) ||
    dailyAfterAction > Number(policy.dailyLimit) ||
    (!isTrusted && (strictMode || request.targetType === "Unknown Contract"));
  const needsReview = !hardBlock && (amount > Number(policy.approvalThreshold) || !isTrusted);

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  const reason =
    decision === "Allowed"
      ? "This action matches the active policy and can proceed to wallet signing."
      : decision === "Blocked"
        ? "This action violates one or more hard policy rules and must not execute."
        : "This action is not automatically allowed and requires authorized human review before execution.";
  const recommendedAction =
    decision === "Allowed"
      ? "Proceed to wallet signing, then attach the real execution hash to the audit record."
      : decision === "Blocked"
        ? "Do not execute. Change the request parameters or update the policy only if authorized."
        : "Pause execution and obtain human approval or retry with policy-compliant parameters.";

  return withStructuredResult({
    decision,
    risk,
    riskScore,
    checksPassed,
    checksFailed,
    reason,
    recommendedAction,
    moduleFindings,
    timestamp,
    agent,
    policy,
  });
}
