import { createHash } from "node:crypto";

const STATES = new Set([
  "not_submitted",
  "submitted",
  "pending",
  "confirmed",
  "failed",
  "uncertain",
  "replaced",
  "refunded",
  "delivered",
]);
const RETRY_ACTIONS = new Set(["Review", "Block"]);
const HASH_PATTERN = /^(?:(?:0x|transaction-hash-|deploy-hash-)?[a-fA-F0-9]{64}|[1-9A-HJ-NP-Za-km-z]{32,128})$/;
const TERMINAL_STATES = new Set(["confirmed", "delivered", "refunded"]);
const UNRESOLVED_STATES = new Set(["submitted", "pending", "uncertain"]);

function clean(value) {
  return String(value ?? "").trim();
}

function integer(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function iso(value, field, fallback = "") {
  const raw = clean(value);
  if (!raw) return fallback;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${field} must be a valid ISO-8601 timestamp`);
    error.status = 400;
    throw error;
  }
  return new Date(parsed).toISOString();
}

function statusError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function comparableTransactionId(value) {
  const raw = clean(value);
  const normalizedHex = raw.replace(/^(?:0x|transaction-hash-|deploy-hash-)/i, "");
  return /^[a-f0-9]{64}$/i.test(normalizedHex) ? normalizedHex.toLowerCase() : raw.toLowerCase();
}

export function normalizeReconciliationState(value) {
  const state = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (!state) return "not_submitted";
  if (["approved_pending_signature", "review_approved_pending_signature", "review_required_not_submitted", "blocked_not_submitted", "not_required"].includes(state)) return "not_submitted";
  if (["broadcast", "broadcasted"].includes(state)) return "submitted";
  if (["processing", "confirming"].includes(state)) return "pending";
  if (["executed", "recorded", "settled", "success", "finalized", "x402_confirmed"].includes(state)) return "confirmed";
  if (["reverted", "dropped", "rejected", "x402_failed"].includes(state)) return "failed";
  if (["unknown", "x402_uncertain"].includes(state)) return "uncertain";
  if (["x402_submitted"].includes(state)) return "submitted";
  if (["x402_pending"].includes(state)) return "pending";
  return STATES.has(state) ? state : "not_submitted";
}

export function reconciliationPolicy(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: rules.reconciliationEnabled !== false,
    maximumSubmissionAttempts: integer(rules.maximumSubmissionAttempts, 3, { min: 1, max: 100 }),
    pendingRetryAction: RETRY_ACTIONS.has(rules.pendingRetryAction) ? rules.pendingRetryAction : "Block",
    uncertainRetryAction: RETRY_ACTIONS.has(rules.uncertainRetryAction) ? rules.uncertainRetryAction : "Block",
    requiredConfirmations: integer(rules.requiredConfirmations, 1, { min: 1, max: 10_000 }),
    finalityTimeoutSeconds: integer(rules.finalityTimeoutSeconds, 3600, { min: 30, max: 2_592_000 }),
    replacementAllowed: rules.replacementAllowed !== false,
    resourceDeliveryRequired: rules.resourceDeliveryRequired === true,
  };
}

export function normalizeReconciliationUpdate(body = {}, now = new Date()) {
  const status = normalizeReconciliationState(body.status || body.executionStatus || body.settlementStatus);
  if (!STATES.has(status) || status === "not_submitted") {
    throw statusError("Reconciliation status must be submitted, pending, confirmed, failed, uncertain, replaced, refunded, or delivered");
  }
  const transactionHash = clean(body.transactionHash || body.executionTxHash || body.deployHash);
  const replacementTransactionHash = clean(body.replacementTransactionHash || body.replacedByTransactionHash || body.replacementTxHash);
  const refundTransactionHash = clean(body.refundTransactionHash || body.refundTxHash);
  for (const [label, value] of [["transactionHash", transactionHash], ["replacementTransactionHash", replacementTransactionHash], ["refundTransactionHash", refundTransactionHash]]) {
    if (value && !HASH_PATTERN.test(value)) throw statusError(`${label} is not a supported transaction identifier`);
  }
  if (["submitted", "pending", "confirmed", "delivered"].includes(status) && !transactionHash && !clean(body.preserveTransactionHash)) {
    // Existing transaction identity can be inherited during transition merging.
  }
  const observedAt = iso(body.observedAt || body.updatedAt, "observedAt", now.toISOString());
  const attempt = integer(body.attempt ?? body.submissionAttempt ?? body.submissionAttemptCount, 1, { min: 1, max: 100 });
  const confirmations = integer(body.confirmations, 0, { min: 0, max: 10_000_000 });
  const blockHeight = body.blockHeight === undefined || body.blockHeight === null || body.blockHeight === "" ? null : integer(body.blockHeight, null, { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (blockHeight === null && body.blockHeight !== undefined && body.blockHeight !== null && body.blockHeight !== "") throw statusError("blockHeight must be a non-negative integer");
  const resourceDelivered = bool(body.resourceDelivered, status === "delivered");
  if (status === "delivered" && !resourceDelivered) throw statusError("Delivered status requires resourceDelivered=true");
  if (status === "replaced" && !replacementTransactionHash) throw statusError("Replaced status requires replacementTransactionHash");
  if (status === "refunded" && !refundTransactionHash && !transactionHash) throw statusError("Refunded status requires refundTransactionHash or transactionHash");
  const failureReason = clean(body.failureReason || body.error || body.reason);
  if (status === "failed" && !failureReason) throw statusError("Failed status requires failureReason");
  const provider = clean(body.provider || body.rpcProvider || body.facilitator || body.bridgeProvider).slice(0, 160);
  const providerReference = clean(body.providerReference || body.facilitatorReference || body.routeId || body.messageId).slice(0, 256);
  const deliveryReference = clean(body.deliveryReference || body.resourceReference).slice(0, 256);
  const note = clean(body.note).slice(0, 1000);
  const chainName = clean(body.chainName || body.network).slice(0, 128);
  return {
    status,
    transactionHash,
    replacementTransactionHash,
    refundTransactionHash,
    attempt,
    confirmations,
    finalized: bool(body.finalized || body.finalityReached, false),
    blockHeight,
    observedAt,
    provider,
    providerReference,
    resourceDelivered,
    deliveryReference,
    failureReason,
    note,
    chainName,
  };
}

function currentRecord(auditLog = {}) {
  const reconciliation = auditLog.executionReconciliation && typeof auditLog.executionReconciliation === "object" ? auditLog.executionReconciliation : {};
  const x402Settlement = auditLog.originalIntent?.action?.x402?.settlement;
  return {
    status: normalizeReconciliationState(reconciliation.status || auditLog.executionStatus || x402Settlement?.status),
    transactionHash: clean(reconciliation.transactionHash || auditLog.executionTxHash || x402Settlement?.transactionHash),
    replacementTransactionHash: clean(reconciliation.replacementTransactionHash || auditLog.executionReplacedBy),
    refundTransactionHash: clean(reconciliation.refundTransactionHash),
    attempt: integer(reconciliation.attempt ?? auditLog.executionAttemptCount, 0, { min: 0, max: 100 }),
    confirmations: integer(reconciliation.confirmations ?? auditLog.executionConfirmations, 0, { min: 0, max: 10_000_000 }),
    requiredConfirmations: integer(reconciliation.requiredConfirmations ?? auditLog.executionRequiredConfirmations, 1, { min: 1, max: 10_000 }),
    firstSubmittedAt: clean(reconciliation.firstSubmittedAt),
    observedAt: clean(reconciliation.observedAt || auditLog.reconciliationLastCheckedAt || auditLog.executionUpdatedAt),
    finalityDeadline: clean(reconciliation.finalityDeadline || auditLog.executionFinalityDeadline),
    finalizedAt: clean(reconciliation.finalizedAt || auditLog.executionFinalizedAt),
    provider: clean(reconciliation.provider || auditLog.reconciliationProvider),
    providerReference: clean(reconciliation.providerReference),
    resourceDelivered: Boolean(reconciliation.resourceDelivered || auditLog.resourceDeliveryStatus === "delivered" || x402Settlement?.resourceDelivered),
    deliveryReference: clean(reconciliation.deliveryReference),
    failureReason: clean(reconciliation.failureReason || auditLog.executionFailureReason),
    note: clean(reconciliation.note || auditLog.executionNote),
    chainName: clean(reconciliation.chainName),
    fingerprint: clean(reconciliation.fingerprint),
  };
}

function allowedTransition(from, to) {
  if (from === to) return true;
  const transitions = {
    not_submitted: new Set(["submitted", "pending", "confirmed", "failed", "uncertain"]),
    submitted: new Set(["pending", "confirmed", "failed", "uncertain", "replaced"]),
    pending: new Set(["confirmed", "failed", "uncertain", "replaced"]),
    uncertain: new Set(["confirmed", "failed", "replaced"]),
    failed: new Set(["submitted", "pending", "confirmed", "uncertain", "replaced", "refunded"]),
    replaced: new Set(["replaced"]),
    confirmed: new Set(["delivered", "refunded"]),
    delivered: new Set(["delivered"]),
    refunded: new Set(["refunded"]),
  };
  return transitions[from]?.has(to) === true;
}

export function reconcileExecution({ auditLog = {}, policy = {}, body = {}, now = new Date() } = {}) {
  const config = reconciliationPolicy(policy);
  if (!config.enabled) throw statusError("Execution reconciliation is disabled by the active policy", 409);
  const previous = currentRecord(auditLog);
  const incoming = normalizeReconciliationUpdate(body, now);
  if (!allowedTransition(previous.status, incoming.status)) {
    throw statusError(`Execution reconciliation cannot move from ${previous.status} to ${incoming.status}`, 409);
  }
  if (incoming.attempt > config.maximumSubmissionAttempts) {
    throw statusError(`Submission attempt ${incoming.attempt} exceeds the policy maximum of ${config.maximumSubmissionAttempts}`, 409);
  }
  if (incoming.attempt < previous.attempt) throw statusError("Submission attempts cannot move backwards", 409);
  if (previous.status === "failed" && ["submitted", "pending", "confirmed", "uncertain"].includes(incoming.status) && incoming.attempt <= previous.attempt) {
    throw statusError("Retrying a failed execution requires a higher submission attempt", 409);
  }
  if (UNRESOLVED_STATES.has(previous.status) && incoming.attempt > previous.attempt && incoming.status !== "replaced") {
    const action = previous.status === "uncertain" ? config.uncertainRetryAction : config.pendingRetryAction;
    throw statusError(`${action}: a new submission attempt is not permitted while the prior execution is ${previous.status}. Reconcile or explicitly replace it first.`, 409);
  }
  if (incoming.status === "replaced" && !config.replacementAllowed) throw statusError("Replacement transactions are disabled by the active policy", 409);

  const transactionHash = incoming.transactionHash || previous.transactionHash;
  if (["submitted", "pending", "confirmed", "delivered"].includes(incoming.status) && !transactionHash) {
    throw statusError(`${incoming.status} status requires transactionHash`, 400);
  }
  if (previous.transactionHash && incoming.transactionHash && comparableTransactionId(previous.transactionHash) !== comparableTransactionId(incoming.transactionHash)) {
    throw statusError("The bound transaction hash cannot change. Use replaced status with replacementTransactionHash.", 409);
  }
  if (incoming.status === "replaced" && comparableTransactionId(incoming.replacementTransactionHash) === comparableTransactionId(transactionHash)) {
    throw statusError("Replacement transaction hash must differ from the original transaction hash", 400);
  }

  const requiredConfirmations = config.requiredConfirmations;
  const confirmations = Math.max(previous.confirmations, incoming.confirmations);
  const finalityReached = incoming.finalized || confirmations >= requiredConfirmations;
  if (["confirmed", "delivered"].includes(incoming.status) && !finalityReached) {
    throw statusError(`Confirmed execution requires at least ${requiredConfirmations} confirmation${requiredConfirmations === 1 ? "" : "s"} or finalized=true`, 409);
  }
  if (incoming.resourceDelivered && !["confirmed", "delivered"].includes(incoming.status)) {
    throw statusError("Resource delivery cannot be recorded before execution confirmation", 409);
  }
  if (config.resourceDeliveryRequired && incoming.status === "confirmed" && !incoming.resourceDelivered && previous.resourceDelivered !== true) {
    // Confirmation remains valid; delivery stays unresolved and visible in Integration Health.
  }

  const nowIso = now.toISOString();
  const firstSubmittedAt = previous.firstSubmittedAt || (["submitted", "pending", "confirmed", "delivered", "replaced"].includes(incoming.status) ? incoming.observedAt : "");
  const finalityDeadline = previous.finalityDeadline || (firstSubmittedAt ? new Date(Date.parse(firstSubmittedAt) + config.finalityTimeoutSeconds * 1000).toISOString() : "");
  let status = incoming.status;
  let timedOut = false;
  if (["submitted", "pending"].includes(status) && finalityDeadline && Date.parse(incoming.observedAt) > Date.parse(finalityDeadline)) {
    status = "uncertain";
    timedOut = true;
  }
  const finalizedAt = ["confirmed", "delivered"].includes(status) ? (previous.finalizedAt || incoming.observedAt) : previous.finalizedAt;
  const resourceDelivered = previous.resourceDelivered || incoming.resourceDelivered || status === "delivered";
  const replacementTransactionHash = incoming.replacementTransactionHash || previous.replacementTransactionHash;
  const refundTransactionHash = incoming.refundTransactionHash || previous.refundTransactionHash || (status === "refunded" ? transactionHash : "");
  const record = {
    status,
    transactionHash,
    replacementTransactionHash,
    refundTransactionHash,
    attempt: Math.max(previous.attempt, incoming.attempt),
    confirmations,
    requiredConfirmations,
    firstSubmittedAt,
    observedAt: incoming.observedAt,
    finalityDeadline,
    finalizedAt,
    finalityReached: ["confirmed", "delivered"].includes(status),
    finalityTimedOut: timedOut,
    provider: incoming.provider || previous.provider,
    providerReference: incoming.providerReference || previous.providerReference,
    resourceDelivered,
    deliveryReference: incoming.deliveryReference || previous.deliveryReference,
    resourceDeliveryRequired: config.resourceDeliveryRequired,
    failureReason: incoming.failureReason || previous.failureReason,
    note: incoming.note || previous.note,
    chainName: incoming.chainName || previous.chainName,
    updatedAt: nowIso,
    fingerprint: sha256({ auditLogId: auditLog.id, status, transactionHash, replacementTransactionHash, refundTransactionHash, attempt: Math.max(previous.attempt, incoming.attempt), confirmations, providerReference: incoming.providerReference || previous.providerReference, resourceDelivered }),
  };

  const event = {
    id: `recon_${record.fingerprint.slice(0, 20)}`,
    status: record.status,
    attempt: record.attempt,
    transactionHash: record.transactionHash,
    replacementTransactionHash: record.replacementTransactionHash,
    refundTransactionHash: record.refundTransactionHash,
    confirmations: record.confirmations,
    requiredConfirmations: record.requiredConfirmations,
    provider: record.provider,
    providerReference: record.providerReference,
    resourceDelivered: record.resourceDelivered,
    failureReason: record.failureReason,
    observedAt: record.observedAt,
    finalityTimedOut: record.finalityTimedOut,
    note: record.note,
    fingerprint: record.fingerprint,
  };
  const history = Array.isArray(auditLog.executionHistory) ? auditLog.executionHistory : [];
  const idempotent = history.some((item) => item?.fingerprint === event.fingerprint);
  return {
    config,
    previous,
    record,
    event,
    history: idempotent ? history : [...history, event].slice(-100),
    idempotent,
    unresolved: UNRESOLVED_STATES.has(record.status) || (config.resourceDeliveryRequired && record.status === "confirmed" && !record.resourceDelivered),
    terminal: TERMINAL_STATES.has(record.status) && (!config.resourceDeliveryRequired || record.resourceDelivered || record.status === "refunded"),
  };
}

export function reconciliationFinding(result = {}) {
  const record = result.record || {};
  const evidence = {
    status: record.status,
    attempt: record.attempt,
    transactionHash: record.transactionHash || "",
    replacementTransactionHash: record.replacementTransactionHash || "",
    confirmations: record.confirmations,
    requiredConfirmations: record.requiredConfirmations,
    finalityDeadline: record.finalityDeadline || "",
    finalityTimedOut: record.finalityTimedOut === true,
    resourceDelivered: record.resourceDelivered === true,
    provider: record.provider || "",
    providerReference: record.providerReference || "",
  };
  if (["confirmed", "delivered", "refunded"].includes(record.status)) {
    return { module: "Execution & Settlement Reconciliation", control: "Reconciliation", status: "pass", severity: "info", rule: record.status === "delivered" ? "Resource delivery" : record.status === "refunded" ? "Refund reconciliation" : "Execution finality", message: record.status === "delivered" ? "The authorized execution reached finality and the expected resource delivery was reported." : record.status === "refunded" ? "The authorized execution was reconciled to a refund state." : "The authorized transaction reached the configured confirmation or finality requirement.", evidence, remediation: "No automatic retry is required. Preserve this audit as the final execution record." };
  }
  if (record.status === "failed") {
    return { module: "Execution & Settlement Reconciliation", control: "Reconciliation", status: "warning", severity: "high", rule: "Execution failure", message: `The authorized execution failed${record.failureReason ? `: ${record.failureReason}` : "."}`, evidence, remediation: "Investigate the failure. Create a fresh lifecycle-bound retry only when policy permits and increment the submission attempt." };
  }
  if (record.status === "uncertain") {
    return { module: "Execution & Settlement Reconciliation", control: "Reconciliation", status: "warning", severity: "high", rule: record.finalityTimedOut ? "Finality timeout" : "Uncertain execution state", message: record.finalityTimedOut ? "The execution exceeded the configured finality timeout and is now uncertain." : "The execution outcome is uncertain, so duplicate retry is unsafe.", evidence, remediation: "Do not retry automatically. Reconcile the existing transaction with a trusted provider or use an explicitly authorized replacement." };
  }
  if (record.status === "replaced") {
    return { module: "Execution & Settlement Reconciliation", control: "Reconciliation", status: "warning", severity: "medium", rule: "Replacement transaction", message: "The original transaction was explicitly linked to a replacement transaction.", evidence, remediation: "Track the replacement transaction to a terminal state before any further retry." };
  }
  return { module: "Execution & Settlement Reconciliation", control: "Reconciliation", status: "pass", severity: "info", rule: "Execution state tracking", message: `The authorized execution is recorded as ${record.status}.`, evidence, remediation: "Continue reconciliation until the configured finality and delivery requirements are satisfied." };
}

export function reconciliationStatusSummary(policy = {}) {
  const config = reconciliationPolicy(policy);
  return {
    status: "foundation-available",
    deterministicTransitionEnforcement: true,
    authenticatedReporting: true,
    transactionHashBinding: true,
    retryPrevention: true,
    replacementTracking: true,
    confirmationRequirements: true,
    finalityTimeouts: true,
    resourceDeliveryTracking: true,
    refundTracking: true,
    realPollingConfigured: false,
    supportedStates: [...STATES],
    defaults: config,
    securityBoundary: "Magen3 validates authenticated execution evidence and deterministic state transitions. This foundation does not claim independent on-chain truth until a real chain-specific polling adapter is configured and verified.",
  };
}

function updatePipelineStage(stages, id, status, timestamp = new Date().toISOString(), label = "") {
  const source = Array.isArray(stages) ? stages : [];
  const found = source.some((stage) => stage?.id === id);
  const next = source.map((stage) => stage?.id === id ? { ...stage, status, timestamp, ...(label ? { label } : {}) } : stage);
  return found ? next : [...next, { id, label: label || id, status, timestamp }];
}

export function buildReconciliationAuditPatch({ auditLog = {}, policy = {}, body = {}, now = new Date() } = {}) {
  const result = reconcileExecution({ auditLog, policy, body, now });
  const { record, config } = result;
  const finding = reconciliationFinding(result);
  let stages = Array.isArray(auditLog.pipelineStages) ? auditLog.pipelineStages : [];
  const submitted = ["submitted", "pending", "confirmed", "delivered", "replaced"].includes(record.status);
  const confirmationStatus = ["confirmed", "delivered"].includes(record.status)
    ? "completed"
    : record.status === "failed"
      ? "failed"
      : record.status === "uncertain"
        ? "warning"
        : submitted
          ? "pending"
          : "skipped";
  const reconciliationStatus = result.terminal ? "completed" : record.status === "failed" ? "failed" : record.status === "uncertain" || record.status === "replaced" ? "warning" : "pending";
  stages = updatePipelineStage(stages, "execution-submitted", submitted ? "completed" : record.status === "failed" ? "failed" : "pending", submitted ? record.firstSubmittedAt || record.observedAt : record.observedAt, "Execution submitted");
  stages = updatePipelineStage(stages, "execution-confirmed", confirmationStatus, ["confirmed", "delivered"].includes(record.status) ? record.finalizedAt : record.observedAt, "Execution confirmation and finality");
  stages = updatePipelineStage(stages, "settlement-reconciled", reconciliationStatus, result.terminal ? record.updatedAt : record.observedAt, "Execution and settlement reconciled");
  if (config.resourceDeliveryRequired || record.resourceDelivered || auditLog.action === "x402 Payment" || String(auditLog.action || "").toLowerCase().includes("bridge")) {
    stages = updatePipelineStage(stages, "resource-delivery", record.resourceDelivered ? "completed" : record.status === "failed" || record.status === "refunded" ? "failed" : "pending", record.resourceDelivered ? record.updatedAt : "", "Resource or destination delivery");
  }
  if (record.status === "replaced" || record.replacementTransactionHash) {
    stages = updatePipelineStage(stages, "execution-replacement", record.replacementTransactionHash ? "completed" : "warning", record.updatedAt, "Replacement transaction linked");
  }
  if (record.status === "refunded" || record.refundTransactionHash) {
    stages = updatePipelineStage(stages, "execution-refund", record.status === "refunded" ? "completed" : "pending", record.updatedAt, "Refund reconciled");
  }
  return {
    result,
    patch: {
      executionStatus: record.status,
      executionTxHash: record.transactionHash || auditLog.executionTxHash || "",
      executionNote: record.note || (record.status === "confirmed" ? "Execution reached configured finality." : `Execution reconciliation updated to ${record.status}.`),
      executionUpdatedAt: record.updatedAt,
      executionAttemptCount: record.attempt,
      executionConfirmations: record.confirmations,
      executionRequiredConfirmations: record.requiredConfirmations,
      executionFinalityDeadline: record.finalityDeadline || "",
      executionFinalizedAt: record.finalizedAt || "",
      executionReplacementOf: clean(auditLog.executionReplacementOf || auditLog.originalIntent?.lifecycle?.replacementOf || auditLog.originalIntent?.action?.lifecycle?.replacementOf),
      executionReplacementAuditId: clean(auditLog.executionReplacementAuditId || auditLog.originalIntent?.lifecycle?.replacementOf || auditLog.originalIntent?.action?.lifecycle?.replacementOf),
      executionReplacedBy: record.replacementTransactionHash || "",
      executionReplacedByAuditId: clean(body.replacementAuditLogId || body.replacedByAuditLogId || auditLog.executionReplacedByAuditId),
      executionFailureReason: record.failureReason || "",
      settlementStatus: record.status,
      resourceDeliveryStatus: record.resourceDelivered ? "delivered" : config.resourceDeliveryRequired ? "pending" : "not_required",
      refundStatus: record.status === "refunded" ? "refunded" : record.refundTransactionHash ? "pending" : "not_applicable",
      reconciliationProvider: record.provider || "",
      reconciliationLastCheckedAt: record.updatedAt,
      executionReconciliation: record,
      executionHistory: result.history,
      pipelineStages: stages,
      moduleFindings: [
        ...(Array.isArray(auditLog.moduleFindings) ? auditLog.moduleFindings.filter((item) => item?.module !== "Execution & Settlement Reconciliation") : []),
        finding,
      ],
    },
  };
}
