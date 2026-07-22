import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const APPROVED_CONTRACT = `contract-${"3".repeat(64)}`;
const UNAPPROVED_CONTRACT = `contract-package-${"4".repeat(64)}`;
const BLOCKED_CONTRACT = `contract-${"5".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "ContractGuard Integration Agent",
    type: "DeFi Agent",
    purpose: "Contract Validation integration test",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Trading", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "Contract Validation Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [APPROVED_CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      blockedContracts: [BLOCKED_CONTRACT],
      allowedEntryPoints: ["call", "swap"],
    },
  });
  return { store, agent };
}

function intent(agentId, target, overrides = {}) {
  const { action: actionOverrides = {}, ...requestOverrides } = overrides;
  return {
    source: "contract-validation-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target,
      targetType: "Trusted Contract",
      contractIdentifierType: target.startsWith("contract-package-") ? "Package Hash" : "Contract Hash",
      entryPoint: "call",
      chainName: "casper-test",
      ...actionOverrides,
    },
    ...requestOverrides,
  };
}

test("authenticated gateway persists live Contract Validation findings for Allowed, Review Required, and Blocked", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id, APPROVED_CONTRACT), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(intent(agent.id, UNAPPROVED_CONTRACT, { action: { targetType: "Unknown Contract" } }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, BLOCKED_CONTRACT), { apiKey: agent.apiKey });

  assert.deepEqual(
    [allowed.result.decision, review.result.decision, blocked.result.decision],
    ["Allowed", "Review Required", "Blocked"],
  );

  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Contract Validation"));
    assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Contract Validation"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "contract-validation"));
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
    assert.equal(response.auditLog.originalIntent.action.entryPoint, "call");
    assert.equal(response.auditLog.originalIntent.action.chainName, "casper-test");
  }
});

test("missing contract-call metadata becomes an audited Blocked decision", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(
    intent(agent.id, APPROVED_CONTRACT, { action: { entryPoint: "" } }),
    { apiKey: agent.apiKey },
  );

  assert.equal(response.result.decision, "Blocked");
  assert.equal(response.result.triggeredRule, "Valid contract entry point");
  assert.ok(response.auditLog.moduleFindings.some((finding) =>
    finding.rule === "Valid contract entry point" && finding.status === "fail"));
});

test("normalizes Contract Call as Contract Interaction without changing the public request shape", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent({
    source: "contract-call-alias-test",
    agentId: agent.id,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Contract Call",
      target: APPROVED_CONTRACT,
      targetType: "Trusted Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint: "call",
      chainName: "casper-test",
    },
  }, { apiKey: agent.apiKey });

  assert.equal(response.gatewayRequest.actionType, "Contract Interaction");
  assert.equal(response.result.decision, "Allowed");
});
