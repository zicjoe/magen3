const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error || `Magen3 API error: ${response.status}`);
  }

  return payload as T;
}

export const api = {
  baseUrl: API_BASE_URL,

  health() {
    return request<{ ok: boolean; service: string; network: string; version: string; storage?: string; casper?: Record<string, unknown> }>("/api/health");
  },

  casperStatus() {
    return request<{ ok: boolean; casper: Record<string, unknown> }>("/api/casper/status");
  },

  bootstrap(walletAddress?: string) {
    const query = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
    return request<any>(`/api/bootstrap${query}`);
  },

  agentGatewaySpec() {
    return request<any>("/api/agent-gateway/spec");
  },

  submitAgentGatewayIntent(intent: Record<string, unknown>, apiKey?: string) {
    return request<any>("/api/agent-gateway/intents", {
      method: "POST",
      headers: apiKey ? { "x-magen3-agent-key": apiKey } : undefined,
      body: JSON.stringify(intent),
    });
  },


  connectWallet(walletAddress: string) {
    return request<{ network: string; connected: boolean }>(
      "/api/wallet/session",
      { method: "POST", body: JSON.stringify({ walletAddress }) }
    );
  },

  createAgent(agent: Record<string, unknown>) {
    return request<any>("/api/agents", {
      method: "POST",
      body: JSON.stringify(agent),
    });
  },

  createPolicy(policy: Record<string, unknown>) {
    return request<any>("/api/policies", {
      method: "POST",
      body: JSON.stringify(policy),
    });
  },

  analyzeAction(action: Record<string, unknown>) {
    return request<any>("/api/actions/analyze", {
      method: "POST",
      body: JSON.stringify(action),
    });
  },

  createAuditLog(auditLog: Record<string, unknown>) {
    return request<any>("/api/audit-logs", {
      method: "POST",
      body: JSON.stringify(auditLog),
    });
  },

  recordAuditLog(id: string) {
    return request<any>(`/api/audit-logs/${id}/record`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  prepareCasperPayload(id: string) {
    return request<any>(`/api/audit-logs/${id}/casper-payload`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  confirmCasperDeploy(id: string, deployHash: string) {
    return request<any>(`/api/audit-logs/${id}/casper-confirm`, {
      method: "POST",
      body: JSON.stringify({ deployHash }),
    });
  },

  confirmExecutionDeploy(id: string, deployHash: string, signedBy?: string, note?: string) {
    return request<any>(`/api/audit-logs/${id}/execution-confirm`, {
      method: "POST",
      body: JSON.stringify({ deployHash, signedBy, note }),
    });
  },

  sendSignedCasperDeploy(signedDeploy: unknown) {
    return request<{ ok: boolean; deployHash: string; casper: Record<string, unknown> }>("/api/casper/send-deploy", {
      method: "POST",
      body: JSON.stringify({ signedDeploy }),
    });
  },
};
