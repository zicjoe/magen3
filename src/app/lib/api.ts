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
    return request<{ ok: boolean; service: string; network: string; version: string; storage?: string; casper?: Record<string, unknown>; threatIntelligence?: Record<string, unknown>; oracleValidation?: Record<string, unknown>; marketRiskSignals?: Record<string, unknown>; bridgeProviderIntegration?: Record<string, unknown>; complianceControls?: Record<string, unknown>; executionIntegrity?: Record<string, unknown>; approvalWorkflow?: Record<string, unknown>; emergencyControls?: Record<string, unknown>; tokenPermissionControls?: Record<string, unknown>; privilegedActionControls?: Record<string, unknown>; contractUpgradeControls?: Record<string, unknown>; contractArgumentControls?: Record<string, unknown>; x402PaymentControls?: Record<string, unknown>; executionReconciliation?: Record<string, unknown> }>("/api/health");
  },

  casperStatus() {
    return request<{ ok: boolean; casper: Record<string, unknown> }>("/api/casper/status");
  },

  threatIntelligenceStatus() {
    return request<{ ok: boolean; threatIntelligence: Record<string, unknown> }>("/api/threat-intelligence/status");
  },

  oracleValidationStatus() {
    return request<{ ok: boolean; oracleValidation: Record<string, unknown> }>("/api/oracle-validation/status");
  },

  marketRiskSignalsStatus() {
    return request<{ ok: boolean; marketRiskSignals: Record<string, unknown> }>("/api/market-risk-signals/status");
  },

  bridgeProviderIntegrationStatus() {
    return request<{ ok: boolean; bridgeProviderIntegration: Record<string, unknown> }>("/api/bridge-provider-integration/status");
  },

  bridgeProviderChains(providerId = "across-testnet") {
    return request<{ ok: boolean; bridgeProviderIntegration: Record<string, unknown> }>(`/api/bridge-providers/chains?providerId=${encodeURIComponent(providerId)}`);
  },

  bridgeProviderTokens(chainId: string | number, providerId = "across-testnet") {
    return request<{ ok: boolean; bridgeProviderIntegration: Record<string, unknown> }>(`/api/bridge-providers/tokens?providerId=${encodeURIComponent(providerId)}&chainId=${encodeURIComponent(String(chainId))}`);
  },

  requestBridgeProviderQuote(quote: Record<string, unknown>, agentId: string, apiKey: string) {
    return request<any>("/api/bridge-provider-integration/quotes", {
      method: "POST",
      headers: { "x-magen3-agent-key": apiKey },
      body: JSON.stringify({ agentId, quote }),
    });
  },

  pollBridgeProvider(update: Record<string, unknown>, apiKey: string) {
    return request<any>("/api/agent-gateway/bridge/poll", {
      method: "POST",
      headers: { "x-magen3-agent-key": apiKey },
      body: JSON.stringify(update),
    });
  },

  complianceControlsStatus() {
    return request<{ ok: boolean; complianceControls: Record<string, unknown> }>("/api/compliance-controls/status");
  },

  executionIntegrityStatus() {
    return request<{ ok: boolean; executionIntegrity: Record<string, unknown> }>("/api/execution-integrity/status");
  },

  executionReconciliationStatus(agentId?: string, apiKey?: string) {
    const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
    return request<{ ok: boolean; executionReconciliation: Record<string, unknown> }>(`/api/execution-reconciliation/status${query}`, {
      headers: apiKey ? { "x-magen3-agent-key": apiKey } : undefined,
    });
  },


  emergencyControlsStatus(walletAddress?: string) {
    const query = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
    return request<{ ok: boolean; emergencyControls: Record<string, unknown> }>(`/api/emergency-controls/status${query}`);
  },

  tokenPermissionControlsStatus() {
    return request<{ ok: boolean; tokenPermissionControls: Record<string, unknown> }>("/api/token-permission-controls/status");
  },

  privilegedActionControlsStatus() {
    return request<{ ok: boolean; privilegedActionControls: Record<string, unknown> }>("/api/privileged-action-controls/status");
  },

  contractArgumentControlsStatus() {
    return request<{ ok: boolean; contractArgumentControls: Record<string, unknown> }>("/api/contract-argument-controls/status");
  },

  x402PaymentControlsStatus() {
    return request<{ ok: boolean; x402PaymentControls: Record<string, unknown> }>("/api/x402-payment-controls/status");
  },

  approvalWorkflowStatus(walletAddress?: string) {
    const query = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
    return request<{ ok: boolean; approvalWorkflow: Record<string, unknown> }>(`/api/approval-workflow/status${query}`);
  },

  publicConfig() {
    return request<{ ok: boolean; apiBaseUrl: string; casper: Record<string, unknown>; gateway: Record<string, unknown> }>("/api/public-config");
  },

  bootstrap(walletAddress?: string) {
    const query = walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
    return request<any>(`/api/bootstrap${query}`);
  },

  agentGatewaySpec() {
    return request<any>("/api/agent-gateway/spec");
  },

  agentGatewayMe(agentId: string, apiKey: string) {
    return request<any>(`/api/agent-gateway/me?agentId=${encodeURIComponent(agentId)}`, {
      headers: { "x-magen3-agent-key": apiKey },
    });
  },

  submitAgentGatewayIntent(intent: Record<string, unknown>, apiKey?: string) {
    return request<any>("/api/agent-gateway/intents", {
      method: "POST",
      headers: apiKey ? { "x-magen3-agent-key": apiKey } : undefined,
      body: JSON.stringify(intent),
    });
  },

  updateX402Settlement(settlement: Record<string, unknown>, apiKey: string) {
    return request<any>("/api/agent-gateway/x402/settlements", {
      method: "POST",
      headers: { "x-magen3-agent-key": apiKey },
      body: JSON.stringify(settlement),
    });
  },

  updateExecutionReconciliation(update: Record<string, unknown>, apiKey: string) {
    return request<any>("/api/agent-gateway/executions/reconcile", {
      method: "POST",
      headers: { "x-magen3-agent-key": apiKey },
      body: JSON.stringify(update),
    });
  },

  pollExecutionReconciliation(update: Record<string, unknown>, apiKey: string) {
    return request<any>("/api/agent-gateway/executions/poll", {
      method: "POST",
      headers: { "x-magen3-agent-key": apiKey },
      body: JSON.stringify(update),
    });
  },

  getAgentApproval(id: string, agentId: string, apiKey: string) {
    return request<any>(`/api/agent-gateway/approvals/${encodeURIComponent(id)}?agentId=${encodeURIComponent(agentId)}`, {
      headers: { "x-magen3-agent-key": apiKey },
    });
  },

  listEmergencyPauses(walletAddress: string) {
    return request<any>(`/api/emergency-pauses?walletAddress=${encodeURIComponent(walletAddress)}`);
  },

  createEmergencyPause(body: Record<string, unknown>) {
    return request<any>("/api/emergency-pauses", { method: "POST", body: JSON.stringify(body) });
  },

  resumeEmergencyPause(id: string, body: Record<string, unknown>) {
    return request<any>(`/api/emergency-pauses/${encodeURIComponent(id)}/resume`, { method: "POST", body: JSON.stringify(body) });
  },

  listApprovals(walletAddress: string) {
    return request<any>(`/api/approvals?walletAddress=${encodeURIComponent(walletAddress)}`);
  },

  createApprovalChallenge(id: string, body: Record<string, unknown>) {
    return request<any>(`/api/approvals/${encodeURIComponent(id)}/challenge`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  respondApproval(id: string, body: Record<string, unknown>) {
    return request<any>(`/api/approvals/${encodeURIComponent(id)}/respond`, {
      method: "POST",
      body: JSON.stringify(body),
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

  rotateAgentApiKey(id: string, walletAddress: string) {
    return request<any>(`/api/agents/${encodeURIComponent(id)}/rotate-key`, {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    });
  },

  revokeAgent(id: string, walletAddress: string) {
    return request<any>(`/api/agents/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    });
  },

  deleteAgent(id: string, walletAddress: string, confirmation: string) {
    return request<any>(`/api/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: JSON.stringify({ walletAddress, confirmation }),
    });
  },

  createPolicy(policy: Record<string, unknown>) {
    return request<any>("/api/policies", {
      method: "POST",
      body: JSON.stringify(policy),
    });
  },

  updatePolicy(id: string, policy: Record<string, unknown>) {
    return request<any>(`/api/policies/${encodeURIComponent(id)}/update`, {
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
