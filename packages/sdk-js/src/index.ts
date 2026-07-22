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

export interface Magen3Action {
  type: string;
  amount?: number;
  asset?: string;
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
