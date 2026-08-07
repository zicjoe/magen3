import crypto from "node:crypto";

const ALERT_STATUSES = new Set(["Open", "Acknowledged", "Investigating", "Resolved", "Suppressed", "Recovered"]);
const SEVERITIES = new Set(["Info", "Low", "Medium", "High", "Critical"]);
const MONITOR_CATEGORIES = new Set([
  "agent-health", "integration-health", "api-key-health", "policy-drift", "configuration-drift",
  "provider-health", "rpc-health", "wallet-behavior", "exposure", "approval-exposure", "execution",
  "bridge-delivery", "x402-settlement", "metered-authorization", "resource-delivery", "asset-risk",
  "contract-risk", "threat-intelligence", "oracle", "compliance", "simulation", "market-risk"
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function monitoringEvidenceHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value ?? null))).digest("hex");
}

function iso(value, fallback = "") {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
}

function ageSeconds(value, nowMs) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? Math.max(0, Math.floor((nowMs - time) / 1000)) : null;
}

function boundedObject(value, maxKeys = 16) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, maxKeys).map(([key, item]) => [String(key).slice(0, 80), typeof item === "string" ? item.slice(0, 500) : item]));
}

function configuredCategories(monitor) {
  const values = Array.isArray(monitor?.categories) ? monitor.categories : [];
  return new Set(values.filter((item) => MONITOR_CATEGORIES.has(String(item))));
}

function pushObservation(out, monitor, input) {
  const category = String(input.category || "integration-health");
  const categories = configuredCategories(monitor);
  if (categories.size && !categories.has(category)) return;
  const severity = SEVERITIES.has(input.severity) ? input.severity : "Medium";
  const subjectType = String(input.subjectType || monitor.subjectType || "Agent").slice(0, 80);
  const subject = String(input.subject || monitor.subject || monitor.agentId || "unknown").slice(0, 300);
  const trigger = String(input.trigger || "Monitoring rule matched").slice(0, 500);
  const evidence = boundedObject(input.evidence);
  out.push({
    category,
    severity,
    subjectType,
    subject,
    trigger,
    evidence,
    evidenceHash: monitoringEvidenceHash({ category, subjectType, subject, trigger, evidence }),
    deduplicationKey: monitoringEvidenceHash({ monitorId: monitor.id, category, subjectType, subject, rule: input.rule || trigger }),
    suggestedResolution: String(input.suggestedResolution || "Review the monitored condition and resolve the underlying cause.").slice(0, 700),
    automatedAction: input.automatedAction || null,
  });
}

function providerStatus(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { state: "unavailable", provider: "" };
  const provider = snapshot.provider || snapshot.selectedProvider || snapshot.providerId || "";
  const raw = String(snapshot.status || snapshot.state || snapshot.availability || snapshot.health || "").toLowerCase();
  const state = raw.includes("healthy") || raw === "available" || raw === "ready" || raw === "ok" || raw === "configured" ? "healthy"
    : raw.includes("degrad") || raw.includes("rate") ? "degraded"
    : raw.includes("unsupported") ? "unsupported"
    : raw.includes("stale") ? "stale"
    : raw ? raw : "unavailable";
  return { state, provider: String(provider), evidenceHash: snapshot.evidenceHash || snapshot.providerEvidenceHash || "" };
}

const FORBIDDEN_MONITORING_CONFIG_KEYS = new Set(["providerurl", "rpcurl", "endpoint", "apikey", "authorization", "secret", "privatekey", "seedphrase", "mnemonic"]);

function assertSafeMonitoringConfiguration(value, depth = 0) {
  if (depth > 4 || value == null) return;
  if (Array.isArray(value)) { for (const item of value.slice(0, 50)) assertSafeMonitoringConfiguration(item, depth + 1); return; }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (FORBIDDEN_MONITORING_CONFIG_KEYS.has(normalizedKey)) {
      const error = new Error(`Continuous monitoring configuration must not contain request-controlled provider endpoints or credentials (${key}).`);
      error.status = 400;
      throw error;
    }
    assertSafeMonitoringConfiguration(item, depth + 1);
  }
}

