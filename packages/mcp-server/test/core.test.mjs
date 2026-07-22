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
});
