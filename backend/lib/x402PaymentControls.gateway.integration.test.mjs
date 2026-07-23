import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";

const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `0x${"2".repeat(40)}`;
const PAY_TO = `0x${"a".repeat(40)}`;

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "x402 Payment Agent",
    type: "DeFi Agent",
    purpose: "Pay approved machine-readable resources",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Wallet Management", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "x402 Exact Payment Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 10,
    dailyLimit: 100,
    approvalThreshold: 8,
    trustedContracts: [],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      x402ControlsEnabled: true,
      x402ControlMode: "Enforce",
      x402UnavailableAction: "Block",
      x402AllowedVersions: [2],
      x402AllowedSchemes: ["exact"],
      x402AllowedMethods: ["GET", "POST"],
      x402AllowedNetworks: ["eip155:84532"],
      x402AllowedAssets: ["USDC"],
      x402AllowedFacilitators: ["https://x402.org/facilitator"],
      x402AllowedMerchants: ["api.example.com"],
      x402BlockedMerchants: [],
      x402AllowedRecipients: [PAY_TO],
      x402MaxPayment: 5,
      x402DailyLimit: 25,
      x402MonthlyLimit: 100,
      x402ReviewThreshold: 3,
      x402MaxPaymentsPerHour: 10,
      x402MaxAuthorizationLifetimeSeconds: 600,
      x402RequireHttps: true,
      x402RequirePaymentRequiredHash: true,
      x402RequireBodyHashForUnsafeMethods: true,
      x402RequireRequestId: true,
      x402PreventAmbiguousRetry: true,
      x402MaxSettlementAttempts: 1,
      threatIntelligenceMode: "Observe",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Observe",
      oracleValidationUnavailableAction: "Warn",
    },
  });
  return { store, agent };
}

function intent(agentId, overrides = {}) {
  return {
    source: "x402-gateway-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: "x402 Payment",
      amount: 1,
      asset: "USDC",
      target: "https://api.example.com/data",
      targetType: "x402 Merchant",
      x402: {
        version: 2,
        scheme: "exact",
        resourceUrl: "https://api.example.com/data",
        method: "GET",
        merchantDomain: "api.example.com",
        payTo: PAY_TO,
        asset: "USDC",
        network: "eip155:84532",
        facilitator: "https://x402.org/facilitator",
        amountAtomic: "1000000",
        validUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
        requestId: `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        paymentRequiredHash: "b".repeat(64),
        settlementStatus: "not_submitted",
        settlementAttempt: 0,
        ...overrides,
      },
    },
  };
}

test("Gateway persists an Allowed x402 decision and reconciles settlement without signing material", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });

  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.executionApproved, true);
  assert.ok(response.result.moduleFindings.some((finding) => finding.module === "x402 Payment Controls"));
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "x402-payment-controls"));
  assert.ok(response.auditLog.pipelineStages.some((stage) => stage.id === "x402-settlement" && stage.status === "pending"));
  const fingerprint = response.result.x402PaymentControlsContext.requestFingerprint;
  assert.equal(response.auditLog.originalIntent.action.x402.requestFingerprint, fingerprint);

  const settled = await store.updateX402Settlement(response.auditLog.id, {
    agentId: agent.id,
    status: "confirmed",
    transactionHash: `0x${"d".repeat(64)}`,
    attempt: 1,
    requestFingerprint: fingerprint,
    facilitatorReference: "settlement-001",
    resourceDelivered: true,
  }, { apiKey: agent.apiKey });

  assert.equal(settled.settlement.status, "confirmed");
  assert.equal(settled.auditLog.executionStatus, "x402_confirmed");
  assert.equal(settled.auditLog.originalIntent.action.x402.settlement.resourceDelivered, true);
  assert.ok(settled.auditLog.pipelineStages.some((stage) => stage.id === "x402-settlement" && stage.status === "completed"));
  assert.ok(settled.auditLog.pipelineStages.some((stage) => stage.id === "x402-resource-delivery" && stage.status === "completed"));
});

test("Gateway blocks a replay after a confirmed settlement", async () => {
  const { store, agent } = await fixture();
  const paymentIntent = intent(agent.id);
  const first = await store.submitAgentGatewayIntent(paymentIntent, { apiKey: agent.apiKey });
  const fingerprint = first.result.x402PaymentControlsContext.requestFingerprint;
  await store.updateX402Settlement(first.auditLog.id, {
    agentId: agent.id,
    status: "confirmed",
    transactionHash: `0x${"e".repeat(64)}`,
    attempt: 1,
    requestFingerprint: fingerprint,
    resourceDelivered: true,
  }, { apiKey: agent.apiKey });
  const replay = await store.submitAgentGatewayIntent(paymentIntent, { apiKey: agent.apiKey });
  assert.equal(replay.result.decision, "Blocked");
  assert.ok(replay.result.moduleFindings.some((finding) => finding.rule === "x402 replay prevention" && finding.status === "fail"));
});

test("Gateway rejects signed x402 payment payloads before audit persistence", async () => {
  const { store, agent } = await fixture();
  const body = intent(agent.id, { paymentSignature: "secret-signature" });
  await assert.rejects(
    () => store.submitAgentGatewayIntent(body, { apiKey: agent.apiKey }),
    /signing material|signatures|signed payment/i,
  );
  const boot = await store.bootstrap(OWNER_WALLET);
  assert.equal(boot.auditLogs.filter((log) => log.action === "x402 Payment").length, 0);
});


test("Gateway enforces monotonic x402 settlement reconciliation", async () => {
  const { store, agent } = await fixture();
  const authorized = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  const fingerprint = authorized.result.x402PaymentControlsContext.requestFingerprint;
  const txHash = `0x${"f".repeat(64)}`;

  const submitted = await store.updateX402Settlement(authorized.auditLog.id, {
    agentId: agent.id,
    status: "submitted",
    transactionHash: txHash,
    attempt: 1,
    requestFingerprint: fingerprint,
  }, { apiKey: agent.apiKey });
  assert.equal(submitted.settlement.status, "submitted");

  const pending = await store.updateX402Settlement(authorized.auditLog.id, {
    agentId: agent.id,
    status: "pending",
    attempt: 1,
    requestFingerprint: fingerprint,
  }, { apiKey: agent.apiKey });
  assert.equal(pending.settlement.transactionHash, txHash);

  const confirmed = await store.updateX402Settlement(authorized.auditLog.id, {
    agentId: agent.id,
    status: "confirmed",
    transactionHash: txHash,
    attempt: 1,
    requestFingerprint: fingerprint,
    resourceDelivered: true,
  }, { apiKey: agent.apiKey });
  assert.equal(confirmed.settlement.resourceDelivered, true);

  await assert.rejects(
    () => store.updateX402Settlement(authorized.auditLog.id, {
      agentId: agent.id,
      status: "confirmed",
      transactionHash: `0x${"a".repeat(64)}`,
      attempt: 1,
      requestFingerprint: fingerprint,
      resourceDelivered: true,
    }, { apiKey: agent.apiKey }),
    /transaction hash cannot be changed/i,
  );
});
