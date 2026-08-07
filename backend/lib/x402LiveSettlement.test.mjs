import test from "node:test";
import assert from "node:assert/strict";
import { executeLiveX402, validateLiveX402Input } from "./x402LiveSettlement.mjs";
import { createHash } from "node:crypto";
const requirements = { scheme: "exact", network: "eip155:84532", amount: "1000", payTo: "0x1111111111111111111111111111111111111111" };
const requirementHash = createHash("sha256").update(JSON.stringify(requirements)).digest("hex");
const auditLog = { action: "x402 Payment", decision: "Allowed", originalIntent: { action: { x402: { version: 2, network: "eip155:84532", requestFingerprint: "a".repeat(64), paymentRequiredHash: requirementHash, resourceUrl: "https://api.example.com/data", httpMethod: "GET" } } } };

test("rejects mainnet live settlement", () => {
  const mainnet = structuredClone(auditLog); mainnet.originalIntent.action.x402.network = "eip155:8453";
  assert.throws(() => validateLiveX402Input({ auditLog: mainnet, body: { requestFingerprint: "a".repeat(64), paymentPayload: {}, paymentRequirements: requirements } }), /testnet-only/);
});

test("verifies, settles, retries and verifies resource delivery", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/verify")) return new Response(JSON.stringify({ isValid: true, payer: "0x2222222222222222222222222222222222222222" }), { status: 200 });
    if (String(url).endsWith("/settle")) return new Response(JSON.stringify({ success: true, transaction: "0x" + "b".repeat(64) }), { status: 200 });
    return new Response(JSON.stringify({ data: "paid" }), { status: 200, headers: { "content-type": "application/json", "PAYMENT-RESPONSE": "settled" } });
  };
  const result = await executeLiveX402({ auditLog, body: { requestFingerprint: "a".repeat(64), paymentPayload: { signature: "0xsigned" }, paymentRequirements: requirements }, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.resource.delivered, true);
  assert.equal(calls.length, 3);
  assert.ok(result.lifecycle.some((x) => x.state === "authorization_verified"));
  assert.ok(result.lifecycle.some((x) => x.state === "payment_settled"));
});
