import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"c".repeat(64)}`;
const EXECUTION_WALLET = `01${"a".repeat(64)}`;
const APPROVED_DESTINATION = `01${"b".repeat(64)}`;
const UNAPPROVED_DESTINATION = `02${"d".repeat(66)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "WalletGuard Integration Agent",
    type: "Treasury Agent",
    purpose: "Wallet Validation integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Wallet Management", "Treasury Operations"],
  });
  await store.createPolicy({
    name: "Wallet Validation Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 50,
    dailyLimit: 100,
    approvalThreshold: 25,
    trustedContracts: [APPROVED_DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
  });
  return { store, agent };
}

function intent(agentId, target, overrides = {}) {
  return {
    source: "wallet-validation-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target,
      targetType: "Wallet Address",
      ...(overrides.action || {}),
    },
    ...overrides,
  };
}

test("authenticated gateway persists live Wallet Validation findings for Allowed, Review Required, and Blocked", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id, APPROVED_DESTINATION), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(intent(agent.id, UNAPPROVED_DESTINATION), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, "not-a-wallet"), { apiKey: agent.apiKey });

  assert.deepEqual(
    [allowed.result.decision, review.result.decision, blocked.result.decision],
    ["Allowed", "Review Required", "Blocked"],
  );

  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Wallet Validation"));
    assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Wallet Validation"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "wallet-validation"));
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
  }
});

test("missing execution-wallet data becomes an audited Blocked finding instead of silently passing", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, APPROVED_DESTINATION, { executionWalletAddress: "" }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Blocked");
  assert.equal(response.result.triggeredRule, "Execution wallet required");
  assert.ok(response.auditLog.moduleFindings.some((finding) =>
    finding.rule === "Execution wallet required" && finding.status === "fail"));
});
