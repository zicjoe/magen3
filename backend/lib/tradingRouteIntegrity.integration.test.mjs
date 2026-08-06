import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAction } from "./policyEngine.mjs";

const agent = { id: "route-agent", status: "Active", executionCapabilities: ["Trading"] };
const routePolicy = {
  id: "route-policy",
  agentId: "route-agent",
  status: "Active",
  mode: "Enforce",
  allowedActions: ["Swap"],
  blockedActions: [],
  maxTransaction: 1000,
  dailyLimit: 10000,
  structuredRules: {
    tradingRouteIntegrity: {
      enabled: true,
      allowedRouters: ["0xrouter"],
      allowedAggregators: ["aggregator-a"],
      allowedIntermediateAssets: ["weth"],
      allowedPools: ["pool-1"],
    },
  },
};
const request = {
  agentId: "route-agent",
  actionType: "Swap",
  amount: 10,
  asset: "USDC",
  outputAsset: "DAI",
  target: "0xrouter",
  targetType: "Trusted Contract",
  expectedOutput: 9.9,
  minimumReceived: 9.8,
  tradingRouteQuoteProvider: "aggregator-a",
  tradingRouteQuoteId: "quote-1",
  tradingRouteRouter: "0xrouter",
  tradingRouteAggregator: "aggregator-a",
  tradingRoutePoolSequence: ["pool-1"],
  tradingRouteTokenPath: ["USDC", "WETH", "DAI"],
  tradingRouteInputAsset: "USDC",
  tradingRouteOutputAsset: "DAI",
  tradingRouteInputAmount: 10,
  tradingRouteExpectedOutput: 9.9,
  tradingRouteMinimumOutput: 9.8,
};

test("Risk Assessment records an exact approved trading route as passed", () => {
  const result = evaluateAction({ request, agents: [agent], policies: [routePolicy], auditLogs: [] });
  assert.equal(result.tradingRouteIntegrityContext.status, "passed");
  assert.ok(result.moduleFindings.some((finding) => finding.module === "Trading Route Integrity" && finding.rule === "Trading route integrity" && finding.status === "pass"));
});

test("Risk Assessment blocks a mutated trading router", () => {
  const result = evaluateAction({ request: { ...request, target: "0xmutated" }, agents: [agent], policies: [routePolicy], auditLogs: [] });
  assert.equal(result.decision, "Blocked");
  assert.ok(result.moduleFindings.some((finding) => finding.module === "Trading Route Integrity" && finding.rule === "Router-to-payload binding"));
});

test("successful route integrity cannot override another blocking module", () => {
  const result = evaluateAction({ request, agents: [agent], policies: [{ ...routePolicy, blockedActions: ["Swap"] }], auditLogs: [] });
  assert.equal(result.decision, "Blocked");
});
