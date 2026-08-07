import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const APP_URL = new URL("../../src/app/App.tsx", import.meta.url);
const API_URL = new URL("../../src/app/lib/api.ts", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

function componentSlice(app, name, nextMarker) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = app.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `${name} end marker must exist`);
  return app.slice(start, end);
}

test("runtime status refreshes cannot poison React state with undefined payloads", async () => {
  const app = await source(APP_URL);

  assert.match(app, /function normalizeStatusObject<T extends object>\(value: unknown, fallback: T\): T/);
  assert.match(app, /setThreatIntelligenceStatus\(normalizeStatusObject\(payload\?\.threatIntelligence/);
  assert.match(app, /setOracleValidationStatus\(normalizeStatusObject\(payload\?\.oracleValidation/);
  assert.match(app, /setComplianceControlsStatus\(normalizeStatusObject\(payload\?\.complianceControls/);
  assert.match(app, /setContinuousRiskMonitoringStatus\(normalizeStatusObject\(payload\?\.continuousRiskMonitoring/);
  assert.match(app, /setX402PaymentControlsStatus\(normalizeStatusObject\(payload\?\.x402PaymentControls/);
});

test("Dashboard and Settings normalize runtime status props before reading status", async () => {
  const app = await source(APP_URL);
  const dashboard = componentSlice(app, "DashboardPage", "// ──────────────────────────────────────────────────────────\n// Connected Agents");
  const settings = componentSlice(app, "SettingsPage", "// ──────────────────────────────────────────────────────────\n// App");

  for (const component of [dashboard, settings]) {
    assert.match(component, /safeThreatIntelligenceStatus = normalizeStatusObject/);
    assert.match(component, /safeOracleValidationStatus = normalizeStatusObject/);
    assert.match(component, /safeComplianceControlsStatus = normalizeStatusObject/);
    assert.match(component, /safeX402PaymentControlsStatus = normalizeStatusObject/);
    assert.doesNotMatch(component, /(?<!safe)threatIntelligenceStatus\.status/);
    assert.doesNotMatch(component, /(?<!safe)oracleValidationStatus\.status/);
    assert.doesNotMatch(component, /(?<!safe)complianceControlsStatus\.status/);
    assert.doesNotMatch(component, /(?<!safe)x402PaymentControlsStatus\.status/);
  }
});

test("API client normalizes the deployed base URL and rejects non-JSON HTML without poisoning state", async () => {
  const api = await source(API_URL);
  assert.doesNotMatch(api, /response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
  assert.ok(api.includes('const API_BASE_URL = RAW_API_BASE_URL.trim().replace('));
  assert.match(api, /headers\.set\("Accept", "application\/json"\)/);
  assert.match(api, /options\.body != null && !headers\.has\("Content-Type"\)/);
  assert.match(api, /cache: method === "GET" \? "no-store"/);
  assert.match(api, /Magen3 API expected JSON, but/);
  assert.match(api, /responseDiagnostic\(requestUrl, response\)/);
  assert.match(api, /shouldRetryRequest\(method, attempt\)/);
  assert.match(api, /Magen3 API returned an invalid response body/);
});

test("large bootstrap history is not polled every six seconds", async () => {
  const app = await source(APP_URL);
  assert.doesNotMatch(app, /setInterval\(\(\) => void refresh\(\), 6000\)/);
  assert.match(app, /setInterval\(\(\) => void refresh\(\), 30_000\)/);
});
