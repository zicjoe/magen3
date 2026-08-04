import { normalizeExecutionCapabilities } from "./securityModel.mjs";
import { evaluateWalletValidation } from "./walletValidation.mjs";
import { evaluateContractValidation } from "./contractValidation.mjs";
import { evaluateExecutionSimulation } from "./executionSimulation.mjs";
import { evaluateExecutionIntegrity } from "./executionIntegrity.mjs";
import { evaluateThreatIntelligence } from "./threatIntelligence.mjs";
import { evaluateOracleValidation } from "./oracleValidation.mjs";
import { evaluateBridgeControls } from "./bridgeControls.mjs";
import { evaluateComplianceControls } from "./complianceControls.mjs";
import { evaluateX402PaymentControls } from "./x402PaymentControls.mjs";
import { evaluateTokenPermissionControls } from "./tokenPermissionControls.mjs";
import { evaluatePrivilegedActionControls } from "./privilegedActionControls.mjs";
import { evaluateContractUpgradeSafety } from "./contractUpgradeSafety.mjs";
import { evaluateContractArgumentPolicies } from "./contractArgumentPolicies.mjs";
import { evaluateEmergencyControls } from "./emergencyControls.mjs";
import { evaluateInstructionIntegrity } from "./instructionIntegrity.mjs";
import { evaluateToolMcpIntegrity } from "./toolMcpIntegrity.mjs";
import { evaluateDelegationSafety } from "./delegationSafety.mjs";
import { evaluateRpcChainIntegrity } from "./rpcChainIntegrity.mjs";
import { evaluateGasSponsorshipFeeSafety } from "./gasSponsorshipFeeSafety.mjs";
import { buildDecisionExplanation } from "./decisionExplanation.mjs";

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
  x402PaymentControlsContext = null,
  executionIntegrityContext = null,
  tokenPermissionControlsContext = null,
  privilegedActionControlsContext = null,
  contractUpgradeSafetyContext = null,
  contractArgumentPoliciesContext = null,
  instructionIntegrityContext = null,
  toolMcpIntegrityContext = null,
  delegationSafetyContext = null,
  rpcChainIntegrityContext = null,
  gasSponsorshipFeeSafetyContext = null,
  emergencyControlsContext = null,
}) {
  const trigger = primaryFailure(moduleFindings);
  const primaryReason = trigger?.message || reason;
  const triggeredRule = trigger?.rule || "All evaluated policy rules passed";
  const suggestedResolution = trigger?.remediation || recommendedAction;
  const decisionExplanation = buildDecisionExplanation({
    decision,
    policy,
    risk,
    riskScore,
    moduleFindings,
    triggerFinding: trigger,
    primaryReason,
    triggeredRule,
    suggestedResolution,
    reason,
    recommendedAction,
  });
  return {
    decision,
    risk,
    riskScore,
    policyChecksPassed: checksPassed,
    policyChecksFailed: checksFailed,
    reason,
    recommendedAction,
    primaryReason,
    triggeredRule,
    suggestedResolution,
    decisionExplanation,
    reviewResolution: {
      strategy: decisionExplanation.strategy,
      mode: decisionExplanation.reviewMode,
      state: decisionExplanation.reviewState,
      humanActionRequired: decisionExplanation.humanActionRequired,
      agentActionRequired: decision === "Blocked" || decisionExplanation.reviewMode === "agent_remediation",
      canAgentRetry: decisionExplanation.canAgentRetry,
      mayAutoResume: decision === "Allowed",
      requiredActions: decisionExplanation.requiredActions,
      summary: decisionExplanation.summary,
    },
    moduleFindings,
    modulesEvaluated: [...new Set(moduleFindings.map((item) => item.module))],
    capabilityContext: normalizeExecutionCapabilities(agent?.executionCapabilities, agent?.type),
    activePolicy: policy ? { id: policy.id, name: policy.name, templateType: policy.templateType || "Custom" } : null,
    pipelineStages: pipelineStages({ timestamp, decision, agentFound: Boolean(agent), policyFound: Boolean(policy), moduleFindings }),
    threatIntelligenceContext,
    oracleValidationContext,
    bridgeControlsContext,
    complianceControlsContext,
    x402PaymentControlsContext,
    executionIntegrityContext,
    tokenPermissionControlsContext,
    privilegedActionControlsContext,
    contractUpgradeSafetyContext,
    contractArgumentPoliciesContext,
    instructionIntegrityContext,
    toolMcpIntegrityContext,
    delegationSafetyContext,
    rpcChainIntegrityContext,
    gasSponsorshipFeeSafetyContext,
    emergencyControlsContext,
  };
}

