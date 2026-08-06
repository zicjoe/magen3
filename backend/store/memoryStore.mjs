import { shieldModules } from "../data/seed.mjs";
import { apiKeyPreview, hashSecret, makeApiKey, makeId, makePseudoHash, secretMatches } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { initialDecisionProofState, recordDecisionProof } from "../casper/decisionRelayer.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { runStatefulSimulation } from "../lib/statefulSimulation.mjs";
import { applyBridgeProviderEvidenceToRequest, pollBridgeProviderTransfer, prepareBridgeProviderIntegration, summarizeBridgeProviderIntegration } from "../lib/bridgeProviderIntegration.mjs";
import { inspectAssetContractRisk } from "../lib/assetContractRisk.mjs";
import { evaluateAssetIdentity } from "../lib/assetIdentity.mjs";
import { getThreatIntelligenceSnapshot } from "../lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot } from "../lib/oracleValidation.mjs";
import { getMarketRiskSignalsSnapshot } from "../lib/marketRiskSignals.mjs";
import { getComplianceControlsSnapshot } from "../lib/complianceControls.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";
import { mergeX402SettlementTransition, normalizeX402SettlementUpdate } from "../lib/x402PaymentControls.mjs";
import { buildReconciliationAuditPatch, reconciliationStatusSummary } from "../lib/executionReconciliation.mjs";
import { getExecutionReconciliationPollingStatus, pollExecutionTransaction } from "../lib/executionReconciliationPoller.mjs";
import { legacyTypeFromCapabilities, normalizeExecutionCapabilities, recommendedPolicyTemplate } from "../lib/securityModel.mjs";
import { approvalExecutionAuthorized, approvalOrganizationalFinding, approvalPublicSummary, approvalSignatureFinding, approvalVerifiedCount, createApprovalRequest, expireApproval, respondToApproval } from "../lib/approvalWorkflow.mjs";
import { approvalSignatureChallengePublicSummary, createApprovalSignatureChallenge, expireApprovalSignatureChallenge, verifyApprovalSignatureChallenge } from "../lib/approvalSignatures.mjs";
import { automaticPauseFinding, detectAutomaticEmergencyTrigger, evaluateEmergencyControls } from "../lib/emergencyControls.mjs";
import { buildEmergencyAuditLog, createEmergencyResumeApproval, normalizeEmergencyPauseInput, publicEmergencyPause } from "../lib/emergencyPauseWorkflow.mjs";
import { assertAgentDeletionAllowed } from "../lib/agentDeletion.mjs";

function normalizeWalletAddress(value) {
  return String(value || "").trim();
}

function requireWalletAddress(value) {
  const walletAddress = normalizeWalletAddress(value);
  if (!walletAddress) {
    const err = new Error("A real wallet address is required. Connect Casper Wallet first.");
    err.status = 400;
    throw err;
  }
  return walletAddress;
}

function initialExecutionStatus(decision) {
  if (decision === "Allowed") return "approved_pending_signature";
  if (decision === "Blocked") return "blocked_not_submitted";
  if (decision === "Review Required") return "review_required_not_submitted";
  return "not_submitted";
}

function normalizeAgentStatus(status) {
  return status === "Revoked" ? "Revoked" : "Active";
}

function updatePipelineStage(stages, id, status, timestamp = new Date().toISOString(), label = "") {
  const source = Array.isArray(stages) ? stages : [];
  const found = source.some((stage) => stage.id === id);
  const next = source.map((stage) => stage.id === id ? { ...stage, status, timestamp, ...(label ? { label } : {}) } : stage);
  return found ? next : [...next, { id, label: label || id, status, timestamp }];
}

function appendX402PipelineStages(stages, decision, timestamp = new Date().toISOString()) {
  const source = Array.isArray(stages) ? stages : [];
  const without = source.filter((stage) => !["x402-payment-authorized", "x402-settlement", "x402-resource-delivery"].includes(stage.id));
  const authorizedStatus = decision === "Allowed" ? "completed" : decision === "Blocked" ? "failed" : "warning";
  const postDecisionStatus = decision === "Allowed" ? "pending" : "skipped";
  return [
    ...without,
    { id: "x402-payment-authorized", label: decision === "Allowed" ? "x402 payment authorized" : `x402 payment ${decision.toLowerCase()}`, status: authorizedStatus, timestamp },
    { id: "x402-settlement", label: "x402 settlement", status: postDecisionStatus, timestamp: "" },
    { id: "x402-resource-delivery", label: "Paid resource delivery", status: postDecisionStatus, timestamp: "" },
  ];
}

