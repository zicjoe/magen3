import assert from "node:assert/strict";
import test from "node:test";

process.env.CASPER_RECORDING_MODE = "manual";
process.env.CASPER_CHAIN_NAME = "casper-test";
process.env.NODE_ENV = "test";
process.env.BRIDGE_PROVIDER_ACROSS_BASE_URL = "http://127.0.0.1:9999/api";
process.env.BRIDGE_PROVIDER_EVIDENCE_SECRET = "bridge-provider-gateway-test-secret-0123456789";
const { createMemoryStore } = await import("../store/memoryStore.mjs");

const OWNER = `01${"1".repeat(64)}`;
const WALLET = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const INPUT = "0x3333333333333333333333333333333333333333";
const OUTPUT = "0x4444444444444444444444444444444444444444";
const ROUTER = "0x5555555555555555555555555555555555555555";
const SOURCE_TX = `0x${"a".repeat(64)}`;
const DEST_TX = `0x${"b".repeat(64)}`;

function json(body) {
  return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
}

test("authenticated Gateway fetches an Across testnet quote, audits the exact source payload, and tracks destination delivery", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/swap/approval")) return json({
      id: "quote-gateway-1",
      inputAmount: "1000000",
      outputAmount: "990000",
      quoteExpiryTimestamp: Math.floor(Date.now() / 1000) + 300,
      expectedFillTime: 30,
      simulationSuccess: true,
      fees: { total: { amount: "10000" } },
      approvalTxns: [],
      swapTx: { chainId: "11155420", from: WALLET, to: ROUTER, data: "0x1234", value: "0", gas: "210000" },
    });
    if (String(url).includes("/deposit/status")) return json({ status: "filled", fillTxnRef: DEST_TX });
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    const store = createMemoryStore();
    const agent = await store.createAgent({ name: "Across Testnet Agent", type: "DeFi Agent", purpose: "Testnet bridge", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Trading", "Wallet Management", "dApp Interactions"] });
    await store.createPolicy({
      name: "Across Testnet Policy", agentId: agent.id, walletAddress: OWNER,
      maxTransaction: 100, dailyLimit: 500, approvalThreshold: 90, trustedContracts: [ROUTER], blockedActions: [], riskMode: "Balanced",
      structuredRules: {
        bridgeProviderIntegration: { enabled: true, required: true, allowedAdapters: ["across-testnet"], requirePayloadBinding: true, requireProviderSimulationSuccess: true },
        bridgeControlMode: "Observe", threatIntelligenceMode: "Observe", oracleValidationMode: "Observe",
        reconciliationEnabled: true, requiredConfirmations: 1, resourceDeliveryRequired: true,
      },
    });
    const response = await store.submitAgentGatewayIntent({
      source: "bridge-provider-gateway-test", agentId: agent.id, executionWalletAddress: WALLET,
      action: {
        type: "Bridge", amount: 1, asset: "USDC", target: ROUTER, targetType: "Bridge Contract", chainName: "eip155:11155420",
        bridge: { providerId: "across-testnet", sourceChainId: 11155420, destinationChainId: 84532, sourceToken: INPUT, destinationToken: OUTPUT, amountAtomic: "1000000", depositor: WALLET, recipient: RECIPIENT, destinationAddress: RECIPIENT, tradeType: "exactInput" },
      },
    }, { apiKey: agent.apiKey });

    assert.equal(response.result.decision, "Allowed");
    assert.equal(response.result.bridgeProviderIntegrationContext.status, "passed");
    assert.equal(response.bridgeProviderExecution.transaction.to, ROUTER);
    assert.match(response.bridgeProviderExecution.quoteHash, /^[0-9a-f]{64}$/);
    assert.match(response.bridgeProviderExecution.evidenceHash, /^[0-9a-f]{64}$/);
    assert.match(response.bridgeProviderExecution.payloadHash, /^[0-9a-f]{64}$/);
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "bridge-provider-integration"));
    assert.equal(response.auditLog.originalIntent.action.bridge.providerIntegration.adapterId, "across-testnet");
    assert.equal(response.auditLog.originalIntent.action.bridge.providerIntegration.sourceTransaction.to, ROUTER);

    await store.reconcileExecution(response.auditLog.id, { agentId: agent.id, status: "confirmed", transactionHash: SOURCE_TX, attempt: 1, confirmations: 1, finalized: true }, { apiKey: agent.apiKey });
    const delivery = await store.pollExecution(response.auditLog.id, { agentId: agent.id, transactionHash: SOURCE_TX }, { apiKey: agent.apiKey });
    assert.equal(delivery.reconciliation.status, "delivered");
    assert.equal(delivery.reconciliation.resourceDelivered, true);
    assert.equal(delivery.bridgeProviderObservation.destinationTransactionHash, DEST_TX);
    assert.ok(requested.some((url) => url.includes("/swap/approval")));
    assert.ok(requested.some((url) => url.includes("/deposit/status") && url.includes("depositTxnRef=")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
