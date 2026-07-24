import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const ADMIN_ONE = `01${"3".repeat(64)}`;
const ADMIN_TWO = `01${"4".repeat(64)}`;
const ADMIN_THREE = `01${"5".repeat(64)}`;
const UNKNOWN_ADMIN = `01${"6".repeat(64)}`;
const CONTRACT = `contract-${"7".repeat(64)}`;
const IMPLEMENTATION = `contract-${"8".repeat(64)}`;
const UNKNOWN_IMPLEMENTATION = `contract-${"9".repeat(64)}`;

async function fixture(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Privileged Action Integration Agent",
    type: "Treasury Agent",
    purpose: "Privileged contract action integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Treasury Operations", "dApp Interactions", "Enterprise Automation"],
  });
  await store.createPolicy({
    name: "Privileged Action Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 10000,
    dailyLimit: 50000,
    approvalThreshold: 9000,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["mint", "transfer_ownership", "upgrade_to", "pause", "emergency_withdraw", "deposit"],
      privilegedActionControlsEnabled: true,
      privilegedActionMode: "Review",
      privilegedActionsRequiringReview: ["Ownership Transfer", "Proxy Upgrade", "Pause"],
      privilegedActionsBlocked: ["Emergency Withdrawal"],
      approvedAdministrators: [ADMIN_ONE, ADMIN_TWO, ADMIN_THREE],
      approvedImplementations: [IMPLEMENTATION],
      privilegedActionQuorumRules: { "Ownership Transfer": 2, "Proxy Upgrade": 2 },
      unknownPrivilegedAction: "Review",
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 1,
      approvalApproverWallets: [ADMIN_ONE, ADMIN_TWO, ADMIN_THREE],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
      approvalSeparationOfDuties: false,
      ...overrides,
    },
  });
  return { store, agent };
}

function intent(agentId, { entryPoint = "mint", privilegedAction, amount = 100 } = {}) {
  const action = {
    type: "Contract Interaction",
    amount,
    asset: "TEST",
    target: CONTRACT,
    targetType: "Trusted Contract",
    contractIdentifierType: "Contract Hash",
    entryPoint,
    chainName: "casper-test",
  };
  if (privilegedAction !== undefined) action.privilegedAction = privilegedAction;
  return {
    source: "privileged-action-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action,
  };
}

function mintMetadata(overrides = {}) {
  return {
    classifiedAction: "Mint",
    contract: CONTRACT,
    entryPoint: "mint",
    methodSignature: "mint(address,uint256)",
    requestedValue: 100,
    recipient: ADMIN_ONE,
    classifierSource: "integration-adapter",
    classifierVersion: "1.0.0",
    network: "casper-test",
    ...overrides,
  };
}

test("Gateway allows an approved supported mint and persists privileged evidence", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, { privilegedAction: mintMetadata() }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.privilegedActionControlsContext.classifiedAction, "Mint");
  assert.match(response.result.privilegedActionControlsContext.parameterFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Privileged Action Controls" && item.status === "pass"));
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "privileged-action-controls" && stage.status === "completed"));
  assert.equal(response.auditLog.originalIntent.action.privilegedAction.classifiedAction, "Mint");
  assert.equal(response.auditLog.originalIntent.action.privilegedAction.requestedValue, 100);
  assert.equal(response.auditLog.originalIntent.action.privilegedAction.approvalRequired, false);
});

test("ownership transfer creates a two-reviewer exact-bound approval and gates execution", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      entryPoint: "transfer_ownership",
      privilegedAction: {
        classifiedAction: "Ownership Transfer",
        contract: CONTRACT,
        entryPoint: "transfer_ownership",
        methodSignature: "transferOwnership(address)",
        currentValue: ADMIN_ONE,
        requestedValue: ADMIN_TWO,
        recipient: ADMIN_TWO,
        classifierSource: "integration-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.approval);
  assert.equal(response.approval.requiredApprovals, 2);
  assert.equal(response.approval.reviewContext.privilegedAction.classifiedAction, "Ownership Transfer");
  assert.match(response.approval.reviewContext.privilegedAction.parameterFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(response.auditLog.originalIntent.action.privilegedAction.requiredApprovalCount, 2);

  await assert.rejects(
    () => store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "a".repeat(64) }),
    /completed approval quorum/i,
  );

  const first = await store.respondApproval(response.approval.id, { walletAddress: ADMIN_ONE, response: "Approve" });
  assert.equal(first.approval.reviewStatus, "Pending");
  const second = await store.respondApproval(response.approval.id, { walletAddress: ADMIN_TWO, response: "Approve" });
  assert.equal(second.approval.reviewStatus, "Approved");

  const execution = await store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "b".repeat(64), signedBy: EXECUTION_WALLET });
  assert.equal(execution.confirmed, true);
  assert.equal(execution.auditLog.executionStatus, "executed");
});

