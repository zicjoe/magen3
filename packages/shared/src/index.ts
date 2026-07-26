export const CHAIN_IDS = ["casper", "base", "arbitrum"] as const;
export const CAPABILITY_IDS = [
  "portfolio",
  "swap",
  "liquid-staking",
  "native-staking",
  "liquidity",
  "lend",
  "withdraw",
  "bridge",
] as const;

export type ChainId = (typeof CHAIN_IDS)[number];
export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type ChainFamily = "casper" | "evm";
export type RiskLevel = "low" | "moderate" | "high";
export type OperationKind = "read" | "write";
export type StepStatus =
  | "proposed"
  | "ready"
  | "preparing"
  | "review-required"
  | "allowed"
  | "blocked"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "failed"
  | "adapter-required"
  | "skipped";

export interface WalletContext {
  activeChain: ChainId;
  casperPublicKey?: string;
  evmAddress?: string;
  visibleBalance?: string;
  riskPreference?: RiskLevel;
}

export interface ToolProvenance {
  mcpServerId?: string;
  mcpServerUrl?: string;
  toolName: string;
  toolTitle?: string;
  toolVersion?: string;
  manifestHash?: string;
  schemaHash?: string;
  descriptionHash?: string;
  permissionScopes?: string[];
  credentialScope?: string;
  annotations?: Record<string, unknown>;
  tls?: boolean;
  toolOrigin: "remote-mcp" | "https-api" | "local-adapter" | "magen3-sdk" | "magen3-mcp";
}

export interface AgentPlanStep {
  id: string;
  position: number;
  chainId: ChainId;
  capability: CapabilityId;
  operation: OperationKind;
  summary: string;
  rationale: string;
  protocol?: string;
  amount?: string;
  assetIn?: string;
  assetOut?: string;
  maxSlippageBps?: number;
  requiresConfirmation: boolean;
  adapterStatus: "live" | "adapter-required";
  status: StepStatus;
  result?: unknown;
  error?: string;
  transactionHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlan {
  id: string;
  conversationId: string;
  title: string;
  objective: string;
  riskLevel: RiskLevel;
  assumptions: string[];
  warnings: string[];
  status: "draft" | "active" | "completed" | "blocked" | "cancelled";
  steps: AgentPlanStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string;
  planId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export type Magen3Decision = "allowed" | "blocked" | "review-required";

export interface Magen3Evaluation {
  decision: Magen3Decision;
  reason: string;
  policyId?: string;
  auditId?: string;
  decisionId?: string;
  proofStatus?: string;
  findings?: unknown[];
  raw?: unknown;
}

export interface PreparedExecution {
  id: string;
  planId: string;
  stepId: string;
  chainId: ChainId;
  walletAddress: string;
  kind: "casper" | "evm" | "read-result";
  quote?: unknown;
  analysis?: unknown;
  transaction?: unknown;
  result?: unknown;
  executable: boolean;
  notice: string;
  toolProvenance: ToolProvenance[];
  evaluation?: Magen3Evaluation;
  createdAt: string;
  expiresAt?: string;
}

export interface ActivityEvent {
  id: string;
  type:
    | "conversation.created"
    | "agent.plan.created"
    | "step.prepared"
    | "magen3.decision"
    | "execution.submitted"
    | "execution.confirmed"
    | "execution.failed";
  title: string;
  detail: string;
  chainId?: ChainId;
  planId?: string;
  stepId?: string;
  transactionHash?: string;
  createdAt: string;
}

export interface IntegrationDetail {
  configured: boolean;
  reachable: boolean | null;
  status: "ready" | "configured" | "missing" | "unreachable";
  message: string;
  mode?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthStatus {
  ok: boolean;
  version: string;
  persistence: { mode: "postgres" | "file" | "memory"; message: string };
  integrations: {
    csprTrade: IntegrationDetail;
    magen3: IntegrationDetail;
    zeroX: IntegrationDetail;
    ai: IntegrationDetail;
  };
  diagnostics: {
    loadedFiles: string[];
    warnings: string[];
    variables: Record<string, unknown>;
  };
}

export interface AgentMessageResponse {
  conversation: Conversation;
  assistantMessage: ConversationMessage;
  plan?: AgentPlan;
}

export interface PrepareStepResponse {
  plan: AgentPlan;
  prepared: PreparedExecution;
}

export interface ToolCatalogEntry {
  id: string;
  name: string;
  chainId: ChainId;
  capability: CapabilityId;
  operation: OperationKind;
  protocol: string;
  status: "live" | "adapter-required";
  description: string;
}
