import { Magen3Client, Magen3Error, magen3ClientOptionsFromEnv, type Magen3Intent } from "@magen3/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface Magen3McpConfig {
  gatewayUrl: string;
  agentId: string;
  apiKey: string;
  timeoutMs?: number;
  authMode?: "header" | "bearer";
}

export type ToolTextResult = CallToolResult;

export const OFFICIAL_MCP_INTEGRITY = {
  serverId: "magen3-official-mcp",
  serverVersion: "0.5.0",
  manifestHash: "a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c",
  descriptionHash: "f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2",
  origin: "@magen3/mcp-server",
  credentialScope: "agent-gateway",
  tools: {
    magen3_check_intent: {
      schemaHash: "29b728aaa61bced4a3f533d23e52045f1f00d593f995634d83063c44fa0e18f2",
      permissionScopes: ["magen3:intent:check"],
    },
    magen3_require_allowed: {
      schemaHash: "bfce0408d41a7656c7792bbd36d318a41f41cee2ea8bbee8e4c0b81f4a1e5359",
      permissionScopes: ["magen3:intent:require-allowed"],
    },
  },
} as const;

function withOfficialMcpIntegrity(intent: Magen3Intent, toolName: keyof typeof OFFICIAL_MCP_INTEGRITY.tools): Magen3Intent {
  if (intent.action?.toolIntegrity) return intent;
  const tool = OFFICIAL_MCP_INTEGRITY.tools[toolName];
  return {
    ...intent,
    action: {
      ...intent.action,
      toolIntegrity: {
        mcpServerId: OFFICIAL_MCP_INTEGRITY.serverId,
        toolName,
        toolVersion: OFFICIAL_MCP_INTEGRITY.serverVersion,
        manifestHash: OFFICIAL_MCP_INTEGRITY.manifestHash,
        schemaHash: tool.schemaHash,
        descriptionHash: OFFICIAL_MCP_INTEGRITY.descriptionHash,
        permissionScopes: [...tool.permissionScopes],
        credentialScope: OFFICIAL_MCP_INTEGRITY.credentialScope,
        tls: true,
        toolOrigin: OFFICIAL_MCP_INTEGRITY.origin,
      },
    },
  };
}

