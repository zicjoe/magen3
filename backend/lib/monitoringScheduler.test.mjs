import test from "node:test";
import assert from "node:assert/strict";
import { startMonitoringScheduler, stopMonitoringScheduler, monitoringSchedulerStatus } from "./monitoringScheduler.mjs";

test("monitoring scheduler is opt-in and bounded", async () => {
  const oldEnabled = process.env.MONITORING_SCHEDULER_ENABLED;
  const oldInterval = process.env.MONITORING_SCHEDULER_INTERVAL_MS;
  try {
    process.env.MONITORING_SCHEDULER_ENABLED = "true";
    process.env.MONITORING_SCHEDULER_INTERVAL_MS = "1";
    let calls = 0;
    const result = startMonitoringScheduler({ async runScheduledMonitoringCycle() { calls += 1; return { ok: true }; } });
    assert.equal(result.enabled, true);
    assert.equal(monitoringSchedulerStatus().intervalMs, 60000);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(calls >= 1);
  } finally {
    stopMonitoringScheduler();
    if (oldEnabled === undefined) delete process.env.MONITORING_SCHEDULER_ENABLED; else process.env.MONITORING_SCHEDULER_ENABLED = oldEnabled;
    if (oldInterval === undefined) delete process.env.MONITORING_SCHEDULER_INTERVAL_MS; else process.env.MONITORING_SCHEDULER_INTERVAL_MS = oldInterval;
  }
});
