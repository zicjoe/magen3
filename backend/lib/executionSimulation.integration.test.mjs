import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const APPROVED_DESTINATION = `01${"3".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Execution Preflight Integration Agent",
    type: "Trading Agent",
    purpose: "Execution Simulation foundation integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Trading", "Wallet Management"],
  });
  await store.createPolicy({
    name: "Execution Preflight Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 90,
    trustedContracts: [APPROVED_DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
  });
  return { store, agent };
}

function intent(agentId, preflightOverrides = {}) {
  return {
    source: "execution-preflight-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: APPROVED_DESTINATION,
      targetType: "Wallet Address",
      preflight: {
        paymentAmountMotes: "3000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: new Date().toISOString(),
        ...preflightOverrides,
      },
    },
  };
}

test("authenticated gateway persists deterministic Execution Simulation preflight and its honest unavailable boundary", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Payment budget format" &&
    finding.status === "pass"));
  assert.ok(response.result.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Stateful speculative execution" &&
    finding.status === "unavailable"));
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "execution-simulation"));
  assert.equal(response.auditLog.originalIntent.action.preflight.paymentAmountMotes, "3000000000");
  assert.equal(response.auditLog.originalIntent.action.preflight.ttl, "30m");
  assert.equal(response.auditLog.originalIntent.action.preflight.gasPriceTolerance, 1);
  assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Execution Simulation"));
});

test("expired construction metadata is deterministically blocked and audited", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(intent(agent.id, {
    timestamp: "2020-01-01T00:00:00.000Z",
    ttl: "30m",
  }), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Blocked");
  assert.equal(response.result.triggeredRule, "Transaction freshness");
  assert.ok(response.auditLog.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Transaction freshness" &&
    finding.status === "fail"));
});

test("unusually long TTL requires review without pretending that stateful simulation ran", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(intent(agent.id, { ttl: "3h" }), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.result.moduleFindings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.rule === "Transaction TTL format" &&
    finding.status === "warning"));
  assert.ok(response.result.moduleFindings.some((finding) =>
    finding.rule === "Stateful speculative execution" &&
    finding.status === "unavailable"));
});
