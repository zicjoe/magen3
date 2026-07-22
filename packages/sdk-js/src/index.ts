export type Magen3Decision = "Allowed" | "Blocked" | "Review Required";
export type Magen3Risk = "Low" | "Medium" | "High" | "Critical";

export interface Magen3ExecutionPreflight {
  /** Positive integer string in motes for the proposed payment budget. */
  paymentAmountMotes?: string;
  /** Positive integer gas-price tolerance used during Casper 2.x transaction construction. */
  gasPriceTolerance?: number;
  /** Positive duration such as 30m, 1h, or milliseconds. */
  ttl?: string;
  /** ISO-8601 transaction timestamp. */
  timestamp?: string;
  /** Optional swap slippage in basis points. Structure is validated; policy maximum remains Preview. */
  slippageBps?: number;
  /** Optional quoted output for swap consistency checks. */
  expectedOutput?: number;
  /** Optional minimum received amount; must not exceed expectedOutput. */
  minimumReceived?: number;
  /** Runtime-argument summary. Never include signing material or private data. */
  runtimeArgs?: Record<string, unknown>;
  /** Optional 64-character transaction hash after construction. */
  transactionHash?: string;
}


export interface Magen3BridgeRoute {
  sourceChain: string;
  destinationChain: string;
  provider: string;
  routeId?: string;
  destinationAddress: string;
  asset?: string;
  feeAmount?: number;
  feeBps?: number;
  expectedOutput?: number;
  minimumReceived?: number;
  quoteTimestamp?: string;
  quoteExpiresAt?: string;
  sourceConfirmations?: number;
  destinationConfirmations?: number;
}

export interface Magen3OracleQuote {
  /** Asset sold or priced by the proposed action. */
  baseAsset: string;
  /** Asset used as the quote denomination. */
  quoteAsset: string;
  /** Proposed execution price expressed as quoteAsset per baseAsset. */
  executionPrice: number;
  /** ISO-8601 timestamp for the proposed execution quote. */
  quoteTimestamp?: string;
}

export interface Magen3Action {
  type: string;
  amount?: number;
  asset?: string;
  /** Optional output or quote asset for price-sensitive actions. */
  outputAsset?: string;
  target: string;
  targetType?: string;
  /** Explicit Casper identifier semantics for ambiguous raw/hash-prefixed values. */
  contractIdentifierType?: "Contract Hash" | "Package Hash" | string;
  /** Contract entry point required for direct Contract Interaction/Contract Call actions. */
  entryPoint?: string;
  /** Optional package contract version. Must not be used with a Contract Hash. */
  contractVersion?: number;
  /** Optional Casper chain name. The Gateway validates it against its configured network. */
  chainName?: string;
  /** Optional provider-agnostic price context evaluated against the configured Oracle Validation feed. */
  oracle?: Magen3OracleQuote;
  /** Provider-supplied cross-chain route metadata evaluated by Bridge Controls before signing. */
  bridge?: Magen3BridgeRoute;
  /** Optional deterministic transaction-construction metadata evaluated before wallet signing. */
  preflight?: Magen3ExecutionPreflight;
}

export interface Magen3Intent {
  source?: string;
  targetChain?: string;
  walletAddress?: string;
  executionWalletAddress: string;
  goal?: string;
  reason?: string;
  action: Magen3Action;
}

