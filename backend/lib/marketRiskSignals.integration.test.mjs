import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "./policyEngine.mjs";
import { normalizeMarketRiskFeed } from "./marketRiskSignals.mjs";

const NOW = new Date();
const agent = { id: "market-agent", status: "Active", executionCapabilities: ["Trading"] };
const basePolicy = {
  id: "market-policy",
  agentId: "market-agent",
  status: "Active",
  mode: "Enforce",
  allowedActions: ["Swap"],
  blockedActions: [],
  maxTransaction: 1000,
  dailyLimit: 10000,
  structuredRules: {
    marketRiskSignals: { enabled: true, minSources: 1, maxVolatilityBps: 1000, maxSpreadBps: 300, minLiquidityCoverageBps: 10000 },
  },
};
const request = {
  agentId: "market-agent",
  actionType: "Swap",
  amount: 10,
  asset: "USDC",
  outputAsset: "DAI",
  target: "0xrouter",
  targetType: "Trusted Contract",
  expectedOutput: 9.9,
  minimumReceived: 9.8,
  marketRiskNetwork: "base-sepolia",
};
const feed = (overrides = {}) => normalizeMarketRiskFeed({ generatedAt: NOW.toISOString(), observations: [{ baseAsset: "USDC", quoteAsset: "DAI", network: "base-sepolia", source: "provider-a", inputAmount: "10", confidence: 90, observedAt: NOW.toISOString(), volatilityBps: 100, spreadBps: 20, liquidityCoverageBps: 30000, ...overrides }] }, { now: NOW });

test("Risk Assessment records passing market-risk evidence", () => {
  const result = evaluateAction({ request, agents: [agent], policies: [basePolicy], auditLogs: [], marketRiskSignals: feed() });
  assert.equal(result.marketRiskSignalsContext.status, "passed");
  assert.ok(result.moduleFindings.some((item) => item.module === "Market Risk Signals" && item.rule === "Market-risk decision"));
});

test("Risk Assessment blocks a deterministic depeg signal", () => {
  const result = evaluateAction({ request, agents: [agent], policies: [basePolicy], auditLogs: [], marketRiskSignals: feed({ stablecoinDepegBps: 500 }) });
  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((item) => item.module === "Market Risk Signals" && item.rule === "Stablecoin peg deviation"));
});

test("passing market-risk evidence cannot override another blocking module", () => {
  const result = evaluateAction({ request, agents: [agent], policies: [{ ...basePolicy, blockedActions: ["Swap"] }], auditLogs: [], marketRiskSignals: feed() });
  assert.equal(result.decision, "Blocked");
});
