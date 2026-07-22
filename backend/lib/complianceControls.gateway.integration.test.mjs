import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
process.env.COMPLIANCE_CONTROLS_FEED_JSON = JSON.stringify({
  version: "1",
  source: "Synthetic gateway compliance feed",
  generatedAt: new Date().toISOString(),
  indicators: [{ value: `01${"8".repeat(64)}`, action: "Block", label: "Synthetic exact match", reference: "SYNTHETIC-001" }],
  restrictedJurisdictions: [],
});

const { resetComplianceControlsCache } = await import("./complianceControls.mjs");
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const TARGET = `01${"3".repeat(64)}`;
const BLOCKED_TARGET = `01${"8".repeat(64)}`;

async function fixture() {
  resetComplianceControlsCache();
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Compliance Controls Integration Agent",
    type: "Treasury Agent",
    purpose: "Compliance Controls gateway persistence test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Treasury Operations", "Wallet Management", "Enterprise Automation"],
  });
  await store.createPolicy({
    name: "Compliance Controls Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET, BLOCKED_TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      complianceControlsEnabled: true,
      complianceControlMode: "Review",
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
    },
  });
  return { store, agent };
}

function completeCompliance(overrides = {}) {
  const now = Date.now();
  return {
    originatorJurisdiction: "NG",
    beneficiaryJurisdiction: "US",
    counterpartyType: "VASP",
    originatorAttestation: { status: "Verified", provider: "Verified Provider", reference: "ORIGINATOR-001", issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
    beneficiaryAttestation: { status: "Verified", provider: "Verified Provider", reference: "BENEFICIARY-001", issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
    travelRule: { status: "Complete", reference: "TRAVEL-RULE-001", dataHash: "c".repeat(64) },
    screening: { status: "Clear", provider: "Verified Provider", reference: "SCREEN-001", screenedAt: new Date(now - 30_000).toISOString() },
    riskRating: "Low",
    originatorVaspId: "VASP-NG-001",
    beneficiaryVaspId: "VASP-US-002",
    ...overrides,
  };
}

function intent(agentId, { target = TARGET, compliance = completeCompliance() } = {}) {
  return {
    source: "compliance-controls-gateway-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target,
      targetType: "Wallet Address",
      preflight: { paymentAmountMotes: "5000000000", gasPriceTolerance: 1, ttl: "30m", timestamp: new Date().toISOString() },
      compliance,
    },
  };
}

test("authenticated Gateway persists Allowed, Review Required, and Blocked Compliance Controls outcomes", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(intent(agent.id, {
    compliance: completeCompliance({ travelRule: { status: "Incomplete", reference: "", dataHash: "" } }),
  }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, { target: BLOCKED_TARGET }), { apiKey: agent.apiKey });

  assert.deepEqual([allowed.result.decision, review.result.decision, blocked.result.decision], ["Allowed", "Review Required", "Blocked"]);

  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Compliance Controls"));
    assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Compliance Controls"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "compliance-controls"));
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
    assert.equal(response.auditLog.originalIntent.action.compliance.originatorJurisdiction, "NG");
    assert.equal(response.auditLog.originalIntent.action.compliance.travelRule.reference || "", response.result.complianceControlsContext.travelRuleStatus === "Incomplete" ? "" : "TRAVEL-RULE-001");
    assert.equal(response.auditLog.originalIntent.action.compliance.fullName, undefined);
  }
});
