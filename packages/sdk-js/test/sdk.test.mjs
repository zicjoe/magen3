import test from "node:test";
import assert from "node:assert/strict";
import { Magen3Client, Magen3Error } from "../dist/index.js";

test("checkIntent authenticates and injects agent identity", async () => {
  let captured;
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true, executionApproved: true, result: { decision: "Allowed", risk: "Low", riskScore: 5, reason: "ok", recommendedAction: "sign" }, gatewayRequest: {}, auditLog: {}, nextAction: "sign" }), { status: 201 });
  }});
  const result = await client.checkIntent({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 1, target: "01def" } });
  assert.equal(result.result.decision, "Allowed");
  assert.equal(captured.url, "https://api.example/api/agent-gateway/intents");
  assert.equal(captured.init.headers.get("x-magen3-agent-key"), "secret");
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.agentId, "MAG-1");
  assert.equal(payload.walletAddress, "01abc");
});

test("requireAllowed stops blocked execution", async () => {
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async () => new Response(JSON.stringify({ ok: true, executionApproved: false, result: { decision: "Blocked", risk: "High", riskScore: 80, reason: "limit exceeded", recommendedAction: "stop" }, gatewayRequest: {}, auditLog: {}, nextAction: "stop" }), { status: 201 }) });
  await assert.rejects(() => client.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 100, target: "01def" } }), Magen3Error);
});

test("normalizes trailing gateway URL slashes without a regular expression", async () => {
  let capturedUrl;
  const client = new Magen3Client({
    gatewayUrl: `  https://api.example${"/".repeat(10_000)}  `,
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await client.verifyAgent();
  assert.equal(capturedUrl, "https://api.example/api/agent-gateway/me?agentId=MAG-1");
});


test("preserves contract validation metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 8, reason: "approved contract", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    targetChain: "casper-testnet",
    action: {
      type: "Contract Call",
      target: `contract-package-hash-${"a".repeat(64)}`,
      targetType: "Trusted Contract",
      contractIdentifierType: "Package Hash",
      entryPoint: "deposit",
      contractVersion: 1,
      chainName: "casper-test",
    },
  });

  assert.equal(captured.action.contractIdentifierType, "Package Hash");
  assert.equal(captured.action.entryPoint, "deposit");
  assert.equal(captured.action.contractVersion, 1);
  assert.equal(captured.action.chainName, "casper-test");
});


test("preserves execution preflight metadata without signing material", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 12, reason: "preflight passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Swap",
      amount: 10,
      target: "DEX_ROUTER",
      preflight: {
        paymentAmountMotes: "5000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: "2026-07-22T10:00:00.000Z",
        slippageBps: 300,
        expectedOutput: 9.8,
        minimumReceived: 9.5,
      },
    },
  });

  assert.equal(captured.action.preflight.paymentAmountMotes, "5000000000");
  assert.equal(captured.action.preflight.gasPriceTolerance, 1);
  assert.equal(captured.action.preflight.slippageBps, 300);
  assert.equal(captured.action.preflight.minimumReceived, 9.5);
});

test("preserves Oracle Validation price metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 10, reason: "oracle checks passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Swap",
      amount: 10,
      asset: "CSPR",
      outputAsset: "USD",
      target: "DEX_ROUTER",
      oracle: {
        baseAsset: "CSPR",
        quoteAsset: "USD",
        executionPrice: 0.025,
        quoteTimestamp: "2026-07-22T15:00:00.000Z",
      },
    },
  });

  assert.equal(captured.action.outputAsset, "USD");
  assert.equal(captured.action.oracle.baseAsset, "CSPR");
  assert.equal(captured.action.oracle.quoteAsset, "USD");
  assert.equal(captured.action.oracle.executionPrice, 0.025);
});
