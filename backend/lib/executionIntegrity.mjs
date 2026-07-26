import { createHash } from "node:crypto";
import { reconciliationPolicy } from "./executionReconciliation.mjs";

const MODES = new Set(["Observe", "Review", "Enforce"]);
const UNAVAILABLE_ACTIONS = new Set(["Warn", "Review", "Block"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HASH_64 = /^(?:0x)?[a-fA-F0-9]{64}$/;
const UNRESOLVED_EXECUTION_STATES = new Set([
  "approved_pending_signature",
  "submitted",
  "pending",
  "uncertain",
  "broadcast",
  "processing",
]);
const CONFIRMED_EXECUTION_STATES = new Set([
  "confirmed",
  "executed",
  "recorded",
  "settled",
  "success",
  "delivered",
  "refunded",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function finiteInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        const child = value[key];
        if (child !== undefined) result[key] = stableValue(child);
        return result;
      }, {});
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalIntentPayload(request = {}) {
  return stableValue({
    agentId: clean(request.agentId),
    executionWalletAddress: clean(request.executionWalletAddress || request.walletAddress).toLowerCase(),
    actionType: clean(request.actionType),
    amount: Number(request.amount || 0),
    asset: clean(request.asset).toUpperCase(),
    outputAsset: clean(request.outputAsset).toUpperCase(),
    target: clean(request.target).toLowerCase(),
    targetType: clean(request.targetType),
    contractIdentifierType: clean(request.contractIdentifierType),
    entryPoint: clean(request.entryPoint),
    contractVersion: request.contractVersion ?? null,
    chainName: clean(request.chainName).toLowerCase(),
    paymentAmountMotes: clean(request.paymentAmountMotes),
    gasPriceTolerance: request.gasPriceTolerance ?? null,
    ttl: clean(request.ttl),
    transactionTimestamp: clean(request.transactionTimestamp),
    slippageBps: request.slippageBps ?? null,
    expectedOutput: request.expectedOutput ?? null,
    minimumReceived: request.minimumReceived ?? null,
    runtimeArgs: request.runtimeArgs ?? null,
    transactionHash: clean(request.transactionHash).toLowerCase(),
    oracle: {
      baseAsset: clean(request.oracleBaseAsset).toUpperCase(),
      quoteAsset: clean(request.oracleQuoteAsset).toUpperCase(),
      executionPrice: request.executionPrice ?? null,
      quoteTimestamp: clean(request.quoteTimestamp),
    },
    bridge: {
      sourceChain: clean(request.bridgeSourceChain).toLowerCase(),
      destinationChain: clean(request.bridgeDestinationChain).toLowerCase(),
      provider: clean(request.bridgeProvider).toLowerCase(),
      routeId: clean(request.bridgeRouteId),
      destinationAddress: clean(request.bridgeDestinationAddress).toLowerCase(),
      asset: clean(request.bridgeAsset).toUpperCase(),
      feeAmount: request.bridgeFeeAmount ?? null,
      feeBps: request.bridgeFeeBps ?? null,
      expectedOutput: request.bridgeExpectedOutput ?? null,
      minimumReceived: request.bridgeMinimumReceived ?? null,
      quoteTimestamp: clean(request.bridgeQuoteTimestamp),
      quoteExpiresAt: clean(request.bridgeQuoteExpiresAt),
      sourceConfirmations: request.bridgeSourceConfirmations ?? null,
      destinationConfirmations: request.bridgeDestinationConfirmations ?? null,
    },
    compliance: {
      originatorJurisdiction: clean(request.complianceOriginatorJurisdiction).toUpperCase(),
      beneficiaryJurisdiction: clean(request.complianceBeneficiaryJurisdiction).toUpperCase(),
      counterpartyType: clean(request.complianceCounterpartyType),
      originatorAttestationStatus: clean(request.complianceOriginatorAttestationStatus),
      originatorAttestationProvider: clean(request.complianceOriginatorAttestationProvider),
      originatorAttestationReference: clean(request.complianceOriginatorAttestationReference),
      beneficiaryAttestationStatus: clean(request.complianceBeneficiaryAttestationStatus),
      beneficiaryAttestationProvider: clean(request.complianceBeneficiaryAttestationProvider),
      beneficiaryAttestationReference: clean(request.complianceBeneficiaryAttestationReference),
      travelRuleStatus: clean(request.complianceTravelRuleStatus),
      travelRuleReference: clean(request.complianceTravelRuleReference),
      travelRuleDataHash: clean(request.complianceTravelRuleDataHash).toLowerCase(),
      screeningStatus: clean(request.complianceScreeningStatus),
      screeningProvider: clean(request.complianceScreeningProvider),
      screeningReference: clean(request.complianceScreeningReference),
      riskRating: clean(request.complianceRiskRating),
      originatorVaspId: clean(request.complianceOriginatorVaspId),
      beneficiaryVaspId: clean(request.complianceBeneficiaryVaspId),
    },
    x402: {
      version: clean(request.x402Version),
      scheme: clean(request.x402Scheme).toLowerCase(),
      resourceUrl: clean(request.x402ResourceUrl),
      method: clean(request.x402HttpMethod).toUpperCase(),
      merchantDomain: clean(request.x402MerchantDomain).toLowerCase(),
      payTo: clean(request.x402PayTo).toLowerCase(),
      asset: clean(request.x402Asset).toUpperCase(),
      network: clean(request.x402Network).toLowerCase(),
      facilitator: clean(request.x402Facilitator).toLowerCase(),
      amountAtomic: clean(request.x402AmountAtomic),
      validUntil: clean(request.x402ValidUntil),
      maxTimeoutSeconds: request.x402MaxTimeoutSeconds ?? null,
      requirementsReceivedAt: clean(request.x402RequirementsReceivedAt),
      requestId: clean(request.x402RequestId),
      requestBodyHash: clean(request.x402RequestBodyHash).toLowerCase(),
      paymentRequiredHash: clean(request.x402PaymentRequiredHash).toLowerCase(),
    },
  });
}

export function buildIntentFingerprint(request = {}) {
  return sha256(JSON.stringify(canonicalIntentPayload(request)));
}

function normalizeConfig(policy = {}) {
  const rules = policy.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  const reconciliation = reconciliationPolicy(policy);
  const mode = MODES.has(rules.lifecycleControlMode) ? rules.lifecycleControlMode : "Observe";
  const unavailableAction = UNAVAILABLE_ACTIONS.has(rules.lifecycleUnavailableAction) ? rules.lifecycleUnavailableAction : "Warn";
  return {
    enabled: rules.lifecycleControlsEnabled !== false,
    mode,
    unavailableAction,
    requireIntentId: bool(rules.lifecycleRequireIntentId, false),
    requireIdempotencyKey: bool(rules.lifecycleRequireIdempotencyKey, false),
    requireCreatedAt: bool(rules.lifecycleRequireCreatedAt, false),
    requireExpiry: bool(rules.lifecycleRequireExpiry, false),
    requireSequence: bool(rules.lifecycleRequireSequence, false),
    preventDuplicateFingerprint: rules.lifecyclePreventDuplicateFingerprint === true,
    preventRetryAfterUncertain: rules.lifecyclePreventRetryAfterUncertain !== false,
    preventParameterMutation: rules.lifecyclePreventParameterMutation !== false,
    maxIntentAgeSeconds: finiteInteger(rules.lifecycleMaxIntentAgeSeconds, 900, { min: 30, max: 604800 }),
    maxFutureSkewSeconds: finiteInteger(rules.lifecycleMaxFutureSkewSeconds, 300, { min: 0, max: 3600 }),
    maxLifetimeSeconds: finiteInteger(rules.lifecycleMaxLifetimeSeconds, 3600, { min: 30, max: 604800 }),
    replayWindowSeconds: finiteInteger(rules.lifecycleReplayWindowSeconds, 86400, { min: 60, max: 2592000 }),
    maxRetryAttempts: finiteInteger(rules.lifecycleMaxRetryAttempts, reconciliation.maximumSubmissionAttempts, { min: 0, max: 100 }),
    replacementAllowed: reconciliation.replacementAllowed,
    pendingRetryAction: reconciliation.pendingRetryAction,
    uncertainRetryAction: reconciliation.uncertainRetryAction,
  };
}

function lifecycleFromAudit(log = {}) {
  const original = log.originalIntent && typeof log.originalIntent === "object" ? log.originalIntent : {};
  const lifecycle = original.lifecycle && typeof original.lifecycle === "object"
    ? original.lifecycle
    : original.action?.lifecycle && typeof original.action.lifecycle === "object"
      ? original.action.lifecycle
      : {};
  return {
    intentId: clean(lifecycle.intentId || lifecycle.intent_id),
    idempotencyKey: clean(lifecycle.idempotencyKey || lifecycle.idempotency_key),
    sequence: finiteInteger(lifecycle.sequence, null, { min: 0 }),
    createdAt: clean(lifecycle.createdAt || lifecycle.created_at),
    expiresAt: clean(lifecycle.expiresAt || lifecycle.expires_at),
    retryOf: clean(lifecycle.retryOf || lifecycle.retry_of),
    replacementOf: clean(lifecycle.replacementOf || lifecycle.replacement_of),
    attempt: finiteInteger(lifecycle.attempt, 0, { min: 0 }),
    fingerprint: clean(lifecycle.intentFingerprint || lifecycle.intent_fingerprint || lifecycle.fingerprint).replace(/^0x/i, "").toLowerCase(),
  };
}

function finding(status, severity, rule, message, evidence = {}, remediation = "") {
  return { module: "Execution Integrity", status, severity, rule, message, evidence, remediation };
}

function createState(config) {
  return { findings: [], checksPassed: [], checksFailed: [], scoreDelta: 0, hardBlock: false, needsReview: false, config };
}

function pass(state, rule, message, evidence = {}) {
  state.findings.push(finding("pass", "info", rule, message, evidence));
  state.checksPassed.push(message);
}

function skip(state, rule, message, evidence = {}) {
  state.findings.push(finding("skipped", "info", rule, message, evidence));
}

function applyViolation(state, { rule, message, evidence = {}, remediation = "" }, { hard = false } = {}) {
  if (hard || state.config.mode === "Enforce") {
    state.findings.push(finding("fail", hard ? "critical" : "high", rule, message, evidence, remediation));
    state.checksFailed.push(message);
    state.scoreDelta += hard ? 45 : 30;
    state.hardBlock = true;
    return;
  }
  state.findings.push(finding("warning", state.config.mode === "Review" ? "high" : "medium", rule, message, evidence, remediation));
  state.checksFailed.push(message);
  state.scoreDelta += state.config.mode === "Review" ? 20 : 8;
  if (state.config.mode === "Review") state.needsReview = true;
}

function applyUnavailable(state, { rule, message, evidence = {}, remediation = "" }) {
  const action = state.config.unavailableAction;
  if (action === "Block") {
    state.findings.push(finding("fail", "high", rule, message, evidence, remediation));
    state.checksFailed.push(message);
    state.scoreDelta += 30;
    state.hardBlock = true;
  } else {
    state.findings.push(finding("unavailable", action === "Review" ? "high" : "medium", rule, message, evidence, remediation));
    state.checksFailed.push(message);
    state.scoreDelta += action === "Review" ? 18 : 6;
    if (action === "Review") state.needsReview = true;
  }
}

function applyRetryAction(state, action, violation) {
  if (action === "Block") {
    applyViolation(state, violation, { hard: true });
    return;
  }
  state.findings.push(finding("warning", "high", violation.rule, violation.message, violation.evidence || {}, violation.remediation || ""));
  state.checksFailed.push(violation.message);
  state.scoreDelta += 20;
  state.needsReview = true;
}

function dateMs(value) {
  if (!clean(value)) return Number.NaN;
  return Date.parse(value);
}

function normalizeExecutionState(log = {}) {
  const original = log.originalIntent?.action?.x402?.settlement?.status || log.originalIntent?.action?.x402?.settlementStatus || "";
  return clean(log.executionStatus || original || log.decisionProofStatus).toLowerCase();
}

function previousAuditContext(auditLogs = [], request = {}, fingerprint = "") {
  const agentLogs = auditLogs.filter((log) => log.agentId === request.agentId);
  const records = agentLogs.map((log) => ({ log, lifecycle: lifecycleFromAudit(log) }));
  return {
    records,
    sameIntentId: records.filter(({ lifecycle }) => request.lifecycleIntentId && lifecycle.intentId === request.lifecycleIntentId),
    sameIdempotencyKey: records.filter(({ lifecycle }) => request.lifecycleIdempotencyKey && lifecycle.idempotencyKey === request.lifecycleIdempotencyKey),
    sameFingerprint: records.filter(({ lifecycle }) => fingerprint && lifecycle.fingerprint === fingerprint),
    sameTransactionHash: records.filter(({ log }) => {
      const previous = clean(log.executionTxHash || log.originalIntent?.action?.preflight?.transactionHash).replace(/^0x/i, "").toLowerCase();
      const current = clean(request.transactionHash).replace(/^0x/i, "").toLowerCase();
      return current && previous === current;
    }),
    highestSequence: records.reduce((max, { lifecycle }) => lifecycle.sequence === null ? max : Math.max(max, lifecycle.sequence), -1),
  };
}

export function evaluateExecutionIntegrity({ request = {}, policy = {}, auditLogs = [], now = new Date() } = {}) {
  const config = normalizeConfig(policy);
  const state = createState(config);
  const fingerprint = buildIntentFingerprint(request);
  const clientFingerprint = clean(request.lifecycleIntentFingerprint).replace(/^0x/i, "").toLowerCase();
  const intentId = clean(request.lifecycleIntentId);
  const idempotencyKey = clean(request.lifecycleIdempotencyKey);
  const createdAt = clean(request.lifecycleCreatedAt);
  const expiresAt = clean(request.lifecycleExpiresAt);
  const retryOf = clean(request.lifecycleRetryOf);
  const replacementOf = clean(request.lifecycleReplacementOf);
  const sequence = request.lifecycleSequence === null || request.lifecycleSequence === undefined ? null : finiteInteger(request.lifecycleSequence, null, { min: 0 });
  const attempt = finiteInteger(request.lifecycleAttempt, 0, { min: 0, max: 10000 });
  const previous = previousAuditContext(auditLogs, request, fingerprint);
  const nowMs = now.getTime();

  if (!config.enabled) {
    skip(state, "Lifecycle controls enabled", "Lifecycle and replay controls are disabled by the active policy.", {});
    return { ...state, context: { status: "skipped", fingerprint, ...config } };
  }

  pass(state, "Canonical intent fingerprint", "Magen3 computed a deterministic fingerprint for the complete execution intent.", { fingerprint });

  if (clientFingerprint) {
    if (!HASH_64.test(clientFingerprint) || clientFingerprint !== fingerprint) {
      applyViolation(state, {
        rule: "Client intent fingerprint binding",
        message: "The submitted intent fingerprint does not match the canonical parameters evaluated by Magen3.",
        evidence: { submitted: clientFingerprint, computed: fingerprint },
        remediation: "Rebuild the fingerprint from the exact current intent and do not reuse a fingerprint after changing any protected parameter.",
      }, { hard: true });
    } else pass(state, "Client intent fingerprint binding", "The submitted intent fingerprint matches Magen3's canonical fingerprint.", { fingerprint });
  } else {
    applyUnavailable(state, {
      rule: "Client intent fingerprint binding",
      message: "No client-computed intent fingerprint was supplied.",
      evidence: { computedFingerprint: fingerprint },
      remediation: "Include action.lifecycle.intentFingerprint to bind the agent request to the exact parameters before signing.",
    });
  }

  if (!intentId) {
    if (config.requireIntentId) applyUnavailable(state, { rule: "Unique intent identifier", message: "The active policy requires a unique intent ID.", remediation: "Generate a new unique action.lifecycle.intentId for every business intent." });
    else applyUnavailable(state, { rule: "Unique intent identifier", message: "No unique lifecycle intent ID was supplied.", remediation: "Include a unique action.lifecycle.intentId to make replay detection explicit." });
  } else if (!SAFE_ID.test(intentId)) {
    applyViolation(state, { rule: "Unique intent identifier", message: "The lifecycle intent ID has an invalid format.", evidence: { intentId }, remediation: "Use 8-128 letters, numbers, periods, underscores, colons, or hyphens." }, { hard: true });
  } else if (previous.sameIntentId.length > 0) {
    applyViolation(state, { rule: "Intent ID replay prevention", message: "This intent ID has already been evaluated for the same agent.", evidence: { intentId, previousAuditIds: previous.sameIntentId.map(({ log }) => log.id) }, remediation: "Do not execute this request again. Reconcile the original audit, or create a new intent ID with an explicit retryOf reference after the original state is resolved." }, { hard: true });
  } else pass(state, "Intent ID replay prevention", "The lifecycle intent ID has not appeared in prior audit records for this agent.", { intentId });

  if (!idempotencyKey) {
    if (config.requireIdempotencyKey) applyUnavailable(state, { rule: "Idempotency key", message: "The active policy requires an idempotency key.", remediation: "Supply action.lifecycle.idempotencyKey and keep it stable only for the same logical request." });
    else applyUnavailable(state, { rule: "Idempotency key", message: "No idempotency key was supplied.", remediation: "Include an idempotency key so retries cannot create duplicate execution." });
  } else if (!SAFE_ID.test(idempotencyKey)) {
    applyViolation(state, { rule: "Idempotency key", message: "The idempotency key has an invalid format.", evidence: { idempotencyKey }, remediation: "Use 8-128 letters, numbers, periods, underscores, colons, or hyphens." }, { hard: true });
  } else if (previous.sameIdempotencyKey.length > 0) {
    const changed = previous.sameIdempotencyKey.some(({ lifecycle }) => lifecycle.fingerprint && lifecycle.fingerprint !== fingerprint);
    applyViolation(state, {
      rule: changed ? "Idempotency parameter mutation" : "Duplicate idempotency key",
      message: changed
        ? "The idempotency key was previously used for different protected parameters."
        : "The idempotency key has already been evaluated for this agent.",
      evidence: { idempotencyKey, computedFingerprint: fingerprint, previousAuditIds: previous.sameIdempotencyKey.map(({ log }) => log.id) },
      remediation: changed
        ? "Never reuse an idempotency key after changing amount, recipient, contract, network, asset, or other protected parameters."
        : "Use the original audit result instead of submitting the same logical request again.",
    }, { hard: config.preventParameterMutation || !changed });
  } else pass(state, "Idempotency key", "The idempotency key has not appeared in prior audit records for this agent.", { idempotencyKey });

  const createdAtMs = dateMs(createdAt);
  if (!createdAt) {
    if (config.requireCreatedAt) applyUnavailable(state, { rule: "Intent creation time", message: "The active policy requires an intent creation timestamp.", remediation: "Include action.lifecycle.createdAt as a current ISO-8601 timestamp." });
    else applyUnavailable(state, { rule: "Intent creation time", message: "No lifecycle creation timestamp was supplied.", remediation: "Include action.lifecycle.createdAt so Magen3 can reject stale or future-dated intents." });
  } else if (!Number.isFinite(createdAtMs)) {
    applyViolation(state, { rule: "Intent creation time", message: "The lifecycle creation timestamp is not valid ISO-8601.", evidence: { createdAt }, remediation: "Use an ISO-8601 timestamp such as 2026-07-23T10:00:00.000Z." }, { hard: true });
  } else if (createdAtMs > nowMs + config.maxFutureSkewSeconds * 1000) {
    applyViolation(state, { rule: "Future-dated intent", message: "The intent creation time is too far in the future.", evidence: { createdAt, maxFutureSkewSeconds: config.maxFutureSkewSeconds }, remediation: "Synchronize the agent clock and create a fresh intent." });
  } else if (nowMs - createdAtMs > config.maxIntentAgeSeconds * 1000) {
    applyViolation(state, { rule: "Maximum intent age", message: "The intent is older than the active lifecycle policy permits.", evidence: { createdAt, maxIntentAgeSeconds: config.maxIntentAgeSeconds }, remediation: "Create a new intent with current parameters and a new intent ID." });
  } else pass(state, "Intent creation time", "The intent creation time is current and within policy bounds.", { createdAt, maxIntentAgeSeconds: config.maxIntentAgeSeconds });

  const expiresAtMs = dateMs(expiresAt);
  if (!expiresAt) {
    if (config.requireExpiry) applyUnavailable(state, { rule: "Intent expiration", message: "The active policy requires an explicit intent expiration.", remediation: "Include action.lifecycle.expiresAt and keep the authorization lifetime short." });
    else applyUnavailable(state, { rule: "Intent expiration", message: "No lifecycle expiration was supplied.", remediation: "Include action.lifecycle.expiresAt to prevent a valid old intent from being signed later." });
  } else if (!Number.isFinite(expiresAtMs)) {
    applyViolation(state, { rule: "Intent expiration", message: "The lifecycle expiration is not valid ISO-8601.", evidence: { expiresAt }, remediation: "Use a valid ISO-8601 expiration timestamp." }, { hard: true });
  } else if (expiresAtMs <= nowMs) {
    applyViolation(state, { rule: "Expired intent", message: "The lifecycle authorization has expired.", evidence: { expiresAt }, remediation: "Create a new intent with a new identifier and a future expiration." }, { hard: true });
  } else if (Number.isFinite(createdAtMs) && expiresAtMs - createdAtMs > config.maxLifetimeSeconds * 1000) {
    applyViolation(state, { rule: "Maximum intent lifetime", message: "The lifecycle authorization window is longer than policy permits.", evidence: { createdAt, expiresAt, maxLifetimeSeconds: config.maxLifetimeSeconds }, remediation: "Reduce the intent validity window." });
  } else pass(state, "Intent expiration", "The intent has not expired and its authorization window is within policy bounds.", { expiresAt, maxLifetimeSeconds: config.maxLifetimeSeconds });

  if (sequence === null) {
    if (config.requireSequence) applyUnavailable(state, { rule: "Monotonic agent sequence", message: "The active policy requires a monotonic sequence number.", remediation: "Increment action.lifecycle.sequence for every new agent intent." });
    else skip(state, "Monotonic agent sequence", "No sequence number was supplied; explicit ID and fingerprint checks remain active.", {});
  } else if (sequence <= previous.highestSequence) {
    applyViolation(state, { rule: "Monotonic agent sequence", message: "The submitted sequence is not greater than the highest sequence already recorded for this agent.", evidence: { received: sequence, highestRecorded: previous.highestSequence }, remediation: "Use the next sequence number and never reuse or move a sequence backward." }, { hard: true });
  } else pass(state, "Monotonic agent sequence", "The submitted sequence advances beyond prior recorded intents.", { sequence, highestRecorded: previous.highestSequence });

  if (config.preventDuplicateFingerprint && previous.sameFingerprint.length > 0) {
    const recent = previous.sameFingerprint.filter(({ log }) => {
      const timestamp = Date.parse(log.timestamp || "");
      return Number.isFinite(timestamp) && nowMs - timestamp <= config.replayWindowSeconds * 1000;
    });
    if (recent.length > 0) {
      const unresolved = recent.filter(({ log }) => UNRESOLVED_EXECUTION_STATES.has(normalizeExecutionState(log)) || log.decision === "Allowed");
      const confirmed = recent.filter(({ log }) => CONFIRMED_EXECUTION_STATES.has(normalizeExecutionState(log)) || Boolean(log.executionTxHash));
      applyViolation(state, {
        rule: confirmed.length ? "Confirmed execution replay" : unresolved.length ? "Unresolved execution replay" : "Duplicate intent fingerprint",
        message: confirmed.length
          ? "An equivalent intent has already produced a recorded execution."
          : unresolved.length
            ? "An equivalent intent is already authorized, pending, or unresolved."
            : "An equivalent intent was evaluated inside the configured replay window.",
        evidence: { fingerprint, replayWindowSeconds: config.replayWindowSeconds, previousAuditIds: recent.map(({ log }) => log.id) },
        remediation: confirmed.length || unresolved.length
          ? "Do not submit another execution. Reconcile the existing audit and transaction state first."
          : "Use a new intent only when the repeated action is genuinely intended, with a new ID and explicit operator authorization.",
      }, { hard: confirmed.length > 0 || unresolved.length > 0 });
    } else pass(state, "Duplicate intent fingerprint", "No equivalent intent was found inside the configured replay window.", { fingerprint, replayWindowSeconds: config.replayWindowSeconds });
  } else if (config.preventDuplicateFingerprint) {
    pass(state, "Duplicate intent fingerprint", "No previous audit record contains the same canonical intent fingerprint.", { fingerprint });
  } else skip(state, "Duplicate intent fingerprint", "Duplicate fingerprint detection is disabled by policy.", {});

  if (previous.sameTransactionHash.length > 0) {
    applyViolation(state, { rule: "Transaction hash replay", message: "The submitted transaction hash already appears in a previous audit record for this agent.", evidence: { transactionHash: request.transactionHash, previousAuditIds: previous.sameTransactionHash.map(({ log }) => log.id) }, remediation: "Never reuse a transaction hash. Reconcile the original transaction instead." }, { hard: true });
  } else if (clean(request.transactionHash)) pass(state, "Transaction hash replay", "The optional transaction hash is not present in prior audit records for this agent.", { transactionHash: request.transactionHash });
  else skip(state, "Transaction hash replay", "No transaction hash was supplied before signing.", {});

  const referenceId = retryOf || replacementOf;
  if (retryOf && replacementOf) {
    applyViolation(state, { rule: "Retry and replacement exclusivity", message: "An intent cannot be both a retry and a replacement.", evidence: { retryOf, replacementOf }, remediation: "Choose retryOf for a safe re-attempt or replacementOf for a deliberate replacement transaction, not both." }, { hard: true });
  } else if (referenceId) {
    const referenced = auditLogs.find((log) => log.id === referenceId && log.agentId === request.agentId);
    if (!referenced) {
      applyViolation(state, { rule: retryOf ? "Retry audit reference" : "Replacement audit reference", message: "The referenced prior audit record does not exist for this agent.", evidence: { referenceId }, remediation: "Reference a real prior Magen3 audit ID owned by the same agent." }, { hard: true });
    } else {
      const executionState = normalizeExecutionState(referenced);
      if (CONFIRMED_EXECUTION_STATES.has(executionState) || executionState === "replaced") {
        applyViolation(state, { rule: retryOf ? "Retry after terminal execution" : "Replacement after terminal execution", message: "The referenced intent already has a confirmed, delivered, refunded, or replaced execution state.", evidence: { referenceId, executionStatus: executionState, executionTxHash: referenced.executionTxHash || "" }, remediation: "Do not retry or replace a terminal execution. Reconcile the linked record instead." }, { hard: true });
      } else if (replacementOf && !config.replacementAllowed) {
        applyViolation(state, { rule: "Replacement policy", message: "The active policy does not allow replacement transactions.", evidence: { replacementOf, executionStatus: executionState }, remediation: "Reconcile the original transaction or update the policy through an authorized workflow." }, { hard: true });
      } else if (replacementOf && !["submitted", "pending", "uncertain", "failed", "broadcast", "processing"].includes(executionState)) {
        applyViolation(state, { rule: "Replacement state", message: "A replacement must reference a submitted, pending, uncertain, or failed execution.", evidence: { replacementOf, executionStatus: executionState }, remediation: "Submit the original transaction first or use retryOf for a failed pre-submission attempt." }, { hard: true });
      } else if (retryOf && config.preventRetryAfterUncertain && UNRESOLVED_EXECUTION_STATES.has(executionState)) {
        applyRetryAction(state, executionState === "uncertain" ? config.uncertainRetryAction : config.pendingRetryAction, { rule: "Retry after uncertain execution", message: "The referenced execution is still pending or uncertain, so a retry could create a duplicate transaction.", evidence: { retryOf, executionStatus: executionState }, remediation: "Reconcile the original execution before creating another transaction." });
      } else if (attempt > config.maxRetryAttempts) {
        applyViolation(state, { rule: "Maximum lifecycle attempts", message: "The lifecycle attempt exceeds the active retry limit.", evidence: { attempt, maximum: config.maxRetryAttempts }, remediation: "Stop automatic retries and require authorized investigation." }, { hard: true });
      } else pass(state, retryOf ? "Retry audit reference" : "Replacement audit reference", "The referenced audit exists and is not confirmed as executed.", { referenceId, executionStatus: executionState, attempt });
    }
  } else if (attempt > 0) {
    applyViolation(state, { rule: "Retry attempt reference", message: "A non-zero lifecycle attempt must reference the prior audit with retryOf or replacementOf.", evidence: { attempt }, remediation: "Set retryOf or replacementOf to the previous Magen3 audit ID." }, { hard: true });
  } else pass(state, "Retry attempt state", "This request is the first declared lifecycle attempt.", { attempt });

  return {
    ...state,
    context: {
      status: state.hardBlock ? "failed" : state.needsReview ? "review" : state.findings.some((item) => ["warning", "unavailable"].includes(item.status)) ? "observed" : "passed",
      mode: config.mode,
      unavailableAction: config.unavailableAction,
      enabled: config.enabled,
      intentId,
      idempotencyKey,
      sequence,
      createdAt,
      expiresAt,
      retryOf,
      replacementOf,
      attempt,
      fingerprint,
      clientFingerprint,
      previousIntentIdCount: previous.sameIntentId.length,
      previousIdempotencyCount: previous.sameIdempotencyKey.length,
      previousFingerprintCount: previous.sameFingerprint.length,
      highestSequence: previous.highestSequence,
      replayWindowSeconds: config.replayWindowSeconds,
      maxRetryAttempts: config.maxRetryAttempts,
    },
  };
}
