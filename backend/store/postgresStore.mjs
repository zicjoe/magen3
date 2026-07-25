import { and, desc, eq } from "drizzle-orm";
import { shieldModules } from "../data/seed.mjs";
import { db } from "../db/client.mjs";
import { runMigrations } from "../db/migrate.mjs";
import { actionReviewsTable, agentGatewayRequestsTable, agentsTable, approvalSignatureChallengesTable, auditLogsTable, emergencyPausesTable, policiesTable } from "../db/schema.mjs";
import { apiKeyPreview, hashSecret, makeApiKey, makeId, makePseudoHash, secretMatches } from "../lib/ids.mjs";
import { buildAuditDecisionPayload, isRealDeployHash, validateDeployHash } from "../casper/auditPayload.mjs";
import { initialDecisionProofState, recordDecisionProof } from "../casper/decisionRelayer.mjs";
import { evaluateAction as evaluatePolicy } from "../lib/policyEngine.mjs";
import { getThreatIntelligenceSnapshot } from "../lib/threatIntelligence.mjs";
import { getOracleValidationSnapshot } from "../lib/oracleValidation.mjs";
import { getComplianceControlsSnapshot } from "../lib/complianceControls.mjs";
import { normalizeAgentGatewayIntent, gatewayNextAction, gatewayStatusFromDecision } from "../lib/agentGateway.mjs";
import { mergeX402SettlementTransition, normalizeX402SettlementUpdate } from "../lib/x402PaymentControls.mjs";
import { legacyTypeFromCapabilities, normalizeExecutionCapabilities, recommendedPolicyTemplate } from "../lib/securityModel.mjs";
import { approvalExecutionAuthorized, approvalOrganizationalFinding, approvalPublicSummary, approvalSignatureFinding, approvalVerifiedCount, createApprovalRequest, expireApproval, respondToApproval } from "../lib/approvalWorkflow.mjs";
import { approvalSignatureChallengePublicSummary, createApprovalSignatureChallenge, expireApprovalSignatureChallenge, verifyApprovalSignatureChallenge } from "../lib/approvalSignatures.mjs";
import { automaticPauseFinding, detectAutomaticEmergencyTrigger, evaluateEmergencyControls } from "../lib/emergencyControls.mjs";
import { buildEmergencyAuditLog, createEmergencyResumeApproval, normalizeEmergencyPauseInput, publicEmergencyPause } from "../lib/emergencyPauseWorkflow.mjs";

function toDate(value) {
  return value instanceof Date ? value : new Date(value || Date.now());
}

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

function normalizeAgentStatus(status) {
  return status === "Revoked" ? "Revoked" : "Active";
}

function normalizeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    purpose: row.purpose,
    permissionLevel: row.permissionLevel,
    status: normalizeAgentStatus(row.status),
    ownerWalletAddress: row.ownerWalletAddress || "",
    apiKeyPreview: row.apiKeyPreview || "",
    apiKeyIssuedAt: row.apiKeyIssuedAt ? toDate(row.apiKeyIssuedAt).toISOString() : "",
    apiKeyRotatedAt: row.apiKeyRotatedAt ? toDate(row.apiKeyRotatedAt).toISOString() : "",
    revokedAt: row.revokedAt ? toDate(row.revokedAt).toISOString() : "",
    executionCapabilities: normalizeExecutionCapabilities(row.executionCapabilities, row.type),
    capabilityConfiguration: row.capabilityConfiguration && typeof row.capabilityConfiguration === "object" ? row.capabilityConfiguration : {},
    onboardingStatus: row.onboardingStatus || "complete",
    lastIntentAt: row.lastIntentAt ? toDate(row.lastIntentAt).toISOString() : "",
    lastDecisionAt: row.lastDecisionAt ? toDate(row.lastDecisionAt).toISOString() : "",
    createdAt: toDate(row.createdAt).toISOString(),
  };
}

function normalizePolicy(row) {
  return {
    id: row.id,
    name: row.name,
    agentId: row.agentId,
    maxTransaction: Number(row.maxTransaction),
    dailyLimit: Number(row.dailyLimit),
    approvalThreshold: Number(row.approvalThreshold),
    trustedContracts: Array.isArray(row.trustedContracts) ? row.trustedContracts : [],
    blockedActions: Array.isArray(row.blockedActions) ? row.blockedActions : [],
    riskMode: row.riskMode,
    status: row.status,
    ownerWalletAddress: row.ownerWalletAddress || "",
    templateType: row.templateType || "Custom",
    capabilityScope: normalizeExecutionCapabilities(row.capabilityScope || []),
    structuredRules: row.structuredRules && typeof row.structuredRules === "object" ? row.structuredRules : {},
    createdAt: toDate(row.createdAt).toISOString(),
    policyHash: row.policyHash,
  };
}

function normalizeAuditLog(row) {
  return {
    id: row.id,
    timestamp: toDate(row.timestamp).toISOString(),
    shield: row.shield,
    agentId: row.agentId,
    agentName: row.agentName,
    action: row.action,
    amount: Number(row.amount),
    target: row.target,
    targetType: row.targetType,
    decision: row.decision,
    risk: row.risk,
    reason: row.reason,
    policyUsed: row.policyUsed,
    walletAddress: row.walletAddress,
    agentOwnerWalletAddress: row.agentOwnerWalletAddress || row.walletAddress,
    executionWalletAddress: row.executionWalletAddress || row.walletAddress,
    txHash: row.txHash || "",
    executionStatus: row.executionStatus || "not_submitted",
    executionTxHash: row.executionTxHash || "",
    executionSignedBy: row.executionSignedBy || "",
    executionNote: row.executionNote || "",
    executionUpdatedAt: row.executionUpdatedAt ? toDate(row.executionUpdatedAt).toISOString() : "",
    decisionProofStatus: row.decisionProofStatus || "queued",
    decisionProofPayloadHash: row.decisionProofPayloadHash || "",
    decisionProofError: row.decisionProofError || "",
    decisionProofMode: row.decisionProofMode || "",
    decisionProofUpdatedAt: row.decisionProofUpdatedAt ? toDate(row.decisionProofUpdatedAt).toISOString() : "",
    originalIntent: row.originalIntent && typeof row.originalIntent === "object" ? row.originalIntent : {},
    pipelineStages: Array.isArray(row.pipelineStages) ? row.pipelineStages : [],
    moduleFindings: Array.isArray(row.moduleFindings) ? row.moduleFindings : [],
    primaryReason: row.primaryReason || row.reason || "",
    triggeredRule: row.triggeredRule || "",
    suggestedResolution: row.suggestedResolution || "",
    capabilityContext: normalizeExecutionCapabilities(row.capabilityContext || []),
    proofSubmittedAt: row.proofSubmittedAt ? toDate(row.proofSubmittedAt).toISOString() : "",
    proofConfirmedAt: row.proofConfirmedAt ? toDate(row.proofConfirmedAt).toISOString() : "",
    approvalRequestId: row.approvalRequestId || "",
    approvalStatus: row.approvalStatus || "not_required",
    approvalBindingHash: row.approvalBindingHash || "",
    approvalRequiredCount: Number(row.approvalRequiredCount || 0),
    approvalReceivedCount: Number(row.approvalReceivedCount || 0),
    approvalExpiresAt: row.approvalExpiresAt ? toDate(row.approvalExpiresAt).toISOString() : "",
    approvalResolvedAt: row.approvalResolvedAt ? toDate(row.approvalResolvedAt).toISOString() : "",
    riskScore: Number(row.riskScore),
  };
}

function normalizeReview(row) {
  return {
    id: row.id,
    agentId: row.agentId,
    actionType: row.actionType,
    amount: Number(row.amount),
    target: row.target,
    targetType: row.targetType,
    decision: row.decision,
    risk: row.risk,
    riskScore: Number(row.riskScore),
    reason: row.reason,
    checksPassed: Array.isArray(row.checksPassed) ? row.checksPassed : [],
    checksFailed: Array.isArray(row.checksFailed) ? row.checksFailed : [],
    auditLogId: row.auditLogId || "",
    walletAddress: row.walletAddress || "",
    requesterWalletAddress: row.requesterWalletAddress || "",
    policyId: row.policyId || "",
    policyName: row.policyName || "",
    reviewStatus: row.reviewStatus || "Pending",
    bindingHash: row.bindingHash || "",
    requiredApprovals: Number(row.requiredApprovals || 1),
    approverWallets: Array.isArray(row.approverWallets) ? row.approverWallets : [],
    responses: Array.isArray(row.responses) ? row.responses : [],
    expiresAt: row.expiresAt ? toDate(row.expiresAt).toISOString() : "",
    resolvedAt: row.resolvedAt ? toDate(row.resolvedAt).toISOString() : "",
    rejectionReason: row.rejectionReason || "",
    reviewContext: row.reviewContext && typeof row.reviewContext === "object" ? row.reviewContext : {},
    updatedAt: row.updatedAt ? toDate(row.updatedAt).toISOString() : toDate(row.createdAt).toISOString(),
    createdAt: toDate(row.createdAt).toISOString(),
  };
}


function normalizeApprovalSignatureChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    approvalRequestId: row.approvalRequestId,
    auditLogId: row.auditLogId || "",
    agentId: row.agentId || "",
    approvalBindingHash: row.approvalBindingHash || "",
    response: row.response,
    reviewerWallet: row.reviewerWallet,
    nonce: row.nonce,
    issuedAt: toDate(row.issuedAt).toISOString(),
    expiresAt: toDate(row.expiresAt).toISOString(),
    domain: row.domain,
    chainName: row.chainName || "",
    message: row.message,
    challengeHash: row.challengeHash,
    status: row.status || "Pending",
    usedAt: row.usedAt ? toDate(row.usedAt).toISOString() : "",
    signatureHash: row.signatureHash || "",
    signatureAlgorithm: row.signatureAlgorithm || "",
    signatureVerified: row.signatureVerified === true,
    verificationError: row.verificationError || "",
    createdAt: row.createdAt ? toDate(row.createdAt).toISOString() : "",
    updatedAt: row.updatedAt ? toDate(row.updatedAt).toISOString() : "",
  };
}

function normalizeEmergencyPause(row) {
  return publicEmergencyPause({
    id: row.id,
    ownerWalletAddress: row.ownerWalletAddress || "",
    agentId: row.agentId || "",
    policyId: row.policyId || "",
    scopeType: row.scopeType || "",
    scopeValue: row.scopeValue || "",
    enforcementAction: row.enforcementAction || "Blocked",
    triggerType: row.triggerType || "Manual",
    triggerRule: row.triggerRule || "Manual emergency pause",
    reason: row.reason || "",
    triggerEvidence: row.triggerEvidence && typeof row.triggerEvidence === "object" ? row.triggerEvidence : {},
    status: row.status || "Active",
    createdByWallet: row.createdByWallet || row.ownerWalletAddress || "",
    createdAt: row.createdAt ? toDate(row.createdAt).toISOString() : "",
    expiresAt: row.expiresAt ? toDate(row.expiresAt).toISOString() : "",
    resumeAuthorityWallets: Array.isArray(row.resumeAuthorityWallets) ? row.resumeAuthorityWallets : [],
    resumeRequiresApproval: row.resumeRequiresApproval === true,
    resumeQuorum: Number(row.resumeQuorum || 1),
    resumeApprovalRequestId: row.resumeApprovalRequestId || "",
    resumedByWallet: row.resumedByWallet || "",
    resumeReason: row.resumeReason || "",
    resumedAt: row.resumedAt ? toDate(row.resumedAt).toISOString() : "",
    updatedAt: row.updatedAt ? toDate(row.updatedAt).toISOString() : "",
  });
}

function pauseDbValues(pause) {
  return {
    id: pause.id,
    ownerWalletAddress: pause.ownerWalletAddress,
    agentId: pause.agentId || "",
    policyId: pause.policyId || "",
    scopeType: pause.scopeType,
    scopeValue: pause.scopeValue || "",
    enforcementAction: pause.enforcementAction || "Blocked",
    triggerType: pause.triggerType || "Manual",
    triggerRule: pause.triggerRule || "Manual emergency pause",
    reason: pause.reason,
    triggerEvidence: pause.triggerEvidence || {},
    status: pause.status || "Active",
    createdByWallet: pause.createdByWallet || pause.ownerWalletAddress,
    createdAt: pause.createdAt ? new Date(pause.createdAt) : new Date(),
    expiresAt: pause.expiresAt ? new Date(pause.expiresAt) : null,
    resumeAuthorityWallets: pause.resumeAuthorityWallets || [],
    resumeRequiresApproval: pause.resumeRequiresApproval === true,
    resumeQuorum: Number(pause.resumeQuorum || 1),
    resumeApprovalRequestId: pause.resumeApprovalRequestId || "",
    resumedByWallet: pause.resumedByWallet || "",
    resumeReason: pause.resumeReason || "",
    resumedAt: pause.resumedAt ? new Date(pause.resumedAt) : null,
    updatedAt: pause.updatedAt ? new Date(pause.updatedAt) : new Date(),
  };
}

async function listEmergencyPauses(walletAddress, { activeOnly = false } = {}) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  const rows = await db.select().from(emergencyPausesTable)
    .where(eq(emergencyPausesTable.ownerWalletAddress, normalizedWallet))
    .orderBy(desc(emergencyPausesTable.createdAt));
  const now = new Date();
  const pauses = [];
  for (const row of rows) {
    let pause = normalizeEmergencyPause(row);
    if (row.status === "Active" && pause.status === "Expired") {
      const [updated] = await db.update(emergencyPausesTable)
        .set({ status: "Expired", updatedAt: now })
        .where(eq(emergencyPausesTable.id, row.id))
        .returning();
      pause = normalizeEmergencyPause(updated || { ...row, status: "Expired", updatedAt: now });
    }
    if (!activeOnly || pause.active) pauses.push(pause);
  }
  return pauses;
}

async function persistEmergencyAudit(auditLog) {
  const initialProof = initialDecisionProofState(auditLog);
  const [row] = await db.insert(auditLogsTable).values({
    ...auditLog,
    timestamp: new Date(auditLog.timestamp),
    executionUpdatedAt: auditLog.executionUpdatedAt ? new Date(auditLog.executionUpdatedAt) : null,
    decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
    proofSubmittedAt: auditLog.proofSubmittedAt ? new Date(auditLog.proofSubmittedAt) : new Date(),
    proofConfirmedAt: null,
    approvalExpiresAt: auditLog.approvalExpiresAt ? new Date(auditLog.approvalExpiresAt) : null,
    approvalResolvedAt: null,
    decisionProofStatus: initialProof.decisionProofStatus,
    decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
    decisionProofError: initialProof.decisionProofError,
    decisionProofMode: initialProof.decisionProofMode,
  }).returning();
  const normalized = normalizeAuditLog(row);
  const proof = await recordDecisionProof(normalized);
  const [updated] = await db.update(auditLogsTable).set({
    ...(proof.txHash ? { txHash: proof.txHash } : {}),
    decisionProofStatus: proof.decisionProofStatus,
    decisionProofPayloadHash: proof.decisionProofPayloadHash,
    decisionProofError: proof.decisionProofError,
    decisionProofMode: proof.decisionProofMode,
    decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
    proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
    pipelineStages: updatePipelineStage(row.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
  }).where(eq(auditLogsTable.id, row.id)).returning();
  return normalizeAuditLog(updated || row);
}

function applyAutomaticPauseToResult(result, pause) {
  const pauseFinding = automaticPauseFinding(pause);
  const decision = pause.enforcementAction === "Review Required" ? "Review Required" : "Blocked";
  result.decision = decision;
  result.risk = decision === "Blocked" ? "Critical" : "High";
  result.riskScore = Math.max(Number(result.riskScore || 0), decision === "Blocked" ? 99 : 82);
  result.reason = decision === "Blocked" ? "The current finding activated the Emergency Circuit Breaker, so execution is blocked." : "The current finding activated the Emergency Circuit Breaker, so execution requires human review.";
  result.recommendedAction = "Investigate the trigger and complete the authorized resume workflow before execution.";
  result.primaryReason = pauseFinding.message;
  result.triggeredRule = pauseFinding.rule;
  result.suggestedResolution = pauseFinding.remediation;
  result.moduleFindings = [...(result.moduleFindings || []), pauseFinding];
  result.modulesEvaluated = [...new Set([...(result.modulesEvaluated || []), "Emergency Circuit Breaker"])];
  result.policyChecksFailed = [...(result.policyChecksFailed || []), pauseFinding.message];
  result.pipelineStages = updatePipelineStage(result.pipelineStages, "emergency-circuit-breaker", decision === "Blocked" ? "failed" : "warning", new Date().toISOString(), "Automatic emergency pause activated");
  result.emergencyControlsContext = { active: true, automaticPauseActivated: true, effectiveDecision: decision, pause: publicEmergencyPause(pause) };
  return result;
}


async function listAgents(walletAddress) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  return (await db.select().from(agentsTable)
    .where(eq(agentsTable.ownerWalletAddress, normalizedWallet))
    .orderBy(desc(agentsTable.createdAt)))
    .map(normalizeAgent);
}

