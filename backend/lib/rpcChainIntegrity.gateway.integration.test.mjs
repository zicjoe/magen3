import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const WALLET = `01${"1".repeat(64)}`;
const TARGET = `01${"2".repeat(64)}`;
const GENESIS = "a".repeat(64);
const TX = "b".repeat(64);
const STATE = "c".repeat(64);

function rpc(overrides = {}) {
  const timestamp = new Date(Date.now() - 5_000).toISOString();
  return {
    expectedChainName: "casper-test",
    expectedNetworkIdentifier: "casper-testnet",
    expectedGenesisHash: GENESIS,
    selectedProviderId: "primary",
    selectedEndpoint: "https://primary.example/rpc",
    providerObservations: [
      { providerId: "primary", endpoint: "https://primary.example/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: GENESIS, tls: true, synced: true, latestBlockHeight: 101, latestBlockTimestamp: timestamp, responseTimestamp: new Date().toISOString(), transactionStatusHash: TX, contractStateHash: STATE },
      { providerId: "secondary", endpoint: "https://secondary.example/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: GENESIS, tls: true, synced: true, latestBlockHeight: 100, latestBlockTimestamp: timestamp, responseTimestamp: new Date().toISOString(), transactionStatusHash: TX, contractStateHash: STATE },
    ],
    automaticFailoverUsed: false,
    ...overrides,
  };
}

async function fixture(overrides = {}) {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "RPC Integrity Agent", type: "Wallet Assistant", purpose: "RPC integrity integration", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({
    name: "RPC Integrity Policy",
    agentId: agent.id,
    walletAddress: WALLET,
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 80,
    trustedContracts: [TARGET],
    blockedActions: [],
    riskMode: "Balanced",
    structuredRules: {
      rpcIntegrityEnabled: true,
      rpcIntegrityMode: "Review",
      approvedRpcEndpoints: [
        { id: "primary", endpoint: "https://primary.example/rpc" },
        { id: "secondary", endpoint: "https://secondary.example/rpc" },
      ],
      rpcIntegrityRequireTls: true,
      rpcIntegrityMaximumBlockAgeSeconds: 120,
      rpcIntegrityMinimumProviders: 2,
      rpcIntegrityMaximumHeightDifference: 5,
      rpcIntegrityDisagreementAction: "Block",
      rpcIntegrityUnavailableAction: "Review",
      rpcIntegrityRequireNetworkIdentity: true,
      rpcIntegrityAllowAutomaticFailover: false,
      ...overrides,
    },
  });
  return { store, agent };
}
function body(agentId, rpcIntegrity) {
  return { source: "rpc-integrity-integration", agentId, executionWalletAddress: WALLET, action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test", rpcIntegrity } };
}

test("Gateway allows matching approved RPC evidence and persists audit context", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, rpc()), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.equal(response.result.rpcChainIntegrityContext.status, "passed");
  assert.ok(response.result.pipelineStages.some((stage) => stage.id === "rpc-chain-integrity"));
  assert.equal(response.auditLog.originalIntent.rpcIntegrity.selectedProviderId, "primary");
  assert.equal(response.auditLog.originalIntent.rpcIntegrity.providerObservations.length, 2);
  assert.equal(response.auditLog.originalIntent.rpcIntegrity.networkAgreement, true);
});

test("Gateway blocks a wrong-network RPC observation", async () => {
  const { store, agent } = await fixture();
  const metadata = rpc();
  metadata.providerObservations[0].chainName = "casper-mainnet";
  const response = await store.submitAgentGatewayIntent(body(agent.id, metadata), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Blocked");
  assert.ok(response.result.moduleFindings.some((item) => item.rule === "Network identity binding" && item.status === "fail"));
});

test("Gateway routes missing RPC evidence to Review Required when configured", async () => {
  const { store, agent } = await fixture();
  const response = await store.submitAgentGatewayIntent(body(agent.id, undefined), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Review Required");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "RPC & Chain Integrity" && item.status === "unavailable"));
});

test("legacy policy without RPC controls remains backward compatible", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy RPC Agent", type: "Wallet Assistant", purpose: "compatibility", permissionLevel: "Limited Execution", walletAddress: WALLET, executionCapabilities: ["Wallet Management"] });
  await store.createPolicy({ name: "Legacy RPC Policy", agentId: agent.id, walletAddress: WALLET, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {} });
  const response = await store.submitAgentGatewayIntent(body(agent.id, undefined), { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
  assert.ok(response.result.moduleFindings.some((item) => item.module === "RPC & Chain Integrity" && item.status === "skipped"));
});