export const INTENT_SCHEMA_DESCRIPTION = {
  instructionIntegrity: "For sensitive or externally influenced execution, include action.instructionIntegrity with a stable goal ID, original goal hash, source provenance, protected-parameter hashes, confirmation state, and tool permission scopes. Magen3 validates these deterministically; it does not claim to detect every prompt-injection attack.",
  toolMcpIntegrity: "When an MCP or other execution tool is used, include action.toolIntegrity with the approved server ID/URL, tool name/version, manifest/schema/description hashes, TLS state, origin, credential scope, and requested permission scopes. Never send MCP credentials or secret tool output.",
  delegationSafety: "For delegated wallet authority, include action.delegation with a short-lived exact scope and a Casper Wallet attestation. The MCP server can relay caller-supplied public evidence but never creates signatures, holds session-key secrets, or approves its own authority.",
  rpcChainIntegrity: "When authorization depends on chain state, include action.rpcIntegrity with the expected chain identity, selected approved endpoint, and fresh observations from trusted RPC adapters. MCP may relay public provider evidence but never fabricates sync state, block timestamps, provider agreement, or transaction status.",
  gasSponsorshipFeeSafety: "When execution uses a relayer, sponsor, or EVM Paymaster, include action.feeSafety with bounded fee, payer, expiry, scope, and public evidence hashes from a trusted transaction adapter. MCP never creates sponsorships, stores sponsor credentials, or relays raw signatures.",
  emergencyCircuitBreaker: "Magen3 evaluates active scoped pause state before authorization and again before execution confirmation. A Blocked or Review Required pause must never be bypassed. Pause creation and resume are owner-wallet administrative operations exposed through the Magen3 application and REST API, not through the agent MCP execution tool.",
  executionIntegrity: "For exact-once authorization, include action.lifecycle with a unique intent ID, idempotency key, creation time, expiry, optional sequence, retry/replacement reference, and optional client fingerprint. Magen3 always computes its own canonical fingerprint.",
  threatIntelligence: "Magen3 screens normalized wallet and contract identities against a configured freshness-checked feed. The response may include sanitized threatIntelligenceContext and structured Threat Intelligence findings.",
  oracleValidation: "For priced swaps and DeFi intents, include action.outputAsset plus action.oracle. Magen3 compares the proposed execution price with a configured freshness-checked multi-source oracle feed and returns structured Oracle Validation findings.",
  bridgeControls: "For Bridge actions, include action.bridge. Magen3 validates provider-supplied route metadata, configured providers and chains, destination format, fees, quote freshness, output bounds, and confirmation requirements.",
  complianceControls: "For controlled treasury or enterprise actions, include action.compliance with non-sensitive statuses and opaque references. Never send names, identity documents, biometrics, contact details, or other raw personal data.",
  x402PaymentControls: "For paid HTTP resources, include action.type x402 Payment and action.x402. Magen3 binds the exact resource, merchant, recipient, CAIP-2 network, asset, amount, expiry, PAYMENT-REQUIRED hash, request body where required, request ID, replay state, and settlement state before signing.",
  tokenPermissionControls: "For explicit approvals, permits, NFT operator authority, batches, or delegated spender permissions, include action.tokenPermission. Magen3 validates owner, token, spender, amount, ratio, scope, expiry, nonce, fingerprint, replay, and parameter binding before signing.",
  privilegedActionControls: "For supported administrative contract calls, include action.privilegedAction or a recognized entry point. Magen3 deterministically classifies ownership, administrator, upgrade, role, mint, burn, pause, freeze, withdrawal, oracle, fee-recipient, bridge-validator, and permission changes before signing.",
  contractUpgradeSafety: "For proxy or implementation upgrades, include action.contractUpgrade with the current and proposed implementation, optional code hashes, upgrade administrator, network, and any configured execute-after delay. Magen3 binds the exact upgrade to Human Approval before signing.",
  source: "Optional external agent name",
  targetChain: "Target chain, for example casper-testnet",
  executionWalletAddress: "Public execution-wallet address; never a private key",
  walletAddress: "Optional owner wallet address; defaults to executionWalletAddress",
  goal: "Human-readable execution goal",
  reason: "Why the agent wants to perform the action",
  action: {
    type: "Action type, for example Transfer, Swap, Stake, or Contract Call",
    amount: "Optional numeric amount",
    asset: "Optional input or base asset symbol, for example CSPR",
    outputAsset: "Optional output or quote asset symbol, for example USD",
    target: "Destination wallet, contract, validator, or protocol identifier",
    targetType: "Optional target classification. A Trusted Contract label never grants trust without an exact policy match.",
    contractIdentifierType: "Optional explicit Contract Hash or Package Hash semantics for ambiguous raw or hash-prefixed identifiers",
    entryPoint: "Required for direct Contract Interaction/Contract Call actions; optional for high-level actions when not yet resolved",
    contractVersion: "Optional positive package contract version; never use it with a Contract Hash",
    chainName: "Optional Casper chain name, validated against the Gateway configuration",
    oracle: {
      baseAsset: "Base asset priced by the intent",
      quoteAsset: "Quote denomination",
      executionPrice: "Proposed quoteAsset-per-baseAsset execution price",
      quoteTimestamp: "ISO-8601 timestamp for the proposed quote",
    },
    bridge: {
      sourceChain: "Canonical source chain name",
      destinationChain: "Canonical destination chain name",
      provider: "Bridge or route provider name",
      routeId: "Optional provider route identifier",
      destinationAddress: "Destination-chain recipient address",
      asset: "Optional bridged asset symbol",
      feeAmount: "Optional absolute route fee",
      feeBps: "Optional route fee in basis points",
      expectedOutput: "Optional quoted destination output",
      minimumReceived: "Optional minimum accepted destination output",
      quoteTimestamp: "ISO-8601 time when the route was quoted",
      quoteExpiresAt: "ISO-8601 route expiry time",
      sourceConfirmations: "Optional source confirmation requirement",
      destinationConfirmations: "Optional destination confirmation requirement",
    },
    instructionIntegrity: {
      goalId: "Stable identifier for the original human or application goal",
      originalUserGoalHash: "SHA-256 hash of the original goal text or canonical goal object",
      initiatedBy: "Originator category such as user, scheduler, service, or tool",
      intentSource: "Source category such as user, webpage, email, document, tool-output, or scheduler",
      toolName: "Optional tool name",
      toolServer: "Optional MCP or tool-server identifier",
      sourceDomains: "Normalized domains whose content influenced the intent",
      externalContentUsed: "Whether external content contributed to the current parameters",
      userConfirmed: "Whether the user explicitly confirmed the externally derived execution context",
      sourceTrustLevel: "trusted, review, untrusted, unknown, or another documented adapter label",
      parameterChangeReason: "Reason protected parameters changed after the original goal",
      originalParameterHash: "Optional SHA-256 fingerprint of original protected parameters",
      currentParameterHash: "Optional adapter-computed SHA-256 fingerprint; Magen3 independently computes its own",
      originalPermissionScopes: "Permission scopes approved when the goal was established",
      currentPermissionScopes: "Permission scopes requested by the current tool execution",
    },
    toolIntegrity: {
      mcpServerId: "Approved MCP server identifier",
      mcpServerUrl: "Approved HTTPS MCP server URL",
      toolName: "Exact tool name",
      toolVersion: "Exact tool version",
      manifestHash: "SHA-256 server/tool manifest hash",
      schemaHash: "SHA-256 tool input/output schema hash",
      descriptionHash: "SHA-256 human-readable tool-description hash",
      permissionScopes: "Least-privilege scopes requested for this execution",
      credentialScope: "Non-secret credential scope label",
      tls: "Whether the adapter verified TLS",
      toolOrigin: "Approved tool package, publisher, or origin label",
      approvedAt: "Optional ISO-8601 time the adapter approval snapshot was captured",
    },
    delegation: {
      delegationId: "Stable unique delegated-authority identifier",
      delegatingWallet: "Casper public key that signed the authority",
      delegate: "Approved delegate identity",
      sessionKey: "Optional constrained Casper public key",
      allowedNetworks: "Exact network scope",
      allowedContracts: "Exact contract or package scope",
      allowedMethods: "Exact action, method, or entry-point scope",
      allowedAssets: "Exact asset scope",
      nativeAmountLimit: "Optional native-asset ceiling",
      tokenAmountLimits: "Optional per-asset ceilings",
      maxTransactionAmount: "Optional per-request ceiling",
      maxFrequency: "Optional rolling hourly execution count",
      validFrom: "Optional ISO-8601 activation time",
      expiresAt: "Short ISO-8601 expiry",
      revocationStatus: "Active, Revoked, Inactive, or adapter-defined status",
      delegationDepth: "Delegation-chain depth",
      redelegationAllowed: "Whether the signed authority permits redelegation",
      nonce: "Unique public attestation nonce",
      chainName: "Casper chain binding",
      attestationHash: "Optional SHA-256 of the canonical Magen3 attestation",
      attestationSignature: "Transient Casper Wallet message signature supplied by a wallet adapter; MCP never creates it",
    },
    rpcIntegrity: {
      expectedChainName: "Expected canonical chain name",
      expectedNetworkIdentifier: "Expected network identifier",
      expectedGenesisHash: "Optional expected 32-byte genesis or chain fingerprint",
      selectedEndpoint: "Exact RPC endpoint selected for authorization or execution",
      selectedProviderId: "Approved provider identifier",
      providerObservations: "One or more trusted adapter observations containing endpoint identity, chain identity, sync state, latest block height and timestamp, timeout or rate-limit state, speculative flag, and optional transaction or contract-state hashes",
      automaticFailoverUsed: "Whether an approved automatic provider failover occurred",
      failoverFrom: "Failed or replaced provider identifier or endpoint",
      failoverReason: "Deterministic reason for the failover",
    },
    feeSafety: {
      chainFamily: "Casper, EVM, or another explicitly isolated family",
      chainName: "Exact target network",
      estimatedGas: "Optional trusted gas estimate",
      gasLimit: "Optional constructed gas limit",
      gasPrice: "EVM-only gas-price evidence",
      priorityFee: "EVM-only priority-fee evidence",
      maximumFee: "Maximum fee encoded by the transaction",
      networkFee: "Normalized fee amount in the declared unit",
      unit: "Fee unit such as CSPR, motes, wei, gwei, or native",
      sponsor: "Approved sponsor or relayer identifier",
      paymaster: "EVM-only approved Paymaster identifier",
      sponsorshipId: "Bounded sponsorship identifier",
      sponsorshipExpiry: "ISO-8601 sponsorship expiry",
      sponsorshipScopes: "Exact action scopes",
      sponsorSignatureHash: "SHA-256 evidence hash only; never the raw signature",
      expectedPayer: "Payer expected by policy and approval",
      actualPayer: "Payer encoded by the constructed transaction",
      sponsored: "Whether sponsor or Paymaster authority is used",
      sponsorshipAvailable: "Whether the adapter could verify sponsorship availability",
    },
    tokenPermission: {
      permissionType: "Explicit supported authority classification; omit tokenPermission for generic contract calls",
      owner: "Public wallet or account identifier that owns the authority",
      tokenContract: "Exact token contract identifier on the intended network",
      tokenStandard: "Optional token standard such as CEP-18 or ERC-20",
      spender: "Exact spender, operator, router, vault, or delegate receiving authority",
      approvalAmount: "Optional bounded authority amount",
      intendedTransactionAmount: "Optional amount needed by the intended transaction for ratio checks",
      unlimited: "Whether the authority is unlimited",
      nonce: "Permit or delegated-authority nonce",
      permitId: "Stable permit or authorization reference",
      deadline: "ISO-8601 or Unix expiration",
      reusable: "Whether authority can be reused after one intended execution",
      chainId: "Optional exact chain identifier",
      network: "Canonical network name",
      approvedProtocol: "Optional protocol label; exact spender policy still applies",
      operatorForAll: "Whether NFT operator-for-all authority is requested",
      batchItems: "Optional bounded token/spender/amount/tokenId entries",
      allowanceResetExpected: "Whether the integration will reset allowance after use",
    },
    privilegedAction: {
      classifiedAction: "Explicit supported classification; may be omitted only when entryPoint or methodSignature maps deterministically",
      contract: "Exact contract identifier",
      package: "Optional package identifier",
      entryPoint: "Contract entry point",
      methodSignature: "Optional method signature",
      currentValue: "Sanitized current protected value",
      requestedValue: "Exact requested protected value bound to approval",
      role: "Optional role for role or permission changes",
      recipient: "Proposed administrator, owner, recipient, oracle, validator, or role holder",
      implementation: "Proposed implementation for upgrade actions",
      classifierSource: "Deterministic adapter or Magen3 classifier source",
      classifierVersion: "Classifier version",
      network: "Exact transaction network",
    },
    contractUpgrade: {
      contract: "Exact contract identifier",
      package: "Optional contract package identifier",
      currentImplementation: "Current implementation read from trusted chain state",
      requestedImplementation: "Exact proposed implementation bound to approval",
      currentCodeHash: "Optional current implementation code hash",
      requestedCodeHash: "Optional proposed implementation code hash",
      packageVersion: "Optional proposed package version",
      upgradeAdministrator: "Authorized public upgrade administrator identity",
      requestedAt: "Optional ISO-8601 upgrade request time",
      executeAfter: "Optional ISO-8601 earliest execution time required by the policy delay",
      network: "Exact target network",
    },
    x402: {
      version: "x402 protocol version; the current foundation supports v2",
      scheme: "Payment scheme; exact is supported first",
      resourceUrl: "Absolute paid-resource URL",
      method: "HTTP method used for the paid request",
      merchantDomain: "Merchant hostname bound to resourceUrl",
      payTo: "Payment recipient from PAYMENT-REQUIRED",
      asset: "Payment token symbol or configured asset identifier",
      network: "CAIP-2 payment network such as eip155:84532",
      facilitator: "Facilitator label or URL evaluated by policy",
      amountAtomic: "Positive integer amount in token atomic units",
      validUntil: "Optional explicit ISO-8601 or Unix expiration",
      maxTimeoutSeconds: "x402 v2 timeout from the selected PaymentRequirements",
      requirementsReceivedAt: "ISO-8601 time PAYMENT-REQUIRED was received; required when using maxTimeoutSeconds",
      requestId: "Unique request identifier or nonce",
      paymentRequiredHash: "SHA-256 hash of the decoded PAYMENT-REQUIRED object",
      requestBodyHash: "SHA-256 hash of unsafe-method request body when required",
      requestFingerprint: "Optional client fingerprint; Magen3 computes its own canonical fingerprint",
      settlementStatus: "not_submitted, submitted, pending, confirmed, failed, or uncertain",
      settlementAttempt: "Current settlement attempt number",
    },
    compliance: {
      originatorJurisdiction: "Optional two-letter jurisdiction code",
      beneficiaryJurisdiction: "Optional two-letter jurisdiction code",
      counterpartyType: "VASP, Self-hosted Wallet, Organization, Individual, or Unknown",
      originatorAttestation: "Non-sensitive verification status, provider, opaque reference, issuedAt, and expiresAt",
      beneficiaryAttestation: "Non-sensitive verification status, provider, opaque reference, issuedAt, and expiresAt",
      travelRule: "Status plus opaque evidence reference and optional data hash; never raw originator or beneficiary details",
      screening: "Clear, Match, Review, Unavailable, or Not Provided with provider, opaque reference, and screenedAt",
      riskRating: "Low, Medium, High, Critical, or Unknown",
      originatorVaspId: "Optional opaque VASP identifier",
      beneficiaryVaspId: "Optional opaque VASP identifier",
    },
    lifecycle: {
      intentId: "Unique 8-128 character identifier for one business intent",
      idempotencyKey: "Stable retry key that must not be reused after protected parameters change",
      sequence: "Optional monotonically increasing agent sequence",
      createdAt: "ISO-8601 creation time",
      expiresAt: "ISO-8601 authorization expiry",
      retryOf: "Prior Magen3 audit ID for an explicit retry",
      replacementOf: "Prior Magen3 audit ID for a deliberate replacement",
      attempt: "Zero for the first attempt; increment only with retryOf or replacementOf",
      intentFingerprint: "Optional SHA-256 canonical fingerprint; Magen3 independently computes and verifies its own",
    },
    preflight: {
      paymentAmountMotes: "Optional positive integer string for the proposed payment budget",
      gasPriceTolerance: "Optional positive integer gas-price tolerance",
      ttl: "Optional positive duration such as 30m or 1h",
      timestamp: "Optional ISO-8601 transaction timestamp",
      slippageBps: "Optional swap slippage in basis points; structure only, not a policy maximum",
      expectedOutput: "Optional quoted swap output",
      minimumReceived: "Optional minimum swap output; must not exceed expectedOutput",
      runtimeArgs: "Optional runtime-argument object without signing material",
      transactionHash: "Optional 64-character transaction hash after construction",
    },
  },
} as const;

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Magen3McpConfig {
  return magen3ClientOptionsFromEnv(env);
}

