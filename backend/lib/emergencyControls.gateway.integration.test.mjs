import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore } from "../store/memoryStore.mjs";

const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const REVIEWER_ONE = `01${"3".repeat(64)}`;
const REVIEWER_TWO = `01${"4".repeat(64)}`;
const DESTINATION = `01${"5".repeat(64)}`;

async function fixture(structuredRules = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Emergency Control Agent",
    walletAddress: OWNER,
    executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  });
  const created = await store.createPolicy({
    name: "Emergency Control Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 1000,
    dailyLimit: 10000,
    approvalThreshold: 900,
    trustedContracts: [DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: 2,
      approvalApproverWallets: [REVIEWER_ONE, REVIEWER_TWO],
      approvalAllowOwnerFallback: false,
      emergencyControlsEnabled: true,
      automaticPauseEnabled: false,
      emergencyAutomaticPauseAction: "Blocked",
      emergencyPauseDurationSeconds: 3600,
      emergencyResumeRequiresApproval: false,
      emergencyResumeQuorum: 2,
      ...structuredRules,
    },
  });
  return { store, agent, policy: created.policy };
}

function transfer(agentId, amount = 10) {
  return {
    source: "emergency-control-integration-test",
    agentId,
    executionWalletAddress: EXECUTION,
    action: {
      type: "Transfer",
      amount,
      asset: "CSPR",
      target: DESTINATION,
      targetType: "Wallet Address",
      chainName: "casper-test",
    },
  };
}

test("manual agent pause blocks Gateway requests and authorized resume restores execution", async () => {
  const { store, agent } = await fixture();
  const before = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(before.result.decision, "Allowed");

  const created = await store.createEmergencyPause({
    walletAddress: OWNER,
    agentId: agent.id,
    scopeType: "Agent",
    scopeValue: agent.id,
    reason: "Investigating unexpected agent execution behavior.",
    enforcementAction: "Blocked",
    durationSeconds: 3600,
  });
  assert.equal(created.emergencyPause.active, true);
  assert.equal(created.auditLog.action, "Emergency Pause Activated");

  const blocked = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(blocked.result.decision, "Blocked");
  assert.equal(blocked.result.triggeredRule, "Active emergency pause");
  assert.equal(blocked.executionApproved, false);
  assert.ok(blocked.result.pipelineStages.some((stage) => stage.id === "emergency-circuit-breaker" && stage.status === "failed"));

  const resumed = await store.resumeEmergencyPause(created.emergencyPause.id, {
    walletAddress: OWNER,
    reason: "Incident resolved after credential and policy review.",
  });
  assert.equal(resumed.emergencyPause.status, "Resumed");
  assert.equal(resumed.auditLog.action, "Emergency Pause Resumed");

  const after = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(after.result.decision, "Allowed");
});

test("review-mode pause creates a normal exact-bound approval without allowing automatic execution", async () => {
  const { store, agent } = await fixture();
  await store.createEmergencyPause({
    walletAddress: OWNER,
    agentId: agent.id,
    scopeType: "Action",
    scopeValue: "Transfer",
    reason: "Require manual review for outgoing transfers during incident response.",
    enforcementAction: "Review Required",
    durationSeconds: 3600,
  });
  const response = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.approval);
  assert.equal(response.executionApproved, false);
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Emergency Circuit Breaker" && item.status === "warning"));
});

test("resume approval quorum keeps pause active until approved then resumes automatically", async () => {
  const { store, agent } = await fixture();
  const created = await store.createEmergencyPause({
    walletAddress: OWNER,
    agentId: agent.id,
    scopeType: "Agent",
    scopeValue: agent.id,
    reason: "High-risk incident requires controlled multi-reviewer recovery.",
    enforcementAction: "Blocked",
    durationSeconds: 3600,
    resumeRequiresApproval: true,
    resumeQuorum: 2,
    resumeAuthorityWallets: [REVIEWER_ONE, REVIEWER_TWO],
  });

  const requested = await store.resumeEmergencyPause(created.emergencyPause.id, {
    walletAddress: OWNER,
    reason: "Recovery checks completed and services are stable.",
  });
  assert.equal(requested.approval.reviewStatus, "Pending");
  assert.equal(requested.approval.requiredApprovals, 2);
  assert.equal(requested.emergencyPause.active, true);

  const one = await store.respondApproval(requested.approval.id, { walletAddress: REVIEWER_ONE, response: "Approve" });
  assert.equal(one.approval.reviewStatus, "Pending");
  const stillBlocked = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(stillBlocked.result.decision, "Blocked");

  const two = await store.respondApproval(requested.approval.id, { walletAddress: REVIEWER_TWO, response: "Approve" });
  assert.equal(two.approval.reviewStatus, "Approved");
  assert.equal(two.emergencyPause.status, "Resumed");
  assert.equal(two.resumeAuditLog.action, "Emergency Pause Resumed");

  const allowed = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(allowed.result.decision, "Allowed");
});

test("automatic repeated-block trigger creates a persistent pause and future requests fail early", async () => {
  const { store, agent } = await fixture({
    automaticPauseEnabled: true,
    emergencyRepeatedBlockThreshold: 2,
    emergencyReplayAttemptThreshold: 99,
    emergencyRequestFrequencyThreshold: 999,
  });
  const malformed = transfer(agent.id);
  malformed.action.target = "not-a-wallet";

  const first = await store.submitAgentGatewayIntent(malformed, { apiKey: agent.apiKey });
  assert.equal(first.result.decision, "Blocked");
  assert.equal(first.emergencyPause, null);

  const second = await store.submitAgentGatewayIntent(malformed, { apiKey: agent.apiKey });
  assert.equal(second.result.decision, "Blocked");
  assert.ok(second.emergencyPause);
  assert.equal(second.emergencyPause.triggerType, "Automatic");
  assert.equal(second.result.triggeredRule, "Repeated blocked attempts");

  const future = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(future.result.decision, "Blocked");
  assert.equal(future.result.triggeredRule, "Active emergency pause");
});

test("execution confirmation is refused when a pause activates after authorization", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });
  assert.equal(allowed.result.decision, "Allowed");
  await store.createEmergencyPause({
    walletAddress: OWNER,
    agentId: agent.id,
    scopeType: "All Execution",
    scopeValue: "All Execution",
    reason: "Stop all outgoing execution while incident response is active.",
    enforcementAction: "Blocked",
    durationSeconds: 3600,
  });
  await assert.rejects(
    () => store.confirmExecutionDeploy(allowed.auditLog.id, { deployHash: "a".repeat(64), signedBy: EXECUTION }),
    /Emergency Circuit Breaker pause/i,
  );
});
