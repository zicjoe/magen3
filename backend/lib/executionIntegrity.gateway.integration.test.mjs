import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";

const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const APPROVED_DESTINATION = `01${"3".repeat(64)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Execution Integrity Agent",
    type: "Treasury Agent",
    purpose: "Verify intent lifecycle and replay protection",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Wallet Management", "Treasury Operations"],
  });
  await store.createPolicy({
    name: "Strict Lifecycle Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 50,
    dailyLimit: 100,
    approvalThreshold: 25,
    trustedContracts: [APPROVED_DESTINATION],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      lifecycleControlsEnabled: true,
      lifecycleControlMode: "Enforce",
      lifecycleUnavailableAction: "Warn",
      lifecycleRequireIntentId: true,
      lifecycleRequireIdempotencyKey: true,
      lifecycleRequireCreatedAt: true,
      lifecycleRequireExpiry: true,
      lifecycleRequireSequence: false,
      lifecyclePreventDuplicateFingerprint: true,
      lifecyclePreventRetryAfterUncertain: true,
      lifecyclePreventParameterMutation: true,
      lifecycleMaxIntentAgeSeconds: 600,
      lifecycleMaxFutureSkewSeconds: 120,
      lifecycleMaxLifetimeSeconds: 900,
      lifecycleReplayWindowSeconds: 86400,
      lifecycleMaxRetryAttempts: 3,
    },
  });
  return { store, agent };
}

function lifecycleIntent(agentId, overrides = {}) {
  const now = Date.now();
  return {
    source: "execution-integrity-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: APPROVED_DESTINATION,
      targetType: "Wallet Address",
      lifecycle: {
        intentId: "intent.lifecycle.0001",
        idempotencyKey: "idempotency.lifecycle.0001",
        sequence: 1,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 5 * 60_000).toISOString(),
        attempt: 0,
        ...overrides,
      },
    },
  };
}

test("Gateway allows a fresh lifecycle-bound intent, persists the canonical fingerprint, and blocks replay", async () => {
  const { store, agent } = await fixture();
  const body = lifecycleIntent(agent.id);

  const first = await store.submitAgentGatewayIntent(body, { apiKey: agent.apiKey });
  assert.equal(first.result.decision, "Allowed");
  assert.ok(first.result.moduleFindings.some((finding) =>
    finding.module === "Execution Integrity" && finding.rule === "Intent ID replay prevention" && finding.status === "pass"));
  assert.ok(first.result.pipelineStages.some((stage) => stage.id === "execution-integrity" && ["completed", "warning"].includes(stage.status)));
  assert.match(first.result.executionIntegrityContext.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(
    first.auditLog.originalIntent.lifecycle.intentFingerprint,
    first.result.executionIntegrityContext.fingerprint,
  );

  const replay = await store.submitAgentGatewayIntent(body, { apiKey: agent.apiKey });
  assert.equal(replay.result.decision, "Blocked");
  assert.ok(replay.result.moduleFindings.some((finding) =>
    finding.module === "Execution Integrity" && finding.rule === "Intent ID replay prevention" && finding.status === "fail"));
  assert.ok(replay.auditLog.moduleFindings.some((finding) => finding.module === "Execution Integrity"));
});

test("Gateway blocks idempotency-key reuse after protected parameters change", async () => {
  const { store, agent } = await fixture();
  const firstBody = lifecycleIntent(agent.id);
  const first = await store.submitAgentGatewayIntent(firstBody, { apiKey: agent.apiKey });
  assert.equal(first.result.decision, "Allowed");

  const changed = lifecycleIntent(agent.id, {
    intentId: "intent.lifecycle.0002",
    idempotencyKey: "idempotency.lifecycle.0001",
  });
  changed.action.amount = 7;

  const response = await store.submitAgentGatewayIntent(changed, { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((finding) =>
    finding.rule === "Idempotency parameter mutation" && finding.status === "fail"));
});
