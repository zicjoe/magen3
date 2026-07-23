#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configFromEnv, createClient, createToolHandlers } from "./core.js";


const complianceAttestationSchema = z.object({
  status: z.enum(["Verified", "Pending", "Rejected", "Expired", "Not Provided"]).or(z.string().min(1)),
  provider: z.string().min(1).max(96).optional(),
  reference: z.string().min(1).max(128).optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
}).strict();

const actionSchema = z.object({
  type: z.string().min(1),
  amount: z.number().finite().nonnegative().optional(),
  asset: z.string().min(1).optional(),
  outputAsset: z.string().min(1).optional(),
  target: z.string().min(1),
  targetType: z.string().min(1).optional(),
  contractIdentifierType: z.enum(["Contract Hash", "Package Hash"]).or(z.string().min(1)).optional(),
  entryPoint: z.string().min(1).optional(),
  contractVersion: z.number().finite().int().nonnegative().optional(),
  chainName: z.string().min(1).optional(),
  oracle: z.object({
    baseAsset: z.string().min(1),
    quoteAsset: z.string().min(1),
    executionPrice: z.number().finite().positive(),
    quoteTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
  }).optional(),
  bridge: z.object({
    sourceChain: z.string().min(1),
    destinationChain: z.string().min(1),
    provider: z.string().min(1),
    routeId: z.string().min(1).optional(),
    destinationAddress: z.string().min(1),
    asset: z.string().min(1).optional(),
    feeAmount: z.number().finite().nonnegative().optional(),
    feeBps: z.number().finite().min(0).max(10000).optional(),
    expectedOutput: z.number().finite().nonnegative().optional(),
    minimumReceived: z.number().finite().nonnegative().optional(),
    quoteTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    quoteExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    sourceConfirmations: z.number().int().nonnegative().optional(),
    destinationConfirmations: z.number().int().nonnegative().optional(),
  }).optional(),
  x402: z.object({
    version: z.number().int().positive(),
    scheme: z.string().min(1),
    resourceUrl: z.string().url(),
    method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]).or(z.string().min(1)),
    merchantDomain: z.string().min(1),
    payTo: z.string().min(1),
    asset: z.string().min(1),
    network: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    facilitator: z.string().min(1),
    amountAtomic: z.string().regex(/^[1-9]\d*$/),
    validUntil: z.union([z.string().min(1), z.number().positive()]).optional(),
    maxTimeoutSeconds: z.number().int().positive().max(86400).optional(),
    requirementsReceivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    requestId: z.string().min(1).max(128),
    paymentRequiredHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i),
    requestBodyHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    requestFingerprint: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    settlementStatus: z.enum(["not_submitted", "submitted", "pending", "confirmed", "failed", "uncertain"]).optional(),
    settlementAttempt: z.number().int().nonnegative().optional(),
    settlementTxHash: z.string().min(1).optional(),
  }).strict().optional(),
  compliance: z.object({
    originatorJurisdiction: z.string().regex(/^[A-Za-z]{2}$/).optional(),
    beneficiaryJurisdiction: z.string().regex(/^[A-Za-z]{2}$/).optional(),
    counterpartyType: z.enum(["VASP", "Self-hosted Wallet", "Organization", "Individual", "Unknown"]).or(z.string().min(1)).optional(),
    originatorAttestation: complianceAttestationSchema.optional(),
    beneficiaryAttestation: complianceAttestationSchema.optional(),
    travelRule: z.object({
      status: z.enum(["Complete", "Incomplete", "Not Required", "Not Provided"]).or(z.string().min(1)),
      reference: z.string().min(1).max(128).optional(),
      dataHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    }).strict().optional(),
    screening: z.object({
      status: z.enum(["Clear", "Match", "Review", "Unavailable", "Not Provided"]).or(z.string().min(1)),
      provider: z.string().min(1).max(96).optional(),
      reference: z.string().min(1).max(128).optional(),
      screenedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    }).strict().optional(),
    riskRating: z.enum(["Low", "Medium", "High", "Critical", "Unknown"]).or(z.string().min(1)).optional(),
    originatorVaspId: z.string().min(1).max(128).optional(),
    beneficiaryVaspId: z.string().min(1).max(128).optional(),
  }).strict().optional(),
  lifecycle: z.object({
    intentId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/).optional(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/).optional(),
    sequence: z.number().int().nonnegative().optional(),
    createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/).optional(),
    retryOf: z.string().min(1).optional(),
    replacementOf: z.string().min(1).optional(),
    attempt: z.number().int().nonnegative().optional(),
    intentFingerprint: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
  }).strict().optional(),
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

const x402SettlementSchema = z.object({
  auditLogId: z.string().min(1),
  status: z.enum(["submitted", "pending", "confirmed", "failed", "uncertain"]),
  requestFingerprint: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i),
  transactionHash: z.string().min(1).optional(),
  attempt: z.number().int().positive().max(10).optional(),
  facilitatorReference: z.string().max(256).optional(),
  resourceDelivered: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

export function buildServer() {
  const handlers = createToolHandlers(createClient(configFromEnv()));
  const server = new McpServer(
    { name: "magen3-execution-firewall", version: "0.2.0" },
    { instructions: "Before any Web3 execution, call magen3_require_allowed with the complete intent. Allowed permits continuation only to human-controlled wallet approval. Blocked means stop. Review Required means stop and request human review. Inspect deterministic module findings, including Execution Integrity lifecycle/replay, Threat Intelligence, Oracle Validation, Bridge Controls, x402 Payment Controls, and Compliance Controls findings for non-sensitive attestation status, jurisdiction policy, opaque Travel Rule evidence, screening status, and configured exact matches. Never bypass Magen3, expose credentials, access wallet secrets, sign, broadcast, or redeploy contracts." }
  );
  server.registerTool("magen3_verify_agent", { title: "Verify Magen3 Agent", description: "Verify the configured Connected Agent credentials and active policy.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.verifyAgent());
  server.registerTool("magen3_get_intent_schema", { title: "Get Magen3 Intent Schema", description: "Return the intent fields and execution safety boundary.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.getIntentSchema());
  server.registerTool("magen3_check_intent", { title: "Check Web3 Intent", description: "Evaluate an intent and return Allowed, Blocked, or Review Required. This writes an audit decision but does not enforce fail-closed behavior in the client.", inputSchema: intentSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async (intent) => handlers.checkIntent(intent));
  server.registerTool("magen3_report_x402_settlement", { title: "Report x402 Settlement", description: "Reconcile the real facilitator settlement and resource-delivery state for a previously Allowed x402 payment. Never send PAYMENT-SIGNATURE or signed payment payloads.", inputSchema: x402SettlementSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async (update) => handlers.reportX402Settlement(update));
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
