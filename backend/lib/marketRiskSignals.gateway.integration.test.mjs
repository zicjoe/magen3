import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");
const { resetMarketRiskSignalsCache } = await import("./marketRiskSignals.mjs");

const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const CONTRACT = `contract-package-${"c".repeat(64)}`;

function configureFeed(overrides = {}) {
  const now = new Date().toISOString();
  process.env.MARKET_RISK_SIGNALS_FEED_JSON = JSON.stringify({
    version: "1",
    source: "gateway-test-feed",
    generatedAt: now,
    observations: [{
      baseAsset: "CSPR",
      quoteAsset: "USD",
      network: "casper-test",
      source: "provider-a",
      confidence: 95,
      observedAt: now,
      volatilityBps: 100,
      spreadBps: 20,
      liquidityCoverageBps: 30000,
      stablecoinDepegBps: 0,
      manipulationScore: 5,
      ...overrides,
    }],
  });
  resetMarketRiskSignalsCache();
}

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Market Risk Agent", type: "Trading Agent", purpose: "market risk gateway test", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Trading"] });
  await store.createPolicy({
    name: "Market Risk Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 1000,
    approvalThreshold: 90,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["swap"],
      marketRiskSignals: { enabled: true, minSources: 1, maxVolatilityBps: 1000, maxSpreadBps: 300, minLiquidityCoverageBps: 10000 },
    },
  });
  return { store, agent };
}

function body(agentId) {
  const now = new Date().toISOString();
  return {
    source: "market-risk-gateway-test",
    agentId,
    executionWalletAddress: EXECUTION,
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
      expectedOutput: 0.25,
      minimumReceived: 0.24,
      marketRisk: { baseAsset: "CSPR", quoteAsset: "USD", network: "casper-test" },
      preflight: { paymentAmountMotes: "5000000000", gasPriceTolerance: 1, ttl: "30m", timestamp: now, slippageBps: 300, expectedOutput: 0.25, minimumReceived: 0.24 },
    },
  };
}

test("Gateway forwards market-risk selectors, evaluates configured evidence, and persists audit context", async () => {
  configureFeed();
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id), { apiKey: agent.apiKey });
  assert.equal(response.result.marketRiskSignalsContext.status, "passed");
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "market-risk-signals" && stage.status === "completed"));
  assert.equal(response.auditLog.originalIntent.marketRiskSignals.requested.pair, "CSPR/USD");
  assert.equal(response.marketRiskSignals.status, "passed");
});

test("Gateway blocks a provider-backed depeg violation", async () => {
  configureFeed({ stablecoinDepegBps: 500 });
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Market Risk Signals" && item.rule === "Stablecoin peg deviation"));
});