export function normalizeMonitorDefinition(input = {}, { now = new Date() } = {}) {
  assertSafeMonitoringConfiguration(input.configuration);
  assertSafeMonitoringConfiguration(input.automatedActions);
  const cadenceSeconds = Math.min(86400, Math.max(60, Number(input.cadenceSeconds || 300)));
  const categories = [...new Set((Array.isArray(input.categories) ? input.categories : [
    "agent-health", "api-key-health", "policy-drift", "provider-health", "execution", "bridge-delivery",
    "x402-settlement", "metered-authorization", "resource-delivery", "threat-intelligence", "oracle", "compliance",
    "configuration-drift"
  ]).map(String).filter((item) => MONITOR_CATEGORIES.has(item)))];
  return {
    id: String(input.id || "").trim(),
    ownerWalletAddress: String(input.ownerWalletAddress || input.walletAddress || "").trim(),
    agentId: String(input.agentId || "").trim(),
    name: String(input.name || "Continuous risk monitor").trim().slice(0, 160),
    subject: String(input.subject || input.agentId || "").trim().slice(0, 300),
    subjectType: String(input.subjectType || "Agent").trim().slice(0, 80),
    categories,
    cadenceSeconds,
    enabled: input.enabled !== false,
    severityThreshold: SEVERITIES.has(input.severityThreshold) ? input.severityThreshold : "Medium",
    automatedActions: boundedObject(input.automatedActions, 12),
    configuration: boundedObject(input.configuration, 24),
    createdAt: iso(input.createdAt, now.toISOString()),
    updatedAt: iso(input.updatedAt, now.toISOString()),
    lastEvaluatedAt: iso(input.lastEvaluatedAt),
    nextEvaluationAt: iso(input.nextEvaluationAt),
    status: input.enabled === false ? "Paused" : String(input.status || "Active"),
  };
}

