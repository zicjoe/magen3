import { normalizeExecutionCapabilities } from "./securityModel.mjs";
import { evaluateWalletValidation } from "./walletValidation.mjs";
import { evaluateContractValidation } from "./contractValidation.mjs";
import { evaluateExecutionSimulation } from "./executionSimulation.mjs";
import { evaluateThreatIntelligence } from "./threatIntelligence.mjs";
import { evaluateOracleValidation } from "./oracleValidation.mjs";
import { evaluateBridgeControls } from "./bridgeControls.mjs";
import { evaluateComplianceControls } from "./complianceControls.mjs";

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
  threatIntelligenceContext = null,
  oracleValidationContext = null,
  bridgeControlsContext = null,
  complianceControlsContext = null,
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
    threatIntelligenceContext,
    oracleValidationContext,
    bridgeControlsContext,
    complianceControlsContext,
  };
}

export function evaluateAction({ request, agents, policies, auditLogs, threatIntelligence = {}, oracleValidation = {}, complianceControls = {} }) {
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

  const contractValidation = evaluateContractValidation({ request, policy });
  checksPassed.push(...contractValidation.checksPassed);
  checksFailed.push(...contractValidation.checksFailed);
  moduleFindings.push(...contractValidation.findings);
  score += contractValidation.scoreDelta;

  const executionSimulation = evaluateExecutionSimulation({ request });
  checksPassed.push(...executionSimulation.checksPassed);
  checksFailed.push(...executionSimulation.checksFailed);
  moduleFindings.push(...executionSimulation.findings);
  score += executionSimulation.scoreDelta;

  const threatIntelligenceResult = evaluateThreatIntelligence({ request, policy, snapshot: threatIntelligence });
  checksPassed.push(...threatIntelligenceResult.checksPassed);
  checksFailed.push(...threatIntelligenceResult.checksFailed);
  moduleFindings.push(...threatIntelligenceResult.findings);
  score += threatIntelligenceResult.scoreDelta;

  const oracleValidationResult = evaluateOracleValidation({ request, policy, snapshot: oracleValidation });
  checksPassed.push(...oracleValidationResult.checksPassed);
  checksFailed.push(...oracleValidationResult.checksFailed);
  moduleFindings.push(...oracleValidationResult.findings);
  score += oracleValidationResult.scoreDelta;

  const bridgeControlsResult = evaluateBridgeControls({ request, policy });
  checksPassed.push(...bridgeControlsResult.checksPassed);
  checksFailed.push(...bridgeControlsResult.checksFailed);
  moduleFindings.push(...bridgeControlsResult.findings);
  score += bridgeControlsResult.scoreDelta;

  const complianceControlsResult = evaluateComplianceControls({ request, policy, snapshot: complianceControls });
  checksPassed.push(...complianceControlsResult.checksPassed);
  checksFailed.push(...complianceControlsResult.checksFailed);
  moduleFindings.push(...complianceControlsResult.findings);
  score += complianceControlsResult.scoreDelta;

  const hardBlock = isBlockedAction || walletValidation.hardBlock || contractValidation.hardBlock || executionSimulation.hardBlock || threatIntelligenceResult.hardBlock || oracleValidationResult.hardBlock || bridgeControlsResult.hardBlock || complianceControlsResult.hardBlock;
  const needsReview = !hardBlock && (walletValidation.needsReview || contractValidation.needsReview || executionSimulation.needsReview || threatIntelligenceResult.needsReview || oracleValidationResult.needsReview || bridgeControlsResult.needsReview || complianceControlsResult.needsReview);

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  const reason =
    decision === "Allowed"
      ? "This action matches the active policy and can proceed to wallet signing."
      : decision === "Blocked"
        ? "This action violates one or more hard policy, wallet-validation, contract-validation, execution-preflight, threat-intelligence, oracle-validation, bridge-control, or compliance-control rules and must not execute."
        : "This action is not automatically allowed and requires authorized human review before execution.";
  const recommendedAction =
    decision === "Allowed"
      ? "Proceed to wallet signing, then attach the real execution hash to the audit record."
      : decision === "Blocked"
        ? "Do not execute. Correct the wallet, contract, destination, transaction metadata, threat-intelligence finding, oracle quote, bridge route, compliance evidence, or request parameters, or update the policy only if authorized."
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
    threatIntelligenceContext: threatIntelligenceResult.context,
    oracleValidationContext: oracleValidationResult.context,
    bridgeControlsContext: bridgeControlsResult.context,
    complianceControlsContext: complianceControlsResult.context,
  });
}
