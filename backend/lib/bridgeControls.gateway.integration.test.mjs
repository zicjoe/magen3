import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const BRIDGE_CONTRACT = `contract-package-${"3".repeat(64)}`;
const EVM_RECIPIENT = `0x${"4".repeat(40)}`;

async function fixture(mode = "Review") {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Bridge Controls Integration Agent",
    type: "DeFi Agent",
    purpose: "Bridge Controls gateway persistence test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "Bridge Controls Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [BRIDGE_CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      bridgeControlMode: mode,
      bridgeControlUnavailableAction: "Review",
      bridgeAllowedProviders: ["Test Bridge"],
      bridgeAllowedSourceChains: ["casper-test"],
      bridgeAllowedDestinationChains: ["ethereum-sepolia"],
      bridgeBlockedDestinationChains: ["blocked-chain"],
      bridgeAllowedAssets: ["CSPR"],
      bridgeMaxAmount: 50,
      bridgeMaxFeeBps: 100,
      bridgeMaxQuoteAgeSeconds: 300,
      bridgeRequireQuoteExpiry: true,
      bridgeMinSourceConfirmations: 2,
      bridgeMinDestinationConfirmations: 12,
      threatIntelligenceMode: "Observe",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Observe",
      oracleValidationUnavailableAction: "Warn",
    },
  });
  return { store, agent };
}

function bridgeIntent(agentId, overrides = {}) {
  const now = Date.now();
  const bridgeOverrides = overrides.bridge || {};
  return {
    source: "bridge-controls-gateway-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Bridge",
      amount: 10,
      asset: "CSPR",
      target: BRIDGE_CONTRACT,
      targetType: "Bridge Contract",
      contractIdentifierType: "Package Hash",
      chainName: "casper-test",
      preflight: {
        paymentAmountMotes: "5000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: new Date(now).toISOString(),
      },
      bridge: {
        sourceChain: "casper-test",
        destinationChain: "ethereum-sepolia",
        provider: "Test Bridge",
        routeId: "route-001",
        destinationAddress: EVM_RECIPIENT,
        asset: "CSPR",
        feeBps: 50,
        expectedOutput: 9.95,
        minimumReceived: 9.8,
        quoteTimestamp: new Date(now).toISOString(),
        quoteExpiresAt: new Date(now + 300_000).toISOString(),
        sourceConfirmations: 2,
        destinationConfirmations: 12,
        ...bridgeOverrides,
      },
      ...(overrides.action || {}),
    },
  };
}

test("authenticated Gateway persists Bridge Controls findings for Allowed, Review Required, and Blocked", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(bridgeIntent(agent.id), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(bridgeIntent(agent.id, { bridge: { destinationChain: "base-sepolia" } }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(bridgeIntent(agent.id, { bridge: { destinationChain: "blocked-chain" } }), { apiKey: agent.apiKey });

  assert.deepEqual(
    [allowed.result.decision, review.result.decision, blocked.result.decision],
    ["Allowed", "Review Required", "Blocked"],
  );

  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Bridge Controls"));
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Execution Simulation" && finding.status === "pass"));
    assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Bridge Controls"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "bridge-controls"));
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
    assert.equal(response.auditLog.originalIntent.action.bridge.provider, "Test Bridge");
    assert.equal(response.auditLog.originalIntent.action.bridge.sourceChain, "casper-test");
    assert.equal(response.result.bridgeControlsContext.provider, "Test Bridge");
  }
});

test("expired bridge route is blocked and audited before signing", async () => {
  const { store, agent } = await fixture("Enforce");
  const response = await store.submitAgentGatewayIntent(bridgeIntent(agent.id, {
    bridge: {
      quoteTimestamp: new Date(Date.now() - 600_000).toISOString(),
      quoteExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
  }), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.auditLog.moduleFindings.some((finding) =>
    finding.module === "Bridge Controls" && finding.rule === "Bridge quote expiry" && finding.status === "fail"));
});
