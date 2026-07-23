import test from "node:test";
import assert from "node:assert/strict";
import { createToolHandlers, configFromEnv, INTENT_SCHEMA_DESCRIPTION } from "../dist/core.js";

test("configFromEnv fails closed when credentials are missing", () => {
  assert.throws(() => configFromEnv({}), /MAGEN3_GATEWAY_URL/);
});

test("requireAllowed returns success for an Allowed decision", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => ({ ok: true, executionApproved: true, result: { decision: "Allowed", risk: "Low", riskScore: 1, reason: "Within policy", recommendedAction: "Continue" }, gatewayRequest: {}, auditLog: {}, nextAction: "Sign" }),
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", target: "01def" } });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /Allowed by Magen3/);
});

test("requireAllowed fails closed when SDK rejects the decision", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("Magen3 returned Blocked: amount exceeds policy"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", target: "01def" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Blocked/);
});


test("intent schema describes live contract validation and execution preflight fields", () => {
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.entryPoint, /required/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.contractIdentifierType, /Contract Hash/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.contractVersion, /package/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.chainName, /Gateway/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.preflight.paymentAmountMotes, /positive integer/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.preflight.ttl, /duration/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.preflight.slippageBps, /structure/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.threatIntelligence, /freshness-checked/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.oracleValidation, /execution price/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.outputAsset, /quote asset/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.oracle.executionPrice, /proposed/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.bridgeControls, /provider-supplied/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.bridge.destinationChain, /destination chain/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.bridge.quoteExpiresAt, /expiry/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.complianceControls, /non-sensitive/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.compliance.travelRule, /opaque/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.compliance.screening, /Clear/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.x402PaymentControls, /request ID/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.x402.network, /CAIP-2/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.x402.paymentRequiredHash, /PAYMENT-REQUIRED/i);
});

test("reportX402Settlement delegates a bound settlement update", async () => {
  let captured;
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    reportX402Settlement: async (update) => { captured = update; return { ok: true, settlement: { status: "confirmed" } }; },
  });
  const result = await handlers.reportX402Settlement({
    auditLogId: "AUDIT-X402-1",
    status: "confirmed",
    requestFingerprint: "a".repeat(64),
    transactionHash: `0x${"b".repeat(64)}`,
    attempt: 1,
    resourceDelivered: true,
  });
  assert.equal(result.isError, undefined);
  assert.equal(captured.auditLogId, "AUDIT-X402-1");
  assert.equal(captured.resourceDelivered, true);
});
