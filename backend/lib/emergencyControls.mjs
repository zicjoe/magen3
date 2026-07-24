const SCOPE_TYPES = new Set([
  "Platform",
  "Agent",
  "Capability",
  "Action",
  "Policy",
  "Trading",
  "Contract",
  "Bridge",
  "x402",
  "All Execution",
]);

const ENFORCEMENT_ACTIONS = new Set(["Blocked", "Review Required"]);
const ACTIVE_STATUS = "Active";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeComparable(value) {
  return clean(value).toLowerCase();
}

function boolRule(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["yes", "true", "enabled", "on"].includes(value.toLowerCase());
  return fallback;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finding({ status, severity = "info", rule, message, evidence = {}, remediation = "" }) {
  return {
    module: "Emergency Circuit Breaker",
    status,
    severity,
    rule,
    message,
    evidence,
    remediation,
  };
}

function isContractAction(request = {}) {
  return request.actionType === "Contract Interaction" ||
    ["Trusted Contract", "Unknown Contract", "Bridge Contract"].includes(request.targetType) ||
    request.privilegedActionMetadataSupplied === true ||
    request.tokenPermissionMetadataSupplied === true;
}

function isTradingAction(request = {}, agent = {}) {
  const tradingActions = new Set(["Swap", "Stake", "Claim Rewards", "Deposit to Vault"]);
  return tradingActions.has(request.actionType) || asArray(agent.executionCapabilities).includes("Trading");
}

function pauseIsActive(pause, now = new Date()) {
  if (!pause || clean(pause.status || ACTIVE_STATUS) !== ACTIVE_STATUS) return false;
  const expiresAt = clean(pause.expiresAt);
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() > now.getTime();
}

export function normalizeEmergencyScope(value) {
  const raw = clean(value);
  const aliases = new Map([
    ["platform", "Platform"],
    ["agent", "Agent"],
    ["capability", "Capability"],
    ["action", "Action"],
    ["action type", "Action"],
    ["policy", "Policy"],
    ["trading", "Trading"],
    ["contract", "Contract"],
    ["bridge", "Bridge"],
    ["x402", "x402"],
    ["machine payment", "x402"],
    ["all", "All Execution"],
    ["all execution", "All Execution"],
    ["all outgoing execution", "All Execution"],
  ]);
  const normalized = aliases.get(raw.toLowerCase()) || raw;
  return SCOPE_TYPES.has(normalized) ? normalized : "";
}

export function normalizeEmergencyAction(value, fallback = "Blocked") {
  const raw = clean(value);
  if (raw.toLowerCase() === "review" || raw.toLowerCase() === "review required") return "Review Required";
  if (raw.toLowerCase() === "block" || raw.toLowerCase() === "blocked") return "Blocked";
  return ENFORCEMENT_ACTIONS.has(raw) ? raw : fallback;
}

export function emergencyPauseMatches({ pause, request = {}, agent = {}, policy = {}, now = new Date() }) {
  if (!pauseIsActive(pause, now)) return false;
  const ownerWallet = normalizeComparable(agent.ownerWalletAddress);
  if (pause.ownerWalletAddress && ownerWallet && normalizeComparable(pause.ownerWalletAddress) !== ownerWallet) return false;

  const scopeType = normalizeEmergencyScope(pause.scopeType);
  const scopeValue = normalizeComparable(pause.scopeValue);
  switch (scopeType) {
    case "Platform":
    case "All Execution":
      return true;
    case "Agent":
      return normalizeComparable(pause.agentId || pause.scopeValue) === normalizeComparable(agent.id || request.agentId);
    case "Policy":
      return normalizeComparable(pause.policyId || pause.scopeValue) === normalizeComparable(policy.id);
    case "Capability":
      return asArray(agent.executionCapabilities).some((item) => normalizeComparable(item) === scopeValue);
    case "Action":
      return normalizeComparable(request.actionType) === scopeValue;
    case "Trading":
      return isTradingAction(request, agent);
    case "Contract":
      return isContractAction(request);
    case "Bridge":
      return request.actionType === "Bridge";
    case "x402":
      return request.actionType === "x402 Payment";
    default:
      return false;
  }
}

export function activeEmergencyPauses({ pauses = [], request = {}, agent = {}, policy = {}, now = new Date() }) {
  return asArray(pauses).filter((pause) => emergencyPauseMatches({ pause, request, agent, policy, now }));
}

export function evaluateEmergencyControls({ request = {}, agent = {}, policy = {}, pauses = [], now = new Date() }) {
  const matches = activeEmergencyPauses({ pauses, request, agent, policy, now });
  if (matches.length === 0) {
    return {
      hardBlock: false,
      needsReview: false,
      scoreDelta: 0,
      checksPassed: ["No active emergency pause applies to this request"],
      checksFailed: [],
      findings: [finding({
        status: "pass",
        rule: "Active emergency pause",
        message: "No active emergency pause applies to this request.",
        evidence: { agentId: agent?.id || request.agentId, actionType: request.actionType },
      })],
      context: { active: false, matchingPauses: [] },
    };
  }

  const blockPause = matches.find((pause) => normalizeEmergencyAction(pause.enforcementAction) === "Blocked");
  const effectiveDecision = blockPause ? "Blocked" : "Review Required";
  const selected = blockPause || matches[0];
  const evidence = {
    effectiveDecision,
    pauseCount: matches.length,
    matchingPauses: matches.map((pause) => ({
      id: pause.id,
      scopeType: normalizeEmergencyScope(pause.scopeType),
      scopeValue: pause.scopeValue || "",
      reason: pause.reason || "",
      triggerType: pause.triggerType || "Manual",
      triggerRule: pause.triggerRule || "",
      enforcementAction: normalizeEmergencyAction(pause.enforcementAction),
      createdAt: pause.createdAt || "",
      expiresAt: pause.expiresAt || "",
    })),
  };

  const message = effectiveDecision === "Blocked"
    ? `Execution is blocked by an active ${selected.scopeType || "emergency"} pause: ${selected.reason || "Emergency controls are active."}`
    : `Execution requires human review because an active ${selected.scopeType || "emergency"} pause applies: ${selected.reason || "Emergency controls are active."}`;
  return {
    hardBlock: effectiveDecision === "Blocked",
    needsReview: effectiveDecision === "Review Required",
    scoreDelta: effectiveDecision === "Blocked" ? 70 : 42,
    checksPassed: [],
    checksFailed: [message],
    findings: [finding({
      status: effectiveDecision === "Blocked" ? "fail" : "warning",
      severity: effectiveDecision === "Blocked" ? "critical" : "high",
      rule: "Active emergency pause",
      message,
      evidence,
      remediation: "Do not bypass the pause. Resolve the trigger, then use the authorized resume workflow and record a resume reason.",
    })],
    context: { active: true, effectiveDecision, matchingPauses: evidence.matchingPauses },
  };
}

function recentLogs(auditLogs, now, lookbackSeconds) {
  const cutoff = now.getTime() - lookbackSeconds * 1000;
  return asArray(auditLogs).filter((log) => {
    const ts = new Date(log.timestamp || log.createdAt || 0).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
}

function findingMatches(log, predicate) {
  return asArray(log?.moduleFindings).some(predicate);
}

function hasCurrentFinding(result, predicate) {
  return asArray(result?.moduleFindings).some(predicate);
}

export function detectAutomaticEmergencyTrigger({ request = {}, agent = {}, policy = {}, auditLogs = [], result = {}, now = new Date() }) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  if (!boolRule(rules.emergencyControlsEnabled, false) || !boolRule(rules.automaticPauseEnabled, false)) return null;

  const lookbackSeconds = boundedNumber(rules.emergencyLookbackSeconds, 3600, 60, 604800);
  const logs = recentLogs(auditLogs, now, lookbackSeconds).filter((log) => log.agentId === agent.id);
  const enforcementAction = normalizeEmergencyAction(rules.emergencyAutomaticPauseAction, "Blocked");
  const durationSeconds = boundedNumber(rules.emergencyPauseDurationSeconds, 3600, 60, 2592000);
  const base = { enforcementAction, durationSeconds, triggerType: "Automatic" };

  const replayThreshold = boundedNumber(rules.emergencyReplayAttemptThreshold, 1, 1, 100);
  const currentReplay = hasCurrentFinding(result, (item) => item.status === "fail" && /replay|duplicate fingerprint|idempotency/i.test(`${item.rule} ${item.message}`));
  const priorReplay = logs.filter((log) => findingMatches(log, (item) => item.status === "fail" && /replay|duplicate fingerprint|idempotency/i.test(`${item.rule} ${item.message}`))).length;
  if (currentReplay && priorReplay + 1 >= replayThreshold) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Replay-attempt threshold", reason: `Automatic pause activated after ${priorReplay + 1} replay or duplicate-execution finding${priorReplay + 1 === 1 ? "" : "s"} within ${lookbackSeconds} seconds.`, evidence: { count: priorReplay + 1, threshold: replayThreshold, lookbackSeconds } };
  }

  const threatMatch = hasCurrentFinding(result, (item) => item.module === "Threat Intelligence" && item.status === "fail");
  if (threatMatch && boolRule(rules.emergencyPauseOnThreatMatch, true)) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Threat-intelligence hard match", reason: "Automatic pause activated because Threat Intelligence produced a hard-block match.", evidence: { actionType: request.actionType, target: request.target } };
  }

  const oracleDisagreement = hasCurrentFinding(result, (item) => item.module === "Oracle Validation" && ["fail", "warning"].includes(item.status) && /disagreement|spread|source quorum|deviation/i.test(`${item.rule} ${item.message}`));
  if (oracleDisagreement && boolRule(rules.emergencyPauseOnOracleDisagreement, true)) {
    return { ...base, scopeType: "Trading", scopeValue: "Trading", agentId: agent.id, triggerRule: "Oracle disagreement", reason: "Automatic trading pause activated because oracle sources disagreed or the configured spread/deviation boundary was exceeded.", evidence: { actionType: request.actionType } };
  }

  const privilegedFailure = hasCurrentFinding(result, (item) => item.module === "Privileged Action Controls" && item.status === "fail");
  if (privilegedFailure && boolRule(rules.emergencyPauseOnPrivilegedActionFailure, true)) {
    return { ...base, scopeType: "Contract", scopeValue: "Contract", agentId: agent.id, triggerRule: "Privileged-action failure", reason: "Automatic contract-execution pause activated after a blocked privileged administrative action.", evidence: { target: request.target, entryPoint: request.entryPoint } };
  }

  const blockThreshold = boundedNumber(rules.emergencyRepeatedBlockThreshold, 5, 1, 1000);
  const priorBlocks = logs.filter((log) => log.decision === "Blocked").length;
  if (result.decision === "Blocked" && priorBlocks + 1 >= blockThreshold) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Repeated blocked attempts", reason: `Automatic pause activated after ${priorBlocks + 1} blocked request${priorBlocks + 1 === 1 ? "" : "s"} within ${lookbackSeconds} seconds.`, evidence: { count: priorBlocks + 1, threshold: blockThreshold, lookbackSeconds } };
  }

  const frequencyThreshold = boundedNumber(rules.emergencyRequestFrequencyThreshold, 120, 2, 100000);
  if (logs.length + 1 >= frequencyThreshold) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Request-frequency threshold", reason: `Automatic pause activated because ${logs.length + 1} requests were observed within ${lookbackSeconds} seconds.`, evidence: { count: logs.length + 1, threshold: frequencyThreshold, lookbackSeconds } };
  }

  const spendingMultiplier = boundedNumber(rules.emergencySpendingSpikeMultiplier, 5, 1.1, 1000);
  const allowedAmounts = logs.filter((log) => log.decision === "Allowed" && Number(log.amount || 0) > 0).map((log) => Number(log.amount));
  const average = allowedAmounts.length ? allowedAmounts.reduce((sum, value) => sum + value, 0) / allowedAmounts.length : 0;
  if (average > 0 && Number(request.amount || 0) >= average * spendingMultiplier) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Spending spike", reason: `Automatic pause activated because the requested amount is ${Number(request.amount || 0).toFixed(4)}, at least ${spendingMultiplier}× the recent allowed average of ${average.toFixed(4)}.`, evidence: { requestedAmount: Number(request.amount || 0), recentAverage: average, multiplier: spendingMultiplier, sampleSize: allowedAmounts.length } };
  }

  const unresolvedExecutionThreshold = boundedNumber(rules.emergencyUnresolvedExecutionThreshold, 5, 1, 1000);
  const unresolvedExecutions = logs.filter((log) => ["approved_pending_signature", "pending", "uncertain", "submitted", "x402_submitted", "x402_pending", "x402_uncertain"].includes(log.executionStatus)).length;
  if (unresolvedExecutions >= unresolvedExecutionThreshold) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Unresolved execution threshold", reason: `Automatic pause activated because ${unresolvedExecutions} execution or settlement records remain unresolved.`, evidence: { count: unresolvedExecutions, threshold: unresolvedExecutionThreshold } };
  }

  const x402Threshold = boundedNumber(rules.emergencyUnresolvedX402Threshold, 3, 1, 1000);
  const unresolvedX402 = logs.filter((log) => log.action === "x402 Payment" && ["x402_submitted", "x402_pending", "x402_uncertain"].includes(log.executionStatus)).length;
  if (unresolvedX402 >= x402Threshold) {
    return { ...base, scopeType: "x402", scopeValue: "x402", agentId: agent.id, triggerRule: "Unresolved x402 settlement threshold", reason: `Automatic x402 pause activated because ${unresolvedX402} machine-payment settlements remain unresolved.`, evidence: { count: unresolvedX402, threshold: x402Threshold } };
  }

  const bridgeThreshold = boundedNumber(rules.emergencyBridgeFailureThreshold, 3, 1, 1000);
  const bridgeFailures = logs.filter((log) => log.action === "Bridge" && ["failed", "uncertain", "execution_failed", "x402_failed"].includes(log.executionStatus)).length;
  if (bridgeFailures >= bridgeThreshold) {
    return { ...base, scopeType: "Bridge", scopeValue: "Bridge", agentId: agent.id, triggerRule: "Bridge failure threshold", reason: `Automatic bridge pause activated after ${bridgeFailures} failed or uncertain bridge executions.`, evidence: { count: bridgeFailures, threshold: bridgeThreshold } };
  }

  const providerFailureThreshold = boundedNumber(rules.emergencyProviderFailureThreshold, 3, 1, 1000);
  const proofFailures = logs.filter((log) => log.decisionProofStatus === "failed").length;
  if (proofFailures >= providerFailureThreshold) {
    return { ...base, scopeType: "Agent", scopeValue: agent.id, agentId: agent.id, triggerRule: "Casper proof-service failure threshold", reason: `Automatic pause activated because ${proofFailures} recent Casper decision proofs failed.`, evidence: { count: proofFailures, threshold: providerFailureThreshold } };
  }

  return null;
}

