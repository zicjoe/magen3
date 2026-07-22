#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configFromEnv, createClient, createToolHandlers } from "./core.js";

const actionSchema = z.object({
  type: z.string().min(1),
  amount: z.number().finite().nonnegative().optional(),
  asset: z.string().min(1).optional(),
  target: z.string().min(1),
  targetType: z.string().min(1).optional(),
  contractIdentifierType: z.enum(["Contract Hash", "Package Hash"]).or(z.string().min(1)).optional(),
  entryPoint: z.string().min(1).optional(),
  contractVersion: z.number().finite().int().nonnegative().optional(),
  chainName: z.string().min(1).optional(),
  preflight: z.object({
    paymentAmountMotes: z.string().regex(/^[1-9]\d*$/).optional(),
    gasPriceTolerance: z.number().int().positive().optional(),
    ttl: z.string().regex(/^(?:\d+|\d+(?:\.\d+)?(?:ms|s|m|h))$/i).optional(),
    timestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    slippageBps: z.number().int().min(0).max(10000).optional(),
    expectedOutput: z.number().finite().nonnegative().optional(),
    minimumReceived: z.number().finite().nonnegative().optional(),
    runtimeArgs: z.record(z.string(), z.unknown()).optional(),
    transactionHash: z.string().regex(/^(?:transaction-hash-)?[0-9a-f]{64}$/i).optional(),
  }).optional(),
});
const intentSchema = z.object({
  source: z.string().min(1).optional(),
  targetChain: z.string().min(1).optional(),
  walletAddress: z.string().min(1).optional(),
  executionWalletAddress: z.string().min(1),
  goal: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  action: actionSchema,
});

export function buildServer() {
  const handlers = createToolHandlers(createClient(configFromEnv()));
  const server = new McpServer(
    { name: "magen3-execution-firewall", version: "0.2.0" },
    { instructions: "Before any Web3 execution, call magen3_require_allowed with the complete intent. Allowed permits continuation only to human-controlled wallet approval. Blocked means stop. Review Required means stop and request human review. Inspect deterministic module findings, including Threat Intelligence feed availability and exact-match evidence. Never bypass Magen3, expose credentials, access wallet secrets, sign, broadcast, or redeploy contracts." }
  );
  server.registerTool("magen3_verify_agent", { title: "Verify Magen3 Agent", description: "Verify the configured Connected Agent credentials and active policy.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.verifyAgent());
  server.registerTool("magen3_get_intent_schema", { title: "Get Magen3 Intent Schema", description: "Return the intent fields and execution safety boundary.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.getIntentSchema());
  server.registerTool("magen3_check_intent", { title: "Check Web3 Intent", description: "Evaluate an intent and return Allowed, Blocked, or Review Required. This writes an audit decision but does not enforce fail-closed behavior in the client.", inputSchema: intentSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async (intent) => handlers.checkIntent(intent));
  server.registerTool("magen3_require_allowed", { title: "Require Magen3 Approval", description: "Fail-closed execution gate. Returns an MCP error unless Magen3 explicitly returns Allowed.", inputSchema: intentSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async (intent) => handlers.requireAllowed(intent));
  return server;
}

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(`[magen3-mcp] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
