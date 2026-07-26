import { createHash, randomUUID } from "node:crypto";
import type { ToolProvenance } from "@yieldbot/shared";

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface McpClientConfig {
  url: string;
  serverId: string;
  clientName: string;
  clientVersion: string;
  protocolVersions?: string[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  cacheTtlMs?: number;
}

type RpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: any;
  error?: { code?: number; message?: string; data?: unknown };
};

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(",")}}`;
}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function parsePayload(text: string, expectedId?: string): RpcResponse {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.find((item) => String(item?.id) === expectedId) || parsed[parsed.length - 1] || {};
    }
    return parsed;
  }

  const events = trimmed.split(/\r?\n\r?\n/).flatMap((block) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return [];
    try { return [JSON.parse(data)]; } catch { return []; }
  });
  return events.find((item) => String(item?.id) === expectedId) || events[events.length - 1] || {};
}

function normalizeToolResult(payload: RpcResponse) {
  if (payload.error) throw new Error(payload.error.message || `MCP error ${payload.error.code || "unknown"}.`);
  const result = payload.result ?? payload;
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const textItems = Array.isArray(result?.content)
    ? result.content.filter((item: any) => item?.type === "text" && typeof item?.text === "string")
    : [];
  if (!textItems.length) return result;
  const joined = textItems.map((item: any) => item.text).join("\n");
  try { return JSON.parse(joined); } catch { return { text: joined, content: result.content }; }
}

export class StreamableHttpMcpClient {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private protocolVersion = "2025-11-25";
  private sessionId?: string;
  private initializedAt = 0;
  private toolsCache?: { tools: McpToolDefinition[]; expiresAt: number };

  constructor(private readonly config: McpClientConfig) {
    this.url = config.url;
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60_000;
  }

  private async post(method: string, params?: unknown, notification = false): Promise<RpcResponse> {
    const id = notification ? undefined : randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const body = { jsonrpc: "2.0", ...(id ? { id } : {}), method, ...(params === undefined ? {} : { params }) };
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
          ...(method === "initialize" ? {} : { "MCP-Protocol-Version": this.protocolVersion }),
          ...this.config.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`MCP ${method} failed with HTTP ${response.status}: ${text.slice(0, 400)}`);
      this.sessionId = response.headers.get("mcp-session-id") || this.sessionId;
      return parsePayload(text, id);
    } finally {
      clearTimeout(timer);
    }
  }

  async initialize(force = false) {
    if (!force && this.initializedAt && Date.now() - this.initializedAt < this.cacheTtlMs) return;
    let lastError: unknown;
    const versions = this.config.protocolVersions || ["2025-11-25", "2025-06-18", "2025-03-26"];
    for (const protocolVersion of versions) {
      try {
        this.sessionId = undefined;
        const response = await this.post("initialize", {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: this.config.clientName, version: this.config.clientVersion },
        });
        if (response.error) throw new Error(response.error.message || "MCP initialize failed.");
        this.protocolVersion = String(response.result?.protocolVersion || protocolVersion);
        await this.post("notifications/initialized", undefined, true);
        this.initializedAt = Date.now();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to initialize MCP connection.");
  }

  async listTools(force = false): Promise<McpToolDefinition[]> {
    await this.initialize(force);
    if (!force && this.toolsCache && this.toolsCache.expiresAt > Date.now()) return this.toolsCache.tools;
    const response = await this.post("tools/list", {});
    if (response.error) throw new Error(response.error.message || "MCP tools/list failed.");
    const tools = Array.isArray(response.result?.tools) ? response.result.tools as McpToolDefinition[] : [];
    this.toolsCache = { tools, expiresAt: Date.now() + this.cacheTtlMs };
    return tools;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<{ result: T; provenance: ToolProvenance }> {
    const tools = await this.listTools();
    const definition = tools.find((tool) => tool.name === name);
    if (!definition) throw new Error(`MCP tool "${name}" is not exposed by ${this.config.serverId}.`);
    const response = await this.post("tools/call", { name, arguments: args });
    const manifest = {
      serverId: this.config.serverId,
      serverUrl: this.url,
      protocolVersion: this.protocolVersion,
      tool: definition,
    };
    return {
      result: normalizeToolResult(response) as T,
      provenance: {
        mcpServerId: this.config.serverId,
        mcpServerUrl: this.url,
        toolName: definition.name,
        toolTitle: definition.title,
        toolVersion: this.protocolVersion,
        manifestHash: hash(manifest),
        schemaHash: hash(definition.inputSchema || {}),
        descriptionHash: hash(definition.description || ""),
        permissionScopes: inferScopes(definition),
        credentialScope: Object.keys(this.config.headers || {}).length ? "configured-server-headers" : "none",
        annotations: definition.annotations,
        tls: this.url.startsWith("https://"),
        toolOrigin: "remote-mcp",
      },
    };
  }

  async probe() {
    try {
      const tools = await this.listTools(true);
      return {
        reachable: true,
        message: `${this.config.serverId} MCP connected using ${this.protocolVersion}; ${tools.length} tools discovered.`,
        protocolVersion: this.protocolVersion,
        toolCount: tools.length,
        tools: tools.map((tool) => tool.name),
      };
    } catch (error) {
      return {
        reachable: false,
        message: error instanceof Error ? error.message : `${this.config.serverId} MCP probe failed.`,
        protocolVersion: this.protocolVersion,
        toolCount: 0,
        tools: [],
      };
    }
  }
}

function inferScopes(tool: McpToolDefinition): string[] {
  const annotations = tool.annotations || {};
  const scopes = [`tool:${tool.name}`];
  if (annotations.readOnlyHint === true) scopes.push("read-only");
  if (annotations.destructiveHint === true) scopes.push("destructive");
  if (annotations.idempotentHint === true) scopes.push("idempotent");
  if (annotations.openWorldHint === true) scopes.push("open-world");
  return scopes;
}
