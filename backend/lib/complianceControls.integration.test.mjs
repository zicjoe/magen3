import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentGatewayIntent } from "./agentGateway.mjs";
import { normalizeComplianceFeed } from "./complianceControls.mjs";
import { evaluateAction } from "./policyEngine.mjs";

const NOW = new Date();
const EXECUTION_WALLET = `01${"a".repeat(64)}`;
const TARGET = `01${"b".repeat(64)}`;
const BLOCKED_TARGET = `01${"8".repeat(64)}`;

function agent() {
  return {
    id: "AGT_COMPLIANCE",
    name: "Treasury Compliance Agent",
    type: "Treasury Agent",
    status: "Active",
    executionCapabilities: ["Treasury Operations", "Wallet Management", "Enterprise Automation"],
  };
}

function policy(overrides = {}) {
  return {
    id: "POL_COMPLIANCE",
    name: "Controlled Treasury Policy",
    agentId: "AGT_COMPLIANCE",
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET, BLOCKED_TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    status: "Active",
    structuredRules: {
      complianceControlsEnabled: true,
      complianceControlMode: "Enforce",
      complianceUnavailableAction: "Review",
      complianceRequiredActions: ["Transfer"],
      complianceRequireOriginatorAttestation: true,
      complianceRequireBeneficiaryAttestation: true,
      complianceRequireTravelRule: true,
      complianceTravelRuleThreshold: 1,
      complianceRequireSanctionsScreening: true,
      complianceAllowedJurisdictions: ["NG", "US"],
      complianceBlockedJurisdictions: [],
      complianceReviewJurisdictions: [],
      complianceAllowedCounterpartyTypes: ["VASP", "Self-hosted Wallet"],
      complianceAcceptedProviders: ["Verified Provider"],
      complianceMaxAttestationAgeSeconds: 86400,
      complianceMaxScreeningAgeSeconds: 3600,
      complianceMaximumRiskRating: "Medium",
      threatIntelligenceMode: "Observe",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Observe",
      oracleValidationUnavailableAction: "Warn",
      ...overrides,
    },
  };
}

function compliance(overrides = {}) {
  return {
    originatorJurisdiction: "NG",
    beneficiaryJurisdiction: "US",
    counterpartyType: "VASP",
    originatorAttestation: {
      status: "Verified",
      provider: "Verified Provider",
      reference: "ORIGINATOR-001",
      issuedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    },
    beneficiaryAttestation: {
      status: "Verified",
      provider: "Verified Provider",
      reference: "BENEFICIARY-001",
      issuedAt: new Date(NOW.getTime() - 60_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    },
    travelRule: {
      status: "Complete",
      reference: "TRAVEL-RULE-001",
      dataHash: "c".repeat(64),
    },
    screening: {
      status: "Clear",
      provider: "Verified Provider",
      reference: "SCREEN-001",
      screenedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    },
    riskRating: "Low",
    originatorVaspId: "VASP-NG-001",
    beneficiaryVaspId: "VASP-US-002",
    ...overrides,
  };
}

function body({ target = TARGET, complianceOverrides = {} } = {}) {
  return {
    agentId: "AGT_COMPLIANCE",
    executionWalletAddress: EXECUTION_WALLET,
    source: "compliance-integration-test",
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target,
      targetType: "Wallet Address",
      preflight: {
        paymentAmountMotes: "5000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: NOW.toISOString(),
      },
      compliance: compliance(complianceOverrides),
    },
  };
}

function feed(overrides = {}) {
  return normalizeComplianceFeed({
    source: "test compliance feed",
    generatedAt: NOW.toISOString(),
    indicators: [],
    restrictedJurisdictions: [],
    ...overrides,
  }, { now: NOW });
}

function evaluate(intent, activePolicy = policy(), snapshot = feed()) {
  return evaluateAction({
    request: { ...intent, walletAddress: intent.executionWalletAddress },
    agents: [agent()],
    policies: [activePolicy],
    auditLogs: [],
    threatIntelligence: { status: "unavailable", sourceName: "No feed", indicators: [] },
    oracleValidation: { status: "unavailable", sourceName: "No feed", observations: [] },
    complianceControls: snapshot,
  });
}

test("normalizes provider-agnostic non-sensitive compliance evidence", () => {
  const intent = normalizeAgentGatewayIntent(body());
  assert.equal(intent.complianceOriginatorJurisdiction, "NG");
  assert.equal(intent.complianceBeneficiaryAttestationStatus, "Verified");
  assert.equal(intent.complianceTravelRuleStatus, "Complete");
  assert.equal(intent.complianceScreeningStatus, "Clear");
});

test("policy engine allows complete compliance evidence and records Compliance Controls", () => {
  const result = evaluate(normalizeAgentGatewayIntent(body()));
  assert.equal(result.decision, "Allowed");
  assert.ok(result.modulesEvaluated.includes("Compliance Controls"));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "compliance-controls" && stage.status === "completed"));
  assert.equal(result.complianceControlsContext.travelRuleStatus, "Complete");
  assert.equal(result.complianceControlsContext.screeningStatus, "Clear");
});

test("policy engine requires review for incomplete Travel Rule evidence in Review mode", () => {
  const intent = normalizeAgentGatewayIntent(body({ complianceOverrides: { travelRule: { status: "Incomplete", reference: "", dataHash: "" } } }));
  const result = evaluate(intent, policy({ complianceControlMode: "Review" }));
  assert.equal(result.decision, "Review Required");
  assert.ok(result.moduleFindings.some((item) => item.module === "Compliance Controls" && item.rule === "Travel Rule evidence" && item.status === "warning"));
});

test("policy engine blocks an exact configured compliance indicator", () => {
  const intent = normalizeAgentGatewayIntent(body({ target: BLOCKED_TARGET }));
  const result = evaluate(intent, policy(), feed({
    indicators: [{ value: BLOCKED_TARGET, action: "Block", label: "Synthetic restriction", reference: "SYNTHETIC-001" }],
  }));
  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((item) => item.module === "Compliance Controls" && item.rule === "Configured compliance indicator match" && item.status === "fail"));
  assert.equal(result.complianceControlsContext.matchedIndicators.length, 1);
});
