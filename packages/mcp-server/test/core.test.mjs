import test from "node:test";
import assert from "node:assert/strict";
import { createToolHandlers, configFromEnv, INTENT_SCHEMA_DESCRIPTION, OFFICIAL_MCP_INTEGRITY } from "../dist/core.js";

test("configFromEnv fails closed when credentials are missing", () => {
  assert.throws(() => configFromEnv({}), /MAGEN3_GATEWAY_URL/);
});


test("configFromEnv uses the canonical public environment contract", () => {
  const config = configFromEnv({
    MAGEN3_GATEWAY_URL: "https://api.example/api/agent-gateway/intents",
    MAGEN3_AGENT_ID: "MAG-1",
    MAGEN3_API_KEY: "canonical-key",
  });
  assert.equal(config.gatewayUrl, "https://api.example");
  assert.equal(config.apiKey, "canonical-key");
});

test("configFromEnv accepts legacy API-key aliases during migration", () => {
  const first = configFromEnv({ MAGEN3_GATEWAY_URL: "https://api.example", MAGEN3_AGENT_ID: "MAG-1", MAGEN3_AGENT_KEY: "legacy-one" });
  const second = configFromEnv({ MAGEN3_GATEWAY_URL: "https://api.example", MAGEN3_AGENT_ID: "MAG-1", MAGEN3_AGENT_API_KEY: "legacy-two" });
  assert.equal(first.apiKey, "legacy-one");
  assert.equal(second.apiKey, "legacy-two");
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
  assert.match(result.content[0].text, /Proceed only with the exact evaluated parameters/);
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

test("checkIntent routes autonomous review to agent remediation instead of human approval", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => ({
      ok: true,
      executionApproved: false,
      result: {
        decision: "Review Required",
        risk: "Medium",
        riskScore: 45,
        reason: "Destination evidence is incomplete",
        recommendedAction: "Supply destination evidence",
      },
      gatewayRequest: {},
      auditLog: {},
      nextAction: "Supply destination evidence",
      agentMessage: "Magen3 paused this action because destination evidence is incomplete. No human approval is required yet. Nothing was signed or sent.",
      reviewResolution: {
        strategy: "Autonomous",
        mode: "agent_remediation",
        state: "awaiting_agent_remediation",
        humanActionRequired: false,
        agentActionRequired: true,
        canAgentRetry: true,
        mayAutoResume: false,
        requiredActions: ["Supply destination evidence"],
        summary: "Autonomous remediation is required",
      },
    }),
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
    reportExecutionReconciliation: async () => ({ ok: true }),
    pollExecutionReconciliation: async () => ({ ok: true }),
  });
  const result = await handlers.checkIntent({ executionWalletAddress: "01abc", action: { type: "Transfer", target: "01def" } });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /No human approval is required yet/i);
  assert.match(result.content[0].text, /Do not poll human approval/i);
});

test("checkIntent tells the agent to poll approval only for human-escalated review", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => ({
      ok: true,
      executionApproved: false,
      result: {
        decision: "Review Required",
        risk: "High",
        riskScore: 90,
        reason: "Privileged action requires independent approval",
        recommendedAction: "Complete approval",
      },
      gatewayRequest: {},
      auditLog: {},
      nextAction: "Complete approval",
      agentMessage: "Magen3 paused this action because it is privileged. Human approval is required by the active policy. Nothing was signed or sent.",
      reviewResolution: {
        strategy: "Autonomous",
        mode: "human_approval",
        state: "awaiting_human_approval",
        humanActionRequired: true,
        agentActionRequired: false,
        canAgentRetry: false,
        mayAutoResume: false,
        requiredActions: ["Complete approval"],
        summary: "Independent approval is required",
      },
    }),
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
    reportExecutionReconciliation: async () => ({ ok: true }),
    pollExecutionReconciliation: async () => ({ ok: true }),
  });
  const result = await handlers.checkIntent({ executionWalletAddress: "01abc", action: { type: "Contract Interaction", target: "hash" } });
  assert.match(result.content[0].text, /poll the bound approval request/i);
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
  assert.match(INTENT_SCHEMA_DESCRIPTION.rpcChainIntegrity, /trusted RPC adapters/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.rpcIntegrity.providerObservations, /sync state/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.rpcIntegrity.failoverReason, /failover/i);
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