export interface Magen3Identity {
  ok?: boolean;
  agent?: Record<string, unknown>;
  policy?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export type Magen3FindingStatus = "pass" | "warning" | "fail" | "unavailable" | "skipped";
export type Magen3FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Magen3ModuleFinding {
  module: string;
  status: Magen3FindingStatus;
  severity: Magen3FindingSeverity;
  rule: string;
  message: string;
  evidence?: Record<string, unknown>;
  remediation?: string;
}

export interface Magen3PipelineStage {
  id: string;
  label: string;
  status: string;
  timestamp?: string;
  detail?: string;
}

export interface Magen3ThreatIntelligenceMatch {
  entityRole?: string;
  kind?: string;
  indicatorId?: string;
  severity?: Magen3FindingSeverity;
  confidence?: number;
  categories?: string[];
  source?: string;
}

export interface Magen3ThreatIntelligenceContext {
  status: "available" | "stale" | "unavailable" | string;
  sourceType?: "inline" | "file" | "remote" | "none" | string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  indicatorCount?: number;
  activeIndicatorCount?: number;
  ageMs?: number | null;
  maxAgeMs?: number | null;
  error?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  minConfidence?: number;
  checkedEntities?: Array<{ role?: string; kind?: string; canonical?: string }>;
  matchedIndicators?: Magen3ThreatIntelligenceMatch[];
}


export interface Magen3OracleValidationContext {
  status: "available" | "stale" | "unavailable" | string;
  sourceType?: "inline" | "file" | "remote" | "none" | string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  observationCount?: number;
  pairCount?: number;
  error?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  maxAgeSeconds?: number;
  maxDeviationBps?: number;
  maxSourceSpreadBps?: number;
  minConfidence?: number;
  minSources?: number;
  requestedPair?: string;
  executionPrice?: number | null;
  referencePrice?: number | null;
  deviationBps?: number | null;
  sourceSpreadBps?: number | null;
  sourceCount?: number;
  confidence?: number | null;
  quoteTimestamp?: string;
}

export interface Magen3BridgeControlsContext {
  status?: string;
  mode?: "Observe" | "Review" | "Enforce" | string;
  unavailableAction?: "Warn" | "Review" | "Block" | string;
  provider?: string;
  sourceChain?: string;
  destinationChain?: string;
  routeId?: string;
  asset?: string;
  amount?: number;
  destinationAddress?: string;
  destinationAddressFamily?: string;
  destinationAddressValid?: boolean;
  feeBps?: number | null;
  maxFeeBps?: number;
  quotedOutput?: number | null;
  minimumReceived?: number | null;
  quoteTimestamp?: string;
  quoteExpiresAt?: string;
  sourceConfirmations?: number;
  destinationConfirmations?: number;
}

export interface Magen3DecisionResult {
  decision: Magen3Decision;
  risk: Magen3Risk;
  riskScore: number;
  reason: string;
  recommendedAction: string;
  policyChecksPassed?: string[];
  policyChecksFailed?: string[];
  primaryReason?: string;
  triggeredRule?: string;
  suggestedResolution?: string;
  moduleFindings?: Magen3ModuleFinding[];
  pipelineStages?: Magen3PipelineStage[];
  /** Sanitized feed status and exact-match evidence. Never includes provider credentials. */
  threatIntelligenceContext?: Magen3ThreatIntelligenceContext;
  /** Sanitized oracle-feed state and deterministic price-integrity evidence. */
  oracleValidationContext?: Magen3OracleValidationContext;
  /** Deterministic route, chain, address, fee, freshness, and confirmation evidence. */
  bridgeControlsContext?: Magen3BridgeControlsContext;
}

export interface Magen3IntentResponse {
  ok: boolean;
  executionApproved: boolean;
  result: Magen3DecisionResult;
  gatewayRequest: Record<string, unknown>;
  auditLog: Record<string, unknown>;
  casperPayload?: Record<string, unknown>;
  nextAction: string;
}

export interface Magen3ClientOptions {
  gatewayUrl: string;
  agentId: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  authMode?: "header" | "bearer";
}

export class Magen3Error extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status = 0, body?: unknown) {
    super(message);
    this.name = "Magen3Error";
    this.status = status;
    this.body = body;
  }
}

export class Magen3Client {
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly authMode: "header" | "bearer";

  constructor(options: Magen3ClientOptions) {
    if (!options.gatewayUrl?.trim()) throw new TypeError("gatewayUrl is required");
    if (!options.agentId?.trim()) throw new TypeError("agentId is required");
    if (!options.apiKey?.trim()) throw new TypeError("apiKey is required");
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new TypeError("A Fetch API implementation is required");
    const gatewayUrl = options.gatewayUrl.trim();
    let baseUrlEnd = gatewayUrl.length;
    while (baseUrlEnd > 0 && gatewayUrl.charCodeAt(baseUrlEnd - 1) === 47) {
      baseUrlEnd -= 1;
    }
    this.baseUrl = gatewayUrl.slice(0, baseUrlEnd);
    this.agentId = options.agentId.trim();
    this.apiKey = options.apiKey.trim();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = fetchImpl;
    this.authMode = options.authMode ?? "header";
  }

  async verifyAgent(): Promise<Magen3Identity> {
    return this.request<Magen3Identity>(`/api/agent-gateway/me?agentId=${encodeURIComponent(this.agentId)}`, { method: "GET" });
  }

  async checkIntent(intent: Magen3Intent): Promise<Magen3IntentResponse> {
    if (!intent?.executionWalletAddress?.trim()) throw new TypeError("executionWalletAddress is required");
    if (!intent?.action?.type?.trim()) throw new TypeError("action.type is required");
    if (!intent?.action?.target?.trim()) throw new TypeError("action.target is required");
    return this.request<Magen3IntentResponse>("/api/agent-gateway/intents", {
      method: "POST",
      body: JSON.stringify({
        ...intent,
        agentId: this.agentId,
        walletAddress: intent.walletAddress ?? intent.executionWalletAddress,
      }),
    });
  }

  async requireAllowed(intent: Magen3Intent): Promise<Magen3IntentResponse> {
    const response = await this.checkIntent(intent);
    if (response.result.decision !== "Allowed") {
      throw new Magen3Error(`Magen3 returned ${response.result.decision}: ${response.result.reason}`, 403, response);
    }
    return response;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const authHeaders = this.authMode === "bearer"
      ? { Authorization: `Bearer ${this.apiKey}` }
      : { "x-magen3-agent-key": this.apiKey };
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Content-Type", "application/json");
      for (const [name, value] of Object.entries(authHeaders)) {
        if (value) headers.set(name, value);
      }
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
      const text = await response.text();
      let body: unknown = undefined;
      if (text) {
        try { body = JSON.parse(text); } catch { body = text; }
      }
      if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `Magen3 request failed with HTTP ${response.status}`;
        throw new Magen3Error(message, response.status, body);
      }
      return body as T;
    } catch (error) {
      if (error instanceof Magen3Error) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new Magen3Error(`Magen3 request timed out after ${this.timeoutMs}ms`);
      throw new Magen3Error(error instanceof Error ? error.message : "Magen3 request failed", 0, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
