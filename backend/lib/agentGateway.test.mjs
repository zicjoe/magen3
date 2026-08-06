import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAgentGatewayIntent } from "./agentGateway.mjs";

const WALLET = `01${"a".repeat(64)}`;
const TARGET = `01${"b".repeat(64)}`;

function intent(overrides = {}) {
  return {
    agentId: "MAG-AGENT-test",
    executionWalletAddress: WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: TARGET,
      targetType: "Wallet Address",
      ...overrides,
    },
  };
}

test("normalizes execution-preflight metadata without changing the public gateway contract", () => {
  const normalized = normalizeAgentGatewayIntent(intent({
    preflight: {
      paymentAmountMotes: "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      timestamp: "2026-07-22T10:00:00.000Z",
      slippageBps: 300,
      expectedOutput: 9.8,
      minimumReceived: 9.5,
      runtimeArgs: { amount: "1000000000" },
      transactionHash: "f".repeat(64),
    },
  }));

  assert.equal(normalized.paymentAmountMotes, "5000000000");
  assert.equal(normalized.gasPriceTolerance, 1);
  assert.equal(normalized.ttl, "30m");
  assert.equal(normalized.transactionTimestamp, "2026-07-22T10:00:00.000Z");
  assert.equal(normalized.slippageBps, 300);
  assert.equal(normalized.expectedOutput, 9.8);
  assert.equal(normalized.minimumReceived, 9.5);
  assert.deepEqual(normalized.runtimeArgs, { amount: "1000000000" });
  assert.equal(normalized.transactionHash, "f".repeat(64));
});

test("preserves zero-valued construction fields so deterministic preflight can reject them", () => {
  const normalized = normalizeAgentGatewayIntent(intent({
    preflight: { paymentAmountMotes: 0, ttl: 0, transactionHash: 0 },
  }));

  assert.equal(normalized.paymentAmountMotes, "0");
  assert.equal(normalized.ttl, "0");
  assert.equal(normalized.transactionHash, "0");
});

test("rejects signing material before normalization or audit persistence", () => {
  assert.throws(() => normalizeAgentGatewayIntent(intent({
    preflight: {
      paymentAmountMotes: "5000000000",
      privateKey: "do-not-accept",
    },
  })), /signing material/i);

  assert.throws(() => normalizeAgentGatewayIntent(intent({
    transaction: {
      approvals: [{ signer: WALLET, signature: "01deadbeef" }],
    },
  })), /signing material/i);

  assert.throws(() => normalizeAgentGatewayIntent({
    ...intent(),
    privateKey: "root-secret-must-not-enter-the-gateway",
  }), /signing material/i);

});

test("permits public contract arguments named signature without accepting transaction approvals", () => {
  const normalized = normalizeAgentGatewayIntent(intent({
    type: "Contract Interaction",
    preflight: { runtimeArgs: { signature: "public-contract-argument", seed: "public-randomness" } },
  }));

  assert.equal(normalized.runtimeArgs.signature, "public-contract-argument");
  assert.equal(normalized.runtimeArgs.seed, "public-randomness");
});

test("rejects non-object runtime arguments at the gateway boundary", () => {
  assert.throws(() => normalizeAgentGatewayIntent(intent({
    preflight: { runtimeArgs: ["amount"] },
  })), /runtimeArgs must be an object/);
});

test("normalizes lifecycle and replay metadata inside the existing action envelope", () => {
  const normalized = normalizeAgentGatewayIntent(intent({
    lifecycle: {
      intentId: "intent:gateway-0001",
      idempotencyKey: "idempotency:gateway-0001",
      sequence: 7,
      createdAt: "2026-07-23T10:00:00.000Z",
      expiresAt: "2026-07-23T10:10:00.000Z",
      retryOf: "AUD-previous",
      attempt: 1,
      intentFingerprint: "a".repeat(64),
    },
  }));

  assert.equal(normalized.lifecycleIntentId, "intent:gateway-0001");
  assert.equal(normalized.lifecycleIdempotencyKey, "idempotency:gateway-0001");
  assert.equal(normalized.lifecycleSequence, 7);
  assert.equal(normalized.lifecycleCreatedAt, "2026-07-23T10:00:00.000Z");
  assert.equal(normalized.lifecycleExpiresAt, "2026-07-23T10:10:00.000Z");
  assert.equal(normalized.lifecycleRetryOf, "AUD-previous");
  assert.equal(normalized.lifecycleAttempt, 1);
  assert.equal(normalized.lifecycleIntentFingerprint, "a".repeat(64));
});


