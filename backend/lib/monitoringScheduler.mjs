let timer = null;
let running = false;

function enabled() { return String(process.env.MONITORING_SCHEDULER_ENABLED || "false").toLowerCase() === "true"; }
function intervalMs() { return Math.max(60_000, Math.min(3_600_000, Number(process.env.MONITORING_SCHEDULER_INTERVAL_MS || 60_000))); }

export function monitoringSchedulerStatus() {
  return { enabled: enabled(), running: Boolean(timer), inProgress: running, intervalMs: intervalMs() };
}

export function startMonitoringScheduler(store, { logger = console } = {}) {
  if (!enabled() || timer || !store?.runScheduledMonitoringCycle) return monitoringSchedulerStatus();
  const tick = async () => {
    if (running) return;
    running = true;
    try { await store.runScheduledMonitoringCycle({ now: new Date() }); }
    catch (error) { logger.error?.("[monitoring] scheduled evaluation failed", String(error?.message || error)); }
    finally { running = false; }
  };
  timer = setInterval(tick, intervalMs());
  timer.unref?.();
  void tick();
  return monitoringSchedulerStatus();
}

export function stopMonitoringScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}
