import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "./policyEngine.mjs";
import { normalizeThreatFeed } from "./threatIntelligence.mjs";

const AGENT_ID = "MAG-AGENT-THREAT";
const WALLET = `01${"1".repeat(64)}`;
const SAFE_TARGET = `01${"2".repeat(64)}`;
const RISK_TARGET = `01${"6".repeat(64)}`;

function basePolicy(overrides = {}) {
  return {
    id: "POL-THREAT",
    name: "Threat-aware Wallet Policy",
    agentId: AGENT_ID,
    maxTransaction: 50,
    dailyLimit: 200,
    approvalThreshold: 40,
    trustedContracts: [SAFE_TARGET, RISK_TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    status: "Active",
    templateType: "Wallet Safety",
    structuredRules: {
      threatIntelligenceMode: "Enforce",
      threatIntelligenceMinConfidence: 70,
      threatIntelligenceUnavailableAction: "Warn",
      ...overrides,
    },
  };
}

function evaluate(target, policy = basePolicy(), intelligence) {
  return evaluateAction({
    request: {
      agentId: AGENT_ID,
      actionType: "Transfer",
      amount: 5,
      asset: "CSPR",
      executionWalletAddress: WALLET,
      agentOwnerWalletAddress: WALLET,
      target,
      targetType: "Wallet Address",
      paymentAmountMotes: "2500000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      transactionTimestamp: new Date().toISOString(),
    },
    agents: [{ id: AGENT_ID, name: "Threat Test Agent", status: "Active", type: "Custom Agent", executionCapabilities: ["Wallet Management"] }],
    policies: [policy],
    auditLogs: [],
    threatIntelligence: intelligence,
  });
}

const feed = normalizeThreatFeed({
  source: "integration feed",
  generatedAt: new Date().toISOString(),
  indicators: [{ value: RISK_TARGET, severity: "critical", confidence: 98, label: "Known malicious destination" }],
});

test("safe target remains Allowed while Threat Intelligence records a pass", () => {
  const result = evaluate(SAFE_TARGET, basePolicy(), feed);
  assert.equal(result.decision, "Allowed");
  assert.equal(result.moduleFindings.some((item) => item.module === "Threat Intelligence" && item.status === "pass" && item.rule === "Known threat indicator match"), true);
  assert.equal(result.pipelineStages.some((stage) => stage.id === "threat-intelligence" && stage.status === "completed"), true);
});

test("critical target becomes Blocked and explains the exact indicator", () => {
  const result = evaluate(RISK_TARGET, basePolicy(), feed);
  assert.equal(result.decision, "Blocked");
  assert.equal(result.triggeredRule, "Known threat indicator match");
  assert.match(result.primaryReason, /critical-severity threat indicator/i);
  assert.equal(result.threatIntelligenceContext.matchedIndicators.length, 1);
  assert.equal(result.pipelineStages.some((stage) => stage.id === "threat-intelligence" && stage.status === "failed"), true);
});

test("Review mode produces Review Required instead of Blocked", () => {
  const result = evaluate(RISK_TARGET, basePolicy({ threatIntelligenceMode: "Review" }), feed);
  assert.equal(result.decision, "Review Required");
  assert.equal(result.pipelineStages.some((stage) => stage.id === "threat-intelligence" && stage.status === "warning"), true);
});
