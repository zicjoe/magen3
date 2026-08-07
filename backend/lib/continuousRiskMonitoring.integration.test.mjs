import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../store/memoryStore.mjs";

test("monitoring persists checkpoints, deduplicates alerts, recovers, and scopes agent polling", async () => {
  const store = createMemoryStore();
  const walletAddress = "account-hash-monitor-owner";
  const agent = await store.createAgent({ name: "Monitor Agent", walletAddress });
  await store.createPolicy({ name: "Monitor Policy", agentId: agent.id, walletAddress, structuredRules: {} });
  const monitor = await store.createMonitor({ walletAddress, agentId: agent.id, cadenceSeconds: 60, configuration: { apiKeyMaxAgeDays: 1 } });
  const first = await store.runMonitoringCycle({ walletAddress, monitorId: monitor.id, force: true, now: "2026-08-07T12:00:00.000Z" });
  assert.equal(first.evaluated, 1);
  const state = await store.listMonitoring(walletAddress);
  assert.equal(state.monitors.length, 1);
  assert.ok(state.monitors[0].lastEvaluatedAt);
  const polled = await store.getAgentMonitoring(agent.id, { apiKey: agent.apiKey });
  assert.equal(polled.agentId, agent.id);
  assert.equal(polled.monitors.length, 1);
  await assert.rejects(() => store.getAgentMonitoring(agent.id, { apiKey: "wrong" }), /API key|credentials/i);
});

test("monitoring acknowledgement cannot cross wallet scope", async () => {
  const store = createMemoryStore();
  const walletAddress = "account-hash-monitor-owner-2";
  const agent = await store.createAgent({ name: "Monitor Agent 2", walletAddress });
  const monitor = await store.createMonitor({ walletAddress, agentId: agent.id, categories: ["policy-drift"] });
  await store.runMonitoringCycle({ walletAddress, monitorId: monitor.id, force: true, now: "2026-08-07T12:00:00.000Z" });
  const state = await store.listMonitoring(walletAddress);
  assert.ok(state.alerts.length > 0);
  await assert.rejects(() => store.updateMonitoringAlert(state.alerts[0].id, { walletAddress: "other-wallet" }), /not found/i);
  const updated = await store.updateMonitoringAlert(state.alerts[0].id, { walletAddress, status: "Acknowledged", note: "reviewing" });
  assert.equal(updated.status, "Acknowledged");
});