export function createClient(config: Magen3McpConfig): Magen3Client {
  return new Magen3Client(config);
}

function text(value: unknown, isError = false): ToolTextResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

function errorPayload(error: unknown) {
  if (error instanceof Magen3Error) {
    return { ok: false, error: error.message, status: error.status, details: error.body };
  }
  return { ok: false, error: error instanceof Error ? error.message : "Unknown Magen3 MCP error" };
}

export function createToolHandlers(client: Pick<Magen3Client, "verifyAgent" | "checkIntent" | "requireAllowed" | "getApproval" | "reportX402Settlement" | "reportExecutionReconciliation" | "pollExecutionReconciliation">) {
  return {
    async verifyAgent(): Promise<ToolTextResult> {
      try { return text(await client.verifyAgent()); } catch (error) { return text(errorPayload(error), true); }
    },
    async getIntentSchema(): Promise<ToolTextResult> {
      return text({
        ok: true,
        schema: INTENT_SCHEMA_DESCRIPTION,
        decisions: ["Allowed", "Blocked", "Review Required"],
        instructionIntegrityBoundary: "Instruction Integrity verifies adapter-supplied provenance, stable goal binding, source-domain policy, protected-parameter fingerprints, user confirmation, and tool-scope containment. It does not read private prompts, authorize external content, or claim to detect every prompt-injection attack.",
        delegationBoundary: "Delegation & Session Key Safety verifies a caller-supplied Casper Wallet attestation and exact bounded authority. The MCP server never generates delegation signatures, receives private session keys, or expands its own permission scope.",
        rpcChainIntegrityBoundary: "RPC & Chain Integrity verifies adapter-supplied provider identity, expected network binding, TLS, synchronization, block freshness, quorum agreement, transaction or contract-state consistency, and auditable failover. MCP never fabricates provider observations, certifies an RPC operator, or treats unavailable evidence as a pass.",
        gasSponsorshipFeeSafetyBoundary: "Gas Sponsorship & Fee Safety verifies bounded fee, approved sponsor or Paymaster, expiry, scope, payer, budgets, operation counts, and public evidence hashes. MCP never creates sponsorships, receives sponsor credentials, or relays raw sponsor signatures.",
        toolMcpIntegrityBoundary: "Tool & MCP Integrity verifies the exact approved server/tool identity, version, hashes, TLS, origin, credential scope, requested permissions, and agent capability boundary. MCP must never send server credentials, private keys, wallet signatures, or secret tool output to Magen3.",
        threatIntelligenceBoundary: "Threat Intelligence uses deterministic exact matches from the operator-configured feed. Stale or unavailable feeds never count as a pass.",
        oracleValidationBoundary: "Oracle Validation compares declared execution prices with the operator-configured feed. It does not certify an oracle provider, guarantee market truth, or replace full stateful execution simulation.",
        bridgeControlsBoundary: "Bridge Controls validates provider-supplied route metadata and configured policy boundaries. It does not certify bridge solvency, destination-chain finality, or message delivery.",
        complianceControlsBoundary: "Compliance Controls accepts non-sensitive statuses and opaque references only. It does not determine legal obligations, certify a provider, or guarantee compliance. Never send raw personal identity data.",
        executionIntegrityBoundary: "Execution Integrity evaluates unsigned intent lifecycle metadata, canonical fingerprints, replay state, and safe retries before signing. Never send wallet secrets or signatures.",
        approvalWorkflowBoundary: "Review Required can create an exact-intent approval request. Agents may poll its status, but only authorized reviewers respond through the Magen3 application. Signature-enabled policies require one-time Casper Wallet message signatures; MCP never receives or submits those signatures. Approval does not sign or broadcast the transaction.",
        organizationalApprovalBoundary: "Approval tiers, named role groups, backup escalation, total quorum, execution delays, and signing windows are resolved deterministically by Magen3. MCP may report this state but cannot join an approver group, accelerate escalation, shorten a delay, extend a window, or submit a human approval response.",
        x402PaymentControlsBoundary: "x402 Payment Controls authorizes payment requirements before signing and reconciles reported settlement afterward. Never send PAYMENT-SIGNATURE, signed payment payloads, private keys, mnemonics, or wallet approvals to Magen3.",
        executionReconciliationBoundary: "Execution & Settlement Reconciliation accepts authenticated public transaction-state evidence after authorization, enforces monotonic state transitions, blocks unsafe retries, links replacements, and records finality, delivery, refund, and failure state. Optional polling uses only backend-configured RPC endpoints; MCP cannot supply provider URLs. MCP never sends raw signed transactions, wallet signatures, private keys, mnemonics, or sponsor credentials.",
        tokenPermissionControlsBoundary: "Token Permission Controls evaluate explicit unsigned authority metadata only. Never send permit signatures, wallet signatures, raw signed approvals, private keys, mnemonics, or wallet secrets to Magen3.",
      emergencyCircuitBreakerBoundary: "An active Emergency Circuit Breaker pause overrides ordinary authorization. Stop on Blocked or Review Required, surface the exact pause evidence, and never attempt retries or alternate tools to bypass it.",
      privilegedActionControlsBoundary: "Privileged Action Controls classify supported unsigned administrative intent metadata and bind protected parameters to policy and Human Approval. Never send administrator private keys, signatures, raw signed transactions, mnemonics, or wallet secrets.",
      contractUpgradeSafetyBoundary: "Contract Upgrade Safety evaluates unsigned current/proposed implementation metadata, code hashes, administrator evidence, delays, and exact approval binding. Never send upgrade signatures, private keys, or raw signed transactions.",
      contractArgumentPoliciesBoundary: "Contract Argument Policies evaluate public unsigned runtimeArgs against exact contract and entry-point rules. Never send private keys, signatures, wallet approvals, raw signed transactions, or secret application data in runtimeArgs.",
        signingBoundary: "This server evaluates intent only. It never accesses wallet secrets or signs transactions.",
      });
    },
    async checkIntent(intent: Magen3Intent): Promise<ToolTextResult> {
      try {
        const response = await client.checkIntent(withOfficialMcpIntegrity(intent, "magen3_check_intent"));
        return text({ ...response, mcpGuidance: response.result.decision === "Allowed" ? "Policy allows continuation, but a human-controlled wallet must still approve signing." : response.result.decision === "Review Required" ? "Stop and request human review." : "Stop. Do not execute or bypass Magen3." });
      } catch (error) { return text(errorPayload(error), true); }
    },
    async getApproval(input: { approvalOrAuditId: string }): Promise<ToolTextResult> {
      try {
        const response = await client.getApproval(input.approvalOrAuditId);
        const approval = response.approval;
        const remainingGroups = Array.isArray(approval.groupProgress)
          ? approval.groupProgress.filter((group) => !group.satisfied).map((group) => `${group.groupName || group.groupId}: ${group.remaining} remaining`)
          : [];
        const guidance = approval.mayProceedToSigning
          ? approval.signatureRequired
            ? "The exact-bound request has completed its cryptographically verified organizational quorum and is inside its execution window. It may continue to human-controlled wallet signing."
            : "The exact-bound request has completed its organizational approval workflow and is inside its execution window. It may continue to human-controlled wallet signing."
          : approval.reviewStatus === "Approved" && approval.executionWindowStatus === "delay"
            ? `Approval quorum is complete, but execution remains locked for ${Number(approval.executionDelayRemainingSeconds || 0)} more second${Number(approval.executionDelayRemainingSeconds || 0) === 1 ? "" : "s"}. Do not sign early.`
            : approval.reviewStatus === "Approved" && approval.executionWindowStatus === "expired"
              ? "Approval quorum completed, but the bound execution window has expired. Do not sign or retry under this approval; create a fresh intent and approval request."
              : approval.reviewStatus === "Pending"
                ? remainingGroups.length > 0
                  ? `Approval is pending required organizational roles (${remainingGroups.join("; ")}). Do not sign or execute the intent.`
                  : "Approval is still pending. Do not sign or execute the intent."
                : `Approval is ${String(approval.reviewStatus).toLowerCase()}. Do not sign or execute the intent.`;
        return text({ ...response, mcpGuidance: guidance });
      } catch (error) { return text(errorPayload(error), true); }
    },
    async reportX402Settlement(update: Parameters<Magen3Client["reportX402Settlement"]>[0]): Promise<ToolTextResult> {
      try { return text(await client.reportX402Settlement(update)); } catch (error) { return text(errorPayload(error), true); }
    },
    async reportExecutionReconciliation(update: Parameters<Magen3Client["reportExecutionReconciliation"]>[0]): Promise<ToolTextResult> {
      try { return text(await client.reportExecutionReconciliation(update)); } catch (error) { return text(errorPayload(error), true); }
    },
    async pollExecutionReconciliation(options: Parameters<Magen3Client["pollExecutionReconciliation"]>[0]): Promise<ToolTextResult> {
      try { return text(await client.pollExecutionReconciliation(options)); } catch (error) { return text(errorPayload(error), true); }
    },
    async requireAllowed(intent: Magen3Intent): Promise<ToolTextResult> {
      try {
        const response = await client.requireAllowed(withOfficialMcpIntegrity(intent, "magen3_require_allowed"));
        return text({ ...response, mcpGuidance: "Allowed by Magen3. Do not sign or broadcast without explicit human approval." });
      } catch (error) { return text(errorPayload(error), true); }
    },
  };
}
