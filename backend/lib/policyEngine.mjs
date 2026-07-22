import { normalizeExecutionCapabilities } from "./securityModel.mjs";
import { evaluateWalletValidation } from "./walletValidation.mjs";

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDailyUsed(agentId, auditLogs, executionWalletAddress = "") {
  const now = new Date();
  const normalizedExecutionWallet = String(executionWalletAddress || "").trim().toLowerCase();
  return auditLogs
    .filter((log) => {
      if (log.agentId !== agentId || log.decision !== "Allowed" || !isSameDay(new Date(log.timestamp), now)) return false;
      const logExecutionWallet = String(log.executionWalletAddress || "").trim().toLowerCase();
      // Count matching-wallet records plus legacy records that predate execution-wallet persistence.
      return !normalizedExecutionWallet || !logExecutionWallet || logExecutionWallet === normalizedExecutionWallet;
    })
    .reduce((sum, log) => sum + Number(log.amount || 0), 0);
}

function targetIsTrusted(request, policy) {
  const normalizedTarget = String(request.target || "").trim().toLowerCase();
  const trustedList = (policy.trustedContracts || []).map((contract) => String(contract).trim().toLowerCase());
  // Preserve the existing trusted-contract classification for backward compatibility.
  // Wallet destinations never use this shortcut; Wallet Validation requires a policy-listed target.
  return request.targetType === "Trusted Contract" || Boolean(normalizedTarget && trustedList.includes(normalizedTarget));
}

function finding({ module, status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return { module, status, severity, rule, message, evidence, remediation };
}

function primaryFailure(findings) {
  return findings.find((item) => item.status === "fail") || findings.find((item) => item.status === "warning");
}

function stageStatusFromFindings(findings = []) {
  if (findings.some((item) => item.status === "fail")) return "failed";
  if (findings.some((item) => item.status === "warning" || item.status === "unavailable")) return "warning";
  if (findings.length > 0 && findings.every((item) => item.status === "skipped")) return "skipped";
  return "completed";
}

function stageIdForModule(module) {
  return String(module || "module")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function pipelineStages({ timestamp, decision, agentFound, policyFound, moduleFindings = [] }) {
  const finalStatus = decision === "Allowed" ? "completed" : decision === "Blocked" ? "failed" : "warning";
  const dedicatedModules = [...new Set(moduleFindings.map((item) => item.module))]
    .filter((module) => !["Identity and Authentication", "Policy Enforcement", "Risk Assessment"].includes(module));
  const moduleStages = dedicatedModules.map((module) => {
    const findings = moduleFindings.filter((item) => item.module === module);
    return {
      id: stageIdForModule(module),
      label: `${module} evaluated`,
      status: stageStatusFromFindings(findings),
      timestamp,
    };
  });

  return [
    { id: "intent-received", label: "Intent received", status: "completed", timestamp },
    { id: "agent-authentication", label: agentFound ? "Agent authenticated" : "Agent authentication failed", status: agentFound ? "completed" : "failed", timestamp },
    { id: "agent-configuration", label: agentFound ? "Agent configuration loaded" : "Agent configuration unavailable", status: agentFound ? "completed" : "skipped", timestamp },
    { id: "policy-loaded", label: policyFound ? "Active policy loaded" : "Active policy unavailable", status: policyFound ? "completed" : agentFound ? "failed" : "skipped", timestamp },
    ...moduleStages,
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
    pipelineStages: pipelineStages({ timestamp, decision, agentFound: Boolean(agent), policyFound: Boolean(policy), moduleFindings }),
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

  const dailyUsed = getDailyUsed(request.agentId, auditLogs, request.executionWalletAddress || request.walletAddress);
  const isBlockedAction = (policy.blockedActions || []).includes(request.actionType);
  const strictMode = policy.riskMode === "Conservative";
  const walletValidation = evaluateWalletValidation({ request, policy, auditLogs, dailyUsed });
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

  checksPassed.push(...walletValidation.checksPassed);
  checksFailed.push(...walletValidation.checksFailed);
  moduleFindings.push(...walletValidation.findings);
  score += walletValidation.scoreDelta;

  let contractHardBlock = false;
  let contractNeedsReview = false;

  if (!walletValidation.walletDestination) {
    const isTrusted = targetIsTrusted(request, policy);
    if (isTrusted) {
      const message = "Contract or non-wallet target is trusted or policy-approved";
      checksPassed.push(message);
      moduleFindings.push(finding({
        module: "Contract Validation",
        status: "pass",
        rule: "Approved contract or target",
        message,
        evidence: { target: request.target, targetType: request.targetType },
      }));
    } else {
      const message = "Contract or non-wallet target is not in the trusted target list";
      checksFailed.push(message);
      score += strictMode ? 35 : 25;
      contractHardBlock = strictMode || request.targetType === "Unknown Contract";
      contractNeedsReview = !contractHardBlock;
      moduleFindings.push(finding({
        module: "Contract Validation",
        status: contractHardBlock ? "fail" : "warning",
        severity: contractHardBlock ? "high" : "medium",
        rule: "Approved contract or target",
        message,
        evidence: { target: request.target, targetType: request.targetType, trustedContracts: policy.trustedContracts || [] },
        remediation: "Use a policy-approved contract or target, or add it after authorized review.",
      }));
    }
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

  const hardBlock = isBlockedAction || walletValidation.hardBlock || contractHardBlock;
  const needsReview = !hardBlock && (walletValidation.needsReview || contractNeedsReview);

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  const reason =
    decision === "Allowed"
      ? "This action matches the active policy and can proceed to wallet signing."
      : decision === "Blocked"
        ? "This action violates one or more hard policy or wallet-validation rules and must not execute."
        : "This action is not automatically allowed and requires authorized human review before execution.";
  const recommendedAction =
    decision === "Allowed"
      ? "Proceed to wallet signing, then attach the real execution hash to the audit record."
      : decision === "Blocked"
        ? "Do not execute. Correct the wallet, destination, or request parameters, or update the policy only if authorized."
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