async function listPolicies(walletAddress) {
  const agents = await listAgents(walletAddress);
  const agentIds = new Set(agents.map((agent) => agent.id));
  if (agentIds.size === 0) return [];
  return (await db.select().from(policiesTable).orderBy(desc(policiesTable.createdAt)))
    .filter((policy) => agentIds.has(policy.agentId))
    .map(normalizePolicy);
}

async function listAuditLogs(walletAddress) {
  const normalizedWallet = normalizeWalletAddress(walletAddress);
  if (!normalizedWallet) return [];
  return (await db.select().from(auditLogsTable)
    .where(eq(auditLogsTable.walletAddress, normalizedWallet))
    .orderBy(desc(auditLogsTable.timestamp)))
    .map(normalizeAuditLog);
}

async function persistAuditApproval(review) {
  if (!review?.auditLogId) return null;
  const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, review.auditLogId));
  const current = rows[0];
  if (!current) return null;
  const approvalsReceived = approvalVerifiedCount(review);
  const signatureFinding = approvalSignatureFinding(review);
  const organizationalFinding = approvalOrganizationalFinding(review);
  const emergencyResume = review.reviewContext?.kind === "emergency-pause-resume";
  const executionStatus = emergencyResume ? "not_required" : review.reviewStatus === "Approved" ? "review_approved_pending_signature" : review.reviewStatus === "Rejected" ? "review_rejected_not_submitted" : review.reviewStatus === "Expired" ? "review_expired_not_submitted" : current.executionStatus;
  const executionNote = emergencyResume
    ? review.reviewStatus === "Approved" ? "Emergency resume quorum completed and the bound pause was resumed." : review.reviewStatus === "Rejected" ? `Emergency resume rejected${review.rejectionReason ? `: ${review.rejectionReason}` : "."}` : review.reviewStatus === "Expired" ? "Emergency resume approval expired. The pause remains active." : "Emergency resume approval remains pending; the pause stays active."
    : review.reviewStatus === "Approved" ? "Human approval quorum completed. The exact bound intent may proceed to wallet signing before approval expiry." : review.reviewStatus === "Rejected" ? `Human approval rejected${review.rejectionReason ? `: ${review.rejectionReason}` : "."}` : review.reviewStatus === "Expired" ? "Human approval expired before execution." : current.executionNote;
  const [updated] = await db.update(auditLogsTable).set({
    approvalRequestId: review.id,
    approvalStatus: review.reviewStatus,
    approvalBindingHash: review.bindingHash,
    approvalRequiredCount: Number(review.requiredApprovals || 1),
    approvalReceivedCount: approvalsReceived,
    approvalExpiresAt: review.expiresAt ? new Date(review.expiresAt) : null,
    approvalResolvedAt: review.resolvedAt ? new Date(review.resolvedAt) : null,
    moduleFindings: [
      ...(current.moduleFindings || []).filter((finding) => !["Cryptographic reviewer signature", "Organizational approval quorum"].includes(finding?.rule)),
      ...(signatureFinding ? [signatureFinding] : []),
      ...(organizationalFinding ? [organizationalFinding] : []),
    ],
    executionStatus,
    executionNote,
    pipelineStages: updatePipelineStage(current.pipelineStages, "human-approval", review.reviewStatus === "Approved" ? "completed" : ["Rejected", "Expired"].includes(review.reviewStatus) ? "failed" : "pending", review.updatedAt || new Date().toISOString(), emergencyResume ? (review.reviewStatus === "Approved" ? "Emergency resume quorum completed" : review.reviewStatus === "Rejected" ? "Emergency resume rejected" : review.reviewStatus === "Expired" ? "Emergency resume approval expired" : "Emergency resume approval pending") : (review.reviewStatus === "Approved" ? "Human approval quorum completed" : review.reviewStatus === "Rejected" ? "Human approval rejected" : review.reviewStatus === "Expired" ? "Human approval expired" : "Human approval pending")),
  }).where(eq(auditLogsTable.id, review.auditLogId)).returning();
  return updated ? normalizeAuditLog(updated) : null;
}

async function persistReview(review) {
  const [updated] = await db.update(actionReviewsTable).set({
    reviewStatus: review.reviewStatus,
    requiredApprovals: Number(review.requiredApprovals || 1),
    approverWallets: review.approverWallets || [],
    responses: review.responses || [],
    resolvedAt: review.resolvedAt ? new Date(review.resolvedAt) : null,
    rejectionReason: review.rejectionReason || "",
    reviewContext: review.reviewContext || {},
    updatedAt: review.updatedAt ? new Date(review.updatedAt) : new Date(),
  }).where(eq(actionReviewsTable.id, review.id)).returning();
  const normalized = normalizeReview(updated);
  await persistAuditApproval(normalized);
  return normalized;
}

async function refreshReview(review) {
  const refreshed = expireApproval(review);
  const changed = refreshed !== review && JSON.stringify({
    reviewStatus: refreshed.reviewStatus,
    requiredApprovals: refreshed.requiredApprovals,
    approverWallets: refreshed.approverWallets,
    reviewContext: refreshed.reviewContext,
    resolvedAt: refreshed.resolvedAt,
    updatedAt: refreshed.updatedAt,
  }) !== JSON.stringify({
    reviewStatus: review.reviewStatus,
    requiredApprovals: review.requiredApprovals,
    approverWallets: review.approverWallets,
    reviewContext: review.reviewContext,
    resolvedAt: review.resolvedAt,
    updatedAt: review.updatedAt,
  });
  if (changed) return persistReview(refreshed);
  return review;
}

async function insertApprovalReview(approval) {
  const [row] = await db.insert(actionReviewsTable).values({
    id: approval.id,
    agentId: approval.agentId,
    actionType: approval.actionType,
    amount: approval.amount,
    target: approval.target,
    targetType: approval.targetType,
    decision: approval.decision,
    risk: approval.risk,
    riskScore: approval.riskScore,
    reason: approval.reason,
    checksPassed: approval.checksPassed,
    checksFailed: approval.checksFailed,
    auditLogId: approval.auditLogId,
    walletAddress: approval.walletAddress,
    requesterWalletAddress: approval.requesterWalletAddress,
    policyId: approval.policyId,
    policyName: approval.policyName,
    reviewStatus: approval.reviewStatus,
    bindingHash: approval.bindingHash,
    requiredApprovals: approval.requiredApprovals,
    approverWallets: approval.approverWallets,
    responses: approval.responses,
    expiresAt: approval.expiresAt ? new Date(approval.expiresAt) : null,
    resolvedAt: approval.resolvedAt ? new Date(approval.resolvedAt) : null,
    rejectionReason: approval.rejectionReason || "",
    reviewContext: approval.reviewContext || {},
    updatedAt: approval.updatedAt ? new Date(approval.updatedAt) : new Date(),
    createdAt: approval.createdAt ? new Date(approval.createdAt) : new Date(),
  }).returning();
  return normalizeReview(row);
}

async function listApprovals(walletAddress) {
  const wallet = normalizeWalletAddress(walletAddress).toLowerCase();
  if (!wallet) return [];
  const rows = await db.select().from(actionReviewsTable).orderBy(desc(actionReviewsTable.createdAt));
  const approvals = [];
  for (const row of rows) {
    const normalized = await refreshReview(normalizeReview(row));
    if (normalized.walletAddress.toLowerCase() === wallet || (normalized.approverWallets || []).some((approver) => String(approver).toLowerCase() === wallet)) approvals.push(approvalPublicSummary(normalized));
  }
  return approvals;
}

