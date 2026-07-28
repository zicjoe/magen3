import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"7".repeat(64)}`;
const TARGET = `01${"8".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Permanent Delete Agent",
    type: "Wallet Assistant",
    purpose: "Agent deletion integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER,
    executionCapabilities: ["Wallet Management"],
  });
  const policy = await store.createPolicy({
    name: "Permanent Delete Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET],
    blockedActions: [],
    riskMode: "Balanced",
  });
  return { store, agent, policy: policy.policy };
}

test("permanent deletion requires exact name and prior revocation", async () => {
  const { store, agent } = await fixture();
  await assert.rejects(
    store.deleteAgent(agent.id, { walletAddress: OWNER, confirmation: agent.name }),
    /Revoke this agent before permanently deleting it/,
  );

  await store.revokeAgent(agent.id, { walletAddress: OWNER });
  await assert.rejects(
    store.deleteAgent(agent.id, { walletAddress: OWNER, confirmation: "wrong name" }),
    /Type the exact agent name/,
  );
});

test("permanent deletion removes registration and policies while preserving historical audit evidence", async () => {
  const { store, agent, policy } = await fixture();
  const blocked = await store.submitAgentGatewayIntent({
    source: "agent-delete-test",
    agentId: agent.id,
    executionWalletAddress: OWNER,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: "invalid-wallet",
      targetType: "Wallet Address",
    },
  }, { apiKey: agent.apiKey });
  assert.equal(blocked.result.decision, "Blocked");

  await store.revokeAgent(agent.id, { walletAddress: OWNER });
  const deleted = await store.deleteAgent(agent.id, { walletAddress: OWNER, confirmation: agent.name });
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.deletedPolicyIds, [policy.id]);
  assert.ok(deleted.preservedEvidence.auditLogs >= 1);
  assert.equal(deleted.preservedEvidence.gatewayRequests, 1);

  const snapshot = await store.bootstrap(OWNER);
  assert.equal(snapshot.agents.some((item) => item.id === agent.id), false);
  assert.equal(snapshot.policies.some((item) => item.agentId === agent.id), false);
  assert.equal(snapshot.auditLogs.some((item) => item.agentId === agent.id), true);

  await assert.rejects(
    store.getAgentGatewayIdentity(agent.id, { apiKey: agent.apiKey }),
    /not found/,
  );
});
