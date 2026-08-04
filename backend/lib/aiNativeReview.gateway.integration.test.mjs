import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"c".repeat(64)}`;
const EXECUTION = `01${"a".repeat(64)}`;
const TRUSTED_DESTINATION = `01${"b".repeat(64)}`;
const NEW_DESTINATION = `02${"d".repeat(66)}`;

async function fixture(reviewResolutionMode = "Autonomous") {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: `AI-native ${reviewResolutionMode} Agent`,
    type: "Wallet Assistant",
    purpose: "AI-native review routing integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER,
    executionCapabilities: ["Wallet Management"],
  });
  await store.createPolicy({
    name: `${reviewResolutionMode} Review Policy`,
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 50,
    trustedContracts: [TRUSTED_DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      reviewResolutionMode,
      approvalWorkflowEnabled: true,
      approvalWorkflowMode: "Single",
      approvalRequiredCount: 1,
      approvalApproverWallets: [OWNER],
      approvalAllowOwnerFallback: false,
      approvalExpiryMinutes: 60,
    },
  });
  return { store, agent };
}

function transfer(agentId, target = NEW_DESTINATION) {
  return {
    source: "ai-native-review-test",
    agentId,
    executionWalletAddress: EXECUTION,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target,
      targetType: "Wallet Address",
    },
  };
}

test("Autonomous Review Required returns agent remediation without creating a human approval", async () => {
  const { store, agent } = await fixture("Autonomous");
  const response = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.executionApproved, false);
  assert.equal(response.reviewResolution.mode, "agent_remediation");
  assert.equal(response.reviewResolution.humanActionRequired, false);
  assert.equal(response.reviewResolution.canAgentRetry, true);
  assert.equal(response.approval, null);
  assert.match(response.agentMessage, /No human approval is required yet/i);
  assert.match(response.agentMessage, /Nothing was signed or sent/i);
  assert.ok(response.decisionExplanation.primaryReason);
  assert.ok(response.decisionExplanation.triggeredRule);
  assert.ok(response.decisionExplanation.suggestedResolution);
  assert.equal(response.auditLog.approvalStatus, "agent_remediation");
  assert.ok(response.auditLog.pipelineStages.some((stage) => stage.id === "agent-remediation"));

  const approvals = await store.listApprovals(OWNER);
  assert.equal(approvals.approvals.length, 0);
});

test("Human Governed strategy creates an approval for the same review condition", async () => {
  const { store, agent } = await fixture("Human Governed");
  const response = await store.submitAgentGatewayIntent(transfer(agent.id), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Review Required");
  assert.equal(response.reviewResolution.mode, "human_approval");
  assert.equal(response.reviewResolution.humanActionRequired, true);
  assert.ok(response.approval);
  assert.match(response.agentMessage, /Human approval is required/i);
  assert.ok(response.auditLog.pipelineStages.some((stage) => stage.id === "human-approval"));
});

test("Blocked decisions return a reason that an external agent can show directly", async () => {
  const { store, agent } = await fixture("Autonomous");
  const response = await store.submitAgentGatewayIntent(transfer(agent.id, "not-a-wallet"), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Blocked");
  assert.equal(response.executionApproved, false);
  assert.ok(response.decisionExplanation.primaryReason);
  assert.ok(response.decisionExplanation.triggeredRule);
  assert.ok(response.decisionExplanation.suggestedResolution);
  assert.match(response.agentMessage, /Magen3 blocked this action because/i);
  assert.match(response.agentMessage, /Nothing was signed or sent/i);
});
