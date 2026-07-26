import { createHash, randomUUID } from "node:crypto";
import { StreamableHttpMcpClient } from "@yieldbot/mcp-client";
import type { Magen3Evaluation, ToolProvenance } from "@yieldbot/shared";

export interface Magen3IntentInput {
  action: string;
  chain: string;
  capability: string;
  walletAddress: string;
  protocol?: string;
  amount?: string;
  assetIn?: string;
  assetOut?: string;
  maxSlippageBps?: number;
  transaction?: unknown;
  toolProvenance?: ToolProvenance[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface Magen3ExecutionReport {
  decisionId?: string;
  auditId?: string;
  planId: string;
  stepId: string;
  status: "submitted" | "confirmed" | "failed";
  chain: string;
  transactionHash?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface Magen3SdkConfig {
  mode?: "auto" | "gateway" | "mcp";
  baseUrl?: string;
  agentId: string;
  apiKey: string;
  gatewayPath?: string;
  executionPath?: string;
  mcpUrl?: string;
  mcpEvaluateTool?: string;
  mcpReportTool?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
}

export function normalizeMagen3Decision(value: unknown): Magen3Evaluation {
  const raw = value as any;
  const source = raw?.data ?? raw?.result ?? raw?.decisionResult ?? raw;
  const candidate = String(source?.decision ?? source?.outcome ?? source?.status ?? "").toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
  const decision = candidate.includes("review")
    ? "review-required"
    : candidate.includes("block") || candidate.includes("deny")
      ? "blocked"
      : candidate.includes("allow") || candidate.includes("approve")
        ? "allowed"
        : undefined;
  if (!decision) throw new Error("Magen3 responded without a recognized Allowed, Blocked, or Review Required decision.");
  return {
    decision,
    reason: String(source?.reason ?? source?.primaryReason ?? source?.message ?? `Magen3 returned ${decision}.`),
    policyId: source?.policyId ? String(source.policyId) : undefined,
    auditId: source?.auditId ? String(source.auditId) : source?.audit?.id ? String(source.audit.id) : undefined,
    decisionId: source?.decisionId ? String(source.decisionId) : source?.id ? String(source.id) : undefined,
    proofStatus: source?.proofStatus ? String(source.proofStatus) : source?.proof?.status ? String(source.proof.status) : undefined,
    findings: Array.isArray(source?.findings) ? source.findings : Array.isArray(source?.moduleFindings) ? source.moduleFindings : undefined,
    raw: value,
  };
}

export class Magen3Client {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly mode: "gateway" | "mcp";
  private readonly mcp?: StreamableHttpMcpClient;

  constructor(private readonly config: Magen3SdkConfig) {
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.mode = config.mode === "mcp" || (config.mode !== "gateway" && Boolean(config.mcpUrl)) ? "mcp" : "gateway";
    if (this.mode === "mcp") {
      if (!config.mcpUrl) throw new Error("MAGEN3_MCP_URL is required when Magen3 integration mode is MCP.");
      this.mcp = new StreamableHttpMcpClient({
        url: config.mcpUrl,
        serverId: "magen3",
        clientName: "yieldbot-ai",
        clientVersion: "1.0.0",
        timeoutMs: this.timeoutMs,
        headers: {
          "x-api-key": config.apiKey,
          "x-agent-id": config.agentId,
          Authorization: `Bearer ${config.apiKey}`,
        },
      });
    }
  }

  get integrationMode() {
    return this.mode;
  }

  private buildEnvelope(input: Magen3IntentInput) {
    const idempotencyKey = input.idempotencyKey || randomUUID();
    const parameters = {
      chain: input.chain,
      capability: input.capability,
      walletAddress: input.walletAddress,
      protocol: input.protocol,
      amount: input.amount,
      assetIn: input.assetIn,
      assetOut: input.assetOut,
      maxSlippageBps: input.maxSlippageBps,
    };
    return {
      ...input,
      agentId: this.config.agentId,
      idempotencyKey,
      metadata: {
        ...input.metadata,
        source: "yieldbot-ai",
        version: "1.0.0",
        initiatedBy: "user",
        intentSource: "yieldbot-ai-agent",
        externalContentUsed: false,
        userConfirmed: false,
        goalId: idempotencyKey,
        originalUserGoalHash: sha256(input.action),
        originalParameterHash: sha256(parameters),
        currentParameterHash: sha256(parameters),
        transactionPayloadHash: input.transaction === undefined ? undefined : sha256(input.transaction),
        toolIntegrity: input.toolProvenance || [],
      },
    };
  }

  async evaluateIntent(input: Magen3IntentInput): Promise<Magen3Evaluation> {
    const envelope = this.buildEnvelope(input);
    if (this.mode === "mcp") {
      const toolName = this.config.mcpEvaluateTool || "evaluate_intent";
      const called = await this.mcp!.callTool(toolName, envelope as unknown as Record<string, unknown>);
      const evaluation = normalizeMagen3Decision(called.result);
      evaluation.raw = { response: called.result, transport: "mcp", provenance: { ...called.provenance, toolOrigin: "magen3-mcp" } };
      return evaluation;
    }

    if (!this.config.baseUrl) throw new Error("MAGEN3_BASE_URL is required for the Magen3 gateway SDK transport.");
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const gatewayPath = this.config.gatewayPath || "/api/agent-gateway/intents";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${baseUrl}${gatewayPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "x-agent-id": this.config.agentId,
          Authorization: `Bearer ${this.config.apiKey}`,
          "x-idempotency-key": envelope.idempotencyKey,
          "User-Agent": "YieldBot-AI/1.0.0",
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: unknown;
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text || "Magen3 returned a non-JSON response." }; }
      if (!response.ok) {
        const message = typeof (payload as any)?.error === "string"
          ? (payload as any).error
          : (payload as any)?.error?.message || `Magen3 gateway returned HTTP ${response.status}.`;
        throw new Error(message);
      }
      return normalizeMagen3Decision(payload);
    } finally {
      clearTimeout(timer);
    }
  }

  async reportExecution(report: Magen3ExecutionReport) {
    if (this.mode === "mcp") {
      const toolName = this.config.mcpReportTool;
      if (!toolName) return { reported: false, message: "Magen3 MCP execution reporting tool is not configured." };
      const called = await this.mcp!.callTool(toolName, report as unknown as Record<string, unknown>);
      return { reported: true, response: called.result };
    }
    if (!(this.config.baseUrl && this.config.executionPath)) {
      return { reported: false, message: "Magen3 execution reconciliation path is not configured." };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}${this.config.executionPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.config.apiKey,
          "x-agent-id": this.config.agentId,
          Authorization: `Bearer ${this.config.apiKey}`,
          "User-Agent": "YieldBot-AI/1.0.0",
        },
        body: JSON.stringify({ ...report, agentId: this.config.agentId }),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; }
      catch { payload = { error: text || "Magen3 returned a non-JSON reconciliation response." }; }
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Magen3 reconciliation returned HTTP ${response.status}.`);
      return { reported: true, response: payload };
    } finally {
      clearTimeout(timer);
    }
  }

  async probe(): Promise<{ reachable: boolean; mode: string; endpoint?: string; message: string; metadata?: Record<string, unknown> }> {
    if (this.mode === "mcp") {
      const result = await this.mcp!.probe();
      return {
        reachable: result.reachable,
        mode: "mcp",
        endpoint: this.config.mcpUrl,
        message: result.message,
        metadata: { protocolVersion: result.protocolVersion, toolCount: result.toolCount, tools: result.tools },
      };
    }
    if (!this.config.baseUrl) return { reachable: false, mode: "gateway-sdk", message: "Magen3 base URL is not configured." };
    const candidates = ["/api/health", "/health", "/"];
    for (const path of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 6_000));
      try {
        const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}${path}`, {
          headers: { Accept: "application/json,text/plain,*/*", "User-Agent": "YieldBot-AI/1.0.0" },
          signal: controller.signal,
        });
        if (response.status < 500) {
          return { reachable: true, mode: "gateway-sdk", endpoint: path, message: `Magen3 gateway responded with HTTP ${response.status}.` };
        }
      } catch {
        // Try the next common health path.
      } finally {
        clearTimeout(timer);
      }
    }
    return { reachable: false, mode: "gateway-sdk", message: "Magen3 credentials are loaded, but the configured gateway did not respond." };
  }
}
