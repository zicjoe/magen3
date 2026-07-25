import assert from "node:assert/strict";
import test from "node:test";
process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");
const WALLET = `01${"1".repeat(64)}`;
const TARGET = `01${"2".repeat(64)}`;
function feeSafety(overrides = {}) {
  return {
    chainFamily: "Casper", chainName: "casper-test", networkFee: 2, unit: "CSPR",
    sponsor: "magen3-relayer", sponsorshipId: "sponsor-1",
    sponsorshipExpiry: new Date(Date.now() + 3600_000).toISOString(), sponsorshipScopes: ["Transfer"],
    sponsorSignatureHash: "a".repeat(64), expectedPayer: "magen3-relayer", actualPayer: "magen3-relayer",
    sponsored: true, sponsorshipAvailable: true, ...overrides,
  };
}
async function fixture(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Fee Safety Agent", type: "Wallet Assistant", purpose: "Fee safety integration", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({ name: "Fee Safety Policy", agentId: agent.id, walletAddress: WALLET, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {
    feeSafetyEnabled: true, feeSafetyMode: "Review", feeSafetyMaximumNetworkFee: 5,
    feeSafetyApprovedSponsors: ["magen3-relayer"], feeSafetyApprovedPaymasters: [],
    feeSafetySponsorshipUnavailableAction: "Review", feeSafetySponsoredBudget: 20,
    feeSafetyMaximumSponsoredOperations: 10, feeSafetyMaximumFailedSponsoredOperations: 2,
    feeSafetyLookbackSeconds: 86400, feeSafetyRequireSponsorshipExpiry: true, feeSafetyRequireSponsorEvidence: true,
    ...overrides,
  }});
  return { store, agent };
}
function body(agentId, metadata) { return { source: "fee-safety-integration", agentId, executionWalletAddress: WALLET, action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test", feeSafety: metadata } }; }

test("Gateway allows bounded approved sponsorship and persists sanitized evidence", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, feeSafety()), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.gasSponsorshipFeeSafetyContext.status, "passed");
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "gas-sponsorship-fee-safety"));
  assert.equal(response.auditLog.originalIntent.feeSafety.sponsor, "magen3-relayer");
  assert.equal(response.auditLog.originalIntent.feeSafety.sponsorEvidenceVerified, true);
  assert.match(response.auditLog.originalIntent.feeSafety.protectedFingerprint, /^[0-9a-f]{64}$/);
});

test("Gateway reviews an unknown sponsor in Review mode", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, feeSafety({ sponsor: "unknown-sponsor" })), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Approved sponsor" && item.status === "warning"));
});

test("Gateway blocks payer mismatch", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, feeSafety({ actualPayer: "agent-wallet" })), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Expected payer" && item.status === "fail"));
});

test("Gateway rejects raw sponsor signatures", async () => {
  const { store, agent } = await fixture();
  await assert.rejects(() => store.submitAgentGatewayIntent(body(agent.id, { ...feeSafety(), sponsorSignature: "raw-signature" }), { apiKey: agent.apiKey }), /signatures/i);
});

test("legacy policy remains backward compatible", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy Fee Agent", type: "Wallet Assistant", purpose: "compatibility", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({ name: "Legacy", agentId: agent.id, walletAddress: WALLET, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {} });
  const response = await store.submitAgentGatewayIntent(body(agent.id, undefined), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "Gas Sponsorship & Fee Safety" && item.status === "skipped"));
});
