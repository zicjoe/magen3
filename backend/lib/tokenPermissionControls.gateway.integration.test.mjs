import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const APPROVED_SPENDER = `01${"3".repeat(64)}`;
const UNKNOWN_SPENDER = `01${"4".repeat(64)}`;
const BLOCKED_SPENDER = `01${"5".repeat(64)}`;
const TOKEN_CONTRACT = `contract-${"6".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Token Permission Integration Agent",
    type: "Trading Agent",
    purpose: "Token Approval and Permit Safety integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "Token Permission Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 1000,
    dailyLimit: 5000,
    approvalThreshold: 900,
    trustedContracts: [TOKEN_CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["approve", "permit", "set_approval_for_all", "batch_approve"],
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: "Review",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Review",
      tokenPermissionMaxApprovalAmount: 1000,
      tokenPermissionMaxApprovalToTransactionRatio: 2,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionRequireExpiry: true,
      tokenPermissionRequireAllowanceReset: false,
      tokenPermissionApprovedSpenders: [APPROVED_SPENDER],
      tokenPermissionBlockedSpenders: [BLOCKED_SPENDER],
      tokenPermissionAllowNftOperatorApproval: false,
      tokenPermissionAllowBatchApproval: true,
      tokenPermissionRequireChainBinding: true,
      tokenPermissionRequireNonce: true,
      tokenPermissionMaximumBatchSize: 5,
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Single",
      approvalRequiredCount: 1,
      approvalApproverWallets: [OWNER_WALLET],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
    },
  });
  return { store, agent };
}

function intent(agentId, overrides = {}) {
  const { action: actionOverrides = {}, tokenPermission: permissionOverrides = {}, ...requestOverrides } = overrides;
  return {
    source: "token-permission-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Contract Interaction",
      amount: 100,
      asset: "TEST",
      target: TOKEN_CONTRACT,
      targetType: "Trusted Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint: "approve",
      chainName: "casper-test",
      tokenPermission: {
        permissionType: "Fungible Token Approval",
        owner: EXECUTION_WALLET,
        tokenContract: TOKEN_CONTRACT,
        tokenStandard: "CEP-18",
        spender: APPROVED_SPENDER,
        approvalAmount: 100,
        intendedTransactionAmount: 100,
        unlimited: false,
        network: "casper-test",
        approvedProtocol: "approved-router",
        allowanceResetExpected: false,
        ...permissionOverrides,
      },
      ...actionOverrides,
    },
    ...requestOverrides,
  };
}

test("Gateway allows a bounded approved token permission and persists complete audit evidence", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.tokenPermissionControlsContext.permissionType, "Fungible Token Approval");
  assert.equal(response.result.tokenPermissionControlsContext.replayStatus, "clear");
  assert.match(response.result.tokenPermissionControlsContext.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Token Permission Controls" && item.status === "pass"));
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "token-permission-controls" && stage.status === "completed"));
  assert.equal(response.auditLog.originalIntent.action.tokenPermission.spender, APPROVED_SPENDER);
  assert.equal(response.auditLog.originalIntent.action.tokenPermission.approvalAmount, 100);
  assert.match(response.auditLog.originalIntent.action.tokenPermission.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
});

test("Gateway routes an unknown spender to Human Approval without weakening contract validation", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, { tokenPermission: { spender: UNKNOWN_SPENDER } }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Approved spender" && item.status === "warning"));
  assert.ok(response.auditLog.moduleFindings.some((item) => item.module === "Contract Validation" && item.status === "pass"));
  assert.ok(response.approval);
  assert.equal(response.approval.auditLogId, response.auditLog.id);
});

test("Gateway hard-blocks a blocked spender before execution", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, { tokenPermission: { spender: BLOCKED_SPENDER } }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Blocked");
  assert.equal(response.result.triggeredRule, "Blocked spender");
  assert.ok(response.auditLog.moduleFindings.some((item) => item.rule === "Blocked spender" && item.status === "fail"));
  assert.equal(response.approval, null);
});

test("Gateway persists permit fingerprints and blocks replay and protected-parameter mutation", async () => {
  const { store, agent } = await fixture();
  const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const permit = {
    permissionType: "Permit Authorization",
    nonce: "permit-nonce-42",
    permitId: "permit-42",
    deadline,
    network: "casper-test",
  };

  const first = await store.submitAgentGatewayIntent(
    intent(agent.id, { action: { entryPoint: "permit" }, tokenPermission: permit }),
    { apiKey: agent.apiKey },
  );
  assert.equal(first.result.decision, "Allowed");

  const replay = await store.submitAgentGatewayIntent(
    intent(agent.id, { action: { entryPoint: "permit" }, tokenPermission: permit }),
    { apiKey: agent.apiKey },
  );
  assert.equal(replay.result.decision, "Blocked");
  assert.equal(replay.result.tokenPermissionControlsContext.replayStatus, "replay");
  assert.equal(replay.result.triggeredRule, "Permit replay protection");

  const mutation = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      action: { entryPoint: "permit" },
      tokenPermission: { ...permit, approvalAmount: 200, intendedTransactionAmount: 200 },
    }),
    { apiKey: agent.apiKey },
  );
  assert.equal(mutation.result.decision, "Blocked");
  assert.equal(mutation.result.tokenPermissionControlsContext.replayStatus, "parameter_mutation");
  assert.equal(mutation.result.triggeredRule, "Permit parameter binding");
});

test("Gateway rejects raw token-permission signatures and keeps generic calls compatible", async () => {
  const { store, agent } = await fixture();
  await assert.rejects(
    () => store.submitAgentGatewayIntent(
      intent(agent.id, { tokenPermission: { signature: `0x${"a".repeat(130)}` } }),
      { apiKey: agent.apiKey },
    ),
    /signatures|signing material/i,
  );

  const generic = intent(agent.id);
  delete generic.action.tokenPermission;
  const response = await store.submitAgentGatewayIntent(generic, { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.tokenPermissionControlsContext, null);
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Token permission applicability" && item.status === "skipped"));
  assert.equal(response.auditLog.originalIntent.action.tokenPermission, undefined);
});
