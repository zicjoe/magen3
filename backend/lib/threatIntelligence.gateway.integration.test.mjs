import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";

const OWNER_WALLET = `01${"a".repeat(64)}`;
const EXECUTION_WALLET = `01${"b".repeat(64)}`;
const SAFE_TARGET = `01${"c".repeat(64)}`;
const RISK_TARGET = `01${"d".repeat(64)}`;

process.env.THREAT_INTELLIGENCE_FEED_JSON = JSON.stringify({
  version: "1",
  source: "Gateway integration test feed",
  generatedAt: new Date().toISOString(),
  indicators: [{
    id: "gateway-risk-target",
    value: RISK_TARGET,
    severity: "critical",
    confidence: 99,
    label: "Synthetic gateway integration indicator",
    source: "Magen3 tests",
  }],
});
process.env.THREAT_INTELLIGENCE_MAX_AGE_MS = "86400000";
process.env.THREAT_INTELLIGENCE_CACHE_TTL_MS = "1000";

const { createMemoryStore } = await import("../store/memoryStore.mjs");
const { getThreatIntelligenceSnapshot, resetThreatIntelligenceCache, summarizeThreatIntelligenceSnapshot } = await import("./threatIntelligence.mjs");

async function fixture(mode = "Enforce") {
  resetThreatIntelligenceCache();
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Threat Intelligence Gateway Agent",
    type: "Wallet Agent",
    purpose: "Threat Intelligence Gateway integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Wallet Management"],
  });
  await store.createPolicy({
    name: "Threat Intelligence Gateway Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 50,
    dailyLimit: 100,
    approvalThreshold: 40,
    trustedContracts: [SAFE_TARGET, RISK_TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      threatIntelligenceMode: mode,
      threatIntelligenceMinConfidence: 70,
      threatIntelligenceUnavailableAction: "Warn",
    },
  });
  return { store, agent };
}

function intent(agentId, target) {
  return {
    source: "threat-intelligence-gateway-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target,
      targetType: "Wallet Address",
      preflight: {
        paymentAmountMotes: "2500000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: new Date().toISOString(),
      },
    },
  };
}

test("configured feed status is sanitized and operational", async () => {
  resetThreatIntelligenceCache();
  const snapshot = await getThreatIntelligenceSnapshot({ force: true });
  const status = summarizeThreatIntelligenceSnapshot(snapshot);
  assert.equal(status.status, "available");
  assert.equal(status.sourceName, "Gateway integration test feed");
  assert.equal(status.indicatorCount, 1);
  assert.equal("indicators" in status, false);
});

test("authenticated Gateway persists safe and enforced Threat Intelligence outcomes", async () => {
  const { store, agent } = await fixture("Enforce");
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id, SAFE_TARGET), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, RISK_TARGET), { apiKey: agent.apiKey });

  assert.equal(allowed.result.decision, "Allowed");
  assert.equal(blocked.result.decision, "Blocked");
  assert.equal(blocked.result.triggeredRule, "Known threat indicator match");
  assert.equal(blocked.result.threatIntelligenceContext.matchedIndicators.length, 1);
  assert.equal(blocked.auditLog.moduleFindings.some((finding) => finding.module === "Threat Intelligence" && finding.status === "fail"), true);
  assert.equal(blocked.auditLog.pipelineStages.some((stage) => stage.id === "threat-intelligence" && stage.status === "failed"), true);
  assert.equal(blocked.gatewayRequest.auditLogId, blocked.auditLog.id);
});

test("Review mode pauses rather than blocking an exact high-confidence match", async () => {
  const { store, agent } = await fixture("Review");
  const response = await store.submitAgentGatewayIntent(intent(agent.id, RISK_TARGET), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.auditLog.moduleFindings.some((finding) => finding.module === "Threat Intelligence" && finding.status === "warning"), true);
});
