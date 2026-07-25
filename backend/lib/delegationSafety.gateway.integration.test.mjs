import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");
const { buildDelegationAttestationHash, buildDelegationAttestationMessage } = await import("./delegationSafety.mjs");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const WALLET = `01${publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex")}`;
const DELEGATE = `01${"2".repeat(64)}`;
const TARGET = `01${"3".repeat(64)}`;

async function fixture(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Delegated Wallet Agent", type: "Wallet Assistant", purpose: "Delegation integration", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({
    name: "Delegation Safety Policy",
    agentId: agent.id,
    walletAddress: WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      delegationControlsEnabled: true,
      delegationMode: "Review",
      requireExpiringDelegation: true,
      maximumDelegationLifetime: 7200,
      maximumDelegationDepth: 1,
      allowRedelegation: false,
      approvedDelegates: [DELEGATE],
      blockedDelegates: [],
      revokedDelegationIds: [],
      unknownDelegateAction: "Review",
      requireScopeBinding: true,
      requireCryptographicDelegationAttestation: true,
      delegationUnavailableAction: "Review",
      ...overrides,
    },
  });
  return { store, agent };
}
function delegation(agentId, overrides = {}) {
  const base = {
    domain: "magen3.delegation.v1",
    chainName: "casper-test",
    delegationId: "dlg-gateway-001",
    agentId,
    delegatingWallet: WALLET,
    delegate: DELEGATE,
    sessionKey: DELEGATE,
    allowedNetworks: ["casper-test"],
    allowedContracts: [],
    allowedMethods: ["Transfer"],
    allowedAssets: ["CSPR"],
    nativeAmountLimit: 50,
    tokenAmountLimits: {},
    maxTransactionAmount: 50,
    maxFrequency: 10,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    revocationStatus: "Active",
    delegationDepth: 0,
    redelegationAllowed: false,
    nonce: "nonce-gateway-delegation-001",
    ...overrides,
  };
  const message = buildDelegationAttestationMessage(base);
  return { ...base, attestationHash: buildDelegationAttestationHash(base), attestationSignature: sign(null, Buffer.from(message), privateKey).toString("hex") };
}
function body(agentId, delegationMetadata) {
  return { source: "delegation-safety-integration", agentId, executionWalletAddress: WALLET, action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test", delegation: delegationMetadata } };
}

test("Gateway allows signed delegation and persists only sanitized evidence", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, delegation(agent.id)), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.delegationSafetyContext.signatureVerified, true);
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "delegation-session-key-safety"));
  assert.equal(response.auditLog.originalIntent.delegation.delegationId, "dlg-gateway-001");
  assert.equal(response.auditLog.originalIntent.delegation.signatureVerified, true);
  assert.match(response.auditLog.originalIntent.delegation.signatureHash, /^[0-9a-f]{64}$/);
  assert.equal("attestationSignature" in response.auditLog.originalIntent.delegation, false);
  assert.equal(JSON.stringify(response.auditLog).includes(delegation(agent.id).attestationSignature), false);
});

test("unknown delegate routes to review", async () => {
  const { store, agent } = await fixture();
  const unknown = `01${"4".repeat(64)}`;
  const response = await store.submitAgentGatewayIntent(body(agent.id, delegation(agent.id, { delegate: unknown, sessionKey: unknown })), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Approved delegate"));
});

test("policy-revoked delegation ID blocks", async () => {
  const { store, agent } = await fixture({ revokedDelegationIds: ["dlg-gateway-001"] });
  const response = await store.submitAgentGatewayIntent(body(agent.id, delegation(agent.id)), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Delegation revocation"));
});

test("legacy request without delegation remains backward compatible", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy Agent", type: "Wallet Assistant", purpose: "compatibility", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({ name: "Legacy Policy", agentId: agent.id, walletAddress: WALLET, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {} });
  const response = await store.submitAgentGatewayIntent({ source: "legacy", agentId: agent.id, executionWalletAddress: WALLET, action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test" } }, { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Delegation & Session Key Safety" && item.status === "skipped"));
});
