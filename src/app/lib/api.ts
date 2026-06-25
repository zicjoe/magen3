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

  bootstrap() {
    return request<any>("/api/bootstrap");
  },

  connectWallet() {
    return request<{ walletAddress: string; network: string; connected: boolean }>(
      "/api/wallet/mock-connect",
      { method: "POST", body: JSON.stringify({}) }
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
};
