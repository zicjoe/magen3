import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeMonitoringAlert, evaluateMonitor, monitoringEvidenceHash, normalizeMonitorDefinition, reconcileMonitoringAlerts } from "./continuousRiskMonitoring.mjs";

const monitor = normalizeMonitorDefinition({ id: "MON-1", ownerWalletAddress: "wallet", agentId: "AG-1", configuration: { maxPendingSeconds: 60, apiKeyMaxAgeDays: 1 } });
const now = new Date("2026-08-07T12:00:00.000Z");

test("monitor normalization bounds cadence and categories", () => {
  const value = normalizeMonitorDefinition({ cadenceSeconds: 1, categories: ["execution", "bad"] }, { now });
  assert.equal(value.cadenceSeconds, 60);
  assert.deepEqual(value.categories, ["execution"]);
});

test("monitor detects missing policy, old key, provider degradation and delayed execution", () => {
  const result = evaluateMonitor({ monitor, agent: { id: "AG-1", status: "Active", apiKeyIssuedAt: "2026-08-01T00:00:00.000Z" }, policy: null, auditLogs: [{ id: "AUD-1", timestamp: "2026-08-07T10:00:00.000Z", executionStatus: "pending", action: "Transfer", moduleFindings: [] }], providerSnapshots: { oracleValidation: { status: "stale", provider: "pyth" } }, now });
  assert.ok(result.observations.some((x) => x.category === "policy-drift"));
  assert.ok(result.observations.some((x) => x.category === "api-key-health"));
  assert.ok(result.observations.some((x) => x.category === "oracle"));
  assert.ok(result.observations.some((x) => x.category === "execution"));
});

test("monitor records provider state change and policy fingerprint drift from checkpoint", () => {
  const policy = { id: "POL-1", status: "Active", structuredRules: { a: 2 }, capabilityScope: [] };
  const result = evaluateMonitor({ monitor, agent: { id: "AG-1", status: "Active", createdAt: now }, policy, providerSnapshots: { complianceControls: { status: "healthy", provider: "ofac_api" } }, checkpoint: { policyFingerprint: monitoringEvidenceHash({ old: true }), providers: { complianceControls: { state: "degraded" } } }, now });
  assert.ok(result.observations.some((x) => x.category === "configuration-drift"));
  assert.ok(result.observations.some((x) => x.category === "provider-health"));
});

test("alert reconciliation deduplicates occurrences and recovers cleared alerts", () => {
  const observation = { category: "execution", severity: "High", subject: "AUD", subjectType: "Execution", trigger: "Delayed", evidence: {}, evidenceHash: "hash", deduplicationKey: "key", suggestedResolution: "Resolve" };
  const first = reconcileMonitoringAlerts({ monitor, observations: [observation], existingAlerts: [], now });
  assert.equal(first.upserts[0].occurrenceCount, 1);
  const existing = { ...first.upserts[0], id: "ALT-1" };
  const second = reconcileMonitoringAlerts({ monitor, observations: [observation], existingAlerts: [existing], now: new Date("2026-08-07T12:01:00Z") });
  assert.equal(second.upserts[0].occurrenceCount, 2);
  const recovered = reconcileMonitoringAlerts({ monitor, observations: [], existingAlerts: [existing], now });
  assert.equal(recovered.recoveries[0].status, "Recovered");
});

test("alert acknowledgement is bounded and validates states", () => {
  const alert = { id: "ALT", status: "Open" };
  assert.equal(acknowledgeMonitoringAlert(alert, { walletAddress: "w", note: "investigating" }, { now }).status, "Acknowledged");
  assert.throws(() => acknowledgeMonitoringAlert(alert, { status: "Deleted" }, { now }), /Invalid/);
});

test("automated monitoring actions require both monitor opt-in and active policy authorization", async () => {
  const { selectAuthorizedMonitoringAction } = await import("./continuousRiskMonitoring.mjs");
  const action = selectAuthorizedMonitoringAction({ monitor: { automatedActions: { agentPauseOnCritical: true } }, policy: { structuredRules: { monitoringAutomatedActions: ["agent-pause"] } }, observations: [{ severity: "Critical", category: "execution" }] });
  assert.equal(action.key, "agent-pause");
  assert.equal(selectAuthorizedMonitoringAction({ monitor: { automatedActions: { agentPauseOnCritical: true } }, policy: { structuredRules: {} }, observations: [{ severity: "Critical" }] }), null);
});