function initialExecutionStatus(decision) {
  if (decision === "Allowed") return "approved_pending_signature";
  if (decision === "Blocked") return "blocked_not_submitted";
  if (decision === "Review Required") return "review_required_not_submitted";
  return "not_submitted";
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

function deriveDashboardStats(policies, auditLogs, emergencyPauses = []) {
  return {
    activeShields: policies.some((policy) => policy.status === "Active") ? 1 : 0,
    protectedActions: auditLogs.length,
    blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
    reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
    casperAuditRecords: auditLogs.filter((log) => isRealDeployHash(log.txHash)).length,
    activeEmergencyPauses: emergencyPauses.filter((pause) => pause.active).length,
  };
}

export async function createPostgresStore() {
  await runMigrations();

  return {
    mode: "postgres",

    async bootstrap(walletAddress) {
      const normalizedWallet = normalizeWalletAddress(walletAddress);
      const [agents, policies, auditLogs, approvals, emergencyPauses] = await Promise.all([
        listAgents(normalizedWallet),
        listPolicies(normalizedWallet),
        listAuditLogs(normalizedWallet),
        listApprovals(normalizedWallet),
        listEmergencyPauses(normalizedWallet),
      ]);
      return { agents, policies, auditLogs, approvals, emergencyPauses, shieldModules, dashboardStats: deriveDashboardStats(policies, auditLogs, emergencyPauses) };
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
      const now = new Date();
      const executionCapabilities = normalizeExecutionCapabilities(body.executionCapabilities, body.type);

      const [agent] = await db.insert(agentsTable).values({
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
        executionCapabilities,
        capabilityConfiguration: body.capabilityConfiguration && typeof body.capabilityConfiguration === "object" ? body.capabilityConfiguration : {},
        onboardingStatus: body.onboardingStatus || "complete",
        createdAt: now,
      }).returning();

      return { ...normalizeAgent(agent), apiKey };
    },

    async rotateAgentApiKey(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
      const agent = rows.find((item) => item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }

      const apiKey = makeApiKey();
      const now = new Date();
      const [updated] = await db.update(agentsTable)
        .set({
          apiKeyHash: hashSecret(apiKey),
          apiKeyPreview: apiKeyPreview(apiKey),
          apiKeyIssuedAt: agent.apiKeyIssuedAt || now,
          apiKeyRotatedAt: now,
        })
        .where(eq(agentsTable.id, id))
        .returning();

      return { ...normalizeAgent(updated), apiKey };
    },

    async revokeAgent(id, body) {
      const walletAddress = requireWalletAddress(body?.walletAddress || body?.ownerWalletAddress);
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
      const agent = rows.find((item) => item.ownerWalletAddress === walletAddress);
      if (!agent) {
        const err = new Error("Connected agent not found for this wallet.");
        err.status = 404;
        throw err;
      }

      const [updated] = await db.update(agentsTable)
        .set({ status: "Revoked", revokedAt: new Date() })
        .where(eq(agentsTable.id, id))
        .returning();

      return normalizeAgent(updated);
    },

    async getAgentGatewayIdentity(agentId, context = {}) {
      const rows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
      const agentRecord = rows[0];
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
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
        err.status = 401;
        throw err;
      }

      const activePolicy = (await listPolicies(agentRecord.ownerWalletAddress))
        .find((item) => item.agentId === agentRecord.id && item.status === "Active") || null;

      return {
        ok: true,
        agent: normalizeAgent(agentRecord),
        activePolicy,
        emergencyPauses: (await listEmergencyPauses(agentRecord.ownerWalletAddress, { activeOnly: true })).filter((pause) => !pause.agentId || pause.agentId === agentRecord.id),
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

      const existingAgentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, body.agentId));
      const ownedAgent = existingAgentRows.find((agent) => agent.ownerWalletAddress === walletAddress);
      if (!ownedAgent) {
        const err = new Error("Cannot create policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const [policyRow] = await db.insert(policiesTable).values({
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
        templateType: body.templateType || recommendedPolicyTemplate(normalizeAgent(ownedAgent).executionCapabilities),
        capabilityScope: normalizeExecutionCapabilities(body.capabilityScope || normalizeAgent(ownedAgent).executionCapabilities, ownedAgent.type),
        structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : {},
        createdAt: new Date(),
        policyHash: makePseudoHash("0xpol"),
      }).returning();

      const policy = normalizePolicy(policyRow);
      const agent = normalizeAgent(ownedAgent);

      const policyAuditTimestamp = new Date();
      const auditValues = {
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
        executionUpdatedAt: null,
        originalIntent: { action: "Policy Activation", policyId: policy.id },
        pipelineStages: [
          { id: "policy-loaded", label: "Policy created and activated", status: "completed", timestamp: policyAuditTimestamp.toISOString() },
          { id: "audit-stored", label: "Audit stored", status: "completed", timestamp: policyAuditTimestamp.toISOString() },
          { id: "casper-proof", label: "Casper decision proof", status: "pending", timestamp: "" },
        ],
        moduleFindings: [{ module: "Policy Enforcement", status: "pass", severity: "info", rule: "Active policy", message: `Policy ${policy.name} activated.`, evidence: { policyId: policy.id }, remediation: "" }],
        primaryReason: `Policy ${policy.name} activated.`,
        triggeredRule: "Active policy",
        suggestedResolution: "No action required.",
        capabilityContext: agent.executionCapabilities,
        proofSubmittedAt: policyAuditTimestamp,
        proofConfirmedAt: null,
        riskScore: 4,
      };
      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();
      const proof = await recordDecisionProof(normalizeAuditLog(auditRow));
      const [recordedAuditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditRow.id))
        .returning();

      return { policy, auditLog: normalizeAuditLog(recordedAuditRow || auditRow), agents: await listAgents(walletAddress) };
    },

    async updatePolicy(id, body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const rows = await db.select().from(policiesTable).where(eq(policiesTable.id, id));
      const current = rows.find((policy) => policy.ownerWalletAddress === walletAddress);
      if (!current) {
        const err = new Error("Policy not found for the connected wallet.");
        err.status = 404;
        throw err;
      }

      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, current.agentId));
      const ownedAgent = agentRows.find((agent) => agent.ownerWalletAddress === walletAddress);
      if (!ownedAgent) {
        const err = new Error("Cannot update policy because this agent is not registered under the connected wallet.");
        err.status = 403;
        throw err;
      }

      const [policyRow] = await db.update(policiesTable)
        .set({
          name: body.name ? String(body.name).trim() : current.name,
          maxTransaction: Number(body.maxTransaction ?? current.maxTransaction),
          dailyLimit: Number(body.dailyLimit ?? current.dailyLimit),
          approvalThreshold: Number(body.approvalThreshold ?? current.approvalThreshold),
          trustedContracts: Array.isArray(body.trustedContracts) ? body.trustedContracts : current.trustedContracts,
          blockedActions: Array.isArray(body.blockedActions) ? body.blockedActions : current.blockedActions,
          riskMode: body.riskMode || current.riskMode,
          status: body.status || current.status,
          templateType: body.templateType || current.templateType || "Custom",
          capabilityScope: Array.isArray(body.capabilityScope) ? normalizeExecutionCapabilities(body.capabilityScope, ownedAgent.type) : current.capabilityScope,
          structuredRules: body.structuredRules && typeof body.structuredRules === "object" ? body.structuredRules : current.structuredRules,
        })
        .where(eq(policiesTable.id, id))
        .returning();

      return { policy: normalizePolicy(policyRow), agents: await listAgents(walletAddress) };
    },

    async analyzeAction(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const [agents, policies, auditLogs, emergencyPauses] = await Promise.all([listAgents(walletAddress), listPolicies(walletAddress), listAuditLogs(walletAddress), listEmergencyPauses(walletAddress, { activeOnly: true })]);
      const [threatIntelligence, oracleValidation, complianceControls] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
        getComplianceControlsSnapshot(),
      ]);
      const result = evaluatePolicy({
        request: {
          ...body,
          walletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          executionWalletAddress: body.executionWalletAddress || body.execution_wallet_address || body.walletAddress,
          agentOwnerWalletAddress: walletAddress,
        },
        agents,
        policies,
        auditLogs,
        emergencyPauses,
        threatIntelligence,
        oracleValidation,
        complianceControls,
      });

      const [reviewRow] = await db.insert(actionReviewsTable).values({
        id: makeId("REV"),
        agentId: body.agentId || "unknown-agent",
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
        createdAt: new Date(),
      }).returning();

      return { result, review: normalizeReview(reviewRow) };
    },

    async createAuditLog(body) {
      const walletAddress = requireWalletAddress(body.walletAddress);
      const agentOwnerWalletAddress = normalizeWalletAddress(body.agentOwnerWalletAddress || walletAddress);
      const executionWalletAddress = normalizeWalletAddress(body.executionWalletAddress || body.execution_wallet_address || body.walletAddress || walletAddress);
      const auditValues = {
        id: body.id || makeId("AUD"),
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
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
        executionUpdatedAt: body.executionUpdatedAt ? new Date(body.executionUpdatedAt) : null,
        originalIntent: body.originalIntent && typeof body.originalIntent === "object" ? body.originalIntent : {},
        pipelineStages: Array.isArray(body.pipelineStages) ? body.pipelineStages : [],
        moduleFindings: Array.isArray(body.moduleFindings) ? body.moduleFindings : [],
        primaryReason: body.primaryReason || body.reason || "Magen3 recorded a decision.",
        triggeredRule: body.triggeredRule || "",
        suggestedResolution: body.suggestedResolution || "",
        capabilityContext: normalizeExecutionCapabilities(body.capabilityContext || []),
        proofSubmittedAt: body.proofSubmittedAt ? new Date(body.proofSubmittedAt) : new Date(),
        proofConfirmedAt: body.proofConfirmedAt ? new Date(body.proofConfirmedAt) : null,
        riskScore: Number(body.riskScore || 50),
      };
      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
        createdAt: undefined,
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();
      const proof = await recordDecisionProof(normalizeAuditLog(auditRow));
      const [updatedRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditRow.id))
        .returning();
      return normalizeAuditLog(updatedRow || auditRow);
    },

    async submitAgentGatewayIntent(body, context = {}) {
      const intent = normalizeAgentGatewayIntent(body);
      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, intent.agentId));
      const agentRecord = agentRows[0];
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
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
        err.status = 401;
        throw err;
      }
      const walletAddress = requireWalletAddress(agentRecord.ownerWalletAddress);
      const executionWalletAddress = normalizeWalletAddress(intent.executionWalletAddress);
      const [agents, policies, auditLogs, emergencyPauses] = await Promise.all([
        listAgents(walletAddress),
        listPolicies(walletAddress),
        listAuditLogs(walletAddress),
        listEmergencyPauses(walletAddress, { activeOnly: true }),
      ]);
      const request = {
        agentId: intent.agentId,
        actionType: intent.actionType,
        amount: intent.amount,
        asset: intent.asset,
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
      const [threatIntelligence, oracleValidation, complianceControls] = await Promise.all([
        getThreatIntelligenceSnapshot(),
        getOracleValidationSnapshot(),
        getComplianceControlsSnapshot(),
      ]);
      const agent = agents.find((item) => item.id === intent.agentId);
      const policy = policies.find((item) => item.agentId === intent.agentId && item.status === "Active");
      let result = evaluatePolicy({ request, agents, policies, auditLogs, emergencyPauses, threatIntelligence, oracleValidation, complianceControls });
      let activatedEmergencyPause = null;
      if (!result.emergencyControlsContext?.active) {
        const trigger = detectAutomaticEmergencyTrigger({ request, agent: agentRecord, policy, auditLogs, result });
        if (trigger) {
          const duplicate = emergencyPauses.find((pause) => pause.agentId === agentRecord.id && pause.scopeType === trigger.scopeType && pause.scopeValue === trigger.scopeValue && pause.triggerRule === trigger.triggerRule);
          if (!duplicate) {
            const normalized = normalizeEmergencyPauseInput({
              body: { ...trigger, reason: trigger.reason, triggerEvidence: trigger.evidence, agentId: trigger.agentId || agentRecord.id },
              ownerWalletAddress: walletAddress,
              agents,
              policies,
              triggerType: "Automatic",
            });
            const { agent: _pauseAgent, policy: _pausePolicy, ...pauseRecord } = normalized;
            const [insertedPause] = await db.insert(emergencyPausesTable).values(pauseDbValues(pauseRecord)).returning();
            activatedEmergencyPause = normalizeEmergencyPause(insertedPause || pauseRecord);
            result = applyAutomaticPauseToResult(result, activatedEmergencyPause);
          }
        }
      }
      const authorizedAmount = result.x402PaymentControlsContext?.amount ?? intent.amount;
      const status = gatewayStatusFromDecision(result.decision);

      const auditTimestamp = new Date();
      const auditValues = {
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
        executionNote: result.decision === "Allowed" ? "Magen3 approved this action. Waiting for the wallet owner to sign the real execution transaction." : "Execution did not proceed because Magen3 did not approve automatic execution.",
        executionUpdatedAt: null,
        originalIntent: {
          source: intent.source,
          agentId: intent.agentId,
          executionWalletAddress,
          goal: intent.goal,
          reason: intent.reason,
          emergencyControl: result.emergencyControlsContext || null,
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
        pipelineStages: intent.actionType === "x402 Payment" ? appendX402PipelineStages(updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp.toISOString(), "Audit stored"), result.decision, auditTimestamp.toISOString()) : updatePipelineStage(result.pipelineStages, "audit-stored", "completed", auditTimestamp.toISOString(), "Audit stored"),
        moduleFindings: result.moduleFindings || [],
        primaryReason: result.primaryReason || result.reason,
        triggeredRule: result.triggeredRule || "",
        suggestedResolution: result.suggestedResolution || result.recommendedAction,
        capabilityContext: result.capabilityContext || agent?.executionCapabilities || ["Custom"],
        proofSubmittedAt: auditTimestamp,
        proofConfirmedAt: null,
        riskScore: Number(result.riskScore || 50),
      };
      const approvalRequest = createApprovalRequest({ auditLog: { ...auditValues, timestamp: auditValues.timestamp.toISOString() }, policy, ownerWalletAddress: walletAddress });
      if (result.decision === "Review Required") {
        const approvalFinding = approvalRequest ? {
          module: "Policy & Approval Controls",
          status: approvalRequest.reviewStatus === "Pending" ? "warning" : "unavailable",
          severity: approvalRequest.reviewStatus === "Pending" ? "medium" : "high",
          rule: "Human approval quorum",
          message: approvalRequest.reviewStatus === "Pending" ? `Execution is paused until ${approvalRequest.requiredApprovals} authorized approval${approvalRequest.requiredApprovals === 1 ? "" : "s"} are recorded.` : "The active policy enables human review but has no eligible approver wallet.",
          evidence: { approvalRequestId: approvalRequest.id, bindingHash: approvalRequest.bindingHash, requiredApprovals: approvalRequest.requiredApprovals, expiresAt: approvalRequest.expiresAt },
          remediation: approvalRequest.reviewStatus === "Pending" ? "Open Policy & Approval Controls, review the exact bound intent, and approve or reject it before expiry." : "Configure at least one authorized approver wallet or enable owner-wallet fallback.",
        } : {
          module: "Policy & Approval Controls",
          status: "unavailable",
          severity: "medium",
          rule: "Human approval workflow",
          message: "The decision requires human review, but the active policy does not enable an approval workflow.",
          evidence: { policyId: policy?.id || "", policyName: policy?.name || "" },
          remediation: "Enable Human Approval & Quorum in the active policy to turn Review Required into a controlled approval workflow.",
        };
        const organizationalFinding = approvalRequest ? approvalOrganizationalFinding(approvalRequest) : null;
        auditValues.moduleFindings = [...(auditValues.moduleFindings || []), approvalFinding, ...(organizationalFinding ? [organizationalFinding] : [])];
        result.moduleFindings = [...(result.moduleFindings || []), approvalFinding, ...(organizationalFinding ? [organizationalFinding] : [])];
        auditValues.pipelineStages = updatePipelineStage(auditValues.pipelineStages, "human-approval", approvalRequest ? "pending" : "skipped", approvalRequest ? auditTimestamp.toISOString() : "", approvalRequest ? "Human approval pending" : "Human approval workflow not configured");
        result.pipelineStages = auditValues.pipelineStages;
      }
      auditValues.approvalRequestId = approvalRequest?.id || "";
      auditValues.approvalStatus = approvalRequest?.reviewStatus || (result.decision === "Review Required" ? "not_configured" : "not_required");
      auditValues.approvalBindingHash = approvalRequest?.bindingHash || "";
      auditValues.approvalRequiredCount = Number(approvalRequest?.requiredApprovals || 0);
      auditValues.approvalReceivedCount = 0;
      auditValues.approvalExpiresAt = approvalRequest?.expiresAt ? new Date(approvalRequest.expiresAt) : null;
      auditValues.approvalResolvedAt = null;
      if (approvalRequest) result.approval = approvalPublicSummary(approvalRequest);

      const initialProof = initialDecisionProofState({
        ...auditValues,
        timestamp: auditValues.timestamp.toISOString(),
      });
      const [auditRow] = await db.insert(auditLogsTable).values({
        ...auditValues,
        decisionProofStatus: initialProof.decisionProofStatus,
        decisionProofPayloadHash: initialProof.decisionProofPayloadHash,
        decisionProofError: initialProof.decisionProofError,
        decisionProofMode: initialProof.decisionProofMode,
        decisionProofUpdatedAt: initialProof.decisionProofUpdatedAt ? new Date(initialProof.decisionProofUpdatedAt) : null,
      }).returning();

      if (approvalRequest) {
        await db.insert(actionReviewsTable).values({
          id: approvalRequest.id,
          agentId: approvalRequest.agentId,
          actionType: approvalRequest.actionType,
          amount: approvalRequest.amount,
          target: approvalRequest.target,
          targetType: approvalRequest.targetType,
          decision: approvalRequest.decision,
          risk: approvalRequest.risk,
          riskScore: approvalRequest.riskScore,
          reason: approvalRequest.reason,
          checksPassed: approvalRequest.checksPassed,
          checksFailed: approvalRequest.checksFailed,
          auditLogId: approvalRequest.auditLogId,
          walletAddress: approvalRequest.walletAddress,
          requesterWalletAddress: approvalRequest.requesterWalletAddress,
          policyId: approvalRequest.policyId,
          policyName: approvalRequest.policyName,
          reviewStatus: approvalRequest.reviewStatus,
          bindingHash: approvalRequest.bindingHash,
          requiredApprovals: approvalRequest.requiredApprovals,
          approverWallets: approvalRequest.approverWallets,
          responses: approvalRequest.responses,
          expiresAt: new Date(approvalRequest.expiresAt),
          resolvedAt: null,
          rejectionReason: approvalRequest.rejectionReason,
          reviewContext: approvalRequest.reviewContext,
          updatedAt: new Date(approvalRequest.updatedAt),
          createdAt: new Date(approvalRequest.createdAt),
        });
      }
      const auditLog = normalizeAuditLog(auditRow);
      const [gatewayRow] = await db.insert(agentGatewayRequestsTable).values({
        id: intent.id,
        receivedAt: new Date(intent.receivedAt),
        source: intent.source,
        agentId: intent.agentId,
        walletAddress,
        agentOwnerWalletAddress: walletAddress,
        executionWalletAddress,
        actionType: intent.actionType,
        amount: authorizedAmount,
        asset: intent.asset,
        target: intent.target,
        targetType: intent.targetType,
        goal: intent.goal,
        reason: intent.reason,
        decision: result.decision,
        risk: result.risk,
        riskScore: Number(result.riskScore || 50),
        status,
        auditLogId: auditLog.id,
      }).returning();
      await db.update(agentsTable)
        .set({ lastIntentAt: new Date(intent.receivedAt), lastDecisionAt: auditValues.timestamp })
        .where(eq(agentsTable.id, intent.agentId));
      const proof = await recordDecisionProof(auditLog);
      const [recordedAuditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : null,
          pipelineStages: updatePipelineStage(auditRow.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, auditLog.id))
        .returning();
      const recordedAuditLog = normalizeAuditLog(recordedAuditRow || auditRow);

      const gatewayRequest = {
        id: gatewayRow.id,
        receivedAt: toDate(gatewayRow.receivedAt).toISOString(),
        source: gatewayRow.source,
        agentId: gatewayRow.agentId,
        walletAddress: gatewayRow.walletAddress,
        agentOwnerWalletAddress: gatewayRow.agentOwnerWalletAddress || gatewayRow.walletAddress,
        executionWalletAddress: gatewayRow.executionWalletAddress || gatewayRow.walletAddress,
        actionType: gatewayRow.actionType,
        amount: Number(gatewayRow.amount),
        asset: gatewayRow.asset,
        outputAsset: intent.outputAsset,
        oracleBaseAsset: intent.oracleBaseAsset,
        oracleQuoteAsset: intent.oracleQuoteAsset,
        executionPrice: intent.executionPrice,
        quoteTimestamp: intent.quoteTimestamp,
        target: gatewayRow.target,
        targetType: gatewayRow.targetType,
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
        runtimeArgs: intent.runtimeArgs,
        transactionHash: intent.transactionHash,
        lifecycleIntentId: intent.lifecycleIntentId,
        lifecycleIdempotencyKey: intent.lifecycleIdempotencyKey,
        lifecycleSequence: intent.lifecycleSequence,
        lifecycleCreatedAt: intent.lifecycleCreatedAt,
        lifecycleExpiresAt: intent.lifecycleExpiresAt,
        lifecycleRetryOf: intent.lifecycleRetryOf,
        lifecycleReplacementOf: intent.lifecycleReplacementOf,
        lifecycleAttempt: intent.lifecycleAttempt,
        lifecycleIntentFingerprint: result.executionIntegrityContext?.fingerprint || intent.lifecycleIntentFingerprint,
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
        x402RequestFingerprint: result.x402PaymentControlsContext?.requestFingerprint || intent.x402RequestFingerprint,
        x402SettlementStatus: intent.x402SettlementStatus,
        x402SettlementAttempt: intent.x402SettlementAttempt,
        x402SettlementTxHash: intent.x402SettlementTxHash,
        goal: gatewayRow.goal,
        reason: gatewayRow.reason,
        decision: gatewayRow.decision,
        risk: gatewayRow.risk,
        riskScore: Number(gatewayRow.riskScore),
        status: gatewayRow.status,
        auditLogId: gatewayRow.auditLogId,
      };

      return {
        ok: true,
        gatewayRequest,
        result,
        auditLog: recordedAuditLog,
        casperPayload: buildAuditDecisionPayload(recordedAuditLog),
        executionApproved: result.decision === "Allowed",
        approval: approvalRequest ? approvalPublicSummary(approvalRequest) : null,
        emergencyPause: activatedEmergencyPause ? publicEmergencyPause(activatedEmergencyPause) : null,
        nextAction: approvalRequest ? `Review Required. ${approvalRequest.requiredApprovals} authorized approval${approvalRequest.requiredApprovals === 1 ? "" : "s"} must be recorded before signing.` : gatewayNextAction(result.decision),
      };
    },

    async listEmergencyPauses(walletAddress) {
      const ownerWalletAddress = requireWalletAddress(walletAddress);
      return { emergencyPauses: await listEmergencyPauses(ownerWalletAddress) };
    },

    async emergencyControlsStatus(walletAddress = "") {
      const ownerWalletAddress = normalizeWalletAddress(walletAddress);
      const pauses = ownerWalletAddress ? await listEmergencyPauses(ownerWalletAddress) : [];
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
      const [agents, policies, activePauses] = await Promise.all([
        listAgents(ownerWalletAddress),
        listPolicies(ownerWalletAddress),
        listEmergencyPauses(ownerWalletAddress, { activeOnly: true }),
      ]);
      const normalized = normalizeEmergencyPauseInput({ body, ownerWalletAddress, agents, policies, triggerType: body.triggerType || "Manual" });
      const { agent, policy, ...pauseRecord } = normalized;
      const duplicate = activePauses.find((pause) => pause.scopeType === pauseRecord.scopeType && pause.scopeValue === pauseRecord.scopeValue && pause.agentId === pauseRecord.agentId && pause.policyId === pauseRecord.policyId);
      if (duplicate) {
        const err = new Error(`An active ${pauseRecord.scopeType} emergency pause already covers this scope.`);
        err.status = 409;
        throw err;
      }
      const [row] = await db.insert(emergencyPausesTable).values(pauseDbValues(pauseRecord)).returning();
      const emergencyPause = normalizeEmergencyPause(row || pauseRecord);
      const auditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: emergencyPause, agent, policy, event: "activated" }));
      return { emergencyPause, auditLog };
    },

    async resumeEmergencyPause(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.resumedByWallet);
      const rows = await db.select().from(emergencyPausesTable).where(eq(emergencyPausesTable.id, id));
      let pause = rows[0] ? normalizeEmergencyPause(rows[0]) : null;
      if (!pause || normalizeWalletAddress(pause.ownerWalletAddress).toLowerCase() !== walletAddress.toLowerCase()) {
        const err = new Error("Emergency pause not found for the connected wallet.");
        err.status = 404;
        throw err;
      }
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
      const [agents, policies] = await Promise.all([listAgents(pause.ownerWalletAddress), listPolicies(pause.ownerWalletAddress)]);
      const pauseAgent = agents.find((item) => item.id === pause.agentId) || null;
      const pausePolicy = policies.find((item) => item.id === pause.policyId) || null;
      if (pause.resumeRequiresApproval) {
        if (pause.resumeApprovalRequestId) {
          const reviewRows = await db.select().from(actionReviewsTable).where(eq(actionReviewsTable.id, pause.resumeApprovalRequestId));
          const review = reviewRows[0] ? await refreshReview(normalizeReview(reviewRows[0])) : null;
          const auditRows = review?.auditLogId ? await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, review.auditLogId)) : [];
          return { emergencyPause: pause, approval: review ? approvalPublicSummary(review) : null, auditLog: auditRows[0] ? normalizeAuditLog(auditRows[0]) : null };
        }
        const pendingPause = { ...pause, pendingResumeReason: resumeReason };
        const { approval, auditLog } = createEmergencyResumeApproval({ pause: pendingPause, policy: pausePolicy || {}, agent: pauseAgent, ownerWalletAddress: pause.ownerWalletAddress });
        if (!approval) {
          const err = new Error("Emergency resume approval could not be created. Configure eligible resume authority wallets.");
          err.status = 409;
          throw err;
        }
        const storedApproval = await insertApprovalReview(approval);
        const [pauseRow] = await db.update(emergencyPausesTable).set({
          resumeApprovalRequestId: storedApproval.id,
          triggerEvidence: { ...(pause.triggerEvidence || {}), pendingResumeReason: resumeReason },
          updatedAt: new Date(),
        }).where(eq(emergencyPausesTable.id, pause.id)).returning();
        const recordedAudit = await persistEmergencyAudit(auditLog);
        return { emergencyPause: normalizeEmergencyPause(pauseRow), approval: approvalPublicSummary(storedApproval), auditLog: recordedAudit };
      }
      const now = new Date();
      const [pauseRow] = await db.update(emergencyPausesTable).set({
        status: "Resumed",
        resumedByWallet: walletAddress,
        resumeReason,
        resumedAt: now,
        updatedAt: now,
      }).where(eq(emergencyPausesTable.id, pause.id)).returning();
      const resumed = normalizeEmergencyPause(pauseRow);
      const auditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: resumed, agent: pauseAgent, policy: pausePolicy, event: "resumed" }));
      return { emergencyPause: resumed, auditLog };
    },

    async listApprovals(walletAddress) {
      return { approvals: await listApprovals(requireWalletAddress(walletAddress)) };
    },

    async createApprovalChallenge(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.reviewerWallet || body.approverWalletAddress);
      const reviewRows = await db.select().from(actionReviewsTable).where(eq(actionReviewsTable.id, id));
      if (!reviewRows[0]) {
        const err = new Error("Approval request not found");
        err.status = 404;
        throw err;
      }
      const review = await refreshReview(normalizeReview(reviewRows[0]));
      const now = new Date();
      const existing = await db.select().from(approvalSignatureChallengesTable).where(and(
        eq(approvalSignatureChallengesTable.approvalRequestId, id),
        eq(approvalSignatureChallengesTable.reviewerWallet, walletAddress),
        eq(approvalSignatureChallengesTable.status, "Pending"),
      ));
      for (const row of existing) {
        const refreshed = expireApprovalSignatureChallenge(normalizeApprovalSignatureChallenge(row), now);
        await db.update(approvalSignatureChallengesTable).set({
          status: refreshed.status === "Pending" ? "Superseded" : refreshed.status,
          verificationError: refreshed.status === "Pending" ? "A newer one-time challenge was issued." : refreshed.verificationError,
          updatedAt: now,
        }).where(eq(approvalSignatureChallengesTable.id, row.id));
      }
      const challenge = createApprovalSignatureChallenge({
        review,
        input: { ...body, walletAddress },
        now,
        chainName: String(review.reviewContext?.approvalSignatureChainName || "").trim(),
      });
      const [stored] = await db.insert(approvalSignatureChallengesTable).values({
        id: challenge.id,
        approvalRequestId: challenge.approvalRequestId,
        auditLogId: challenge.auditLogId,
        agentId: challenge.agentId,
        approvalBindingHash: challenge.approvalBindingHash,
        response: challenge.response,
        reviewerWallet: challenge.reviewerWallet,
        nonce: challenge.nonce,
        issuedAt: new Date(challenge.issuedAt),
        expiresAt: new Date(challenge.expiresAt),
        domain: challenge.domain,
        chainName: challenge.chainName,
        message: challenge.message,
        challengeHash: challenge.challengeHash,
        status: challenge.status,
        usedAt: null,
        signatureHash: "",
        signatureAlgorithm: "",
        signatureVerified: false,
        verificationError: "",
        createdAt: now,
        updatedAt: now,
      }).returning();
      return { challenge: approvalSignatureChallengePublicSummary(normalizeApprovalSignatureChallenge(stored)), approval: approvalPublicSummary(review) };
    },

    async respondApproval(id, body = {}) {
      const walletAddress = requireWalletAddress(body.walletAddress || body.approverWalletAddress);
      const rows = await db.select().from(actionReviewsTable).where(eq(actionReviewsTable.id, id));
      if (!rows[0]) {
        const err = new Error("Approval request not found");
        err.status = 404;
        throw err;
      }
      const currentReview = await refreshReview(normalizeReview(rows[0]));
      let signatureVerification = null;
      let verifiedChallenge = null;
      if (currentReview.reviewContext?.requireCryptographicReviewerSignature === true) {
        const challengeId = String(body.challengeId || body.signatureChallengeId || "").trim();
        const challengeRows = challengeId ? await db.select().from(approvalSignatureChallengesTable).where(eq(approvalSignatureChallengesTable.id, challengeId)) : [];
        if (!challengeRows[0]) {
          const err = new Error("A valid one-time approval signature challenge is required.");
          err.status = 400;
          throw err;
        }
        verifiedChallenge = verifyApprovalSignatureChallenge({
          challenge: normalizeApprovalSignatureChallenge(challengeRows[0]),
          review: currentReview,
          input: { ...body, walletAddress },
        });
        signatureVerification = verifiedChallenge.verification;
      }
      const updated = respondToApproval(currentReview, { ...body, walletAddress, signatureVerification });
      if (verifiedChallenge) {
        const [claimed] = await db.update(approvalSignatureChallengesTable).set({
          status: "Used",
          usedAt: new Date(verifiedChallenge.challenge.usedAt),
          signatureHash: verifiedChallenge.challenge.signatureHash,
          signatureAlgorithm: verifiedChallenge.challenge.signatureAlgorithm,
          signatureVerified: true,
          verificationError: "",
          updatedAt: new Date(verifiedChallenge.challenge.usedAt),
        }).where(and(
          eq(approvalSignatureChallengesTable.id, verifiedChallenge.challenge.id),
          eq(approvalSignatureChallengesTable.status, "Pending"),
        )).returning();
        if (!claimed) {
          const err = new Error("Approval signature challenge was already used or superseded.");
          err.status = 409;
          throw err;
        }
      }
      const approval = await persistReview(updated);
      let resumedPause = null;
      let resumeAuditLog = null;
      if (approval.reviewStatus === "Approved" && approval.reviewContext?.kind === "emergency-pause-resume") {
        const pauseId = String(approval.reviewContext.emergencyPauseId || "").trim();
        const pauseRows = pauseId ? await db.select().from(emergencyPausesTable).where(eq(emergencyPausesTable.id, pauseId)) : [];
        const activePause = pauseRows[0] && pauseRows[0].status === "Active" ? normalizeEmergencyPause(pauseRows[0]) : null;
        if (activePause) {
          const now = new Date();
          const [pauseRow] = await db.update(emergencyPausesTable).set({
            status: "Resumed",
            resumedByWallet: walletAddress,
            resumeReason: String(approval.reviewContext.requestedResumeReason || "Emergency resume quorum approved.").trim(),
            resumedAt: now,
            updatedAt: now,
          }).where(eq(emergencyPausesTable.id, activePause.id)).returning();
          resumedPause = normalizeEmergencyPause(pauseRow);
          const [agents, policies] = await Promise.all([listAgents(resumedPause.ownerWalletAddress), listPolicies(resumedPause.ownerWalletAddress)]);
          const pauseAgent = agents.find((item) => item.id === resumedPause.agentId) || null;
          const pausePolicy = policies.find((item) => item.id === resumedPause.policyId) || null;
          resumeAuditLog = await persistEmergencyAudit(buildEmergencyAuditLog({ pause: resumedPause, agent: pauseAgent, policy: pausePolicy, event: "resumed" }));
        }
      }
      const auditRows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, approval.auditLogId));
      return { approval: approvalPublicSummary(approval), auditLog: auditRows[0] ? normalizeAuditLog(auditRows[0]) : null, emergencyPause: resumedPause, resumeAuditLog };
    },

    async getAgentApproval(id, body = {}, context = {}) {
      const agentId = String(body.agentId || body.agent_id || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required");
        err.status = 400;
        throw err;
      }
      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
      const agentRecord = agentRows[0];
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
      if (!secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway API key is missing or does not match this connected agent.");
        err.status = 401;
        throw err;
      }
      const rows = await db.select().from(actionReviewsTable).orderBy(desc(actionReviewsTable.createdAt));
      const row = rows.find((item) => (item.id === id || item.auditLogId === id) && item.agentId === agentRecord.id);
      if (!row) {
        const err = new Error("Approval request not found for this connected agent");
        err.status = 404;
        throw err;
      }
      const approval = await refreshReview(normalizeReview(row));
      return { ok: true, approval: approvalPublicSummary(approval) };
    },

    async approvalStatus(walletAddress) {
      const approvals = await listApprovals(walletAddress);
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
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      if (rows.length === 0) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const auditLog = normalizeAuditLog(rows[0]);
      return { auditLog, ...buildAuditDecisionPayload(auditLog) };
    },

    async confirmCasperDeploy(id, body) {
      const txHash = validateDeployHash(body?.deployHash);
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const now = new Date();
      const [auditRow] = await db.update(auditLogsTable)
        .set({
          txHash,
          decisionProofStatus: "recorded",
          decisionProofError: "",
          decisionProofUpdatedAt: now,
          proofConfirmedAt: now,
          pipelineStages: updatePipelineStage(current.pipelineStages, "casper-proof", "completed", now.toISOString(), "Casper decision proof confirmed"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();

      return { auditLog: normalizeAuditLog(auditRow), txHash, confirmed: true };
    },

    async confirmExecutionDeploy(id, body) {
      const executionTxHash = validateDeployHash(body?.deployHash || body?.executionTxHash);
      const executionSignedBy = normalizeWalletAddress(body?.signedBy || body?.walletAddress || "");
      const executionNote = String(body?.note || "Real execution transaction signed after Magen3 approval.").trim();

      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const executionAgentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, current.agentId));
      const executionAgent = executionAgentRows[0] ? normalizeAgent(executionAgentRows[0]) : null;
      const executionPolicies = executionAgent ? await listPolicies(executionAgent.ownerWalletAddress) : [];
      const executionPolicy = executionPolicies.find((item) => item.agentId === current.agentId && item.status === "Active") || null;
      if (executionAgent && executionPolicy) {
        const activePauses = await listEmergencyPauses(current.agentOwnerWalletAddress || current.walletAddress, { activeOnly: true });
        const emergency = evaluateEmergencyControls({
          request: {
            agentId: current.agentId,
            actionType: current.action,
            target: current.target,
            targetType: current.targetType,
            tokenPermissionMetadataSupplied: Boolean(current.originalIntent?.action?.tokenPermission),
            privilegedActionMetadataSupplied: Boolean(current.originalIntent?.action?.privilegedAction),
          },
          agent: executionAgent,
          policy: executionPolicy,
          pauses: activePauses,
        });
        if (emergency.hardBlock || emergency.needsReview) {
          const err = new Error("Execution cannot be recorded while an active Emergency Circuit Breaker pause applies to this authorized intent.");
          err.status = 409;
          throw err;
        }
      }
      let approvedAfterReview = false;
      if (current.decision === "Review Required" && current.approvalRequestId) {
        const reviewRows = await db.select().from(actionReviewsTable).where(eq(actionReviewsTable.id, current.approvalRequestId));
        const review = reviewRows[0] ? await refreshReview(normalizeReview(reviewRows[0])) : null;
        approvedAfterReview = approvalExecutionAuthorized(review);
      }
      if (current.decision !== "Allowed" && !approvedAfterReview) {
        const err = new Error("Execution hash can only be attached to an Allowed decision or a Review Required decision with a current completed approval quorum.");
        err.status = 400;
        throw err;
      }

      const [auditRow] = await db.update(auditLogsTable)
        .set({
          executionStatus: "executed",
          executionTxHash,
          executionSignedBy,
          executionNote,
          executionUpdatedAt: new Date(),
          pipelineStages: updatePipelineStage(current.pipelineStages, "execution-recorded", "completed", new Date().toISOString(), "Execution recorded"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();

      return { auditLog: normalizeAuditLog(auditRow), executionTxHash, confirmed: true };
    },


    async updateX402Settlement(id, body, context = {}) {
      let update = normalizeX402SettlementUpdate(body);
      const agentId = String(body?.agentId || "").trim();
      if (!agentId) {
        const err = new Error("agentId is required for x402 settlement updates");
        err.status = 400;
        throw err;
      }
      const agentRows = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
      const agentRecord = agentRows[0];
      if (!agentRecord || agentRecord.status === "Revoked" || !secretMatches(context.apiKey, agentRecord.apiKeyHash)) {
        const err = new Error("Agent Gateway credentials are invalid for this settlement update");
        err.status = agentRecord ? 401 : 404;
        throw err;
      }
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current || current.agentId !== agentRecord.id) {
        const err = new Error("x402 audit log not found for this connected agent");
        err.status = 404;
        throw err;
      }
      if (current.action !== "x402 Payment" || current.decision !== "Allowed") {
        const err = new Error("Settlement can only be reported for an Allowed x402 Payment decision");
        err.status = 400;
        throw err;
      }
      const currentIntent = current.originalIntent && typeof current.originalIntent === "object" ? current.originalIntent : {};
      const currentAction = currentIntent.action && typeof currentIntent.action === "object" ? currentIntent.action : {};
      const currentX402 = currentAction.x402 && typeof currentAction.x402 === "object" ? currentAction.x402 : {};
      const expectedFingerprint = String(currentX402.requestFingerprint || "").toLowerCase();
      if (!expectedFingerprint || expectedFingerprint !== update.requestFingerprint.toLowerCase()) {
        const err = new Error("Settlement requestFingerprint does not match the authorized x402 payment");
        err.status = 400;
        throw err;
      }
      const policyRows = await db.select().from(policiesTable).where(eq(policiesTable.agentId, agentRecord.id));
      const activePolicy = policyRows.find((item) => item.status === "Active");
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
      const nextIntent = {
        ...currentIntent,
        action: {
          ...currentAction,
          x402: {
            ...currentX402,
            settlementStatus: update.status,
            settlementAttempt: update.attempt,
            settlementTxHash: update.transactionHash,
            settlement: update,
          },
        },
      };
      const [auditRow] = await db.update(auditLogsTable)
        .set({
          originalIntent: nextIntent,
          executionStatus: `x402_${update.status}`,
          executionTxHash: update.transactionHash || current.executionTxHash || "",
          executionNote: update.note || `x402 settlement reported as ${update.status}.`,
          executionUpdatedAt: new Date(update.updatedAt),
          pipelineStages: updatePipelineStage(
            updatePipelineStage(current.pipelineStages, "x402-settlement", settlementStageStatus, update.updatedAt, `x402 settlement: ${update.status}`),
            "x402-resource-delivery",
            deliveryStageStatus,
            update.resourceDelivered ? update.updatedAt : "",
            update.resourceDelivered ? "Paid resource delivered" : "Paid resource delivery"
          ),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();
      return { ok: true, auditLog: normalizeAuditLog(auditRow), settlement: update };
    },

    async recordAuditLog(id) {
      const rows = await db.select().from(auditLogsTable).where(eq(auditLogsTable.id, id));
      const current = rows[0];
      if (!current) {
        const err = new Error("Audit log not found");
        err.status = 404;
        throw err;
      }
      const proof = await recordDecisionProof(normalizeAuditLog(current));
      const [auditRow] = await db.update(auditLogsTable)
        .set({
          ...(proof.txHash ? { txHash: proof.txHash } : {}),
          decisionProofStatus: proof.decisionProofStatus,
          decisionProofPayloadHash: proof.decisionProofPayloadHash,
          decisionProofError: proof.decisionProofError,
          decisionProofMode: proof.decisionProofMode,
          decisionProofUpdatedAt: proof.decisionProofUpdatedAt ? new Date(proof.decisionProofUpdatedAt) : new Date(),
          proofSubmittedAt: current.proofSubmittedAt || new Date(),
          proofConfirmedAt: proof.decisionProofStatus === "recorded" ? new Date(proof.decisionProofUpdatedAt || Date.now()) : current.proofConfirmedAt,
          pipelineStages: updatePipelineStage(current.pipelineStages, "casper-proof", proof.decisionProofStatus === "recorded" ? "completed" : proof.decisionProofStatus === "failed" ? "failed" : "pending", proof.decisionProofUpdatedAt || new Date().toISOString(), "Casper decision proof"),
        })
        .where(eq(auditLogsTable.id, id))
        .returning();
      const auditLog = normalizeAuditLog(auditRow);
      return { auditLog, txHash: auditLog.txHash, decisionProofStatus: auditLog.decisionProofStatus };
    },
  };
}