test("Gateway reviews unapproved administrators and implementations without weakening contract validation", async () => {
  const { store, agent } = await fixture({ privilegedActionsRequiringReview: [] });
  const admin = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      entryPoint: "transfer_ownership",
      privilegedAction: {
        classifiedAction: "Ownership Transfer",
        contract: CONTRACT,
        entryPoint: "transfer_ownership",
        currentValue: ADMIN_ONE,
        requestedValue: UNKNOWN_ADMIN,
        recipient: UNKNOWN_ADMIN,
        classifierSource: "integration-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    }),
    { apiKey: agent.apiKey },
  );
  assert.equal(admin.result.decision, "Review Required");
  assert.ok(admin.result.moduleFindings.some((item) => item.rule === "Approved administrative recipient" && item.status === "warning"));
  assert.ok(admin.result.moduleFindings.some((item) => item.module === "Contract Validation" && item.status === "pass"));

  const upgrade = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      entryPoint: "upgrade_to",
      privilegedAction: {
        classifiedAction: "Proxy Upgrade",
        contract: CONTRACT,
        entryPoint: "upgrade_to",
        currentValue: IMPLEMENTATION,
        requestedValue: UNKNOWN_IMPLEMENTATION,
        implementation: UNKNOWN_IMPLEMENTATION,
        classifierSource: "integration-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    }),
    { apiKey: agent.apiKey },
  );
  assert.equal(upgrade.result.decision, "Review Required");
  assert.ok(upgrade.result.moduleFindings.some((item) => item.rule === "Approved implementation" && item.status === "warning"));
});

test("Gateway hard-blocks blocked, contradictory, and malformed privileged actions", async () => {
  const { store, agent } = await fixture();
  const blocked = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      entryPoint: "emergency_withdraw",
      privilegedAction: {
        classifiedAction: "Emergency Withdrawal",
        contract: CONTRACT,
        entryPoint: "emergency_withdraw",
        requestedValue: 100,
        recipient: ADMIN_ONE,
        classifierSource: "integration-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    }),
    { apiKey: agent.apiKey },
  );
  assert.equal(blocked.result.decision, "Blocked");
  assert.equal(blocked.result.triggeredRule, "Blocked privileged action");

  const contradictory = await store.submitAgentGatewayIntent(
    intent(agent.id, { entryPoint: "pause", privilegedAction: mintMetadata({ entryPoint: "pause", methodSignature: "pause()" }) }),
    { apiKey: agent.apiKey },
  );
  assert.equal(contradictory.result.decision, "Blocked");
  assert.equal(contradictory.result.triggeredRule, "Consistent privileged-action classification");

  const malformed = await store.submitAgentGatewayIntent(
    intent(agent.id, { privilegedAction: mintMetadata({ requestedValue: 0, recipient: "not-an-address" }) }),
    { apiKey: agent.apiKey },
  );
  assert.equal(malformed.result.decision, "Blocked");
  assert.ok(malformed.result.moduleFindings.some((item) => item.rule === "Valid privileged amount" && item.status === "fail"));
});

test("supported entry points auto-classify while unrelated generic calls remain compatible", async () => {
  const { store, agent } = await fixture();
  const pause = await store.submitAgentGatewayIntent(
    intent(agent.id, { entryPoint: "pause", privilegedAction: undefined }),
    { apiKey: agent.apiKey },
  );
  assert.equal(pause.result.decision, "Review Required");
  assert.equal(pause.result.privilegedActionControlsContext.classifiedAction, "Pause");
  assert.equal(pause.auditLog.originalIntent.action.privilegedAction.classifiedAction, "Pause");

  const generic = await store.submitAgentGatewayIntent(
    intent(agent.id, { entryPoint: "deposit", privilegedAction: undefined }),
    { apiKey: agent.apiKey },
  );
  assert.equal(generic.result.decision, "Allowed");
  assert.equal(generic.result.privilegedActionControlsContext, null);
  assert.equal(generic.auditLog.originalIntent.action.privilegedAction, undefined);
  assert.ok(generic.result.moduleFindings.some((item) => item.rule === "Privileged action applicability" && item.status === "skipped"));
});

test("Gateway rejects raw administrative signatures", async () => {
  const { store, agent } = await fixture();
  await assert.rejects(
    () => store.submitAgentGatewayIntent(
      intent(agent.id, { privilegedAction: mintMetadata({ signature: `0x${"a".repeat(130)}` }) }),
      { apiKey: agent.apiKey },
    ),
    /signatures|signing material/i,
  );
});

test("insufficient approvers produces Configuration Required instead of weakening quorum", async () => {
  const { store, agent } = await fixture({
    approvalApproverWallets: [ADMIN_ONE],
    privilegedActionQuorumRules: { "Ownership Transfer": 3 },
  });
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, {
      entryPoint: "transfer_ownership",
      privilegedAction: {
        classifiedAction: "Ownership Transfer",
        contract: CONTRACT,
        entryPoint: "transfer_ownership",
        currentValue: ADMIN_ONE,
        requestedValue: ADMIN_TWO,
        recipient: ADMIN_TWO,
        classifierSource: "integration-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    }),
    { apiKey: agent.apiKey },
  );
  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.approval.reviewStatus, "Configuration Required");
  assert.equal(response.approval.requiredApprovals, 3);
  assert.equal(response.approval.mayProceedToSigning, false);
});