export function evaluateMonitor({ monitor, agent, policy, auditLogs = [], providerSnapshots = {}, checkpoint = {}, now = new Date() }) {
  const normalized = normalizeMonitorDefinition(monitor, { now });
  if (!normalized.enabled) return { observations: [], checkpoint: checkpoint || {}, evaluatedAt: now.toISOString() };
  const out = [];
  const nowMs = now.getTime();
  const config = normalized.configuration || {};
  const agentSubject = agent?.id || normalized.agentId || normalized.subject;

  if (!agent || agent.status === "Revoked") {
    pushObservation(out, normalized, { category: "agent-health", severity: "High", subject: agentSubject, trigger: agent ? "Agent is revoked" : "Registered monitoring agent is unavailable", rule: "agent-unavailable", evidence: { status: agent?.status || "missing" }, suggestedResolution: "Restore the expected agent registration or pause this monitor." });
  }
  if (agent && agent.status === "Active" && !policy) {
    pushObservation(out, normalized, { category: "policy-drift", severity: "High", subject: agentSubject, trigger: "Agent has no active policy", rule: "active-policy-missing", evidence: { agentId: agent.id }, suggestedResolution: "Attach and activate a policy before allowing autonomous execution." });
  }
  if (agent) {
    const maxAgeDays = Math.min(3650, Math.max(1, Number(config.apiKeyMaxAgeDays || 90)));
    const age = ageSeconds(agent.apiKeyRotatedAt || agent.apiKeyIssuedAt || agent.createdAt, nowMs);
    if (age != null && age > maxAgeDays * 86400) {
      pushObservation(out, normalized, { category: "api-key-health", severity: "Medium", subject: agentSubject, trigger: "Agent API key exceeds configured rotation age", rule: "api-key-age", evidence: { ageSeconds: age, maximumAgeSeconds: maxAgeDays * 86400, apiKeyPreview: agent.apiKeyPreview || "" }, suggestedResolution: "Rotate the agent API key and update the connected integration." });
    }
  }

  if (policy) {
    const policyFingerprint = monitoringEvidenceHash({ id: policy.id, status: policy.status, structuredRules: policy.structuredRules || {}, capabilityScope: policy.capabilityScope || [] });
    if (checkpoint.policyFingerprint && checkpoint.policyFingerprint !== policyFingerprint) {
      pushObservation(out, normalized, { category: "configuration-drift", severity: "Medium", subject: policy.id, subjectType: "Policy", trigger: "Policy configuration changed since the previous monitoring checkpoint", rule: "policy-fingerprint-change", evidence: { previousFingerprint: checkpoint.policyFingerprint, currentFingerprint: policyFingerprint }, suggestedResolution: "Review and acknowledge the policy change before relying on prior monitoring assumptions." });
    }
  }

  for (const [kind, snapshot] of Object.entries(providerSnapshots || {})) {
    const category = kind === "threatIntelligence" ? "threat-intelligence" : kind === "oracleValidation" ? "oracle" : kind === "complianceControls" ? "compliance" : kind === "rpcChainIntegrity" ? "rpc-health" : "provider-health";
    const current = providerStatus(snapshot);
    if (["unavailable", "degraded", "stale", "timed_out", "rate_limited", "error"].some((state) => current.state.includes(state))) {
      pushObservation(out, normalized, { category, severity: current.state === "stale" ? "High" : "Medium", subject: current.provider || kind, subjectType: "Provider", trigger: `${kind} provider is ${current.state}`, rule: `${kind}-provider-health`, evidence: { state: current.state, provider: current.provider, evidenceHash: current.evidenceHash || "" }, suggestedResolution: "Restore provider health or apply the configured degraded-mode policy; do not treat unavailable evidence as zero risk." });
    }
    const previous = checkpoint.providers?.[kind];
    if (previous?.state && previous.state !== current.state) {
      pushObservation(out, normalized, { category: "provider-health", severity: "Medium", subject: current.provider || kind, subjectType: "Provider", trigger: `${kind} provider state changed`, rule: `${kind}-provider-state-change`, evidence: { previousState: previous.state, currentState: current.state }, suggestedResolution: "Review the provider transition and confirm policies still handle the current evidence state safely." });
    }
  }

  const maxPendingSeconds = Math.min(604800, Math.max(60, Number(config.maxPendingSeconds || 1800)));
  const maxUncertainSeconds = Math.min(604800, Math.max(60, Number(config.maxUncertainSeconds || 900)));
  const boundedAudits = Array.isArray(auditLogs) ? auditLogs.slice(0, 250) : [];
  for (const audit of boundedAudits) {
    const updatedAge = ageSeconds(audit.executionUpdatedAt || audit.timestamp, nowMs) ?? 0;
    const executionStatus = String(audit.executionStatus || "").toLowerCase();
    if ((executionStatus.includes("pending") || executionStatus === "submitted") && updatedAge > maxPendingSeconds) {
      pushObservation(out, normalized, { category: "execution", severity: "High", subject: audit.id, subjectType: "Execution", trigger: "Pending execution exceeded monitoring threshold", rule: "execution-pending-delayed", evidence: { auditLogId: audit.id, executionStatus, ageSeconds: updatedAge, maximumAgeSeconds: maxPendingSeconds, transactionHash: audit.executionTxHash || "" }, suggestedResolution: "Poll the existing reconciliation lifecycle and resolve or classify the delayed execution before retrying." });
    }
    if (executionStatus.includes("uncertain") && updatedAge > maxUncertainSeconds) {
      pushObservation(out, normalized, { category: "execution", severity: "High", subject: audit.id, subjectType: "Execution", trigger: "Uncertain execution remains unresolved", rule: "execution-uncertain-unresolved", evidence: { auditLogId: audit.id, ageSeconds: updatedAge, transactionHash: audit.executionTxHash || "" }, suggestedResolution: "Resolve the existing reconciliation record before any duplicate submission or replacement." });
    }
    if (String(audit.action || "").toLowerCase().includes("bridge") && ["pending", "submitted", "uncertain"].some((s) => executionStatus.includes(s)) && updatedAge > maxPendingSeconds) {
      pushObservation(out, normalized, { category: "bridge-delivery", severity: "High", subject: audit.id, subjectType: "Bridge transfer", trigger: "Bridge delivery is delayed", rule: "bridge-delivery-delayed", evidence: { auditLogId: audit.id, executionStatus, ageSeconds: updatedAge }, suggestedResolution: "Use the existing bridge provider polling and reconciliation flow; do not resubmit blindly." });
    }
    if (String(audit.action || "").toLowerCase().includes("x402")) {
      const settlement = String(audit.settlementStatus || "").toLowerCase();
      const delivery = String(audit.resourceDeliveryStatus || "").toLowerCase();
      if (["pending", "uncertain", "submitted"].some((s) => settlement.includes(s)) && updatedAge > maxPendingSeconds) {
        pushObservation(out, normalized, { category: "x402-settlement", severity: "High", subject: audit.id, subjectType: "x402 settlement", trigger: "x402 settlement is delayed", rule: "x402-settlement-delayed", evidence: { auditLogId: audit.id, settlementStatus: settlement, ageSeconds: updatedAge }, suggestedResolution: "Reconcile the existing x402 settlement before authorizing a replacement payment." });
      }
      if (settlement === "confirmed" && delivery && !["delivered", "confirmed", "not_required"].includes(delivery) && updatedAge > maxPendingSeconds) {
        pushObservation(out, normalized, { category: "resource-delivery", severity: "High", subject: audit.id, subjectType: "Protected resource", trigger: "Paid x402 resource delivery is missing after settlement", rule: "x402-resource-delivery-missing", evidence: { auditLogId: audit.id, settlementStatus: settlement, resourceDeliveryStatus: delivery }, suggestedResolution: "Retry protected resource delivery without authorizing or settling a duplicate payment." });
      }
    }
    for (const finding of Array.isArray(audit.moduleFindings) ? audit.moduleFindings.slice(0, 50) : []) {
      const module = String(finding?.module || finding?.rule || "").toLowerCase();
      if (module.includes("exposure") && ["High", "Critical"].includes(finding?.severity)) {
        pushObservation(out, normalized, { category: "exposure", severity: finding.severity, subject: audit.id, subjectType: "Exposure", trigger: "Existing exposure control recorded a high-severity finding", rule: `exposure-${finding.code || finding.rule || "finding"}`, evidence: { auditLogId: audit.id, findingCode: finding.code || "", evidenceHash: finding.evidenceHash || "" }, suggestedResolution: finding.remediation || finding.suggestedResolution || "Reduce or release the existing exposure before new execution." });
      }
    }
  }

  const nextCheckpoint = {
    version: 1,
    observedAt: now.toISOString(),
    policyFingerprint: policy ? monitoringEvidenceHash({ id: policy.id, status: policy.status, structuredRules: policy.structuredRules || {}, capabilityScope: policy.capabilityScope || [] }) : "",
    providers: Object.fromEntries(Object.entries(providerSnapshots || {}).map(([kind, snapshot]) => [kind, providerStatus(snapshot)])),
    observationKeys: out.map((item) => item.deduplicationKey).sort(),
  };
  return { observations: out.slice(0, 100), checkpoint: nextCheckpoint, evaluatedAt: now.toISOString() };
}

