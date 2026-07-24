import assert from "node:assert/strict";
import test from "node:test";
process.env.CASPER_RECORDING_MODE = "manual";
const { createMemoryStore } = await import("../store/memoryStore.mjs");
const OWNER = `01${"1".repeat(64)}`;
const EXECUTION = `01${"2".repeat(64)}`;
const TARGET = `01${"3".repeat(64)}`;
const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);

async function fixture() {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "MCP Agent", type: "DeFi Agent", purpose: "Tool integrity", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Wallet Management", "dApp Interactions"] });
  await store.createPolicy({ name: "Tool Integrity Policy", agentId: agent.id, walletAddress: OWNER, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {
    toolIntegrityEnabled: true, toolIntegrityMode: "Review", requireTls: true, requireManifestHash: true, requireSchemaHash: true, unknownToolAction: "Review", permissionExpansionAction: "Block",
    approvedMcpServers: [{ id: "mcp-main", url: "https://mcp.example", manifestHash: H1 }],
    approvedTools: [{ serverId: "mcp-main", name: "wallet.transfer", version: "1.0.0", manifestHash: H1, schemaHash: H2, descriptionHash: H3, permissionScopes: ["wallet:read", "capability:Wallet Management"], credentialScopes: ["wallet-limited"], origin: "magen3-mcp" }],
  }});
  return { store, agent };
}
function body(agentId, toolIntegrity = {}) {
  return { source: "mcp-integrity-test", agentId, executionWalletAddress: EXECUTION, action: { type: "Transfer", amount: 10, asset: "CSPR", target: TARGET, targetType: "Wallet Address", chainName: "casper-test", toolIntegrity: {
    mcpServerId: "mcp-main", mcpServerUrl: "https://mcp.example", toolName: "wallet.transfer", toolVersion: "1.0.0", manifestHash: H1, schemaHash: H2, descriptionHash: H3, permissionScopes: ["wallet:read", "capability:Wallet Management"], credentialScope: "wallet-limited", tls: true, toolOrigin: "magen3-mcp", approvedAt: "2026-07-24T12:00:00.000Z", ...toolIntegrity,
  } } };
}

test("Gateway persists Allowed, Review Required, and Blocked tool evidence", async () => {
  const { store, agent } = await fixture();
  const allowed = await store.submitAgentGatewayIntent(body(agent.id), { apiKey: agent.apiKey });
  const review = await store.submitAgentGatewayIntent(body(agent.id, { toolName: "unknown.tool" }), { apiKey: agent.apiKey });
  const blocked = await store.submitAgentGatewayIntent(body(agent.id, { schemaHash: "d".repeat(64) }), { apiKey: agent.apiKey });
  assert.deepEqual([allowed.result.decision, review.result.decision, blocked.result.decision], ["Allowed", "Review Required", "Blocked"]);
  for (const response of [allowed, review, blocked]) {
    assert.ok(response.result.moduleFindings.some((item) => item.module === "Tool & MCP Integrity"));
    assert.ok(response.result.pipelineStages.some((stage) => stage.id === "tool-mcp-integrity"));
    assert.equal(response.auditLog.originalIntent.toolIntegrity.toolName, response.result.toolMcpIntegrityContext.toolName);
  }
});

test("legacy requests remain compatible", async () => {
  const store = createMemoryStore();
  const agent = await store.createAgent({ name: "Legacy", type: "Custom Agent", purpose: "compat", permissionLevel: "Limited Execution", walletAddress: OWNER, executionCapabilities: ["Custom"] });
  await store.createPolicy({ name: "Legacy", agentId: agent.id, walletAddress: OWNER, maxTransaction: 100, dailyLimit: 500, approvalThreshold: 80, trustedContracts: [TARGET], blockedActions: [], riskMode: "Balanced", structuredRules: {} });
  const response = await store.submitAgentGatewayIntent({ agentId: agent.id, executionWalletAddress: EXECUTION, action: { type: "Transfer", amount: 1, asset: "CSPR", target: TARGET, targetType: "Wallet Address" } }, { apiKey: agent.apiKey });
  assert.equal(response.result.decision, "Allowed");
});
