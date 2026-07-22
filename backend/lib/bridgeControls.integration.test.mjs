import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentGatewayIntent } from "./agentGateway.mjs";
import { evaluateAction } from "./policyEngine.mjs";

const NOW = new Date();
const EXECUTION_WALLET = `01${"a".repeat(64)}`;
const CONTRACT = `contract-${"b".repeat(64)}`;
const EVM_DESTINATION = `0x${"c".repeat(40)}`;

function agent() {
  return {
    id: "AGT_BRIDGE",
    name: "Bridge Agent",
    type: "DeFi Agent",
    status: "Active",
    executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  };
}

function policy(overrides = {}) {
  return {
    id: "POL_BRIDGE",
    name: "Bridge Safety",
    agentId: "AGT_BRIDGE",
    maxTransaction: 200,
    dailyLimit: 1000,
    approvalThreshold: 150,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    status: "Active",
    structuredRules: {
      bridgeControlMode: "Enforce",
      bridgeControlUnavailableAction: "Block",
      bridgeAllowedProviders: ["Test Bridge"],
      bridgeAllowedSourceChains: ["casper-test"],
      bridgeAllowedDestinationChains: ["ethereum-sepolia"],
      bridgeBlockedDestinationChains: [],
      bridgeAllowedAssets: ["CSPR"],
      bridgeMaxAmount: 100,
      bridgeMaxFeeBps: 100,
      bridgeMaxQuoteAgeSeconds: 300,
      bridgeRequireQuoteExpiry: true,
      bridgeMinSourceConfirmations: 2,
      bridgeMinDestinationConfirmations: 12,
      threatIntelligenceMode: "Observe",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Observe",
      oracleValidationUnavailableAction: "Warn",
      ...overrides,
    },
  };
}

function body(overrides = {}) {
  return {
    agentId: "AGT_BRIDGE",
    executionWalletAddress: EXECUTION_WALLET,
    source: "bridge-test",
    action: {
      type: "Bridge",
      amount: 10,
      asset: "CSPR",
      target: CONTRACT,
      targetType: "Bridge Contract",
      contractIdentifierType: "Contract Hash",
      bridge: {
        sourceChain: "casper-test",
        destinationChain: "ethereum-sepolia",
        provider: "Test Bridge",
        routeId: "route-001",
        destinationAddress: EVM_DESTINATION,
        asset: "CSPR",
        feeBps: 50,
        expectedOutput: 9.95,
        minimumReceived: 9.8,
        quoteTimestamp: NOW.toISOString(),
        quoteExpiresAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
        sourceConfirmations: 2,
        destinationConfirmations: 12,
        ...overrides,
      },
    },
  };
}

function evaluate(intent, activePolicy = policy()) {
  return evaluateAction({
    request: { ...intent, walletAddress: intent.executionWalletAddress },
    agents: [agent()],
    policies: [activePolicy],
    auditLogs: [],
    threatIntelligence: { status: "unavailable", sourceName: "No feed", indicators: [] },
    oracleValidation: { status: "unavailable", sourceName: "No feed", observations: [] },
  });
}

test("normalizes provider-agnostic bridge metadata without changing the Gateway envelope", () => {
  const intent = normalizeAgentGatewayIntent(body());
  assert.equal(intent.actionType, "Bridge");
  assert.equal(intent.targetType, "Bridge Contract");
  assert.equal(intent.bridgeDestinationChain, "ethereum-sepolia");
  assert.equal(intent.bridgeFeeBps, 50);
  assert.equal(intent.bridgeDestinationConfirmations, 12);
});

test("policy engine allows a compliant bridge route and records Bridge Controls", () => {
  const result = evaluate(normalizeAgentGatewayIntent(body()));
  assert.equal(result.decision, "Allowed");
  assert.ok(result.modulesEvaluated.includes("Bridge Controls"));
  assert.ok(result.pipelineStages.some((stage) => stage.id === "bridge-controls" && stage.status === "completed"));
  assert.equal(result.bridgeControlsContext.destinationChain, "ethereum-sepolia");
});

test("policy engine requires review for an unapproved destination in Review mode", () => {
  const intent = normalizeAgentGatewayIntent(body({ destinationChain: "base-sepolia" }));
  const result = evaluate(intent, policy({ bridgeControlMode: "Review", bridgeControlUnavailableAction: "Warn" }));
  assert.equal(result.decision, "Review Required");
  assert.ok(result.moduleFindings.some((item) => item.module === "Bridge Controls" && item.rule === "Approved destination chain" && item.status === "warning"));
});

test("policy engine blocks an expired bridge quote in Enforce mode", () => {
  const intent = normalizeAgentGatewayIntent(body({ quoteExpiresAt: new Date(Date.now() - 60_000).toISOString() }));
  const result = evaluate(intent);
  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((item) => item.module === "Bridge Controls" && item.rule === "Bridge quote expiry" && item.status === "fail"));
});
