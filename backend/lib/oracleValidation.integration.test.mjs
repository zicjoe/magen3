import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentGatewayIntent } from "./agentGateway.mjs";
import { evaluateAction } from "./policyEngine.mjs";
import { normalizeOracleFeed } from "./oracleValidation.mjs";

const EXECUTION_WALLET = `01${"a".repeat(64)}`;
const OWNER_WALLET = `01${"b".repeat(64)}`;
const CONTRACT = `contract-package-${"c".repeat(64)}`;

const agent = {
  id: "MAG-AGENT-oracle",
  name: "Oracle Test Agent",
  type: "Trading Agent",
  status: "Active",
  ownerWalletAddress: OWNER_WALLET,
  executionCapabilities: ["Trading", "dApp Interactions"],
};

function policy(mode = "Enforce") {
  return {
    id: "POL-oracle",
    name: "Oracle Protected Trading",
    agentId: agent.id,
    status: "Active",
    maxTransaction: 100,
    dailyLimit: 1000,
    approvalThreshold: 90,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["swap"],
      oracleValidationMode: mode,
      oracleValidationUnavailableAction: "Warn",
      oracleValidationMaxAgeSeconds: 120,
      oracleValidationMaxDeviationBps: 300,
      oracleValidationMaxSourceSpreadBps: 500,
      oracleValidationMinConfidence: 70,
      oracleValidationMinSources: 2,
    },
  };
}

function snapshot() {
  const now = new Date().toISOString();
  return normalizeOracleFeed({
    source: "integration feed",
    generatedAt: now,
    observations: [
      { baseAsset: "CSPR", quoteAsset: "USD", price: 0.025, confidence: 95, source: "source-a", observedAt: now },
      { baseAsset: "CSPR", quoteAsset: "USD", price: 0.0251, confidence: 92, source: "source-b", observedAt: now },
    ],
  });
}

function request(executionPrice = 0.025) {
  return normalizeAgentGatewayIntent({
    source: "oracle-integration-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Swap",
      amount: 10,
      asset: "CSPR",
      outputAsset: "USD",
      target: CONTRACT,
      targetType: "Trusted Contract",
      contractIdentifierType: "Package Hash",
      entryPoint: "swap",
      chainName: "casper-test",
      oracle: {
        baseAsset: "CSPR",
        quoteAsset: "USD",
        executionPrice,
        quoteTimestamp: new Date().toISOString(),
      },
      preflight: {
        paymentAmountMotes: "5000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: new Date().toISOString(),
        slippageBps: 300,
        expectedOutput: 0.25,
        minimumReceived: 0.24,
      },
    },
  });
}

function evaluate(executionPrice, mode = "Enforce") {
  return evaluateAction({
    request: request(executionPrice),
    agents: [agent],
    policies: [policy(mode)],
    auditLogs: [],
    threatIntelligence: {
      status: "available",
      sourceName: "empty test feed",
      generatedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      indicators: [],
      indicatorCount: 0,
      activeIndicatorCount: 0,
    },
    oracleValidation: snapshot(),
  });
}

test("normalizes oracle metadata from the unchanged Gateway action envelope", () => {
  const normalized = request();
  assert.equal(normalized.outputAsset, "USD");
  assert.equal(normalized.oracleBaseAsset, "CSPR");
  assert.equal(normalized.oracleQuoteAsset, "USD");
  assert.equal(normalized.executionPrice, 0.025);
  assert.ok(normalized.quoteTimestamp);
});

test("allows a policy-compliant oracle-protected swap", () => {
  const result = evaluate(0.025);
  assert.equal(result.decision, "Allowed");
  assert.ok(result.moduleFindings.some((item) => item.module === "Oracle Validation" && item.rule === "Oracle price deviation" && item.status === "pass"));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "oracle-validation" && stage.status === "completed"));
  assert.equal(result.oracleValidationContext.requestedPair, "CSPR/USD");
});

test("returns Review Required for excessive deviation in Review mode", () => {
  const result = evaluate(0.04, "Review");
  assert.equal(result.decision, "Review Required");
  assert.ok(result.moduleFindings.some((item) => item.module === "Oracle Validation" && item.rule === "Oracle price deviation" && item.status === "warning"));
});

test("blocks excessive deviation in Enforce mode", () => {
  const result = evaluate(0.04, "Enforce");
  assert.equal(result.decision, "Blocked");
  assert.equal(result.triggeredRule, "Oracle price deviation");
  assert.ok(result.pipelineStages.some((stage) => stage.id === "oracle-validation" && stage.status === "failed"));
});
