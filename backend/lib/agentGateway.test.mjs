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
