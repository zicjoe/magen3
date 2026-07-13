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