export function evaluateAction({ request, agents, policies, auditLogs, emergencyPauses = [], threatIntelligence = {}, oracleValidation = {}, complianceControls = {} }) {
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

  const emergencyControlsResult = evaluateEmergencyControls({ request, agent, policy, pauses: emergencyPauses });
  checksPassed.push(...emergencyControlsResult.checksPassed);
  checksFailed.push(...emergencyControlsResult.checksFailed);
  moduleFindings.push(...emergencyControlsResult.findings);
  if (emergencyControlsResult.hardBlock || emergencyControlsResult.needsReview) {
    const decision = emergencyControlsResult.hardBlock ? "Blocked" : "Review Required";
    const riskScore = emergencyControlsResult.hardBlock ? 99 : 82;
    return withStructuredResult({
      decision,
      risk: emergencyControlsResult.hardBlock ? "Critical" : "High",
      riskScore,
      checksPassed,
      checksFailed,
      reason: emergencyControlsResult.hardBlock
        ? "An active emergency pause blocks this request before the remaining authorization pipeline can run."
        : "An active emergency pause requires controlled resolution before the remaining authorization pipeline can run.",
      recommendedAction: "Do not execute or bypass the circuit breaker. Resolve the incident and complete the authorized resume workflow.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

  const instructionIntegrityResult = evaluateInstructionIntegrity({ request, policy });
  checksPassed.push(...instructionIntegrityResult.checksPassed);
  checksFailed.push(...instructionIntegrityResult.checksFailed);
  moduleFindings.push(...instructionIntegrityResult.findings);
  if (instructionIntegrityResult.hardBlock || instructionIntegrityResult.needsReview) {
    const decision = instructionIntegrityResult.hardBlock ? "Blocked" : "Review Required";
    return withStructuredResult({
      decision,
      risk: instructionIntegrityResult.hardBlock ? "Critical" : "High",
      riskScore: instructionIntegrityResult.hardBlock ? 96 : 74,
      checksPassed,
      checksFailed,
      reason: instructionIntegrityResult.hardBlock
        ? "The request failed deterministic instruction provenance, goal binding, source, parameter, or permission-scope integrity checks."
        : "The request requires authorized review because its instruction provenance or protected-parameter binding is incomplete or high risk.",
      recommendedAction: instructionIntegrityResult.hardBlock
        ? "Do not execute. Reconstruct the intent from a trusted source and bind it to a stable user goal before retrying."
        : "Pause execution and resubmit complete trusted provenance metadata. Human approval is required only when the active review strategy explicitly escalates this rule.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      instructionIntegrityContext: instructionIntegrityResult.context,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

  const toolMcpIntegrityResult = evaluateToolMcpIntegrity({ request, policy, agent });
  checksPassed.push(...toolMcpIntegrityResult.checksPassed);
  checksFailed.push(...toolMcpIntegrityResult.checksFailed);
  moduleFindings.push(...toolMcpIntegrityResult.findings);
  if (toolMcpIntegrityResult.hardBlock || toolMcpIntegrityResult.needsReview) {
    const decision = toolMcpIntegrityResult.hardBlock ? "Blocked" : "Review Required";
    return withStructuredResult({
      decision,
      risk: toolMcpIntegrityResult.hardBlock ? "Critical" : "High",
      riskScore: toolMcpIntegrityResult.hardBlock ? 96 : 74,
      checksPassed,
      checksFailed,
      reason: toolMcpIntegrityResult.hardBlock
        ? "The request failed deterministic MCP server, tool identity, hash, TLS, origin, credential, or permission-scope checks."
        : "The tool execution requires authorized review because its identity or approved scope is incomplete or materially changed.",
      recommendedAction: toolMcpIntegrityResult.hardBlock
        ? "Do not execute. Use an approved unchanged MCP server and tool with least-privilege scopes, or explicitly reapprove the material change."
        : "Pause execution and review the exact server, tool, version, hashes, origin, and requested scopes before retrying.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      instructionIntegrityContext: instructionIntegrityResult.context,
      toolMcpIntegrityContext: toolMcpIntegrityResult.context,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

  const delegationSafetyResult = evaluateDelegationSafety({ request, policy, agent, auditLogs });
  checksPassed.push(...delegationSafetyResult.checksPassed);
  checksFailed.push(...delegationSafetyResult.checksFailed);
  moduleFindings.push(...delegationSafetyResult.findings);
  if (delegationSafetyResult.hardBlock || delegationSafetyResult.needsReview) {
    const decision = delegationSafetyResult.hardBlock ? "Blocked" : "Review Required";
    return withStructuredResult({
      decision,
      risk: delegationSafetyResult.hardBlock ? "Critical" : "High",
      riskScore: delegationSafetyResult.hardBlock ? 96 : 74,
      checksPassed,
      checksFailed,
      reason: delegationSafetyResult.hardBlock
        ? "The request exceeds or invalidates the signed delegated authority, session-key scope, lifetime, revocation, or execution limit."
        : "The delegated authority requires authorized review because signer evidence, delegate approval, or scope binding is incomplete.",
      recommendedAction: delegationSafetyResult.hardBlock
        ? "Do not execute. Revoke or replace the delegation with a valid, short-lived, cryptographically signed and least-privilege authority."
        : "Pause execution and resubmit a complete signed delegation attestation. Human approval is required only when the active review strategy explicitly escalates this rule.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      instructionIntegrityContext: instructionIntegrityResult.context,
      toolMcpIntegrityContext: toolMcpIntegrityResult.context,
      delegationSafetyContext: delegationSafetyResult.context,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

  const rpcChainIntegrityResult = evaluateRpcChainIntegrity({ request, policy, auditLogs });
  checksPassed.push(...rpcChainIntegrityResult.checksPassed);
  checksFailed.push(...rpcChainIntegrityResult.checksFailed);
  moduleFindings.push(...rpcChainIntegrityResult.findings);
  if (rpcChainIntegrityResult.hardBlock || rpcChainIntegrityResult.needsReview) {
    const decision = rpcChainIntegrityResult.hardBlock ? "Blocked" : "Review Required";
    return withStructuredResult({
      decision,
      risk: rpcChainIntegrityResult.hardBlock ? "Critical" : "High",
      riskScore: rpcChainIntegrityResult.hardBlock ? 96 : 74,
      checksPassed,
      checksFailed,
      reason: rpcChainIntegrityResult.hardBlock
        ? "The request failed deterministic RPC network identity, provider, freshness, agreement, or failover checks."
        : "The request requires authorized review because RPC or chain-integrity evidence is incomplete, unavailable, or inconsistent.",
      recommendedAction: rpcChainIntegrityResult.hardBlock
        ? "Do not execute. Use approved synchronized providers that agree on the expected chain and state before retrying."
        : "Pause execution and restore the required trusted RPC evidence. Human approval is required only when the active review strategy explicitly escalates this rule.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      instructionIntegrityContext: instructionIntegrityResult.context,
      toolMcpIntegrityContext: toolMcpIntegrityResult.context,
      delegationSafetyContext: delegationSafetyResult.context,
      rpcChainIntegrityContext: rpcChainIntegrityResult.context,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

  const gasSponsorshipFeeSafetyResult = evaluateGasSponsorshipFeeSafety({ request, policy, auditLogs });
  checksPassed.push(...gasSponsorshipFeeSafetyResult.checksPassed);
  checksFailed.push(...gasSponsorshipFeeSafetyResult.checksFailed);
  moduleFindings.push(...gasSponsorshipFeeSafetyResult.findings);
  if (gasSponsorshipFeeSafetyResult.hardBlock || gasSponsorshipFeeSafetyResult.needsReview) {
    const decision = gasSponsorshipFeeSafetyResult.hardBlock ? "Blocked" : "Review Required";
    return withStructuredResult({
      decision,
      risk: gasSponsorshipFeeSafetyResult.hardBlock ? "Critical" : "High",
      riskScore: gasSponsorshipFeeSafetyResult.hardBlock ? 96 : 74,
      checksPassed,
      checksFailed,
      reason: gasSponsorshipFeeSafetyResult.hardBlock
        ? "The request failed deterministic network-fee, sponsor, Paymaster, payer, expiry, scope, budget, or sponsored-operation checks."
        : "The request requires authorized review because fee or sponsorship evidence is incomplete, unavailable, unapproved, or outside configured limits.",
      recommendedAction: gasSponsorshipFeeSafetyResult.hardBlock
        ? "Do not execute. Rebuild the transaction with bounded fees and approved, unexpired, exact-scope sponsorship evidence."
        : "Pause execution and restore the required fee or sponsorship evidence. Human approval is required only when the active review strategy explicitly escalates this rule.",
      moduleFindings,
      timestamp,
      agent,
      policy,
      instructionIntegrityContext: instructionIntegrityResult.context,
      toolMcpIntegrityContext: toolMcpIntegrityResult.context,
      delegationSafetyContext: delegationSafetyResult.context,
      rpcChainIntegrityContext: rpcChainIntegrityResult.context,
      gasSponsorshipFeeSafetyContext: gasSponsorshipFeeSafetyResult.context,
      emergencyControlsContext: emergencyControlsResult.context,
    });
  }

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

  const executionIntegrityResult = evaluateExecutionIntegrity({ request, policy, auditLogs });
  checksPassed.push(...executionIntegrityResult.checksPassed);
  checksFailed.push(...executionIntegrityResult.checksFailed);
  moduleFindings.push(...executionIntegrityResult.findings);
  score += executionIntegrityResult.scoreDelta;

  const tokenPermissionControlsResult = evaluateTokenPermissionControls({ request, policy, auditLogs });
  checksPassed.push(...tokenPermissionControlsResult.checksPassed);
  checksFailed.push(...tokenPermissionControlsResult.checksFailed);
  moduleFindings.push(...tokenPermissionControlsResult.findings);
  score += tokenPermissionControlsResult.scoreDelta;

  const privilegedActionControlsResult = evaluatePrivilegedActionControls({ request, policy });
  checksPassed.push(...privilegedActionControlsResult.checksPassed);
  checksFailed.push(...privilegedActionControlsResult.checksFailed);
  moduleFindings.push(...privilegedActionControlsResult.findings);
  score += privilegedActionControlsResult.scoreDelta;

  const contractUpgradeSafetyResult = evaluateContractUpgradeSafety({ request, policy });
  checksPassed.push(...contractUpgradeSafetyResult.checksPassed);
  checksFailed.push(...contractUpgradeSafetyResult.checksFailed);
  moduleFindings.push(...contractUpgradeSafetyResult.findings);
  score += contractUpgradeSafetyResult.scoreDelta;

  const contractArgumentPoliciesResult = evaluateContractArgumentPolicies({ request, policy });
  checksPassed.push(...contractArgumentPoliciesResult.checksPassed);
  checksFailed.push(...contractArgumentPoliciesResult.checksFailed);
  moduleFindings.push(...contractArgumentPoliciesResult.findings);
  score += contractArgumentPoliciesResult.scoreDelta;

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

  const x402PaymentControlsResult = evaluateX402PaymentControls({ request, policy, auditLogs });
  checksPassed.push(...x402PaymentControlsResult.checksPassed);
  checksFailed.push(...x402PaymentControlsResult.checksFailed);
  moduleFindings.push(...x402PaymentControlsResult.findings);
  score += x402PaymentControlsResult.scoreDelta;

  const hardBlock = emergencyControlsResult.hardBlock || instructionIntegrityResult.hardBlock || toolMcpIntegrityResult.hardBlock || delegationSafetyResult.hardBlock || rpcChainIntegrityResult.hardBlock || gasSponsorshipFeeSafetyResult.hardBlock || isBlockedAction || walletValidation.hardBlock || contractValidation.hardBlock || executionSimulation.hardBlock || executionIntegrityResult.hardBlock || tokenPermissionControlsResult.hardBlock || privilegedActionControlsResult.hardBlock || contractUpgradeSafetyResult.hardBlock || contractArgumentPoliciesResult.hardBlock || threatIntelligenceResult.hardBlock || oracleValidationResult.hardBlock || bridgeControlsResult.hardBlock || complianceControlsResult.hardBlock || x402PaymentControlsResult.hardBlock;
  const needsReview = !hardBlock && (emergencyControlsResult.needsReview || instructionIntegrityResult.needsReview || toolMcpIntegrityResult.needsReview || delegationSafetyResult.needsReview || rpcChainIntegrityResult.needsReview || gasSponsorshipFeeSafetyResult.needsReview || walletValidation.needsReview || contractValidation.needsReview || executionSimulation.needsReview || executionIntegrityResult.needsReview || tokenPermissionControlsResult.needsReview || privilegedActionControlsResult.needsReview || contractUpgradeSafetyResult.needsReview || contractArgumentPoliciesResult.needsReview || threatIntelligenceResult.needsReview || oracleValidationResult.needsReview || bridgeControlsResult.needsReview || complianceControlsResult.needsReview || x402PaymentControlsResult.needsReview);

  const decision = hardBlock ? "Blocked" : needsReview ? "Review Required" : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk = riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  const reason =
    decision === "Allowed"
      ? "This action matches the active policy and can proceed to wallet signing."
      : decision === "Blocked"
        ? "This action violates one or more hard policy, wallet-validation, contract-validation, token-permission, privileged-action, execution-integrity, fee-safety, threat-intelligence, oracle-validation, bridge-control, compliance-control, or x402-payment rules and must not execute."
        : "This action is not automatically allowed. Magen3 requires remediation, independent verification, or human approval according to the active review-resolution strategy.";
  const recommendedAction =
    decision === "Allowed"
      ? "Proceed to wallet signing, then attach the real execution hash to the audit record."
      : decision === "Blocked"
        ? "Do not execute. Correct the wallet, contract, token permission, privileged action, destination, lifecycle metadata, fee or sponsorship evidence, transaction state, threat-intelligence finding, oracle quote, bridge route, compliance evidence, x402 payment requirement, or request parameters, or update the policy only if authorized."
        : "Pause execution. Follow the returned review-resolution instructions, then resubmit policy-compliant evidence or complete approval only when explicitly required.";

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
    x402PaymentControlsContext: x402PaymentControlsResult.context,
    executionIntegrityContext: executionIntegrityResult.context,
    tokenPermissionControlsContext: tokenPermissionControlsResult.context,
    privilegedActionControlsContext: privilegedActionControlsResult.context,
    contractUpgradeSafetyContext: contractUpgradeSafetyResult.context,
    contractArgumentPoliciesContext: contractArgumentPoliciesResult.context,
    instructionIntegrityContext: instructionIntegrityResult.context,
    toolMcpIntegrityContext: toolMcpIntegrityResult.context,
    delegationSafetyContext: delegationSafetyResult.context,
    rpcChainIntegrityContext: rpcChainIntegrityResult.context,
    gasSponsorshipFeeSafetyContext: gasSponsorshipFeeSafetyResult.context,
    emergencyControlsContext: emergencyControlsResult.context,
  });
}
