import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"c".repeat(64)}`;
const EXECUTION = `01${"a".repeat(64)}`;
const DESTINATION = `01${"b".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Approval Workflow Agent",
    type: "Treasury Agent",
    purpose: "Approval workflow integration",
    permissionLevel: "Full Execution with Review",
    walletAddress: OWNER,
    executionCapabilities: ["Treasury Operations", "Wallet Management"],
  });
  await store.createPolicy({
    name: "Approval Workflow Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 20,
    trustedContracts: [DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Single",
      approvalRequiredCount: 1,
      approvalApproverWallets: [OWNER],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
      approvalRequireRejectComment: true,
    },
  });
  return { store, agent };
}

test("Review Required creates an exact-bound approval and approved quorum permits execution recording", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent({
    source: "approval-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION,
    action: { type: "Transfer", amount: 30, asset: "CSPR", target: DESTINATION, targetType: "Wallet Address" },
  }, { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.approval);
  assert.equal(response.approval.reviewStatus, "Pending");
  assert.equal(response.auditLog.approvalRequestId, response.approval.id);
  assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Policy & Approval Controls"));
  assert.ok(response.auditLog.pipelineStages.some((stage) => stage.id === "human-approval" && stage.status === "pending"));

  const listed = await store.listApprovals(OWNER);
  assert.equal(listed.approvals.length, 1);

  const approvalResponse = await store.respondApproval(response.approval.id, { walletAddress: OWNER, response: "Approve", comment: "Approved exact intent" });
  assert.equal(approvalResponse.approval.reviewStatus, "Approved");
  assert.equal(approvalResponse.auditLog.executionStatus, "review_approved_pending_signature");

  const agentView = await store.getAgentApproval(response.auditLog.id, { agentId: agent.id }, { apiKey: agent.apiKey });
  assert.equal(agentView.approval.mayProceedToSigning, true);

  const execution = await store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "a".repeat(64), signedBy: EXECUTION });
  assert.equal(execution.auditLog.executionStatus, "executed");
});

test("Review Required cannot attach an execution hash before quorum", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent({
    source: "approval-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION,
    action: { type: "Transfer", amount: 30, asset: "CSPR", target: DESTINATION, targetType: "Wallet Address" },
  }, { apiKey: agent.apiKey });
  await assert.rejects(() => store.confirmExecutionDeploy(response.auditLog.id, { deployHash: "b".repeat(64), signedBy: EXECUTION }), /completed approval quorum/i);
});
