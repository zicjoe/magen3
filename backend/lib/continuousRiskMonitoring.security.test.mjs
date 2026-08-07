import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMonitorDefinition, reconcileMonitoringAlerts } from "./continuousRiskMonitoring.mjs";

test("continuous monitoring rejects request-controlled endpoints and credentials", () => {
  for (const configuration of [
    { providerUrl: "http://127.0.0.1:9999" },
    { rpc_url: "http://169.254.169.254/latest/meta-data" },
    { nested: { apiKey: "secret" } },
    { authorization: "Bearer secret" },
  ]) {
    assert.throws(() => normalizeMonitorDefinition({ agentId: "AGT_1", configuration }), /must not contain request-controlled provider endpoints or credentials/);
  }
});

test("continuous monitoring bounds cadence and alert history", () => {
  const monitor = normalizeMonitorDefinition({ id: "MON_1", agentId: "AGT_1", ownerWalletAddress: "wallet", cadenceSeconds: 1 });
  assert.equal(monitor.cadenceSeconds, 60);
  const existing = [{ id: "ALT_1", monitorId: "MON_1", ownerWalletAddress: "wallet", agentId: "AGT_1", subject: "AGT_1", subjectType: "Agent", severity: "High", category: "agent-health", trigger: "x", evidence: {}, evidenceHash: "h", firstObservedAt: new Date(0).toISOString(), lastObservedAt: new Date(0).toISOString(), occurrenceCount: 80, deduplicationKey: "agent-health:x", status: "Open", history: Array.from({length: 100}, (_, i) => ({ i })) }];
  const result = reconcileMonitoringAlerts({ monitor, observations: [], existingAlerts: existing, now: new Date("2026-08-07T12:00:00Z") });
  assert.equal(result.recoveries.length, 1);
  assert.ok(result.recoveries[0].history.length <= 50);
});
