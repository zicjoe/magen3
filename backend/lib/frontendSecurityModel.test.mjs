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
      structuredRules: {
        lifecycleControlsEnabled: true,
        lifecycleControlMode: "Enforce",
        lifecycleRequireIntentId: true,
        lifecycleRequireIdempotencyKey: true,
        lifecycleRequireCreatedAt: true,
        lifecycleRequireExpiry: true,
        lifecyclePreventDuplicateFingerprint: true,
        approvalWorkflowEnabled: true,
        approvalRequiredCount: 1,
        approvalAllowOwnerFallback: true,
        approvalApproverWallets: [],
        threatIntelligenceMode: "Review",
        oracleValidationMode: "Review",
        bridgeControlMode: "Review",
        bridgeAllowedProviders: ["Test Bridge"],
        bridgeAllowedSourceChains: ["casper-test"],
        bridgeAllowedDestinationChains: ["ethereum-sepolia"],
        bridgeAllowedAssets: ["CSPR"],
        tokenPermissionControlsEnabled: true,
        tokenPermissionMode: "Review",
        tokenPermissionUnknownSpenderAction: "Review",
        tokenPermissionUnlimitedApprovalAction: "Block",
        tokenPermissionMaxApprovalToTransactionRatio: 2,
        tokenPermissionMaxLifetimeSeconds: 3600,
        tokenPermissionApprovedSpenders: ["01" + "2".repeat(64)],
        tokenPermissionBlockedSpenders: [],
        tokenPermissionMaximumBatchSize: 10,
      },
    },
    [{
      timestamp,
      decisionProofStatus: "recorded",
      moduleFindings: [
        { module: "Wallet Validation", status: "pass", severity: "info", rule: "Valid execution wallet format", message: "Valid wallet." },
        { module: "Contract Validation", status: "pass", severity: "info", rule: "Approved contract", message: "Approved contract." },
        { module: "Execution Simulation", status: "pass", severity: "info", rule: "Payment budget format", message: "Payment preflight evaluated." },
        { module: "Execution Simulation", status: "unavailable", severity: "info", rule: "Stateful speculative execution", message: "Stateful simulation unavailable." },
        { module: "Execution Integrity", status: "pass", severity: "info", rule: "Intent ID replay prevention", message: "Fresh lifecycle intent." },
        { module: "Policy & Approval Controls", status: "warning", severity: "medium", rule: "Human approval quorum", message: "Exact-bound approval request created." },
        { module: "Threat Intelligence", status: "pass", severity: "info", rule: "Threat feed availability", message: "Fresh feed available." },
        { module: "Threat Intelligence", status: "pass", severity: "info", rule: "Known threat indicator match", message: "No exact match." },
        { module: "Oracle Validation", status: "pass", severity: "info", rule: "Oracle feed availability", message: "Fresh oracle feed available." },
        { module: "Oracle Validation", status: "pass", severity: "info", rule: "Oracle price deviation", message: "Price within policy." },
        { module: "Bridge Controls", status: "pass", severity: "info", rule: "Bridge route metadata", message: "Required bridge route metadata is present." },
        { module: "Token Permission Controls", status: "pass", severity: "info", rule: "Supported permission classification", message: "Supported token permission classification." },
      ],
    }],
  );

  assert.equal(result.score, 100);
  assert.equal(result.label, "Strong foundation");
  assert.equal(result.recommendations.length, 0);
  assert.ok(result.checks.every((check) => check.passed));
});

