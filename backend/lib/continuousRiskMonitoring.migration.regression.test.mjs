import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, "../db/migrate.mjs");
const storePath = path.resolve(here, "../store/postgresStore.mjs");

test("Railway imported migration path creates continuous monitoring tables", () => {
  const source = fs.readFileSync(migrationPath, "utf8");
  const runStart = source.indexOf("export async function runMigrations()");
  const directStart = source.indexOf("if (import.meta.url === `file://${process.argv[1]}`)");
  const monitorTable = source.indexOf("CREATE TABLE IF NOT EXISTS monitoring_monitors");
  const alertTable = source.indexOf("CREATE TABLE IF NOT EXISTS monitoring_alerts");

  assert.ok(runStart >= 0, "runMigrations export must exist");
  assert.ok(directStart > runStart, "direct-execution block must follow runMigrations");
  assert.ok(monitorTable > runStart && monitorTable < directStart, "monitoring_monitors must be created by runMigrations, including Railway imports");
  assert.ok(alertTable > runStart && alertTable < directStart, "monitoring_alerts must be created by runMigrations, including Railway imports");
  assert.equal(source.indexOf("CREATE TABLE IF NOT EXISTS monitoring_monitors", monitorTable + 1), -1, "monitoring table DDL should not be duplicated in a direct-only path");
});

test("legacy bootstrap remains independent from optional continuous monitoring", () => {
  const source = fs.readFileSync(storePath, "utf8");
  const bootstrapStart = source.indexOf("async bootstrap(walletAddress)");
  const monitoringStart = source.indexOf("async listMonitoring(walletAddress)", bootstrapStart);
  assert.ok(bootstrapStart >= 0 && monitoringStart > bootstrapStart);
  const bootstrapSource = source.slice(bootstrapStart, monitoringStart);
  assert.doesNotMatch(bootstrapSource, /monitoringMonitorsTable|monitoringAlertsTable|monitoring:/);
  assert.match(bootstrapSource, /agents, policies, auditLogs, approvals, emergencyPauses/);
  assert.match(bootstrapSource, /Promise\.allSettled/);
  assert.match(source.slice(monitoringStart, monitoringStart + 1500), /monitoringMonitorsTable/);
});
