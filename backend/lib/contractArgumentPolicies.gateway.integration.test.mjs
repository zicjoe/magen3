import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const CONTRACT = `contract-${"3".repeat(64)}`;
const ALLOWED_RECIPIENT = `01${"4".repeat(64)}`;
const BLOCKED_RECIPIENT = `account-hash-${"5".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Argument Policy Agent",
    type: "DeFi Agent",
    purpose: "Contract argument integration",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER,
    executionCapabilities: ["dApp Interactions"],
  });
  await store.createPolicy({
    name: "Argument Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      allowedEntryPoints: ["transfer"],
      contractArgumentControlsEnabled: true,
      contractArgumentMode: "Review",
      contractArgumentUnknownRuleAction: "Review",
      contractArgumentUnknownArgumentAction: "Block",
      contractArgumentRules: [{
        id: "transfer-bounds",
        contract: CONTRACT,
        entryPoint: "transfer",
        requiredArgs: ["recipient", "amount", "mode"],
        allowedArgs: ["recipient", "amount", "mode"],
        argumentTypes: { recipient: "address", amount: "integer", mode: "string" },
        numericLimits: { amount: { min: 1, max: 100 } },
        addressRules: { recipient: { allowed: [ALLOWED_RECIPIENT], blocked: [BLOCKED_RECIPIENT] } },
        enumRules: { mode: ["safe"] },
      }],
    },
  });
  return { store, agent };
}

function intent(agentId, runtimeArgs, entryPoint = "transfer") {
  return {
    source: "contract-argument-integration",
    agentId,
    executionWalletAddress: EXECUTION,
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: CONTRACT,
      targetType: "Trusted Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint,
      chainName: "casper-test",
      preflight: { runtimeArgs },
    },
  };
}

test("Gateway persists Allowed, Review Required, and Blocked contract-argument evidence", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT, amount: { cl_type: "U512", parsed: "10" }, mode: "safe" }), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT, amount: "101", mode: "safe" }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: BLOCKED_RECIPIENT, amount: "10", mode: "safe" }), { apiKey: agent.apiKey });

  assert.deepEqual([allowed.result.decision, review.result.decision, blocked.result.decision], ["Allowed", "Review Required", "Blocked"]);
  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((item) => item.module === "Contract Argument Policies"));
    assert.ok(response.auditLog.moduleFindings.some((item) => item.module === "Contract Argument Policies"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "contract-argument-policies"));
    assert.equal(response.gatewayRequest.auditLogId, response.auditLog.id);
    assert.equal(response.auditLog.originalIntent.action.preflight.runtimeArgs.mode, "safe");
    assert.match(response.result.contractArgumentPoliciesContext.parameterFingerprint, /^[0-9a-f]{64}$/);
  }
});

test("unknown entry-point policy and changed arguments remain exact-bound", async () => {
  const { store, agent } = await fixture();
  const unknown = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT }, "withdraw"), { apiKey: agent.apiKey });
  assert.equal(unknown.result.decision, "Blocked"); // Contract Validation blocks the unapproved entry point before argument review.

  const first = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT, amount: "101", mode: "safe" }), { apiKey: agent.apiKey });
  const changed = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT, amount: "102", mode: "safe" }), { apiKey: agent.apiKey });
  assert.equal(first.result.decision, "Review Required");
  assert.equal(changed.result.decision, "Review Required");
  assert.notEqual(first.result.contractArgumentPoliciesContext.parameterFingerprint, changed.result.contractArgumentPoliciesContext.parameterFingerprint);
  assert.notDeepEqual(first.auditLog.originalIntent.action.preflight.runtimeArgs, changed.auditLog.originalIntent.action.preflight.runtimeArgs);
});

test("legacy policies without Contract Argument Policies remain compatible", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy Agent", type: "DeFi Agent", purpose: "compat", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["dApp Interactions"] });
  await store.createPolicy({ name: "Legacy", agentId: agent.id, walletAddress: OWNER, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [CONTRACT], blockedActions: [], riskMode: "Balanced", structuredRules: { allowedEntryPoints: ["transfer"] } });
  const response = await store.submitAgentGatewayIntent(intent(agent.id, { recipient: ALLOWED_RECIPIENT, amount: "10", mode: "safe" }), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Contract Argument Policies" && item.status === "skipped"));
});