export function automaticPauseFinding(pause) {
  const effectiveDecision = normalizeEmergencyAction(pause?.enforcementAction, "Blocked");
  return finding({
    status: effectiveDecision === "Blocked" ? "fail" : "warning",
    severity: effectiveDecision === "Blocked" ? "critical" : "high",
    rule: clean(pause?.triggerRule || "Automatic circuit-breaker trigger"),
    message: clean(pause?.reason || "An automatic emergency pause was activated."),
    evidence: {
      pauseId: pause?.id || "",
      scopeType: pause?.scopeType || "",
      scopeValue: pause?.scopeValue || "",
      enforcementAction: effectiveDecision,
      triggerType: pause?.triggerType || "Automatic",
      expiresAt: pause?.expiresAt || "",
      triggerEvidence: pause?.triggerEvidence || {},
    },
    remediation: "Investigate and resolve the trigger. Keep execution paused until an authorized resume action is recorded.",
  });
}

export function emergencyControlPolicy(policy = {}) {
  const rules = policy?.structuredRules && typeof policy.structuredRules === "object" ? policy.structuredRules : {};
  return {
    enabled: boolRule(rules.emergencyControlsEnabled, false),
    automaticPauseEnabled: boolRule(rules.automaticPauseEnabled, false),
    automaticPauseAction: normalizeEmergencyAction(rules.emergencyAutomaticPauseAction, "Blocked"),
    pauseDurationSeconds: boundedNumber(rules.emergencyPauseDurationSeconds, 3600, 60, 2592000),
    resumeRequiresApproval: boolRule(rules.emergencyResumeRequiresApproval, false),
    resumeQuorum: Math.round(boundedNumber(rules.emergencyResumeQuorum, 1, 1, 10)),
  };
}

export const EMERGENCY_SCOPE_TYPES = [...SCOPE_TYPES];
