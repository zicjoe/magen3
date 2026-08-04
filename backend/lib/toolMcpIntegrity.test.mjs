import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolMcpIntegrity } from "./toolMcpIntegrity.mjs";

const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);
function policy(overrides = {}) {
  return { structuredRules: {
    toolIntegrityEnabled: true,
    toolIntegrityMode: "Review",
    approvedMcpServers: [{ id: "mcp-main", url: "https://mcp.example", manifestHash: H1 }],
    approvedTools: [{ serverId: "mcp-main", name: "wallet.transfer", version: "1.0.0", manifestHash: H1, schemaHash: H2, descriptionHash: H3, permissionScopes: ["wallet:read", "capability:Wallet Management"], credentialScopes: ["wallet-limited"], origin: "magen3-mcp" }],
    requireManifestHash: true,
    requireSchemaHash: true,
    requireTls: true,
    allowToolVersionChanges: false,
    unknownToolAction: "Review",
    permissionExpansionAction: "Block",
    ...overrides,
  }};
}
function request(overrides = {}) {
  return {
    toolIntegrityMetadataSupplied: true,
    toolMcpServerId: "mcp-main",
    toolMcpServerUrl: "https://mcp.example",
    toolIntegrityToolName: "wallet.transfer",
    toolIntegrityToolVersion: "1.0.0",
    toolIntegrityManifestHash: H1,
    toolIntegritySchemaHash: H2,
    toolIntegrityDescriptionHash: H3,
    toolIntegrityPermissionScopes: ["wallet:read", "capability:Wallet Management"],
    toolIntegrityCredentialScope: "wallet-limited",
    toolIntegrityTls: true,
    toolIntegrityOrigin: "magen3-mcp",
    toolIntegrityApprovedAt: "2026-07-24T12:00:00.000Z",
    ...overrides,
  };
}
const agent = { executionCapabilities: ["Wallet Management"] };

test("allows approved unchanged MCP tool", () => {
  const result = evaluateToolMcpIntegrity({ request: request(), policy: policy(), agent });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.approvedTool, true);
});

test("unknown server routes to review", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolMcpServerId: "unknown", toolMcpServerUrl: "https://other.example" }), policy: policy(), agent });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "Approved MCP server"));
});

test("unknown tool routes to review", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolIntegrityToolName: "wallet.drain" }), policy: policy(), agent });
  assert.equal(result.needsReview, true);
});

test("changed manifest hard blocks", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolIntegrityManifestHash: "d".repeat(64) }), policy: policy(), agent });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Server manifest binding" || item.rule === "manifest hash binding"));
});

test("changed schema hard blocks", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolIntegritySchemaHash: "d".repeat(64) }), policy: policy(), agent });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "schema hash binding"));
});

test("permission expansion hard blocks", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolIntegrityPermissionScopes: ["wallet:read", "wallet:write"] }), policy: policy(), agent });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Permission scope containment"));
});

test("non-TLS server hard blocks", () => {
  const result = evaluateToolMcpIntegrity({ request: request({ toolMcpServerUrl: "http://mcp.example", toolIntegrityTls: false }), policy: policy(), agent });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "TLS required"));
});

test("tool scope cannot exceed agent capability", () => {
  const expandedPolicy = policy({ approvedTools: [{ serverId: "mcp-main", name: "wallet.transfer", version: "1.0.0", manifestHash: H1, schemaHash: H2, descriptionHash: H3, permissionScopes: ["capability:Treasury Operations"] }] });
  const result = evaluateToolMcpIntegrity({ request: request({ toolIntegrityPermissionScopes: ["capability:Treasury Operations"], toolIntegrityCredentialScope: "" }), policy: expandedPolicy, agent });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Agent capability boundary"));
});

test("legacy policies remain compatible", () => {
  const result = evaluateToolMcpIntegrity({ request: {}, policy: { structuredRules: {} }, agent });
  assert.equal(result.hardBlock, false);
  assert.ok(result.findings.every((item) => item.status === "skipped"));
});

test("trusted official MCP 0.5.1 integrity upgrade remains compatible with an exact 0.5.0 approval", () => {
  const oldManifest = "a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c";
  const oldSchema = "29b728aaa61bced4a3f533d23e52045f1f00d593f995634d83063c44fa0e18f2";
  const oldDescription = "f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2";
  const newManifest = "13fa36697e6a8fc245951012bcceb80af11e3fd58bb0ea641eaf5cb9ac27924b";
  const newSchema = "bd690b9c71ac86c8b48afda761c558744437ec1e956a5b3b451df96500023eeb";
  const newDescription = "3a415223b22674c46c16636b28afae9e4ce21e95f1c69fff80a27785d51d6b1c";
  const result = evaluateToolMcpIntegrity({
    policy: policy({
      approvedMcpServers: [{ id: "magen3-official-mcp", manifestHash: oldManifest }],
      approvedTools: [{
        serverId: "magen3-official-mcp",
        name: "magen3_check_intent",
        version: "0.5.0",
        manifestHash: oldManifest,
        schemaHash: oldSchema,
        descriptionHash: oldDescription,
        permissionScopes: ["magen3:intent:check"],
        credentialScopes: ["agent-gateway"],
        origin: "@magen3/mcp-server",
      }],
    }),
    request: request({
      toolMcpServerId: "magen3-official-mcp",
      toolMcpServerUrl: "",
      toolIntegrityToolName: "magen3_check_intent",
      toolIntegrityToolVersion: "0.5.1",
      toolIntegrityManifestHash: newManifest,
      toolIntegritySchemaHash: newSchema,
      toolIntegrityDescriptionHash: newDescription,
      toolIntegrityPermissionScopes: ["magen3:intent:check"],
      toolIntegrityCredentialScope: "agent-gateway",
      toolIntegrityTls: true,
      toolIntegrityOrigin: "@magen3/mcp-server",
    }),
    agent,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.approvedTool, true);
});
