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

test("normalizes explicit token approval and permit metadata without accepting signed payloads", () => {
  const TOKEN = `hash-${"c".repeat(64)}`;
  const SPENDER = `01${"d".repeat(64)}`;
  const normalized = normalizeAgentGatewayIntent(intent({
    type: "Permit Authorization",
    target: TOKEN,
    targetType: "Token Contract",
    chainName: "casper-test",
    tokenPermission: {
      kind: "permit",
      standard: "CEP-18",
      network: "casper-test",
      tokenContract: TOKEN,
      tokenIdentifierType: "Contract Hash",
      owner: WALLET,
      spender: SPENDER,
      approvalAmount: 10,
      intendedTransactionAmount: 10,
      deadline: "2026-07-23T11:00:00.000Z",
      nonce: "7",
      permitIdentifier: "permit:gateway-0001",
      permitSignatureHash: "e".repeat(64),
      oneTime: true,
    },
  }));

  assert.equal(normalized.actionType, "Permit Authorization");
  assert.equal(normalized.targetType, "Token Contract");
  assert.equal(normalized.tokenPermission.kind, "permit");
  assert.equal(normalized.tokenPermission.standard, "CEP-18");
  assert.equal(normalized.tokenPermission.tokenContract, TOKEN);
  assert.equal(normalized.tokenPermission.spender, SPENDER);
  assert.equal(normalized.tokenPermission.approvalAmount, 10);
  assert.equal(normalized.tokenPermission.permitSignatureHash, "e".repeat(64));
  assert.equal(normalized.tokenPermission.oneTime, true);
});

test("normalizes bounded token approval batches and caps nested recursion", () => {
  const TOKEN = `hash-${"c".repeat(64)}`;
  const normalized = normalizeAgentGatewayIntent(intent({
    type: "Batch Approval",
    target: TOKEN,
    targetType: "Token Contract",
    chainName: "casper-test",
    tokenPermission: {
      kind: "Batch Approval",
      network: "casper-test",
      tokenContract: TOKEN,
      owner: WALLET,
      spender: `01${"d".repeat(64)}`,
      batch: [
        { kind: "Token Approval", spender: `01${"e".repeat(64)}`, approvalAmount: 2 },
        { kind: "Token Approval", spender: `01${"f".repeat(64)}`, approvalAmount: 3, batch: [{ spender: WALLET }] },
      ],
    },
  }));

  assert.equal(normalized.tokenPermission.batch.length, 2);
  assert.equal(normalized.tokenPermission.batch[0].approvalAmount, 2);
  assert.deepEqual(normalized.tokenPermission.batch[1].batch, []);
});

test("rejects raw permit signatures and signed permit payloads", () => {
  assert.throws(() => normalizeAgentGatewayIntent(intent({
    type: "Permit Authorization",
    tokenPermission: { permitSignature: "0xdeadbeef" },
  })), /signing material/i);

  assert.throws(() => normalizeAgentGatewayIntent(intent({
    type: "Permit Authorization",
    tokenPermission: { signedPermit: { owner: WALLET, signature: "0xdeadbeef" } },
  })), /signing material/i);

  assert.throws(() => normalizeAgentGatewayIntent(intent({
    type: "Permit Authorization",
    tokenPermission: { permitPayload: "opaque-signed-payload" },
  })), /signing material/i);
});
