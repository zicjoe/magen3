import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const REVIEWER_1 = `01${"3".repeat(64)}`;
const REVIEWER_2 = `01${"4".repeat(64)}`;
const CONTRACT = `contract-${"5".repeat(64)}`;
const CURRENT = `contract-${"6".repeat(64)}`;
const NEXT = `contract-${"7".repeat(64)}`;
const BLOCKED = `contract-${"8".repeat(64)}`;

async function setup(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Upgrade Safety Agent",
    type: "Treasury Agent",
    purpose: "Test contract upgrades",
    permissionLevel: "Full Execution with Review",
    walletAddress: OWNER,
    executionCapabilities: ["Treasury Operations", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "Upgrade Safety Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 1000,
    dailyLimit: 5000,
    approvalThreshold: 900,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["upgrade_to"],
      privilegedActionControlsEnabled: true,
      privilegedActionMode: "Review",
      privilegedActionsRequiringReview: ["Proxy Upgrade"],
      approvedImplementations: [NEXT],
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 1,
      approvalApproverWallets: [REVIEWER_1, REVIEWER_2],
      approvalAllowOwnerFallback: false,
      approvalSeparationOfDuties: false,
      contractUpgradeControlsEnabled: true,
      contractUpgradeMode: "Review",
      contractUpgradeApprovedImplementations: [NEXT],
      contractUpgradeBlockedImplementations: [BLOCKED],
      contractUpgradeRequiresApproval: true,
      contractUpgradeQuorum: 2,
      contractUpgradeRequireCodeHash: true,
      contractUpgradeApprovedAdministrators: [OWNER],
      contractUpgradeUnknownImplementationAction: "Review",
      ...overrides,
    },
  });
  return { store, agent };
}

function intent(agentId, requestedImplementation = NEXT, contractUpgradeOverrides = {}) {
  return {
    source: "contract-upgrade-test",
    agentId,
    executionWalletAddress: EXECUTION,
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: CONTRACT,
      targetType: "Trusted Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint: "upgrade_to",
      chainName: "casper-test",
      privilegedAction: {
        classifiedAction: "Proxy Upgrade",
        contract: CONTRACT,
        entryPoint: "upgrade_to",
        currentValue: CURRENT,
        requestedValue: requestedImplementation,
        implementation: requestedImplementation,
        recipient: OWNER,
        classifierSource: "test-adapter",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
      contractUpgrade: {
        contract: CONTRACT,
        currentImplementation: CURRENT,
        requestedImplementation,
        requestedCodeHash: "a".repeat(64),
        upgradeAdministrator: OWNER,
        network: "casper-test",
        ...contractUpgradeOverrides,
      },
    },
  };
}

test("Gateway creates exact-bound two-reviewer approval for an approved upgrade", async () => {
  const { store, agent } = await setup();
  const response = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.result.contractUpgradeSafetyContext.requiredApprovalCount, 2);
  assert.match(response.result.contractUpgradeSafetyContext.parameterFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(response.approval.requiredApprovals, 2);
  assert.equal(response.auditLog.originalIntent.action.contractUpgrade.requestedImplementation, NEXT);
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "contract-upgrade-safety"));
});

test("Gateway blocks an explicitly blocked implementation", async () => {
  const { store, agent } = await setup();
  const response = await store.submitAgentGatewayIntent(intent(agent.id, BLOCKED), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Contract Upgrade Safety" && finding.rule === "Blocked implementation"));
});


test("contract-upgrade delay remains enforced after quorum approval", async () => {
  const { store, agent } = await setup({ contractUpgradeDelaySeconds: 1800 });
  const requestedAt = new Date(Date.now() - 60_000).toISOString();
  const response = await store.submitAgentGatewayIntent(intent(agent.id, NEXT, { requestedAt }), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.auditLog.originalIntent.action.contractUpgrade.effectiveExecuteAfter);
  const first = await store.respondApproval(response.approval.id, { walletAddress: REVIEWER_1, response: "Approve" });
  assert.equal(first.approval.reviewStatus, "Pending");
  const second = await store.respondApproval(response.approval.id, { walletAddress: REVIEWER_2, response: "Approve" });
  assert.equal(second.approval.reviewStatus, "Approved");
  assert.equal(second.approval.executionWindowStatus, "delay");
  assert.equal(second.approval.mayProceedToSigning, false);
});