test("reportExecutionReconciliation delegates public post-authorization state", async () => {
  let captured;
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
    reportExecutionReconciliation: async (update) => { captured = update; return { ok: true, reconciliation: { status: "confirmed" } }; },
  });
  const result = await handlers.reportExecutionReconciliation({
    auditLogId: "AUDIT-EXEC-1",
    status: "confirmed",
    transactionHash: `0x${"d".repeat(64)}`,
    attempt: 1,
    confirmations: 3,
    finalized: true,
    resourceDelivered: true,
  });
  assert.equal(result.isError, undefined);
  assert.equal(captured.auditLogId, "AUDIT-EXEC-1");
  assert.equal(captured.confirmations, 3);
  assert.match(result.content[0].text, /confirmed/);
});

test("pollExecutionReconciliation delegates backend-configured polling", async () => {
  let captured;
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => ({ ok: true }),
    requireAllowed: async () => ({ ok: true }),
    getApproval: async () => ({ ok: true }),
    reportX402Settlement: async () => ({ ok: true }),
    reportExecutionReconciliation: async () => ({ ok: true }),
    pollExecutionReconciliation: async (options) => { captured = options; return { ok: true, reconciliation: { status: "pending", provider: "configured-casper-rpc" } }; },
  });
  const result = await handlers.pollExecutionReconciliation({ auditLogId: "AUDIT-POLL-1", chainFamily: "casper", chainName: "casper-test" });
  assert.equal(captured.auditLogId, "AUDIT-POLL-1");
  assert.equal(captured.chainFamily, "casper");
  assert.match(result.content[0].text, /configured-casper-rpc/);
});

test("intent schema exposes the reconciliation security boundary", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }), checkIntent: async () => ({ ok: true }), requireAllowed: async () => ({ ok: true }),
    getApproval: async () => ({ ok: true }), reportX402Settlement: async () => ({ ok: true }), reportExecutionReconciliation: async () => ({ ok: true }), pollExecutionReconciliation: async () => ({ ok: true }),
  });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Execution & Settlement Reconciliation/i);
  assert.match(result.content[0].text, /unsafe retries/i);
  assert.match(result.content[0].text, /raw signed transactions/i);
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
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.instructionIntegrity.originalProtectedParameters, /original normalized snapshot/i);
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

test("intent schema exposes the Tool & MCP Integrity boundary", async () => {
  assert.match(INTENT_SCHEMA_DESCRIPTION.toolMcpIntegrity, /approved server ID\/URL/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.toolIntegrity.schemaHash, /SHA-256/i);
  const handlers = createToolHandlers({ verifyAgent: async () => ({ ok: true }), checkIntent: async () => { throw new Error("unused"); }, requireAllowed: async () => { throw new Error("unused"); }, getApproval: async () => { throw new Error("unused"); }, reportX402Settlement: async () => ({ ok: true }) });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Tool & MCP Integrity verifies the exact approved server\/tool identity/i);
  assert.match(result.content[0].text, /never send server credentials/i);
});


