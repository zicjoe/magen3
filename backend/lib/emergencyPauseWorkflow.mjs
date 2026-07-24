import { makeId } from "./ids.mjs";
import { createApprovalRequest } from "./approvalWorkflow.mjs";
import { emergencyControlPolicy, normalizeEmergencyAction, normalizeEmergencyScope } from "./emergencyControls.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeWallet(value) {
  return clean(value).toLowerCase();
}

function uniqueWallets(values = []) {
  return [...new Map((Array.isArray(values) ? values : []).map(clean).filter(Boolean).map((value) => [normalizeWallet(value), value])).values()];
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function boolValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "enabled", "on"].includes(value.toLowerCase());
  return fallback;
}

function validDate(value) {
  if (!clean(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function requireReason(value) {
  const reason = clean(value);
  if (reason.length < 8) {
    const error = new Error("Emergency pause reason must contain at least 8 characters.");
    error.status = 400;
    throw error;
  }
  return reason.slice(0, 1000);
}

export function normalizeEmergencyPauseInput({ body = {}, ownerWalletAddress, agents = [], policies = [], now = new Date(), triggerType = "Manual" }) {
  const walletAddress = clean(ownerWalletAddress || body.walletAddress || body.ownerWalletAddress);
  if (!walletAddress) {
    const error = new Error("A connected owner wallet is required to manage emergency controls.");
    error.status = 400;
    throw error;
  }

  const scopeType = normalizeEmergencyScope(body.scopeType || body.scope || "Agent");
  if (!scopeType) {
    const error = new Error("scopeType must be Platform, Agent, Capability, Action, Policy, Trading, Contract, Bridge, x402, or All Execution.");
    error.status = 400;
    throw error;
  }

  const agentId = clean(body.agentId);
  const policyId = clean(body.policyId);
  const scopeValue = clean(body.scopeValue || (scopeType === "Agent" ? agentId : scopeType === "Policy" ? policyId : scopeType));
  const ownedAgents = agents.filter((agent) => normalizeWallet(agent.ownerWalletAddress) === normalizeWallet(walletAddress));
  const agent = agentId ? ownedAgents.find((item) => item.id === agentId) : null;
  if (agentId && !agent) {
    const error = new Error("Emergency pause agent is not registered under the connected wallet.");
    error.status = 403;
    throw error;
  }
  if (["Agent", "Capability", "Action", "Trading", "Contract", "Bridge", "x402"].includes(scopeType) && !agentId) {
    const error = new Error(`${scopeType} emergency pauses require agentId so the pause cannot affect another owner's agents.`);
    error.status = 400;
    throw error;
  }
  if (scopeType === "Capability") {
    if (!scopeValue || !agent?.executionCapabilities?.includes(scopeValue)) {
      const error = new Error("Capability pause scopeValue must be one of the selected agent's execution capabilities.");
      error.status = 400;
      throw error;
    }
  }
  if (scopeType === "Action" && !scopeValue) {
    const error = new Error("Action pauses require scopeValue with the exact normalized action type.");
    error.status = 400;
    throw error;
  }

  const policy = policyId ? policies.find((item) => item.id === policyId && normalizeWallet(item.ownerWalletAddress || walletAddress) === normalizeWallet(walletAddress)) : agentId ? policies.find((item) => item.agentId === agentId && item.status === "Active") : null;
  if (policyId && !policy) {
    const error = new Error("Emergency pause policy is not available under the connected wallet.");
    error.status = 403;
    throw error;
  }
  if (scopeType === "Policy" && !policyId) {
    const error = new Error("Policy pauses require policyId.");
    error.status = 400;
    throw error;
  }

  const policyConfig = emergencyControlPolicy(policy || {});
  const durationSeconds = boundedInteger(body.durationSeconds, policyConfig.pauseDurationSeconds, 0, 2592000);
  const explicitExpiry = validDate(body.expiresAt);
  if (clean(body.expiresAt) && !explicitExpiry) {
    const error = new Error("expiresAt must be a valid ISO date-time when supplied.");
    error.status = 400;
    throw error;
  }
  const createdAt = now instanceof Date ? now : new Date(now);
  const expiresAt = explicitExpiry || (durationSeconds > 0 ? new Date(createdAt.getTime() + durationSeconds * 1000) : null);
  if (expiresAt && expiresAt.getTime() <= createdAt.getTime()) {
    const error = new Error("Emergency pause expiry must be in the future.");
    error.status = 400;
    throw error;
  }

  const resumeAuthorityWallets = uniqueWallets(body.resumeAuthorityWallets || policy?.structuredRules?.approvalApproverWallets || [walletAddress]);
  if (!resumeAuthorityWallets.some((item) => normalizeWallet(item) === normalizeWallet(walletAddress))) {
    resumeAuthorityWallets.push(walletAddress);
  }
  const resumeRequiresApproval = boolValue(body.resumeRequiresApproval, policyConfig.resumeRequiresApproval);
  const resumeQuorum = boundedInteger(body.resumeQuorum, policyConfig.resumeQuorum, 1, 10);

  return {
    id: clean(body.id) || makeId("PAUSE"),
    ownerWalletAddress: walletAddress,
    agentId,
    policyId: policy?.id || policyId,
    scopeType,
    scopeValue,
    enforcementAction: normalizeEmergencyAction(body.enforcementAction || policyConfig.automaticPauseAction, "Blocked"),
    triggerType: clean(triggerType || body.triggerType || "Manual") || "Manual",
    triggerRule: clean(body.triggerRule || (triggerType === "Automatic" ? "Automatic circuit-breaker trigger" : "Manual emergency pause")),
    reason: requireReason(body.reason),
    triggerEvidence: body.triggerEvidence && typeof body.triggerEvidence === "object" ? body.triggerEvidence : {},
    status: "Active",
    createdByWallet: clean(body.createdByWallet || walletAddress),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : "",
    resumeAuthorityWallets,
    resumeRequiresApproval,
    resumeQuorum,
    resumeApprovalRequestId: "",
    resumedByWallet: "",
    resumeReason: "",
    resumedAt: "",
    updatedAt: createdAt.toISOString(),
    agent,
    policy,
  };
}

export function publicEmergencyPause(pause = {}, now = new Date()) {
  const expiry = validDate(pause.expiresAt);
  const expired = pause.status === "Active" && expiry && expiry.getTime() <= (now instanceof Date ? now : new Date(now)).getTime();
  return {
    ...pause,
    status: expired ? "Expired" : pause.status,
    active: !expired && pause.status === "Active",
  };
}

export function buildEmergencyAuditLog({ pause, agent = null, policy = null, event = "activated", decision = "Allowed", now = new Date(), approvalRequest = null }) {
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const isResumeRequest = event === "resume-requested";
  const isResume = event === "resumed";
  const action = isResumeRequest ? "Emergency Resume Requested" : isResume ? "Emergency Pause Resumed" : "Emergency Pause Activated";
  const reason = isResumeRequest
    ? `Resume approval requested for ${pause.scopeType} pause ${pause.id}.`
    : isResume
      ? `${pause.scopeType} pause ${pause.id} resumed: ${pause.resumeReason || "Authorized incident resolution recorded."}`
      : `${pause.scopeType} pause ${pause.id} activated: ${pause.reason}`;
  const status = decision === "Review Required" ? "warning" : "pass";
  return {
    id: makeId("AUD"),
    timestamp,
    shield: "Agent Shield",
    agentId: pause.agentId || "MAGEN3-PLATFORM",
    agentName: agent?.name || "Platform Emergency Controls",
    action,
    amount: 0,
    target: pause.scopeValue || pause.scopeType,
    targetType: "Emergency Control",
    decision,
    risk: decision === "Review Required" ? "High" : "Low",
    reason,
    policyUsed: policy?.name || "Emergency Control",
    walletAddress: pause.ownerWalletAddress,
    agentOwnerWalletAddress: pause.ownerWalletAddress,
    executionWalletAddress: pause.createdByWallet || pause.ownerWalletAddress,
    txHash: "",
    executionStatus: decision === "Review Required" ? "review_required_not_submitted" : "not_required",
    executionTxHash: "",
    executionSignedBy: "",
    executionNote: isResumeRequest ? "The pause remains active until the configured resume quorum approves the exact bound resume request." : "Emergency-control state change does not execute an external Web3 transaction.",
    executionUpdatedAt: "",
    decisionProofStatus: "queued",
    decisionProofPayloadHash: "",
    decisionProofError: "",
    decisionProofMode: "",
    decisionProofUpdatedAt: "",
    originalIntent: {
      action,
      emergencyControl: {
        pauseId: pause.id,
        scopeType: pause.scopeType,
        scopeValue: pause.scopeValue,
        agentId: pause.agentId,
        policyId: pause.policyId,
        enforcementAction: pause.enforcementAction,
        triggerType: pause.triggerType,
        triggerRule: pause.triggerRule,
        reason: pause.reason,
        expiresAt: pause.expiresAt,
        resumeRequiresApproval: pause.resumeRequiresApproval,
        resumeQuorum: pause.resumeQuorum,
        resumeReason: pause.resumeReason || "",
      },
    },
    pipelineStages: [
      { id: "emergency-circuit-breaker", label: isResumeRequest ? "Emergency resume approval created" : isResume ? "Emergency pause resumed" : "Emergency pause activated", status: decision === "Review Required" ? "warning" : "completed", timestamp },
      ...(isResumeRequest ? [{ id: "human-approval", label: "Human approval pending", status: "pending", timestamp }] : []),
      { id: "audit-stored", label: "Audit stored", status: "completed", timestamp },
      { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
    ],
    moduleFindings: [{
      module: "Emergency Circuit Breaker",
      status,
      severity: decision === "Review Required" ? "high" : "info",
      rule: isResumeRequest ? "Resume approval required" : isResume ? "Authorized emergency resume" : pause.triggerRule,
      message: reason,
      evidence: {
        pauseId: pause.id,
        scopeType: pause.scopeType,
        scopeValue: pause.scopeValue,
        enforcementAction: pause.enforcementAction,
        triggerType: pause.triggerType,
        expiresAt: pause.expiresAt,
        approvalRequestId: approvalRequest?.id || "",
      },
      remediation: isResumeRequest ? "Authorized reviewers must resolve the exact-bound resume request. The pause remains active until quorum completes." : "No action required.",
    }],
    primaryReason: reason,
    triggeredRule: isResumeRequest ? "Resume approval required" : isResume ? "Authorized emergency resume" : pause.triggerRule,
    suggestedResolution: isResumeRequest ? "Complete the configured resume approval quorum." : "No action required.",
    capabilityContext: agent?.executionCapabilities || [],
    proofSubmittedAt: timestamp,
    proofConfirmedAt: "",
    approvalRequestId: approvalRequest?.id || "",
    approvalStatus: approvalRequest?.reviewStatus || (decision === "Review Required" ? "Pending" : "not_required"),
    approvalBindingHash: approvalRequest?.bindingHash || "",
    approvalRequiredCount: Number(approvalRequest?.requiredApprovals || 0),
    approvalReceivedCount: 0,
    approvalExpiresAt: approvalRequest?.expiresAt || "",
    approvalResolvedAt: "",
    riskScore: decision === "Review Required" ? 82 : 5,
  };
}

export function createEmergencyResumeApproval({ pause, policy = {}, agent = null, ownerWalletAddress, now = new Date() }) {
  const syntheticPolicy = {
    ...policy,
    id: policy?.id || pause.policyId || "EMERGENCY-CONTROL",
    name: policy?.name || "Emergency Resume Approval",
    structuredRules: {
      ...(policy?.structuredRules || {}),
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: pause.resumeQuorum > 1 ? "Quorum" : "Single",
      approvalRequiredCount: pause.resumeQuorum,
      approvalApproverWallets: pause.resumeAuthorityWallets,
      approvalAllowOwnerFallback: true,
      approvalSeparationOfDuties: false,
      approvalRequireRejectComment: true,
    },
  };
  const placeholderAudit = buildEmergencyAuditLog({ pause, agent, policy: syntheticPolicy, event: "resume-requested", decision: "Review Required", now });
  const approval = createApprovalRequest({ auditLog: placeholderAudit, policy: syntheticPolicy, ownerWalletAddress, now });
  if (!approval) return { approval: null, auditLog: placeholderAudit };
  const enriched = {
    ...approval,
    reviewContext: {
      ...(approval.reviewContext || {}),
      kind: "emergency-pause-resume",
      emergencyPauseId: pause.id,
      emergencyScopeType: pause.scopeType,
      emergencyScopeValue: pause.scopeValue,
      requestedResumeReason: pause.pendingResumeReason || "",
    },
  };
  const auditLog = buildEmergencyAuditLog({ pause, agent, policy: syntheticPolicy, event: "resume-requested", decision: "Review Required", now, approvalRequest: enriched });
  enriched.auditLogId = auditLog.id;
  enriched.bindingHash = createApprovalRequest({ auditLog, policy: syntheticPolicy, ownerWalletAddress, now })?.bindingHash || enriched.bindingHash;
  auditLog.approvalBindingHash = enriched.bindingHash;
  return { approval: enriched, auditLog };
}
