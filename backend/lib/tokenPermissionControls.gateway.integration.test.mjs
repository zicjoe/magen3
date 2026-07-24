import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER_WALLET = `01${"1".repeat(64)}`;
const EXECUTION_WALLET = `01${"2".repeat(64)}`;
const APPROVED_SPENDER = `01${"3".repeat(64)}`;
const UNKNOWN_SPENDER = `01${"4".repeat(64)}`;
const BLOCKED_SPENDER = `01${"5".repeat(64)}`;
const TOKEN_CONTRACT = `hash-${"6".repeat(64)}`;

async function fixture(mode = "Review") {
  const store = createMemoryStore();
  const agent = await store.createAgent({
    name: "Token Permission Integration Agent",
    type: "DeFi Agent",
    purpose: "Test bounded token authority before execution",
    permissionLevel: "Limited Execution",
    walletAddress: OWNER_WALLET,
    executionCapabilities: ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions"],
  });
  await store.createPolicy({
    name: "Token Permission Integration Policy",
    agentId: agent.id,
    walletAddress: OWNER_WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TOKEN_CONTRACT],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      tokenPermissionControlsEnabled: true,
      tokenPermissionMode: mode,
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Block",
      tokenPermissionMaxApprovalAmount: 50,
      tokenPermissionMaxApprovalToTransactionRatio: 1.25,
      tokenPermissionMaxLifetimeSeconds: 3600,
      tokenPermissionRequireExpiry: true,
      tokenPermissionRequireAllowanceReset: true,
      tokenPermissionApprovedSpenders: [APPROVED_SPENDER],
      tokenPermissionBlockedSpenders: [BLOCKED_SPENDER],
      tokenPermissionAllowNftOperatorApproval: false,
      tokenPermissionAllowBatchApproval: false,
      tokenPermissionRequireChainBinding: true,
      tokenPermissionRequireNonce: true,
      tokenPermissionMaximumBatchSize: 5,
      threatIntelligenceMode: "Observe",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Observe",
      oracleValidationUnavailableAction: "Warn",
    },
  });
  return { store, agent };
}

function intent(agentId, overrides = {}) {
  const tokenPermission = overrides.tokenPermission || {};
  return {
    source: "token-permission-gateway-integration-test",
    agentId,
    executionWalletAddress: EXECUTION_WALLET,
    action: {
      type: overrides.type || "Token Approval",
      amount: 10,
      asset: "TEST",
      target: TOKEN_CONTRACT,
      targetType: "Token Contract",
      contractIdentifierType: "Contract Hash",
      chainName: "casper-test",
      tokenPermission: {
        kind: overrides.type || "Token Approval",
        standard: "CEP-18",
        network: "casper-test",
        tokenContract: TOKEN_CONTRACT,
        tokenIdentifierType: "Contract Hash",
        owner: EXECUTION_WALLET,
        spender: APPROVED_SPENDER,
        intendedSpender: APPROVED_SPENDER,
        approvalAmount: 10,
        intendedTransactionAmount: 10,
        deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
        oneTime: true,
        ...tokenPermission,
      },
    },
  };
}

test("authenticated Gateway persists Allowed, Review Required, and Blocked token-permission findings", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(intent(agent.id), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(intent(agent.id, {
    tokenPermission: { spender: UNKNOWN_SPENDER, intendedSpender: UNKNOWN_SPENDER },
  }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, {
    tokenPermission: { spender: BLOCKED_SPENDER, intendedSpender: BLOCKED_SPENDER },
  }), { apiKey: agent.apiKey });

  assert.deepEqual(
    [allowed.result.decision, review.result.decision, blocked.result.decision],
    ["Allowed", "Review Required", "Blocked"],
  );

  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((finding) => finding.module === "Token Approval & Permit Safety"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "token-approval-permit-safety"));
    assert.ok(response.auditLog.moduleFindings.some((finding) => finding.module === "Token Approval & Permit Safety"));
    assert.equal(response.auditLog.originalIntent.action.tokenPermission.tokenContract, TOKEN_CONTRACT);
    assert.equal(response.result.tokenPermissionControlsContext.availability, "foundation-available");
    assert.equal(response.result.tokenPermissionControlsContext.owner, EXECUTION_WALLET);
  }
});

test("a permit fingerprint and signature hash cannot be replayed", async () => {
  const { store, agent } = await fixture("Enforce");
  const permitIntent = intent(agent.id, {
    type: "Permit Authorization",
    tokenPermission: {
      kind: "Permit Authorization",
      nonce: "17",
      permitIdentifier: "permit:integration-17",
      permitSignatureHash: "a".repeat(64),
      oneTime: true,
    },
  });

  const first = await store.submitAgentGatewayIntent(permitIntent, { apiKey: agent.apiKey });
  assert.equal(first.result.decision, "Allowed");
  assert.equal(first.auditLog.originalIntent.action.tokenPermission.permitSignatureHash, "a".repeat(64));
  assert.ok(first.auditLog.originalIntent.action.tokenPermission.fingerprint);

  const replay = await store.submitAgentGatewayIntent(permitIntent, { apiKey: agent.apiKey });
  assert.equal(replay.result.decision, "Blocked");
  assert.ok(replay.result.moduleFindings.some((finding) =>
    finding.module === "Token Approval & Permit Safety" && ["Reused permit signature", "Permit replay"].includes(finding.rule) && finding.status === "fail"));
});

test("unlimited approval is blocked and raw permit material is never persisted", async () => {
  const { store, agent } = await fixture("Enforce");
  const blocked = await store.submitAgentGatewayIntent(intent(agent.id, {
    tokenPermission: { unlimited: true, approvalAmount: "unlimited" },
  }), { apiKey: agent.apiKey });
  assert.equal(blocked.result.decision, "Blocked");
  assert.ok(blocked.result.moduleFindings.some((finding) => finding.rule === "Unlimited token approval" && finding.status === "fail"));

  await assert.rejects(
    () => store.submitAgentGatewayIntent(intent(agent.id, {
      type: "Permit Authorization",
      tokenPermission: { kind: "Permit Authorization", nonce: "18", permitSignature: "0xraw-signature" },
    }), { apiKey: agent.apiKey }),
    /signing material/i,
  );
  const boot = await store.bootstrap(OWNER_WALLET);
  assert.equal(boot.auditLogs.some((log) => JSON.stringify(log.originalIntent || {}).includes("0xraw-signature")), false);
});
