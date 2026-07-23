import { createHash } from "node:crypto";
import { makeId } from "./ids.mjs";

const FINAL_STATUSES = new Set(["Rejected", "Expired", "Cancelled"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeWallet(value) {
  return clean(value).toLowerCase();
}

function boolRule(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "yes" || value.toLowerCase() === "true";
  return fallback;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function computeApprovalBindingHash(auditLog = {}) {
  const payload = canonicalize({
    auditLogId: clean(auditLog.id),
    agentId: clean(auditLog.agentId),
    action: clean(auditLog.action),
    amount: Number(auditLog.amount || 0),
    target: clean(auditLog.target),
    targetType: clean(auditLog.targetType),
    executionWalletAddress: clean(auditLog.executionWalletAddress || auditLog.walletAddress),
    policyUsed: clean(auditLog.policyUsed),
    originalIntent: auditLog.originalIntent && typeof auditLog.originalIntent === "object" ? auditLog.originalIntent : {},
  });
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export function normalizeApprovalPolicy(policy = {}, ownerWalletAddress = "") {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const enabled = boolRule(rules.approvalWorkflowEnabled, false);
  const allowOwnerFallback = boolRule(rules.approvalAllowOwnerFallback, true);
  const configuredApprovers = Array.isArray(rules.approvalApproverWallets)
    ? rules.approvalApproverWallets.map(clean).filter(Boolean)
    : [];
  const fallback = allowOwnerFallback && clean(ownerWalletAddress) ? [clean(ownerWalletAddress)] : [];
  const approverWallets = [...new Map([...configuredApprovers, ...fallback].map((wallet) => [normalizeWallet(wallet), wallet])).values()];
  const requestedMode = clean(rules.approvalWorkflowMode).toLowerCase();
  const mode = requestedMode === "quorum" ? "Quorum" : "Single";
  const requestedCount = mode === "Single" ? 1 : boundedInteger(rules.approvalRequiredCount, 2, 2, 10);
  const requiredApprovals = approverWallets.length > 0 ? Math.min(requestedCount, approverWallets.length) : requestedCount;
  return {
    enabled,
    mode,
    requiredApprovals,
    approverWallets,
    expiryMinutes: boundedInteger(rules.approvalExpiryMinutes, 60, 5, 10080),
    separationOfDuties: boolRule(rules.approvalSeparationOfDuties, false),
    requireRejectComment: boolRule(rules.approvalRequireRejectComment, true),
    allowOwnerFallback,
  };
}

export function createApprovalRequest({ auditLog, policy, ownerWalletAddress, now = new Date() }) {
  const config = normalizeApprovalPolicy(policy, ownerWalletAddress);
  if (!config.enabled || auditLog?.decision !== "Review Required") return null;
  const createdAt = now instanceof Date ? now : new Date(now);
  const expiresAt = new Date(createdAt.getTime() + config.expiryMinutes * 60_000);
  const status = config.approverWallets.length === 0 ? "Configuration Required" : "Pending";
  return {
    id: makeId("APR"),
    auditLogId: clean(auditLog.id),
    agentId: clean(auditLog.agentId),
    actionType: clean(auditLog.action),
    amount: Number(auditLog.amount || 0),
    target: clean(auditLog.target),
    targetType: clean(auditLog.targetType),
    decision: clean(auditLog.decision || "Review Required"),
    risk: clean(auditLog.risk || "Medium"),
    riskScore: Number(auditLog.riskScore || 50),
    reason: clean(auditLog.primaryReason || auditLog.reason),
    checksPassed: [],
    checksFailed: [],
    walletAddress: clean(ownerWalletAddress || auditLog.agentOwnerWalletAddress || auditLog.walletAddress),
    requesterWalletAddress: clean(auditLog.executionWalletAddress || auditLog.walletAddress),
    policyId: clean(policy?.id),
    policyName: clean(policy?.name || auditLog.policyUsed),
    reviewStatus: status,
    bindingHash: computeApprovalBindingHash(auditLog),
    requiredApprovals: config.requiredApprovals,
    approverWallets: config.approverWallets,
    responses: [],
    expiresAt: expiresAt.toISOString(),
    resolvedAt: "",
    rejectionReason: "",
    reviewContext: {
      mode: config.mode,
      separationOfDuties: config.separationOfDuties,
      requireRejectComment: config.requireRejectComment,
      capabilityContext: Array.isArray(auditLog.capabilityContext) ? auditLog.capabilityContext : [],
      triggeredRule: clean(auditLog.triggeredRule),
      suggestedResolution: clean(auditLog.suggestedResolution),
    },
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
}

export function expireApproval(review, now = new Date()) {
  if (!review || FINAL_STATUSES.has(review.reviewStatus) || review.reviewStatus === "Configuration Required") return review;
  const current = now instanceof Date ? now : new Date(now);
  const expiresAt = new Date(review.expiresAt || 0);
  if (Number.isNaN(expiresAt.getTime()) || current <= expiresAt) return review;
  return {
    ...review,
    reviewStatus: "Expired",
    resolvedAt: current.toISOString(),
    updatedAt: current.toISOString(),
  };
}

export function respondToApproval(review, input = {}, now = new Date()) {
  const current = expireApproval(review, now);
  if (!current) {
    const error = new Error("Approval request not found");
    error.status = 404;
    throw error;
  }
  if (current.reviewStatus !== "Pending") {
    const error = new Error(`Approval request is ${current.reviewStatus.toLowerCase()} and cannot accept another response.`);
    error.status = 409;
    throw error;
  }
  const walletAddress = clean(input.walletAddress || input.approverWalletAddress);
  const normalizedWallet = normalizeWallet(walletAddress);
  const eligible = (current.approverWallets || []).some((wallet) => normalizeWallet(wallet) === normalizedWallet);
  if (!walletAddress || !eligible) {
    const error = new Error("Connected wallet is not an authorized approver for this request.");
    error.status = 403;
    throw error;
  }
  if (current.reviewContext?.separationOfDuties && normalizedWallet === normalizeWallet(current.requesterWalletAddress)) {
    const error = new Error("Separation of duties prevents the execution wallet from approving its own request.");
    error.status = 403;
    throw error;
  }
  if ((current.responses || []).some((response) => normalizeWallet(response.walletAddress) === normalizedWallet)) {
    const error = new Error("This approver has already responded to the request.");
    error.status = 409;
    throw error;
  }
  const responseDecision = clean(input.response || input.decision).toLowerCase();
  if (!new Set(["approve", "approved", "reject", "rejected"]).has(responseDecision)) {
    const error = new Error("response must be Approve or Reject");
    error.status = 400;
    throw error;
  }
  const comment = clean(input.comment);
  const isReject = responseDecision.startsWith("reject");
  if (isReject && current.reviewContext?.requireRejectComment && !comment) {
    const error = new Error("A rejection comment is required by the active policy.");
    error.status = 400;
    throw error;
  }
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  const responses = [...(current.responses || []), {
    walletAddress,
    response: isReject ? "Rejected" : "Approved",
    comment,
    timestamp,
  }];
  const approvalsReceived = responses.filter((response) => response.response === "Approved").length;
  const reviewStatus = isReject ? "Rejected" : approvalsReceived >= Number(current.requiredApprovals || 1) ? "Approved" : "Pending";
  return {
    ...current,
    responses,
    reviewStatus,
    resolvedAt: reviewStatus === "Pending" ? "" : timestamp,
    rejectionReason: isReject ? comment : current.rejectionReason || "",
    updatedAt: timestamp,
  };
}

export function approvalExecutionAuthorized(review, now = new Date()) {
  const current = expireApproval(review, now);
  return Boolean(current && current.reviewStatus === "Approved" && new Date(current.expiresAt).getTime() >= (now instanceof Date ? now : new Date(now)).getTime());
}

export function approvalPublicSummary(review, now = new Date()) {
  const current = expireApproval(review, now);
  if (!current) return null;
  const approvalsReceived = (current.responses || []).filter((response) => response.response === "Approved").length;
  return {
    ...current,
    approvalsReceived,
    remainingApprovals: Math.max(0, Number(current.requiredApprovals || 1) - approvalsReceived),
    mayProceedToSigning: approvalExecutionAuthorized(current, now),
  };
}
