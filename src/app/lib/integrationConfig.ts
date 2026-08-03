export const MAGEN3_ENVIRONMENT_VARIABLES = {
  gatewayUrl: "MAGEN3_GATEWAY_URL",
  agentId: "MAGEN3_AGENT_ID",
  apiKey: "MAGEN3_API_KEY",
} as const;

export interface Magen3IntegrationEndpoints {
  baseUrl: string;
  verifyUrl: string;
  intentUrl: string;
  approvalBaseUrl: string;
  reconciliationUrl: string;
  reconciliationPollUrl: string;
  x402SettlementUrl: string;
}

export function normalizeMagen3ApiBaseUrl(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    const marker = parsed.pathname.toLowerCase().indexOf("/api/agent-gateway");
    if (marker >= 0) parsed.pathname = parsed.pathname.slice(0, marker) || "/";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    const withoutQuery = trimmed.split(/[?#]/, 1)[0];
    const marker = withoutQuery.toLowerCase().indexOf("/api/agent-gateway");
    return (marker >= 0 ? withoutQuery.slice(0, marker) : withoutQuery).replace(/\/+$/, "");
  }
}

export function getMagen3IntegrationEndpoints(apiBaseUrl: string): Magen3IntegrationEndpoints {
  const baseUrl = normalizeMagen3ApiBaseUrl(apiBaseUrl);
  return {
    baseUrl,
    verifyUrl: `${baseUrl}/api/agent-gateway/me`,
    intentUrl: `${baseUrl}/api/agent-gateway/intents`,
    approvalBaseUrl: `${baseUrl}/api/agent-gateway/approvals`,
    reconciliationUrl: `${baseUrl}/api/agent-gateway/executions/reconcile`,
    reconciliationPollUrl: `${baseUrl}/api/agent-gateway/executions/poll`,
    x402SettlementUrl: `${baseUrl}/api/agent-gateway/x402/settlements`,
  };
}

export function buildMagen3EnvironmentFile(options: {
  apiBaseUrl: string;
  agentId: string;
  apiKey: string;
  agentName?: string;
}): string {
  const endpoints = getMagen3IntegrationEndpoints(options.apiBaseUrl);
  const lines = [
    `${MAGEN3_ENVIRONMENT_VARIABLES.gatewayUrl}=${endpoints.baseUrl}`,
    `${MAGEN3_ENVIRONMENT_VARIABLES.agentId}=${options.agentId}`,
    `${MAGEN3_ENVIRONMENT_VARIABLES.apiKey}=${options.apiKey}`,
  ];
  if (options.agentName) lines.push(`MAGEN3_AGENT_NAME=${JSON.stringify(options.agentName)}`);
  return `${lines.join("\n")}\n`;
}
