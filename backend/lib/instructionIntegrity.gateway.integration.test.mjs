import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");
const { normalizeAgentGatewayIntent } = await import("./agentGateway.mjs");
const { buildInstructionParameterFingerprint } = await import("./instructionIntegrity.mjs");

const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const TARGET = `01${"3".repeat(64)}`;
const GOAL_HASH = "a".repeat(64);

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Instruction Integrity Agent", type: "Treasury Agent", purpose: "Provenance integration", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Treasury Operations", "Wallet Management"] });
  await store.createPolicy({
    name: "Instruction Integrity Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      instructionIntegrityEnabled: true,
      instructionIntegrityMode: "Review",
      requireGoalBindingForActions: ["Transfer", "x402 Payment", "DAO Treasury Payment"],
      requireUserConfirmationForExternalContent: true,
      allowedSourceDomains: ["trusted.example"],
      blockedSourceDomains: ["evil.example"],
      externalContentHighRiskAction: "Review",
      allowParameterChangesAfterGoal: false,
      requireParameterChangeReason: true,
    },
  });
  return { store, agent };
}

function body(agentId, instructionIntegrity = {}, overrides = {}) {
  return {
    source: "instruction-integrity-integration",
    agentId,
    executionWalletAddress: EXECUTION,
    action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test", instructionIntegrity },
    ...overrides,
  };
}

function boundBody(agentId, metadata = {}, overrides = {}) {
  const draft = body(agentId, {
    goalId: "goal-http-001",
    originalUserGoalHash: GOAL_HASH,
    initiatedBy: "user",
    intentSource: "user",
    sourceDomains: [],
    externalContentUsed: false,
    userConfirmed: true,
    sourceTrustLevel: "trusted",
    originalPermissionScopes: ["transfer"],
    currentPermissionScopes: ["transfer"],
    ...metadata,
  }, overrides);
  const normalized = normalizeAgentGatewayIntent(draft);
  const fingerprint = buildInstructionParameterFingerprint(normalized);
  draft.action.instructionIntegrity.originalParameterHash = metadata.originalParameterHash || fingerprint;
  draft.action.instructionIntegrity.currentParameterHash = metadata.currentParameterHash || fingerprint;
  return draft;
}

test("Gateway persists Allowed, Review Required, and Blocked instruction provenance", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(boundBody(agent.id), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(boundBody(agent.id, { externalContentUsed: true, intentSource: "webpage", sourceDomains: ["trusted.example"], sourceTrustLevel: "untrusted", userConfirmed: false }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(boundBody(agent.id, { sourceDomains: ["evil.example"], externalContentUsed: true, intentSource: "webpage", sourceTrustLevel: "untrusted" }), { apiKey: agent.apiKey });

  assert.deepEqual([allowed.result.decision, review.result.decision, blocked.result.decision], ["Allowed", "Review Required", "Blocked"]);
  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((item) => item.module === "Agent Instruction Integrity"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "agent-instruction-integrity"));
    assert.match(response.result.instructionIntegrityContext.currentParameterHash, /^[0-9a-f]{64}$/);
    assert.equal(response.auditLog.originalIntent.instructionIntegrity.goalId, "goal-http-001");
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
  }
});

test("legacy requests without provenance remain compatible when the control is absent", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy", type: "Treasury Agent", purpose: "compat", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({ name: "Legacy Policy", agentId: agent.id, walletAddress: OWNER, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {} });
  const response = await store.submitAgentGatewayIntent(body(agent.id), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Agent Instruction Integrity" && item.status === "skipped"));
});