export function createMemoryStore() {
  let agents = [];
  let policies = [];
  let auditLogs = [];
  let actionReviews = [];
  let gatewayRequests = [];
  let emergencyPauses = [];
  let approvalSignatureChallenges = [];

  function publicAgent(agent, extra = {}) {
    if (!agent) return agent;
    const { apiKeyHash, ...safeAgent } = agent;
    return { ...safeAgent, status: normalizeAgentStatus(safeAgent.status), ...extra };
  }

  function scopedAgents(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? agents.filter((agent) => agent.ownerWalletAddress === wallet).map((agent) => publicAgent(agent)) : [];
  }

  function scopedAgentRecords(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? agents.filter((agent) => agent.ownerWalletAddress === wallet) : [];
  }

  function findAgentRecord(agentId) {
    return agents.find((agent) => agent.id === agentId);
  }

  function scopedPolicies(walletAddress) {
    const agentIds = new Set(scopedAgentRecords(walletAddress).map((agent) => agent.id));
    return policies.filter((policy) => agentIds.has(policy.agentId));
  }

  function scopedAuditLogs(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress);
    return wallet ? auditLogs.filter((log) => log.walletAddress === wallet || log.agentOwnerWalletAddress === wallet) : [];
  }

  function refreshEmergencyPause(pause, now = new Date()) {
    const publicPause = publicEmergencyPause(pause, now);
    if (publicPause.status !== pause.status) {
      emergencyPauses = emergencyPauses.map((item) => item.id === pause.id ? { ...item, status: publicPause.status, updatedAt: now.toISOString() } : item);
      return emergencyPauses.find((item) => item.id === pause.id);
    }
    return pause;
  }

  function scopedEmergencyPauses(walletAddress, { activeOnly = false } = {}) {
    const wallet = normalizeWalletAddress(walletAddress).toLowerCase();
    const records = emergencyPauses
      .filter((pause) => normalizeWalletAddress(pause.ownerWalletAddress).toLowerCase() === wallet)
      .map((pause) => refreshEmergencyPause(pause));
    return records.filter((pause) => !activeOnly || pause.status === "Active").map((pause) => publicEmergencyPause(pause));
  }

  async function persistEmergencyAudit(auditLog) {
    Object.assign(auditLog, initialDecisionProofState(auditLog));
    auditLogs = [auditLog, ...auditLogs];
    const proof = await recordDecisionProof(auditLog);
    auditLogs = auditLogs.map((log) => log.id === auditLog.id ? {
      ...log,
      ...proof,
      proofConfirmedAt: proof.decisionProofStatus === "recorded" ? (proof.decisionProofUpdatedAt || new Date().toISOString()) : log.proofConfirmedAt,
      pipelineStages: updatePipelineStage(log.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
    } : log);
    return auditLogs.find((log) => log.id === auditLog.id) || auditLog;
  }

  function applyAutomaticPauseToResult(result, pause) {
    const pauseFinding = automaticPauseFinding(pause);
    const decision = pause.enforcementAction === "Review Required" ? "Review Required" : "Blocked";
    result.decision = decision;
    result.risk = decision === "Blocked" ? "Critical" : "High";
    result.riskScore = Math.max(Number(result.riskScore || 0), decision === "Blocked" ? 99 : 82);
    result.reason = decision === "Blocked"
      ? "The current finding activated the Emergency Circuit Breaker, so execution is blocked and the pause applies to future matching requests."
      : "The current finding activated the Emergency Circuit Breaker, so execution requires human review and the pause applies to future matching requests.";
    result.recommendedAction = "Do not bypass the circuit breaker. Investigate the trigger, resolve the incident, and use the authorized resume workflow.";
    result.primaryReason = pauseFinding.message;
    result.triggeredRule = pauseFinding.rule;
    result.suggestedResolution = pauseFinding.remediation;
    result.moduleFindings = [...(result.moduleFindings || []), pauseFinding];
    result.modulesEvaluated = [...new Set([...(result.modulesEvaluated || []), "Emergency Circuit Breaker"])];
    result.policyChecksFailed = [...(result.policyChecksFailed || []), pauseFinding.message];
    result.pipelineStages = updatePipelineStage(result.pipelineStages, "emergency-circuit-breaker", decision === "Blocked" ? "failed" : "warning", new Date().toISOString(), "Automatic emergency pause activated");
    result.emergencyControlsContext = {
      active: true,
      automaticPauseActivated: true,
      effectiveDecision: decision,
      pause: publicEmergencyPause(pause),
    };
    return result;
  }

  function syncAuditApproval(review) {
    if (!review?.auditLogId) return;
    const approvalsReceived = approvalVerifiedCount(review);
    const signatureFinding = approvalSignatureFinding(review);
    const organizationalFinding = approvalOrganizationalFinding(review);
    const emergencyResume = review.reviewContext?.kind === "emergency-pause-resume";
    auditLogs = auditLogs.map((log) => log.id === review.auditLogId ? {
      ...log,
      approvalRequestId: review.id,
      approvalStatus: review.reviewStatus,
      approvalBindingHash: review.bindingHash,
      approvalRequiredCount: Number(review.requiredApprovals || 1),
      approvalReceivedCount: approvalsReceived,
      approvalExpiresAt: review.expiresAt || "",
      approvalResolvedAt: review.resolvedAt || "",
      moduleFindings: [
        ...(log.moduleFindings || []).filter((finding) => !["Cryptographic reviewer signature", "Organizational approval quorum"].includes(finding?.rule)),
        ...(signatureFinding ? [signatureFinding] : []),
        ...(organizationalFinding ? [organizationalFinding] : []),
      ],
      executionStatus: emergencyResume
        ? "not_required"
        : review.reviewStatus === "Approved" ? "review_approved_pending_signature" : review.reviewStatus === "Rejected" ? "review_rejected_not_submitted" : review.reviewStatus === "Expired" ? "review_expired_not_submitted" : log.executionStatus,
      executionNote: emergencyResume
        ? review.reviewStatus === "Approved" ? "Emergency resume quorum completed and the bound pause was resumed." : review.reviewStatus === "Rejected" ? `Emergency resume rejected${review.rejectionReason ? `: ${review.rejectionReason}` : "."}` : review.reviewStatus === "Expired" ? "Emergency resume approval expired. The pause remains active." : "Emergency resume approval remains pending; the pause stays active."
        : review.reviewStatus === "Approved" ? "Human approval quorum completed. The exact bound intent may proceed to wallet signing before approval expiry." : review.reviewStatus === "Rejected" ? `Human approval rejected${review.rejectionReason ? `: ${review.rejectionReason}` : "."}` : review.reviewStatus === "Expired" ? "Human approval expired before execution." : log.executionNote,
      pipelineStages: updatePipelineStage(log.pipelineStages, "human-approval", review.reviewStatus === "Approved" ? "completed" : ["Rejected", "Expired"].includes(review.reviewStatus) ? "failed" : "pending", review.updatedAt || new Date().toISOString(), emergencyResume ? (review.reviewStatus === "Approved" ? "Emergency resume quorum completed" : review.reviewStatus === "Rejected" ? "Emergency resume rejected" : review.reviewStatus === "Expired" ? "Emergency resume approval expired" : "Emergency resume approval pending") : (review.reviewStatus === "Approved" ? "Human approval quorum completed" : review.reviewStatus === "Rejected" ? "Human approval rejected" : review.reviewStatus === "Expired" ? "Human approval expired" : "Human approval pending")),
    } : log);
  }

  function refreshApproval(review) {
    const refreshed = expireApproval(review);
    if (refreshed !== review) {
      actionReviews = actionReviews.map((item) => item.id === review.id ? refreshed : item);
      syncAuditApproval(refreshed);
    }
    return refreshed;
  }

  function scopedApprovals(walletAddress) {
    const wallet = normalizeWalletAddress(walletAddress).toLowerCase();
    return actionReviews
      .map(refreshApproval)
      .filter((review) => review.walletAddress?.toLowerCase() === wallet || (review.approverWallets || []).some((approver) => approver.toLowerCase() === wallet))
      .map((review) => approvalPublicSummary(review));
  }

  function requireGatewayAgent(agentId, apiKey) {
    const agentRecord = findAgentRecord(agentId);
    if (!agentRecord) {
      const err = new Error("Connected agent not found for this Agent ID.");
      err.status = 404;
      throw err;
    }
    if (agentRecord.status === "Revoked") {
      const err = new Error("Agent Gateway request rejected because this connected agent has been revoked.");
      err.status = 403;
      throw err;
    }
    if (!secretMatches(apiKey, agentRecord.apiKeyHash)) {
      const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
      err.status = 401;
      throw err;
    }
    return agentRecord;
  }

  function dashboardStats(walletAddress) {
    const logs = scopedAuditLogs(walletAddress);
    const walletPolicies = scopedPolicies(walletAddress);
    return {
      activeShields: walletPolicies.some((policy) => policy.status === "Active") ? 1 : 0,
      protectedActions: logs.length,
      blockedActions: logs.filter((log) => log.decision === "Blocked").length,
      reviewRequired: logs.filter((log) => log.decision === "Review Required").length,
      casperAuditRecords: logs.filter((log) => isRealDeployHash(log.txHash)).length,
      activeEmergencyPauses: scopedEmergencyPauses(walletAddress, { activeOnly: true }).length,
    };
  }

  return {
    mode: "memory",

    async bootstrap(walletAddress) {
      return {
        agents: scopedAgents(walletAddress),
        policies: scopedPolicies(walletAddress),
        auditLogs: scopedAuditLogs(walletAddress),
        approvals: scopedApprovals(walletAddress),
        emergencyPauses: scopedEmergencyPauses(walletAddress),
        shieldModules,
        dashboardStats: dashboardStats(walletAddress),
      };
    },

    async connectWallet() {
      return { network: "casper-testnet", connected: true };
    },

    async createAgent(body) {
      if (!body.name || !String(body.name).trim()) {
        const err = new Error("Agent name is required");
        err.status = 400;
        throw err;
      }
      const ownerWalletAddress = requireWalletAddress(body.ownerWalletAddress || body.walletAddress);
      const apiKey = makeApiKey();
      const now = new Date().toISOString();
      const executionCapabilities = normalizeExecutionCapabilities(body.executionCapabilities, body.type);

      const agent = {
        id: makeId("MAG-AGENT"),
        name: String(body.name).trim(),
        type: body.type || legacyTypeFromCapabilities(executionCapabilities),
        purpose: body.purpose || "",
        permissionLevel: body.permissionLevel || "Limited Execution",
        status: "Active",
        ownerWalletAddress,
        apiKeyHash: hashSecret(apiKey),
        apiKeyPreview: apiKeyPreview(apiKey),
        apiKeyIssuedAt: now,
        apiKeyRotatedAt: "",
        revokedAt: "",
        executionCapabilities,
        capabilityConfiguration: body.capabilityConfiguration && typeof body.capabilityConfiguration === "object" ? body.capabilityConfiguration : {},
        onboardingStatus: body.onboardingStatus || "complete",
        lastIntentAt: "",
        lastDecisionAt: "",
        createdAt: now,
      };
      agents = [agent, ...agents];
      return publicAgent(agent, { apiKey });
    },

    async rotateAgentApiKey(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const agent = agents.find((item) => item.id === id && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }
      const apiKey = makeApiKey();
      const now = new Date().toISOString();
      agents = agents.map((item) => item.id === id ? {
        ...item,
        apiKeyHash: hashSecret(apiKey),
        apiKeyPreview: apiKeyPreview(apiKey),
        apiKeyIssuedAt: item.apiKeyIssuedAt || now,
        apiKeyRotatedAt: now,
      } : item);
      return publicAgent(agents.find((item) => item.id === id), { apiKey });
    },

    async revokeAgent(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const agent = agents.find((item) => item.id === id && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }
      const now = new Date().toISOString();
      agents = agents.map((item) => item.id === id ? { ...item, status: "Revoked", revokedAt: now } : item);
      return publicAgent(agents.find((item) => item.id === id));
    },

    async deleteAgent(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const agent = agents.find((item) => item.id === id && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }
      const confirmation = String(body?.confirmation || body?.confirmationText || "").trim();
      if (confirmation !== agent.name) {
        const err = new Error(`Type the exact agent name “${agent.name}” to confirm permanent deletion.`);
        err.status = 400;
        throw err;
      }

      const agentPolicies = policies.filter((policy) => policy.agentId === id);
      const agentApprovals = actionReviews.filter((review) => review.agentId === id);
      const agentLogs = auditLogs.filter((log) => log.agentId === id);
      const agentPauses = emergencyPauses.filter((pause) => pause.agentId === id);
      const agentRequests = gatewayRequests.filter((request) => request.agentId === id);
      const readiness = assertAgentDeletionAllowed({
        agent: publicAgent(agent),
        policies: agentPolicies,
        approvals: agentApprovals,
        auditLogs: agentLogs,
        emergencyPauses: agentPauses,
      });

      policies = policies.filter((policy) => policy.agentId !== id);
      agents = agents.filter((item) => item.id !== id);

      return {
        ok: true,
        deletedAgent: { id: agent.id, name: agent.name },
        deletedPolicyIds: readiness.policyIds,
        preservedEvidence: {
          ...readiness.preservedEvidence,
          gatewayRequests: agentRequests.length,
        },
      };
    },

    async getAgentGatewayIdentity(agentId, context = {}) {
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const ownerWalletAddress = agentRecord.ownerWalletAddress;
      const activePolicy = scopedPolicies(ownerWalletAddress).find((item) => item.agentId === agentRecord.id && item.status === "Active") || null;
      return {
        ok: true,
        agent: publicAgent(agentRecord),
        activePolicy,
        emergencyPauses: scopedEmergencyPauses(ownerWalletAddress, { activeOnly: true }).filter((pause) => !pause.agentId || pause.agentId === agentRecord.id),
        gatewayReady: Boolean(activePolicy),
        endpoint: "/api/agent-gateway/intents",
        ...(!activePolicy ? { reason: "No active policy assigned to this agent." } : {}),
      };
    },

    async createPolicy(body) {
      if (!body.name || !body.agentId) {
        const err = new Error("Policy name and agentId are required");
        err.status = 400;
        throw err;
      }
      const walletAddress = requireWalletAddress(body.walletAddress);
      const agent = agents.find((item) => item.id === body.agentId && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Cannot create policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const policy = {
        id: makeId("POL"),
        name: String(body.name).trim(),
        agentId: body.agentId,
        maxTransaction: Number(body.maxTransaction || 50),
        dailyLimit: Number(body.dailyLimit || 200),
        approvalThreshold: Number(body.approvalThreshold || 100),
        trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : [],
        blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : [],
        riskMode: body.riskMode || "Balanced",
        status: "Active",
        ownerWalletAddress: walletAddress,
        templateType: body.templateType || recommendedPolicyTemplate(agent.executionCapabilities),
        capabilityScope: normalizeExecutionCapabilities(body.capabilityScope || agent.executionCapabilities, agent.type),
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : {},
        createdAt: new Date().toISOString(),
        policyHash: makePseudoHash("0xpol"),
      };
      policies = [policy, ...policies];

      const policyAuditTimestamp = new Date().toISOString();
      const auditLog = {
        id: makeId("AUD"),
        timestamp: policyAuditTimestamp,
        shield: "Agent Shield",
        agentId: policy.agentId,
        agentName: agent.name,
        action: "Policy Activation",
        amount: 0,
        target: "Magen3 Policy Registry",
        targetType: "Trusted Contract",
        decision: "Allowed",
        risk: "Low",
        reason: `Policy "${policy.name}" activated for ${agent.name}.`,
        policyUsed: policy.name,
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress: walletAddress,
        txHash: "",
        executionStatus: "not_required",
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: "Policy activation does not execute an external Web3 transaction.",
        executionUpdatedAt: "",
        decisionProofStatus: "queued",
        decisionProofPayloadHash: "",
        decisionProofError: "",
        decisionProofMode: "",
        decisionProofUpdatedAt: "",
        originalIntent: { action: "Policy Activation", policyId: policy.id },
        pipelineStages: [
          { id: "policy-loaded", label: "Policy created and activated", status: "completed", timestamp: policyAuditTimestamp },
          { id: "audit-stored", label: "Audit stored", status: "completed", timestamp: policyAuditTimestamp },
          { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
        ],
        moduleFindings: [{ module: "Policy Enforcement", status: "pass", severity: "info", rule: "Active policy", message: `Policy ${policy.name} activated.`, evidence: { policyId: policy.id }, remediation: "" }],
        primaryReason: `Policy ${policy.name} activated.`,
        triggeredRule: "Active policy",
        suggestedResolution: "No action required.",
        capabilityContext: agent.executionCapabilities,
        proofSubmittedAt: policyAuditTimestamp,
        proofConfirmedAt: "",
        riskScore: 4,
      };
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      auditLogs = [auditLog, ...auditLogs];
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === auditLog.id ? {
        ...log,
        ...proof,
        proofConfirmedAt: proof.decisionProofStatus === "recorded" ? (proof.decisionProofUpdatedAt || new Date().toISOString()) : log.proofConfirmedAt,
        pipelineStages: updatePipelineStage(log.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
      } : log);
      return { policy, auditLog: auditLogs.find((log) => log.id === auditLog.id) || auditLog, agents: scopedAgents(walletAddress) };
    },

    async updatePolicy(id, body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const current = policies.find((policy) => policy.id === id && policy.ownerWalletAddress === walletAddress);
      if (!current) {
        const err = new Error("Policy not found for the connected wallet.");
        err.status = 404;
        throw err;
      }
      const agent = agents.find((item) => item.id === current.agentId && item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Cannot update policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const updatedPolicy = {
        ...current,
        name: body.name ? String(body.name).trim() : current.name,
        maxTransaction: Number(body.maxTransaction ?? current.maxTransaction),
        dailyLimit: Number(body.dailyLimit ?? current.dailyLimit),
        approvalThreshold: Number(body.approvalThreshold ?? current.approvalThreshold),
        trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : current.trustedContracts,
        blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : current.blockedActions,
        riskMode: body.riskMode || current.riskMode,
        status: body.status || current.status,
        templateType: body.templateType || current.templateType || "Custom",
        capabilityScope: Array.isArray(body.capabilityScope) ? normalizeExecutionCapabilities(body.capabilityScope) : current.capabilityScope,
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : current.structuredRules,
      };

      policies = policies.map((policy) => policy.id === id ? updatedPolicy : policy);
      return { policy: updatedPolicy, agents: scopedAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const [threatIntelligence, oracleValidation, marketRiskSignals, complianceControls] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
        getMarketRiskSignalsSnapshot(),
        getComplianceControlsSnapshot(),
      ]);
      const result = evaluatePolicy({
        request: {
          ...body,
          walletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          executionWalletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          agentOwnerWalletAddress: walletAddress,
        },
        agents: scopedAgents(walletAddress),
        policies: scopedPolicies(walletAddress),
        auditLogs: scopedAuditLogs(walletAddress),
        emergencyPauses: scopedEmergencyPauses(walletAddress, { activeOnly: true }),
        threatIntelligence,
        oracleValidation,
        marketRiskSignals,
        complianceControls,
      });
      const review = {
        id: makeId("REV"),
        agentId: body.agentId,
        actionType: body.actionType || body.action || "Contract Interaction",
        amount: Number(body.amount || 0),
        target: body.target || "No target provided",
        targetType: body.targetType || "Unknown Contract",
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        reason: result.reason,
        checksPassed: result.policyChecksPassed || [],
        checksFailed: result.policyChecksFailed || [],
        createdAt: new Date().toISOString(),
      };
      actionReviews.unshift(review);
      return { result, review };
    },

    async createAuditLog(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const agentOwnerWalletAddress = normalizeWalletAddress(body.agentOwnerWalletAddress || walletAddress);
      const executionWalletAddress = normalizeWalletAddress(body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || walletAddress);
      const auditLog = {
        id: body.id || makeId("AUD"),
        timestamp: body.timestamp || new Date().toISOString(),
        shield: body.shield || "Agent Shield",
        agentId: body.agentId || "unknown-agent",
        agentName: body.agentName || body.agentId || "Unknown Agent",
        action: body.action || "Contract Interaction",
        amount: Number(body.amount || 0),
        target: body.target || "No target provided",
        targetType: body.targetType || "Unknown Contract",
        decision: body.decision || "Review Required",
        risk: body.risk || "Medium",
        reason: body.reason || "Magen3 recorded a decision.",
        policyUsed: body.policyUsed || "No active policy",
        walletAddress,
        agentOwnerWalletAddress,
        executionWalletAddress,
        txHash: body.txHash || "",
        executionStatus: body.executionStatus || initialExecutionStatus(body.decision),
        executionTxHash: body.executionTxHash || "",
        executionSignedBy: body.executionSignedBy || "",
        executionNote: body.executionNote || "",
        executionUpdatedAt: body.executionUpdatedAt || "",
        decisionProofStatus: body.decisionProofStatus || "queued",
        decisionProofPayloadHash: body.decisionProofPayloadHash || "",
        decisionProofError: body.decisionProofError || "",
        decisionProofMode: body.decisionProofMode || "",
        decisionProofUpdatedAt: body.decisionProofUpdatedAt || "",
        originalIntent: body.originalIntent && typeof body.originalIntent === "object" ? body.originalIntent : {},
        pipelineStages: Array.isArray(body.pipelineStages) ? body.pipelineStages : [],
        moduleFindings: Array.isArray(body.moduleFindings) ? body.moduleFindings : [],
        primaryReason: body.primaryReason || body.reason || "Magen3 recorded a decision.",
        triggeredRule: body.triggeredRule || "",
        suggestedResolution: body.suggestedResolution || "",
        capabilityContext: Array.isArray(body.capabilityContext) ? body.capabilityContext : [],
        proofSubmittedAt: body.proofSubmittedAt || "",
        proofConfirmedAt: body.proofConfirmedAt || "",
        riskScore: Number(body.riskScore || 50),
      };
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      const proof = await recordDecisionProof(auditLog);
      Object.assign(auditLog, proof);
      auditLogs = [auditLog, ...auditLogs];
      return auditLog;
    },

    async submitAgentGatewayIntent(body, context = {}) {
      const intent = normalizeAgentGatewayIntent(body);
      const agentRecord = requireGatewayAgent(intent.agentId, context.apiKey);
      const walletAddress = requireWalletAddress(agentRecord.ownerWalletAddress);
      const executionWalletAddress = normalizeWalletAddress(intent.executionWalletAddress);
      let request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        asset: intent.asset,
        outputAsset: intent.outputAsset,
        oracleBaseAsset: intent.oracleBaseAsset,
        oracleQuoteAsset: intent.oracleQuoteAsset,
        executionPrice: intent.executionPrice,
        quoteTimestamp: intent.quoteTimestamp,
        target: intent.target,
        targetType: intent.targetType,
        contractIdentifierType: intent.contractIdentifierType,
        entryPoint: intent.entryPoint,
        contractVersion: intent.contractVersion,
        chainName: intent.chainName,
        paymentAmountMotes: intent.paymentAmountMotes,
        gasPriceTolerance: intent.gasPriceTolerance,
        ttl: intent.ttl,
        transactionTimestamp: intent.transactionTimestamp,
        slippageBps: intent.slippageBps,
        expectedOutput: intent.expectedOutput,
        minimumReceived: intent.minimumReceived,
        executionQuoteProvider: intent.executionQuoteProvider,
        executionQuoteId: intent.executionQuoteId,
        executionQuoteTimestamp: intent.executionQuoteTimestamp,
        executionQuoteExpiresAt: intent.executionQuoteExpiresAt,
        executionDeadline: intent.executionDeadline,
        priceImpactBps: intent.priceImpactBps,
        simulatedOutput: intent.simulatedOutput,
        executionChannel: intent.executionChannel,
        privateExecutionAvailable: intent.privateExecutionAvailable,
        tradingRouteQuoteProvider: intent.tradingRouteQuoteProvider,
        tradingRouteQuoteId: intent.tradingRouteQuoteId,
        tradingRouteRouter: intent.tradingRouteRouter,
        tradingRouteAggregator: intent.tradingRouteAggregator,
        tradingRouteProtocol: intent.tradingRouteProtocol,
        tradingRoutePoolSequence: intent.tradingRoutePoolSequence,
        tradingRouteTokenPath: intent.tradingRouteTokenPath,
        tradingRouteInputAsset: intent.tradingRouteInputAsset,
        tradingRouteOutputAsset: intent.tradingRouteOutputAsset,
        tradingRouteInputAmount: intent.tradingRouteInputAmount,
        tradingRouteExpectedOutput: intent.tradingRouteExpectedOutput,
        tradingRouteMinimumOutput: intent.tradingRouteMinimumOutput,
        tradingRouteExecutionMode: intent.tradingRouteExecutionMode,
        tradingRouteFeeBps: intent.tradingRouteFeeBps,
        tradingRouteFeeAmount: intent.tradingRouteFeeAmount,
        tradingRouteFeeRecipients: intent.tradingRouteFeeRecipients,
        tradingRouteIntermediaryContracts: intent.tradingRouteIntermediaryContracts,
        tradingRouteCalldata: intent.tradingRouteCalldata,
        tradingRouteCalldataHash: intent.tradingRouteCalldataHash,
        tradingRoutePayloadHash: intent.tradingRoutePayloadHash,
        tradingRouteAuthorizedRouteHash: intent.tradingRouteAuthorizedRouteHash,
        tradingRouteExpiresAt: intent.tradingRouteExpiresAt,
        marketRiskMetadataSupplied: intent.marketRiskMetadataSupplied,
        marketRiskBaseAsset: intent.marketRiskBaseAsset,
        marketRiskQuoteAsset: intent.marketRiskQuoteAsset,
        marketRiskBaseCanonicalId: intent.marketRiskBaseCanonicalId,
        marketRiskQuoteCanonicalId: intent.marketRiskQuoteCanonicalId,
        marketRiskChainFamily: intent.marketRiskChainFamily,
        marketRiskNetwork: intent.marketRiskNetwork,
        marketRiskVenue: intent.marketRiskVenue,
        marketRiskPoolId: intent.marketRiskPoolId,
        runtimeArgs: intent.runtimeArgs,
        transactionHash: intent.transactionHash,
        bridgeSourceChain: intent.bridgeSourceChain,
        bridgeDestinationChain: intent.bridgeDestinationChain,
        bridgeProvider: intent.bridgeProvider,
        bridgeRouteId: intent.bridgeRouteId,
        bridgeDestinationAddress: intent.bridgeDestinationAddress,
        bridgeAsset: intent.bridgeAsset,
        bridgeFeeAmount: intent.bridgeFeeAmount,
        bridgeFeeBps: intent.bridgeFeeBps,
        bridgeExpectedOutput: intent.bridgeExpectedOutput,
        bridgeMinimumReceived: intent.bridgeMinimumReceived,
        bridgeQuoteTimestamp: intent.bridgeQuoteTimestamp,
        bridgeQuoteExpiresAt: intent.bridgeQuoteExpiresAt,
        bridgeSourceConfirmations: intent.bridgeSourceConfirmations,
        bridgeDestinationConfirmations: intent.bridgeDestinationConfirmations,
        bridgeProviderId: intent.bridgeProviderId,
        bridgeOriginChainId: intent.bridgeOriginChainId,
        bridgeSourceChainId: intent.bridgeSourceChainId || intent.bridgeOriginChainId,
        bridgeDestinationChainId: intent.bridgeDestinationChainId,
        bridgeDepositor: intent.bridgeDepositor,
        bridgeRecipient: intent.bridgeRecipient,
        bridgeTradeType: intent.bridgeTradeType,
        bridgeSlippage: intent.bridgeSlippage,
        bridgeInputToken: intent.bridgeInputToken,
        bridgeOutputToken: intent.bridgeOutputToken,
        bridgeAmountAtomic: intent.bridgeAmountAtomic,
        bridgeExpectedOutputAtomic: intent.bridgeExpectedOutputAtomic,
        bridgeMinimumReceivedAtomic: intent.bridgeMinimumReceivedAtomic,
        bridgeProviderQuoteId: intent.bridgeProviderQuoteId,
        bridgeProviderQuoteHash: intent.bridgeProviderQuoteHash,
        bridgeProviderRouteHash: intent.bridgeProviderRouteHash,
        bridgeProviderPayloadHash: intent.bridgeProviderPayloadHash,
        bridgeProviderEvidence: intent.bridgeProviderEvidence,
        bridgeProviderAttestation: intent.bridgeProviderAttestation,
        bridgeSourceTransactionTo: intent.bridgeSourceTransactionTo,
        bridgeSourceTransactionData: intent.bridgeSourceTransactionData,
        bridgeSourceTransactionDataHash: intent.bridgeSourceTransactionDataHash,
        bridgeSourceTransactionValue: intent.bridgeSourceTransactionValue,
        bridgeSourceTransactionGas: intent.bridgeSourceTransactionGas,
        bridgeApprovalTransactions: intent.bridgeApprovalTransactions,
        complianceOriginatorJurisdiction: intent.complianceOriginatorJurisdiction,
        complianceBeneficiaryJurisdiction: intent.complianceBeneficiaryJurisdiction,
        complianceCounterpartyType: intent.complianceCounterpartyType,
        complianceOriginatorAttestationStatus: intent.complianceOriginatorAttestationStatus,
        complianceOriginatorAttestationProvider: intent.complianceOriginatorAttestationProvider,
        complianceOriginatorAttestationReference: intent.complianceOriginatorAttestationReference,
        complianceOriginatorAttestationIssuedAt: intent.complianceOriginatorAttestationIssuedAt,
        complianceOriginatorAttestationExpiresAt: intent.complianceOriginatorAttestationExpiresAt,
        complianceBeneficiaryAttestationStatus: intent.complianceBeneficiaryAttestationStatus,
        complianceBeneficiaryAttestationProvider: intent.complianceBeneficiaryAttestationProvider,
        complianceBeneficiaryAttestationReference: intent.complianceBeneficiaryAttestationReference,
        complianceBeneficiaryAttestationIssuedAt: intent.complianceBeneficiaryAttestationIssuedAt,
        complianceBeneficiaryAttestationExpiresAt: intent.complianceBeneficiaryAttestationExpiresAt,
        complianceTravelRuleStatus: intent.complianceTravelRuleStatus,
        complianceTravelRuleReference: intent.complianceTravelRuleReference,
        complianceTravelRuleDataHash: intent.complianceTravelRuleDataHash,
        complianceScreeningStatus: intent.complianceScreeningStatus,
        complianceScreeningProvider: intent.complianceScreeningProvider,
        complianceScreeningReference: intent.complianceScreeningReference,
        complianceScreenedAt: intent.complianceScreenedAt,
        complianceRiskRating: intent.complianceRiskRating,
        complianceOriginatorVaspId: intent.complianceOriginatorVaspId,
        complianceBeneficiaryVaspId: intent.complianceBeneficiaryVaspId,
        x402Version: intent.x402Version,
        x402Scheme: intent.x402Scheme,
        x402ResourceUrl: intent.x402ResourceUrl,
        x402HttpMethod: intent.x402HttpMethod,
        x402MerchantDomain: intent.x402MerchantDomain,
        x402PayTo: intent.x402PayTo,
        x402Asset: intent.x402Asset,
        x402Network: intent.x402Network,
        x402Facilitator: intent.x402Facilitator,
        x402AmountAtomic: intent.x402AmountAtomic,
        x402ValidUntil: intent.x402ValidUntil,
        x402MaxTimeoutSeconds: intent.x402MaxTimeoutSeconds,
        x402RequirementsReceivedAt: intent.x402RequirementsReceivedAt,
        x402RequestId: intent.x402RequestId,
        x402RequestBodyHash: intent.x402RequestBodyHash,
        x402PaymentRequiredHash: intent.x402PaymentRequiredHash,
        x402RequestFingerprint: intent.x402RequestFingerprint,
        x402SettlementStatus: intent.x402SettlementStatus,
        x402SettlementAttempt: intent.x402SettlementAttempt,
        x402SettlementTxHash: intent.x402SettlementTxHash,
        tokenPermissionMetadataSupplied: intent.tokenPermissionMetadataSupplied,
        tokenPermissionType: intent.tokenPermissionType,
        tokenPermissionOwner: intent.tokenPermissionOwner,
        tokenPermissionTokenContract: intent.tokenPermissionTokenContract,
        tokenPermissionTokenStandard: intent.tokenPermissionTokenStandard,
        tokenPermissionSpender: intent.tokenPermissionSpender,
        tokenPermissionApprovalAmount: intent.tokenPermissionApprovalAmount,
        tokenPermissionIntendedTransactionAmount: intent.tokenPermissionIntendedTransactionAmount,
        tokenPermissionUnlimited: intent.tokenPermissionUnlimited,
        tokenPermissionNonce: intent.tokenPermissionNonce,
        tokenPermissionPermitId: intent.tokenPermissionPermitId,
        tokenPermissionDeadline: intent.tokenPermissionDeadline,
        tokenPermissionReusable: intent.tokenPermissionReusable,
        tokenPermissionChainId: intent.tokenPermissionChainId,
        tokenPermissionNetwork: intent.tokenPermissionNetwork,
        tokenPermissionApprovedProtocol: intent.tokenPermissionApprovedProtocol,
        tokenPermissionOperatorForAll: intent.tokenPermissionOperatorForAll,
        tokenPermissionBatchItems: intent.tokenPermissionBatchItems,
        tokenPermissionAllowanceResetExpected: intent.tokenPermissionAllowanceResetExpected,
        privilegedActionMetadataSupplied: intent.privilegedActionMetadataSupplied,
        privilegedActionClassifiedAction: intent.privilegedActionClassifiedAction,
        privilegedActionContract: intent.privilegedActionContract,
        privilegedActionPackage: intent.privilegedActionPackage,
        privilegedActionEntryPoint: intent.privilegedActionEntryPoint,
        privilegedActionMethodSignature: intent.privilegedActionMethodSignature,
        privilegedActionCurrentValue: intent.privilegedActionCurrentValue,
        privilegedActionRequestedValue: intent.privilegedActionRequestedValue,
        privilegedActionRole: intent.privilegedActionRole,
        privilegedActionRecipient: intent.privilegedActionRecipient,
        privilegedActionImplementation: intent.privilegedActionImplementation,
        privilegedActionClassifierSource: intent.privilegedActionClassifierSource,
        privilegedActionClassifierVersion: intent.privilegedActionClassifierVersion,
        privilegedActionNetwork: intent.privilegedActionNetwork,
        instructionIntegrityMetadataSupplied: intent.instructionIntegrityMetadataSupplied,
        instructionGoalId: intent.instructionGoalId,
        instructionOriginalUserGoalHash: intent.instructionOriginalUserGoalHash,
        instructionInitiatedBy: intent.instructionInitiatedBy,
        instructionIntentSource: intent.instructionIntentSource,
        instructionToolName: intent.instructionToolName,
        instructionToolServer: intent.instructionToolServer,
        instructionSourceDomains: intent.instructionSourceDomains,
        instructionExternalContentUsed: intent.instructionExternalContentUsed,
        instructionUserConfirmed: intent.instructionUserConfirmed,
        instructionSourceTrustLevel: intent.instructionSourceTrustLevel,
        instructionParameterChangeReason: intent.instructionParameterChangeReason,
        instructionOriginalParameterHash: intent.instructionOriginalParameterHash,
        instructionCurrentParameterHash: intent.instructionCurrentParameterHash,
        instructionOriginalProtectedParameters: intent.instructionOriginalProtectedParameters,
        instructionOriginalPermissionScopes: intent.instructionOriginalPermissionScopes,
        instructionCurrentPermissionScopes: intent.instructionCurrentPermissionScopes,
        toolIntegrityMetadataSupplied: intent.toolIntegrityMetadataSupplied,
        toolMcpServerId: intent.toolMcpServerId,
        toolMcpServerUrl: intent.toolMcpServerUrl,
        toolIntegrityToolName: intent.toolIntegrityToolName,
        toolIntegrityToolVersion: intent.toolIntegrityToolVersion,
        toolIntegrityManifestHash: intent.toolIntegrityManifestHash,
        toolIntegritySchemaHash: intent.toolIntegritySchemaHash,
        toolIntegrityDescriptionHash: intent.toolIntegrityDescriptionHash,
        toolIntegrityPermissionScopes: intent.toolIntegrityPermissionScopes,
        toolIntegrityCredentialScope: intent.toolIntegrityCredentialScope,
        toolIntegrityTls: intent.toolIntegrityTls,
        toolIntegrityOrigin: intent.toolIntegrityOrigin,
        toolIntegrityApprovedAt: intent.toolIntegrityApprovedAt,
        delegationMetadataSupplied: intent.delegationMetadataSupplied,
        delegationId: intent.delegationId,
        delegationDelegatingWallet: intent.delegationDelegatingWallet,
        delegationDelegate: intent.delegationDelegate,
        delegationSessionKey: intent.delegationSessionKey,
        delegationAllowedNetworks: intent.delegationAllowedNetworks,
        delegationAllowedContracts: intent.delegationAllowedContracts,
        delegationAllowedMethods: intent.delegationAllowedMethods,
        delegationAllowedAssets: intent.delegationAllowedAssets,
        delegationNativeAmountLimit: intent.delegationNativeAmountLimit,
        delegationTokenAmountLimits: intent.delegationTokenAmountLimits,
        delegationMaxTransactionAmount: intent.delegationMaxTransactionAmount,
        delegationMaxFrequency: intent.delegationMaxFrequency,
        delegationValidFrom: intent.delegationValidFrom,
        delegationExpiresAt: intent.delegationExpiresAt,
        delegationRevocationStatus: intent.delegationRevocationStatus,
        delegationDepth: intent.delegationDepth,
        delegationRedelegationAllowed: intent.delegationRedelegationAllowed,
        delegationNonce: intent.delegationNonce,
        delegationAttestationHash: intent.delegationAttestationHash,
        delegationAttestationSignature: intent.delegationAttestationSignature,
        delegationChainName: intent.delegationChainName,
        rpcIntegrityMetadataSupplied: intent.rpcIntegrityMetadataSupplied,
        rpcExpectedChainName: intent.rpcExpectedChainName,
        rpcExpectedNetworkIdentifier: intent.rpcExpectedNetworkIdentifier,
        rpcExpectedGenesisHash: intent.rpcExpectedGenesisHash,
        rpcSelectedEndpoint: intent.rpcSelectedEndpoint,
        rpcSelectedProviderId: intent.rpcSelectedProviderId,
        rpcProviderObservations: intent.rpcProviderObservations,
        rpcAutomaticFailoverUsed: intent.rpcAutomaticFailoverUsed,
        rpcFailoverFrom: intent.rpcFailoverFrom,
        rpcFailoverReason: intent.rpcFailoverReason,
        feeSafetyMetadataSupplied: intent.feeSafetyMetadataSupplied,
        feeChainFamily: intent.feeChainFamily,
        feeChainName: intent.feeChainName,
        feeEstimatedGas: intent.feeEstimatedGas,
        feeGasLimit: intent.feeGasLimit,
        feeGasPrice: intent.feeGasPrice,
        feePriorityFee: intent.feePriorityFee,
        feeMaximumFee: intent.feeMaximumFee,
        feeNetworkFee: intent.feeNetworkFee,
        feeUnit: intent.feeUnit,
        feeSponsor: intent.feeSponsor,
        feePaymaster: intent.feePaymaster,
        feeSponsorshipId: intent.feeSponsorshipId,
        feeSponsorshipExpiry: intent.feeSponsorshipExpiry,
        feeSponsorshipScopes: intent.feeSponsorshipScopes,
        feeSponsorSignatureHash: intent.feeSponsorSignatureHash,
        feeExpectedPayer: intent.feeExpectedPayer,
        feeActualPayer: intent.feeActualPayer,
        feeSponsored: intent.feeSponsored,
        feeSponsorshipAvailable: intent.feeSponsorshipAvailable,
        lifecycleIntentId: intent.lifecycleIntentId,
        lifecycleIdempotencyKey: intent.lifecycleIdempotencyKey,
        lifecycleSequence: intent.lifecycleSequence,
        lifecycleCreatedAt: intent.lifecycleCreatedAt,
        lifecycleExpiresAt: intent.lifecycleExpiresAt,
        lifecycleRetryOf: intent.lifecycleRetryOf,
        lifecycleReplacementOf: intent.lifecycleReplacementOf,
        lifecycleAttempt: intent.lifecycleAttempt,
        lifecycleIntentFingerprint: intent.lifecycleIntentFingerprint,
        walletAddress: executionWalletAddress,
        executionWalletAddress,
        agentOwnerWalletAddress: walletAddress,
      };
      const [threatIntelligence, oracleValidation, marketRiskSignals, complianceControls] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
        getMarketRiskSignalsSnapshot(),
        getComplianceControlsSnapshot(),
      ]);
      const walletAgents = scopedAgents(walletAddress);
      const walletPolicies = scopedPolicies(walletAddress);
      const walletAuditLogs = scopedAuditLogs(walletAddress);
      const policy = walletPolicies.find((item) => item.agentId === intent.agentId && item.status === "Active");
      const rawAction = body.action && typeof body.action === "object" ? body.action : body;
      const bridgeProviderEvidence = await prepareBridgeProviderIntegration({ request });
      request = applyBridgeProviderEvidenceToRequest(request, bridgeProviderEvidence);
      request.statefulSimulationEvidence = await runStatefulSimulation({
        simulation: rawAction.simulation || rawAction.statefulSimulation || {},
        chainName: request.chainName,
      });
      // Resolve the canonical identity before provider-backed structural inspection.
      const identityPreview = evaluateAssetIdentity({ request, policy });
      request.assetIdentity = identityPreview.context;
      request.assetContractRiskEvidence = await inspectAssetContractRisk({ request });
      let result = evaluatePolicy({ request, agents: walletAgents, policies: walletPolicies, auditLogs: walletAuditLogs, emergencyPauses: scopedEmergencyPauses(walletAddress, { activeOnly: true }), threatIntelligence, oracleValidation, marketRiskSignals, complianceControls });
      let activatedEmergencyPause = null;
      if (!result.emergencyControlsContext?.active) {
        const trigger = detectAutomaticEmergencyTrigger({ request, agent: agentRecord, policy, auditLogs: walletAuditLogs, result });
        if (trigger) {
          const duplicate = scopedEmergencyPauses(walletAddress, { activeOnly: true }).find((pause) => pause.agentId === agentRecord.id && pause.scopeType === trigger.scopeType && pause.scopeValue === trigger.scopeValue && pause.triggerRule === trigger.triggerRule);
          if (!duplicate) {
            const normalized = normalizeEmergencyPauseInput({
              body: { ...trigger, reason: trigger.reason, triggerEvidence: trigger.evidence, agentId: trigger.agentId || agentRecord.id },
              ownerWalletAddress: walletAddress,
              agents,
              policies,
              triggerType: "Automatic",
            });
            const { agent: _pauseAgent, policy: _pausePolicy, ...pauseRecord } = normalized;
            emergencyPauses = [pauseRecord, ...emergencyPauses];
            activatedEmergencyPause = pauseRecord;
            result = applyAutomaticPauseToResult(result, pauseRecord);
          }
        }
      }
      const authorizedAmount = result.x402PaymentControlsContext?.amount ?? intent.amount;
      const agent = publicAgent(agentRecord);
      const status = gatewayStatusFromDecision(result.decision, result.decisionExplanation);
      const auditTimestamp = new Date().toISOString();
      const auditLog = {
        id: makeId("AUD"),
        timestamp: auditTimestamp,
        shield: "Agent Shield",
        agentId: intent.agentId,
        agentName: agent?.name || intent.agentId,
        action: intent.actionType,
        amount: authorizedAmount,
        target: intent.target,
        targetType: intent.targetType,
        decision: result.decision,
        risk: result.risk,
        reason: `Agent Gateway request ${intent.id} from ${intent.source}. ${intent.goal ? `Goal: ${intent.goal}. ` : ""}${intent.reason ? `Reason: ${intent.reason}. ` : ""}${result.reason}`,
        policyUsed: policy?.name || "No active policy",
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
        txHash: "",
        executionStatus: initialExecutionStatus(result.decision),
        executionTxHash: "",
        executionSignedBy: "",
        executionNote: result.decisionExplanation?.userMessage || (result.decision === "Allowed" ? "Magen3 approved this action. Waiting for the execution layer to submit the exact transaction." : "Execution did not proceed because Magen3 did not approve automatic execution."),
        executionUpdatedAt: "",
        decisionProofStatus: "queued",
        decisionProofPayloadHash: "",
        decisionProofError: "",
        decisionProofMode: "",
        decisionProofUpdatedAt: "",
        originalIntent: {
          source: intent.source,
          agentId: intent.agentId,
          executionWalletAddress,
          goal: intent.goal,
          reason: intent.reason,
          emergencyControl: result.emergencyControlsContext || null,
          magen3DecisionContext: {
            decisionExplanation: result.decisionExplanation || null,
            reviewResolution: result.reviewResolution || null,
          },
          instructionIntegrity: (intent.instructionIntegrityMetadataSupplied || result.instructionIntegrityContext) ? {
            goalId: intent.instructionGoalId,
            originalUserGoalHash: intent.instructionOriginalUserGoalHash,
            initiatedBy: intent.instructionInitiatedBy,
            intentSource: intent.instructionIntentSource,
            toolName: intent.instructionToolName,
            toolServer: intent.instructionToolServer,
            sourceDomains: intent.instructionSourceDomains,
            externalContentUsed: intent.instructionExternalContentUsed,
            userConfirmed: intent.instructionUserConfirmed,
            sourceTrustLevel: intent.instructionSourceTrustLevel,
            parameterChangeReason: intent.instructionParameterChangeReason,
            originalParameterHash: intent.instructionOriginalParameterHash,
            suppliedCurrentParameterHash: intent.instructionCurrentParameterHash,
            currentParameterHash: result.instructionIntegrityContext?.currentParameterHash || "",
            originalProtectedParameters: intent.instructionOriginalProtectedParameters || null,
            parameterDifferences: result.instructionIntegrityContext?.parameterDifferences || [],
            mismatchFields: result.instructionIntegrityContext?.mismatchFields || [],
            parametersChanged: result.instructionIntegrityContext?.parametersChanged === true,
            originalPermissionScopes: intent.instructionOriginalPermissionScopes,
            currentPermissionScopes: intent.instructionCurrentPermissionScopes,
            violations: result.instructionIntegrityContext?.violations || [],
          } : undefined,
          toolIntegrity: (intent.toolIntegrityMetadataSupplied || result.toolMcpIntegrityContext) ? {
            mcpServerId: intent.toolMcpServerId,
            mcpServerUrl: intent.toolMcpServerUrl,
            toolName: intent.toolIntegrityToolName,
            toolVersion: intent.toolIntegrityToolVersion,
            manifestHash: intent.toolIntegrityManifestHash,
            schemaHash: intent.toolIntegritySchemaHash,
            descriptionHash: intent.toolIntegrityDescriptionHash,
            permissionScopes: intent.toolIntegrityPermissionScopes,
            credentialScope: intent.toolIntegrityCredentialScope,
            tls: intent.toolIntegrityTls,
            toolOrigin: intent.toolIntegrityOrigin,
            approvedAt: intent.toolIntegrityApprovedAt,
            approvedServer: result.toolMcpIntegrityContext?.approvedServer === true,
            approvedTool: result.toolMcpIntegrityContext?.approvedTool === true,
            materialChangeDetected: result.toolMcpIntegrityContext?.materialChangeDetected === true,
            violations: result.toolMcpIntegrityContext?.violations || [],
          } : undefined,
          delegation: (intent.delegationMetadataSupplied || result.delegationSafetyContext) ? {
            delegationId: intent.delegationId,
            delegatingWallet: intent.delegationDelegatingWallet,
            delegate: intent.delegationDelegate,
            sessionKey: intent.delegationSessionKey,
            allowedNetworks: intent.delegationAllowedNetworks,
            allowedContracts: intent.delegationAllowedContracts,
            allowedMethods: intent.delegationAllowedMethods,
            allowedAssets: intent.delegationAllowedAssets,
            nativeAmountLimit: intent.delegationNativeAmountLimit,
            tokenAmountLimits: intent.delegationTokenAmountLimits,
            maxTransactionAmount: intent.delegationMaxTransactionAmount,
            maxFrequency: intent.delegationMaxFrequency,
            validFrom: intent.delegationValidFrom,
            expiresAt: intent.delegationExpiresAt,
            revocationStatus: intent.delegationRevocationStatus,
            delegationDepth: intent.delegationDepth,
            redelegationAllowed: intent.delegationRedelegationAllowed,
            nonce: intent.delegationNonce,
            chainName: intent.delegationChainName,
            attestationHash: result.delegationSafetyContext?.attestationHash || intent.delegationAttestationHash,
            signatureVerified: result.delegationSafetyContext?.signatureVerified === true,
            signatureHash: result.delegationSafetyContext?.signatureHash || "",
            signatureAlgorithm: result.delegationSafetyContext?.signatureAlgorithm || "",
            usedLastHour: result.delegationSafetyContext?.usedLastHour || 0,
            violations: result.delegationSafetyContext?.violations || [],
          } : undefined,
          rpcIntegrity: (intent.rpcIntegrityMetadataSupplied || result.rpcChainIntegrityContext) ? {
            expectedChainName: intent.rpcExpectedChainName,
            expectedNetworkIdentifier: intent.rpcExpectedNetworkIdentifier,
            expectedGenesisHash: intent.rpcExpectedGenesisHash,
            selectedEndpoint: intent.rpcSelectedEndpoint,
            selectedProviderId: intent.rpcSelectedProviderId,
            providerObservations: result.rpcChainIntegrityContext?.providerObservations || intent.rpcProviderObservations || [],
            automaticFailoverUsed: intent.rpcAutomaticFailoverUsed,
            failoverFrom: intent.rpcFailoverFrom,
            failoverReason: intent.rpcFailoverReason,
            providerCount: result.rpcChainIntegrityContext?.providerCount || 0,
            usableProviderCount: result.rpcChainIntegrityContext?.usableProviderCount || 0,
            approvedProviderCount: result.rpcChainIntegrityContext?.approvedProviderCount || 0,
            networkIdentityVerified: result.rpcChainIntegrityContext?.networkIdentityVerified === true,
            networkAgreement: result.rpcChainIntegrityContext?.networkAgreement === true,
            transactionStatusAgreement: result.rpcChainIntegrityContext?.transactionStatusAgreement === true,
            contractStateAgreement: result.rpcChainIntegrityContext?.contractStateAgreement === true,
            status: result.rpcChainIntegrityContext?.status || "",
            violations: result.rpcChainIntegrityContext?.violations || [],
          } : undefined,
          feeSafety: (intent.feeSafetyMetadataSupplied || result.gasSponsorshipFeeSafetyContext) ? {
            chainFamily: result.gasSponsorshipFeeSafetyContext?.chainFamily || intent.feeChainFamily,
            chainName: result.gasSponsorshipFeeSafetyContext?.chainName || intent.feeChainName,
            estimatedGas: result.gasSponsorshipFeeSafetyContext?.estimatedGas ?? intent.feeEstimatedGas,
            gasLimit: result.gasSponsorshipFeeSafetyContext?.gasLimit ?? intent.feeGasLimit,
            gasPrice: result.gasSponsorshipFeeSafetyContext?.gasPrice ?? intent.feeGasPrice,
            priorityFee: result.gasSponsorshipFeeSafetyContext?.priorityFee ?? intent.feePriorityFee,
            maximumFee: result.gasSponsorshipFeeSafetyContext?.maximumFee ?? intent.feeMaximumFee,
            networkFee: result.gasSponsorshipFeeSafetyContext?.networkFee ?? intent.feeNetworkFee,
            feeUnit: result.gasSponsorshipFeeSafetyContext?.feeUnit || intent.feeUnit,
            sponsor: result.gasSponsorshipFeeSafetyContext?.sponsor || intent.feeSponsor,
            paymaster: result.gasSponsorshipFeeSafetyContext?.paymaster || intent.feePaymaster,
            sponsorshipId: result.gasSponsorshipFeeSafetyContext?.sponsorshipId || intent.feeSponsorshipId,
            sponsorshipExpiry: result.gasSponsorshipFeeSafetyContext?.sponsorshipExpiry || intent.feeSponsorshipExpiry,
            sponsorshipScopes: result.gasSponsorshipFeeSafetyContext?.sponsorshipScopes || intent.feeSponsorshipScopes || [],
            sponsorSignatureHash: intent.feeSponsorSignatureHash,
            sponsorEvidenceVerified: result.gasSponsorshipFeeSafetyContext?.sponsorEvidenceVerified === true,
            expectedPayer: result.gasSponsorshipFeeSafetyContext?.expectedPayer || intent.feeExpectedPayer,
            actualPayer: result.gasSponsorshipFeeSafetyContext?.actualPayer || intent.feeActualPayer,
            sponsored: result.gasSponsorshipFeeSafetyContext?.sponsored === true || intent.feeSponsored === true,
            sponsorshipAvailable: result.gasSponsorshipFeeSafetyContext?.sponsorshipAvailable !== false && intent.feeSponsorshipAvailable !== false,
            rollingBudgetUsed: result.gasSponsorshipFeeSafetyContext?.rollingBudgetUsed || 0,
            rollingSponsoredOperations: result.gasSponsorshipFeeSafetyContext?.rollingSponsoredOperations || 0,
            recentFailedSponsoredOperations: result.gasSponsorshipFeeSafetyContext?.recentFailedSponsoredOperations || 0,
            protectedFingerprint: result.gasSponsorshipFeeSafetyContext?.protectedFingerprint || "",
            status: result.gasSponsorshipFeeSafetyContext?.status || "",
            violations: result.gasSponsorshipFeeSafetyContext?.violations || [],
          } : undefined,
          assetIdentity: result.assetIdentityContext || undefined,
          assetContractRisk: result.assetContractRiskContext && result.assetContractRiskContext.status !== "not_applicable" ? result.assetContractRiskContext : undefined,
          walletBehavioralControls: result.walletBehavioralControlsContext && result.walletBehavioralControlsContext.status !== "not_required" ? result.walletBehavioralControlsContext : undefined,
          mevExecutionQuality: result.mevExecutionQualityContext && result.mevExecutionQualityContext.status !== "not_required" ? result.mevExecutionQualityContext : undefined,
          tradingRouteIntegrity: result.tradingRouteIntegrityContext && result.tradingRouteIntegrityContext.status !== "not_required" ? result.tradingRouteIntegrityContext : undefined,
          marketRiskSignals: result.marketRiskSignalsContext && result.marketRiskSignalsContext.status !== "not_required" ? result.marketRiskSignalsContext : undefined,
          bridgeProviderIntegration: result.bridgeProviderIntegrationContext && !["not_required", "not_applicable", "not_requested"].includes(result.bridgeProviderIntegrationContext.status) ? summarizeBridgeProviderIntegration(result.bridgeProviderIntegrationContext) : undefined,
          statefulSimulation: result.statefulSimulationContext && result.statefulSimulationContext.status !== "not_requested" ? result.statefulSimulationContext : undefined,
          valueExposure: result.valueExposureContext ? {
            basis: result.valueExposureContext.basis,
            referenceCurrency: result.valueExposureContext.referenceCurrency,
            nativeAmount: result.valueExposureContext.nativeAmount,
            unit: result.valueExposureContext.unit,
            verifiedReferenceValue: result.valueExposureContext.verifiedReferenceValue,
            identity: result.valueExposureContext.identity,
            priceEvidence: result.valueExposureContext.priceEvidence,
            thresholds: result.valueExposureContext.thresholds,
            cumulativeExposure: result.valueExposureContext.cumulativeExposure,
            walletPercentage: result.valueExposureContext.walletPercentage,
            triggeredBreach: result.valueExposureContext.triggeredBreach,
          } : undefined,
          lifecycle: {
            intentId: intent.lifecycleIntentId,
            idempotencyKey: intent.lifecycleIdempotencyKey,
            sequence: intent.lifecycleSequence,
            createdAt: intent.lifecycleCreatedAt,
            expiresAt: intent.lifecycleExpiresAt,
            retryOf: intent.lifecycleRetryOf,
            replacementOf: intent.lifecycleReplacementOf,
            attempt: intent.lifecycleAttempt || 0,
            intentFingerprint: result.executionIntegrityContext?.fingerprint || intent.lifecycleIntentFingerprint,
            clientIntentFingerprint: intent.lifecycleIntentFingerprint,
          },
          action: {
            type: intent.actionType,
            amount: authorizedAmount,
            asset: intent.asset,
            outputAsset: intent.outputAsset,
            oracle: {
              baseAsset: intent.oracleBaseAsset,
              quoteAsset: intent.oracleQuoteAsset,
              executionPrice: intent.executionPrice,
              quoteTimestamp: intent.quoteTimestamp,
            },
            marketRisk: intent.marketRiskMetadataSupplied ? {
              baseAsset: intent.marketRiskBaseAsset,
              quoteAsset: intent.marketRiskQuoteAsset,
              baseCanonicalId: intent.marketRiskBaseCanonicalId,
              quoteCanonicalId: intent.marketRiskQuoteCanonicalId,
              chainFamily: intent.marketRiskChainFamily,
              network: intent.marketRiskNetwork,
              venue: intent.marketRiskVenue,
              poolId: intent.marketRiskPoolId,
            } : undefined,
            target: intent.target,
            targetType: intent.targetType,
            contractIdentifierType: intent.contractIdentifierType,
            entryPoint: intent.entryPoint,
            contractVersion: intent.contractVersion,
            chainName: intent.chainName,
            preflight: {
              paymentAmountMotes: intent.paymentAmountMotes,
              gasPriceTolerance: intent.gasPriceTolerance,
              ttl: intent.ttl,
              timestamp: intent.transactionTimestamp,
              slippageBps: intent.slippageBps,
              expectedOutput: intent.expectedOutput,
              minimumReceived: intent.minimumReceived,
              runtimeArgs: intent.runtimeArgs,
              transactionHash: intent.transactionHash,
            },
            tokenPermission: intent.tokenPermissionMetadataSupplied ? {
              permissionType: intent.tokenPermissionType,
              owner: intent.tokenPermissionOwner,
              tokenContract: intent.tokenPermissionTokenContract,
              tokenStandard: intent.tokenPermissionTokenStandard,
              spender: intent.tokenPermissionSpender,
              approvalAmount: intent.tokenPermissionApprovalAmount,
              intendedTransactionAmount: intent.tokenPermissionIntendedTransactionAmount,
              unlimited: intent.tokenPermissionUnlimited,
              nonce: intent.tokenPermissionNonce,
              permitId: intent.tokenPermissionPermitId,
              deadline: intent.tokenPermissionDeadline,
              reusable: intent.tokenPermissionReusable,
              chainId: intent.tokenPermissionChainId,
              network: intent.tokenPermissionNetwork,
              approvedProtocol: intent.tokenPermissionApprovedProtocol,
              operatorForAll: intent.tokenPermissionOperatorForAll,
              batchItems: intent.tokenPermissionBatchItems,
              allowanceResetExpected: intent.tokenPermissionAllowanceResetExpected,
              fingerprint: result.tokenPermissionControlsContext?.fingerprint || "",
              replayStatus: result.tokenPermissionControlsContext?.replayStatus || "",
            } : undefined,
            privilegedAction: (intent.privilegedActionMetadataSupplied || result.privilegedActionControlsContext?.classifiedAction) ? {
              classifiedAction: result.privilegedActionControlsContext?.classifiedAction || intent.privilegedActionClassifiedAction,
              declaredAction: result.privilegedActionControlsContext?.declaredAction || intent.privilegedActionClassifiedAction,
              contract: intent.privilegedActionContract || intent.target,
              package: intent.privilegedActionPackage,
              entryPoint: intent.privilegedActionEntryPoint || intent.entryPoint,
              methodSignature: intent.privilegedActionMethodSignature,
              currentValue: intent.privilegedActionCurrentValue,
              requestedValue: intent.privilegedActionRequestedValue,
              role: intent.privilegedActionRole,
              recipient: intent.privilegedActionRecipient,
              implementation: intent.privilegedActionImplementation,
              classifierSource: result.privilegedActionControlsContext?.classifierSource || intent.privilegedActionClassifierSource,
              classifierVersion: result.privilegedActionControlsContext?.classifierVersion || intent.privilegedActionClassifierVersion,
              network: intent.privilegedActionNetwork || intent.chainName,
              parameterFingerprint: result.privilegedActionControlsContext?.parameterFingerprint || "",
              approvalRequired: result.privilegedActionControlsContext?.approvalRequired === true,
              requiredApprovalCount: Number(result.privilegedActionControlsContext?.requiredApprovalCount || 0),
              classificationStatus: result.privilegedActionControlsContext?.classificationStatus || "",
            } : undefined,
            contractUpgrade: (intent.contractUpgradeMetadataSupplied || result.contractUpgradeSafetyContext?.privilegedUpgrade) ? {
              contract: intent.contractUpgradeContract || intent.target,
              package: intent.contractUpgradePackage,
              currentImplementation: intent.contractUpgradeCurrentImplementation,
              requestedImplementation: intent.contractUpgradeRequestedImplementation,
              currentCodeHash: intent.contractUpgradeCurrentCodeHash,
              requestedCodeHash: intent.contractUpgradeRequestedCodeHash,
              packageVersion: intent.contractUpgradePackageVersion,
              upgradeAdministrator: intent.contractUpgradeAdministrator,
              requestedAt: intent.contractUpgradeRequestedAt,
              executeAfter: intent.contractUpgradeExecuteAfter,
              effectiveExecuteAfter: result.contractUpgradeSafetyContext?.effectiveExecuteAfter || "",
              network: intent.contractUpgradeNetwork || intent.chainName,
              parameterFingerprint: result.contractUpgradeSafetyContext?.parameterFingerprint || "",
              approvalRequired: result.contractUpgradeSafetyContext?.approvalRequired === true,
              requiredApprovalCount: Number(result.contractUpgradeSafetyContext?.requiredApprovalCount || 0),
            } : undefined,
            bridge: {
              sourceChain: intent.bridgeSourceChain,
              destinationChain: intent.bridgeDestinationChain,
              provider: intent.bridgeProvider,
              routeId: intent.bridgeRouteId,
              destinationAddress: intent.bridgeDestinationAddress,
              asset: intent.bridgeAsset,
              feeAmount: intent.bridgeFeeAmount,
              feeBps: intent.bridgeFeeBps,
              expectedOutput: intent.bridgeExpectedOutput,
              minimumReceived: intent.bridgeMinimumReceived,
              quoteTimestamp: intent.bridgeQuoteTimestamp,
              quoteExpiresAt: intent.bridgeQuoteExpiresAt,
              sourceConfirmations: intent.bridgeSourceConfirmations,
              destinationConfirmations: intent.bridgeDestinationConfirmations,
              providerId: intent.bridgeProviderId,
              sourceChainId: intent.bridgeSourceChainId || intent.bridgeOriginChainId,
              destinationChainId: intent.bridgeDestinationChainId,
              inputToken: intent.bridgeInputToken,
              outputToken: intent.bridgeOutputToken,
              amountAtomic: intent.bridgeAmountAtomic,
              depositor: intent.bridgeDepositor,
              recipient: intent.bridgeRecipient,
              tradeType: intent.bridgeTradeType,
              providerIntegration: summarizeBridgeProviderIntegration(result.bridgeProviderIntegrationContext),
            },
            compliance: {
              originatorJurisdiction: intent.complianceOriginatorJurisdiction,
              beneficiaryJurisdiction: intent.complianceBeneficiaryJurisdiction,
              counterpartyType: intent.complianceCounterpartyType,
              originatorAttestation: {
                status: intent.complianceOriginatorAttestationStatus,
                provider: intent.complianceOriginatorAttestationProvider,
                reference: intent.complianceOriginatorAttestationReference,
                issuedAt: intent.complianceOriginatorAttestationIssuedAt,
                expiresAt: intent.complianceOriginatorAttestationExpiresAt,
              },
              beneficiaryAttestation: {
                status: intent.complianceBeneficiaryAttestationStatus,
                provider: intent.complianceBeneficiaryAttestationProvider,
                reference: intent.complianceBeneficiaryAttestationReference,
                issuedAt: intent.complianceBeneficiaryAttestationIssuedAt,
                expiresAt: intent.complianceBeneficiaryAttestationExpiresAt,
              },
              travelRule: {
                status: intent.complianceTravelRuleStatus,
                reference: intent.complianceTravelRuleReference,
                dataHash: intent.complianceTravelRuleDataHash,
              },
              screening: {
                status: intent.complianceScreeningStatus,
                provider: intent.complianceScreeningProvider,
                reference: intent.complianceScreeningReference,
                screenedAt: intent.complianceScreenedAt,
              },
              riskRating: intent.complianceRiskRating,
              originatorVaspId: intent.complianceOriginatorVaspId,
              beneficiaryVaspId: intent.complianceBeneficiaryVaspId,
            },
            x402: {
              version: intent.x402Version,
              scheme: intent.x402Scheme,
              resourceUrl: intent.x402ResourceUrl,
              method: intent.x402HttpMethod,
              merchantDomain: intent.x402MerchantDomain,
              payTo: intent.x402PayTo,
              asset: intent.x402Asset,
              network: intent.x402Network,
              facilitator: intent.x402Facilitator,
              amountAtomic: intent.x402AmountAtomic,
              validUntil: intent.x402ValidUntil,
              maxTimeoutSeconds: intent.x402MaxTimeoutSeconds,
              requirementsReceivedAt: intent.x402RequirementsReceivedAt,
              requestId: intent.x402RequestId,
              requestBodyHash: intent.x402RequestBodyHash,
              paymentRequiredHash: intent.x402PaymentRequiredHash,
              requestFingerprint: result.x402PaymentControlsContext?.requestFingerprint || intent.x402RequestFingerprint,
              clientRequestFingerprint: intent.x402RequestFingerprint,
              settlementStatus: intent.x402SettlementStatus || "not_submitted",
              settlementAttempt: intent.x402SettlementAttempt || 0,
              settlementTxHash: intent.x402SettlementTxHash || "",
              settlement: {
                status: intent.x402SettlementStatus || "not_submitted",
                transactionHash: intent.x402SettlementTxHash || "",
                attempt: intent.x402SettlementAttempt || 0,
                resourceDelivered: false,
                updatedAt: "",
              },
            },
          },
        },
        pipelineStages: intent.actionType === "x402 Payment" ? appendX402PipelineStages(updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp, "Audit stored"), result.decision, auditTimestamp) : updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp, "Audit stored"),
        moduleFindings: result.moduleFindings || [],
        primaryReason: result.primaryReason || result.reason,
        triggeredRule: result.triggeredRule || "",
        suggestedResolution: result.suggestedResolution || result.recommendedAction,
        capabilityContext: result.capabilityContext || agent.executionCapabilities || ["Custom"],
        proofSubmittedAt: auditTimestamp,
        proofConfirmedAt: "",
        riskScore: Number(result.riskScore || 50),
      };
      const approvalRequest = createApprovalRequest({ auditLog, policy, ownerWalletAddress: walletAddress, reviewResolution: result.reviewResolution });
      if (result.decision === "Review Required") {
        const humanActionRequired = result.reviewResolution?.humanActionRequired === true;
        const reviewFinding = approvalRequest ? {
          module: "Policy & Approval Controls",
          status: approvalRequest.reviewStatus === "Pending" ? "warning" : "unavailable",
          severity: approvalRequest.reviewStatus === "Pending" ? "medium" : "high",
          rule: "Human approval quorum",
          message: approvalRequest.reviewStatus === "Pending" ? `Execution is paused until ${approvalRequest.requiredApprovals} authorized approval${approvalRequest.requiredApprovals === 1 ? "" : "s"} are recorded.` : "The active policy requires human approval but has no eligible approver wallet.",
          evidence: { approvalRequestId: approvalRequest.id, bindingHash: approvalRequest.bindingHash, requiredApprovals: approvalRequest.requiredApprovals, expiresAt: approvalRequest.expiresAt, humanActionRequired: true },
          remediation: approvalRequest.reviewStatus === "Pending" ? "Open Policy & Approval Controls, review the exact bound intent, and approve or reject it before expiry." : "Configure at least one authorized approver wallet or enable owner-wallet fallback.",
        } : humanActionRequired ? {
          module: "Policy & Approval Controls",
          status: "unavailable",
          severity: "high",
          rule: "Human approval workflow",
          message: "The active review strategy requires human approval, but no approval workflow is available.",
          evidence: { policyId: policy?.id || "", policyName: policy?.name || "", humanActionRequired: true },
          remediation: "Enable Human Approval & Quorum and configure an eligible approver before retrying.",
        } : {
          module: "Policy & Approval Controls",
          status: "warning",
          severity: "medium",
          rule: "Autonomous review resolution",
          message: "Execution is paused for agent remediation. Human approval is not required by the active review strategy.",
          evidence: { policyId: policy?.id || "", policyName: policy?.name || "", strategy: result.reviewResolution?.strategy || "Autonomous", reviewMode: result.reviewResolution?.mode || "agent_remediation", humanActionRequired: false },
          remediation: (result.reviewResolution?.requiredActions || [result.suggestedResolution]).filter(Boolean).join(" ") || "Correct or supply the required evidence and resubmit the exact business goal.",
        };
        const organizationalFinding = approvalRequest ? approvalOrganizationalFinding(approvalRequest) : null;
        auditLog.moduleFindings = [...(auditLog.moduleFindings || []), reviewFinding, ...(organizationalFinding ? [organizationalFinding] : [])];
        result.moduleFindings = [...(result.moduleFindings || []), reviewFinding, ...(organizationalFinding ? [organizationalFinding] : [])];
        const stageId = humanActionRequired ? "human-approval" : "agent-remediation";
        const stageLabel = humanActionRequired ? (approvalRequest ? "Human approval pending" : "Human approval required but unavailable") : "Agent remediation required";
        auditLog.pipelineStages = updatePipelineStage(auditLog.pipelineStages, stageId, approvalRequest || !humanActionRequired ? "pending" : "failed", auditTimestamp, stageLabel);
        result.pipelineStages = auditLog.pipelineStages;
      }
      if (approvalRequest) {
        actionReviews = [approvalRequest, ...actionReviews];
        auditLog.approvalRequestId = approvalRequest.id;
        auditLog.approvalStatus = approvalRequest.reviewStatus;
        auditLog.approvalBindingHash = approvalRequest.bindingHash;
        auditLog.approvalRequiredCount = approvalRequest.requiredApprovals;
        auditLog.approvalReceivedCount = 0;
        auditLog.approvalExpiresAt = approvalRequest.expiresAt;
        auditLog.approvalResolvedAt = "";
        result.approval = approvalPublicSummary(approvalRequest);
      } else {
        auditLog.approvalRequestId = "";
        auditLog.approvalStatus = result.decision === "Review Required" ? (result.reviewResolution?.humanActionRequired === true ? "not_configured" : "agent_remediation") : "not_required";
        auditLog.approvalBindingHash = "";
        auditLog.approvalRequiredCount = 0;
        auditLog.approvalReceivedCount = 0;
        auditLog.approvalExpiresAt = "";
        auditLog.approvalResolvedAt = "";
      }
      Object.assign(auditLog, initialDecisionProofState(auditLog));
      const gatewayRequest = {
        ...intent,
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        status,
        auditLogId: auditLog.id,
      };
      gatewayRequests = [gatewayRequest, ...gatewayRequests];
      agents = agents.map((item) => item.id === agentRecord.id ? { ...item, lastIntentAt: intent.receivedAt, lastDecisionAt: auditLog.timestamp } : item);
      auditLogs = [auditLog, ...auditLogs];
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === auditLog.id ? {
        ...log,
        ...proof,
        proofConfirmedAt: proof.decisionProofStatus === "recorded" ? (proof.decisionProofUpdatedAt || new Date().toISOString()) : log.proofConfirmedAt,
        pipelineStages: (log.pipelineStages || []).map((stage) => stage.id === "casper-proof" ? { ...stage, status: proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", timestamp: proof.decisionProofUpdatedAt || stage.timestamp } : stage),
      } : log);
      const recordedAuditLog = auditLogs.find((log) => log.id === auditLog.id) || auditLog;
      const casperPayload = buildAuditDecisionPayload(auditLog);
      return {
        ok: true,
        gatewayRequest,
        result,
        auditLog: recordedAuditLog,
        casperPayload,
        executionApproved: result.decision === "Allowed",
        approval: approvalRequest ? approvalPublicSummary(approvalRequest) : null,
        reviewResolution: result.reviewResolution,
        decisionExplanation: result.decisionExplanation,
        agentMessage: result.decisionExplanation?.userMessage || result.primaryReason || result.reason,
        mevExecutionQuality: result.mevExecutionQualityContext && result.mevExecutionQualityContext.status !== "not_required" ? result.mevExecutionQualityContext : undefined,
          tradingRouteIntegrity: result.tradingRouteIntegrityContext && result.tradingRouteIntegrityContext.status !== "not_required" ? result.tradingRouteIntegrityContext : undefined,
          marketRiskSignals: result.marketRiskSignalsContext && result.marketRiskSignalsContext.status !== "not_required" ? result.marketRiskSignalsContext : undefined,
          bridgeProviderIntegration: result.bridgeProviderIntegrationContext && !["not_required", "not_applicable", "not_requested"].includes(result.bridgeProviderIntegrationContext.status) ? summarizeBridgeProviderIntegration(result.bridgeProviderIntegrationContext) : undefined,
          bridgeProviderExecution: result.decision === "Allowed" && result.bridgeProviderIntegrationContext?.status === "passed" ? {
            providerId: result.bridgeProviderIntegrationContext.adapterId,
            quoteId: result.bridgeProviderIntegrationContext.providerQuoteId,
            quoteHash: result.bridgeProviderIntegrationContext.providerQuoteHash,
            evidenceHash: result.bridgeProviderIntegrationContext.evidenceHash,
            routeFingerprint: result.bridgeProviderIntegrationContext.routeFingerprint,
            payloadHash: result.bridgeProviderIntegrationContext.payloadHash,
            approvals: result.bridgeProviderIntegrationContext.approvalTransactions || [],
            transaction: result.bridgeProviderIntegrationContext.sourceTransaction,
          } : undefined,
        emergencyPause: activatedEmergencyPause ? publicEmergencyPause(activatedEmergencyPause) : null,
        nextAction: gatewayNextAction(result.decision, result.decisionExplanation),
      };
    },

    async listEmergencyPauses(walletAddress) {
      const ownerWalletAddress = requireWalletAddress(walletAddress);
      return { emergencyPauses: scopedEmergencyPauses(ownerWalletAddress) };
    },

    async emergencyControlsStatus(walletAddress = "") {
      const ownerWalletAddress = normalizeWalletAddress(walletAddress);
      const pauses = ownerWalletAddress ? scopedEmergencyPauses(ownerWalletAddress) : [];
      return {
        status: "live",
        protectionArea: "Policy & Approval Controls",
        control: "Emergency Circuit Breaker",
        active: pauses.filter((pause) => pause.active).length,
        total: pauses.length,
        scopedEnforcement: true,
        automaticTriggers: true,
        expiry: true,
        authorizedResume: true,
        approvalGatedResume: true,
        securityBoundary: "Emergency controls change authorization state only. Magen3 never receives wallet private keys, mnemonics, or raw signed transactions.",
      };
    },

    async createEmergencyPause(body = {}) {
      const ownerWalletAddress = requireWalletAddress(body.walletAddress || body.ownerWalletAddress);
      const normalized = normalizeEmergencyPauseInput({ body, ownerWalletAddress, agents, policies, triggerType: body.triggerType || "Manual" });
      const { agent, policy, ...pauseRecord } = normalized;
      const duplicate = scopedEmergencyPauses(ownerWalletAddress, { activeOnly: true }).find((pause) => pause.scopeType === pauseRecord.scopeType && pause.scopeValue === pauseRecord.scopeValue && pause.agentId === pauseRecord.agentId && pause.policyId === pauseRecord.policyId);
      if (duplicate) {
        const err = new Error(`An active ${pauseRecord.scopeType} emergency pause already covers this scope.`);
        err.status = 409;
        throw err;
      }
      emergencyPauses = [pauseRecord, ...emergencyPauses];
      const auditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: pauseRecord, agent, policy, event: "activated" }));
      return { emergencyPause: publicEmergencyPause(pauseRecord), auditLog };
    },

    async resumeEmergencyPause(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.resumedByWallet);
      let pause = emergencyPauses.find((item) => item.id === id && normalizeWalletAddress(item.ownerWalletAddress).toLowerCase() === walletAddress.toLowerCase());
      if (!pause) {
        const err = new Error("Emergency pause not found for the connected wallet.");
        err.status = 404;
        throw err;
      }
      pause = refreshEmergencyPause(pause);
      if (pause.status !== "Active") {
        const err = new Error(`Emergency pause is ${pause.status.toLowerCase()} and cannot be resumed.`);
        err.status = 409;
        throw err;
      }
      const authorized = [pause.ownerWalletAddress, ...(pause.resumeAuthorityWallets || [])].some((item) => normalizeWalletAddress(item).toLowerCase() === walletAddress.toLowerCase());
      if (!authorized) {
        const err = new Error("Connected wallet is not authorized to resume this emergency pause.");
        err.status = 403;
        throw err;
      }
      const resumeReason = String(body.reason || body.resumeReason || "").trim();
      if (resumeReason.length < 8) {
        const err = new Error("Resume reason must contain at least 8 characters.");
        err.status = 400;
        throw err;
      }
      const pauseAgent = agents.find((item) => item.id === pause.agentId) || null;
      const pausePolicy = policies.find((item) => item.id === pause.policyId) || null;
      if (pause.resumeRequiresApproval) {
        if (pause.resumeApprovalRequestId) {
          const review = actionReviews.find((item) => item.id === pause.resumeApprovalRequestId);
          return { emergencyPause: publicEmergencyPause(pause), approval: review ? approvalPublicSummary(refreshApproval(review)) : null, auditLog: review ? auditLogs.find((log) => log.id === review.auditLogId) || null : null };
        }
        const pendingPause = { ...pause, pendingResumeReason: resumeReason };
        const { approval, auditLog } = createEmergencyResumeApproval({ pause: pendingPause, policy: pausePolicy || {}, agent: pauseAgent, ownerWalletAddress: pause.ownerWalletAddress });
        if (!approval) {
          const err = new Error("Emergency resume approval could not be created. Configure eligible resume authority wallets.");
          err.status = 409;
          throw err;
        }
        actionReviews = [approval, ...actionReviews];
        emergencyPauses = emergencyPauses.map((item) => item.id === pause.id ? { ...item, resumeApprovalRequestId: approval.id, pendingResumeReason: resumeReason, updatedAt: new Date().toISOString() } : item);
        const recordedAudit = await persistEmergencyAudit(auditLog);
        return { emergencyPause: publicEmergencyPause(emergencyPauses.find((item) => item.id === pause.id)), approval: approvalPublicSummary(approval), auditLog: recordedAudit };
      }
      const now = new Date().toISOString();
      const resumed = { ...pause, status: "Resumed", resumedByWallet: walletAddress, resumeReason, resumedAt: now, updatedAt: now };
      emergencyPauses = emergencyPauses.map((item) => item.id === pause.id ? resumed : item);
      const auditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: resumed, agent: pauseAgent, policy: pausePolicy, event: "resumed" }));
      return { emergencyPause: publicEmergencyPause(resumed), auditLog };
    },

    async listApprovals(walletAddress) {
      return { approvals: scopedApprovals(requireWalletAddress(walletAddress)) };
    },

    async createApprovalChallenge(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.reviewerWallet || body.approverWalletAddress);
      const index = actionReviews.findIndex((review) => review.id === id);
      if (index < 0) {
        const err = new Error("Approval request not found");
        err.status = 404;
        throw err;
      }
      const review = refreshApproval(actionReviews[index]);
      const now = new Date();
      approvalSignatureChallenges = approvalSignatureChallenges.map((challenge) => {
        const refreshed = expireApprovalSignatureChallenge(challenge, now);
        if (refreshed.status === "Pending"
          && refreshed.approvalRequestId === id
          && String(refreshed.reviewerWallet || "").toLowerCase() === walletAddress.toLowerCase()) {
          return { ...refreshed, status: "Superseded", verificationError: "A newer one-time challenge was issued.", updatedAt: now.toISOString() };
        }
        return refreshed;
      });
      const challenge = createApprovalSignatureChallenge({
        review,
        input: { ...body, walletAddress },
        now,
        chainName: String(review.reviewContext?.approvalSignatureChainName || "").trim(),
      });
      approvalSignatureChallenges = [{ ...challenge, createdAt: now.toISOString(), updatedAt: now.toISOString() }, ...approvalSignatureChallenges];
      return { challenge: approvalSignatureChallengePublicSummary(challenge), approval: approvalPublicSummary(review) };
    },

    async respondApproval(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.approverWalletAddress);
      const index = actionReviews.findIndex((review) => review.id === id);
      if (index < 0) {
        const err = new Error("Approval request not found");
        err.status = 404;
        throw err;
      }
      const currentReview = refreshApproval(actionReviews[index]);
      let signatureVerification = null;
      if (currentReview.reviewContext?.requireCryptographicReviewerSignature === true) {
        const challengeId = String(body.challengeId || body.signatureChallengeId || "").trim();
        const challengeIndex = approvalSignatureChallenges.findIndex((challenge) => challenge.id === challengeId);
        if (challengeIndex < 0) {
          const err = new Error("A valid one-time approval signature challenge is required.");
          err.status = 400;
          throw err;
        }
        const verified = verifyApprovalSignatureChallenge({
          challenge: approvalSignatureChallenges[challengeIndex],
          review: currentReview,
          input: { ...body, walletAddress },
        });
        approvalSignatureChallenges = approvalSignatureChallenges.map((challenge) => challenge.id === challengeId ? { ...verified.challenge, updatedAt: verified.verification.verifiedAt } : challenge);
        signatureVerification = verified.verification;
      }
      const updated = respondToApproval(currentReview, { ...body, walletAddress, signatureVerification });
      actionReviews = actionReviews.map((review) => review.id === id ? updated : review);
      let resumedPause = null;
      let resumeAuditLog = null;
      if (updated.reviewStatus === "Approved" && updated.reviewContext?.kind === "emergency-pause-resume") {
        const pauseId = String(updated.reviewContext.emergencyPauseId || "").trim();
        const pause = emergencyPauses.find((item) => item.id === pauseId && item.status === "Active");
        if (pause) {
          const now = new Date().toISOString();
          resumedPause = {
            ...pause,
            status: "Resumed",
            resumedByWallet: walletAddress,
            resumeReason: String(updated.reviewContext.requestedResumeReason || "Emergency resume quorum approved.").trim(),
            resumedAt: now,
            updatedAt: now,
          };
          emergencyPauses = emergencyPauses.map((item) => item.id === pause.id ? resumedPause : item);
          const pauseAgent = agents.find((item) => item.id === pause.agentId) || null;
          const pausePolicy = policies.find((item) => item.id === pause.policyId) || null;
          resumeAuditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: resumedPause, agent: pauseAgent, policy: pausePolicy, event: "resumed" }));
        }
      }
      syncAuditApproval(updated);
      return { approval: approvalPublicSummary(updated), auditLog: auditLogs.find((log) => log.id === updated.auditLogId) || null, emergencyPause: resumedPause ? publicEmergencyPause(resumedPause) : null, resumeAuditLog };
    },

    async getAgentApproval(id, body = {}, context = {}) {
      const agentId = String(body.agentId || body.agent_id || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required");
        err.status = 400;
        throw err;
      }
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const review = actionReviews.find((item) => (item.id === id || item.auditLogId === id) && item.agentId === agentRecord.id);
      if (!review) {
        const err = new Error("Approval request not found for this connected agent");
        err.status = 404;
        throw err;
      }
      const refreshed = refreshApproval(review);
      return { ok: true, approval: approvalPublicSummary(refreshed) };
    },

    async approvalStatus(walletAddress) {
      const approvals = scopedApprovals(walletAddress);
      return {
        status: "foundation_available",
        pending: approvals.filter((item) => ["Pending", "Configuration Required"].includes(item.reviewStatus)).length,
        approved: approvals.filter((item) => item.reviewStatus === "Approved").length,
        rejected: approvals.filter((item) => item.reviewStatus === "Rejected").length,
        expired: approvals.filter((item) => item.reviewStatus === "Expired").length,
        signatureEnabledRequests: approvals.filter((item) => item.signatureRequired === true).length,
        verifiedResponses: approvals.reduce((total, item) => total + Number(item.verifiedResponses || 0), 0),
        cryptographicReviewerSignatures: "foundation_available",
        approvalEscalationAndOrganizationalQuorum: "live",
        organizationalRequests: approvals.filter((item) => item.organizationalQuorum?.enabled === true).length,
        escalatedRequests: approvals.filter((item) => Array.isArray(item.escalationHistory) && item.escalationHistory.length > 0).length,
        delayedExecutions: approvals.filter((item) => item.executionWindowStatus === "delay").length,
        openExecutionWindows: approvals.filter((item) => item.executionWindowStatus === "open").length,
        expiredExecutionWindows: approvals.filter((item) => item.executionWindowStatus === "expired").length,
        signatureAlgorithms: ["Ed25519", "Secp256k1"],
        challengeReplayProtection: true,
        securityBoundary: "Signature-enabled policies require a one-time Casper Wallet message signature bound to the exact approval, response, reviewer, nonce, chain, domain, and expiry. Magen3 stores signature hashes and verification metadata, not private keys or raw transaction signatures.",
        organizationalBoundary: "Organizational policies resolve immutable approval tiers, named role quotas, timed backup escalation, execution delays, and bounded signing windows. Agents may poll this state but cannot change it or submit reviewer responses.",
      };
    },

    async prepareCasperPayload(id) {
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      return { auditLog, ...buildAuditDecisionPayload(auditLog) };
    },

    async confirmCasperDeploy(id, body) {
      const txHash = validateDeployHash(body?.deployHash);
      auditLogs = auditLogs.map((log) => log.id === id ? {
        ...log,
        txHash,
        decisionProofStatus: "recorded",
        decisionProofError: "",
        decisionProofUpdatedAt: new Date().toISOString(),
        proofConfirmedAt: new Date().toISOString(),
        pipelineStages: (log.pipelineStages || []).map((stage) => stage.id === "casper-proof" ? { ...stage, status: "completed", timestamp: new Date().toISOString() } : stage),
      } : log);
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      return { auditLog, txHash, confirmed: true };
    },

    async confirmExecutionDeploy(id, body) {
      const executionTxHash = validateDeployHash(body?.deployHash || body?.executionTxHash);
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const executionAgent = agents.find((item) => item.id === auditLog.agentId) || null;
      const executionPolicy = policies.find((item) => item.agentId === auditLog.agentId && item.status === "Active") || null;
      if (executionAgent && executionPolicy) {
        const emergency = evaluateEmergencyControls({
          request: {
            agentId: auditLog.agentId,
            actionType: auditLog.action,
            target: auditLog.target,
            targetType: auditLog.targetType,
            tokenPermissionMetadataSupplied: Boolean(auditLog.originalIntent?.action?.tokenPermission),
            privilegedActionMetadataSupplied: Boolean(auditLog.originalIntent?.action?.privilegedAction),
          },
          agent: executionAgent,
          policy: executionPolicy,
          pauses: scopedEmergencyPauses(auditLog.agentOwnerWalletAddress || auditLog.walletAddress, { activeOnly: true }),
        });
        if (emergency.hardBlock || emergency.needsReview) {
          const err = new Error("Execution cannot be recorded while an active Emergency Circuit Breaker pause applies to this authorized intent.");
          err.status = 409;
          throw err;
        }
      }
      const review = auditLog.approvalRequestId ? actionReviews.find((item) => item.id === auditLog.approvalRequestId) : null;
      const approvedAfterReview = auditLog.decision === "Review Required" && approvalExecutionAuthorized(review);
      if (auditLog.decision !== "Allowed" && !approvedAfterReview) {
        const err = new Error("Execution hash can only be attached to an Allowed decision or a Review Required decision with a current completed approval quorum.");
        err.status = 400;
        throw err;
      }
      const requiredConfirmations = Math.max(1, Number(executionPolicy?.structuredRules?.requiredConfirmations || 1));
      const { patch, result } = buildReconciliationAuditPatch({
        auditLog,
        policy: executionPolicy || {},
        body: {
          status: "confirmed",
          transactionHash: executionTxHash,
          attempt: Math.max(1, Number(auditLog.executionAttemptCount || 0) || 1),
          confirmations: requiredConfirmations,
          finalized: true,
          provider: "manual-casper-wallet-confirmation",
          note: String(body?.note || "Real execution transaction signed after Magen3 approval.").trim(),
        },
      });
      auditLogs = auditLogs.map((log) => log.id === id ? {
        ...log,
        ...patch,
        executionStatus: "executed",
        executionSignedBy: normalizeWalletAddress(body?.signedBy || body?.walletAddress || ""),
      } : log);
      return { auditLog: auditLogs.find((log) => log.id === id), executionTxHash, reconciliation: result.record, confirmed: true };
    },

    async executionReconciliationStatus(agentId = "", context = {}) {
      const activePolicy = agentId
        ? policies.find((item) => item.agentId === requireGatewayAgent(agentId, context.apiKey).id && item.status === "Active") || {}
        : {};
      const unresolved = auditLogs.filter((log) => ["submitted", "pending", "uncertain", "replaced"].includes(String(log.executionStatus || "").toLowerCase()) || log.resourceDeliveryStatus === "pending");
      const polling = getExecutionReconciliationPollingStatus();
      return {
        ...reconciliationStatusSummary(activePolicy),
        realPollingConfigured: polling.configured,
        polling,
        unresolvedExecutions: unresolved.length,
      };
    },

    async reconcileExecution(id, body, context = {}) {
      const agentId = String(body?.agentId || body?.agent_id || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required for execution reconciliation");
        err.status = 400;
        throw err;
      }
      const sensitiveKey = Object.keys(body || {}).find((key) => /private|mnemonic|seed|raw.*transaction|signed.*transaction|paymentSignature|walletSignature/i.test(key));
      if (sensitiveKey) {
        const err = new Error(`Execution reconciliation must not include signing material or secrets (${sensitiveKey})`);
        err.status = 400;
        throw err;
      }
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const auditLog = auditLogs.find((log) => log.id === id && log.agentId === agentRecord.id);
      if (!auditLog) {
        const err = new Error("Execution audit log not found for this connected agent");
        err.status = 404;
        throw err;
      }
      const review = auditLog.approvalRequestId ? actionReviews.find((item) => item.id === auditLog.approvalRequestId) : null;
      const approvedAfterReview = auditLog.decision === "Review Required" && approvalExecutionAuthorized(review);
      if (auditLog.decision !== "Allowed" && !approvedAfterReview) {
        const err = new Error("Execution can only be reconciled for an Allowed decision or a currently authorized Review Required decision");
        err.status = 409;
        throw err;
      }
      const activePolicy = policies.find((item) => item.agentId === agentRecord.id && item.status === "Active") || {};
      const replacementAuditLogId = String(body?.replacementAuditLogId || body?.replacedByAuditLogId || "").trim();
      if (replacementAuditLogId) {
        const replacementAudit = auditLogs.find((log) => log.id === replacementAuditLogId && log.agentId === agentRecord.id);
        if (!replacementAudit || replacementAudit.id === auditLog.id) {
          const err = new Error("replacementAuditLogId must identify a different audit owned by the same connected agent");
          err.status = 400;
          throw err;
        }
      }
      const { patch, result } = buildReconciliationAuditPatch({ auditLog, policy: activePolicy, body });
      auditLogs = auditLogs.map((log) => {
        if (log.id === id) return { ...log, ...patch };
        if (replacementAuditLogId && log.id === replacementAuditLogId) return { ...log, executionReplacementOf: id, executionReplacementAuditId: id };
        return log;
      });
      return { ok: true, auditLog: auditLogs.find((log) => log.id === id), reconciliation: result.record, history: result.history, idempotent: result.idempotent, unresolved: result.unresolved, terminal: result.terminal };
    },

    async pollExecution(id, body, context = {}) {
      const agentId = String(body?.agentId || body?.agent_id || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required for execution reconciliation polling");
        err.status = 400;
        throw err;
      }
      const prohibitedProviderField = Object.keys(body || {}).find((key) => /^(?:rpcUrl|rpcEndpoint|providerUrl|endpoint)$/i.test(key));
      if (prohibitedProviderField) {
        const err = new Error(`${prohibitedProviderField} is not accepted. Reconciliation RPC endpoints are configured only on the backend.`);
        err.status = 400;
        throw err;
      }
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const auditLog = auditLogs.find((log) => log.id === id && log.agentId === agentRecord.id);
      if (!auditLog) {
        const err = new Error("Execution audit log not found for this connected agent");
        err.status = 404;
        throw err;
      }
      const transactionHash = String(body?.transactionHash || auditLog.executionTxHash || auditLog.executionReconciliation?.transactionHash || "").trim();
      if (!transactionHash) {
        const err = new Error("A bound transactionHash is required before execution reconciliation can be polled");
        err.status = 400;
        throw err;
      }
      const originalAction = auditLog.originalIntent?.action && typeof auditLog.originalIntent.action === "object" ? auditLog.originalIntent.action : {};
      const bridgeProviderContext = originalAction?.bridge?.providerIntegration;
      if (bridgeProviderContext?.adapterId === "across-testnet" || bridgeProviderContext?.providerId === "across-testnet") {
        const providerObservation = await pollBridgeProviderTransfer({ providerId: "across-testnet", depositTransactionHash: transactionHash });
        const attempt = Math.max(1, Number(auditLog.executionAttemptCount || auditLog.executionReconciliation?.attempt || 1));
        const common = {
          auditLogId: id,
          agentId,
          transactionHash,
          attempt,
          provider: providerObservation.provider,
          providerReference: providerObservation.evidenceReference || providerObservation.depositTransactionHash,
          observedAt: providerObservation.checkedAt,
          chainName: bridgeProviderContext.sourceNetwork || originalAction?.bridge?.sourceChain || "",
          note: String(body?.note || `Across testnet destination status: ${providerObservation.providerStatus}.`).trim(),
        };
        const currentStatus = String(auditLog.executionReconciliation?.status || auditLog.executionStatus || "not_submitted").toLowerCase();
        if (providerObservation.status === "delivered") {
          if (!['confirmed', 'delivered'].includes(currentStatus)) {
            await this.reconcileExecution(id, { ...common, status: "confirmed", confirmations: 1, finalized: true }, context);
          }
          const delivered = await this.reconcileExecution(id, { ...common, status: "delivered", confirmations: 1, finalized: true, resourceDelivered: true, deliveryReference: providerObservation.destinationTransactionHash || providerObservation.evidenceReference }, context);
          return { ...delivered, bridgeProviderObservation: providerObservation };
        }
        if (providerObservation.status === "refunded") {
          if (!['failed', 'refunded'].includes(currentStatus)) {
            await this.reconcileExecution(id, { ...common, status: "failed", failureReason: "Across testnet reported that the deposit was refunded." }, context);
          }
          const refunded = await this.reconcileExecution(id, { ...common, status: "refunded", refundTransactionHash: transactionHash }, context);
          return { ...refunded, bridgeProviderObservation: providerObservation };
        }
        if (providerObservation.status === "failed") {
          const failed = await this.reconcileExecution(id, { ...common, status: "failed", failureReason: "Across testnet reported that the bridge deposit expired or failed." }, context);
          return { ...failed, bridgeProviderObservation: providerObservation };
        }
        if (['confirmed', 'delivered', 'refunded'].includes(currentStatus)) {
          return { ok: true, auditLog, reconciliation: auditLog.executionReconciliation || null, bridgeProviderObservation: providerObservation, unchanged: true };
        }
        const pending = await this.reconcileExecution(id, { ...common, status: providerObservation.status === "uncertain" ? "uncertain" : "pending", confirmations: 0, finalized: false }, context);
        return { ...pending, bridgeProviderObservation: providerObservation };
      }
      const observation = await pollExecutionTransaction({
        transactionHash,
        chainFamily: String(body?.chainFamily || originalAction?.feeSafety?.chainFamily || "").trim(),
        chainName: String(body?.chainName || originalAction?.chainName || auditLog.originalIntent?.targetChain || "").trim(),
      });
      return this.reconcileExecution(id, {
        ...observation,
        auditLogId: id,
        agentId,
        attempt: Math.max(1, Number(auditLog.executionAttemptCount || auditLog.executionReconciliation?.attempt || 1)),
        note: String(body?.note || `Polled through ${observation.provider}.`).trim(),
      }, context);
    },

    async updateX402Settlement(id, body, context = {}) {
      let update = normalizeX402SettlementUpdate(body);
      const agentId = String(body?.agentId || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required for x402 settlement updates");
        err.status = 400;
        throw err;
      }
      const agentRecord = requireGatewayAgent(agentId, context.apiKey);
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog || auditLog.agentId !== agentRecord.id) {
        const err = new Error("x402 audit log not found for this connected agent");
        err.status = 404;
        throw err;
      }
      if (auditLog.action !== "x402 Payment" || auditLog.decision !== "Allowed") {
        const err = new Error("Settlement can only be reported for an Allowed x402 Payment decision");
        err.status = 400;
        throw err;
      }
      const currentX402 = auditLog.originalIntent?.action?.x402 || {};
      const expectedFingerprint = String(currentX402.requestFingerprint || "").toLowerCase();
      if (!expectedFingerprint || expectedFingerprint !== update.requestFingerprint.toLowerCase()) {
        const err = new Error("Settlement requestFingerprint does not match the authorized x402 payment");
        err.status = 400;
        throw err;
      }
      const activePolicy = policies.find((item) => item.agentId === agentRecord.id && item.status === "Active");
      const maxAttempts = Math.max(1, Number(activePolicy?.structuredRules?.x402MaxSettlementAttempts || 1));
      if (update.attempt > maxAttempts) {
        const err = new Error(`Settlement attempt ${update.attempt} exceeds the policy maximum of ${maxAttempts}`);
        err.status = 400;
        throw err;
      }
      const previous = currentX402.settlement && typeof currentX402.settlement === "object" ? currentX402.settlement : {};
      update = mergeX402SettlementTransition(previous, update);
      const settlementStageStatus = update.status === "confirmed" ? "completed" : update.status === "failed" ? "failed" : update.status === "uncertain" ? "warning" : "pending";
      const deliveryStageStatus = update.resourceDelivered ? "completed" : update.status === "failed" ? "failed" : "pending";
      const { patch: reconciliationPatch } = buildReconciliationAuditPatch({
        auditLog,
        policy: activePolicy || {},
        body: {
          status: update.status,
          transactionHash: update.transactionHash,
          attempt: update.attempt,
          confirmations: update.status === "confirmed" ? Math.max(1, Number(activePolicy?.structuredRules?.requiredConfirmations || 1)) : 0,
          finalized: update.status === "confirmed",
          resourceDelivered: update.resourceDelivered,
          provider: "x402-facilitator",
          providerReference: update.facilitatorReference || "",
          failureReason: update.status === "failed" ? (update.note || "x402 facilitator reported failure") : "",
          note: update.note || `x402 settlement reported as ${update.status}.`,
        },
      });
      auditLogs = auditLogs.map((log) => log.id === id ? {
        ...log,
        ...reconciliationPatch,
        originalIntent: {
          ...(log.originalIntent || {}),
          action: {
            ...(log.originalIntent?.action || {}),
            x402: {
              ...currentX402,
              settlementStatus: update.status,
              settlementAttempt: update.attempt,
              settlementTxHash: update.transactionHash,
              settlement: update,
            },
          },
        },
        executionStatus: `x402_${update.status}`,
        executionTxHash: update.transactionHash || log.executionTxHash || "",
        executionNote: update.note || `x402 settlement reported as ${update.status}.`,
        executionUpdatedAt: update.updatedAt,
        pipelineStages: updatePipelineStage(
          updatePipelineStage(reconciliationPatch.pipelineStages, "x402-settlement", settlementStageStatus, update.updatedAt, `x402 settlement: ${update.status}`),
          "x402-resource-delivery",
          deliveryStageStatus,
          update.resourceDelivered ? update.updatedAt : "",
          update.resourceDelivered ? "Paid resource delivered" : "Paid resource delivery"
        ),
      } : log);
      const updated = auditLogs.find((log) => log.id === id);
      return { ok: true, auditLog: updated, settlement: update };
    },

    async recordAuditLog(id) {
      const auditLog = auditLogs.find((log) => log.id === id);
      if (!auditLog) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const proof = await recordDecisionProof(auditLog);
      auditLogs = auditLogs.map((log) => log.id === id ? { ...log, ...proof } : log);
      const updated = auditLogs.find((log) => log.id === id);
      return { auditLog: updated, txHash: updated.txHash || proof.txHash || "", decisionProofStatus: updated.decisionProofStatus };
    },
  };
}
