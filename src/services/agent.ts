import type {
  ActivityEvent,
  AgentMessageResponse,
  AgentPlan,
  Conversation,
  PrepareStepResponse,
  ToolCatalogEntry,
  WalletContext,
} from "@yieldbot/shared";
import { apiFetch } from "./api";

export async function getConversations(limit = 20) {
  return apiFetch<{ conversations: Conversation[] }>(`/v1/conversations?limit=${limit}`);
}

export async function createConversation(title?: string) {
  return apiFetch<Conversation>("/v1/conversations", { method: "POST", body: JSON.stringify({ title }) });
}

export async function sendAgentMessage(conversationId: string | undefined, message: string, context: WalletContext) {
  return apiFetch<AgentMessageResponse>("/v1/agent/messages", {
    method: "POST",
    body: JSON.stringify({ conversationId, message, context }),
  });
}

export async function getPlans(limit = 20) {
  return apiFetch<{ plans: AgentPlan[] }>(`/v1/plans?limit=${limit}`);
}

export async function preparePlanStep(planId: string, stepId: string, walletAddress: string, clientContext?: Record<string, unknown>) {
  return apiFetch<PrepareStepResponse>(`/v1/plans/${planId}/steps/${stepId}/prepare`, {
    method: "POST",
    body: JSON.stringify({ walletAddress, clientContext }),
  });
}

export async function recordExecutionReceipt(input: {
  planId: string;
  stepId: string;
  preparationId: string;
  status: "submitted" | "confirmed" | "failed";
  transactionHash?: string;
  error?: string;
}) {
  return apiFetch<{ plan: AgentPlan; reconciliation: unknown }>(`/v1/plans/${input.planId}/steps/${input.stepId}/receipt`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitCasperExecution(input: {
  planId: string;
  stepId: string;
  preparationId: string;
  signedTransaction: unknown;
}) {
  return apiFetch<{ transactionHash: string; plan: AgentPlan; reconciliation: unknown }>(`/v1/plans/${input.planId}/steps/${input.stepId}/submit-casper`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getActivity() {
  return apiFetch<{ events: ActivityEvent[] }>("/v1/activity?limit=50");
}

export async function getToolCatalog() {
  return apiFetch<{ tools: ToolCatalogEntry[] }>("/v1/system/tool-catalog");
}