test("normalizes MEV execution-quality metadata inside the existing action envelope", () => {
  const normalized = normalizeAgentGatewayIntent({
    agentId: "agent-mev",
    action: { type: "Swap", amount: 10, asset: "USDC", target: "0x1111111111111111111111111111111111111111",
      expectedOutput: 9.9, minimumReceived: 9.8,
      executionQuality: { quoteProvider: "test-aggregator", quoteId: "q-1", quoteTimestamp: "2026-08-06T09:00:00.000Z", quoteExpiresAt: "2026-08-06T09:01:00.000Z", deadline: "2026-08-06T09:02:00.000Z", priceImpactBps: 25, simulatedOutput: 9.85, executionChannel: "private", privateExecutionAvailable: true } }
  });
  assert.equal(normalized.executionQuoteProvider, "test-aggregator");
  assert.equal(normalized.priceImpactBps, 25);
  assert.equal(normalized.simulatedOutput, 9.85);
  assert.equal(normalized.privateExecutionAvailable, true);
});

test("normalizes Trading Route Integrity metadata inside the existing action envelope", () => {
  const normalized = normalizeAgentGatewayIntent({
    agentId: "agent-route",
    action: {
      type: "Swap",
      amount: 10,
      asset: "USDC",
      outputAsset: "DAI",
      target: "0xrouter",
      expectedOutput: 9.9,
      minimumReceived: 9.8,
      tradingRoute: {
        quoteProvider: "aggregator-a",
        quoteId: "quote-1",
        router: "0xrouter",
        poolSequence: ["pool-1", "pool-2"],
        tokenPath: ["USDC", "WETH", "DAI"],
        inputAsset: "USDC",
        outputAsset: "DAI",
        inputAmount: 10,
        expectedOutput: 9.9,
        minimumOutput: 9.8,
        feeRecipients: ["fee-recipient"],
        payloadHash: "a".repeat(64),
      },
    },
  });
  assert.equal(normalized.tradingRouteQuoteProvider, "aggregator-a");
  assert.equal(normalized.tradingRouteRouter, "0xrouter");
  assert.deepEqual(normalized.tradingRouteTokenPath, ["USDC", "WETH", "DAI"]);
  assert.equal(normalized.tradingRoutePayloadHash, "a".repeat(64));
});

test("rejects oversized trading-route calldata at the Gateway boundary", () => {
  assert.throws(() => normalizeAgentGatewayIntent({ agentId: "agent-route", action: { type: "Swap", amount: 1, target: "0xrouter", tradingRoute: { calldata: `0x${"00".repeat(131073)}` } } }), /tradingRoute\.calldata exceeds/);
});

test("normalizes Market Risk Signals pair and route selectors without accepting client risk metrics", () => {
  const normalized = normalizeAgentGatewayIntent({
    agentId: "agent-market-risk",
    action: {
      type: "Swap",
      amount: 10,
      asset: "USDC",
      outputAsset: "DAI",
      target: "0xrouter",
      marketRisk: {
        baseAsset: "USDC",
        quoteAsset: "DAI",
        baseCanonicalId: "evm:84532:fungible_token:0xabc",
        quoteCanonicalId: "evm:84532:fungible_token:0xdef",
        chainFamily: "EVM",
        network: "base-sepolia",
        venue: "aggregator-a",
        poolId: "pool-1",
        volatilityBps: 999999
      }
    }
  });
  assert.equal(normalized.marketRiskMetadataSupplied, true);
  assert.equal(normalized.marketRiskBaseAsset, "USDC");
  assert.equal(normalized.marketRiskQuoteAsset, "DAI");
  assert.equal(normalized.marketRiskNetwork, "base-sepolia");
  assert.equal(normalized.marketRiskVenue, "aggregator-a");
  assert.equal(normalized.marketRiskPoolId, "pool-1");
  assert.equal("marketRiskVolatilityBps" in normalized, false);
});
