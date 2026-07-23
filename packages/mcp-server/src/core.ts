import { Magen3Client, Magen3Error, type Magen3Intent } from "@magen3/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface Magen3McpConfig {
  gatewayUrl: string;
  agentId: string;
  apiKey: string;
  timeoutMs?: number;
  authMode?: "header" | "bearer";
}

export type ToolTextResult = CallToolResult;

export const INTENT_SCHEMA_DESCRIPTION = {
  executionIntegrity: "For exact-once authorization, include action.lifecycle with a unique intent ID, idempotency key, creation time, expiry, optional sequence, retry/replacement reference, and optional client fingerprint. Magen3 always computes its own canonical fingerprint.",
  threatIntelligence: "Magen3 screens normalized wallet and contract identities against a configured freshness-checked feed. The response may include sanitized threatIntelligenceContext and structured Threat Intelligence findings.",
  oracleValidation: "For priced swaps and DeFi intents, include action.outputAsset plus action.oracle. Magen3 compares the proposed execution price with a configured freshness-checked multi-source oracle feed and returns structured Oracle Validation findings.",
  bridgeControls: "For Bridge actions, include action.bridge. Magen3 validates provider-supplied route metadata, configured providers and chains, destination format, fees, quote freshness, output bounds, and confirmation requirements.",
  complianceControls: "For controlled treasury or enterprise actions, include action.compliance with non-sensitive statuses and opaque references. Never send names, identity documents, biometrics, contact details, or other raw personal data.",
  x402PaymentControls: "For paid HTTP resources, include action.type x402 Payment and action.x402. Magen3 binds the exact resource, merchant, recipient, CAIP-2 network, asset, amount, expiry, PAYMENT-REQUIRED hash, request body where required, request ID, replay state, and settlement state before signing.",
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
  const gatewayUrl = env.MAGEN3_GATEWAY_URL?.trim();
  const agentId = env.MAGEN3_AGENT_ID?.trim();
  const apiKey = env.MAGEN3_AGENT_KEY?.trim();
  const missing = [
    !gatewayUrl && "MAGEN3_GATEWAY_URL",
    !agentId && "MAGEN3_AGENT_ID",
    !apiKey && "MAGEN3_AGENT_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const timeout = Number(env.MAGEN3_TIMEOUT_MS ?? "15000");
  return {
    gatewayUrl: gatewayUrl!,
    agentId: agentId!,
    apiKey: apiKey!,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000,
    authMode: env.MAGEN3_AUTH_MODE === "bearer" ? "bearer" : "header",
  };
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

export function createToolHandlers(client: Pick<Magen3Client, "verifyAgent" | "checkIntent" | "requireAllowed" | "reportX402Settlement">) {
  return {
    async verifyAgent(): Promise<ToolTextResult> {
      try { return text(await client.verifyAgent()); } catch (error) { return text(errorPayload(error), true); }
    },
    async getIntentSchema(): Promise<ToolTextResult> {
      return text({
        ok: true,
        schema: INTENT_SCHEMA_DESCRIPTION,
        decisions: ["Allowed", "Blocked", "Review Required"],
        threatIntelligenceBoundary: "Threat Intelligence uses deterministic exact matches from the operator-configured feed. Stale or unavailable feeds never count as a pass.",
        oracleValidationBoundary: "Oracle Validation compares declared execution prices with the operator-configured feed. It does not certify an oracle provider, guarantee market truth, or replace full stateful execution simulation.",
        bridgeControlsBoundary: "Bridge Controls validates provider-supplied route metadata and configured policy boundaries. It does not certify bridge solvency, destination-chain finality, or message delivery.",
        complianceControlsBoundary: "Compliance Controls accepts non-sensitive statuses and opaque references only. It does not determine legal obligations, certify a provider, or guarantee compliance. Never send raw personal identity data.",
        executionIntegrityBoundary: "Execution Integrity evaluates unsigned intent lifecycle metadata, canonical fingerprints, replay state, and safe retries before signing. Never send wallet secrets or signatures.",
        x402PaymentControlsBoundary: "x402 Payment Controls authorizes payment requirements before signing and reconciles reported settlement afterward. Never send PAYMENT-SIGNATURE, signed payment payloads, private keys, mnemonics, or wallet approvals to Magen3.",
        signingBoundary: "This server evaluates intent only. It never accesses wallet secrets or signs transactions.",
      });
    },
    async checkIntent(intent: Magen3Intent): Promise<ToolTextResult> {
      try {
        const response = await client.checkIntent(intent);
        return text({ ...response, mcpGuidance: response.result.decision === "Allowed" ? "Policy allows continuation, but a human-controlled wallet must still approve signing." : response.result.decision === "Review Required" ? "Stop and request human review." : "Stop. Do not execute or bypass Magen3." });
      } catch (error) { return text(errorPayload(error), true); }
    },
    async reportX402Settlement(update: Parameters<Magen3Client["reportX402Settlement"]>[0]): Promise<ToolTextResult> {
      try { return text(await client.reportX402Settlement(update)); } catch (error) { return text(errorPayload(error), true); }
    },
    async requireAllowed(intent: Magen3Intent): Promise<ToolTextResult> {
      try {
        const response = await client.requireAllowed(intent);
        return text({ ...response, mcpGuidance: "Allowed by Magen3. Do not sign or broadcast without explicit human approval." });
      } catch (error) { return text(errorPayload(error), true); }
    },
  };
}
