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

const protectedParametersSchema = z.object({
  actionType: z.string(),
  amount: z.number().finite(),
  asset: z.string(),
  outputAsset: z.string(),
  target: z.string(),
  targetType: z.string(),
  entryPoint: z.string(),
  chainName: z.string(),
  destination: z.string(),
  contract: z.string(),
  runtimeArgs: z.record(z.string(), z.unknown()).nullable(),
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
  instructionIntegrity: z.object({
    goalId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/).optional(),
    originalUserGoalHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    initiatedBy: z.string().min(1).max(128).optional(),
    intentSource: z.string().min(1).max(128).optional(),
    toolName: z.string().min(1).max(128).optional(),
    toolServer: z.string().min(1).max(256).optional(),
    sourceDomains: z.array(z.string().min(1).max(253)).max(32).optional(),
    externalContentUsed: z.boolean().optional(),
    userConfirmed: z.boolean().optional(),
    sourceTrustLevel: z.string().min(1).max(64).optional(),
    parameterChangeReason: z.string().min(1).max(500).optional(),
    originalParameterHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    currentParameterHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    originalProtectedParameters: protectedParametersSchema.optional(),
    originalPermissionScopes: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/)).max(64).optional(),
    currentPermissionScopes: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/)).max(64).optional(),
  }).strict().optional(),
  toolIntegrity: z.object({
    mcpServerId: z.string().min(1).max(256).optional(),
    mcpServerUrl: z.string().url().optional(),
    toolName: z.string().min(1).max(256),
    toolVersion: z.string().min(1).max(128).optional(),
    manifestHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    schemaHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    descriptionHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    permissionScopes: z.array(z.string().min(1).max(256)).max(100).optional(),
    credentialScope: z.string().min(1).max(256).optional(),
    tls: z.boolean().optional(),
    toolOrigin: z.string().min(1).max(256).optional(),
    approvedAt: z.string().datetime().optional(),
  }).strict().refine((value) => Boolean(value.mcpServerId || value.mcpServerUrl), { message: "mcpServerId or mcpServerUrl is required" }).optional(),
  delegation: z.object({
    delegationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/),
    delegatingWallet: z.string().regex(/^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i),
    delegate: z.string().min(1).max(256),
    sessionKey: z.string().regex(/^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i).optional(),
    allowedNetworks: z.array(z.string().min(1).max(128)).max(50).optional(),
    allowedContracts: z.array(z.string().min(1).max(256)).max(100).optional(),
    allowedMethods: z.array(z.string().min(1).max(128)).max(100).optional(),
    allowedAssets: z.array(z.string().min(1).max(128)).max(100).optional(),
    nativeAmountLimit: z.number().finite().nonnegative().optional(),
    tokenAmountLimits: z.record(z.string(), z.number().finite().nonnegative()).optional(),
    maxTransactionAmount: z.number().finite().nonnegative().optional(),
    maxFrequency: z.number().int().positive().optional(),
    validFrom: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    revocationStatus: z.string().min(1).max(64).optional(),
    delegationDepth: z.number().int().nonnegative().optional(),
    redelegationAllowed: z.boolean().optional(),
    nonce: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/),
    chainName: z.string().min(1).max(128).optional(),
    attestationHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    attestationSignature: z.string().regex(/^(?:0x)?[0-9a-f]{128,260}$/i).optional(),
  }).strict().optional(),
  feeSafety: z.object({
    chainFamily: z.enum(["Casper", "EVM", "Other"]).or(z.string().min(1).max(64)).optional(),
    chainName: z.string().min(1).max(128).optional(),
    estimatedGas: z.number().finite().nonnegative().optional(),
    gasLimit: z.number().finite().nonnegative().optional(),
    gasPrice: z.number().finite().nonnegative().optional(),
    priorityFee: z.number().finite().nonnegative().optional(),
    maximumFee: z.number().finite().nonnegative().optional(),
    networkFee: z.number().finite().nonnegative().optional(),
    unit: z.string().min(1).max(64).optional(),
    sponsor: z.string().min(1).max(256).optional(),
    paymaster: z.string().min(1).max(256).optional(),
    sponsorshipId: z.string().min(1).max(256).optional(),
    sponsorshipExpiry: z.string().datetime().optional(),
    sponsorshipScopes: z.array(z.string().min(1).max(128)).max(100).optional(),
    sponsorSignatureHash: z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i).optional(),
    expectedPayer: z.string().min(1).max(256).optional(),
    actualPayer: z.string().min(1).max(256).optional(),
    sponsored: z.boolean().optional(),
    sponsorshipAvailable: z.boolean().optional(),
  }).strict().optional(),
  tokenPermission: z.object({
    permissionType: z.enum([
      "Fungible Token Approval", "Allowance Increase", "Allowance Decrease", "Allowance Reset",
      "Permit Authorization", "NFT Operator Approval", "Batch Approval", "Delegated Spender Permission",
    ]).or(z.string().min(1)),
    owner: z.string().min(1),
    tokenContract: z.string().min(1),
    tokenStandard: z.string().min(1).max(64).optional(),
    spender: z.string().min(1),
    approvalAmount: z.number().finite().nonnegative().optional(),
    intendedTransactionAmount: z.number().finite().nonnegative().optional(),
    unlimited: z.boolean().optional(),
    nonce: z.string().min(1).max(128).optional(),
    permitId: z.string().min(1).max(128).optional(),
    deadline: z.union([z.string().min(1), z.number().positive()]).optional(),
    reusable: z.boolean().optional(),
    chainId: z.string().min(1).max(128).optional(),
    network: z.string().min(1).max(128).optional(),
    approvedProtocol: z.string().min(1).max(128).optional(),
    operatorForAll: z.boolean().optional(),
    batchItems: z.array(z.object({
      tokenContract: z.string().min(1).optional(),
      spender: z.string().min(1).optional(),
      amount: z.number().finite().positive().optional(),
      tokenId: z.string().min(1).max(128).optional(),
    }).strict()).max(100).optional(),
    allowanceResetExpected: z.boolean().optional(),
  }).strict().optional(),
  privilegedAction: z.object({
    classifiedAction: z.enum([
      "Ownership Transfer", "Administrator Change", "Proxy Upgrade", "Implementation Change",
      "Role Grant", "Role Revoke", "Mint", "Burn", "Pause", "Unpause", "Freeze",
      "Emergency Withdrawal", "Treasury Withdrawal", "Oracle Replacement", "Fee Recipient Change",
      "Bridge Validator Change", "Permission Change",
    ]).or(z.string().min(1)).optional(),
    contract: z.string().min(1).optional(),
    package: z.string().min(1).optional(),
    entryPoint: z.string().min(1).max(128).optional(),
    methodSignature: z.string().min(1).max(256).optional(),
    currentValue: z.unknown().optional(),
    requestedValue: z.unknown().optional(),
    role: z.string().min(1).max(128).optional(),
    recipient: z.string().min(1).optional(),
    implementation: z.string().min(1).optional(),
    classifierSource: z.string().min(1).max(128).optional(),
    classifierVersion: z.string().min(1).max(64).optional(),
    network: z.string().min(1).max(128).optional(),
  }).strict().optional(),
  contractUpgrade: z.object({
    contract: z.string().min(1).optional(),
    package: z.string().min(1).optional(),
    currentImplementation: z.string().min(1),
    requestedImplementation: z.string().min(1),
    currentCodeHash: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/).optional(),
    requestedCodeHash: z.string().regex(/^(?:0x)?[0-9a-fA-F]{64}$/).optional(),
    packageVersion: z.string().min(1).max(128).optional(),
    upgradeAdministrator: z.string().min(1).optional(),
    requestedAt: z.string().datetime().optional(),
    executeAfter: z.string().datetime().optional(),
    network: z.string().min(1).max(128).optional(),
  }).strict().optional(),
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

