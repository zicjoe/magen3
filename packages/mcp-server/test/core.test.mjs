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
  assert.match(INTENT_SCHEMA_DESCRIPTION.executionIntegrity, /idempotency/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.lifecycle.intentId, /unique/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.lifecycle.retryOf, /audit ID/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.tokenPermissionControls, /fingerprint/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.tokenPermission.permissionType, /classification/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.tokenPermission.deadline, /expiration/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.privilegedActionControls, /administrative/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.emergencyCircuitBreaker, /pause state/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.privilegedAction.classifiedAction, /classification/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.privilegedAction.requestedValue, /approval/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.contractUpgradeSafety, /implementation/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.contractUpgrade.requestedImplementation, /proposed/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.contractUpgrade.executeAfter, /delay/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.preflight.runtimeArgs, /runtime-argument/i);
});



test("intent schema exposes the Contract Argument Policies boundary", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Contract Argument Policies evaluate public unsigned runtimeArgs/i);
  assert.match(result.content[0].text, /secret application data/i);
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

test("getApproval polls the exact-bound review workflow and gives fail-closed guidance", async () => {
  let captured;
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async (id) => {
      captured = id;
      return {
        ok: true,
        approval: {
          id: "APR-1",
          auditLogId: "AUDIT-1",
          agentId: "MAG-1",
          actionType: "Transfer",
          amount: 30,
          target: "01def",
          decision: "Review Required",
          reviewStatus: "Pending",
          bindingHash: "a".repeat(64),
          requiredApprovals: 2,
          approvalsReceived: 1,
          verifiedApprovalsReceived: 1,
          signatureRequired: true,
          remainingApprovals: 1,
          expiresAt: "2026-07-23T12:00:00.000Z",
          mayProceedToSigning: false,
        },
      };
    },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getApproval({ approvalOrAuditId: "AUDIT-1" });
  assert.equal(captured, "AUDIT-1");
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /still pending/i);
  assert.match(result.content[0].text, /Do not sign/i);
});


test("getApproval surfaces cryptographically verified quorum guidance", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => ({
      ok: true,
      approval: {
        id: "APR-SIGNED", auditLogId: "AUD-SIGNED", agentId: "MAG-1", actionType: "Transfer", amount: 30, target: "01def",
        decision: "Review Required", reviewStatus: "Approved", bindingHash: "a".repeat(64), requiredApprovals: 1, approvalsReceived: 1,
        verifiedApprovalsReceived: 1, signatureRequired: true, remainingApprovals: 0, expiresAt: "2026-07-23T12:00:00.000Z", mayProceedToSigning: true,
      },
    }),
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getApproval({ approvalOrAuditId: "AUD-SIGNED" });
  assert.match(result.content[0].text, /cryptographically verified organizational quorum/i);
});

test("intent schema exposes the organizational approval security boundary", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /named role groups/i);
  assert.match(result.content[0].text, /cannot.*accelerate escalation/i);
});

test("getApproval prevents signing during an organizational execution delay", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => ({
      ok: true,
      approval: {
        id: "APR-DELAY", auditLogId: "AUD-DELAY", agentId: "MAG-1", actionType: "DAO Treasury Payment", amount: 15000, target: "01def",
        decision: "Review Required", reviewStatus: "Approved", bindingHash: "a".repeat(64), requiredApprovals: 3, approvalsReceived: 3,
        verifiedApprovalsReceived: 3, signatureRequired: true, remainingApprovals: 0, expiresAt: "2026-07-23T13:00:00.000Z",
        executionWindowStatus: "delay", executionDelayRemainingSeconds: 1200, mayProceedToSigning: false,
        groupProgress: [
          { groupId: "treasury", groupName: "Treasury", required: 2, received: 2, remaining: 0, satisfied: true },
          { groupId: "security", groupName: "Security", required: 1, received: 1, remaining: 0, satisfied: true },
        ],
      },
    }),
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getApproval({ approvalOrAuditId: "AUD-DELAY" });
  assert.match(result.content[0].text, /execution remains locked/i);
  assert.match(result.content[0].text, /Do not sign early/i);
});

test("getApproval names missing organizational roles while pending", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => ({
      ok: true,
      approval: {
        id: "APR-ROLES", auditLogId: "AUD-ROLES", agentId: "MAG-1", actionType: "DAO Treasury Payment", amount: 15000, target: "01def",
        decision: "Review Required", reviewStatus: "Pending", bindingHash: "a".repeat(64), requiredApprovals: 3, approvalsReceived: 2,
        verifiedApprovalsReceived: 2, signatureRequired: true, remainingApprovals: 1, expiresAt: "2026-07-23T13:00:00.000Z",
        executionWindowStatus: "not_started", mayProceedToSigning: false,
        groupProgress: [
          { groupId: "treasury", groupName: "Treasury", required: 2, received: 2, remaining: 0, satisfied: true },
          { groupId: "security", groupName: "Security", required: 1, received: 0, remaining: 1, satisfied: false },
        ],
      },
    }),
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getApproval({ approvalOrAuditId: "AUD-ROLES" });
  assert.match(result.content[0].text, /Security: 1 remaining/i);
  assert.match(result.content[0].text, /Do not sign/i);
});

test("intent schema exposes the Agent Instruction Integrity security boundary", async () => {
  assert.match(INTENT_SCHEMA_DESCRIPTION.instructionIntegrity, /stable goal ID/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.instructionIntegrity.originalUserGoalHash, /SHA-256/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.instructionIntegrity.currentPermissionScopes, /current tool execution/i);
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }), checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); }, getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Instruction Integrity verifies adapter-supplied provenance/i);
  assert.match(result.content[0].text, /does not.*detect every prompt-injection attack/i);
});
