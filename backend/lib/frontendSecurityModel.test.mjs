import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/app/lib/securityModel.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const securityModel = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("security coverage reaches 100 only when every configured protection check passes", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    {
      status: "Active",
      type: "Trading Agent",
      executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
      apiKeyPreview: "mg3_live_…f91a",
      onboardingStatus: "complete",
      lastIntentAt: timestamp,
    },
    {
      status: "Active",
      maxTransaction: 25,
      dailyLimit: 100,
      approvalThreshold: 15,
      trustedContracts: ["contract-package-hash-example"],
    },
    [{
      timestamp,
      decisionProofStatus: "recorded",
      moduleFindings: [{ module: "Wallet Validation", status: "pass", severity: "info", rule: "Valid execution wallet format", message: "Valid wallet." }],
    }],
  );

  assert.equal(result.score, 100);
  assert.equal(result.label, "Strong foundation");
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.checks.every((check) => check.passed));
});

test("security coverage is deterministic and explains missing controls", () => {
  const agent = {
    status: "Active",
    type: "Trading Agent",
    executionCapabilities: ["Trading", "dApp Interactions"],
    onboardingStatus: "complete",
  };

  const first = securityModel.calculateSecurityCoverage(agent, undefined, []);
  const second = securityModel.calculateSecurityCoverage(agent, undefined, []);

  assert.deepEqual(first, second);
  assert.equal(first.score, 15);
  assert.equal(first.label, "Limited coverage");
  assert.ok(first.recommendations.some((check) => check.id === "active-policy"));
  assert.ok(first.recommendations.some((check) => check.id === "contract-controls"));
  assert.ok(first.recommendations.some((check) => check.page === "intent-playground"));
});

test("integration health never reports healthy when core services or configuration are missing", () => {
  const degraded = securityModel.deriveIntegrationHealth(
    { status: "Active" },
    undefined,
    [],
    false,
  );
  assert.equal(degraded.overall, "Degraded");
  assert.ok(degraded.checks.some((check) => check.label === "Gateway connectivity" && check.status === "unavailable"));

  const timestamp = new Date().toISOString();
  const healthy = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{
      timestamp,
      decision: "Allowed",
      decisionProofStatus: "recorded",
      moduleFindings: [{ module: "Wallet Validation", status: "pass", severity: "info", rule: "Valid execution wallet format", message: "Valid wallet." }],
    }],
    true,
  );
  assert.equal(healthy.overall, "Healthy");
});