test("official MCP tools inject stable integrity metadata when the caller omits it", async () => {
  let checked;
  let required;
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async (intent) => { checked = intent; return { ok: true, result: { decision: "Allowed", risk: "Low", riskScore: 0, reason: "ok", recommendedAction: "continue" }, gatewayRequest: {}, auditLog: {}, nextAction: "Sign" }; },
    requireAllowed: async (intent) => { required = intent; return { ok: true, executionApproved: true, result: { decision: "Allowed", risk: "Low", riskScore: 0, reason: "ok", recommendedAction: "continue" }, gatewayRequest: {}, auditLog: {}, nextAction: "Sign" }; },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const intent = { executionWalletAddress: "01abc", action: { type: "Transfer", target: "01def" } };
  await handlers.checkIntent(intent);
  await handlers.requireAllowed(intent);
  assert.equal(checked.action.toolIntegrity.mcpServerId, OFFICIAL_MCP_INTEGRITY.serverId);
  assert.equal(checked.action.toolIntegrity.toolName, "magen3_check_intent");
  assert.equal(checked.action.toolIntegrity.schemaHash, OFFICIAL_MCP_INTEGRITY.tools.magen3_check_intent.schemaHash);
  assert.equal(required.action.toolIntegrity.toolName, "magen3_require_allowed");
  assert.equal(required.action.toolIntegrity.manifestHash, OFFICIAL_MCP_INTEGRITY.manifestHash);
  assert.equal(intent.action.toolIntegrity, undefined);
});

test("official MCP tools preserve explicit downstream tool metadata", async () => {
  let captured;
  const explicit = { mcpServerId: "external-mcp", toolName: "wallet.transfer", manifestHash: "a".repeat(64), schemaHash: "b".repeat(64), tls: true };
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async (intent) => { captured = intent; return { ok: true, result: { decision: "Allowed", risk: "Low", riskScore: 0, reason: "ok", recommendedAction: "continue" }, gatewayRequest: {}, auditLog: {}, nextAction: "Sign" }; },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  await handlers.checkIntent({ executionWalletAddress: "01abc", action: { type: "Transfer", target: "01def", toolIntegrity: explicit } });
  assert.deepEqual(captured.action.toolIntegrity, explicit);
});

test("intent schema exposes Delegation & Session Key Safety without granting MCP signing authority", async () => {
  assert.match(INTENT_SCHEMA_DESCRIPTION.delegationSafety, /Casper Wallet attestation/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.delegationSafety, /never creates signatures/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.delegation.attestationSignature, /MCP never creates it/i);
  const handlers = createToolHandlers({ verifyAgent: async () => ({ ok: true }), checkIntent: async () => { throw new Error("unused"); }, requireAllowed: async () => { throw new Error("unused"); }, getApproval: async () => { throw new Error("unused"); }, reportX402Settlement: async () => ({ ok: true }) });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Delegation & Session Key Safety verifies a caller-supplied Casper Wallet attestation/i);
  assert.match(result.content[0].text, /never generates delegation signatures/i);
});


test("intent schema exposes the RPC & Chain Integrity boundary", async () => {
  const handlers = createToolHandlers({
    verifyAgent: async () => ({ ok: true }),
    checkIntent: async () => { throw new Error("unused"); },
    requireAllowed: async () => { throw new Error("unused"); },
    getApproval: async () => { throw new Error("unused"); },
    reportX402Settlement: async () => ({ ok: true }),
  });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /RPC & Chain Integrity verifies adapter-supplied provider identity/i);
  assert.match(result.content[0].text, /never fabricates provider observations/i);
});

test("intent schema exposes Gas Sponsorship & Fee Safety without granting sponsor authority", async () => {
  assert.match(INTENT_SCHEMA_DESCRIPTION.gasSponsorshipFeeSafety, /relayer, sponsor, or EVM Paymaster/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.gasSponsorshipFeeSafety, /never creates sponsorships/i);
  assert.match(INTENT_SCHEMA_DESCRIPTION.action.feeSafety.sponsorSignatureHash, /hash/i);
  const handlers = createToolHandlers({ verifyAgent: async () => ({ ok: true }), checkIntent: async () => { throw new Error("unused"); }, requireAllowed: async () => { throw new Error("unused"); }, getApproval: async () => { throw new Error("unused"); }, reportX402Settlement: async () => ({ ok: true }) });
  const result = await handlers.getIntentSchema();
  assert.match(result.content[0].text, /Gas Sponsorship & Fee Safety/i);
  assert.match(result.content[0].text, /never.*raw sponsor signatures/i);
});
