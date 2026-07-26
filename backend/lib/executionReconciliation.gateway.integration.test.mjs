import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";

const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"1".repeat(64)}`;
const TARGET = `01${"2".repeat(64)}`;
const TX = `0x${"a".repeat(64)}`;
const REPLACEMENT_TX = `0x${"b".repeat(64)}`;

async function fixture(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Reconciliation Agent",
    type: "Wallet Assistant",
    purpose: "Execution reconciliation integration",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER,
    executionCapabilities: ["Wallet Management"],
  });
  await store.createPolicy({
    name: "Reconciliation Policy",
    agentId: agent.id,
    walletAddress: OWNER,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      reconciliationEnabled: true,
      maximumSubmissionAttempts: 3,
      pendingRetryAction: "Block",
      uncertainRetryAction: "Block",
      requiredConfirmations: 2,
      finalityTimeoutSeconds: 3600,
      replacementAllowed: true,
      resourceDeliveryRequired: false,
      ...overrides,
    },
  });
  return { store, agent };
}

function intent(agentId, amount = 5, lifecycle = undefined) {
  return {
    source: "execution-reconciliation-test",
    agentId,
    executionWalletAddress: OWNER,
    action: {
      type: "Transfer",
      amount,
      asset: "CSPR",
      target: TARGET,
      targetType: "Wallet Address",
      chainName: "casper-test",
      ...(lifecycle ? { lifecycle } : {}),
    },
  };
}

test("Gateway stores submitted, pending, and confirmed reconciliation state", async () => {
  const { store, agent } = await fixture();
  const authorized = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  assert.equal(authorized.result.decision, "Allowed");

  const submitted = await store.reconcileExecution(authorized.auditLog.id, {
    agentId: agent.id,
    status: "submitted",
    transactionHash: TX,
    attempt: 1,
    provider: "casper-testnet-rpc",
  }, { apiKey: agent.apiKey });
  assert.equal(submitted.auditLog.executionStatus, "submitted");
  assert.equal(submitted.auditLog.executionAttemptCount, 1);
  assert.ok(submitted.auditLog.pipelineStages.some((stage) => stage.id === "execution-submitted" && stage.status === "completed"));

  const pending = await store.reconcileExecution(authorized.auditLog.id, {
    agentId: agent.id,
    status: "pending",
    attempt: 1,
    confirmations: 1,
  }, { apiKey: agent.apiKey });
  assert.equal(pending.auditLog.executionStatus, "pending");
  assert.equal(pending.auditLog.executionConfirmations, 1);

  const confirmed = await store.reconcileExecution(authorized.auditLog.id, {
    agentId: agent.id,
    status: "confirmed",
    attempt: 1,
    confirmations: 2,
  }, { apiKey: agent.apiKey });
  assert.equal(confirmed.auditLog.executionStatus, "confirmed");
  assert.equal(confirmed.terminal, true);
  assert.ok(confirmed.auditLog.moduleFindings.some((finding) => finding.module === "Execution & Settlement Reconciliation" && finding.status === "pass"));
});

test("Gateway blocks a lifecycle retry while the original execution is pending", async () => {
  const { store, agent } = await fixture();
  const original = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  await store.reconcileExecution(original.auditLog.id, { agentId: agent.id, status: "pending", transactionHash: TX, attempt: 1 }, { apiKey: agent.apiKey });
  const now = Date.now();
  const retry = await store.submitAgentGatewayIntent(intent(agent.id, 5, {
    intentId: "intent.reconciliation.retry.0001",
    idempotencyKey: "idempotency.reconciliation.retry.0001",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
    retryOf: original.auditLog.id,
    attempt: 1,
  }), { apiKey: agent.apiKey });
  assert.equal(retry.result.decision, "Blocked");
  assert.ok(retry.result.moduleFindings.some((finding) => finding.rule === "Retry after uncertain execution" && finding.status === "fail"));
});

test("Gateway links a replacement audit and replacement transaction", async () => {
  const { store, agent } = await fixture();
  const original = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  await store.reconcileExecution(original.auditLog.id, { agentId: agent.id, status: "pending", transactionHash: TX, attempt: 1 }, { apiKey: agent.apiKey });
  const now = Date.now();
  const replacement = await store.submitAgentGatewayIntent(intent(agent.id, 6, {
    intentId: "intent.reconciliation.replacement.0001",
    idempotencyKey: "idempotency.reconciliation.replacement.0001",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
    replacementOf: original.auditLog.id,
    attempt: 1,
  }), { apiKey: agent.apiKey });
  assert.equal(replacement.result.decision, "Allowed");

  const reconciled = await store.reconcileExecution(original.auditLog.id, {
    agentId: agent.id,
    status: "replaced",
    attempt: 1,
    replacementTransactionHash: REPLACEMENT_TX,
    replacementAuditLogId: replacement.auditLog.id,
  }, { apiKey: agent.apiKey });
  assert.equal(reconciled.auditLog.executionStatus, "replaced");
  assert.equal(reconciled.auditLog.executionReplacedBy, REPLACEMENT_TX);
  assert.equal(reconciled.auditLog.executionReplacedByAuditId, replacement.auditLog.id);

  const bootstrap = await store.bootstrap(OWNER);
  const replacementAudit = bootstrap.auditLogs.find((item) => item.id === replacement.auditLog.id);
  assert.equal(replacementAudit.executionReplacementAuditId, original.auditLog.id);
});

test("Gateway rejects unauthenticated reconciliation and signed transaction material", async () => {
  const { store, agent } = await fixture();
  const authorized = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  await assert.rejects(() => store.reconcileExecution(authorized.auditLog.id, { agentId: agent.id, status: "submitted", transactionHash: TX, attempt: 1 }, { apiKey: "wrong" }), /credentials|api key/i);
  await assert.rejects(() => store.reconcileExecution(authorized.auditLog.id, { agentId: agent.id, status: "submitted", transactionHash: TX, attempt: 1, rawSignedTransaction: "secret" }, { apiKey: agent.apiKey }), /signing material|secrets/i);
});

test("Gateway polls a bound Casper transaction through backend configuration", async () => {
  const previousEnabled = process.env.RECONCILIATION_POLLING_ENABLED;
  const previousRpc = process.env.RECONCILIATION_CASPER_RPC_URL;
  const previousFetch = globalThis.fetch;
  process.env.RECONCILIATION_POLLING_ENABLED = "true";
  process.env.RECONCILIATION_CASPER_RPC_URL = "https://rpc.example.invalid";
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.method, "info_get_transaction");
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        transaction: { hash: TX.slice(2) },
        block_hash: "b".repeat(64),
        execution_info: { execution_result: { Success: { effect: {} } } },
        finalized_approvals: [{}],
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { store, agent } = await fixture({ requiredConfirmations: 1 });
    const authorized = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
    await store.reconcileExecution(authorized.auditLog.id, {
      agentId: agent.id,
      status: "submitted",
      transactionHash: TX,
      attempt: 1,
    }, { apiKey: agent.apiKey });
    const polled = await store.pollExecution(authorized.auditLog.id, {
      agentId: agent.id,
      chainFamily: "casper",
      chainName: "casper-test",
    }, { apiKey: agent.apiKey });
    assert.equal(polled.reconciliation.status, "confirmed");
    assert.equal(polled.reconciliation.provider, "configured-casper-rpc");
    assert.equal(polled.auditLog.reconciliationProvider, "configured-casper-rpc");
    const status = await store.executionReconciliationStatus(agent.id, { apiKey: agent.apiKey });
    assert.equal(status.realPollingConfigured, true);
    assert.equal(status.polling.casperConfigured, true);
  } finally {
    if (previousEnabled === undefined) delete process.env.RECONCILIATION_POLLING_ENABLED; else process.env.RECONCILIATION_POLLING_ENABLED = previousEnabled;
    if (previousRpc === undefined) delete process.env.RECONCILIATION_CASPER_RPC_URL; else process.env.RECONCILIATION_CASPER_RPC_URL = previousRpc;
    globalThis.fetch = previousFetch;
  }
});

test("Gateway polling rejects request-provided RPC endpoints", async () => {
  const { store, agent } = await fixture();
  const authorized = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  await store.reconcileExecution(authorized.auditLog.id, { agentId: agent.id, status: "submitted", transactionHash: TX, attempt: 1 }, { apiKey: agent.apiKey });
  await assert.rejects(() => store.pollExecution(authorized.auditLog.id, {
    agentId: agent.id,
    rpcUrl: "https://evil.example",
  }, { apiKey: agent.apiKey }), /not accepted|backend/i);
});