export function reconcileMonitoringAlerts({ monitor, observations = [], existingAlerts = [], now = new Date() }) {
  const nowIso = now.toISOString();
  const activeByKey = new Map((existingAlerts || []).filter((a) => !["Resolved", "Recovered"].includes(a.status)).map((a) => [a.deduplicationKey, a]));
  const observedKeys = new Set(observations.map((o) => o.deduplicationKey));
  const upserts = observations.map((observation) => {
    const existing = activeByKey.get(observation.deduplicationKey);
    return existing ? {
      ...existing,
      severity: observation.severity,
      trigger: observation.trigger,
      evidence: observation.evidence,
      evidenceHash: observation.evidenceHash,
      lastObservedAt: nowIso,
      occurrenceCount: Math.max(1, Number(existing.occurrenceCount || 1)) + 1,
      recoveryStatus: "Active",
      history: [...(Array.isArray(existing.history) ? existing.history.slice(-49) : []), { type: "observed", at: nowIso, evidenceHash: observation.evidenceHash }],
      updatedAt: nowIso,
    } : {
      id: "",
      monitorId: monitor.id,
      ownerWalletAddress: monitor.ownerWalletAddress,
      agentId: monitor.agentId || "",
      subject: observation.subject,
      subjectType: observation.subjectType,
      severity: observation.severity,
      category: observation.category,
      trigger: observation.trigger,
      evidence: observation.evidence,
      evidenceHash: observation.evidenceHash,
      firstObservedAt: nowIso,
      lastObservedAt: nowIso,
      occurrenceCount: 1,
      deduplicationKey: observation.deduplicationKey,
      status: "Open",
      acknowledgement: {},
      assignedReviewer: "",
      recoveryStatus: "Active",
      automatedAction: observation.automatedAction || null,
      auditReference: "",
      suggestedResolution: observation.suggestedResolution,
      history: [{ type: "opened", at: nowIso, evidenceHash: observation.evidenceHash }],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });
  const recoveries = (existingAlerts || []).filter((alert) => !["Resolved", "Recovered", "Suppressed"].includes(alert.status) && !observedKeys.has(alert.deduplicationKey)).map((alert) => ({ ...alert, status: "Recovered", recoveryStatus: "Recovered", lastObservedAt: nowIso, history: [...(Array.isArray(alert.history) ? alert.history.slice(-49) : []), { type: "recovered", at: nowIso }], updatedAt: nowIso }));
  return { upserts, recoveries };
}

export function acknowledgeMonitoringAlert(alert, input = {}, { now = new Date() } = {}) {
  if (!alert) throw Object.assign(new Error("Monitoring alert not found"), { status: 404 });
  const requested = String(input.status || "Acknowledged");
  if (!ALERT_STATUSES.has(requested)) throw Object.assign(new Error("Invalid monitoring alert status"), { status: 400 });
  return {
    ...alert,
    status: requested,
    acknowledgement: requested === "Acknowledged" || requested === "Investigating" ? { note: String(input.note || "").slice(0, 1000), acknowledgedBy: String(input.acknowledgedBy || input.walletAddress || "").slice(0, 300), acknowledgedAt: now.toISOString() } : (alert.acknowledgement || {}),
    assignedReviewer: String(input.assignedReviewer ?? alert.assignedReviewer ?? "").slice(0, 300),
    history: [...(Array.isArray(alert.history) ? alert.history.slice(-49) : []), { type: "status_changed", status: requested, at: now.toISOString(), by: String(input.acknowledgedBy || input.walletAddress || "").slice(0, 300) }],
    updatedAt: now.toISOString(),
  };
}

export function continuousRiskMonitoringStatus() {
  return {
    status: "live",
    milestone: 28,
    deterministic: true,
    schedulerEnabled: String(process.env.MONITORING_SCHEDULER_ENABLED || "false").toLowerCase() === "true",
    minimumCadenceSeconds: 60,
    maximumObservationsPerRun: 100,
    maximumAuditsPerEvaluation: 250,
    alertStatuses: [...ALERT_STATUSES],
    categories: [...MONITOR_CATEGORIES],
    supports: ["scheduled evaluation", "manual evaluation", "persistent checkpoints", "deduplicated alerts", "recovery detection", "acknowledgement", "provider state transitions", "execution and delivery delay detection", "policy/configuration drift"],
    securityBoundary: "Monitoring consumes bounded existing Magen3 state and provider summaries. It does not create a second authorization engine, does not receive signing material, and does not place operational evidence on Casper.",
  };
}

export function selectAuthorizedMonitoringAction({ monitor, policy, observations = [] }) {
  const authorized = new Set(Array.isArray(policy?.structuredRules?.monitoringAutomatedActions) ? policy.structuredRules.monitoringAutomatedActions.map(String) : []);
  const config = monitor?.automatedActions && typeof monitor.automatedActions === "object" ? monitor.automatedActions : {};
  const hasCritical = observations.some((item) => item.severity === "Critical");
  const hasHigh = observations.some((item) => ["High", "Critical"].includes(item.severity));
  const candidates = [
    { key: "agent-pause", enabled: config.agentPauseOnCritical === true && hasCritical, scopeType: "Agent", enforcementAction: "Blocked" },
    { key: "bridge-retry-prevention", enabled: config.bridgeRetryPreventionOnHigh === true && hasHigh && observations.some((item) => item.category === "bridge-delivery"), scopeType: "Bridge", enforcementAction: "Blocked" },
    { key: "x402-pause", enabled: config.x402PauseOnHigh === true && hasHigh && observations.some((item) => ["x402-settlement", "resource-delivery", "metered-authorization"].includes(item.category)), scopeType: "x402", enforcementAction: "Blocked" },
    { key: "increased-review", enabled: config.increasedReviewOnHigh === true && hasHigh, scopeType: "Agent", enforcementAction: "Review Required" },
  ];
  return candidates.find((item) => item.enabled && authorized.has(item.key)) || null;
}