test("execution-preflight applicability alone does not count as configured construction preflight", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    {
      status: "Active",
      type: "Trading Agent",
      executionCapabilities: ["Trading"],
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
      moduleFindings: [
        { module: "Contract Validation", status: "pass", severity: "info", rule: "Approved contract", message: "Approved contract." },
        { module: "Execution Simulation", status: "pass", severity: "info", rule: "Execution preflight applicability", message: "Applicable only." },
        { module: "Execution Simulation", status: "unavailable", severity: "info", rule: "Stateful speculative execution", message: "Unavailable." },
      ],
    }],
  );

  const preflight = result.checks.find((check) => check.id === "execution-preflight");
  assert.equal(preflight.passed, false);
  assert.ok(result.recommendations.some((check) => check.id === "execution-preflight"));
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
  assert.ok(first.score < 40);
  assert.equal(first.label, "Limited coverage");
  assert.ok(first.recommendations.some((check) => check.id === "active-policy"));
  assert.ok(first.recommendations.some((check) => check.id === "contract-controls"));
  assert.ok(first.recommendations.some((check) => check.page === "intent-playground"));
});

test("stale or unavailable Threat Intelligence never counts toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["Wallet Management"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, trustedContracts: ["target"], structuredRules: { threatIntelligenceMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Threat Intelligence", status: "unavailable", severity: "low", rule: "Threat feed availability", message: "Feed stale." }] }],
  );
  const check = result.checks.find((item) => item.id === "threat-intelligence");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "threat-intelligence"));
});


test("stale or unavailable Oracle Validation never counts toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["Trading"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, approvalThreshold: 5, trustedContracts: ["target"], structuredRules: { oracleValidationMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Oracle Validation", status: "unavailable", severity: "low", rule: "Oracle feed availability", message: "Feed stale." }] }],
  );
  const check = result.checks.find((item) => item.id === "oracle-validation");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "oracle-validation"));
});


test("missing or incomplete Bridge Controls never count toward coverage", () => {
  const timestamp = new Date().toISOString();
  const result = securityModel.calculateSecurityCoverage(
    { status: "Active", executionCapabilities: ["dApp Interactions"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active", maxTransaction: 10, dailyLimit: 20, trustedContracts: ["target"], structuredRules: { bridgeControlMode: "Review" } },
    [{ timestamp, moduleFindings: [{ module: "Bridge Controls", status: "unavailable", severity: "medium", rule: "Bridge route metadata", message: "Route metadata missing." }] }],
  );
  const check = result.checks.find((item) => item.id === "bridge-controls");
  assert.equal(check.passed, false);
  assert.ok(result.recommendations.some((item) => item.id === "bridge-controls"));
});

test("Token Permission coverage requires deterministic configuration and an observed pass", () => {
  const timestamp = new Date().toISOString();
  const agent = { status: "Active", executionCapabilities: ["Trading"], apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp };
  const policy = {
    status: "Active", maxTransaction: 10, dailyLimit: 20, approvalThreshold: 5, trustedContracts: ["target"],
    structuredRules: {
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: "Review",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Block",
      tokenPermissionMaxApprovalToTransactionRatio: 2,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionMaximumBatchSize: 10,
      tokenPermissionApprovedSpenders: ["01" + "2".repeat(64)],
      tokenPermissionBlockedSpenders: [],
    },
  };
  const configuredOnly = securityModel.calculateSecurityCoverage(agent, policy, []);
  assert.equal(configuredOnly.checks.find((item) => item.id === "token-permission-controls").passed, false);

  const observed = securityModel.calculateSecurityCoverage(agent, policy, [{
    timestamp,
    moduleFindings: [{ module: "Token Permission Controls", status: "pass", severity: "info", rule: "Supported permission classification", message: "Supported token permission classification." }],
  }]);
  assert.equal(observed.checks.find((item) => item.id === "token-permission-controls").passed, true);
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

  const tokenAttention = securityModel.deriveIntegrationHealth(
    { status: "Active", apiKeyPreview: "mg3_live_…f91a", lastIntentAt: timestamp },
    { status: "Active" },
    [{ timestamp, decision: "Blocked", decisionProofStatus: "recorded", moduleFindings: [{ module: "Token Permission Controls", status: "fail", severity: "high", rule: "Blocked spender", message: "Blocked spender." }] }],
    true,
  );
  assert.ok(tokenAttention.checks.some((check) => check.label === "Token Permission Controls" && check.status === "attention"));
});