const approvalStatusSchema = z.object({
  approvalOrAuditId: z.string().min(1),
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

const executionReconciliationSchema = z.object({
  auditLogId: z.string().min(1),
  status: z.enum(["submitted", "pending", "confirmed", "failed", "uncertain", "replaced", "refunded", "delivered"]),
  transactionHash: z.string().min(1).max(256).optional(),
  replacementTransactionHash: z.string().min(1).max(256).optional(),
  replacementAuditLogId: z.string().min(1).max(128).optional(),
  refundTransactionHash: z.string().min(1).max(256).optional(),
  attempt: z.number().int().positive().max(100).optional(),
  confirmations: z.number().int().nonnegative().max(1000000).optional(),
  finalized: z.boolean().optional(),
  blockHeight: z.number().int().nonnegative().optional(),
  observedAt: z.string().datetime().optional(),
  provider: z.string().min(1).max(128).optional(),
  providerReference: z.string().min(1).max(256).optional(),
  resourceDelivered: z.boolean().optional(),
  deliveryReference: z.string().min(1).max(256).optional(),
  failureReason: z.string().min(1).max(500).optional(),
  chainName: z.string().min(1).max(128).optional(),
  note: z.string().max(500).optional(),
}).strict();

const executionReconciliationPollSchema = z.object({
  auditLogId: z.string().min(1),
  transactionHash: z.string().min(1).max(256).optional(),
  chainFamily: z.enum(["casper", "evm"]).optional(),
  chainName: z.string().min(1).max(128).optional(),
  note: z.string().max(500).optional(),
}).strict();

export function buildServer() {
  const handlers = createToolHandlers(createClient(configFromEnv()));
  const server = new McpServer(
    { name: "magen3-execution-firewall", version: "0.5.1" },
    { instructions: "Before any Web3 execution, call magen3_require_allowed with the complete intent. Proceed only when the response is Allowed and executionApproved is true. Blocked means stop and show agentMessage. Review Required means stop and inspect reviewResolution: when humanActionRequired is false, follow the deterministic remediation and resubmit the same bound goal; when true, surface the exact-bound approval request and poll magen3_get_approval. Never bypass Magen3, expose credentials, access wallet secrets, sign, broadcast, or redeploy contracts." }
  );
  server.registerTool("magen3_verify_agent", { title: "Verify Magen3 Agent", description: "Verify the configured Connected Agent credentials and active policy.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.verifyAgent());
  server.registerTool("magen3_get_intent_schema", { title: "Get Magen3 Intent Schema", description: "Return the intent fields and execution safety boundary.", inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async () => handlers.getIntentSchema());
  server.registerTool("magen3_check_intent", { title: "Check Web3 Intent", description: "Evaluate an intent and return Allowed, Blocked, or Review Required. This writes an audit decision but does not enforce fail-closed behavior in the client.", inputSchema: intentSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } }, async (intent) => handlers.checkIntent(intent));
  server.registerTool("magen3_get_approval", { title: "Get Escalated Approval Status", description: "Poll an exact-bound approval workflow only when reviewResolution.humanActionRequired is true. Approval permits the authorized execution layer to continue only while the bound parameters and execution window remain valid.", inputSchema: approvalStatusSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } }, async (input) => handlers.getApproval(input));
  server.registerTool("magen3_report_x402_settlement", { title: "Report x402 Settlement", description: "Reconcile the real facilitator settlement and resource-delivery state for a previously Allowed x402 payment. Never send PAYMENT-SIGNATURE or signed payment payloads.", inputSchema: x402SettlementSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async (update) => handlers.reportX402Settlement(update));
  server.registerTool("magen3_report_execution_reconciliation", { title: "Report Execution Reconciliation", description: "Report authenticated public execution state after authorization. Enforces transaction binding, retry limits, replacement links, confirmation/finality, delivery, refund, and monotonic transitions. Never send signed transactions or wallet secrets.", inputSchema: executionReconciliationSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async (update) => handlers.reportExecutionReconciliation(update));
  server.registerTool("magen3_poll_execution_reconciliation", { title: "Poll Execution Reconciliation", description: "Poll a bound transaction through a backend-configured Casper or EVM RPC adapter and apply the observation through the same reconciliation state machine. Provider URLs cannot be supplied by MCP clients.", inputSchema: executionReconciliationPollSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } }, async (options) => handlers.pollExecutionReconciliation(options));
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
