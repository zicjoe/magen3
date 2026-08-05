import { useState, useEffect, useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  LayoutDashboard,
  FileText,
  Bot,
  Scroll,
  Search,
  Settings,
  Wallet,
  ChevronDown,
  X,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Activity,
  Database,
  Globe,
  Lock,
  Zap,
  ArrowRight,
  Copy,
  ExternalLink,
  Filter,
  Plus,
  Eye,
  TrendingUp,
  Server,
  Send,
  RefreshCw,
  Code2,
  ChevronRight,
  Menu,
  Layers,
  Trash2,
  Scale,
} from "lucide-react";
import { api } from "./lib/api";
import { buildMagen3EnvironmentFile, getMagen3IntegrationEndpoints } from "./lib/integrationConfig";
import {
  CAPABILITY_PACKS,
  EXECUTION_CAPABILITY_CATALOG,
  POLICY_TEMPLATES,
  PROTECTION_MODULE_CATALOG,
  calculateSecurityCoverage,
  deriveIntegrationHealth,
  normalizeCapabilities,
  recommendedModules,
  recommendedPolicyTemplate,
  type ExecutionCapability,
  type ModuleFinding,
  type PipelineStage,
} from "./lib/securityModel";
import {
  connectCasperWallet,
  disconnectCasperWallet,
  restoreCasperWalletConnection,
  isCasperWalletInstalled,
  signCasperWalletMessage,
} from "./lib/casperWallet";

const OFFICIAL_MCP_SERVER_BINDING = [
  "magen3-official-mcp||13fa36697e6a8fc245951012bcceb80af11e3fd58bb0ea641eaf5cb9ac27924b",
  "magen3-official-mcp||a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c",
].join("\n");
const OFFICIAL_MCP_TOOL_BINDINGS = [
  "magen3-official-mcp|magen3_check_intent|0.5.1|13fa36697e6a8fc245951012bcceb80af11e3fd58bb0ea641eaf5cb9ac27924b|bd690b9c71ac86c8b48afda761c558744437ec1e956a5b3b451df96500023eeb|3a415223b22674c46c16636b28afae9e4ce21e95f1c69fff80a27785d51d6b1c|magen3:intent:check|agent-gateway|@magen3/mcp-server",
  "magen3-official-mcp|magen3_require_allowed|0.5.1|13fa36697e6a8fc245951012bcceb80af11e3fd58bb0ea641eaf5cb9ac27924b|8eccadfdf3eef9ed2b927a81e8b8b598d153bcefbb150c4bc8a2aad7f960fb9e|3a415223b22674c46c16636b28afae9e4ce21e95f1c69fff80a27785d51d6b1c|magen3:intent:require-allowed|agent-gateway|@magen3/mcp-server",
  "magen3-official-mcp|magen3_check_intent|0.5.0|a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c|29b728aaa61bced4a3f533d23e52045f1f00d593f995634d83063c44fa0e18f2|f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2|magen3:intent:check|agent-gateway|@magen3/mcp-server",
  "magen3-official-mcp|magen3_require_allowed|0.5.0|a16fb32421835bcd9a7dc035a4f3ba26a5e7a227d29375929f7bff57ac2d8f0c|bfce0408d41a7656c7792bbd36d318a41f41cee2ea8bbee8e4c0b81f4a1e5359|f77a077dad755bb5fae5dc408dc2902541649c98c427cc9c961b835d352b25c2|magen3:intent:require-allowed|agent-gateway|@magen3/mcp-server",
].join("\n");

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type Page =
  | "landing"
  | "dashboard"
  | "shields"
  | "connected-agents"
  | "policies"
  | "audit-log"
  | "intent-playground"
  | "settings"
  | "docs";

type Decision = "Allowed" | "Blocked" | "Review Required";
type Risk = "Low" | "Medium" | "High" | "Critical";
type AgentType =
  | "DeFi Agent"
  | "Trading Agent"
  | "Treasury Agent"
  | "RWA Agent"
  | "Oracle Agent"
  | "Custom Agent";
type PermissionLevel =
  | "Read Only"
  | "Limited Execution"
  | "Full Execution with Review";
type RiskMode = "Conservative" | "Balanced" | "Aggressive";
type ActionType =
  | "Stake"
  | "Transfer"
  | "Swap"
  | "Claim Rewards"
  | "Deposit to Vault"
  | "Contract Interaction"
  | "DAO Treasury Payment"
  | "RWA Proof Update"
  | "Oracle Data Update"
  | "Bridge"
  | "x402 Payment"
  | "Policy Activation"
  | "Emergency Pause Activated"
  | "Emergency Pause Resumed"
  | "Emergency Resume Requested";
type TargetType =
  | "Trusted Contract"
  | "Unknown Contract"
  | "Wallet Address"
  | "DAO Treasury"
  | "RWA Registry"
  | "Oracle Feed"
  | "Bridge Contract"
  | "x402 Merchant"
  | "Emergency Control";

interface Agent {
  id: string;
  name: string;
  type: AgentType;
  purpose: string;
  permissionLevel: PermissionLevel;
  status: "Active" | "Revoked";
  createdAt: string;
  ownerWalletAddress?: string;
  apiKey?: string;
  apiKeyPreview?: string;
  apiKeyIssuedAt?: string;
  apiKeyRotatedAt?: string;
  revokedAt?: string;
  executionCapabilities?: ExecutionCapability[];
  capabilityConfiguration?: Record<string, unknown>;
  onboardingStatus?: string;
  lastIntentAt?: string;
  lastDecisionAt?: string;
}

type AgentRegistrationDraft = Pick<Agent, "name" | "type" | "purpose" | "permissionLevel"> & {
  executionCapabilities: ExecutionCapability[];
  capabilityConfiguration?: Record<string, unknown>;
  onboardingStatus?: string;
};

type OnboardingSetupMode = "guided" | "advanced";
type GuidedUseCaseId = "trading" | "wallet" | "treasury" | "dapp" | "enterprise" | "custom";
type IntegrationTarget = "Codex" | "MCP" | "JavaScript" | "Python" | "Custom API" | "Integrate later";
type ProtectionLevel = "Standard" | "Strict" | "Custom";
type ReviewResolutionMode = "Autonomous" | "Balanced" | "Human Governed";
interface OnboardingLaunchRequest { mode: OnboardingSetupMode; nonce: number; }

interface GuidedUseCase {
  id: GuidedUseCaseId;
  title: string;
  description: string;
  purpose: string;
  capabilities: ExecutionCapability[];
  template: string;
  icon: ReactElement;
}

interface Policy {
  id: string;
  name: string;
  agentId: string;
  maxTransaction: number;
  dailyLimit: number;
  approvalThreshold: number;
  trustedContracts: string[];
  blockedActions: string[];
  riskMode: RiskMode;
  status: "Active" | "Inactive";
  createdAt: string;
  policyHash: string;
  templateType?: string;
  capabilityScope?: ExecutionCapability[];
  structuredRules?: Record<string, unknown>;
}

interface AuditLog {
  id: string;
  timestamp: string;
  shield: string;
  agentId: string;
  agentName: string;
  action: ActionType;
  amount: number;
  target: string;
  targetType: TargetType;
  decision: Decision;
  risk: Risk;
  reason: string;
  policyUsed: string;
  walletAddress: string;
  agentOwnerWalletAddress?: string;
  executionWalletAddress?: string;
  txHash: string;
  executionStatus?: string;
  executionTxHash?: string;
  executionSignedBy?: string;
  executionNote?: string;
  executionUpdatedAt?: string;
  executionAttemptCount?: number;
  executionConfirmations?: number;
  executionRequiredConfirmations?: number;
  executionFinalityDeadline?: string;
  executionFinalizedAt?: string;
  executionReplacementOf?: string;
  executionReplacementAuditId?: string;
  executionReplacedBy?: string;
  executionReplacedByAuditId?: string;
  executionFailureReason?: string;
  settlementStatus?: string;
  resourceDeliveryStatus?: string;
  refundStatus?: string;
  reconciliationProvider?: string;
  reconciliationLastCheckedAt?: string;
  executionReconciliation?: Record<string, unknown>;
  executionHistory?: Array<Record<string, unknown>>;
  decisionProofStatus?: string;
  decisionProofPayloadHash?: string;
  decisionProofError?: string;
  decisionProofMode?: string;
  decisionProofUpdatedAt?: string;
  originalIntent?: Record<string, unknown>;
  pipelineStages?: PipelineStage[];
  moduleFindings?: ModuleFinding[];
  primaryReason?: string;
  triggeredRule?: string;
  suggestedResolution?: string;
  capabilityContext?: ExecutionCapability[];
  proofSubmittedAt?: string;
  proofConfirmedAt?: string;
  approvalRequestId?: string;
  approvalStatus?: string;
  approvalBindingHash?: string;
  approvalRequiredCount?: number;
  approvalReceivedCount?: number;
  approvalExpiresAt?: string;
  approvalResolvedAt?: string;
  riskScore: number;
}

interface ApprovalResponseRecord {
  walletAddress: string;
  response: "Approved" | "Rejected";
  comment?: string;
  timestamp: string;
  signatureRequired?: boolean;
  signatureVerified?: boolean;
  signatureVerifiedAt?: string;
  signatureChallengeId?: string;
  signatureChallengeHash?: string;
  signatureNonceHash?: string;
  signatureHash?: string;
  signatureAlgorithm?: string;
  signatureDomain?: string;
  signatureChainName?: string;
  memberGroupIds?: string[];
  groupIds?: string[];
}


interface ApprovalGroupProgress {
  groupId: string;
  groupName: string;
  role?: string;
  required: number;
  received: number;
  remaining: number;
  satisfied: boolean;
}

interface ApprovalTierSummary {
  id: string;
  name: string;
  priority?: number;
  minAmount?: number | null;
  maxAmount?: number | null;
  actions?: string[];
  capabilities?: string[];
  contracts?: string[];
}

interface ApprovalRequest {
  id: string;
  auditLogId: string;
  agentId: string;
  actionType: string;
  amount: number;
  target: string;
  targetType: string;
  decision: Decision;
  risk: Risk;
  riskScore: number;
  reason: string;
  walletAddress: string;
  requesterWalletAddress: string;
  policyId: string;
  policyName: string;
  reviewStatus: "Pending" | "Approved" | "Rejected" | "Expired" | "Configuration Required" | string;
  bindingHash: string;
  requiredApprovals: number;
  approvalsReceived: number;
  verifiedApprovalsReceived?: number;
  verifiedResponses?: number;
  signatureRequired?: boolean;
  signatureDomain?: string;
  signatureChainName?: string;
  remainingApprovals: number;
  resolvedTier?: ApprovalTierSummary | null;
  groupProgress?: ApprovalGroupProgress[];
  escalationHistory?: Array<{ id: string; name?: string; activatedAt?: string; afterSeconds?: number }>;
  nextEscalation?: { id: string; name?: string; afterSeconds?: number } | null;
  executionNotBefore?: string;
  executionWindowEndsAt?: string;
  executionDelayRemainingSeconds?: number;
  executionWindowStatus?: "not_started" | "delay" | "open" | "expired" | string;
  organizationalQuorum?: { enabled?: boolean; satisfied?: boolean; groups?: ApprovalGroupProgress[]; resolvedTier?: ApprovalTierSummary | null };
  approverWallets: string[];
  responses: ApprovalResponseRecord[];
  expiresAt: string;
  resolvedAt?: string;
  rejectionReason?: string;
  reviewContext?: Record<string, unknown>;
  mayProceedToSigning?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EmergencyPause {
  id: string;
  ownerWalletAddress: string;
  agentId?: string;
  policyId?: string;
  scopeType: "Platform" | "Agent" | "Capability" | "Action" | "Policy" | "Trading" | "Contract" | "Bridge" | "x402" | "All Execution" | string;
  scopeValue?: string;
  enforcementAction: "Blocked" | "Review Required";
  triggerType: "Manual" | "Automatic" | string;
  triggerRule?: string;
  reason: string;
  triggerEvidence?: Record<string, unknown>;
  status: "Active" | "Resumed" | "Expired";
  active?: boolean;
  createdByWallet?: string;
  createdAt: string;
  expiresAt?: string;
  resumeAuthorityWallets?: string[];
  resumeRequiresApproval?: boolean;
  resumeQuorum?: number;
  resumeApprovalRequestId?: string;
  resumedByWallet?: string;
  resumeReason?: string;
  resumedAt?: string;
  updatedAt?: string;
}

interface DashboardStats {
  activeShields: number;
  protectedActions: number;
  blockedActions: number;
  reviewRequired: number;
  casperAuditRecords: number;
  activeEmergencyPauses?: number;
}

interface ThreatIntelligenceStatus {
  status?: "available" | "stale" | "unavailable" | string;
  sourceType?: string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  indicatorCount?: number;
  activeIndicatorCount?: number;
  ageMs?: number | null;
  maxAgeMs?: number | null;
  error?: string;
}

interface OracleValidationStatus {
  status?: "available" | "stale" | "unavailable" | string;
  sourceType?: string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  observationCount?: number;
  pairCount?: number;
  ageMs?: number | null;
  maxAgeMs?: number | null;
  error?: string;
}


interface ComplianceControlsStatus {
  status?: "available" | "stale" | "unavailable" | string;
  sourceType?: string;
  sourceName?: string;
  generatedAt?: string;
  fetchedAt?: string;
  indicatorCount?: number;
  activeIndicatorCount?: number;
  jurisdictionCount?: number;
  activeJurisdictionCount?: number;
  ageMs?: number | null;
  maxAgeMs?: number | null;
  error?: string;
}

interface X402PaymentControlsStatus {
  status?: "foundation-available" | string;
  protocolVersion?: number;
  supportedVersions?: number[];
  supportedSchemes?: string[];
  supportedRecipientFamilies?: string[];
  requestBinding?: boolean;
  replayProtection?: boolean;
  settlementReporting?: boolean;
  securityBoundary?: string;
}

interface ReviewResolution {
  strategy: ReviewResolutionMode | string;
  mode: "not_required" | "blocked" | "agent_remediation" | "human_approval" | string;
  state: string;
  humanActionRequired: boolean;
  agentActionRequired?: boolean;
  canAgentRetry: boolean;
  mayAutoResume?: boolean;
  requiredActions: string[];
  summary: string;
}

interface DecisionExplanation {
  decision: Decision;
  strategy?: ReviewResolutionMode | string;
  summary: string;
  primaryReason: string;
  triggeredRule: string;
  suggestedResolution: string;
  userMessage: string;
  agentInstruction: string;
  humanActionRequired: boolean;
  reviewMode: string;
  reviewState: string;
  canAgentRetry: boolean;
  requiredActions: string[];
  code?: string;
  module?: string;
  field?: string;
  expected?: unknown;
  received?: unknown;
  mismatchFields?: string[];
  details?: Record<string, unknown>;
}

interface DecisionResult {
  decision: Decision;
  risk: Risk;
  riskScore: number;
  policyChecksPassed: string[];
  policyChecksFailed: string[];
  reason: string;
  recommendedAction: string;
  primaryReason?: string;
  triggeredRule?: string;
  suggestedResolution?: string;
  decisionExplanation?: DecisionExplanation;
  reviewResolution?: ReviewResolution;
  moduleFindings?: ModuleFinding[];
  modulesEvaluated?: string[];
  capabilityContext?: ExecutionCapability[];
  pipelineStages?: PipelineStage[];
  emergencyControlsContext?: {
    active?: boolean;
    automaticPauseActivated?: boolean;
    effectiveDecision?: Decision;
    matchingPauses?: Array<{
      id?: string;
      scopeType?: string;
      scopeValue?: string;
      reason?: string;
      triggerType?: string;
      triggerRule?: string;
      enforcementAction?: Decision;
      createdAt?: string;
      expiresAt?: string;
    }>;
    pause?: EmergencyPause;
  };
  threatIntelligenceContext?: {
    status?: string;
    sourceType?: string;
    sourceName?: string;
    generatedAt?: string;
    fetchedAt?: string;
    indicatorCount?: number;
    activeIndicatorCount?: number;
    error?: string;
    mode?: string;
    unavailableAction?: string;
    minConfidence?: number;
    checkedEntities?: Array<Record<string, unknown>>;
    matchedIndicators?: Array<Record<string, unknown>>;
  };
  oracleValidationContext?: {
    status?: string;
    sourceType?: string;
    sourceName?: string;
    generatedAt?: string;
    fetchedAt?: string;
    observationCount?: number;
    pairCount?: number;
    error?: string;
    mode?: string;
    unavailableAction?: string;
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
  };
  complianceControlsContext?: {
    status?: string;
    sourceType?: string;
    sourceName?: string;
    generatedAt?: string;
    fetchedAt?: string;
    indicatorCount?: number;
    activeIndicatorCount?: number;
    jurisdictionCount?: number;
    activeJurisdictionCount?: number;
    error?: string;
    mode?: string;
    unavailableAction?: string;
    requiredActions?: string[];
    requireOriginatorAttestation?: boolean;
    requireBeneficiaryAttestation?: boolean;
    requireTravelRule?: boolean;
    travelRuleThreshold?: number;
    requireSanctionsScreening?: boolean;
    originatorJurisdiction?: string;
    beneficiaryJurisdiction?: string;
    counterpartyType?: string;
    originatorAttestationStatus?: string;
    beneficiaryAttestationStatus?: string;
    travelRuleStatus?: string;
    screeningStatus?: string;
    riskRating?: string;
    checkedEntities?: Array<Record<string, unknown>>;
    matchedIndicators?: Array<Record<string, unknown>>;
    matchedJurisdictions?: Array<Record<string, unknown>>;
  };
  x402PaymentControlsContext?: {
    status?: string;
    mode?: string;
    unavailableAction?: string;
    version?: string | number;
    scheme?: string;
    method?: string;
    resourceUrl?: string;
    merchantDomain?: string;
    payTo?: string;
    network?: string;
    asset?: string;
    facilitator?: string;
    amountAtomic?: string;
    amount?: number | null;
    validUntil?: string;
    requestId?: string;
    requestBodyHash?: string;
    paymentRequiredHash?: string;
    requestFingerprint?: string;
    clientFingerprint?: string;
    recipientFamily?: string;
    settlementStatus?: string;
    settlementAttempt?: number;
    hourlyCount?: number;
    dailySpend?: number;
    monthlySpend?: number;
    previousFingerprintCount?: number;
  };
  rpcChainIntegrityContext?: Record<string, unknown>;
  gasSponsorshipFeeSafetyContext?: Record<string, unknown>;
  executionIntegrityContext?: {
    status?: string;
    mode?: string;
    unavailableAction?: string;
    enabled?: boolean;
    intentId?: string;
    idempotencyKey?: string;
    sequence?: number | null;
    createdAt?: string;
    expiresAt?: string;
    retryOf?: string;
    replacementOf?: string;
    attempt?: number;
    fingerprint?: string;
    clientFingerprint?: string;
    previousIntentIdCount?: number;
    previousIdempotencyCount?: number;
    previousFingerprintCount?: number;
    highestSequence?: number;
    replayWindowSeconds?: number;
    maxRetryAttempts?: number;
  };
  instructionIntegrityContext?: {
    enabled?: boolean;
    mode?: string;
    metadataSupplied?: boolean;
    requiresGoal?: boolean;
    goalId?: string;
    originalUserGoalHash?: string;
    initiatedBy?: string;
    intentSource?: string;
    toolName?: string;
    toolServer?: string;
    sourceDomains?: string[];
    externalContentUsed?: boolean;
    userConfirmed?: boolean;
    sourceTrustLevel?: string;
    parameterChangeReason?: string;
    originalParameterHash?: string;
    suppliedCurrentParameterHash?: string;
    currentParameterHash?: string;
    computedCurrentParameterHash?: string;
    parametersChanged?: boolean;
    originalPermissionScopes?: string[];
    currentPermissionScopes?: string[];
    addedPermissionScopes?: string[];
    selfAuthorizingPayment?: boolean;
    violations?: Array<{ rule?: string; message?: string }>;
    limitation?: string;
  };
  tokenPermissionControlsContext?: {
    permissionType?: string;
    owner?: string;
    tokenContract?: string;
    spender?: string;
    approvalAmount?: number | null;
    intendedTransactionAmount?: number | null;
    unlimited?: boolean;
    nonce?: string;
    permitId?: string;
    deadline?: string;
    network?: string;
    fingerprint?: string;
    replayStatus?: string;
    mode?: string;
  };
  privilegedActionControlsContext?: {
    metadataSupplied?: boolean;
    declaredAction?: string;
    classifiedAction?: string;
    methodClassifiedAction?: string;
    classificationContradiction?: boolean;
    contract?: string;
    package?: string;
    entryPoint?: string;
    methodSignature?: string;
    currentValue?: unknown;
    requestedValue?: unknown;
    role?: string;
    recipient?: string;
    implementation?: string;
    classifierSource?: string;
    classifierVersion?: string;
    network?: string;
    parameterFingerprint?: string;
    classificationStatus?: string;
    approvalRequired?: boolean;
    requiredApprovalCount?: number;
  };
  contractArgumentPoliciesContext?: {
    target?: string;
    entryPoint?: string;
    ruleId?: string;
    mode?: string;
    parameterFingerprint?: string;
    evaluatedArguments?: string[];
    requiredArguments?: string[];
    allowedArguments?: string[];
    violations?: Array<{ rule?: string; message?: string }>;
  };
  bridgeControlsContext?: {
    status?: string;
    mode?: string;
    unavailableAction?: string;
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
  };
}

interface CasperPreparedPayload {
  auditLog: AuditLog;
  payload: Record<string, unknown>;
  payloadHash: string;
  casper: {
    network?: string;
    rpcUrl?: string;
    contractHash?: string;
    recordingMode?: string;
    contractConfigured?: boolean;
  };
  contractEntrypoint: string;
  runtimeArgs: Record<string, unknown>;
}



interface AgentGatewayResponse {
  ok: boolean;
  gatewayRequest: {
    id: string;
    source: string;
    agentId: string;
    walletAddress: string;
    agentOwnerWalletAddress?: string;
    executionWalletAddress?: string;
    actionType: ActionType;
    amount: number;
    asset: string;
    target: string;
    targetType: TargetType;
    status: string;
    auditLogId: string;
  };
  result: DecisionResult;
  auditLog: AuditLog;
  casperPayload: CasperPreparedPayload;
  executionApproved: boolean;
  approval?: ApprovalRequest | null;
  reviewResolution?: ReviewResolution;
  decisionExplanation?: DecisionExplanation;
  agentMessage?: string;
  emergencyPause?: EmergencyPause | null;
  nextAction: string;
}

// ──────────────────────────────────────────────────────────
// Static Catalog
// ──────────────────────────────────────────────────────────

const initialAgents: Agent[] = [];

const initialPolicies: Policy[] = [];

const initialAuditLogs: AuditLog[] = [];

// ──────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, n = 16) {
  if (s.length <= n) return s;
  return s.slice(0, 8) + "..." + s.slice(-6);
}

const CASPER_TESTNET_EXPLORER = "https://testnet.cspr.live";
const DEPLOYED_MAGEN3_CONTRACT_HASH =
  import.meta.env.VITE_MAGEN3_CONTRACT_HASH ||
  "hash-b08ae51143e0d2fa78761e7819010e4c941dba3734252cdcf28ea7176cd4abcf";

function normalizeCasperDeployHash(value = "") {
  return value.trim().replace(/^hash-/i, "");
}

function isRealCasperDeployHash(value = "") {
  return /^[a-f0-9]{64}$/i.test(normalizeCasperDeployHash(value));
}

function casperDeployUrl(value = "") {
  const hash = normalizeCasperDeployHash(value);
  return `${CASPER_TESTNET_EXPLORER}/deploy/${hash}`;
}

function casperProofStatus(txHash = "") {
  if (!txHash) return { label: "Pending", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  if (isRealCasperDeployHash(txHash)) return { label: "Recorded on Casper", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  return { label: "Unconfirmed", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
}

function decisionProofStatus(log: AuditLog) {
  if (isRealCasperDeployHash(log.txHash)) return { label: "Recorded on Casper", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (log.decisionProofStatus === "failed") return { label: "Relayer Failed", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (log.decisionProofStatus === "queued") return { label: "Queued for Relayer", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (log.decisionProofStatus === "not_recordable") return { label: "Not Recordable", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  return casperProofStatus(log.txHash);
}

function auditAction(log: AuditLog) {
  const action = log.originalIntent?.action;
  return action && typeof action === "object" && !Array.isArray(action)
    ? action as Record<string, unknown>
    : {};
}

function auditAsset(log: AuditLog) {
  const asset = auditAction(log).asset;
  return typeof asset === "string" && asset.trim() ? asset.trim().toUpperCase() : "CSPR";
}

function auditX402Settlement(log: AuditLog) {
  const x402 = auditAction(log).x402;
  if (!x402 || typeof x402 !== "object" || Array.isArray(x402)) return null;
  const record = x402 as Record<string, unknown>;
  const settlement = record.settlement;
  return settlement && typeof settlement === "object" && !Array.isArray(settlement)
    ? settlement as Record<string, unknown>
    : record;
}

function canonicalExecutionStatus(status = "") {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["executed", "recorded", "settled", "success", "finalized", "x402_confirmed"].includes(normalized)) return "confirmed";
  if (["broadcast", "broadcasted", "x402_submitted"].includes(normalized)) return "submitted";
  if (["processing", "confirming", "x402_pending"].includes(normalized)) return "pending";
  if (["reverted", "dropped", "x402_failed"].includes(normalized)) return "failed";
  if (["unknown", "x402_uncertain"].includes(normalized)) return "uncertain";
  return normalized;
}

function executionNeedsAttention(log: AuditLog) {
  const state = canonicalExecutionStatus(log.settlementStatus || log.executionStatus || "");
  return ["submitted", "pending", "uncertain", "replaced"].includes(state)
    || log.resourceDeliveryStatus === "pending"
    || log.refundStatus === "pending";
}

function executionProofStatus(status = "", txHash = "") {
  const state = canonicalExecutionStatus(status);
  if (state === "delivered") return { label: "Delivered", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (state === "refunded") return { label: "Refunded", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (state === "confirmed") return { label: status === "x402_confirmed" ? "Payment confirmed" : "Confirmed", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (state === "submitted") return { label: status === "x402_submitted" ? "Settlement submitted" : "Submitted", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (state === "pending") return { label: status === "x402_pending" ? "Settlement pending" : "Pending finality", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (state === "uncertain") return { label: "Outcome uncertain", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (state === "replaced") return { label: "Replaced", className: "bg-[#A78BFA]/10 text-[#C4B5FD] border-[#A78BFA]/20" };
  if (state === "failed") return { label: status === "x402_failed" ? "Settlement failed" : "Execution failed", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (isRealCasperDeployHash(txHash)) return { label: "Executed", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (status === "approved_pending_signature") return { label: "Waiting for signature", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "blocked_not_submitted") return { label: "Blocked before execution", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (status === "review_approved_pending_signature") return { label: "Approval complete · waiting for signature", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (status === "review_rejected_not_submitted") return { label: "Approval rejected", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (status === "review_expired_not_submitted") return { label: "Approval expired", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (status === "review_required_not_submitted") return { label: "Review required", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "not_required") return { label: "Not required", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  return { label: "Not submitted", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
}

function executionProofExplanation(log: AuditLog) {
  const canonicalStatus = canonicalExecutionStatus(log.settlementStatus || log.executionStatus || "");
  if (canonicalStatus === "delivered") return "The authorized execution reached the configured finality requirement and the expected resource or destination delivery was reported.";
  if (canonicalStatus === "refunded") return "The authorized execution was reconciled to a refund. The refund transaction and history remain linked to this audit record.";
  if (canonicalStatus === "replaced") return "The original transaction was explicitly linked to a replacement. Track the replacement to a terminal state before any further retry.";
  if (canonicalStatus === "uncertain") return "The outcome is uncertain. Magen3 blocks unsafe automatic retry until the existing transaction is reconciled or an authorized replacement is linked.";
  if (canonicalStatus === "failed") return `The execution failed${log.executionFailureReason ? `: ${log.executionFailureReason}` : "."} A retry must use a fresh lifecycle-bound attempt and remain within the configured submission limit.`;
  if (canonicalStatus === "submitted" || canonicalStatus === "pending") return `The transaction is ${canonicalStatus}. Do not submit a duplicate while reconciliation is unresolved.`;
  if (canonicalStatus === "confirmed" && log.action !== "x402 Payment") return `The execution reached ${log.executionConfirmations || 0} of ${log.executionRequiredConfirmations || 1} configured confirmations or was explicitly reported finalized.`;
  if (log.action === "x402 Payment") {
    const settlement = auditX402Settlement(log);
    const resourceDelivered = settlement?.resourceDelivered === true;
    if (log.executionStatus === "x402_confirmed") {
      return resourceDelivered
        ? "The external x402 adapter reported confirmed settlement and successful paid-resource delivery for this authorized request fingerprint."
        : "The external x402 adapter reported confirmed settlement. Paid-resource delivery has not yet been reported.";
    }
    if (log.executionStatus === "x402_uncertain") return "Settlement outcome is uncertain. Magen3 prevents an automatic duplicate payment until the existing attempt is reconciled.";
    if (log.executionStatus === "x402_failed") return "The external adapter reported a failed settlement. Any retry must follow the active attempt limit and use the authorized request fingerprint.";
    if (log.executionStatus === "x402_submitted" || log.executionStatus === "x402_pending") return "The payment has been submitted but is not confirmed. Do not create another payment authorization while reconciliation is pending.";
    if (log.decision === "Blocked") return "No payment was authorized because Magen3 blocked the x402 request before PAYMENT-SIGNATURE creation.";
    if (log.decision === "Review Required") return "No payment should be signed until an authorized reviewer resolves the x402 policy finding.";
    return "Magen3 authorized the payment requirements. The external adapter must sign, settle, and report the real settlement state separately.";
  }
  if (isRealCasperDeployHash(log.executionTxHash || "")) {
    return "The approved action was signed and submitted. The execution deploy hash is the real Casper transaction footprint.";
  }
  if (log.executionStatus === "blocked_not_submitted" || log.decision === "Blocked") {
    return "No execution hash exists because Magen3 blocked this action before wallet signing.";
  }
  if (log.executionStatus === "review_approved_pending_signature" || (log.decision === "Review Required" && log.approvalStatus === "Approved")) {
    return "The exact-bound approval workflow completed before expiry. The execution hash appears only after the human-controlled wallet signs and submits the unchanged transaction.";
  }
  if (log.executionStatus === "review_rejected_not_submitted" || log.approvalStatus === "Rejected") {
    return "No execution hash exists because an authorized approver rejected the exact-bound request.";
  }
  if (log.executionStatus === "review_expired_not_submitted" || log.approvalStatus === "Expired") {
    return "No execution hash exists because the exact-bound approval expired before wallet signing.";
  }
  if (log.executionStatus === "review_required_not_submitted" || log.decision === "Review Required") {
    return "No execution hash exists yet because Magen3 required human review before wallet signing.";
  }
  if (log.executionStatus === "approved_pending_signature" || log.decision === "Allowed") {
    return "Magen3 approved this action. The execution hash appears only after the execution wallet signs and submits the real Casper transaction.";
  }
  return "Execution proof is not required for this record.";
}

async function sha256Hex(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot create the required Instruction Integrity goal hash. Use a secure browser context and retry.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function writeClipboard(value: string) {
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Some local or embedded browser contexts block navigator.clipboard.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getActivePolicy(policies: Policy[], agentId: string) {
  return policies.find((p) => p.agentId === agentId && p.status === "Active");
}

function deriveDashboardStats(auditLogs: AuditLog[], policies: Policy[]): DashboardStats {
  return {
    activeShields: policies.some((p) => p.status === "Active") ? 1 : 0,
    protectedActions: auditLogs.length,
    blockedActions: auditLogs.filter((log) => log.decision === "Blocked").length,
    reviewRequired: auditLogs.filter((log) => log.decision === "Review Required").length,
    casperAuditRecords: auditLogs.filter((log) => isRealCasperDeployHash(log.txHash)).length,
  };
}

function clampPercentage(value: unknown, fallback = 70) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : fallback;
}

function parseAssetDecimals(value: string) {
  return Object.fromEntries(value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[=:]/, 2).map((part) => part.trim()))
    .filter(([asset, decimals]) => Boolean(asset) && Number.isInteger(Number(decimals)) && Number(decimals) >= 0 && Number(decimals) <= 30)
    .map(([asset, decimals]) => [asset.toUpperCase(), Number(decimals)]));
}

function stringifyAssetDecimals(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "USDC=6";
  const lines = Object.entries(value as Record<string, unknown>)
    .filter(([, decimals]) => Number.isInteger(Number(decimals)) && Number(decimals) >= 0 && Number(decimals) <= 30)
    .map(([asset, decimals]) => `${asset.toUpperCase()}=${Number(decimals)}`);
  return lines.length ? lines.join("\n") : "USDC=6";
}

function parsePrivilegedQuorumRules(value: string) {
  return Object.fromEntries(value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[=:]/, 2).map((part) => part.trim()))
    .filter(([action, count]) => Boolean(action) && Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 10)
    .map(([action, count]) => [action, Number(count)]));
}

function stringifyPrivilegedQuorumRules(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, count]) => Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 10)
    .map(([action, count]) => `${action}=${Number(count)}`)
    .join("\n");
}

// ──────────────────────────────────────────────────────────
// Design tokens / shared classes
// ──────────────────────────────────────────────────────────

const CARD = "bg-[#111827] border border-[#1E293B] rounded-xl";
const CARD_GLOW =
  "bg-[#111827] border border-[#1E293B] rounded-xl";
const INPUT_CLS =
  "w-full bg-[#0B1220] border border-[#1E293B] rounded-lg px-3 py-2 text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/30";
const LABEL_CLS = "block text-xs font-medium text-[#94A3B8] mb-1.5 uppercase tracking-wider";
const SECTION_TITLE = "text-lg font-semibold text-[#F8FAFC] font-['Space_Grotesk']";

// ──────────────────────────────────────────────────────────
// Reusable components
// ──────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: Decision }) {
  const map: Record<Decision, string> = {
    Allowed: "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30",
    Blocked: "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30",
    "Review Required":
      "bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30",
  };
  const icons: Record<Decision, ReactElement> = {
    Allowed: <CheckCircle size={12} />,
    Blocked: <XCircle size={12} />,
    "Review Required": <Clock size={12} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${map[decision]}`}
    >
      {icons[decision]}
      {decision}
    </span>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  const map: Record<Risk, string> = {
    Low: "bg-[#22C55E]/10 text-[#22C55E]",
    Medium: "bg-[#F59E0B]/10 text-[#F59E0B]",
    High: "bg-[#EF4444]/10 text-[#EF4444]",
    Critical: "bg-[#FF3B3B]/15 text-[#FF3B3B]",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[risk]}`}
    >
      {risk}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "Available" | "Live" | "Foundation Available" | "Preview" | "Planned" | "Coming Soon" | "Active" | "Inactive" | "Policy Active" | "No Policy" | "Paused" | "Attention" | "Resumed" | "Expired" | "Revoked";
}) {
  const map: Record<string, string> = {
    Available: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    Live: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    "Foundation Available": "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30",
    Planned: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    Active: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    "Policy Active": "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    Preview: "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30",
    "Coming Soon": "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    Inactive: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    "No Policy": "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    Paused: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    Attention: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30",
    Resumed: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    Expired: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    Revoked: "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[status] || map["Coming Soon"]}`}
    >
      {status}
    </span>
  );
}


function CapabilityChips({ capabilities, compact = false }: { capabilities?: ExecutionCapability[]; compact?: boolean }) {
  const items = normalizeCapabilities(capabilities);
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((capability) => (
        <span
          key={capability}
          className={`inline-flex rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 font-semibold text-[#22D3EE] ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
        >
          {capability}
        </span>
      ))}
    </div>
  );
}

function CoverageCard({
  agent,
  policy,
  logs,
  onNavigate,
  compact = false,
}: {
  agent: Agent;
  policy?: Policy;
  logs: AuditLog[];
  onNavigate?: (page: Page) => void;
  compact?: boolean;
}) {
  const coverage = calculateSecurityCoverage(agent, policy, logs);
  return (
    <div className={`${CARD} ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Security Coverage</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`${compact ? "text-xl" : "text-3xl"} font-bold font-['Space_Grotesk'] text-[#F8FAFC]`}>{coverage.score}%</span>
            <span className="text-xs font-semibold text-[#22D3EE]">{coverage.label}</span>
          </div>
        </div>
        <ShieldCheck size={compact ? 18 : 22} className="text-[#22D3EE]" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1E293B]">
        <div className="h-full rounded-full bg-[#22D3EE] transition-all" style={{ width: `${coverage.score}%` }} />
      </div>
      {!compact && (
        <>
          <div className="mt-4 space-y-2">
            {coverage.recommendations.slice(0, 3).map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => item.page && onNavigate?.(item.page as Page)}
                className="flex w-full items-start gap-2 rounded-lg border border-[#1E293B] bg-[#0B1220] p-2.5 text-left hover:border-[#334155]"
              >
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[#F59E0B]" />
                <span className="text-xs leading-relaxed text-[#94A3B8]">{item.recommendation}</span>
              </button>
            ))}
            {coverage.recommendations.length === 0 && (
              <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/10 p-2.5 text-xs text-[#BBF7D0]">
                All currently measurable configuration checks are covered.
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">
            Coverage reflects configured protection and observed integration state. It is not a guarantee against every exploit.
          </p>
        </>
      )}
    </div>
  );
}

function PipelineTimeline({ stages, developerMode = false }: { stages?: PipelineStage[]; developerMode?: boolean }) {
  const items = Array.isArray(stages) && stages.length > 0 ? stages : [
    { id: "intent-received", label: "Intent received", status: "pending" as const },
    { id: "agent-authentication", label: "Agent authentication", status: "pending" as const },
    { id: "policy-loaded", label: "Policy loaded", status: "pending" as const },
    { id: "protection-checks", label: "Protection checks", status: "pending" as const },
    { id: "risk-assessment", label: "Risk assessment", status: "pending" as const },
    { id: "decision", label: "Decision", status: "pending" as const },
    { id: "audit-stored", label: "Audit stored", status: "pending" as const },
    { id: "casper-proof", label: "Casper decision proof", status: "pending" as const },
  ];
  const classMap: Record<string, string> = {
    completed: "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]",
    warning: "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]",
    failed: "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]",
    pending: "border-[#1E293B] bg-[#0B1220] text-[#94A3B8]",
    skipped: "border-[#1E293B] bg-[#050B14] text-[#64748B]",
  };
  return (
    <div className="space-y-2">
      {items.map((stage, index) => (
        <div key={`${stage.id}-${index}`} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${classMap[stage.status] || classMap.pending}`}>
              {stage.status === "completed" ? <CheckCircle size={14} /> : stage.status === "failed" ? <XCircle size={14} /> : stage.status === "warning" ? <AlertTriangle size={14} /> : <span>{index + 1}</span>}
            </span>
            {index < items.length - 1 && <span className="h-5 w-px bg-[#1E293B]" />}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="text-sm font-medium text-[#F8FAFC]">{stage.label}</div>
            <div className="mt-0.5 text-xs capitalize text-[#94A3B8]">
              {stage.status}{stage.timestamp ? ` · ${fmtTs(stage.timestamp)}` : ""}
            </div>
            {developerMode && <div className="mt-1 break-all font-mono text-[10px] text-[#64748B]">stage: {stage.id}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FindingsPanel({ findings, developerMode = false }: { findings?: ModuleFinding[]; developerMode?: boolean }) {
  const items = Array.isArray(findings) ? findings : [];
  if (items.length === 0) {
    return <div className="rounded-lg border border-dashed border-[#1E293B] bg-[#0B1220] p-4 text-sm text-[#94A3B8]">No structured module findings are available for this legacy record.</div>;
  }
  const classMap: Record<string, string> = {
    pass: "border-[#22C55E]/25 bg-[#22C55E]/5",
    warning: "border-[#F59E0B]/25 bg-[#F59E0B]/5",
    fail: "border-[#EF4444]/25 bg-[#EF4444]/5",
    unavailable: "border-[#22D3EE]/20 bg-[#22D3EE]/5",
    skipped: "border-[#1E293B] bg-[#0B1220]",
  };
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.module}-${item.rule}-${index}`} className={`rounded-xl border p-3 ${classMap[item.status] || classMap.skipped}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-sm text-[#F8FAFC]">{item.module}</div>
            <span className="rounded-full border border-[#1E293B] bg-[#050B14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">{item.status}</span>
          </div>
          <div className="mt-1 text-xs font-medium text-[#22D3EE]">{item.rule}</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{item.message}</p>
          {item.remediation && <p className="mt-2 text-xs leading-relaxed text-[#F8FAFC]"><span className="font-semibold">Resolution:</span> {item.remediation}</p>}
          {item.evidence && Object.keys(item.evidence).length > 0 && (
            <details className="mt-2 rounded-lg border border-[#1E293B] bg-[#020617] p-2" open={developerMode}>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Technical evidence</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[#94A3B8]">{JSON.stringify(item.evidence, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function IntegrationHealthPanel({ agent, policy, logs, apiOnline, emergencyPauses = [], compact = false }: { agent: Agent; policy?: Policy; logs: AuditLog[]; apiOnline: boolean; emergencyPauses?: EmergencyPause[]; compact?: boolean }) {
  const health = deriveIntegrationHealth(agent, policy, logs, apiOnline, emergencyPauses);
  const attentionStatuses = new Set(["attention", "unavailable", "pending"]);
  const counts = health.checks.reduce((summary, check) => {
    if (check.status === "healthy") summary.healthy += 1;
    else if (attentionStatuses.has(check.status)) summary.attention += 1;
    else if (check.status === "observed") summary.observed += 1;
    else summary.notObserved += 1;
    return summary;
  }, { healthy: 0, attention: 0, observed: 0, notObserved: 0 });
  const attentionChecks = health.checks.filter((check) => attentionStatuses.has(check.status));
  const essentialLabels = ["Gateway connectivity", "API credential", "Active policy", "Audit synchronization", "Casper proof service"];
  const healthyEssentials = essentialLabels
    .map((label) => health.checks.find((check) => check.label === label))
    .filter((check): check is (typeof health.checks)[number] => Boolean(check));
  const visibleChecks = attentionChecks.length > 0 ? attentionChecks.slice(0, 4) : healthyEssentials.slice(0, 5);
  const statusMeta = (status: string) => {
    if (status === "healthy") return { label: "Healthy", dot: "bg-[#22C55E]", text: "text-[#22C55E]" };
    if (status === "attention") return { label: "Attention", dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" };
    if (status === "unavailable") return { label: "Unavailable", dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" };
    if (status === "pending") return { label: "Pending", dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" };
    if (status === "observed") return { label: "Observed", dot: "bg-[#22D3EE]", text: "text-[#22D3EE]" };
    return { label: "Not observed", dot: "bg-[#64748B]", text: "text-[#64748B]" };
  };

  if (!compact) {
    return (
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Integration Health</div>
            <div className="mt-1 text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{health.overall}</div>
          </div>
          <Activity size={20} className={health.overall === "Healthy" ? "text-[#22C55E]" : "text-[#F59E0B]"} />
        </div>
        <div className="mt-3 space-y-2">
          {health.checks.map((check) => {
            const meta = statusMeta(check.status);
            return (
              <div key={check.label} className="flex items-start justify-between gap-3 rounded-lg bg-[#0B1220] p-2.5">
                <div>
                  <div className="text-xs font-medium text-[#F8FAFC]">{check.label}</div>
                  <div className="mt-0.5 text-[11px] text-[#94A3B8]">{check.detail}</div>
                </div>
                <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${meta.dot}`} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Integration Health</div>
          <div className="mt-1 text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{health.overall}</div>
          <div className="mt-1 text-xs text-[#94A3B8]">Operational checks are summarised here. Full evidence remains available below.</div>
        </div>
        <Activity size={20} className={health.overall === "Healthy" ? "text-[#22C55E]" : "text-[#F59E0B]"} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Healthy", counts.healthy, "text-[#22C55E]"],
          ["Attention", counts.attention, counts.attention > 0 ? "text-[#F59E0B]" : "text-[#94A3B8]"],
          ["Observed", counts.observed, "text-[#22D3EE]"],
          ["Not observed", counts.notObserved, "text-[#64748B]"],
        ].map(([label, value, colour]) => (
          <div key={String(label)} className="rounded-lg border border-[#1E293B] bg-[#0B1220] px-2.5 py-2">
            <div className={`text-base font-bold ${String(colour)}`}>{String(value)}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#64748B]">{String(label)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
          {attentionChecks.length > 0 ? "Needs attention" : "Core services"}
        </div>
        <div className="divide-y divide-[#1E293B] rounded-xl border border-[#1E293B] bg-[#0B1220]">
          {visibleChecks.map((check) => {
            const meta = statusMeta(check.status);
            return (
              <div key={check.label} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="truncate text-xs font-semibold text-[#F8FAFC]">{check.label}</span>
                  </div>
                  {attentionChecks.length > 0 && <div className="mt-1 line-clamp-2 pl-4 text-[11px] leading-relaxed text-[#94A3B8]">{check.detail}</div>}
                </div>
                <span className={`shrink-0 text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
              </div>
            );
          })}
        </div>
        {attentionChecks.length > visibleChecks.length && (
          <div className="mt-2 text-[11px] text-[#F59E0B]">+{attentionChecks.length - visibleChecks.length} additional health {attentionChecks.length - visibleChecks.length === 1 ? "item needs" : "items need"} attention.</div>
        )}
      </div>

      <details className="group mt-4 border-t border-[#1E293B] pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[#22D3EE]">
          <span>View all {health.checks.length} health checks</span>
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 divide-y divide-[#1E293B] rounded-xl border border-[#1E293B] bg-[#050B14]">
          {health.checks.map((check) => {
            const meta = statusMeta(check.status);
            return (
              <details key={check.label} className="group/check px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="truncate text-xs font-medium text-[#F8FAFC]">{check.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
                    <ChevronDown size={12} className="text-[#64748B] transition-transform group-open/check:rotate-180" />
                  </div>
                </summary>
                <div className="mt-2 pl-4 text-[11px] leading-relaxed text-[#94A3B8]">{check.detail}</div>
              </details>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function EmergencyControlsPanel({
  pauses,
  agents,
  policies,
  walletAddress,
  selectedAgentId = "",
  compact = false,
  onCreatePause,
  onResumePause,
}: {
  pauses: EmergencyPause[];
  agents: Agent[];
  policies: Policy[];
  walletAddress: string;
  selectedAgentId?: string;
  compact?: boolean;
  onCreatePause: (body: Record<string, unknown>) => Promise<unknown>;
  onResumePause: (id: string, reason: string) => Promise<unknown>;
}) {
  const initialScope = selectedAgentId ? "Agent" : "Platform";
  const [scopeType, setScopeType] = useState(initialScope);
  const [scopeValue, setScopeValue] = useState(selectedAgentId);
  const [scopeAgentId, setScopeAgentId] = useState(selectedAgentId || agents[0]?.id || "");
  const [enforcementAction, setEnforcementAction] = useState<"Blocked" | "Review Required">("Blocked");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [resumeRequiresApproval, setResumeRequiresApproval] = useState(false);
  const [resumeQuorum, setResumeQuorum] = useState("1");
  const [resumeReasons, setResumeReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selectedAgentId) {
      setScopeType("Agent");
      setScopeAgentId(selectedAgentId);
      setScopeValue(selectedAgentId);
    }
  }, [selectedAgentId]);

  const visiblePauses = pauses.filter((pause) => !selectedAgentId || !pause.agentId || pause.agentId === selectedAgentId);
  const activePauses = visiblePauses.filter((pause) => pause.active === true || pause.status === "Active");
  const scopeOptions = selectedAgentId
    ? ["Agent", "Capability", "Action", "Policy", "Trading", "Contract", "Bridge", "x402"]
    : ["Platform", "All Execution", "Agent", "Capability", "Action", "Policy", "Trading", "Contract", "Bridge", "x402"];

  const resolvedAgentId = selectedAgentId || scopeAgentId;
  const scopedAgent = agents.find((agent) => agent.id === resolvedAgentId);
  const scopedPolicies = policies.filter((policy) => policy.agentId === resolvedAgentId);
  const resolvedScopeValue = scopeType === "Agent" ? resolvedAgentId : scopeValue;
  const requiresAgent = !["Platform", "All Execution"].includes(scopeType);
  const createPause = async () => {
    setMessage("");
    setBusy("create");
    try {
      await onCreatePause({
        walletAddress,
        agentId: requiresAgent ? resolvedAgentId : "",
        policyId: scopeType === "Policy" ? resolvedScopeValue : "",
        scopeType,
        scopeValue: ["Platform", "All Execution", "Trading", "Contract", "Bridge", "x402"].includes(scopeType) ? scopeType : resolvedScopeValue,
        enforcementAction,
        reason,
        durationSeconds: Math.max(60, Number(durationMinutes || 60) * 60),
        resumeRequiresApproval,
        resumeQuorum: Math.max(1, Number(resumeQuorum || 1)),
      });
      setReason("");
      setMessage("Emergency pause activated and recorded in the audit trail.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to activate emergency pause.");
    } finally {
      setBusy("");
    }
  };

  const resumePause = async (pause: EmergencyPause) => {
    setMessage("");
    setBusy(pause.id);
    try {
      await onResumePause(pause.id, resumeReasons[pause.id] || "Resolved incident and verified safe operation.");
      setMessage(pause.resumeRequiresApproval ? "Emergency resume approval request created or updated." : "Emergency pause resumed and audited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to resume emergency pause.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#EF4444]"><ShieldAlert size={18} /><h3 className="text-sm font-semibold text-[#F8FAFC]">Emergency Circuit Breaker</h3></div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Pause execution deterministically before signing. Every activation, expiry, approval request, and resume is audited.</p>
        </div>
        <StatusBadge status={activePauses.length ? "Attention" : "Live"} />
      </div>

      {activePauses.length > 0 && (
        <div className="mt-4 space-y-3">
          {activePauses.map((pause) => (
            <div key={pause.id} className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[#F8FAFC]">{pause.scopeType}{pause.scopeValue ? ` · ${pause.scopeValue}` : ""}</div>
                  <div className="mt-1 text-xs leading-relaxed text-[#FCA5A5]">{pause.reason}</div>
                  <div className="mt-1 text-[11px] text-[#94A3B8]">{pause.triggerType} · {pause.enforcementAction}{pause.expiresAt ? ` · expires ${fmtTs(pause.expiresAt)}` : " · indefinite"}</div>
                </div>
                <StatusBadge status={pause.status} />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className={INPUT_CLS}
                  value={resumeReasons[pause.id] || ""}
                  onChange={(event) => setResumeReasons((current) => ({ ...current, [pause.id]: event.target.value }))}
                  placeholder="Reason for resuming after investigation"
                />
                <Btn variant="secondary" size="sm" disabled={busy === pause.id} onClick={() => void resumePause(pause)}>
                  {pause.resumeRequiresApproval ? <Clock size={14} /> : <ShieldCheck size={14} />}
                  {busy === pause.id ? "Processing…" : pause.resumeRequiresApproval ? "Request Resume" : "Resume"}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4" open={!compact && activePauses.length === 0}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-xs font-semibold text-[#FCA5A5] hover:border-[#EF4444]/40"><ShieldX size={14} />Activate Emergency Pause</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className={LABEL_CLS}>Scope</label><select className={INPUT_CLS} value={scopeType} onChange={(event) => { const next = event.target.value; setScopeType(next); setScopeValue(next === "Agent" ? (selectedAgentId || scopeAgentId) : ""); }}>{scopeOptions.map((scope) => <option key={scope}>{scope}</option>)}</select></div>
          <div><label className={LABEL_CLS}>Enforcement</label><select className={INPUT_CLS} value={enforcementAction} onChange={(event) => setEnforcementAction(event.target.value as "Blocked" | "Review Required")}><option>Blocked</option><option>Review Required</option></select></div>
          {requiresAgent && !selectedAgentId && (
            <div className="sm:col-span-2"><label className={LABEL_CLS}>Agent</label><select className={INPUT_CLS} value={scopeAgentId} onChange={(event) => { setScopeAgentId(event.target.value); if (scopeType === "Agent") setScopeValue(event.target.value); else setScopeValue(""); }}><option value="">Select agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.id}</option>)}</select></div>
          )}
          {scopeType === "Capability" && (
            <div className="sm:col-span-2"><label className={LABEL_CLS}>Capability</label><select className={INPUT_CLS} value={scopeValue} onChange={(event) => setScopeValue(event.target.value)}><option value="">Select capability</option>{normalizeCapabilities(scopedAgent?.executionCapabilities, scopedAgent?.type).map((capability) => <option key={capability}>{capability}</option>)}</select></div>
          )}
          {scopeType === "Action" && (
            <div className="sm:col-span-2"><label className={LABEL_CLS}>Action type</label><input className={INPUT_CLS} value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder="Transfer, Swap, Bridge, Contract Interaction…" /></div>
          )}
          {scopeType === "Policy" && (
            <div className="sm:col-span-2"><label className={LABEL_CLS}>Policy</label><select className={INPUT_CLS} value={scopeValue} onChange={(event) => setScopeValue(event.target.value)}><option value="">Select policy</option>{scopedPolicies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {policy.id}</option>)}</select></div>
          )}
          <div><label className={LABEL_CLS}>Duration (minutes)</label><input className={INPUT_CLS} type="number" min="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} /></div>
          <div><label className={LABEL_CLS}>Resume quorum</label><input className={INPUT_CLS} type="number" min="1" max="10" value={resumeQuorum} onChange={(event) => setResumeQuorum(event.target.value)} disabled={!resumeRequiresApproval} /></div>
          <label className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0B1220] p-3 text-xs text-[#94A3B8]"><input type="checkbox" checked={resumeRequiresApproval} onChange={(event) => setResumeRequiresApproval(event.target.checked)} /> Require Human Approval quorum before resume</label>
          <div className="sm:col-span-2"><label className={LABEL_CLS}>Incident reason</label><textarea className={`${INPUT_CLS} min-h-20`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the incident, anomaly, provider failure, or operator concern." /></div>
        </div>
        <div className="mt-3 flex justify-end"><Btn variant="danger" disabled={busy === "create" || reason.trim().length < 8 || (requiresAgent && !resolvedAgentId) || (["Capability", "Action", "Policy"].includes(scopeType) && !resolvedScopeValue)} onClick={() => void createPause()}><ShieldX size={14} />{busy === "create" ? "Activating…" : "Activate Pause"}</Btn></div>
      </details>
      {message && <div className="mt-3 rounded-lg border border-[#1E293B] bg-[#0B1220] p-3 text-xs text-[#F8FAFC]">{message}</div>}
    </div>
  );
}

function Btn({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-[#22D3EE] hover:bg-[#06B6D4] text-[#050B14] font-semibold",
    secondary:
      "bg-[#1E293B] hover:bg-[#263548] text-[#F8FAFC] border border-[#1E293B]",
    danger:
      "bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] border border-[#EF4444]/30",
    ghost: "hover:bg-[#1E293B] text-[#94A3B8] hover:text-[#F8FAFC]",
    outline:
      "border border-[#22D3EE] text-[#22D3EE] hover:bg-[#22D3EE]/10",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2 text-sm rounded-lg",
    lg: "px-6 py-3 text-base rounded-xl",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 ${variants[variant]} ${sizes[size]} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {children}
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input
        type={type}
        className={INPUT_CLS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <textarea
        className={`${INPUT_CLS} min-h-24 resize-y font-mono text-xs`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function parseJsonArrayField(value: string, label = "Value"): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed;
}

function parseJsonObjectField(value: string, label = "Value"): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "{}");
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed as Record<string, unknown>;
}

function parseContractArgumentRules(value: string): unknown[] {
  const rules = parseJsonArrayField(value, "Contract Argument Rules");
  if (rules.length > 100) throw new Error("Contract Argument Rules may contain at most 100 rules.");
  const pairs = new Set<string>();
  rules.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Contract Argument Rules item ${index + 1} must be an object.`);
    const rule = item as Record<string, unknown>;
    const contract = String(rule.contract || rule.target || rule.contractIdentifier || "").trim();
    const entryPoint = String(rule.entryPoint || rule.entry_point || rule.method || "").trim();
    if (!contract || !entryPoint) throw new Error(`Contract Argument Rules item ${index + 1} needs contract and entryPoint.`);
    const key = `${contract.toLowerCase()}::${entryPoint}`;
    if (pairs.has(key)) throw new Error(`Contract Argument Rules contains more than one rule for ${entryPoint} on ${contract}.`);
    pairs.add(key);
    for (const field of ["requiredArgs", "allowedArgs"] as const) {
      if (rule[field] !== undefined && !Array.isArray(rule[field])) throw new Error(`Contract Argument Rules item ${index + 1} ${field} must be an array.`);
    }
    for (const field of ["argumentTypes", "numericLimits", "addressRules", "booleanRules", "enumRules"] as const) {
      const candidate = rule[field];
      if (candidate !== undefined && (!candidate || typeof candidate !== "object" || Array.isArray(candidate))) throw new Error(`Contract Argument Rules item ${index + 1} ${field} must be an object.`);
    }
  });
  return rules;
}

function parseOrganizationalApprovalFields(values: Record<string, unknown>) {
  const enabled = String(values.approvalOrganizationalQuorumEnabled ?? "No") === "Yes";
  const emergencyGroupIds = String(values.approvalEmergencyGroupIds ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  if (!enabled) {
    try {
      return {
        groups: parseJsonArrayField(String(values.approvalGroups ?? "[]"), "Approver Groups"),
        tiers: parseJsonArrayField(String(values.approvalTiers ?? "[]"), "Approval Tiers"),
        defaults: parseJsonObjectField(String(values.approvalOrganizationDefaults ?? "{}"), "Organization Defaults"),
        escalations: parseJsonArrayField(String(values.approvalEscalationRules ?? "[]"), "Timed Escalation Rules"),
        emergencyGroupIds,
      };
    } catch {
      return { groups: [], tiers: [], defaults: {}, escalations: [], emergencyGroupIds: [] };
    }
  }
  const groups = parseJsonArrayField(String(values.approvalGroups ?? "[]"), "Approver Groups");
  const tiers = parseJsonArrayField(String(values.approvalTiers ?? "[]"), "Approval Tiers");
  const defaults = parseJsonObjectField(String(values.approvalOrganizationDefaults ?? "{}"), "Organization Defaults");
  const escalations = parseJsonArrayField(String(values.approvalEscalationRules ?? "[]"), "Timed Escalation Rules");

  const normalizedGroups = groups.map((group, index) => {
    if (!group || typeof group !== "object" || Array.isArray(group)) throw new Error(`Approver Groups item ${index + 1} must be an object.`);
    const record = group as Record<string, unknown>;
    const id = String(record.id || record.name || record.role || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const wallets = Array.isArray(record.wallets) ? record.wallets.map((wallet) => String(wallet).trim()).filter(Boolean) : [];
    if (!id) throw new Error(`Approver Groups item ${index + 1} needs an id, name, or role.`);
    if (wallets.length === 0) throw new Error(`Approver group ${id} needs at least one reviewer wallet.`);
    return { id, wallets, record };
  });
  const groupIds = new Set(normalizedGroups.map((group) => group.id));
  if (groupIds.size !== normalizedGroups.length) throw new Error("Approver group IDs must be unique.");
  const assertGroupReference = (groupId: unknown, source: string) => {
    const normalized = String(groupId || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!normalized || !groupIds.has(normalized)) throw new Error(`${source} references unknown approver group ${String(groupId || "(missing)")}.`);
  };
  const validateRequirements = (value: unknown, source: string) => {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new Error(`${source} requiredGroups must be an array.`);
    for (const requirement of value) {
      if (!requirement || typeof requirement !== "object" || Array.isArray(requirement)) throw new Error(`${source} has an invalid group requirement.`);
      assertGroupReference((requirement as Record<string, unknown>).groupId || (requirement as Record<string, unknown>).id, source);
      const approvals = Number((requirement as Record<string, unknown>).approvals ?? (requirement as Record<string, unknown>).requiredApprovals ?? 1);
      if (!Number.isInteger(approvals) || approvals < 1 || approvals > 10) throw new Error(`${source} group approval counts must be integers from 1 to 10.`);
    }
  };
  for (const group of normalizedGroups) {
    const backups = Array.isArray(group.record.backupGroupIds) ? group.record.backupGroupIds : [];
    backups.forEach((groupId) => assertGroupReference(groupId, `Approver group ${group.id}`));
  }
  tiers.forEach((tier, index) => {
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) throw new Error(`Approval Tiers item ${index + 1} must be an object.`);
    const record = tier as Record<string, unknown>;
    validateRequirements(record.requiredGroups, `Approval tier ${String(record.id || record.name || index + 1)}`);
    const min = record.minAmount == null || record.minAmount === "" ? null : Number(record.minAmount);
    const max = record.maxAmount == null || record.maxAmount === "" ? null : Number(record.maxAmount);
    if (min !== null && (!Number.isFinite(min) || min < 0)) throw new Error(`Approval tier ${String(record.id || record.name || index + 1)} has an invalid minimum amount.`);
    if (max !== null && (!Number.isFinite(max) || max < 0)) throw new Error(`Approval tier ${String(record.id || record.name || index + 1)} has an invalid maximum amount.`);
    if (min !== null && max !== null && min > max) throw new Error(`Approval tier ${String(record.id || record.name || index + 1)} has a minimum amount greater than its maximum amount.`);
  });
  validateRequirements(defaults.requiredGroups, "Organization Defaults");
  escalations.forEach((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`Timed Escalation Rules item ${index + 1} must be an object.`);
    const record = rule as Record<string, unknown>;
    (Array.isArray(record.addGroupIds) ? record.addGroupIds : []).forEach((groupId) => assertGroupReference(groupId, `Escalation ${String(record.id || record.name || index + 1)}`));
    validateRequirements(record.requiredGroups, `Escalation ${String(record.id || record.name || index + 1)}`);
  });
  emergencyGroupIds.forEach((groupId) => assertGroupReference(groupId, "Emergency Group IDs"));
  if (tiers.length === 0 && (!Array.isArray(defaults.requiredGroups) || defaults.requiredGroups.length === 0)) throw new Error("Enable at least one approval tier or an Organization Defaults requiredGroups rule.");
  const expirySeconds = Math.max(5, Number(values.approvalExpiryMinutes) || 60) * 60;
  const delaySeconds = Math.max(0, Number(values.approvalExecutionDelaySeconds) || 0);
  if (delaySeconds >= expirySeconds) throw new Error("The default execution delay must be shorter than the approval expiry.");
  return { groups, tiers, defaults, escalations, emergencyGroupIds };
}

function formatPolicyJson(value: unknown, fallback: "[]" | "{}") {
  if (!value || typeof value !== "object") return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <select
        className={`${INPUT_CLS} cursor-pointer`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0B1220]">
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "cyan",
  trend,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: "cyan" | "green" | "red" | "amber" | "purple";
  trend?: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: "text-[#22D3EE] bg-[#22D3EE]/10",
    green: "text-[#22C55E] bg-[#22C55E]/10",
    red: "text-[#EF4444] bg-[#EF4444]/10",
    amber: "text-[#F59E0B] bg-[#F59E0B]/10",
    purple: "text-[#A78BFA] bg-[#A78BFA]/10",
  };
  return (
    <div className={`${CARD_GLOW} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>{icon}</div>
        {trend && (
          <span className="text-xs text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-[#F8FAFC] font-['Space_Grotesk'] mb-1">
        {value}
      </div>
      <div className="text-xs text-[#94A3B8] font-medium uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 bg-[#1E293B] rounded-full mb-4">
        <ShieldAlert size={32} className="text-[#94A3B8]" />
      </div>
      <h3 className="text-lg font-semibold text-[#F8FAFC] mb-2 font-['Space_Grotesk']">
        {title}
      </h3>
      <p className="text-sm text-[#94A3B8] max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

function WalletConnectionRequired({
  onConnectWallet,
  walletConnecting,
  walletError,
}: {
  onConnectWallet: () => void;
  walletConnecting: boolean;
  walletError: string;
}) {
  return (
    <EmptyState
      title="Connect Your Wallet"
      description="Connect your Casper wallet to access this Magen3 panel and manage wallet-scoped agents, policies, audit records, and security settings."
      action={
        <div className="flex flex-col items-center gap-3">
          <Btn variant="primary" size="lg" onClick={onConnectWallet} disabled={walletConnecting}>
            <Wallet size={18} />
            {walletConnecting ? "Connecting..." : "Connect Wallet"}
          </Btn>
          {walletError && (
            <div className="max-w-xl rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#F59E0B]">
              {walletError}
            </div>
          )}
          <p className="max-w-xl text-center text-xs text-[#94A3B8]">
            Magen3 uses the active Casper Wallet public key to scope connected agents, policies, audit records, and decision proofs.
          </p>
        </div>
      }
    />
  );
}

function BrandLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/magen3-logo.png"
      alt="Magen3 logo"
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}


interface PageHeaderProps {
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

function requestAgentOnboarding(onNavigate: (page: Page) => void, mode: OnboardingSetupMode = "guided") {
  try { window.sessionStorage.setItem("magen3:onboarding-mode", mode); } catch {}
  onNavigate("connected-agents");
}

function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {meta && <div className="mb-3 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#94A3B8]">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface OperationalSummaryItem {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}

function OperationalSummary({ items }: { items: OperationalSummaryItem[] }) {
  return (
    <div className={`${CARD_GLOW} overflow-hidden bg-[#1E293B]`}>
      <div className={`grid gap-px ${items.length <= 2 ? "sm:grid-cols-2" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        {items.map((item) => (
          <div key={item.label} className="bg-[#0F172A] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">{item.label}</div>
                <div className="mt-2 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{item.value}</div>
                {item.detail !== undefined && <div className="mt-1 text-xs text-[#94A3B8]">{item.detail}</div>}
              </div>
              {item.icon && <div className={item.tone || "text-[#22D3EE]"}>{item.icon}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactStatusRow({
  label,
  status,
  detail,
  tone = "neutral",
  onClick,
  compact = false,
}: {
  label: string;
  status: string;
  detail?: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  onClick?: () => void;
  compact?: boolean;
}) {
  const meta = {
    success: { dot: "bg-[#22C55E]", text: "text-[#22C55E]" },
    warning: { dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
    danger: { dot: "bg-[#EF4444]", text: "text-[#EF4444]" },
    info: { dot: "bg-[#22D3EE]", text: "text-[#22D3EE]" },
    neutral: { dot: "bg-[#64748B]", text: "text-[#94A3B8]" },
  }[tone];
  const content = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
          <span className={`${compact ? "text-xs" : "text-sm"} font-semibold text-[#F8FAFC]`}>{label}</span>
        </div>
        {detail && <div className="mt-1 pl-4 text-xs leading-relaxed text-[#94A3B8]">{detail}</div>}
      </div>
      <span className={`shrink-0 ${compact ? "text-[11px]" : "text-xs"} font-semibold ${meta.text}`}>{status}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`flex w-full items-start justify-between gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] text-left transition-colors hover:border-[#334155] ${compact ? "px-2.5 py-2" : "p-3"}`}>
      {content}
    </button>
  ) : (
    <div className={`flex items-start justify-between gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] ${compact ? "px-2.5 py-2" : "p-3"}`}>{content}</div>
  );
}

function DetailDrawer({
  title,
  subtitle,
  onClose,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  tabs?: Array<{ id: string; label: string }>;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close detail panel" className="absolute inset-0 bg-black/65" onClick={onClose} />
      <section className="relative flex h-full w-full max-w-4xl flex-col border-l border-[#1E293B] bg-[#0B1220] shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#1E293B] bg-[#0B1220]">
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="min-w-0">
              <h3 className="font-semibold font-['Space_Grotesk'] text-[#F8FAFC]">{title}</h3>
              {subtitle && <div className="mt-1 break-all font-mono text-xs text-[#94A3B8]">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#94A3B8] transition-colors hover:bg-[#1E293B] hover:text-[#F8FAFC]"><X size={18} /></button>
          </div>
          {tabs && tabs.length > 0 && activeTab && onTabChange && (
            <div className="flex gap-1 overflow-x-auto px-5 pb-3">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className={`min-w-max rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"}`}>{tab.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────────────────

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "shields", label: "Agent Shield", icon: <Shield size={18} /> },
  { id: "connected-agents", label: "Connected Agents", icon: <Bot size={18} /> },
  { id: "policies", label: "Policies", icon: <FileText size={18} /> },
  { id: "audit-log", label: "Audit Logs", icon: <Scroll size={18} /> },
  { id: "intent-playground", label: "Intent Playground", icon: <Send size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings size={18} /> },
];

function Sidebar({
  currentPage,
  onNavigate,
  collapsed,
  onToggle,
}: {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col bg-[#0B1220] border-r border-[#1E293B] ${collapsed ? "w-16" : "w-60"} flex-shrink-0`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-[#1E293B] py-5 ${collapsed ? "gap-1 px-1" : "gap-3 px-4"}`}>
        <button
          type="button"
          onClick={() => onNavigate("dashboard")}
          aria-label="Go to Magen3 dashboard"
          title="Go to Magen3 dashboard"
          className="flex min-w-0 items-center gap-3 rounded-lg text-left hover:text-[#22D3EE] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/40"
        >
          <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#050B14] border border-[#1E293B] flex items-center justify-center overflow-hidden">
            <BrandLogo className="h-7 w-7" />
          </span>
          {!collapsed && (
            <span className="font-bold text-[#F8FAFC] text-lg font-['Space_Grotesk'] tracking-tight">
              Magen<span className="text-[#22D3EE]">3</span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto text-[#94A3B8] hover:text-[#F8FAFC]"
        >
          <Menu size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                active
                  ? "bg-[#22D3EE]/10 text-[#22D3EE] ring-1 ring-[#22D3EE]/20"
                  : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-4 border-t border-[#1E293B]">
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[#64748B]">
            Magen3 v{__MAGEN3_VERSION__}
          </div>
        </div>
      )}
    </aside>
  );
}

// ──────────────────────────────────────────────────────────
// TopBar
// ──────────────────────────────────────────────────────────

function TopBar({
  walletConnected,
  walletAddress,
  apiOnline,
  onConnectWallet,
  onDisconnectWallet,
  walletConnecting,
  walletError,
}: {
  walletConnected: boolean;
  walletAddress: string;
  apiOnline: boolean;
  onConnectWallet: () => void;
  onDisconnectWallet: () => void;
  walletConnecting: boolean;
  walletError: string;
}) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#1E293B] bg-[#050B14] sticky top-0 z-10">
      {/* Network badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#22D3EE]" />
          <span className="text-xs font-semibold text-[#67E8F9] uppercase tracking-wider">
            Casper Testnet
          </span>
        </div>
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border ${
          apiOnline
            ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
            : "bg-[#F59E0B]/10 border-[#F59E0B]/20 text-[#F59E0B]"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${apiOnline ? "bg-[#22C55E]" : "bg-[#F59E0B]"}`} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {apiOnline ? "Gateway Live" : "Gateway Unavailable"}
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {walletError && !walletConnected && (
          <div className="hidden lg:block max-w-[260px] truncate rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1.5 text-xs text-[#F59E0B]" title={walletError}>
            {walletError}
          </div>
        )}
        {walletConnected ? (
          <button
            onClick={onDisconnectWallet}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#111827] border border-[#1E293B] rounded-lg hover:border-[#22D3EE]/40"
            title="Disconnect Casper Wallet"
          >
            <ShieldCheck size={15} className="text-[#22C55E]" />
            <span className="text-sm text-[#F8FAFC] font-mono">
              {truncate(walletAddress, 20)}
            </span>
            <ChevronDown size={14} className="text-[#94A3B8]" />
          </button>
        ) : (
          <Btn variant="primary" size="sm" onClick={onConnectWallet} disabled={walletConnecting}>
            <Wallet size={14} />
            {walletConnecting ? "Connecting..." : "Connect Wallet"}
          </Btn>
        )}
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────
// Landing Page
// ──────────────────────────────────────────────────────────

function LandingPage({ onLaunchApp, onOpenDocs }: { onLaunchApp: () => void; onOpenDocs: () => void }) {
  return (
    <div className="min-h-screen bg-[#050B14] text-[#F8FAFC] font-['Inter']">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[#1E293B] sticky top-0 z-20 bg-[#050B14]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0B1220] border border-[#1E293B] flex items-center justify-center">
            <BrandLogo className="h-7 w-7" />
          </div>
          <span className="font-bold text-xl font-['Space_Grotesk']">
            Magen<span className="text-[#22D3EE]">3</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#94A3B8]">
          <a href="#how-it-works" className="hover:text-[#F8FAFC] transition-colors">
            How It Works
          </a>
          <a href="#protection-modules" className="hover:text-[#F8FAFC] transition-colors">
            Protection Modules
          </a>
          <a href="#decision-proof" className="hover:text-[#F8FAFC] transition-colors">
            Decision Proof
          </a>
          <button type="button" onClick={onOpenDocs} className="hover:text-[#F8FAFC] transition-colors">
            Docs
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0B1220] border border-[#1E293B] rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
            <span className="text-xs text-[#67E8F9] font-semibold uppercase tracking-wide">
              Casper Testnet
            </span>
          </div>
          <Btn variant="primary" size="sm" onClick={onLaunchApp}>
            Launch App
          </Btn>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#050B14]">
        <div className="max-w-6xl mx-auto px-8 py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#22D3EE]/10 border border-[#22D3EE]/20 rounded-full text-xs text-[#22D3EE] font-semibold uppercase tracking-wider mb-8">
            <Zap size={12} />
            Web3 Execution Firewall · Now on Casper Testnet
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-['Space_Grotesk'] leading-tight mb-6">
            Magen3 is a{" "}
            <span className="text-[#22D3EE]">
              Web3 execution
            </span>{" "}
            firewall for autonomous agents.
          </h1>
          <p className="text-xl text-[#94A3B8] max-w-3xl mx-auto mb-12 leading-relaxed">
            Register autonomous agents, define what they may execute, evaluate every intent through Agent Shield, and stop unsafe actions before wallet signing.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Btn variant="primary" size="lg" onClick={onLaunchApp}>
              Launch App <ArrowRight size={18} />
            </Btn>
            <a
              href="#decision-proof"
              className="inline-flex items-center gap-2 rounded-xl border border-[#22D3EE] px-6 py-3 text-base text-[#22D3EE] hover:bg-[#22D3EE]/10"
            >
              View Decision Proof <Eye size={18} />
            </a>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            {[
              { v: "Live", l: "Agent Shield" },
              { v: "6", l: "Execution Capabilities" },
              { v: "Casper", l: "Decision Proofs" },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-3xl font-bold text-[#22D3EE] font-['Space_Grotesk']">
                  {s.v}
                </div>
                <div className="text-xs text-[#94A3B8] mt-1 uppercase tracking-wider">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
            The Problem
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Autonomous agents are gaining the ability to execute swaps, transfers, staking actions, contract calls, and treasury operations. The critical risk is what they are permitted to execute.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <ShieldX size={24} className="text-[#EF4444]" />,
              title: "No Pre-Execution Checks",
              desc: "Unsafe transactions hit the chain before anyone can stop them.",
            },
            {
              icon: <AlertTriangle size={24} className="text-[#F59E0B]" />,
              title: "Policy Drift",
              desc: "AI agents act outside approved parameters as conditions change.",
            },
            {
              icon: <Database size={24} className="text-[#A78BFA]" />,
              title: "No Audit Trail",
              desc: "Security decisions leave no verifiable on-chain record.",
            },
          ].map((c) => (
            <div key={c.title} className={`${CARD} p-6`}>
              <div className="p-3 bg-[#0B1220] rounded-lg w-fit mb-4">
                {c.icon}
              </div>
              <h3 className="font-semibold text-[#F8FAFC] mb-2 font-['Space_Grotesk']">
                {c.title}
              </h3>
              <p className="text-sm text-[#94A3B8] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-[#0B1220] py-24">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">From agent registration to verifiable decision</h2>
            <p className="text-[#94A3B8] text-lg">Magen3 sits between agent intent and blockchain execution.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              ["01", "Register Agent", "Create a per-agent identity and one-time API credential."],
              ["02", "Select Capabilities", "Choose one or more execution capabilities that describe what the agent can do."],
              ["03", "Assign Policy", "Use secure starter rules or customize the limits that Magen3 actually enforces."],
              ["04", "Send Intent", "The external agent submits the proposed action before asking a wallet to sign."],
              ["05", "Evaluate Pipeline", "Agent Shield authenticates, loads configuration and policy, runs relevant checks, and assesses risk."],
              ["06", "Decide and Prove", "Magen3 returns Allowed, Blocked, or Review Required, stores the audit, and submits a Casper decision proof."],
            ].map(([number, title, description]) => (
              <div key={number} className={`${CARD} p-5`}>
                <div className="text-4xl font-bold font-['Space_Grotesk'] text-[#1E293B]">{number}</div>
                <h3 className="mt-3 text-lg font-bold font-['Space_Grotesk'] text-[#22D3EE]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="decision-proof" className="max-w-6xl mx-auto px-8 py-24">
        <div className={`${CARD} p-8 md:p-10`}>
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">
                <Database size={13} />
                Casper Decision Proof
              </div>
              <h2 className="text-3xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
                Every approved or blocked agent action can leave a verifiable record.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">
                Magen3 records the policy decision, the agent identity, the execution wallet, and the action details before execution. The Casper deploy hash becomes the proof that the decision happened before the wallet signed.
              </p>
            </div>
            <div className="grid gap-3 text-sm">
              {[
                ["Agent intent", "External agent submits the proposed Web3 action."],
                ["Policy decision", "Magen3 returns Allowed, Blocked, or Review Required."],
                ["Casper record", "The decision proof is anchored with a real deploy hash."],
              ].map(([title, desc], index) => (
                <div key={title} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-xs font-bold text-[#22D3EE]">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-[#F8FAFC]">{title}</div>
                      <div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Agent Shield protection modules */}
      <section id="protection-modules" className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-3 py-1 text-xs font-semibold text-[#22C55E]"><ShieldCheck size={13} /> Agent Shield is live</div>
          <h2 className="mt-4 text-4xl font-bold font-['Space_Grotesk']">Protection Modules under Agent Shield</h2>
          <p className="mx-auto mt-3 max-w-3xl text-lg text-[#94A3B8]">Capabilities determine relevant recommendations. Module status is shown honestly: Live, Foundation Available, Preview, or Planned.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PROTECTION_MODULE_CATALOG.map((module) => (
            <div key={module.id} className={`${CARD} p-6`}>
              <div className="flex items-start justify-between gap-3"><div className="rounded-lg bg-[#22D3EE]/10 p-2.5"><Shield size={20} className="text-[#22D3EE]" /></div><StatusBadge status={module.status} /></div>
              <h3 className="mt-4 font-semibold text-[#F8FAFC] font-['Space_Grotesk']">{module.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{module.description}</p>
              <div className="mt-4 border-t border-[#1E293B] pt-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Current implementation</div><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{module.currentChecks.length ? module.currentChecks.join(" · ") : "No backend checks are currently implemented."}</p></div>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <h3 className="text-center text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Built for different autonomous agents</h3>
          <div className="mt-5 flex flex-wrap justify-center gap-2"><CapabilityChips capabilities={EXECUTION_CAPABILITY_CATALOG.map((capability) => capability.id)} /></div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#050B14] py-24">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0B1220] border border-[#1E293B] flex items-center justify-center mx-auto mb-6">
            <BrandLogo className="h-12 w-12" />
          </div>
          <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
            Ready to protect your agents?
          </h2>
          <p className="text-[#94A3B8] text-lg mb-10">
            Connect your Casper wallet, register an autonomous agent, assign an enforceable policy, and test its first intent.
          </p>
          <Btn variant="primary" size="lg" onClick={onLaunchApp}>
            Launch App <ArrowRight size={18} />
          </Btn>
        </div>
      </section>

      <footer id="docs" className="border-t border-[#1E293B] py-8 text-center text-sm text-[#94A3B8]/60">
        © 2026 Magen3 · Built on Casper Network
      </footer>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Dashboard Page
// ──────────────────────────────────────────────────────────

function DashboardPage({
  walletConnected,
  onConnectWallet,
  walletConnecting,
  walletError,
  apiOnline,
  threatIntelligenceStatus,
  oracleValidationStatus,
  complianceControlsStatus,
  x402PaymentControlsStatus,
  auditLogs,
  policies,
  agents,
  approvals,
  emergencyPauses,
  onNavigate,
  onStartOnboarding,
}: {
  walletConnected: boolean;
  onConnectWallet: () => void;
  walletConnecting: boolean;
  walletError: string;
  apiOnline: boolean;
  threatIntelligenceStatus: ThreatIntelligenceStatus;
  oracleValidationStatus: OracleValidationStatus;
  complianceControlsStatus: ComplianceControlsStatus;
  x402PaymentControlsStatus: X402PaymentControlsStatus;
  auditLogs: AuditLog[];
  policies: Policy[];
  agents: Agent[];
  approvals: ApprovalRequest[];
  emergencyPauses: EmergencyPause[];
  onNavigate: (p: Page) => void;
  onStartOnboarding: (mode: OnboardingSetupMode) => void;
}) {
  const [showAllServices, setShowAllServices] = useState(false);

  if (!walletConnected) {
    return (
      <WalletConnectionRequired
        onConnectWallet={onConnectWallet}
        walletConnecting={walletConnecting}
        walletError={walletError}
      />
    );
  }

  const dashboardStats = deriveDashboardStats(auditLogs, policies);
  const recentLogs = auditLogs.slice(0, 5);
  const today = new Date();
  const decisionsToday = auditLogs.filter((log) => isSameDay(new Date(log.timestamp), today));
  const allowedToday = decisionsToday.filter((log) => log.decision === "Allowed").length;
  const blockedToday = decisionsToday.filter((log) => log.decision === "Blocked").length;
  const reviewToday = decisionsToday.filter((log) => log.decision === "Review Required").length;
  const activeAgents = agents.filter((agent) => agent.status === "Active");
  const activePolicies = policies.filter((policy) => policy.status === "Active");
  const pendingApprovals = approvals.filter((approval) => approval.reviewStatus === "Pending" || approval.reviewStatus === "Configuration Required");
  const activeEmergencyPauses = emergencyPauses.filter((pause) => pause.active === true || pause.status === "Active");
  const unresolvedExecutions = auditLogs.filter(executionNeedsAttention);
  const failedProofs = auditLogs.filter((log) => log.decisionProofStatus === "failed");
  const queuedProofs = auditLogs.filter((log) => log.decisionProofStatus === "queued");
  const agentsWithoutPolicy = activeAgents.filter((agent) => !getActivePolicy(policies, agent.id));

  const agentCoverage = activeAgents.map((agent) => {
    const agentLogs = auditLogs.filter((log) => log.agentId === agent.id);
    return { agent, coverage: calculateSecurityCoverage(agent, getActivePolicy(policies, agent.id), agentLogs) };
  });
  const averageCoverage = agentCoverage.length
    ? Math.round(agentCoverage.reduce((sum, item) => sum + item.coverage.score, 0) / agentCoverage.length)
    : 0;

  const coverageAttention = agentCoverage
    .filter(({ agent, coverage }) => getActivePolicy(policies, agent.id) && coverage.score < 85 && coverage.recommendations.length > 0)
    .sort((a, b) => a.coverage.score - b.coverage.score);

  const agentsNeedingAttention = activeAgents
    .map((agent) => {
      const coverage = agentCoverage.find((item) => item.agent.id === agent.id)?.coverage;
      const unresolved = unresolvedExecutions.filter((log) => log.agentId === agent.id);
      const proofFailure = failedProofs.find((log) => log.agentId === agent.id);
      const activePolicy = getActivePolicy(policies, agent.id);
      let issue = "";
      let priority = 4;
      if (!activePolicy) {
        issue = "No active policy is assigned.";
        priority = 0;
      } else if (unresolved.length > 0) {
        issue = `${unresolved.length} unresolved execution${unresolved.length === 1 ? "" : "s"} require reconciliation.`;
        priority = 1;
      } else if (proofFailure) {
        issue = "The latest Casper decision proof submission failed.";
        priority = 2;
      } else if (coverage && coverage.score < 85 && coverage.recommendations[0]) {
        issue = coverage.recommendations[0].recommendation;
        priority = 3;
      }
      return { agent, coverage, issue, priority };
    })
    .filter((item) => item.issue)
    .sort((a, b) => a.priority - b.priority || (a.coverage?.score || 0) - (b.coverage?.score || 0))
    .slice(0, 3);

  const attentionItems: Array<{
    id: string;
    title: string;
    description: string;
    action: string;
    page: Page;
    tone: "critical" | "warning";
    icon: ReactElement;
  }> = [];

  if (!apiOnline) {
    attentionItems.push({
      id: "gateway",
      title: "Magen3 Gateway is unavailable",
      description: "Live intent verification cannot be confirmed. Check the deployed backend before allowing agent execution.",
      action: "Open settings",
      page: "settings",
      tone: "critical",
      icon: <Server size={18} />,
    });
  }
  if (activeEmergencyPauses.length > 0) {
    attentionItems.push({
      id: "pauses",
      title: `${activeEmergencyPauses.length} active emergency pause${activeEmergencyPauses.length === 1 ? "" : "s"}`,
      description: "One or more execution scopes are blocked or routed to review until an authorised resume completes.",
      action: "Review pauses",
      page: "settings",
      tone: "critical",
      icon: <ShieldAlert size={18} />,
    });
  }
  if (pendingApprovals.length > 0) {
    attentionItems.push({
      id: "approvals",
      title: `${pendingApprovals.length} approval request${pendingApprovals.length === 1 ? " is" : "s are"} waiting`,
      description: "Exact-bound execution requests must remain gated until the required reviewers and quorum resolve them.",
      action: "Open Approval Queue",
      page: "policies",
      tone: "warning",
      icon: <Clock size={18} />,
    });
  }
  if (unresolvedExecutions.length > 0) {
    attentionItems.push({
      id: "executions",
      title: `${unresolvedExecutions.length} execution${unresolvedExecutions.length === 1 ? " needs" : "s need"} reconciliation`,
      description: "Pending, uncertain, replaced, delivery-pending, or refund-pending records should be resolved before another submission.",
      action: "Review executions",
      page: "audit-log",
      tone: unresolvedExecutions.some((log) => canonicalExecutionStatus(log.executionStatus || "") === "uncertain") ? "critical" : "warning",
      icon: <RefreshCw size={18} />,
    });
  }
  if (failedProofs.length > 0) {
    attentionItems.push({
      id: "proofs",
      title: `${failedProofs.length} Casper decision proof${failedProofs.length === 1 ? "" : "s"} failed`,
      description: "The audit decisions remain stored, but their on-chain proof submissions were not confirmed by the relayer.",
      action: "Inspect Audit Logs",
      page: "audit-log",
      tone: "critical",
      icon: <Database size={18} />,
    });
  }
  if (agentsWithoutPolicy.length > 0) {
    attentionItems.push({
      id: "policy-gap",
      title: `${agentsWithoutPolicy.length} active agent${agentsWithoutPolicy.length === 1 ? " has" : "s have"} no active policy`,
      description: "Execution should remain limited until deterministic policy rules are assigned to every active agent.",
      action: "Manage policies",
      page: "policies",
      tone: "critical",
      icon: <FileText size={18} />,
    });
  } else if (coverageAttention.length > 0) {
    attentionItems.push({
      id: "coverage",
      title: `${coverageAttention.length} agent${coverageAttention.length === 1 ? " needs" : "s need"} stronger configured coverage`,
      description: `${coverageAttention[0].agent.name} is currently at ${coverageAttention[0].coverage.score}% and has an actionable configuration recommendation.`,
      action: "Review agents",
      page: "connected-agents",
      tone: "warning",
      icon: <ShieldCheck size={18} />,
    });
  }
  const providerRequirements = activePolicies.reduce((required, policy) => {
    const rules = policy.structuredRules || {};
    const capabilities = normalizeCapabilities(policy.capabilityScope);
    const threatMode = String(rules.threatIntelligenceMode || "Observe");
    const oracleMode = String(rules.oracleValidationMode || "Observe");
    required.threat ||= ["Review", "Enforce"].includes(threatMode);
    required.oracle ||= ["Review", "Enforce"].includes(oracleMode) && capabilities.some((capability) => ["Trading", "dApp Interactions", "Treasury Operations"].includes(capability));
    required.compliance ||= rules.complianceControlsEnabled === true;
    return required;
  }, { threat: false, oracle: false, compliance: false });

  const requiredUnavailableProviders = [
    providerRequirements.threat && threatIntelligenceStatus.status !== "available" ? "Threat Intelligence" : "",
    providerRequirements.oracle && oracleValidationStatus.status !== "available" ? "Oracle Validation" : "",
    providerRequirements.compliance && complianceControlsStatus.status !== "available" ? "Compliance Controls" : "",
  ].filter(Boolean);

  if (requiredUnavailableProviders.length > 0) {
    attentionItems.push({
      id: "providers",
      title: `${requiredUnavailableProviders.length} policy-required provider service${requiredUnavailableProviders.length === 1 ? " needs" : "s need"} attention`,
      description: `${requiredUnavailableProviders.join(", ")} is stale or unavailable for an active policy. The configured unavailable behaviour continues to apply and never counts as a pass.`,
      action: "Review services",
      page: "settings",
      tone: "warning",
      icon: <Globe size={18} />,
    });
  }

  const latestRpcFinding = auditLogs
    .flatMap((log) => (log.moduleFindings || []).map((finding) => ({ finding, timestamp: log.timestamp })))
    .find(({ finding }) => finding.module === "RPC & Chain Integrity");

  type ServiceHealth = "operational" | "attention" | "unavailable" | "not-observed";
  const serviceItems: Array<{ label: string; detail: string; status: ServiceHealth; essential?: boolean }> = [
    {
      label: "Gateway",
      detail: apiOnline ? "Intent verification endpoint is reachable." : "The deployed Gateway could not be confirmed.",
      status: apiOnline ? "operational" : "unavailable",
      essential: true,
    },
    {
      label: "Audit persistence",
      detail: auditLogs.length > 0 ? `${auditLogs.length} audit record${auditLogs.length === 1 ? " is" : "s are"} available.` : "No stored audit record has been observed yet.",
      status: auditLogs.length > 0 ? "operational" : "not-observed",
      essential: true,
    },
    {
      label: "Casper proof service",
      detail: failedProofs.length > 0 ? `${failedProofs.length} proof submission${failedProofs.length === 1 ? " has" : "s have"} failed.` : dashboardStats.casperAuditRecords > 0 ? `${dashboardStats.casperAuditRecords} decision proof${dashboardStats.casperAuditRecords === 1 ? " is" : "s are"} recorded on Casper.` : "No confirmed Casper decision proof has been observed yet.",
      status: failedProofs.length > 0 ? "attention" : dashboardStats.casperAuditRecords > 0 ? "operational" : "not-observed",
      essential: true,
    },
    {
      label: "Proof relayer",
      detail: failedProofs.length > 0 ? "A recent relayer submission failed." : queuedProofs.length > 0 ? `${queuedProofs.length} proof${queuedProofs.length === 1 ? " is" : "s are"} queued for the relayer.` : dashboardStats.casperAuditRecords > 0 ? "Confirmed proof activity has been observed." : "No relayer activity has been observed yet.",
      status: failedProofs.length > 0 || queuedProofs.length > 0 ? "attention" : dashboardStats.casperAuditRecords > 0 ? "operational" : "not-observed",
    },
    {
      label: "RPC providers",
      detail: latestRpcFinding ? latestRpcFinding.finding.message : "No RPC & Chain Integrity finding has been observed yet.",
      status: !latestRpcFinding ? "not-observed" : latestRpcFinding.finding.status === "pass" ? "operational" : latestRpcFinding.finding.status === "unavailable" ? "unavailable" : latestRpcFinding.finding.status === "skipped" ? "not-observed" : "attention",
    },
    {
      label: "Threat feed",
      detail: threatIntelligenceStatus.status === "available" ? `${threatIntelligenceStatus.activeIndicatorCount ?? threatIntelligenceStatus.indicatorCount ?? 0} active indicators are available.` : threatIntelligenceStatus.status === "stale" ? "The configured threat feed is stale." : "No fresh threat feed is available.",
      status: threatIntelligenceStatus.status === "available" ? "operational" : threatIntelligenceStatus.status === "stale" ? "attention" : "unavailable",
    },
    {
      label: "Oracle feed",
      detail: oracleValidationStatus.status === "available" ? `${oracleValidationStatus.pairCount || 0} market pair${oracleValidationStatus.pairCount === 1 ? " is" : "s are"} available.` : oracleValidationStatus.status === "stale" ? "The configured oracle feed is stale." : "No fresh oracle feed is available.",
      status: oracleValidationStatus.status === "available" ? "operational" : oracleValidationStatus.status === "stale" ? "attention" : "unavailable",
    },
    {
      label: "Compliance feed",
      detail: complianceControlsStatus.status === "available" ? `${complianceControlsStatus.activeIndicatorCount ?? complianceControlsStatus.indicatorCount ?? 0} indicators across ${complianceControlsStatus.activeJurisdictionCount ?? complianceControlsStatus.jurisdictionCount ?? 0} jurisdictions.` : complianceControlsStatus.status === "stale" ? "The configured compliance feed is stale." : "No fresh compliance feed is available.",
      status: complianceControlsStatus.status === "available" ? "operational" : complianceControlsStatus.status === "stale" ? "attention" : "unavailable",
    },
  ];

  const serviceCounts = {
    operational: serviceItems.filter((item) => item.status === "operational").length,
    attention: serviceItems.filter((item) => item.status === "attention").length,
    unavailable: serviceItems.filter((item) => item.status === "unavailable").length,
    notObserved: serviceItems.filter((item) => item.status === "not-observed").length,
  };
  const compactServiceItems = [
    ...serviceItems.filter((item) => item.status === "attention" || item.status === "unavailable"),
    ...serviceItems.filter((item) => item.essential && item.status !== "attention" && item.status !== "unavailable"),
  ].filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index).slice(0, 4);
  const visibleServiceItems = showAllServices ? serviceItems : compactServiceItems;

  const agentsWithActivePolicy = activeAgents.filter((agent) => Boolean(getActivePolicy(policies, agent.id))).length;
  const inactivePolicyCount = policies.filter((policy) => policy.status !== "Active").length;
  const x402Ready = x402PaymentControlsStatus.status === "foundation-available";
  const trackedOnboardingAgents = activeAgents.filter((agent) => ["guided", "advanced"].includes(String(agent.capabilityConfiguration?.setupMode || "")));
  let onboardingCredentialSaved = false;
  try {
    onboardingCredentialSaved = trackedOnboardingAgents.some((agent) => window.localStorage.getItem(`magen3.onboarding.credentialsSaved.${agent.id}`) === "true");
  } catch {
    onboardingCredentialSaved = false;
  }
  const onboardingHasPolicy = trackedOnboardingAgents.some((agent) => Boolean(getActivePolicy(policies, agent.id)));
  const onboardingHasIntent = auditLogs.some((log) => trackedOnboardingAgents.some((agent) => agent.id === log.agentId));
  const onboardingHasProof = auditLogs.some((log) => trackedOnboardingAgents.some((agent) => agent.id === log.agentId) && isRealCasperDeployHash(log.txHash));
  const onboardingItems = [
    { id: "wallet", label: "Wallet connected", complete: walletConnected, action: "Connect wallet", page: "dashboard" as Page },
    { id: "agent", label: "First agent protected", complete: activeAgents.length > 0, action: "Start guided setup", page: "connected-agents" as Page },
    { id: "policy", label: "Starter policy active", complete: onboardingHasPolicy, action: "Configure policy", page: "policies" as Page },
    { id: "credential", label: "Integration credentials saved", complete: onboardingCredentialSaved, action: "Open agent access", page: "connected-agents" as Page },
    { id: "intent", label: "First protected intent received", complete: onboardingHasIntent, action: "Run a protected test", page: "intent-playground" as Page },
    { id: "proof", label: "First Casper proof confirmed", complete: onboardingHasProof, action: "View proof status", page: "audit-log" as Page },
  ];
  const onboardingCompleted = onboardingItems.filter((item) => item.complete).length;

  const executionLabel = (log: AuditLog) => {
    const execution = canonicalExecutionStatus(log.executionStatus || "");
    if (execution && execution !== "not-submitted") return execution.replace(/-/g, " ");
    if (log.resourceDeliveryStatus) return String(log.resourceDeliveryStatus).replace(/-/g, " ");
    if (log.settlementStatus) return String(log.settlementStatus).replace(/-/g, " ");
    return "not submitted";
  };

  const openApprovalQueue = () => {
    try { window.sessionStorage.setItem("magen3:policies-tab", "approvals"); } catch {}
    onNavigate("policies");
  };

  if (activeAgents.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Start with one protected agent. Magen3 will guide you from use case to the first verifiable decision." />
        <section className={`${CARD_GLOW} overflow-hidden`}>
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="p-6 sm:p-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-3 py-1 text-xs font-semibold text-[#22D3EE]"><ShieldCheck size={13} /> Guided first-agent setup</div>
              <h2 className="mt-5 max-w-2xl text-3xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Protect your first autonomous agent without learning every Magen3 control first.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">Choose what the agent does, select Standard or Strict protection, save one credential, and run a synthetic protected test. Advanced policy and control settings remain available after setup.</p>
              <div className="mt-6 flex flex-wrap gap-3"><Btn variant="primary" onClick={() => onStartOnboarding("guided")}><ShieldCheck size={16} /> Start Guided Setup</Btn><Btn variant="secondary" onClick={() => onStartOnboarding("advanced")}><Settings size={16} /> Advanced Setup</Btn></div>
              <div className="mt-6 text-xs text-[#64748B]">The onboarding test never signs or submits a blockchain transaction.</div>
            </div>
            <div className="border-t border-[#1E293B] bg-[#0B1220] p-6 lg:border-l lg:border-t-0">
              <div className="text-sm font-semibold text-[#F8FAFC]">Your first success path</div>
              <div className="mt-4 space-y-3">{[
                ["1", "Choose what to protect", "Trading, wallet, treasury, dApp, enterprise, or custom."],
                ["2", "Name and connect the agent", "Select Codex, MCP, JavaScript, Python, or the API."],
                ["3", "Choose a protection level", "Magen3 creates capabilities and an active starter policy."],
                ["4", "Save credentials and test", "See the decision, Audit Log, and Casper proof flow."],
              ].map(([number, title, detail]) => <div key={number} className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/20 bg-[#22D3EE]/10 text-xs font-bold text-[#22D3EE]">{number}</span><div><div className="text-sm font-semibold text-[#F8FAFC]">{title}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{detail}</div></div></div>)}</div>
            </div>
          </div>
        </section>
        <section className={`${CARD} p-5`}>
          <div className="flex items-center justify-between gap-3"><div><h2 className={SECTION_TITLE}>Setup checklist</h2><p className="mt-1 text-xs text-[#94A3B8]">Complete these milestones to finish the first Magen3 integration.</p></div><span className="rounded-full border border-[#1E293B] bg-[#0B1220] px-2.5 py-1 text-xs font-semibold text-[#94A3B8]">{onboardingCompleted} of {onboardingItems.length}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{onboardingItems.map((item) => <button type="button" key={item.id} onClick={() => item.id === "agent" ? onStartOnboarding("guided") : onNavigate(item.page)} className="flex items-center justify-between gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-3 text-left"><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${item.complete ? "border-[#22C55E] bg-[#22C55E] text-[#050B14]" : "border-[#334155] text-[#64748B]"}`}>{item.complete ? <CheckCircle size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`text-xs font-semibold ${item.complete ? "text-[#BBF7D0]" : "text-[#F8FAFC]"}`}>{item.label}</span></div>{!item.complete && <span className="text-[10px] font-semibold text-[#22D3EE]">{item.action}</span>}</button>)}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Operational overview of protected agents, deterministic decisions, approvals, proofs, and execution state."
        meta={!apiOnline ? <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#EF4444]"><Server size={12} /> Gateway unavailable</span> : undefined}
        actions={<>
          <Btn variant="secondary" onClick={openApprovalQueue}><Clock size={16} /> Review Approvals</Btn>
          <Btn variant="primary" onClick={() => onNavigate("intent-playground")}><Send size={16} /> Test Intent</Btn>
        </>}
      />

      {trackedOnboardingAgents.length > 0 && onboardingCompleted < onboardingItems.length && (
        <section className={`${CARD} p-5`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><ShieldCheck size={17} className="text-[#22D3EE]" /><h2 className={SECTION_TITLE}>Finish setting up Magen3</h2></div><p className="mt-1 text-xs text-[#94A3B8]">Your agent is registered. Complete the remaining integration milestones to reach the first verifiable decision.</p></div><div className="min-w-[150px]"><div className="flex items-center justify-between text-[10px] font-semibold text-[#94A3B8]"><span>{onboardingCompleted} of {onboardingItems.length}</span><span>{Math.round((onboardingCompleted / onboardingItems.length) * 100)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#1E293B]"><div className="h-full rounded-full bg-[#22D3EE]" style={{ width: `${(onboardingCompleted / onboardingItems.length) * 100}%` }} /></div></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{onboardingItems.map((item) => <button type="button" key={item.id} onClick={() => item.id === "agent" ? onStartOnboarding("guided") : onNavigate(item.page)} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left ${item.complete ? "border-[#22C55E]/15 bg-[#22C55E]/5" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${item.complete ? "border-[#22C55E] bg-[#22C55E] text-[#050B14]" : "border-[#334155] text-[#64748B]"}`}>{item.complete ? <CheckCircle size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`text-xs font-semibold ${item.complete ? "text-[#BBF7D0]" : "text-[#F8FAFC]"}`}>{item.label}</span></div>{!item.complete && <ChevronRight size={14} className="text-[#22D3EE]" />}</button>)}</div>
        </section>
      )}

      <OperationalSummary items={[
        { label: "Active Agents", value: activeAgents.length, detail: `${agents.length} registered`, icon: <Bot size={18} />, tone: "text-[#22D3EE]" },
        { label: "Decisions Today", value: decisionsToday.length, detail: `${allowedToday} allowed · ${reviewToday} review · ${blockedToday} blocked`, icon: <Activity size={18} />, tone: "text-[#A78BFA]" },
        { label: "Need Attention", value: attentionItems.length, detail: attentionItems.length ? "operational items to review" : "no immediate action", icon: <AlertTriangle size={18} />, tone: attentionItems.length ? "text-[#F59E0B]" : "text-[#22C55E]" },
        { label: "Unresolved", value: unresolvedExecutions.length, detail: unresolvedExecutions.length ? "execution or settlement" : "no unresolved execution", icon: <RefreshCw size={18} />, tone: unresolvedExecutions.length ? "text-[#F59E0B]" : "text-[#22C55E]" },
      ]} />

      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><AlertTriangle size={17} className={attentionItems.length ? "text-[#F59E0B]" : "text-[#22C55E]"} /><h2 className={SECTION_TITLE}>Attention Required</h2></div>
            <p className="mt-1 text-xs text-[#94A3B8]">Only conditions that require operational action appear here.</p>
          </div>
          {attentionItems.length > 0 && <span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2.5 py-1 text-xs font-semibold text-[#FCD34D]">{attentionItems.length} open</span>}
        </div>
        <div className="mt-4 space-y-2">
          {attentionItems.length === 0 ? (
            <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4 text-sm text-[#BBF7D0]">
              All protected agents and critical services are operating normally.
            </div>
          ) : attentionItems.map((item) => (
            <button key={item.id} type="button" onClick={() => item.id === "approvals" ? openApprovalQueue() : onNavigate(item.page)} className={`flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${item.tone === "critical" ? "border-[#EF4444]/25 bg-[#EF4444]/5 hover:border-[#EF4444]/45" : "border-[#F59E0B]/25 bg-[#F59E0B]/5 hover:border-[#F59E0B]/45"}`}>
              <div className="flex min-w-0 items-start gap-3">
                <div className={`mt-0.5 shrink-0 ${item.tone === "critical" ? "text-[#EF4444]" : "text-[#F59E0B]"}`}>{item.icon}</div>
                <div className="min-w-0"><div className="text-sm font-semibold text-[#F8FAFC]">{item.title}</div><div className={`mt-1 text-xs leading-relaxed ${item.tone === "critical" ? "text-[#FCA5A5]" : "text-[#FCD34D]"}`}>{item.description}</div></div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#F8FAFC]">{item.action} <ChevronRight size={14} /></span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.32fr_0.68fr]">
        <div className={`${CARD_GLOW} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div><h2 className={SECTION_TITLE}>Recent Decisions</h2><p className="mt-1 text-xs text-[#94A3B8]">Latest Gateway outcomes, proof state, and execution state.</p></div>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("audit-log")}>View all Audit Logs <ChevronRight size={13} /></Btn>
          </div>
          <div className="mt-4 space-y-2">
            {recentLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center text-sm text-[#94A3B8]">
                No decisions yet. Register an agent, assign a policy, and test an intent through the Gateway.
              </div>
            ) : recentLogs.map((log) => {
              const proof = decisionProofStatus(log);
              const execution = executionLabel(log);
              return (
                <button key={log.id} type="button" onClick={() => { try { window.sessionStorage.setItem("magen3:audit-record-id", log.id); } catch {} onNavigate("audit-log"); }} className="flex w-full flex-col gap-3 rounded-xl border border-transparent bg-[#0B1220] p-3 text-left transition-colors hover:border-[#1E293B] hover:bg-[#0D1626] sm:flex-row sm:items-center">
                  <div className="shrink-0"><DecisionBadge decision={log.decision} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[#F8FAFC]">{log.agentName} · {log.action}</div>
                    <div className="mt-1 text-xs text-[#94A3B8]">{log.amount} {auditAsset(log)} · {truncate(log.target)}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${proof.className}`}>{proof.label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${executionNeedsAttention(log) ? "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#FCD34D]" : "border-[#1E293B] bg-[#0F172A] text-[#94A3B8]"}`}>{execution}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-[#64748B]">{fmtTs(log.timestamp)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className={`${CARD} p-5`}>
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Security Posture</div><div className="mt-2 text-4xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{averageCoverage}%</div><div className="mt-1 text-sm text-[#94A3B8]">Average configured protection across active agents.</div></div>
              <ShieldCheck size={25} className="text-[#22D3EE]" />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#1E293B]"><div className="h-full rounded-full bg-[#22D3EE] transition-all" style={{ width: `${averageCoverage}%` }} /></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[#64748B]">Policy protected</div><div className="mt-1 font-semibold text-[#F8FAFC]">{agentsWithActivePolicy} of {activeAgents.length}</div></div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[#64748B]">Active policies</div><div className="mt-1 font-semibold text-[#F8FAFC]">{activePolicies.length}</div></div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[#64748B]">Need configuration</div><div className={`mt-1 font-semibold ${agentsNeedingAttention.length ? "text-[#FCD34D]" : "text-[#BBF7D0]"}`}>{agentsNeedingAttention.length}</div></div>
              <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[#64748B]">Policy warnings</div><div className={`mt-1 font-semibold ${inactivePolicyCount ? "text-[#FCD34D]" : "text-[#BBF7D0]"}`}>{inactivePolicyCount}</div></div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#64748B]">Coverage measures configured controls and observed integration state. It is not a guarantee against every exploit.</p>
            <div className="mt-4 flex flex-wrap gap-2"><Btn variant="secondary" size="sm" onClick={() => onNavigate("shields")}>View Agent Shield</Btn><Btn variant="ghost" size="sm" onClick={() => onNavigate("policies")}>Manage Policies</Btn></div>
          </div>

          <div className={`${CARD} p-5`}>
            <div className="flex items-center justify-between gap-3"><div><h2 className={SECTION_TITLE}>Agents Needing Attention</h2><p className="mt-1 text-xs text-[#94A3B8]">Highest-impact agent configuration gaps.</p></div><Btn variant="ghost" size="sm" onClick={() => onNavigate("connected-agents")}>View all</Btn></div>
            <div className="mt-4 space-y-2">
              {agentsNeedingAttention.length === 0 ? (
                <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4 text-sm text-[#BBF7D0]">No active agent currently needs configuration attention.</div>
              ) : agentsNeedingAttention.map(({ agent, coverage, issue }) => (
                <button key={agent.id} type="button" onClick={() => onNavigate("connected-agents")} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-3 text-left transition-colors hover:border-[#334155]">
                  <div className="min-w-0"><div className="font-semibold text-[#F8FAFC]">{agent.name}</div><div className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#94A3B8]">{issue}</div></div>
                  <div className="shrink-0 text-right"><div className="text-lg font-bold text-[#F8FAFC]">{coverage?.score ?? 0}%</div><div className="text-[10px] uppercase tracking-wider text-[#64748B]">coverage</div></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Server size={17} className={serviceCounts.attention || serviceCounts.unavailable ? "text-[#F59E0B]" : "text-[#22C55E]"} /><h2 className={SECTION_TITLE}>System Health</h2></div>
            <p className="mt-1 text-xs text-[#94A3B8]">Critical infrastructure and provider-backed services only.</p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
            <span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1 text-[#BBF7D0]">{serviceCounts.operational} Operational</span>
            {serviceCounts.attention > 0 && <span className="rounded-full border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-2 py-1 text-[#FCD34D]">{serviceCounts.attention} Attention</span>}
            {serviceCounts.unavailable > 0 && <span className="rounded-full border border-[#EF4444]/20 bg-[#EF4444]/10 px-2 py-1 text-[#FCA5A5]">{serviceCounts.unavailable} Unavailable</span>}
            {serviceCounts.notObserved > 0 && <span className="rounded-full border border-[#1E293B] bg-[#0B1220] px-2 py-1 text-[#94A3B8]">{serviceCounts.notObserved} Not observed</span>}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {visibleServiceItems.map((item) => {
            const statusLabel = item.status === "not-observed" ? "Not observed" : item.status.charAt(0).toUpperCase() + item.status.slice(1);
            const statusClass = item.status === "operational" ? "text-[#22C55E]" : item.status === "attention" ? "text-[#F59E0B]" : item.status === "unavailable" ? "text-[#EF4444]" : "text-[#94A3B8]";
            const dotClass = item.status === "operational" ? "bg-[#22C55E]" : item.status === "attention" ? "bg-[#F59E0B]" : item.status === "unavailable" ? "bg-[#EF4444]" : "bg-[#64748B]";
            return (
              <div key={item.label} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-3">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${dotClass}`} /><span className="text-sm font-semibold text-[#F8FAFC]">{item.label}</span></div><span className={`text-xs font-semibold ${statusClass}`}>{statusLabel}</span></div>
                <div className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{item.detail}</div>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => setShowAllServices((value) => !value)} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#67E8F9] hover:text-[#A5F3FC]">
          {showAllServices ? "Show essential services" : `View all ${serviceItems.length} services`} <ChevronDown size={14} className={`transition-transform ${showAllServices ? "rotate-180" : ""}`} />
        </button>
        <div className="mt-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-xs text-[#64748B]">
          x402 Payment Controls: {x402Ready ? "Foundation Available" : "Not currently confirmed"}. Provider availability never counts as a security pass by itself.
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// Agent Shield Page
// ──────────────────────────────────────────────────────────

const SHIELD_CONTROL_COVERAGE_CHECKS: Record<string, string[]> = {
  "agent-authentication": ["credential", "agent-state"],
  "credential-lifecycle": ["credential"],
  "instruction-integrity": ["instruction-integrity"],
  "tool-mcp-integrity": ["tool-mcp-integrity"],
  "delegation-session-keys": ["delegation-session-keys"],
  "policy-enforcement": ["active-policy", "spend-limits", "destination-controls", "contract-controls"],
  "review-thresholds": ["review-threshold"],
  "approval-quorum": ["approval-workflow"],
  "reviewer-signatures": ["approval-workflow"],
  "organizational-approval": ["organizational-approval"],
  "emergency-controls": ["emergency-controls"],
  "wallet-identity": ["destination-controls"],
  "wallet-spend-controls": ["spend-limits", "destination-controls"],
  "asset-identity": ["capabilities"],
  "contract-identity": ["contract-controls"],
  "entry-point-controls": ["contract-controls"],
  "privileged-actions": ["privileged-action-controls"],
  "contract-upgrades": ["contract-upgrade-safety"],
  "contract-arguments": ["contract-argument-policies"],
  "token-permissions": ["token-permission-controls"],
  "transaction-preflight": ["execution-preflight"],
  "lifecycle-replay": ["lifecycle-replay"],
  "settlement-reconciliation": ["gateway-activity"],
  "rpc-integrity": ["rpc-chain-integrity"],
  "gas-sponsorship": ["gas-sponsorship-fee-safety"],
  "quote-bounds": ["oracle-validation"],
  "oracle-integrity": ["oracle-validation"],
  "bridge-routes": ["bridge-controls"],
  "x402-authorization": ["x402-payment-controls"],
  "x402-settlement": ["x402-payment-controls"],
  "threat-screening": ["threat-intelligence"],
  "compliance-evidence": ["compliance-controls"],
};

const SHIELD_AREA_FINDING_MODULES: Record<string, string[]> = {
  "agent-trust-access": ["Agent Authentication", "Instruction Integrity", "Tool & MCP Integrity", "Delegation & Session Key Safety"],
  "policy-approval-controls": ["Policy Enforcement", "Policy & Approval Controls", "Emergency Circuit Breaker"],
  "wallet-asset-safety": ["Wallet Validation", "Asset Identity"],
  "contract-permission-safety": ["Contract Validation", "Privileged Action Controls", "Contract Upgrade Safety", "Contract Argument Policies", "Token Permission Controls"],
  "execution-integrity": ["Execution Simulation", "Execution Integrity", "Execution & Settlement Reconciliation", "RPC & Chain Integrity", "Gas Sponsorship & Fee Safety"],
  "market-oracle-integrity": ["Oracle Validation", "Execution Quality"],
  "cross-chain-payment-controls": ["Bridge Controls", "x402 Payment Controls", "x402 Settlement"],
  "threat-compliance": ["Threat Intelligence", "Compliance Controls"],
};

function isPendingShieldReview(log: AuditLog) {
  if (log.decision !== "Review Required") return false;
  const status = String(log.approvalStatus || "").trim().toLowerCase();
  return !["approved", "rejected", "expired", "resolved"].includes(status);
}

function compactCapabilities(capabilities: ExecutionCapability[], selectedCapabilities?: ExecutionCapability[]): string[] {
  const relevant = selectedCapabilities
    ? capabilities.filter((capability) => selectedCapabilities.includes(capability))
    : capabilities;
  const allCapabilities = EXECUTION_CAPABILITY_CATALOG.map((item) => item.id);
  if (!selectedCapabilities && relevant.length === allCapabilities.length) return ["All capabilities"];
  const visible: string[] = relevant.slice(0, 2);
  if (relevant.length > 2) visible.push(`+${relevant.length - 2} more`);
  return visible.length ? visible : ["Not currently relevant"];
}

function AgentShieldPage({
  agents,
  policies,
  auditLogs,
  apiOnline,
  onNavigate,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  apiOnline: boolean;
  onNavigate: (p: Page) => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState("all");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [showFullPipeline, setShowFullPipeline] = useState(false);

  useEffect(() => {
    if (selectedAgentId !== "all" && !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId("all");
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAreaId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedAreaId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedAreaId]);

  const activeAgents = useMemo(() => agents.filter((agent) => agent.status === "Active"), [agents]);
  const selectedAgent = selectedAgentId === "all" ? undefined : agents.find((agent) => agent.id === selectedAgentId);
  const selectedCapabilities = selectedAgent ? normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type) : undefined;
  const scopedAgents = selectedAgent ? [selectedAgent] : activeAgents;
  const scopedLogs = useMemo(() => {
    const items = selectedAgent ? auditLogs.filter((log) => log.agentId === selectedAgent.id) : auditLogs;
    return [...items].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }, [auditLogs, selectedAgent]);
  const scopedCoverages = scopedAgents.map((agent) => ({
    agent,
    coverage: calculateSecurityCoverage(agent, getActivePolicy(policies, agent.id), auditLogs.filter((log) => log.agentId === agent.id)),
  }));
  const averageCoverage = scopedCoverages.length
    ? Math.round(scopedCoverages.reduce((sum, item) => sum + item.coverage.score, 0) / scopedCoverages.length)
    : 0;
  const selectedCoverage = selectedAgent
    ? calculateSecurityCoverage(selectedAgent, getActivePolicy(policies, selectedAgent.id), scopedLogs)
    : undefined;
  const latestLog = scopedLogs[0];
  const pendingReviews = scopedLogs.filter(isPendingShieldReview);
  const unresolvedExecutions = scopedLogs.filter(executionNeedsAttention);
  const protectionControls = PROTECTION_MODULE_CATALOG.flatMap((area) => area.controls);
  const statusCounts = protectionControls.reduce<Record<string, number>>((acc, control) => {
    acc[control.status] = (acc[control.status] || 0) + 1;
    return acc;
  }, {});
  const visibleAreas = selectedAgent && selectedCapabilities
    ? recommendedModules(selectedCapabilities)
    : PROTECTION_MODULE_CATALOG;
  const selectedArea = PROTECTION_MODULE_CATALOG.find((area) => area.id === selectedAreaId);

  const coverageCheckById = useMemo(() => new Map((selectedCoverage?.checks || []).map((check) => [check.id, check])), [selectedCoverage]);
  const controlCoverageIssue = (controlId: string) => {
    const mapped = SHIELD_CONTROL_COVERAGE_CHECKS[controlId] || [];
    return mapped.map((id) => coverageCheckById.get(id)).find((check) => check && !check.passed);
  };

  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      action: string;
      page: Page;
      severity: "warning" | "critical";
    }> = [];
    if (!apiOnline) {
      items.push({
        id: "gateway-unavailable",
        title: "Gateway status is unavailable",
        description: "Agent Shield cannot confirm live Gateway connectivity. Check the deployed backend before allowing agent execution.",
        action: "Open settings",
        page: "settings",
        severity: "critical",
      });
    }
    if (agents.length === 0) {
      items.push({
        id: "no-agents",
        title: "No autonomous agent is connected",
        description: "Register an agent to configure protection coverage and begin evaluating intents.",
        action: "Manage agents",
        page: "connected-agents",
        severity: "warning",
      });
    } else if (!selectedAgent && activeAgents.length === 0) {
      items.push({
        id: "no-active-agents",
        title: "No connected agent is active",
        description: "All registered agents are currently revoked, so the Gateway has no active execution identity to protect.",
        action: "Manage agents",
        page: "connected-agents",
        severity: "critical",
      });
    }
    if (selectedAgent?.status === "Revoked") {
      items.push({
        id: "selected-agent-revoked",
        title: `${selectedAgent.name} is revoked`,
        description: "This agent cannot authenticate or submit new execution intents until a valid active configuration is restored.",
        action: "Manage agent",
        page: "connected-agents",
        severity: "critical",
      });
    }
    const agentsWithoutPolicy = scopedAgents.filter((agent) => !getActivePolicy(policies, agent.id));
    if (agentsWithoutPolicy.length > 0) {
      items.push({
        id: "missing-policy",
        title: `${agentsWithoutPolicy.length} ${agentsWithoutPolicy.length === 1 ? "agent has" : "agents have"} no active policy`,
        description: agentsWithoutPolicy.length === 1
          ? `${agentsWithoutPolicy[0].name} cannot receive complete policy protection until an active policy is assigned.`
          : `${agentsWithoutPolicy.slice(0, 2).map((agent) => agent.name).join(", ")}${agentsWithoutPolicy.length > 2 ? ` and ${agentsWithoutPolicy.length - 2} more` : ""} need active policies.`,
        action: "Configure policies",
        page: "policies",
        severity: "critical",
      });
    }
    const lowCoverageAgents = scopedCoverages.filter(({ agent, coverage }) => getActivePolicy(policies, agent.id) && coverage.score < 65);
    if (lowCoverageAgents.length > 0) {
      items.push({
        id: "coverage-attention",
        title: `${lowCoverageAgents.length} ${lowCoverageAgents.length === 1 ? "agent needs" : "agents need"} stronger coverage`,
        description: lowCoverageAgents.length === 1
          ? `${lowCoverageAgents[0].agent.name} is at ${lowCoverageAgents[0].coverage.score}% configured protection coverage.`
          : `Coverage gaps are visible across ${lowCoverageAgents.length} active agents.`,
        action: "Review agents",
        page: "connected-agents",
        severity: "warning",
      });
    }
    if (pendingReviews.length > 0) {
      items.push({
        id: "pending-review",
        title: `${pendingReviews.length} ${pendingReviews.length === 1 ? "decision is" : "decisions are"} awaiting review`,
        description: `The oldest unresolved review is for ${pendingReviews[pendingReviews.length - 1]?.agentName || "an agent"}. Execution must remain gated until it is resolved.`,
        action: "Review audit",
        page: "audit-log",
        severity: "warning",
      });
    }
    if (unresolvedExecutions.length > 0) {
      items.push({
        id: "unresolved-execution",
        title: `${unresolvedExecutions.length} unresolved ${unresolvedExecutions.length === 1 ? "execution" : "executions"}`,
        description: "Pending, uncertain, or replaced transactions must be reconciled before an unsafe retry is attempted.",
        action: "View executions",
        page: "audit-log",
        severity: unresolvedExecutions.some((log) => canonicalExecutionStatus(log.executionStatus || "") === "uncertain") ? "critical" : "warning",
      });
    }
    const failedProofs = scopedLogs.filter((log) => log.decisionProofStatus === "failed");
    if (failedProofs.length > 0) {
      items.push({
        id: "proof-failure",
        title: `${failedProofs.length} Casper decision ${failedProofs.length === 1 ? "proof needs" : "proofs need"} attention`,
        description: "The authorization decision remains in the audit record, but its Casper proof was not confirmed by the relayer.",
        action: "Inspect audit",
        page: "audit-log",
        severity: "critical",
      });
    }
    return items;
  }, [activeAgents.length, agents.length, apiOnline, pendingReviews, policies, scopedAgents, scopedCoverages, scopedLogs, selectedAgent, unresolvedExecutions]);

  const protectionAreaIcons: Record<string, ReactElement> = {
    "agent-trust-access": <Lock size={20} />,
    "policy-approval-controls": <FileText size={20} />,
    "wallet-asset-safety": <Wallet size={20} />,
    "contract-permission-safety": <Code2 size={20} />,
    "execution-integrity": <Zap size={20} />,
    "market-oracle-integrity": <TrendingUp size={20} />,
    "cross-chain-payment-controls": <Globe size={20} />,
    "threat-compliance": <ShieldAlert size={20} />,
  };

  const selectedAreaControlGroups = useMemo(() => {
    if (!selectedArea) return [];
    const needsConfiguration = selectedArea.controls.filter((control) => Boolean(controlCoverageIssue(control.id)));
    const remaining = selectedArea.controls.filter((control) => !needsConfiguration.includes(control));
    return [
      { id: "needs-configuration", label: "Needs configuration", controls: needsConfiguration, tone: "warning" },
      { id: "active-protection", label: "Active protection", controls: remaining.filter((control) => control.status === "Live"), tone: "live" },
      { id: "foundation", label: "Available foundation", controls: remaining.filter((control) => control.status === "Foundation Available" || control.status === "Preview"), tone: "foundation" },
      { id: "roadmap", label: "Roadmap", controls: remaining.filter((control) => control.status === "Planned"), tone: "planned" },
    ].filter((group) => group.controls.length > 0);
  }, [coverageCheckById, selectedArea]);

  const compactPipeline = useMemo(() => {
    if (!latestLog?.pipelineStages?.length) return [];
    const priority: Record<string, number> = { failed: 5, warning: 4, pending: 3, completed: 2, skipped: 1 };
    const groups = [
      { id: "received", label: "Received", match: (id: string) => id.includes("intent") && id.includes("received") },
      { id: "authenticated", label: "Authenticated", match: (id: string) => id.includes("authentication") },
      { id: "policy", label: "Policy", match: (id: string) => id.includes("policy") && !id.includes("approval") },
      { id: "protection", label: "Protection", match: (id: string) => ["wallet", "contract", "execution", "market", "oracle", "bridge", "threat", "compliance", "protection"].some((word) => id.includes(word)) && !id.includes("submitted") && !id.includes("confirmed") },
      { id: "decision", label: "Decision", match: (id: string) => id.includes("risk") || id === "decision" || id.endsWith("-decision") },
      { id: "audit", label: "Audit", match: (id: string) => id.includes("audit") },
      { id: "proof", label: "Casper Proof", match: (id: string) => id.includes("casper") || id.includes("proof") },
      { id: "settlement", label: "Settlement", match: (id: string) => id.includes("settlement") || id.includes("reconciliation") },
    ];
    return groups.flatMap((group) => {
      const matches = latestLog.pipelineStages!.filter((stage) => group.match(stage.id.toLowerCase()));
      if (matches.length === 0) return [];
      const status = [...matches].sort((left, right) => (priority[right.status] || 0) - (priority[left.status] || 0))[0].status;
      return [{ ...group, status }];
    });
  }, [latestLog]);

  if (agents.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Agent Shield" description="Pre-execution protection becomes operational as soon as you protect the first agent." meta={<span className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#22C55E]"><ShieldCheck size={13} /> Live</span>} />
        <EmptyState
          title="Protect your first agent"
          description="Choose the agent's job and protection level. Magen3 will create the capabilities, starter policy, credentials, and first protected test without requiring you to configure every control manually."
          action={<div className="flex flex-wrap justify-center gap-2"><Btn variant="primary" onClick={() => requestAgentOnboarding(onNavigate, "guided")}><ShieldCheck size={16} /> Start Guided Setup</Btn><Btn variant="secondary" onClick={() => requestAgentOnboarding(onNavigate, "advanced")}><Settings size={16} /> Advanced Setup</Btn></div>}
        />
        <div className="grid gap-3 md:grid-cols-3">{[
          ["1", "Choose what to protect", "Magen3 infers relevant capabilities and protection areas."],
          ["2", "Apply secure defaults", "Start with Standard or Strict protection, then customise later."],
          ["3", "Run a protected test", "See the deterministic decision, Audit Log, and Casper proof flow."],
        ].map(([number, title, detail]) => <div key={number} className={`${CARD} p-4`}><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#22D3EE]/20 bg-[#22D3EE]/10 text-xs font-bold text-[#22D3EE]">{number}</span><div><div className="text-sm font-semibold text-[#F8FAFC]">{title}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{detail}</div></div></div></div>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Shield"
        description="Pre-execution protection and operational oversight for autonomous blockchain agents."
        meta={<>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#22C55E]"><ShieldCheck size={13} /> Live</span>
          <span className="inline-flex rounded-full border border-[#1E293B] bg-[#0B1220] px-2.5 py-1 text-xs font-semibold text-[#94A3B8]">{activeAgents.length} active {activeAgents.length === 1 ? "agent" : "agents"}</span>
          {!apiOnline && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#EF4444]"><Server size={12} /> Gateway unavailable</span>}
        </>}
        actions={<>
          <Btn variant="secondary" onClick={() => onNavigate("intent-playground")}><Send size={16} /> Test Intent</Btn>
          <Btn variant="primary" onClick={() => onNavigate("connected-agents")}><Bot size={16} /> Manage Agents</Btn>
        </>}
      />

      <div className={`${CARD} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Viewing</div>
            <div className="mt-1 text-sm text-[#F8FAFC]">Choose an agent to focus coverage, findings, and operational attention.</div>
          </div>
          <div className="relative w-full sm:w-72">
            <select
              className={`${INPUT_CLS} appearance-none pr-10`}
              value={selectedAgentId}
              onChange={(event) => {
                setSelectedAgentId(event.target.value);
                setSelectedAreaId(null);
                setShowFullPipeline(false);
              }}
            >
              <option value="all">All Agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.status}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          </div>
        </div>
      </div>

      <div className={`${CARD_GLOW} overflow-hidden bg-[#1E293B]`}>
        <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: selectedAgent ? "Security Coverage" : "Average Coverage",
              value: `${averageCoverage}%`,
              detail: selectedAgent ? selectedCoverage?.label || "No coverage data" : `${scopedAgents.length} active ${scopedAgents.length === 1 ? "agent" : "agents"}`,
              icon: <ShieldCheck size={18} />,
              tone: "text-[#22D3EE]",
            },
            {
              label: selectedAgent ? "Agent Status" : "Agents Protected",
              value: selectedAgent ? selectedAgent.status : `${activeAgents.length} of ${agents.length}`,
              detail: selectedAgent ? `${normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type).length} execution capabilities` : "currently active",
              icon: <Bot size={18} />,
              tone: selectedAgent?.status === "Revoked" ? "text-[#EF4444]" : "text-[#22C55E]",
            },
            {
              label: "Pending Reviews",
              value: pendingReviews.length,
              detail: pendingReviews.length ? "human action required" : "nothing waiting",
              icon: <Clock size={18} />,
              tone: pendingReviews.length ? "text-[#F59E0B]" : "text-[#22C55E]",
            },
            {
              label: "Unresolved Executions",
              value: unresolvedExecutions.length,
              detail: unresolvedExecutions.length ? "retry remains gated" : "settlement clear",
              icon: <RefreshCw size={18} />,
              tone: unresolvedExecutions.length ? "text-[#F59E0B]" : "text-[#22C55E]",
            },
          ].map((metric) => (
            <div key={metric.label} className="flex items-start justify-between gap-3 bg-[#111827] p-4 sm:p-5">
              <div>
                <div className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{metric.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{metric.label}</div>
                <div className="mt-1 text-xs text-[#64748B]">{metric.detail}</div>
              </div>
              <span className={metric.tone}>{metric.icon}</span>
            </div>
          ))}
        </div>
      </div>

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle size={17} className={attentionItems.length ? "text-[#F59E0B]" : "text-[#22C55E]"} />
              <h2 className={SECTION_TITLE}>Attention Required</h2>
            </div>
            <p className="mt-1 text-sm text-[#94A3B8]">Only operational conditions that need action are shown here.</p>
          </div>
          {attentionItems.length > 0 && <span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2.5 py-1 text-xs font-semibold text-[#F59E0B]">{attentionItems.length} items</span>}
        </div>
        {attentionItems.length === 0 ? (
          <div className="flex items-start gap-3 p-5">
            <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/10 p-2.5 text-[#22C55E]"><CheckCircle size={18} /></div>
            <div>
              <div className="text-sm font-semibold text-[#F8FAFC]">All active agents are operating normally</div>
              <div className="mt-1 text-sm text-[#94A3B8]">No pending reviews, unresolved executions, failed proofs, or mapped configuration gaps require immediate action.</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#1E293B]">
            {attentionItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`mt-0.5 rounded-lg border p-2 ${item.severity === "critical" ? "border-[#EF4444]/25 bg-[#EF4444]/10 text-[#EF4444]" : "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>
                    {item.severity === "critical" ? <ShieldAlert size={16} /> : <AlertTriangle size={16} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#F8FAFC]">{item.title}</div>
                    <div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{item.description}</div>
                  </div>
                </div>
                <Btn variant="ghost" size="sm" className="self-start whitespace-nowrap sm:self-auto" onClick={() => onNavigate(item.page)}>{item.action}<ChevronRight size={14} /></Btn>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className={SECTION_TITLE}>Protection Areas</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              {selectedAgent
                ? `${visibleAreas.length} of 8 areas are relevant to ${selectedAgent.name} based on its configured capabilities.`
                : "Eight coherent protection areas keep Agent Shield clear while preserving control-level depth."}
            </p>
          </div>
          {selectedAgent && selectedCapabilities && (
            <div className="text-xs text-[#64748B]">Relevant to {selectedCapabilities.join(" · ")}</div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {visibleAreas.map((area) => {
            const live = area.controls.filter((control) => control.status === "Live").length;
            const foundation = area.controls.filter((control) => control.status === "Foundation Available" || control.status === "Preview").length;
            const needsConfiguration = selectedAgent ? area.controls.filter((control) => Boolean(controlCoverageIssue(control.id))).length : 0;
            const areaModules = SHIELD_AREA_FINDING_MODULES[area.id] || [];
            const latestAreaLog = scopedLogs.find((log) => log.moduleFindings?.some((finding) => areaModules.includes(finding.module)));
            const recentFindingAttention = latestAreaLog?.moduleFindings?.filter((finding) => areaModules.includes(finding.module) && ["warning", "fail", "unavailable"].includes(finding.status)).length || 0;
            const capabilities = compactCapabilities(area.capabilities, selectedCapabilities);
            return (
              <button
                type="button"
                key={area.id}
                onClick={() => setSelectedAreaId(area.id)}
                className={`${CARD} group flex min-h-[260px] flex-col p-5 text-left transition-colors hover:border-[#334155] focus:outline-none focus:border-[#22D3EE]/50`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/10 p-2.5 text-[#22D3EE]">{protectionAreaIcons[area.id] || <Shield size={20} />}</div>
                  {selectedAgent ? needsConfiguration > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]"><AlertTriangle size={10} /> {needsConfiguration} need config</span>
                  ) : recentFindingAttention > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]"><AlertTriangle size={10} /> Recent finding</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#22C55E]"><CheckCircle size={10} /> No attention</span>
                  ) : (
                    <span className="inline-flex rounded-full border border-[#1E293B] bg-[#0B1220] px-2 py-0.5 text-[10px] font-semibold text-[#94A3B8]">Catalogue view</span>
                  )}
                </div>
                <h3 className="mt-4 text-base font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{area.name}</h3>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#94A3B8]">{area.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                  <span className="inline-flex items-center gap-1 text-[#22C55E]"><span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" /> {live} Live</span>
                  {foundation > 0 && <span className="inline-flex items-center gap-1 text-[#22D3EE]"><span className="h-1.5 w-1.5 rounded-full bg-[#22D3EE]" /> {foundation} Foundation</span>}
                  <span className="text-[#64748B]">{area.controls.length} controls</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {capabilities.map((capability) => (
                    <span key={capability} className="rounded-full border border-[#1E293B] bg-[#0B1220] px-2 py-0.5 text-[10px] font-semibold text-[#94A3B8]">{capability}</span>
                  ))}
                </div>
                <div className="mt-auto flex items-end justify-between gap-3 border-t border-[#1E293B] pt-4">
                  <div className="text-[10px] text-[#64748B]">{latestAreaLog ? `Last evaluated ${fmtTs(latestAreaLog.timestamp)}` : "Not observed yet"}</div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#22D3EE]">View controls <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${CARD_GLOW} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-[#22D3EE]" />
              <h2 className={SECTION_TITLE}>Latest Evaluation</h2>
            </div>
            {latestLog ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#94A3B8]">
                <span className="font-semibold text-[#F8FAFC]">{latestLog.agentName}</span>
                <span>·</span>
                <span>{latestLog.action}{latestLog.amount > 0 ? ` ${latestLog.amount} ${auditAsset(latestLog)}` : ""}</span>
                <span>·</span>
                <span>{fmtTs(latestLog.timestamp)}</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-[#94A3B8]">No recent evaluation is available for this view.</p>
            )}
          </div>
          {latestLog && <DecisionBadge decision={latestLog.decision} />}
        </div>

        {latestLog ? (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {compactPipeline.length > 0 ? compactPipeline.map((stage, index) => {
                const stageClass = stage.status === "failed"
                  ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
                  : stage.status === "warning" || stage.status === "pending"
                    ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
                    : stage.status === "completed"
                      ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
                      : "border-[#1E293B] bg-[#0B1220] text-[#64748B]";
                return (
                  <div key={stage.id} className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${stageClass}`}>
                      {stage.status === "completed" ? <CheckCircle size={12} /> : stage.status === "failed" ? <XCircle size={12} /> : stage.status === "warning" || stage.status === "pending" ? <Clock size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      {stage.label}
                    </span>
                    {index < compactPipeline.length - 1 && <ArrowRight size={13} className="text-[#334155]" />}
                  </div>
                );
              }) : <div className="text-sm text-[#94A3B8]">Detailed pipeline stages were not stored for this legacy audit record.</div>}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E293B] pt-4">
              <div className="text-xs text-[#94A3B8]">{latestLog.primaryReason || latestLog.reason}</div>
              <Btn variant="ghost" size="sm" onClick={() => setShowFullPipeline((current) => !current)}>{showFullPipeline ? "Hide full pipeline" : "View full pipeline"}<ChevronDown size={14} className={showFullPipeline ? "rotate-180" : ""} /></Btn>
            </div>
            {showFullPipeline && <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><PipelineTimeline stages={latestLog.pipelineStages} /></div>}
          </>
        ) : (
          <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-5">
            <div className="text-sm text-[#94A3B8]">Test an intent to see Agent Shield authenticate the agent, apply policy, run relevant controls, assess risk, and record the decision.</div>
            <Btn variant="secondary" size="sm" onClick={() => onNavigate("intent-playground")}><Send size={14} /> Test Intent</Btn>
          </div>
        )}
      </section>

      <details className={`${CARD} group p-4`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[#F8FAFC]">Control Availability</div>
            <div className="mt-1 text-xs text-[#94A3B8]">Implementation maturity across the Agent Shield catalogue.</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs font-semibold text-[#22C55E]">{statusCounts.Live || 0} Live</span>
            <span className="text-xs font-semibold text-[#22D3EE]">{statusCounts["Foundation Available"] || 0} Foundation</span>
            {(statusCounts.Preview || 0) > 0 && <span className="text-xs font-semibold text-[#22D3EE]">{statusCounts.Preview} Preview</span>}
            <span className="text-xs font-semibold text-[#64748B]">{statusCounts.Planned || 0} Planned</span>
            <ChevronDown size={15} className="text-[#64748B] transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <div className="mt-4 border-t border-[#1E293B] pt-4 text-xs leading-relaxed text-[#94A3B8]">
          Availability describes implementation maturity, not whether every control is configured for every agent. Foundation controls have enforceable groundwork but still require the stated provider, polling, wallet-signature, or end-to-end deployment evidence before they can be labelled Live. Unavailable findings never contribute a pass.
        </div>
      </details>

      {selectedArea && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#050B14]/75 backdrop-blur-sm" onMouseDown={() => setSelectedAreaId(null)}>
          <div role="dialog" aria-modal="true" aria-label={`${selectedArea.name} controls`} className="h-full w-full max-w-xl overflow-y-auto border-l border-[#1E293B] bg-[#0B1220] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 border-b border-[#1E293B] bg-[#0B1220]/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/10 p-2.5 text-[#22D3EE]">{protectionAreaIcons[selectedArea.id] || <Shield size={20} />}</div>
                  <div>
                    <div className="text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{selectedArea.name}</div>
                    <div className="mt-1 text-xs text-[#94A3B8]">{selectedAgent ? `Configuration for ${selectedAgent.name}` : "Platform control catalogue"}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedAreaId(null)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><X size={18} /></button>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <p className="text-sm leading-relaxed text-[#94A3B8]">{selectedArea.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {compactCapabilities(selectedArea.capabilities, selectedCapabilities).map((capability) => (
                  <span key={capability} className="rounded-full border border-[#1E293B] bg-[#111827] px-2.5 py-1 text-[10px] font-semibold text-[#94A3B8]">{capability}</span>
                ))}
              </div>

              {selectedAreaControlGroups.map((group) => (
                <section key={group.id}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">{group.label}</h3>
                    <span className="text-[10px] text-[#64748B]">{group.controls.length} {group.controls.length === 1 ? "control" : "controls"}</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#111827]">
                    {group.controls.map((control, index) => {
                      const issue = controlCoverageIssue(control.id);
                      const dotClass = group.tone === "warning" ? "bg-[#F59E0B]" : group.tone === "live" ? "bg-[#22C55E]" : group.tone === "foundation" ? "bg-[#22D3EE]" : "bg-[#64748B]";
                      return (
                        <div key={control.id} className={`${index > 0 ? "border-t border-[#1E293B]" : ""} p-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`} />
                              <div>
                                <div className="text-sm font-semibold text-[#F8FAFC]">{control.name}</div>
                                <div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{issue?.detail || control.description}</div>
                                {issue && <div className="mt-2 text-xs leading-relaxed text-[#F59E0B]">{issue.recommendation}</div>}
                              </div>
                            </div>
                            <span className={`whitespace-nowrap text-[10px] font-semibold ${control.status === "Live" ? "text-[#22C55E]" : control.status === "Planned" ? "text-[#64748B]" : "text-[#22D3EE]"}`}>{control.status === "Foundation Available" ? "Foundation" : control.status}</span>
                          </div>
                          {control.configurable && selectedAgent && (
                            <div className="mt-3 pl-5">
                              <Btn
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedAreaId(null);
                                  onNavigate(["agent-authentication", "credential-lifecycle"].includes(control.id) ? "connected-agents" : issue?.page as Page || "policies");
                                }}
                              >
                                View configuration <ChevronRight size={13} />
                              </Btn>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const GUIDED_USE_CASES: GuidedUseCase[] = [
  {
    id: "trading",
    title: "Trading Agent",
    description: "Swaps, staking, routing, liquidity, and autonomous trade execution.",
    purpose: "Prepare and execute protected swaps, staking, liquidity, and other market-sensitive blockchain actions.",
    capabilities: ["Trading", "Wallet Management", "dApp Interactions"],
    template: "Balanced Trading",
    icon: <TrendingUp size={20} />,
  },
  {
    id: "wallet",
    title: "Wallet Assistant",
    description: "Transfers, destinations, balances, and controlled wallet operations.",
    purpose: "Prepare protected transfers and wallet operations while enforcing destination, amount, and spending controls.",
    capabilities: ["Wallet Management"],
    template: "Wallet Safety",
    icon: <Wallet size={20} />,
  },
  {
    id: "treasury",
    title: "Treasury Agent",
    description: "DAO, team, protocol, or organisation fund management.",
    purpose: "Manage treasury payments and high-value asset movement with deterministic limits and human approval.",
    capabilities: ["Treasury Operations", "Wallet Management", "Enterprise Automation"],
    template: "Treasury Safe Mode",
    icon: <Database size={20} />,
  },
  {
    id: "dapp",
    title: "DeFi or dApp Agent",
    description: "Contract calls, vaults, borrowing, staking, and protocol workflows.",
    purpose: "Interact with approved contracts and DeFi protocols through protected, policy-bound execution requests.",
    capabilities: ["dApp Interactions", "Wallet Management"],
    template: "DeFi Automation",
    icon: <Layers size={20} />,
  },
  {
    id: "enterprise",
    title: "Enterprise Automation",
    description: "Organisation-grade workflows, controls, and operational permissions.",
    purpose: "Run controlled organisation workflows with approval, compliance, and execution-integrity safeguards.",
    capabilities: ["Enterprise Automation", "Wallet Management"],
    template: "Enterprise Controlled Automation",
    icon: <ShieldCheck size={20} />,
  },
  {
    id: "custom",
    title: "Custom Agent",
    description: "Developer-defined autonomous blockchain capabilities.",
    purpose: "Protect a custom autonomous workflow through Magen3 before wallet signing or blockchain execution.",
    capabilities: ["Custom", "Wallet Management"],
    template: "Custom",
    icon: <Code2 size={20} />,
  },
];

const INTEGRATION_TARGETS: Array<{ id: IntegrationTarget; description: string }> = [
  { id: "Codex", description: "Generate concise instructions for a Codex skill or coding workspace." },
  { id: "MCP", description: "Connect through the official Magen3 MCP server and tool contract." },
  { id: "JavaScript", description: "Use the official TypeScript/JavaScript SDK in a web or Node agent." },
  { id: "Python", description: "Use the official Python SDK in an automation or agent service." },
  { id: "Custom API", description: "Call the authenticated Agent Gateway directly over HTTP." },
  { id: "Integrate later", description: "Create the protected agent now and finish integration later." },
];

function createInitialAgentRegistrationDraft(mode: OnboardingSetupMode = "guided") {
  return {
    name: "",
    purpose: mode === "guided" ? GUIDED_USE_CASES[0].purpose : "",
    permissionLevel: "Limited Execution" as PermissionLevel,
    executionCapabilities: [...GUIDED_USE_CASES[0].capabilities] as ExecutionCapability[],
    policyMode: "recommended" as "recommended" | "existing" | "custom",
    templateType: GUIDED_USE_CASES[0].template,
    existingPolicyId: "",
    policyName: `${GUIDED_USE_CASES[0].template} Policy`,
    maxTransaction: 75,
    dailyLimit: 300,
    approvalThreshold: 50,
    trustedContractsText: "",
    blockedActions: ["RWA Proof Update", "Oracle Data Update"] as string[],
    riskMode: "Balanced" as RiskMode,
    guidedUseCase: "trading" as GuidedUseCaseId,
    integrationTarget: "Codex" as IntegrationTarget,
    protectionLevel: "Strict" as ProtectionLevel,
    reviewResolutionMode: "Autonomous" as ReviewResolutionMode,
    executionWalletAddress: "",
    demoConfiguration: false,
  };
}

function guidedProtectionRules(level: ProtectionLevel): Record<string, unknown> {
  if (level === "Strict") {
    return {
      instructionIntegrityMode: "Enforce",
      lifecycleControlMode: "Enforce",
      lifecycleUnavailableAction: "Review",
      threatIntelligenceMode: "Review",
      threatIntelligenceUnavailableAction: "Review",
      oracleValidationMode: "Review",
      oracleValidationUnavailableAction: "Review",
      rpcIntegrityMode: "Review",
      rpcIntegrityUnavailableAction: "Review",
      feeSafetyMode: "Review",
      feeSafetySponsorshipUnavailableAction: "Review",
      bridgeControlMode: "Review",
      bridgeControlUnavailableAction: "Review",
      tokenPermissionMode: "Enforce",
      tokenPermissionUnknownSpenderAction: "Review",
      tokenPermissionUnlimitedApprovalAction: "Review",
      privilegedActionMode: "Enforce",
      unknownPrivilegedAction: "Review",
      reviewResolutionMode: "Autonomous",
      reconciliationEnabled: true,
      pendingRetryAction: "Block",
      uncertainRetryAction: "Block",
    };
  }
  if (level === "Standard") {
    return {
      instructionIntegrityMode: "Review",
      lifecycleControlMode: "Enforce",
      lifecycleUnavailableAction: "Warn",
      threatIntelligenceMode: "Review",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Review",
      oracleValidationUnavailableAction: "Warn",
      rpcIntegrityMode: "Review",
      rpcIntegrityUnavailableAction: "Warn",
      feeSafetyMode: "Review",
      feeSafetySponsorshipUnavailableAction: "Warn",
      tokenPermissionMode: "Review",
      privilegedActionMode: "Review",
      reviewResolutionMode: "Autonomous",
      reconciliationEnabled: true,
      pendingRetryAction: "Block",
      uncertainRetryAction: "Block",
    };
  }
  return {};
}

function AgentRegistrationWizard({
  open,
  initialMode = "guided",
  policies,
  walletAddress,
  onClose,
  onNavigate,
  onRegisterAgent,
  onCreatePolicy,
  onSubmitGatewayIntent,
  onCreated,
}: {
  open: boolean;
  initialMode?: OnboardingSetupMode;
  policies: Policy[];
  walletAddress: string;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onRegisterAgent: (agent: AgentRegistrationDraft) => Promise<Agent | undefined> | Agent | undefined;
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
  onCreated: (agent: Agent) => void;
}) {
  const [setupMode, setSetupMode] = useState<OnboardingSetupMode>(initialMode);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AgentGatewayResponse | null>(null);
  const [error, setError] = useState("");
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);
  const [createdPolicy, setCreatedPolicy] = useState<Policy | null>(null);
  const [credentialSaved, setCredentialSaved] = useState(false);
  const [showIntegrationCode, setShowIntegrationCode] = useState(false);
  const [copied, setCopied] = useState("");
  const [draft, setDraft] = useState(() => createInitialAgentRegistrationDraft(initialMode));

  useEffect(() => {
    if (!open) return;
    setSetupMode(initialMode);
    setStep(1);
    setError("");
    setTestResult(null);
    setCreatedAgent(null);
    setCreatedPolicy(null);
    setCredentialSaved(false);
    setShowIntegrationCode(false);
    setDraft(createInitialAgentRegistrationDraft(initialMode));
  }, [open, initialMode]);

  const steps = setupMode === "guided"
    ? ["Use case", "Agent", "Protection", "Connect & test"]
    : ["Agent Details", "Capabilities", "Protection", "Starter Policy", "Review", "Quick Start"];
  const capabilities = normalizeCapabilities(draft.executionCapabilities);
  const modules = recommendedModules(capabilities);
  const selectedExistingPolicy = policies.find((policy) => policy.id === draft.existingPolicyId);
  const selectedUseCase = GUIDED_USE_CASES.find((useCase) => useCase.id === draft.guidedUseCase) || GUIDED_USE_CASES[0];

  const applyTemplate = useCallback((templateName: string) => {
    const template = POLICY_TEMPLATES[templateName] || POLICY_TEMPLATES.Custom;
    setDraft((current) => ({
      ...current,
      templateType: templateName,
      policyName: templateName === "Custom" ? `${current.name || "Agent"} Custom Policy` : `${templateName} Policy`,
      maxTransaction: template.maxTransaction,
      dailyLimit: template.dailyLimit,
      approvalThreshold: template.approvalThreshold,
      trustedContractsText: template.trustedContracts.join("\n"),
      blockedActions: [...template.blockedActions],
      riskMode: template.riskMode,
    }));
  }, []);

  const applyGuidedUseCase = useCallback((useCaseId: GuidedUseCaseId, demoConfiguration = false) => {
    const useCase = GUIDED_USE_CASES.find((item) => item.id === useCaseId) || GUIDED_USE_CASES[0];
    const template = POLICY_TEMPLATES[useCase.template] || POLICY_TEMPLATES.Custom;
    setDraft((current) => ({
      ...current,
      guidedUseCase: useCase.id,
      demoConfiguration,
      name: demoConfiguration ? "Magen3 Demo Trading Agent" : current.name,
      purpose: demoConfiguration ? "Explore Magen3 with a clearly labelled synthetic trading-agent configuration. No real blockchain execution is performed by the onboarding test." : useCase.purpose,
      executionCapabilities: [...useCase.capabilities],
      templateType: useCase.template,
      policyName: demoConfiguration ? "Demo Trading Protection Policy" : `${useCase.template} Policy`,
      policyMode: "recommended",
      maxTransaction: template.maxTransaction,
      dailyLimit: template.dailyLimit,
      approvalThreshold: template.approvalThreshold,
      trustedContractsText: template.trustedContracts.join("\n"),
      blockedActions: [...template.blockedActions],
      riskMode: template.riskMode,
    }));
  }, []);

  const applyProtectionLevel = useCallback((level: ProtectionLevel) => {
    setDraft((current) => {
      const useCase = GUIDED_USE_CASES.find((item) => item.id === current.guidedUseCase) || GUIDED_USE_CASES[0];
      const template = POLICY_TEMPLATES[useCase.template] || POLICY_TEMPLATES.Custom;
      if (level === "Custom") {
        return { ...current, protectionLevel: level, policyMode: "custom" };
      }
      if (level === "Strict") {
        const strictMax = Math.max(10, Math.round(template.maxTransaction * 0.6));
        const strictDaily = Math.max(strictMax * 3, Math.round(template.dailyLimit * 0.7));
        const strictReview = Math.max(5, Math.min(strictMax, Math.round(template.approvalThreshold * 0.6)));
        return {
          ...current,
          protectionLevel: level,
          policyMode: "recommended",
          policyName: `Strict ${useCase.title} Policy`,
          maxTransaction: strictMax,
          dailyLimit: strictDaily,
          approvalThreshold: strictReview,
          blockedActions: [...new Set([...template.blockedActions, "Bridge"])],
          riskMode: "Conservative",
        };
      }
      return {
        ...current,
        protectionLevel: level,
        policyMode: "recommended",
        policyName: `${useCase.template} Policy`,
        maxTransaction: template.maxTransaction,
        dailyLimit: template.dailyLimit,
        approvalThreshold: template.approvalThreshold,
        blockedActions: [...template.blockedActions],
        riskMode: template.riskMode,
      };
    });
  }, []);

  const toggleCapability = useCallback((capability: ExecutionCapability) => {
    setDraft((current) => {
      const selected = current.executionCapabilities.includes(capability)
        ? current.executionCapabilities.filter((item) => item !== capability)
        : [...current.executionCapabilities, capability];
      const safe = selected.length > 0 ? selected : current.executionCapabilities;
      const recommended = recommendedPolicyTemplate(safe);
      const template = POLICY_TEMPLATES[recommended];
      return {
        ...current,
        executionCapabilities: safe,
        ...(current.policyMode === "recommended" ? {
          templateType: recommended,
          policyName: `${recommended} Policy`,
          maxTransaction: template.maxTransaction,
          dailyLimit: template.dailyLimit,
          approvalThreshold: template.approvalThreshold,
          trustedContractsText: template.trustedContracts.join("\n"),
          blockedActions: [...template.blockedActions],
          riskMode: template.riskMode,
        } : {}),
      };
    });
  }, []);

  const canContinue = setupMode === "guided"
    ? step === 1
      ? Boolean(draft.guidedUseCase)
      : step === 2
        ? Boolean(draft.name.trim() && draft.purpose.trim() && draft.integrationTarget)
        : step === 3
          ? Boolean(draft.policyName.trim() && draft.maxTransaction > 0 && draft.dailyLimit > 0 && draft.approvalThreshold >= 0)
          : true
    : step === 1
      ? Boolean(draft.name.trim() && draft.purpose.trim())
      : step === 2
        ? capabilities.length > 0
        : step === 4
          ? draft.policyMode === "existing"
            ? Boolean(selectedExistingPolicy)
            : Boolean(draft.policyName.trim() && draft.maxTransaction > 0 && draft.dailyLimit > 0 && draft.approvalThreshold >= 0)
          : true;

  const closeWizard = useCallback(() => {
    setStep(1);
    setCreatedAgent(null);
    setCreatedPolicy(null);
    setError("");
    setCopied("");
    setTestResult(null);
    setCredentialSaved(false);
    setShowIntegrationCode(false);
    setDraft(createInitialAgentRegistrationDraft(initialMode));
    onClose();
  }, [onClose]);

  const createAgentAndPolicy = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const legacyType: AgentType = capabilities.includes("Treasury Operations")
        ? "Treasury Agent"
        : capabilities.includes("Trading")
          ? "Trading Agent"
          : capabilities.includes("dApp Interactions")
            ? "DeFi Agent"
            : "Custom Agent";
      const agent = await onRegisterAgent({
        name: draft.name.trim(),
        purpose: draft.purpose.trim(),
        permissionLevel: draft.permissionLevel,
        type: legacyType,
        executionCapabilities: capabilities,
        capabilityConfiguration: {
          recommendedModules: modules.map((module) => module.id),
          configurationVersion: 1,
          setupMode,
          guidedUseCase: setupMode === "guided" ? draft.guidedUseCase : undefined,
          integrationTarget: setupMode === "guided" ? draft.integrationTarget : undefined,
          protectionLevel: setupMode === "guided" ? draft.protectionLevel : undefined,
          executionWalletAddress: draft.executionWalletAddress.trim() || undefined,
          demoConfiguration: setupMode === "guided" ? draft.demoConfiguration : false,
        },
        onboardingStatus: "complete",
      });
      if (!agent) throw new Error("The agent could not be registered.");
      setCreatedAgent(agent);
      onCreated(agent);

      const existing = draft.policyMode === "existing" ? selectedExistingPolicy : undefined;
      const policyValues = existing ? {
        name: `${agent.name} · ${existing.name}`,
        maxTransaction: existing.maxTransaction,
        dailyLimit: existing.dailyLimit,
        approvalThreshold: existing.approvalThreshold,
        trustedContracts: existing.trustedContracts,
        blockedActions: existing.blockedActions,
        riskMode: existing.riskMode,
        templateType: existing.templateType || "Existing Policy Template",
        structuredRules: existing.structuredRules || {},
      } : {
        name: draft.policyName.trim(),
        maxTransaction: draft.maxTransaction,
        dailyLimit: draft.dailyLimit,
        approvalThreshold: draft.approvalThreshold,
        trustedContracts: draft.trustedContractsText.split("\n").map((item) => item.trim()).filter(Boolean),
        blockedActions: draft.blockedActions,
        riskMode: draft.riskMode,
        templateType: draft.templateType,
        structuredRules: {},
      };

      const sourceRules: Record<string, unknown> = {
        ...(policyValues.structuredRules || {}),
        ...(setupMode === "guided" ? guidedProtectionRules(draft.protectionLevel) : {}),
      };

      let policy: Policy | undefined;
      try {
        policy = await onCreatePolicy({
        ...policyValues,
        agentId: agent.id,
        status: "Active",
        capabilityScope: capabilities,
        structuredRules: {
          ...sourceRules,
          emergencyControlsEnabled: typeof sourceRules.emergencyControlsEnabled === "boolean" ? sourceRules.emergencyControlsEnabled : true,
          automaticPauseEnabled: typeof sourceRules.automaticPauseEnabled === "boolean" ? sourceRules.automaticPauseEnabled : false,
          emergencyAutomaticPauseAction: typeof sourceRules.emergencyAutomaticPauseAction === "string" ? sourceRules.emergencyAutomaticPauseAction : "Blocked",
          emergencyRepeatedBlockThreshold: typeof sourceRules.emergencyRepeatedBlockThreshold === "number" ? sourceRules.emergencyRepeatedBlockThreshold : 5,
          emergencyReplayAttemptThreshold: typeof sourceRules.emergencyReplayAttemptThreshold === "number" ? sourceRules.emergencyReplayAttemptThreshold : 1,
          emergencyRequestFrequencyThreshold: typeof sourceRules.emergencyRequestFrequencyThreshold === "number" ? sourceRules.emergencyRequestFrequencyThreshold : 120,
          emergencyLookbackSeconds: typeof sourceRules.emergencyLookbackSeconds === "number" ? sourceRules.emergencyLookbackSeconds : 3600,
          emergencySpendingSpikeMultiplier: typeof sourceRules.emergencySpendingSpikeMultiplier === "number" ? sourceRules.emergencySpendingSpikeMultiplier : 5,
          emergencyProviderFailureThreshold: typeof sourceRules.emergencyProviderFailureThreshold === "number" ? sourceRules.emergencyProviderFailureThreshold : 3,
          emergencyUnresolvedExecutionThreshold: typeof sourceRules.emergencyUnresolvedExecutionThreshold === "number" ? sourceRules.emergencyUnresolvedExecutionThreshold : 5,
          emergencyUnresolvedX402Threshold: typeof sourceRules.emergencyUnresolvedX402Threshold === "number" ? sourceRules.emergencyUnresolvedX402Threshold : 3,
          emergencyBridgeFailureThreshold: typeof sourceRules.emergencyBridgeFailureThreshold === "number" ? sourceRules.emergencyBridgeFailureThreshold : 3,
          emergencyPauseDurationSeconds: typeof sourceRules.emergencyPauseDurationSeconds === "number" ? sourceRules.emergencyPauseDurationSeconds : 3600,
          emergencyResumeRequiresApproval: typeof sourceRules.emergencyResumeRequiresApproval === "boolean" ? sourceRules.emergencyResumeRequiresApproval : false,
          emergencyResumeQuorum: typeof sourceRules.emergencyResumeQuorum === "number" ? sourceRules.emergencyResumeQuorum : 1,
          emergencyPauseOnThreatMatch: typeof sourceRules.emergencyPauseOnThreatMatch === "boolean" ? sourceRules.emergencyPauseOnThreatMatch : true,
          emergencyPauseOnOracleDisagreement: typeof sourceRules.emergencyPauseOnOracleDisagreement === "boolean" ? sourceRules.emergencyPauseOnOracleDisagreement : true,
          emergencyPauseOnPrivilegedActionFailure: typeof sourceRules.emergencyPauseOnPrivilegedActionFailure === "boolean" ? sourceRules.emergencyPauseOnPrivilegedActionFailure : true,
          reviewResolutionMode: typeof sourceRules.reviewResolutionMode === "string" ? sourceRules.reviewResolutionMode : (draft.reviewResolutionMode || "Autonomous"),
          instructionIntegrityEnabled: typeof sourceRules.instructionIntegrityEnabled === "boolean" ? sourceRules.instructionIntegrityEnabled : true,
          instructionIntegrityMode: typeof sourceRules.instructionIntegrityMode === "string" ? sourceRules.instructionIntegrityMode : "Review",
          requireGoalBindingForActions: Array.isArray(sourceRules.requireGoalBindingForActions) ? sourceRules.requireGoalBindingForActions : ["Transfer", "Swap", "Stake", "Bridge", "x402 Payment", "DAO Treasury Payment", "Contract Interaction", "Deposit to Vault"],
          requireUserConfirmationForExternalContent: typeof sourceRules.requireUserConfirmationForExternalContent === "boolean" ? sourceRules.requireUserConfirmationForExternalContent : true,
          allowedSourceDomains: Array.isArray(sourceRules.allowedSourceDomains) ? sourceRules.allowedSourceDomains : [],
          blockedSourceDomains: Array.isArray(sourceRules.blockedSourceDomains) ? sourceRules.blockedSourceDomains : [],
          externalContentHighRiskAction: typeof sourceRules.externalContentHighRiskAction === "string" ? sourceRules.externalContentHighRiskAction : "Review",
          allowParameterChangesAfterGoal: typeof sourceRules.allowParameterChangesAfterGoal === "boolean" ? sourceRules.allowParameterChangesAfterGoal : false,
          requireParameterChangeReason: typeof sourceRules.requireParameterChangeReason === "boolean" ? sourceRules.requireParameterChangeReason : true,
          lifecycleControlsEnabled: typeof sourceRules.lifecycleControlsEnabled === "boolean" ? sourceRules.lifecycleControlsEnabled : true,
          lifecycleControlMode: typeof sourceRules.lifecycleControlMode === "string" ? sourceRules.lifecycleControlMode : "Enforce",
          lifecycleUnavailableAction: typeof sourceRules.lifecycleUnavailableAction === "string" ? sourceRules.lifecycleUnavailableAction : "Warn",
          lifecycleRequireIntentId: typeof sourceRules.lifecycleRequireIntentId === "boolean" ? sourceRules.lifecycleRequireIntentId : true,
          lifecycleRequireIdempotencyKey: typeof sourceRules.lifecycleRequireIdempotencyKey === "boolean" ? sourceRules.lifecycleRequireIdempotencyKey : true,
          lifecycleRequireCreatedAt: typeof sourceRules.lifecycleRequireCreatedAt === "boolean" ? sourceRules.lifecycleRequireCreatedAt : true,
          lifecycleRequireExpiry: typeof sourceRules.lifecycleRequireExpiry === "boolean" ? sourceRules.lifecycleRequireExpiry : true,
          lifecycleRequireSequence: typeof sourceRules.lifecycleRequireSequence === "boolean" ? sourceRules.lifecycleRequireSequence : false,
          lifecyclePreventDuplicateFingerprint: typeof sourceRules.lifecyclePreventDuplicateFingerprint === "boolean" ? sourceRules.lifecyclePreventDuplicateFingerprint : true,
          lifecyclePreventRetryAfterUncertain: typeof sourceRules.lifecyclePreventRetryAfterUncertain === "boolean" ? sourceRules.lifecyclePreventRetryAfterUncertain : true,
          lifecyclePreventParameterMutation: typeof sourceRules.lifecyclePreventParameterMutation === "boolean" ? sourceRules.lifecyclePreventParameterMutation : true,
          lifecycleMaxIntentAgeSeconds: typeof sourceRules.lifecycleMaxIntentAgeSeconds === "number" ? sourceRules.lifecycleMaxIntentAgeSeconds : 600,
          lifecycleMaxFutureSkewSeconds: typeof sourceRules.lifecycleMaxFutureSkewSeconds === "number" ? sourceRules.lifecycleMaxFutureSkewSeconds : 120,
          lifecycleMaxLifetimeSeconds: typeof sourceRules.lifecycleMaxLifetimeSeconds === "number" ? sourceRules.lifecycleMaxLifetimeSeconds : 900,
          lifecycleReplayWindowSeconds: typeof sourceRules.lifecycleReplayWindowSeconds === "number" ? sourceRules.lifecycleReplayWindowSeconds : 86400,
          lifecycleMaxRetryAttempts: typeof sourceRules.lifecycleMaxRetryAttempts === "number" ? sourceRules.lifecycleMaxRetryAttempts : 3,
          reconciliationEnabled: typeof sourceRules.reconciliationEnabled === "boolean" ? sourceRules.reconciliationEnabled : true,
          maximumSubmissionAttempts: typeof sourceRules.maximumSubmissionAttempts === "number" ? sourceRules.maximumSubmissionAttempts : 3,
          pendingRetryAction: typeof sourceRules.pendingRetryAction === "string" ? sourceRules.pendingRetryAction : "Block",
          uncertainRetryAction: typeof sourceRules.uncertainRetryAction === "string" ? sourceRules.uncertainRetryAction : "Block",
          requiredConfirmations: typeof sourceRules.requiredConfirmations === "number" ? sourceRules.requiredConfirmations : 1,
          finalityTimeoutSeconds: typeof sourceRules.finalityTimeoutSeconds === "number" ? sourceRules.finalityTimeoutSeconds : 3600,
          replacementAllowed: typeof sourceRules.replacementAllowed === "boolean" ? sourceRules.replacementAllowed : true,
          resourceDeliveryRequired: typeof sourceRules.resourceDeliveryRequired === "boolean" ? sourceRules.resourceDeliveryRequired : false,
          threatIntelligenceMode: typeof sourceRules.threatIntelligenceMode === "string" ? sourceRules.threatIntelligenceMode : "Review",
          threatIntelligenceMinConfidence: typeof sourceRules.threatIntelligenceMinConfidence === "number" ? sourceRules.threatIntelligenceMinConfidence : 70,
          threatIntelligenceUnavailableAction: typeof sourceRules.threatIntelligenceUnavailableAction === "string" ? sourceRules.threatIntelligenceUnavailableAction : "Warn",
          oracleValidationMode: typeof sourceRules.oracleValidationMode === "string" ? sourceRules.oracleValidationMode : "Review",
          oracleValidationMaxAgeSeconds: typeof sourceRules.oracleValidationMaxAgeSeconds === "number" ? sourceRules.oracleValidationMaxAgeSeconds : 120,
          oracleValidationMaxDeviationBps: typeof sourceRules.oracleValidationMaxDeviationBps === "number" ? sourceRules.oracleValidationMaxDeviationBps : 300,
          oracleValidationMaxSourceSpreadBps: typeof sourceRules.oracleValidationMaxSourceSpreadBps === "number" ? sourceRules.oracleValidationMaxSourceSpreadBps : 500,
          oracleValidationMinConfidence: typeof sourceRules.oracleValidationMinConfidence === "number" ? sourceRules.oracleValidationMinConfidence : 70,
          oracleValidationMinSources: typeof sourceRules.oracleValidationMinSources === "number" ? sourceRules.oracleValidationMinSources : 1,
          oracleValidationUnavailableAction: typeof sourceRules.oracleValidationUnavailableAction === "string" ? sourceRules.oracleValidationUnavailableAction : "Warn",
          bridgeControlMode: typeof sourceRules.bridgeControlMode === "string" ? sourceRules.bridgeControlMode : "Review",
          bridgeControlUnavailableAction: typeof sourceRules.bridgeControlUnavailableAction === "string" ? sourceRules.bridgeControlUnavailableAction : "Review",
          bridgeAllowedProviders: Array.isArray(sourceRules.bridgeAllowedProviders) ? sourceRules.bridgeAllowedProviders : [],
          bridgeAllowedSourceChains: Array.isArray(sourceRules.bridgeAllowedSourceChains) ? sourceRules.bridgeAllowedSourceChains : ["casper-test"],
          bridgeAllowedDestinationChains: Array.isArray(sourceRules.bridgeAllowedDestinationChains) ? sourceRules.bridgeAllowedDestinationChains : [],
          bridgeBlockedDestinationChains: Array.isArray(sourceRules.bridgeBlockedDestinationChains) ? sourceRules.bridgeBlockedDestinationChains : [],
          bridgeAllowedAssets: Array.isArray(sourceRules.bridgeAllowedAssets) ? sourceRules.bridgeAllowedAssets : ["CSPR"],
          bridgeMaxAmount: typeof sourceRules.bridgeMaxAmount === "number" ? sourceRules.bridgeMaxAmount : Number(policyValues.maxTransaction) || 50,
          bridgeMaxFeeBps: typeof sourceRules.bridgeMaxFeeBps === "number" ? sourceRules.bridgeMaxFeeBps : 100,
          bridgeMaxQuoteAgeSeconds: typeof sourceRules.bridgeMaxQuoteAgeSeconds === "number" ? sourceRules.bridgeMaxQuoteAgeSeconds : 300,
          bridgeRequireQuoteExpiry: typeof sourceRules.bridgeRequireQuoteExpiry === "boolean" ? sourceRules.bridgeRequireQuoteExpiry : true,
          bridgeMinSourceConfirmations: typeof sourceRules.bridgeMinSourceConfirmations === "number" ? sourceRules.bridgeMinSourceConfirmations : 2,
          bridgeMinDestinationConfirmations: typeof sourceRules.bridgeMinDestinationConfirmations === "number" ? sourceRules.bridgeMinDestinationConfirmations : 12,
          tokenPermissionControlsEnabled: typeof sourceRules.tokenPermissionControlsEnabled === "boolean" ? sourceRules.tokenPermissionControlsEnabled : capabilities.some((item) => ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item)),
          tokenPermissionMode: typeof sourceRules.tokenPermissionMode === "string" ? sourceRules.tokenPermissionMode : "Review",
          tokenPermissionUnknownSpenderAction: typeof sourceRules.tokenPermissionUnknownSpenderAction === "string" ? sourceRules.tokenPermissionUnknownSpenderAction : "Review",
          tokenPermissionUnlimitedApprovalAction: typeof sourceRules.tokenPermissionUnlimitedApprovalAction === "string" ? sourceRules.tokenPermissionUnlimitedApprovalAction : "Review",
          tokenPermissionMaxApprovalAmount: typeof sourceRules.tokenPermissionMaxApprovalAmount === "number" ? sourceRules.tokenPermissionMaxApprovalAmount : 0,
          tokenPermissionMaxApprovalToTransactionRatio: typeof sourceRules.tokenPermissionMaxApprovalToTransactionRatio === "number" ? sourceRules.tokenPermissionMaxApprovalToTransactionRatio : 2,
          tokenPermissionMaxLifetimeSeconds: typeof sourceRules.tokenPermissionMaxLifetimeSeconds === "number" ? sourceRules.tokenPermissionMaxLifetimeSeconds : 3600,
          tokenPermissionRequireExpiry: typeof sourceRules.tokenPermissionRequireExpiry === "boolean" ? sourceRules.tokenPermissionRequireExpiry : true,
          tokenPermissionRequireAllowanceReset: typeof sourceRules.tokenPermissionRequireAllowanceReset === "boolean" ? sourceRules.tokenPermissionRequireAllowanceReset : false,
          tokenPermissionApprovedSpenders: Array.isArray(sourceRules.tokenPermissionApprovedSpenders) ? sourceRules.tokenPermissionApprovedSpenders : [],
          tokenPermissionBlockedSpenders: Array.isArray(sourceRules.tokenPermissionBlockedSpenders) ? sourceRules.tokenPermissionBlockedSpenders : [],
          tokenPermissionAllowNftOperatorApproval: typeof sourceRules.tokenPermissionAllowNftOperatorApproval === "boolean" ? sourceRules.tokenPermissionAllowNftOperatorApproval : false,
          tokenPermissionAllowBatchApproval: typeof sourceRules.tokenPermissionAllowBatchApproval === "boolean" ? sourceRules.tokenPermissionAllowBatchApproval : false,
          tokenPermissionRequireChainBinding: typeof sourceRules.tokenPermissionRequireChainBinding === "boolean" ? sourceRules.tokenPermissionRequireChainBinding : true,
          tokenPermissionRequireNonce: typeof sourceRules.tokenPermissionRequireNonce === "boolean" ? sourceRules.tokenPermissionRequireNonce : true,
          tokenPermissionMaximumBatchSize: typeof sourceRules.tokenPermissionMaximumBatchSize === "number" ? sourceRules.tokenPermissionMaximumBatchSize : 10,
          privilegedActionControlsEnabled: typeof sourceRules.privilegedActionControlsEnabled === "boolean" ? sourceRules.privilegedActionControlsEnabled : capabilities.some((item) => ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item)),
          privilegedActionMode: typeof sourceRules.privilegedActionMode === "string" ? sourceRules.privilegedActionMode : "Review",
          privilegedActionsRequiringReview: Array.isArray(sourceRules.privilegedActionsRequiringReview) ? sourceRules.privilegedActionsRequiringReview : ["Ownership Transfer", "Administrator Change", "Proxy Upgrade", "Implementation Change", "Role Grant", "Role Revoke", "Mint", "Pause", "Unpause", "Freeze", "Emergency Withdrawal", "Treasury Withdrawal", "Oracle Replacement", "Fee Recipient Change", "Bridge Validator Change", "Permission Change"],
          privilegedActionsBlocked: Array.isArray(sourceRules.privilegedActionsBlocked) ? sourceRules.privilegedActionsBlocked : [],
          approvedAdministrators: Array.isArray(sourceRules.approvedAdministrators) ? sourceRules.approvedAdministrators : [],
          approvedImplementations: Array.isArray(sourceRules.approvedImplementations) ? sourceRules.approvedImplementations : [],
          privilegedActionQuorumRules: sourceRules.privilegedActionQuorumRules && typeof sourceRules.privilegedActionQuorumRules === "object" && !Array.isArray(sourceRules.privilegedActionQuorumRules) ? sourceRules.privilegedActionQuorumRules : {},
          unknownPrivilegedAction: typeof sourceRules.unknownPrivilegedAction === "string" ? sourceRules.unknownPrivilegedAction : "Review",
          contractUpgradeControlsEnabled: typeof sourceRules.contractUpgradeControlsEnabled === "boolean" ? sourceRules.contractUpgradeControlsEnabled : capabilities.some((item) => ["Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item)),
          contractUpgradeMode: typeof sourceRules.contractUpgradeMode === "string" ? sourceRules.contractUpgradeMode : "Review",
          contractUpgradeApprovedImplementations: Array.isArray(sourceRules.contractUpgradeApprovedImplementations) ? sourceRules.contractUpgradeApprovedImplementations : [],
          contractUpgradeBlockedImplementations: Array.isArray(sourceRules.contractUpgradeBlockedImplementations) ? sourceRules.contractUpgradeBlockedImplementations : [],
          contractUpgradeRequiresApproval: typeof sourceRules.contractUpgradeRequiresApproval === "boolean" ? sourceRules.contractUpgradeRequiresApproval : true,
          contractUpgradeQuorum: typeof sourceRules.contractUpgradeQuorum === "number" ? sourceRules.contractUpgradeQuorum : 2,
          contractUpgradeDelaySeconds: typeof sourceRules.contractUpgradeDelaySeconds === "number" ? sourceRules.contractUpgradeDelaySeconds : 0,
          contractUpgradeRequireCodeHash: typeof sourceRules.contractUpgradeRequireCodeHash === "boolean" ? sourceRules.contractUpgradeRequireCodeHash : true,
          contractUpgradeRequireAdministrator: typeof sourceRules.contractUpgradeRequireAdministrator === "boolean" ? sourceRules.contractUpgradeRequireAdministrator : true,
          contractUpgradeApprovedAdministrators: Array.isArray(sourceRules.contractUpgradeApprovedAdministrators) ? sourceRules.contractUpgradeApprovedAdministrators : [],
          contractUpgradeUnknownImplementationAction: typeof sourceRules.contractUpgradeUnknownImplementationAction === "string" ? sourceRules.contractUpgradeUnknownImplementationAction : "Review",
          contractArgumentControlsEnabled: sourceRules.contractArgumentControlsEnabled === true,
          contractArgumentMode: typeof sourceRules.contractArgumentMode === "string" ? sourceRules.contractArgumentMode : "Review",
          contractArgumentUnknownRuleAction: typeof sourceRules.contractArgumentUnknownRuleAction === "string" ? sourceRules.contractArgumentUnknownRuleAction : "Review",
          contractArgumentUnknownArgumentAction: typeof sourceRules.contractArgumentUnknownArgumentAction === "string" ? sourceRules.contractArgumentUnknownArgumentAction : "Block",
          contractArgumentRules: Array.isArray(sourceRules.contractArgumentRules) ? sourceRules.contractArgumentRules : [],
          x402ControlsEnabled: typeof sourceRules.x402ControlsEnabled === "boolean" ? sourceRules.x402ControlsEnabled : capabilities.some((item) => ["Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation", "Custom"].includes(item)),
          x402ControlMode: typeof sourceRules.x402ControlMode === "string" ? sourceRules.x402ControlMode : "Review",
          x402UnavailableAction: typeof sourceRules.x402UnavailableAction === "string" ? sourceRules.x402UnavailableAction : "Review",
          x402AllowedVersions: Array.isArray(sourceRules.x402AllowedVersions) ? sourceRules.x402AllowedVersions : ["2"],
          x402AllowedSchemes: Array.isArray(sourceRules.x402AllowedSchemes) ? sourceRules.x402AllowedSchemes : ["exact"],
          x402AllowedMethods: Array.isArray(sourceRules.x402AllowedMethods) ? sourceRules.x402AllowedMethods : ["GET", "HEAD", "POST"],
          x402AllowedNetworks: Array.isArray(sourceRules.x402AllowedNetworks) ? sourceRules.x402AllowedNetworks : ["eip155:84532"],
          x402AllowedAssets: Array.isArray(sourceRules.x402AllowedAssets) ? sourceRules.x402AllowedAssets : ["USDC"],
          x402AssetDecimals: sourceRules.x402AssetDecimals && typeof sourceRules.x402AssetDecimals === "object" && !Array.isArray(sourceRules.x402AssetDecimals) ? sourceRules.x402AssetDecimals : { USDC: 6 },
          x402AllowedFacilitators: Array.isArray(sourceRules.x402AllowedFacilitators) ? sourceRules.x402AllowedFacilitators : ["https://x402.org/facilitator"],
          x402AllowedMerchants: Array.isArray(sourceRules.x402AllowedMerchants) ? sourceRules.x402AllowedMerchants : ["api.example.com"],
          x402BlockedMerchants: Array.isArray(sourceRules.x402BlockedMerchants) ? sourceRules.x402BlockedMerchants : [],
          x402AllowedRecipients: Array.isArray(sourceRules.x402AllowedRecipients) ? sourceRules.x402AllowedRecipients : ["0x1111111111111111111111111111111111111111"],
          x402MaxPayment: typeof sourceRules.x402MaxPayment === "number" ? sourceRules.x402MaxPayment : 5,
          x402DailyLimit: typeof sourceRules.x402DailyLimit === "number" ? sourceRules.x402DailyLimit : 25,
          x402MonthlyLimit: typeof sourceRules.x402MonthlyLimit === "number" ? sourceRules.x402MonthlyLimit : 250,
          x402ReviewThreshold: typeof sourceRules.x402ReviewThreshold === "number" ? sourceRules.x402ReviewThreshold : 3,
          x402MaxPaymentsPerHour: typeof sourceRules.x402MaxPaymentsPerHour === "number" ? sourceRules.x402MaxPaymentsPerHour : 20,
          x402MaxAuthorizationLifetimeSeconds: typeof sourceRules.x402MaxAuthorizationLifetimeSeconds === "number" ? sourceRules.x402MaxAuthorizationLifetimeSeconds : 600,
          x402RequireHttps: typeof sourceRules.x402RequireHttps === "boolean" ? sourceRules.x402RequireHttps : true,
          x402RequirePaymentRequiredHash: typeof sourceRules.x402RequirePaymentRequiredHash === "boolean" ? sourceRules.x402RequirePaymentRequiredHash : true,
          x402RequireBodyHashForUnsafeMethods: typeof sourceRules.x402RequireBodyHashForUnsafeMethods === "boolean" ? sourceRules.x402RequireBodyHashForUnsafeMethods : true,
          x402RequireRequestId: typeof sourceRules.x402RequireRequestId === "boolean" ? sourceRules.x402RequireRequestId : true,
          x402RequireClientFingerprint: typeof sourceRules.x402RequireClientFingerprint === "boolean" ? sourceRules.x402RequireClientFingerprint : false,
          x402PreventAmbiguousRetry: typeof sourceRules.x402PreventAmbiguousRetry === "boolean" ? sourceRules.x402PreventAmbiguousRetry : true,
          x402MaxSettlementAttempts: typeof sourceRules.x402MaxSettlementAttempts === "number" ? sourceRules.x402MaxSettlementAttempts : 1,
          approvalWorkflowEnabled: typeof sourceRules.approvalWorkflowEnabled === "boolean" ? sourceRules.approvalWorkflowEnabled : true,
          approvalWorkflowMode: typeof sourceRules.approvalWorkflowMode === "string" ? sourceRules.approvalWorkflowMode : capabilities.some((item) => ["Treasury Operations", "Enterprise Automation"].includes(item)) ? "Quorum" : "Single",
          approvalRequiredCount: typeof sourceRules.approvalRequiredCount === "number" ? sourceRules.approvalRequiredCount : capabilities.some((item) => ["Treasury Operations", "Enterprise Automation"].includes(item)) ? 2 : 1,
          approvalExpiryMinutes: typeof sourceRules.approvalExpiryMinutes === "number" ? sourceRules.approvalExpiryMinutes : 60,
          approvalAllowOwnerFallback: typeof sourceRules.approvalAllowOwnerFallback === "boolean" ? sourceRules.approvalAllowOwnerFallback : true,
          approvalSeparationOfDuties: typeof sourceRules.approvalSeparationOfDuties === "boolean" ? sourceRules.approvalSeparationOfDuties : false,
          approvalRequireRejectComment: typeof sourceRules.approvalRequireRejectComment === "boolean" ? sourceRules.approvalRequireRejectComment : true,
          approvalApproverWallets: Array.isArray(sourceRules.approvalApproverWallets) ? sourceRules.approvalApproverWallets : [],
          requireCryptographicReviewerSignature: typeof sourceRules.requireCryptographicReviewerSignature === "boolean" ? sourceRules.requireCryptographicReviewerSignature : true,
          approvalSignatureLifetimeSeconds: typeof sourceRules.approvalSignatureLifetimeSeconds === "number" ? sourceRules.approvalSignatureLifetimeSeconds : 300,
          requireReviewerChainBinding: typeof sourceRules.requireReviewerChainBinding === "boolean" ? sourceRules.requireReviewerChainBinding : true,
          requireApprovalDomainSeparation: typeof sourceRules.requireApprovalDomainSeparation === "boolean" ? sourceRules.requireApprovalDomainSeparation : true,
          approvalSignatureChainName: typeof sourceRules.approvalSignatureChainName === "string" ? sourceRules.approvalSignatureChainName : "casper-test",
          approvalOrganizationalQuorumEnabled: sourceRules.approvalOrganizationalQuorumEnabled === true,
          approvalGroups: Array.isArray(sourceRules.approvalGroups) ? sourceRules.approvalGroups : [],
          approvalTiers: Array.isArray(sourceRules.approvalTiers) ? sourceRules.approvalTiers : [],
          approvalOrganizationDefaults: sourceRules.approvalOrganizationDefaults && typeof sourceRules.approvalOrganizationDefaults === "object" ? sourceRules.approvalOrganizationDefaults : {},
          approvalEscalationRules: Array.isArray(sourceRules.approvalEscalationRules) ? sourceRules.approvalEscalationRules : [],
          approvalEmergencyGroupIds: Array.isArray(sourceRules.approvalEmergencyGroupIds) ? sourceRules.approvalEmergencyGroupIds : [],
          approvalExecutionDelaySeconds: typeof sourceRules.approvalExecutionDelaySeconds === "number" ? sourceRules.approvalExecutionDelaySeconds : 0,
          approvalExecutionWindowSeconds: typeof sourceRules.approvalExecutionWindowSeconds === "number" ? sourceRules.approvalExecutionWindowSeconds : 0,
          complianceControlsEnabled: typeof sourceRules.complianceControlsEnabled === "boolean" ? sourceRules.complianceControlsEnabled : capabilities.some((item) => ["Treasury Operations", "Enterprise Automation"].includes(item)),
          complianceControlMode: typeof sourceRules.complianceControlMode === "string" ? sourceRules.complianceControlMode : "Review",
          complianceUnavailableAction: typeof sourceRules.complianceUnavailableAction === "string" ? sourceRules.complianceUnavailableAction : "Review",
          complianceRequiredActions: Array.isArray(sourceRules.complianceRequiredActions) ? sourceRules.complianceRequiredActions : ["Transfer", "DAO Treasury Payment", "Bridge"],
          complianceRequireOriginatorAttestation: typeof sourceRules.complianceRequireOriginatorAttestation === "boolean" ? sourceRules.complianceRequireOriginatorAttestation : true,
          complianceRequireBeneficiaryAttestation: typeof sourceRules.complianceRequireBeneficiaryAttestation === "boolean" ? sourceRules.complianceRequireBeneficiaryAttestation : true,
          complianceRequireTravelRule: typeof sourceRules.complianceRequireTravelRule === "boolean" ? sourceRules.complianceRequireTravelRule : true,
          complianceTravelRuleThreshold: typeof sourceRules.complianceTravelRuleThreshold === "number" ? sourceRules.complianceTravelRuleThreshold : 1,
          complianceRequireSanctionsScreening: typeof sourceRules.complianceRequireSanctionsScreening === "boolean" ? sourceRules.complianceRequireSanctionsScreening : true,
          complianceAllowedJurisdictions: Array.isArray(sourceRules.complianceAllowedJurisdictions) ? sourceRules.complianceAllowedJurisdictions : [],
          complianceBlockedJurisdictions: Array.isArray(sourceRules.complianceBlockedJurisdictions) ? sourceRules.complianceBlockedJurisdictions : [],
          complianceReviewJurisdictions: Array.isArray(sourceRules.complianceReviewJurisdictions) ? sourceRules.complianceReviewJurisdictions : [],
          complianceAllowedCounterpartyTypes: Array.isArray(sourceRules.complianceAllowedCounterpartyTypes) ? sourceRules.complianceAllowedCounterpartyTypes : ["VASP", "Organization", "Self-hosted Wallet"],
          complianceAcceptedProviders: Array.isArray(sourceRules.complianceAcceptedProviders) ? sourceRules.complianceAcceptedProviders : [],
          complianceMaxAttestationAgeSeconds: typeof sourceRules.complianceMaxAttestationAgeSeconds === "number" ? sourceRules.complianceMaxAttestationAgeSeconds : 86400,
          complianceMaxScreeningAgeSeconds: typeof sourceRules.complianceMaxScreeningAgeSeconds === "number" ? sourceRules.complianceMaxScreeningAgeSeconds : 3600,
          complianceMaximumRiskRating: typeof sourceRules.complianceMaximumRiskRating === "string" ? sourceRules.complianceMaximumRiskRating : "Medium",
          enforcedFields: ["emergencyControlsEnabled", "automaticPauseEnabled", "emergencyAutomaticPauseAction", "emergencyRepeatedBlockThreshold", "emergencyReplayAttemptThreshold", "emergencyRequestFrequencyThreshold", "emergencyLookbackSeconds", "emergencySpendingSpikeMultiplier", "emergencyProviderFailureThreshold", "emergencyUnresolvedExecutionThreshold", "emergencyUnresolvedX402Threshold", "emergencyBridgeFailureThreshold", "emergencyPauseDurationSeconds", "emergencyResumeRequiresApproval", "emergencyResumeQuorum", "emergencyPauseOnThreatMatch", "emergencyPauseOnOracleDisagreement", "emergencyPauseOnPrivilegedActionFailure", "maxTransaction", "dailyLimit", "approvalThreshold", "reviewResolutionMode", "approvalWorkflowEnabled", "approvalWorkflowMode", "approvalRequiredCount", "approvalExpiryMinutes", "approvalAllowOwnerFallback", "approvalSeparationOfDuties", "approvalRequireRejectComment", "approvalApproverWallets", "requireCryptographicReviewerSignature", "approvalSignatureLifetimeSeconds", "requireReviewerChainBinding", "requireApprovalDomainSeparation", "approvalSignatureChainName", "approvalOrganizationalQuorumEnabled", "approvalGroups", "approvalTiers", "approvalOrganizationDefaults", "approvalEscalationRules", "approvalEmergencyGroupIds", "approvalExecutionDelaySeconds", "approvalExecutionWindowSeconds", "instructionIntegrityEnabled", "instructionIntegrityMode", "requireGoalBindingForActions", "requireUserConfirmationForExternalContent", "allowedSourceDomains", "blockedSourceDomains", "externalContentHighRiskAction", "allowParameterChangesAfterGoal", "requireParameterChangeReason", "toolIntegrityEnabled", "toolIntegrityMode", "approvedMcpServers", "approvedTools", "requireManifestHash", "requireSchemaHash", "requireTls", "allowToolVersionChanges", "unknownToolAction", "permissionExpansionAction", "delegationControlsEnabled", "delegationMode", "requireExpiringDelegation", "maximumDelegationLifetime", "maximumDelegationDepth", "allowRedelegation", "approvedDelegates", "blockedDelegates", "revokedDelegationIds", "unknownDelegateAction", "requireScopeBinding", "requireCryptographicDelegationAttestation", "delegationUnavailableAction", "rpcIntegrityEnabled", "rpcIntegrityMode", "approvedRpcEndpoints", "rpcIntegrityRequireTls", "rpcIntegrityMaximumBlockAgeSeconds", "rpcIntegrityMinimumProviders", "rpcIntegrityMaximumHeightDifference", "rpcIntegrityDisagreementAction", "rpcIntegrityUnavailableAction", "rpcIntegrityRequireNetworkIdentity", "rpcIntegrityAllowAutomaticFailover", "feeSafetyEnabled", "feeSafetyMode", "feeSafetyMaximumNetworkFee", "feeSafetyMaximumGasPrice", "feeSafetyMaximumPriorityFee", "feeSafetyApprovedSponsors", "feeSafetyApprovedPaymasters", "feeSafetySponsorshipUnavailableAction", "feeSafetySponsoredBudget", "feeSafetyMaximumSponsoredOperations", "feeSafetyMaximumFailedSponsoredOperations", "feeSafetyLookbackSeconds", "feeSafetyRequireSponsorshipExpiry", "feeSafetyRequireSponsorEvidence", "trustedContracts", "blockedActions", "riskMode", "threatIntelligenceMode", "threatIntelligenceMinConfidence", "threatIntelligenceUnavailableAction", "oracleValidationMode", "oracleValidationMaxAgeSeconds", "oracleValidationMaxDeviationBps", "oracleValidationMaxSourceSpreadBps", "oracleValidationMinConfidence", "oracleValidationMinSources", "oracleValidationUnavailableAction", "bridgeControlMode", "bridgeControlUnavailableAction", "bridgeAllowedProviders", "bridgeAllowedSourceChains", "bridgeAllowedDestinationChains", "bridgeBlockedDestinationChains", "bridgeAllowedAssets", "bridgeMaxAmount", "bridgeMaxFeeBps", "bridgeMaxQuoteAgeSeconds", "bridgeRequireQuoteExpiry", "bridgeMinSourceConfirmations", "bridgeMinDestinationConfirmations", "tokenPermissionControlsEnabled", "tokenPermissionMode", "tokenPermissionUnknownSpenderAction", "tokenPermissionUnlimitedApprovalAction", "tokenPermissionMaxApprovalAmount", "tokenPermissionMaxApprovalToTransactionRatio", "tokenPermissionMaxLifetimeSeconds", "tokenPermissionRequireExpiry", "tokenPermissionRequireAllowanceReset", "tokenPermissionApprovedSpenders", "tokenPermissionBlockedSpenders", "tokenPermissionAllowNftOperatorApproval", "tokenPermissionAllowBatchApproval", "tokenPermissionRequireChainBinding", "tokenPermissionRequireNonce", "tokenPermissionMaximumBatchSize", "privilegedActionControlsEnabled", "privilegedActionMode", "privilegedActionsRequiringReview", "privilegedActionsBlocked", "approvedAdministrators", "approvedImplementations", "privilegedActionQuorumRules", "unknownPrivilegedAction", "contractUpgradeControlsEnabled", "contractUpgradeMode", "contractUpgradeApprovedImplementations", "contractUpgradeBlockedImplementations", "contractUpgradeRequiresApproval", "contractUpgradeQuorum", "contractUpgradeDelaySeconds", "contractUpgradeRequireCodeHash", "contractUpgradeRequireAdministrator", "contractUpgradeApprovedAdministrators", "contractUpgradeUnknownImplementationAction", "contractArgumentControlsEnabled", "contractArgumentMode", "contractArgumentUnknownRuleAction", "contractArgumentUnknownArgumentAction", "contractArgumentRules", "x402ControlsEnabled", "x402ControlMode", "x402UnavailableAction", "x402AllowedVersions", "x402AllowedSchemes", "x402AllowedMethods", "x402AllowedNetworks", "x402AllowedAssets", "x402AssetDecimals", "x402AllowedFacilitators", "x402AllowedMerchants", "x402BlockedMerchants", "x402AllowedRecipients", "x402MaxPayment", "x402DailyLimit", "x402MonthlyLimit", "x402ReviewThreshold", "x402MaxPaymentsPerHour", "x402MaxAuthorizationLifetimeSeconds", "x402RequireHttps", "x402RequirePaymentRequiredHash", "x402RequireBodyHashForUnsafeMethods", "x402RequireRequestId", "x402RequireClientFingerprint", "x402PreventAmbiguousRetry", "x402MaxSettlementAttempts", "complianceControlsEnabled", "complianceControlMode", "complianceUnavailableAction", "complianceRequiredActions", "complianceRequireOriginatorAttestation", "complianceRequireBeneficiaryAttestation", "complianceRequireTravelRule", "complianceTravelRuleThreshold", "complianceRequireSanctionsScreening", "complianceAllowedJurisdictions", "complianceBlockedJurisdictions", "complianceReviewJurisdictions", "complianceAllowedCounterpartyTypes", "complianceAcceptedProviders", "complianceMaxAttestationAgeSeconds", "complianceMaxScreeningAgeSeconds", "complianceMaximumRiskRating"],
          configurationOnly: [],
        },
        });
      } catch (policyCause) {
        setCreatedPolicy(null);
        setError(policyCause instanceof Error ? `The agent was registered, but its starter policy could not be created: ${policyCause.message}` : "The agent was registered, but its starter policy could not be created. Open Policies before sending intents.");
        setStep(setupMode === "guided" ? 4 : 6);
        return;
      }
      if (!policy) {
        setError("The agent was registered, but the starter policy could not be created. Create a policy from the Policies page before sending intents.");
      }
      setCreatedPolicy(policy || null);
      setStep(setupMode === "guided" ? 4 : 6);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete agent registration.");
    } finally {
      setSubmitting(false);
    }
  }, [capabilities, draft, modules, onCreatePolicy, onCreated, onRegisterAgent, selectedExistingPolicy, setupMode]);

  const copyValue = useCallback(async (label: string, value: string) => {
    if (!value) return;
    const ok = await writeClipboard(value);
    setCopied(ok ? label : "failed");
    setTimeout(() => setCopied(""), 1500);
  }, []);

  const markCredentialSaved = useCallback(() => {
    if (!createdAgent) return;
    try {
      window.localStorage.setItem(`magen3.onboarding.credentialsSaved.${createdAgent.id}`, "true");
    } catch {
      // Restricted browser storage does not prevent the user from continuing.
    }
    setCredentialSaved(true);
  }, [createdAgent]);

  const downloadEnv = useCallback(() => {
    if (!createdAgent) return;
    const value = buildMagen3EnvironmentFile({
      apiBaseUrl: api.baseUrl,
      agentId: createdAgent.id,
      apiKey: createdAgent.apiKey || "PASTE_AGENT_API_KEY",
      agentName: createdAgent.name,
    });
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `magen3-${createdAgent.id.toLowerCase()}.env`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    markCredentialSaved();
  }, [createdAgent, markCredentialSaved]);

  const runProtectedTest = useCallback(async () => {
    if (!createdPolicy || createdPolicy.status !== "Active") {
      setError("Activate a starter policy before running the protected test. The agent identity exists, but Magen3 will not present it as fully protected without an active policy.");
      return;
    }
    if (!createdAgent?.apiKey) {
      setError("The one-time API key is not available. Rotate it from Connected Agents before running the protected test.");
      return;
    }
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const executionWalletAddress = draft.executionWalletAddress.trim() || walletAddress;
      const onboardingGoal = "Verify that Magen3 evaluates a small synthetic transfer before any wallet signing or blockchain execution.";
      const originalUserGoalHash = await sha256Hex(onboardingGoal);
      const result = await onSubmitGatewayIntent({
        source: draft.demoConfiguration ? "Magen3 Guided Demo" : `${createdAgent.name} onboarding`,
        agentId: createdAgent.id,
        walletAddress,
        executionWalletAddress,
        goal: onboardingGoal,
        reason: "Guided onboarding safety check. This request creates a decision and audit evidence only; it does not sign or submit a transaction.",
        instructionIntegrity: {
          goalId: `onboarding:${createdAgent.id}`,
          originalUserGoalHash,
          initiatedBy: "user",
          intentSource: "Magen3 Guided Setup",
          sourceDomains: [],
          externalContentUsed: false,
          userConfirmed: true,
          sourceTrustLevel: "trusted",
        },
        lifecycle: playgroundLifecycle(),
        action: {
          type: "Transfer",
          amount: 1,
          asset: "CSPR",
          target: PLAYGROUND_DEMO_RECIPIENT,
          targetType: "Wallet Address",
          chainName: "casper-test",
          preflight: playgroundPreflight(),
        },
      }, createdAgent.apiKey);
      setTestResult(result);
      try {
        window.localStorage.setItem(`magen3.onboarding.firstTest.${createdAgent.id}`, "true");
      } catch {
        // Audit persistence remains the source of truth when local storage is restricted.
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The protected test could not be evaluated.");
    } finally {
      setTesting(false);
    }
  }, [createdAgent, createdPolicy, draft.demoConfiguration, draft.executionWalletAddress, onSubmitGatewayIntent, walletAddress]);

  if (!open) return null;

  const integrationEndpoints = getMagen3IntegrationEndpoints(api.baseUrl);
  const gatewayBaseUrl = integrationEndpoints.baseUrl;
  const gatewayUrl = integrationEndpoints.intentUrl;
  const verifyUrl = integrationEndpoints.verifyUrl;
  const requestExample = createdAgent ? `curl -X POST "${gatewayUrl}" \\
  -H "Content-Type: application/json" \\
  -H "x-magen3-agent-key: ${createdAgent.apiKey || "PASTE_AGENT_API_KEY"}" \\
  -d '{
    "source": "${createdAgent.name}",
    "agentId": "${createdAgent.id}",
    "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
    "goal": "Describe the intended blockchain action",
    "action": {
      "type": "Stake",
      "amount": 15,
      "asset": "CSPR",
      "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
      "targetType": "Trusted Contract"
    }
  }'` : "";

  const integrationSnippet = createdAgent ? (() => {
    const key = createdAgent.apiKey || "PASTE_AGENT_API_KEY";
    if (draft.integrationTarget === "Codex") return `# Magen3 protected execution\n\nBefore any blockchain signing or execution, submit the intended action to Magen3.\n\n- Agent ID: ${createdAgent.id}\n- Magen3 API base URL: ${gatewayBaseUrl}\n- Intent endpoint: ${gatewayUrl}\n- API key env var: MAGEN3_API_KEY\n- Obey only Allowed, Blocked, or Review Required.\n- Never sign when the decision is Blocked or Review Required.\n- Keep the raw API key in backend environment configuration; never place it in this instruction file.`;
    if (draft.integrationTarget === "MCP") return `{
  "mcpServers": {
    "magen3": {
      "command": "pnpm",
      "args": ["--filter", "@magen3/mcp-server", "start"],
      "env": {
        "MAGEN3_AGENT_ID": "${createdAgent.id}",
        "MAGEN3_API_KEY": "YOUR_PRIVATE_AGENT_KEY",
        "MAGEN3_GATEWAY_URL": "${gatewayBaseUrl}"
      }
    }
  }
}`;
    if (draft.integrationTarget === "JavaScript") return `// Install in the external agent backend: pnpm add @magen3/sdk@beta\nimport {\n  Magen3Client,\n  createMagen3InstructionIntegrityBinding,\n  getMagen3AgentMessage,\n  isMagen3ExecutionApproved,\n} from "@magen3/sdk";\n\nconst magen3 = Magen3Client.fromEnv(process.env);\nintent.action.instructionIntegrity = await createMagen3InstructionIntegrityBinding(intent, {\n  goalId: stableGoalId,\n  originalUserRequest,\n});\nconst decision = await magen3.checkIntent(intent);\nif (!isMagen3ExecutionApproved(decision)) {\n  throw new Error(getMagen3AgentMessage(decision));\n}`;
    if (draft.integrationTarget === "Python") return `from magen3 import (\n    Magen3Client,\n    create_instruction_integrity_binding,\n    get_agent_message,\n    is_execution_approved,\n)\n\nmagen3 = Magen3Client.from_env()\nintent["action"]["instructionIntegrity"] = create_instruction_integrity_binding(\n    intent,\n    goal_id=stable_goal_id,\n    original_user_request=original_user_request,\n)\ndecision = magen3.check_intent(intent)\nif not is_execution_approved(decision):\n    raise RuntimeError(get_agent_message(decision))`;
    if (draft.integrationTarget === "Custom API") return requestExample;
    return buildMagen3EnvironmentFile({ apiBaseUrl: gatewayBaseUrl, agentId: createdAgent.id, apiKey: key, agentName: createdAgent.name });
  })() : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="absolute inset-0 bg-black/70" />
      <div className={`${CARD_GLOW} relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden`}>
        <div className="border-b border-[#1E293B] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">First Agent Setup</div>
              <h2 className="mt-1 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Protect an autonomous agent with Magen3</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#94A3B8]">{setupMode === "guided" ? "Choose the job, protection level, and integration. Magen3 configures the capabilities and starter policy for you." : "Configure every capability, protection recommendation, and starter-policy field manually."}</p>
              {!createdAgent && step === 1 && <div className="mt-4 inline-flex rounded-xl border border-[#1E293B] bg-[#050B14] p-1">
                {(["guided", "advanced"] as OnboardingSetupMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => { setSetupMode(mode); setDraft(createInitialAgentRegistrationDraft(mode)); setStep(1); setError(""); setTestResult(null); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${setupMode === mode ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}>{mode === "guided" ? "Guided Setup" : "Advanced Setup"}</button>
                ))}
              </div>}
            </div>
            <button type="button" onClick={closeWizard} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]" aria-label="Close registration wizard"><X size={18} /></button>
          </div>
          <div className={`mt-5 grid gap-2 ${steps.length === 4 ? "grid-cols-4" : "grid-cols-6"}`}>
            {steps.map((label, index) => {
              const number = index + 1;
              const active = step === number;
              const completed = step > number;
              return (
                <div key={label} className="min-w-0">
                  <div className={`h-1.5 rounded-full ${completed ? "bg-[#22C55E]" : active ? "bg-[#22D3EE]" : "bg-[#1E293B]"}`} />
                  <div className={`mt-1 hidden truncate text-[10px] font-semibold sm:block ${active ? "text-[#22D3EE]" : completed ? "text-[#22C55E]" : "text-[#64748B]"}`}>{number}. {label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {setupMode === "guided" && step === 1 && (
            <div className="space-y-6">
              <div className="mx-auto max-w-3xl text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Step 1 of 4</div>
                <h3 className="mt-2 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">What do you want Magen3 to protect?</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Choose the closest job. Magen3 will select the capabilities, protection areas, and starter policy automatically. You can change everything later.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {GUIDED_USE_CASES.map((useCase) => {
                  const selected = draft.guidedUseCase === useCase.id && !draft.demoConfiguration;
                  return (
                    <button type="button" key={useCase.id} onClick={() => applyGuidedUseCase(useCase.id)} className={`group rounded-2xl border p-4 text-left transition-all ${selected ? "border-[#22D3EE]/55 bg-[#22D3EE]/10 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155] hover:bg-[#0D1626]"}`}>
                      <div className="flex items-start justify-between gap-3"><div className={`rounded-xl border p-2.5 ${selected ? "border-[#22D3EE]/25 bg-[#22D3EE]/10 text-[#22D3EE]" : "border-[#1E293B] bg-[#111827] text-[#94A3B8] group-hover:text-[#F8FAFC]"}`}>{useCase.icon}</div><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-[#22D3EE] bg-[#22D3EE] text-[#050B14]" : "border-[#334155]"}`}>{selected && <CheckCircle size={14} />}</span></div>
                      <div className="mt-4 font-semibold text-[#F8FAFC]">{useCase.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{useCase.description}</p>
                      <div className="mt-3"><CapabilityChips capabilities={useCase.capabilities} compact /></div>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => applyGuidedUseCase("trading", true)} className={`flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${draft.demoConfiguration ? "border-[#A78BFA]/45 bg-[#A78BFA]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#A78BFA]/35"}`}>
                <div className="flex items-start gap-3"><div className="rounded-xl border border-[#A78BFA]/25 bg-[#A78BFA]/10 p-2.5 text-[#A78BFA]"><Zap size={20} /></div><div><div className="font-semibold text-[#F8FAFC]">Explore with a demo configuration</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Use a clearly labelled synthetic trading-agent setup and experience Allowed, Blocked, or Review Required without executing a real transaction.</div></div></div>
                <span className="shrink-0 text-xs font-semibold text-[#A78BFA]">{draft.demoConfiguration ? "Selected" : "Use demo setup"}</span>
              </button>
              <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
                <div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#22D3EE]" /><div><div className="text-sm font-semibold text-[#F8FAFC]">Magen3 will configure the security foundation</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Selected: {selectedUseCase.title}. Recommended template: {selectedUseCase.template}. Advanced controls remain available after setup.</div></div></div>
              </div>
            </div>
          )}

          {setupMode === "guided" && step === 2 && (
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Step 2 of 4</div>
                <h3 className="mt-2 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Tell us about the agent</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Only provide what Magen3 cannot infer: the agent identity, optional execution wallet, and how you plan to connect it.</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <div className={`${CARD} space-y-4 p-5`}>
                  <InputField label="Agent Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value, policyName: current.policyName.startsWith("Strict ") ? `Strict ${value || selectedUseCase.title} Policy` : current.policyName }))} placeholder={draft.demoConfiguration ? "Magen3 Demo Trading Agent" : "e.g. YieldBot AI"} />
                  <div><label className={LABEL_CLS}>What will this agent do?</label><textarea className={`${INPUT_CLS} resize-none`} rows={4} value={draft.purpose} onChange={(event) => setDraft((current) => ({ ...current, purpose: event.target.value }))} /></div>
                  <InputField label="Execution Wallet (optional)" value={draft.executionWalletAddress} onChange={(value) => setDraft((current) => ({ ...current, executionWalletAddress: value }))} placeholder="Casper public key used for requested execution" />
                  <p className="text-xs leading-relaxed text-[#64748B]">The execution wallet is public identity metadata only. Never paste a private key, seed phrase, mnemonic, or wallet secret.</p>
                </div>
                <div className={`${CARD} p-5`}>
                  <div className="text-sm font-semibold text-[#F8FAFC]">How will the agent connect?</div>
                  <div className="mt-1 text-xs text-[#94A3B8]">Your completion screen will show the matching quick-start instructions.</div>
                  <div className="mt-4 space-y-2">{INTEGRATION_TARGETS.map((target) => {
                    const selected = draft.integrationTarget === target.id;
                    return <button type="button" key={target.id} onClick={() => setDraft((current) => ({ ...current, integrationTarget: target.id }))} className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left ${selected ? "border-[#22D3EE]/45 bg-[#22D3EE]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}><div><div className="text-sm font-semibold text-[#F8FAFC]">{target.id}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{target.description}</div></div><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[#22D3EE] bg-[#22D3EE] text-[#050B14]" : "border-[#334155]"}`}>{selected && <CheckCircle size={11} />}</span></button>;
                  })}</div>
                </div>
              </div>
            </div>
          )}

          {setupMode === "guided" && step === 3 && (
            <div className="mx-auto max-w-5xl space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Step 3 of 4</div>
                <h3 className="mt-2 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Choose a protection level</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Start with understandable security behaviour. Detailed policy and control configuration remains available after setup.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  { id: "Standard" as ProtectionLevel, title: "Standard", description: "Secure defaults for testing and lower-risk automation.", badge: "Balanced defaults", tone: "#22D3EE" },
                  { id: "Strict" as ProtectionLevel, title: "Strict", description: "Lower limits, conservative risk handling, and review when critical evidence is unavailable.", badge: "Recommended", tone: "#22C55E" },
                  { id: "Custom" as ProtectionLevel, title: "Custom", description: "Set the essential limits now, then configure every advanced control later.", badge: "Full control", tone: "#A78BFA" },
                ]).map((level) => {
                  const selected = draft.protectionLevel === level.id;
                  return <button type="button" key={level.id} onClick={() => applyProtectionLevel(level.id)} className={`rounded-2xl border p-5 text-left transition-colors ${selected ? "border-[#22D3EE]/50 bg-[#22D3EE]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}><div className="flex items-center justify-between gap-3"><div className="text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{level.title}</div><span className="rounded-full border border-[#1E293B] bg-[#050B14] px-2 py-1 text-[10px] font-semibold" style={{ color: level.tone }}>{level.badge}</span></div><p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">{level.description}</p></button>;
                })}
              </div>
              <div className={`${CARD} p-5`}>
                <div className="text-sm font-semibold text-[#F8FAFC]">How should review conditions be resolved?</div>
                <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Protection strictness and human involvement are separate. Magen3 can be strict while allowing agents to remediate ordinary uncertainty automatically.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {([
                    { id: "Autonomous" as ReviewResolutionMode, title: "Autonomous", description: "Ordinary review conditions return exact remediation instructions to the agent. Humans are used only for rules that explicitly require approval." },
                    { id: "Balanced" as ReviewResolutionMode, title: "Balanced", description: "Agent remediation handles routine uncertainty. High-risk or explicit governance conditions escalate to human or quorum approval." },
                    { id: "Human Governed" as ReviewResolutionMode, title: "Human Governed", description: "Every Review Required decision enters the configured approval workflow." },
                  ]).map((mode) => {
                    const selected = draft.reviewResolutionMode === mode.id;
                    return <button key={mode.id} type="button" onClick={() => setDraft((current) => ({ ...current, reviewResolutionMode: mode.id }))} className={`rounded-xl border p-4 text-left ${selected ? "border-[#A78BFA]/45 bg-[#A78BFA]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}><div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-[#F8FAFC]">{mode.title}</div>{selected && <CheckCircle size={15} className="text-[#A78BFA]" />}</div><p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{mode.description}</p></button>;
                  })}
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                <div className={`${CARD} p-5`}>
                  <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Plain-language protection summary</div><div className="mt-1 text-xs text-[#94A3B8]">This is what the selected policy means during execution.</div></div><span className="rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#BBF7D0]">{draft.protectionLevel}</span></div>
                  <div className="mt-4 space-y-2">
                    <CompactStatusRow compact label="Transaction limit" status={`${draft.maxTransaction} CSPR`} detail={`Requests above ${draft.maxTransaction} CSPR are blocked by the starter policy.`} tone="info" />
                    <CompactStatusRow compact label="Review threshold" status={`Above ${draft.approvalThreshold} CSPR`} detail={`Higher-value requests return Review Required and follow the ${draft.reviewResolutionMode} resolution strategy.`} tone="warning" />
                    <CompactStatusRow compact label="Daily spending" status={`${draft.dailyLimit} CSPR`} detail="The active policy tracks cumulative spending for this agent." tone="info" />
                    <CompactStatusRow compact label="Unknown or unavailable evidence" status={draft.protectionLevel === "Strict" ? "Review" : "Policy controlled"} detail="Unavailable controls never silently count as a pass." tone={draft.protectionLevel === "Strict" ? "warning" : "neutral"} />
                    <CompactStatusRow compact label="Unsafe retries" status="Blocked" detail="Lifecycle and reconciliation controls prevent duplicate, pending, or uncertain retries." tone="success" />
                  </div>
                  {draft.protectionLevel === "Custom" && <div className="mt-5 grid gap-4 sm:grid-cols-3"><InputField label="Maximum Transaction" type="number" value={String(draft.maxTransaction)} onChange={(value) => setDraft((current) => ({ ...current, maxTransaction: Number(value) }))} /><InputField label="Daily Limit" type="number" value={String(draft.dailyLimit)} onChange={(value) => setDraft((current) => ({ ...current, dailyLimit: Number(value) }))} /><InputField label="Review Threshold" type="number" value={String(draft.approvalThreshold)} onChange={(value) => setDraft((current) => ({ ...current, approvalThreshold: Number(value) }))} /></div>}
                </div>
                <div className={`${CARD} p-5`}>
                  <div className="text-sm font-semibold text-[#F8FAFC]">Magen3 configures</div>
                  <div className="mt-1 text-xs text-[#94A3B8]">Capabilities and protection areas relevant to {selectedUseCase.title}.</div>
                  <div className="mt-4"><CapabilityChips capabilities={capabilities} /></div>
                  <div className="mt-4 space-y-2">{modules.slice(0, 5).map((module) => <div key={module.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2"><span className="text-xs font-semibold text-[#F8FAFC]">{module.name}</span><span className={`text-[10px] font-semibold ${module.status === "Live" ? "text-[#22C55E]" : "text-[#22D3EE]"}`}>{module.status === "Foundation Available" ? "Foundation" : module.status}</span></div>)}</div>
                  <p className="mt-4 text-xs leading-relaxed text-[#64748B]">A 100% coverage score never guarantees safety. Magen3 reports configured protection and real evaluation evidence only.</p>
                </div>
              </div>
            </div>
          )}

          {setupMode === "guided" && step === 4 && createdAgent && (
            <div className="mx-auto max-w-5xl space-y-6">
              <div className={`rounded-2xl border p-5 ${createdPolicy?.status === "Active" ? "border-[#22C55E]/30 bg-[#22C55E]/10" : "border-[#F59E0B]/30 bg-[#F59E0B]/10"}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><div className={`rounded-xl p-2.5 ${createdPolicy?.status === "Active" ? "bg-[#22C55E]/15 text-[#22C55E]" : "bg-[#F59E0B]/15 text-[#F59E0B]"}`}>{createdPolicy?.status === "Active" ? <ShieldCheck size={23} /> : <AlertTriangle size={23} />}</div><div><div className={`text-xs font-semibold uppercase tracking-wider ${createdPolicy?.status === "Active" ? "text-[#22C55E]" : "text-[#F59E0B]"}`}>{createdPolicy?.status === "Active" ? "Your agent is protected" : "Agent registered — policy setup required"}</div><h3 className="mt-1 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{createdPolicy?.status === "Active" ? `${createdAgent.name} is ready for integration` : `${createdAgent.name} needs an active starter policy`}</h3><p className={`mt-1 text-sm leading-relaxed ${createdPolicy?.status === "Active" ? "text-[#BBF7D0]" : "text-[#FCD34D]"}`}>{createdPolicy?.status === "Active" ? "Magen3 created the agent identity, an active starter policy, and one-time credentials. The onboarding test evaluates a synthetic request only—it never signs or submits a transaction." : "The agent identity and one-time credential were created, but Magen3 will not describe the agent as protected until a policy is active. Open Policies to finish setup."}</p></div></div><span className={`rounded-full border bg-[#050B14]/45 px-3 py-1 text-xs font-semibold ${createdPolicy?.status === "Active" ? "border-[#22C55E]/25 text-[#BBF7D0]" : "border-[#F59E0B]/25 text-[#FCD34D]"}`}>{createdPolicy?.status === "Active" ? `${draft.protectionLevel} protection` : "Policy required"}</span></div>
              </div>
              {error && <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#FCD34D]">{error}</div>}
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="space-y-5">
                  <div className={`${CARD} p-5`}>
                    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">1. Save the one-time API key</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Magen3 stores only its hash and preview after this session.</div></div>{credentialSaved && <span className="rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2 py-1 text-[10px] font-semibold text-[#BBF7D0]">Saved</span>}</div>
                    <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">API Key</div><div className="mt-2 break-all font-mono text-xs text-[#F8FAFC]">{createdAgent.apiKey || "Not available—rotate from Access"}</div></div>
                    <div className="mt-3 flex flex-wrap gap-2"><Btn variant="primary" size="sm" onClick={() => { copyValue("API key", createdAgent.apiKey || ""); markCredentialSaved(); }} disabled={!createdAgent.apiKey}><Copy size={14} /> {copied === "API key" ? "Copied" : "Copy API Key"}</Btn><Btn variant="secondary" size="sm" onClick={downloadEnv}><FileText size={14} /> Download .env</Btn><Btn variant="ghost" size="sm" onClick={markCredentialSaved}><CheckCircle size={14} /> I have saved it</Btn></div>
                  </div>
                  <div className={`${CARD} overflow-hidden`}>
                    <button type="button" onClick={() => setShowIntegrationCode((current) => !current)} className="flex w-full items-center justify-between gap-4 p-5 text-left"><div><div className="text-sm font-semibold text-[#F8FAFC]">2. Connect with {draft.integrationTarget}</div><div className="mt-1 text-xs text-[#94A3B8]">A quick-start prepared for the integration method you selected.</div></div><ChevronDown size={16} className={`shrink-0 text-[#64748B] transition-transform ${showIntegrationCode ? "rotate-180" : ""}`} /></button>
                    {showIntegrationCode && <div className="border-t border-[#1E293B] p-4"><div className="mb-3 flex justify-end"><Btn variant="outline" size="sm" onClick={() => copyValue("integration", integrationSnippet)}><Copy size={13} /> {copied === "integration" ? "Copied" : "Copy instructions"}</Btn></div><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#020617] p-4 text-xs leading-relaxed text-[#94A3B8]"><code>{integrationSnippet}</code></pre></div>}
                  </div>
                </div>
                <div className={`${CARD_GLOW} p-5`}>
                  <div className="text-sm font-semibold text-[#F8FAFC]">3. Run the first protected test</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Magen3 evaluates a 1 CSPR synthetic transfer, stores the audit record, and submits the decision proof through the existing proof flow. Nothing is signed or sent.</p>
                  <div className="mt-4 space-y-2"><CompactStatusRow compact label="Agent identity" status="Created" tone="success" /><CompactStatusRow compact label="Starter policy" status={createdPolicy?.status || "Not active"} tone={createdPolicy?.status === "Active" ? "success" : "warning"} /><CompactStatusRow compact label="Credential" status={credentialSaved ? "Saved" : "Save now"} tone={credentialSaved ? "success" : "warning"} /><CompactStatusRow compact label="Protected test" status={testResult ? testResult.result.decision : "Not run"} tone={testResult?.result.decision === "Allowed" ? "success" : testResult ? "warning" : "neutral"} /></div>
                  <Btn variant="primary" onClick={runProtectedTest} disabled={testing || !createdAgent.apiKey || createdPolicy?.status !== "Active"} className="mt-4 w-full justify-center"><Send size={15} /> {createdPolicy?.status !== "Active" ? "Activate policy to test" : testing ? "Evaluating…" : testResult ? "Run another protected test" : "Run protected test"}</Btn>{createdPolicy?.status !== "Active" && <Btn variant="secondary" size="sm" onClick={() => { closeWizard(); onNavigate("policies"); }} className="mt-2 w-full justify-center"><FileText size={14} /> Open Policies</Btn>}
                  {testResult && <div className={`mt-4 rounded-xl border p-4 ${testResult.result.decision === "Allowed" ? "border-[#22C55E]/25 bg-[#22C55E]/5" : testResult.result.decision === "Blocked" ? "border-[#EF4444]/25 bg-[#EF4444]/5" : "border-[#F59E0B]/25 bg-[#F59E0B]/5"}`}><div className="flex items-center justify-between gap-3"><DecisionBadge decision={testResult.result.decision} /><span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Protected decision</span></div><div className="mt-3 text-sm font-semibold text-[#F8FAFC]">{testResult.agentMessage || testResult.result.decisionExplanation?.userMessage || testResult.result.primaryReason || testResult.result.reason}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{testResult.nextAction}</div><div className="mt-3 flex flex-wrap gap-2"><Btn variant="secondary" size="sm" onClick={() => { try { window.sessionStorage.setItem("magen3:audit-record-id", testResult.auditLog.id); } catch {} closeWizard(); onNavigate("audit-log"); }}>View Audit Record</Btn><Btn variant="ghost" size="sm" onClick={() => { closeWizard(); onNavigate("intent-playground"); }}>Open Playground</Btn></div></div>}
                </div>
              </div>
            </div>
          )}
          {setupMode === "advanced" && step === 1 && (
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <h3 className={SECTION_TITLE}>Agent Details</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">Name the external agent and describe the blockchain work it performs.</p>
              </div>
              <InputField label="Agent Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} placeholder="e.g. YieldBot AI" />
              <div>
                <label className={LABEL_CLS}>Agent Purpose</label>
                <textarea className={`${INPUT_CLS} resize-none`} rows={4} value={draft.purpose} onChange={(event) => setDraft((current) => ({ ...current, purpose: event.target.value }))} placeholder="Describe what this agent prepares or executes and who uses it." />
              </div>
              <SelectField label="Permission Level" value={draft.permissionLevel} onChange={(value) => setDraft((current) => ({ ...current, permissionLevel: value as PermissionLevel }))} options={["Read Only", "Limited Execution", "Full Execution with Review"]} />
            </div>
          )}

          {setupMode === "advanced" && step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className={SECTION_TITLE}>Execution Capabilities</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">Select one or more capabilities. These recommend protection and policy defaults; they do not replace the editable policy.</p>
              </div>
              <div>
                <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#64748B]">Convenience packs</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {CAPABILITY_PACKS.map((pack) => (
                    <button type="button" key={pack.name} onClick={() => setDraft((current) => {
                      const recommendation = recommendedPolicyTemplate(pack.capabilities);
                      const template = POLICY_TEMPLATES[recommendation];
                      return {
                        ...current,
                        executionCapabilities: [...pack.capabilities],
                        ...(current.policyMode === "recommended" ? {
                          templateType: recommendation,
                          policyName: `${recommendation} Policy`,
                          maxTransaction: template.maxTransaction,
                          dailyLimit: template.dailyLimit,
                          approvalThreshold: template.approvalThreshold,
                          trustedContractsText: template.trustedContracts.join("\n"),
                          blockedActions: [...template.blockedActions],
                          riskMode: template.riskMode,
                        } : {}),
                      };
                    })} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4 text-left hover:border-[#22D3EE]/40">
                      <div className="font-semibold text-[#F8FAFC]">{pack.name}</div>
                      <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{pack.description}</p>
                      <div className="mt-3"><CapabilityChips capabilities={pack.capabilities} compact /></div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {EXECUTION_CAPABILITY_CATALOG.map((capability) => {
                  const selected = capabilities.includes(capability.id);
                  return (
                    <button type="button" key={capability.id} onClick={() => toggleCapability(capability.id)} className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-[#22D3EE]/50 bg-[#22D3EE]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-[#F8FAFC]">{capability.id}</div>
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-[#22D3EE] bg-[#22D3EE] text-[#050B14]" : "border-[#334155]"}`}>{selected && <CheckCircle size={14} />}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{capability.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {setupMode === "advanced" && step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className={SECTION_TITLE}>Recommended Protection</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">Recommendations are derived from the selected capabilities. Statuses distinguish current enforcement from roadmap work.</p>
              </div>
              <CapabilityChips capabilities={capabilities} />
              <div className="grid gap-3 md:grid-cols-2">
                {modules.map((module) => (
                  <div key={module.id} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
                    <div className="flex items-start justify-between gap-3"><div className="font-semibold text-[#F8FAFC]">{module.name}</div><StatusBadge status={module.status} /></div>
                    <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{module.description}</p>
                    <div className="mt-3 text-[11px] text-[#64748B]">{module.configurable ? "Configuration available through policy fields." : "No live configuration is exposed yet."}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {setupMode === "advanced" && step === 4 && (
            <div className="space-y-5">
              <div>
                <h3 className={SECTION_TITLE}>Starter Policy</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">Prefill only fields the current backend enforces. You can edit them now or later.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(["recommended", "existing", "custom"] as const).map((mode) => (
                  <button type="button" key={mode} onClick={() => {
                    setDraft((current) => ({ ...current, policyMode: mode }));
                    if (mode === "recommended") applyTemplate(recommendedPolicyTemplate(capabilities));
                    if (mode === "custom") applyTemplate("Custom");
                  }} className={`rounded-xl border p-4 text-left ${draft.policyMode === mode ? "border-[#22D3EE]/50 bg-[#22D3EE]/10" : "border-[#1E293B] bg-[#0B1220]"}`}>
                    <div className="font-semibold capitalize text-[#F8FAFC]">{mode === "existing" ? "Use existing as template" : `${mode} policy`}</div>
                    <p className="mt-1 text-xs text-[#94A3B8]">{mode === "recommended" ? "Capability-aware secure defaults." : mode === "existing" ? "Clone values from a current policy without rebinding it." : "Start from editable general defaults."}</p>
                  </button>
                ))}
              </div>

              {draft.policyMode === "existing" ? (
                <div>
                  <label className={LABEL_CLS}>Existing Policy Template</label>
                  <select className={INPUT_CLS} value={draft.existingPolicyId} onChange={(event) => setDraft((current) => ({ ...current, existingPolicyId: event.target.value }))}>
                    <option value="">Select a policy to clone</option>
                    {policies.map((policy) => (
                      <option key={policy.id} value={policy.id}>{policy.name} · {policy.riskMode} · {policy.maxTransaction} CSPR max</option>
                    ))}
                  </select>
                  {policies.length === 0 && <div className="mt-2 rounded-lg border border-dashed border-[#1E293B] bg-[#0B1220] p-3 text-xs text-[#94A3B8]">No existing policies are available. Choose Recommended or Custom to continue.</div>}
                  <p className="mt-2 text-xs leading-relaxed text-[#64748B]">The values are cloned into a new policy for this agent. The original policy and its agent binding are not changed.</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField label="Policy Template" value={draft.templateType} onChange={applyTemplate} options={Object.keys(POLICY_TEMPLATES)} />
                    <InputField label="Policy Name" value={draft.policyName} onChange={(value) => setDraft((current) => ({ ...current, policyName: value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <InputField label="Maximum Transaction (CSPR)" type="number" value={String(draft.maxTransaction)} onChange={(value) => setDraft((current) => ({ ...current, maxTransaction: Number(value) }))} />
                    <InputField label="Daily Limit (CSPR)" type="number" value={String(draft.dailyLimit)} onChange={(value) => setDraft((current) => ({ ...current, dailyLimit: Number(value) }))} />
                    <InputField label="Review Threshold (CSPR)" type="number" value={String(draft.approvalThreshold)} onChange={(value) => setDraft((current) => ({ ...current, approvalThreshold: Number(value) }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField label="Risk Mode" value={draft.riskMode} onChange={(value) => setDraft((current) => ({ ...current, riskMode: value as RiskMode }))} options={["Conservative", "Balanced", "Aggressive"]} />
                    <div>
                      <label className={LABEL_CLS}>Trusted Contracts / Destinations</label>
                      <textarea className={`${INPUT_CLS} resize-none font-mono text-xs`} rows={4} value={draft.trustedContractsText} onChange={(event) => setDraft((current) => ({ ...current, trustedContractsText: event.target.value }))} placeholder="One address or contract per line" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-3 text-xs leading-relaxed text-[#94A3B8]">
                    Enforced now: maximum transaction, daily limit, review threshold, blocked actions, trusted targets, risk mode, wallet validation, contract validation, and deterministic execution preflight. Threat Intelligence, Oracle Validation, Bridge Controls, and Compliance Controls Foundation rules are added in Review mode. External feeds, current non-sensitive compliance evidence, and complete provider-supplied bridge metadata are still required for operational checks. Policy-specific maximum slippage, full stateful simulation, provider solvency, cross-chain delivery verification, and legal compliance guarantees are not represented as Live.
                  </div>
                </>
              )}
            </div>
          )}

          {setupMode === "advanced" && step === 5 && (
            <div className="space-y-5">
              <div>
                <h3 className={SECTION_TITLE}>Review Configuration</h3>
                <p className="mt-1 text-sm text-[#94A3B8]">Confirm the agent identity, capabilities, protection recommendations, and enforced starter policy.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className={`${CARD} p-4`}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Agent</div>
                  <div className="mt-2 text-lg font-bold text-[#F8FAFC]">{draft.name}</div>
                  <p className="mt-1 text-sm text-[#94A3B8]">{draft.purpose}</p>
                  <div className="mt-3"><CapabilityChips capabilities={capabilities} /></div>
                </div>
                <div className={`${CARD} p-4`}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Policy</div>
                  <div className="mt-2 text-lg font-bold text-[#F8FAFC]">{selectedExistingPolicy?.name || draft.policyName}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-[#0B1220] p-2 text-[#94A3B8]">Max Tx <span className="block text-[#F8FAFC]">{selectedExistingPolicy?.maxTransaction ?? draft.maxTransaction} CSPR</span></div>
                    <div className="rounded-lg bg-[#0B1220] p-2 text-[#94A3B8]">Daily <span className="block text-[#F8FAFC]">{selectedExistingPolicy?.dailyLimit ?? draft.dailyLimit} CSPR</span></div>
                    <div className="rounded-lg bg-[#0B1220] p-2 text-[#94A3B8]">Review <span className="block text-[#F8FAFC]">{selectedExistingPolicy?.approvalThreshold ?? draft.approvalThreshold} CSPR</span></div>
                    <div className="rounded-lg bg-[#0B1220] p-2 text-[#94A3B8]">Mode <span className="block text-[#F8FAFC]">{selectedExistingPolicy?.riskMode ?? draft.riskMode}</span></div>
                  </div>
                </div>
              </div>
              <div className={`${CARD} p-4`}>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Recommended modules</div>
                <div className="mt-3 flex flex-wrap gap-2">{modules.map((module) => <span key={module.id} className="inline-flex items-center gap-2 rounded-full border border-[#1E293B] bg-[#0B1220] px-3 py-1.5 text-xs text-[#F8FAFC]">{module.name}<StatusBadge status={module.status} /></span>)}</div>
              </div>
            </div>
          )}

          {setupMode === "advanced" && step === 6 && createdAgent && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 p-4">
                <div className="flex items-start gap-3"><CheckCircle size={22} className="flex-shrink-0 text-[#22C55E]" /><div><h3 className="font-bold text-[#F8FAFC]">Agent registration complete</h3><p className="mt-1 text-sm text-[#BBF7D0]">Copy the raw API key now. Magen3 stores only its hash and preview after this session.</p></div></div>
              </div>
              {error && <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#F59E0B]">{error}</div>}
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Agent ID", createdAgent.id],
                  ["API Key", createdAgent.apiKey || "Not available—rotate from Credentials"],
                  ["Magen3 API Base URL", gatewayBaseUrl],
                  ["Verify URL", `${verifyUrl}?agentId=${createdAgent.id}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs uppercase tracking-wider text-[#94A3B8]">{label}</span><button type="button" onClick={() => copyValue(label, value)} className="text-[#22D3EE] hover:text-[#F8FAFC]"><Copy size={13} /></button></div>
                    <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
                  </div>
                ))}
              </div>
              {copied === "failed" && <div className="text-xs text-[#F59E0B]">Browser clipboard access was blocked. Select and copy the value manually.</div>}
              <div className="rounded-xl border border-[#1E293B] bg-[#020617] p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div><div className="font-semibold text-[#F8FAFC]">Quick-start cURL</div><div className="text-xs text-[#94A3B8]">Uses the real current gateway route and header.</div></div><Btn variant="outline" size="sm" onClick={() => copyValue("quick start", requestExample)}><Copy size={13} /> {copied === "quick start" ? "Copied" : "Copy"}</Btn></div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[#94A3B8]"><code>{requestExample}</code></pre>
              </div>
            </div>
          )}

          {error && setupMode === "advanced" && step !== 6 && <div className="mt-5 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#1E293B] p-4 sm:px-6">
          {setupMode === "guided" ? <>
            <Btn variant="secondary" onClick={() => step > 1 && step < 4 ? setStep((current) => current - 1) : closeWizard()} disabled={submitting || testing}>{step > 1 && step < 4 ? "Back" : step === 4 ? "Close" : "Cancel"}</Btn>
            {step < 3 && <Btn variant="primary" onClick={() => setStep((current) => current + 1)} disabled={!canContinue}><ArrowRight size={15} /> Continue</Btn>}
            {step === 3 && <Btn variant="primary" onClick={createAgentAndPolicy} disabled={submitting || !canContinue}><ShieldCheck size={15} /> {submitting ? "Protecting agent…" : "Protect Agent"}</Btn>}
            {step === 4 && <Btn variant="primary" onClick={closeWizard}>Open Agent Control Centre</Btn>}
          </> : <>
            <Btn variant="secondary" onClick={() => step > 1 && step < 6 ? setStep((current) => current - 1) : closeWizard()} disabled={submitting}>{step > 1 && step < 6 ? "Back" : step === 6 ? "Close" : "Cancel"}</Btn>
            {step < 5 && <Btn variant="primary" onClick={() => setStep((current) => current + 1)} disabled={!canContinue}><ArrowRight size={15} /> Next</Btn>}
            {step === 5 && <Btn variant="primary" onClick={createAgentAndPolicy} disabled={submitting || !canContinue}>{submitting ? "Creating…" : "Create Agent and Policy"}</Btn>}
            {step === 6 && <Btn variant="primary" onClick={closeWizard}>Open Agent Control Centre</Btn>}
          </>}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Connected Agents Page
// ──────────────────────────────────────────────────────────

function ConnectedAgentsPage({
  agents,
  policies,
  onRegisterAgent,
  onRotateAgentApiKey,
  onRevokeAgent,
  onDeleteAgent,
  onCreatePolicy,
  onSubmitGatewayIntent,
  onNavigate,
  onboardingRequest,
  onOnboardingRequestHandled,
  auditLogs,
  approvals,
  walletAddress,
  apiOnline,
  emergencyPauses,
  onCreateEmergencyPause,
  onResumeEmergencyPause,
}: {
  agents: Agent[];
  policies: Policy[];
  onRegisterAgent: (agent: AgentRegistrationDraft) => Promise<Agent | undefined> | Agent | undefined;
  onRotateAgentApiKey: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  onRevokeAgent: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  onDeleteAgent: (id: string, confirmation: string) => Promise<{ ok: boolean; deletedAgent: { id: string; name: string }; deletedPolicyIds: string[] } | undefined>;
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
  onNavigate: (page: Page) => void;
  onboardingRequest?: OnboardingLaunchRequest | null;
  onOnboardingRequestHandled?: () => void;
  auditLogs: AuditLog[];
  approvals: ApprovalRequest[];
  walletAddress: string;
  apiOnline: boolean;
  emergencyPauses: EmergencyPause[];
  onCreateEmergencyPause: (body: Record<string, unknown>) => Promise<unknown>;
  onResumeEmergencyPause: (id: string, reason: string) => Promise<unknown>;
}) {
  type ConnectedAgentTab = "overview" | "setup" | "activity" | "access";
  type AgentAttentionIssue = {
    id: string;
    kind: "gateway" | "policy" | "execution" | "approval" | "pause" | "coverage" | "credential";
    title: string;
    description: string;
    severity: "critical" | "warning";
    actionLabel: string;
    tab?: ConnectedAgentTab;
    page?: Page;
  };

  const [latestCredentials, setLatestCredentials] = useState<Agent | null>(null);
  const [credentialAcknowledged, setCredentialAcknowledged] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [copied, setCopied] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<OnboardingSetupMode>("guided");
  const [agentSearch, setAgentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Revoked" | "No Policy">("All");
  const [policyFilter, setPolicyFilter] = useState("All");
  const [activeTab, setActiveTab] = useState<ConnectedAgentTab>("overview");
  const [skillTarget, setSkillTarget] = useState<"Claude" | "Codex" | "Custom Agent" | ".env" | "API Snippet">("Claude");
  const [showSkillKit, setShowSkillKit] = useState(false);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const [showMobileDirectory, setShowMobileDirectory] = useState(false);
  const [deleteAgentTarget, setDeleteAgentTarget] = useState<Agent | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const integrationEndpoints = getMagen3IntegrationEndpoints(api.baseUrl);
  const gatewayBaseUrl = integrationEndpoints.baseUrl;
  const gatewayUrl = integrationEndpoints.intentUrl;
  const gatewayVerifyUrl = integrationEndpoints.verifyUrl;

  useEffect(() => {
    if (!selectedAgentId && agents[0]?.id) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (!onboardingRequest) return;
    setRegistrationMode(onboardingRequest.mode);
    setShowRegister(true);
    onOnboardingRequestHandled?.();
  }, [onboardingRequest, onOnboardingRequestHandled]);

  useEffect(() => {
    try {
      const requestedMode = window.sessionStorage.getItem("magen3:onboarding-mode") as OnboardingSetupMode | null;
      if (requestedMode === "guided" || requestedMode === "advanced") {
        window.sessionStorage.removeItem("magen3:onboarding-mode");
        setRegistrationMode(requestedMode);
        setShowRegister(true);
      }
    } catch {
      // Session storage is optional; the page still exposes the Add Agent action.
    }
  }, []);

  useEffect(() => {
    setShowSkillKit(false);
    setShowAgentDetails(false);
  }, [selectedAgentId]);

  const copyText = useCallback(async (label: string, value: string) => {
    if (!value) return;
    const copiedOk = await writeClipboard(value);
    if (copiedOk) {
      setCopied(label);
      setTimeout(() => setCopied(""), 1400);
    } else {
      setCopied("copy failed");
      setTimeout(() => setCopied(""), 1800);
    }
  }, []);

  const downloadText = useCallback((filename: string, value: string) => {
    if (!value) return;
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  const recordLatestCredentialSaved = useCallback(() => {
    if (!latestCredentials?.id) return;
    try {
      window.localStorage.setItem(`magen3.onboarding.credentialsSaved.${latestCredentials.id}`, "true");
    } catch {
      // Browser storage is optional; the credential panel remains usable without it.
    }
  }, [latestCredentials?.id]);

  const acknowledgeLatestCredential = useCallback(() => {
    recordLatestCredentialSaved();
    setCredentialAcknowledged(true);
  }, [recordLatestCredentialSaved]);

  const integrationSnippet = useCallback((agent: Agent, _apiKeyValue?: string) => `const agentId = process.env.MAGEN3_AGENT_ID || "${agent.id}";
const agentApiKey = process.env.MAGEN3_API_KEY;
if (!agentApiKey) throw new Error("MAGEN3_API_KEY is required in the backend environment");
const executionWalletAddress = await getConnectedCasperWalletPublicKey();

const verify = await fetch("${gatewayVerifyUrl}?agentId=" + encodeURIComponent(agentId), {
  headers: { "x-magen3-agent-key": agentApiKey }
});
const gatewayStatus = await verify.json();
if (!gatewayStatus.gatewayReady) {
  throw new Error(gatewayStatus.reason || "Magen3 gateway is not ready for this agent");
}

const response = await fetch("${gatewayUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-magen3-agent-key": agentApiKey
  },
  body: JSON.stringify({
    source: "${agent.name}",
    agentId,
    walletAddress: executionWalletAddress,
    executionWalletAddress,
    goal: "Describe the Web3 action the external agent wants to execute",
    reason: "External agent prepared this action and is requesting approval before execution.",
    action: {
      type: "Stake",
      amount: 15,
      asset: "CSPR",
      target: "VALIDATOR_OR_CONTRACT_ADDRESS",
      targetType: "Trusted Contract"
    }
  })
});

const decision = await response.json();
if (!decision.executionApproved) {
  throw new Error(decision.agentMessage || decision.decisionExplanation?.userMessage || decision.result?.primaryReason || "Magen3 did not approve execution");
}
// Only after this should the external agent request the execution wallet signature.`, [gatewayUrl, gatewayVerifyUrl]);

  const envTemplate = useCallback((agent: Agent, apiKeyValue?: string) => buildMagen3EnvironmentFile({
    apiBaseUrl: gatewayBaseUrl,
    agentId: agent.id,
    apiKey: apiKeyValue || "PASTE_AGENT_API_KEY_ONCE_OR_ROTATE_KEY_IN_MAGEN3",
    agentName: agent.name,
  }), [gatewayBaseUrl]);

  const agentSkillKit = useCallback((agent: Agent, apiKeyValue: string | undefined, target: typeof skillTarget, snippet: string) => {
    if (target === ".env") return envTemplate(agent, apiKeyValue);
    if (target === "API Snippet") return snippet;

    const installNote =
      target === "Claude"
        ? "Paste this into Claude Project instructions, a Claude chat, or the external agent instructions that Claude will follow."
        : target === "Codex"
        ? "Save this as SKILL.md inside a Codex skill folder, or paste it into the agent instructions for this project."
        : "Use this as a system/developer instruction block for the external agent runtime.";

    return `# Magen3 Agent Skill

${installNote}

Use this skill when acting as the external agent "${agent.name}".

## Identity
- Agent ID: ${agent.id}
- API key env var: MAGEN3_API_KEY
- API key preview: ${agent.apiKeyPreview || "shown once after registration or rotation"}
- Magen3 API base URL: ${gatewayBaseUrl}
- Gateway verify URL: ${gatewayVerifyUrl}?agentId=${agent.id}
- Gateway intent URL: ${gatewayUrl}

## Rules
1. Never execute a Web3 action before asking Magen3.
2. Identify with Agent ID and the Magen3 API key.
3. Treat the wallet connected inside the external agent as the execution wallet.
4. The execution wallet does not need to match the Magen3 owner/admin wallet.
5. Continue only when Magen3 returns Allowed and executionApproved is true.
6. If Magen3 returns Blocked, stop and show agentMessage to the user. Use decisionExplanation.code, field, expected, received, and mismatchFields only for developer diagnostics.
7. If Magen3 returns Review Required, stop and inspect reviewResolution. Remediate and resubmit when humanActionRequired is false; poll the bound approval only when it is true.
8. Build instructionIntegrity with the official SDK binding helper and preserve its goal ID and original protected-parameter snapshot while retrying the same user goal. This lets Magen3 name the exact amount, destination, asset, network, contract, or method that changed.
9. After real execution, report the real execution transaction hash and status to Magen3. Casper records only the separate Magen3 decision proof.

## Example Intent
\`\`\`json
{
  "source": "${agent.name}",
  "agentId": "${agent.id}",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "External agent prepared this action and is requesting approval before execution.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}
\`\`\`

Store the raw API key securely in the external agent backend. Never place it in this skill, a prompt, source code, logs, screenshots, or a commit. Use the separate \`.env\` export to save the one-time key. If it is no longer visible, rotate it in Magen3 Connected Agents.

## Environment
\`\`\`env
${envTemplate(agent).trim()}
\`\`\`

## JavaScript Fetch Example
\`\`\`js
${snippet}
\`\`\`
`;
  }, [envTemplate, gatewayBaseUrl, gatewayUrl, gatewayVerifyUrl]);

  const rotateKey = useCallback(async (agentId: string) => {
    const rotated = await onRotateAgentApiKey(agentId);
    if (rotated) {
      setLatestCredentials(rotated);
      setCredentialAcknowledged(false);
      setSelectedAgentId(rotated.id);
      setActiveTab("access");
    }
  }, [onRotateAgentApiKey]);

  const revokeAgent = useCallback(async (agentId: string) => {
    const revoked = await onRevokeAgent(agentId);
    if (revoked) {
      setLatestCredentials(null);
      setCredentialAcknowledged(false);
    }
  }, [onRevokeAgent]);

  const deleteAgent = useCallback(async () => {
    if (!deleteAgentTarget) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    try {
      const result = await onDeleteAgent(deleteAgentTarget.id, deleteConfirmation);
      if (!result?.ok) return;
      setLatestCredentials((current) => current?.id === deleteAgentTarget.id ? null : current);
      setCredentialAcknowledged(false);
      try {
        window.localStorage.removeItem(`magen3.onboarding.credentialsSaved.${deleteAgentTarget.id}`);
      } catch {
        // Local onboarding progress is optional and must not block deletion.
      }
      setDeleteAgentTarget(null);
      setDeleteConfirmation("");
      setSelectedAgentId((current) => current === deleteAgentTarget.id ? "" : current);
      setActiveTab("overview");
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete agent.");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteAgentTarget, deleteConfirmation, onDeleteAgent]);

  const agentSnapshots = useMemo(() => agents.map((agent) => {
    const policy = getActivePolicy(policies, agent.id);
    const logs = auditLogs.filter((log) => log.agentId === agent.id);
    const latestLog = logs[0];
    const coverage = calculateSecurityCoverage(agent, policy, logs);
    const activePauses = emergencyPauses.filter((pause) =>
      (pause.active === true || pause.status === "Active") && (!pause.agentId || pause.agentId === agent.id)
    );
    const unresolvedExecutions = logs.filter((log) => executionNeedsAttention(log));
    const pendingApprovals = logs.filter((log) => {
      if (log.decision !== "Review Required") return false;
      const status = String(log.approvalStatus || "Pending").toLowerCase();
      return !["approved", "rejected", "expired", "cancelled", "resolved"].includes(status);
    });
    const hasCredential = Boolean(
      (latestCredentials?.id === agent.id && latestCredentials.apiKey) || agent.apiKey || agent.apiKeyPreview
    );
    const issues: AgentAttentionIssue[] = [];

    if (agent.status === "Active" && !policy) {
      issues.push({
        id: `${agent.id}-policy`,
        kind: "policy",
        title: `${agent.name} has no active policy`,
        description: "Gateway authorization cannot use agent-specific policy controls until an active policy is assigned.",
        severity: "critical",
        actionLabel: "Configure policy",
        page: "policies",
      });
    }
    if (activePauses.length > 0) {
      issues.push({
        id: `${agent.id}-pause`,
        kind: "pause",
        title: `${agent.name} is paused`,
        description: `${activePauses.length} active emergency pause ${activePauses.length === 1 ? "scope is" : "scopes are"} blocking or reviewing execution.`,
        severity: "critical",
        actionLabel: "Review controls",
        tab: "access",
      });
    }
    if (unresolvedExecutions.length > 0) {
      issues.push({
        id: `${agent.id}-execution`,
        kind: "execution",
        title: `${agent.name} has ${unresolvedExecutions.length} unresolved ${unresolvedExecutions.length === 1 ? "execution" : "executions"}`,
        description: "Review pending, uncertain, replacement, delivery, or refund state before submitting another attempt.",
        severity: "warning",
        actionLabel: "Review execution",
        page: "audit-log",
      });
    }
    if (pendingApprovals.length > 0) {
      issues.push({
        id: `${agent.id}-approval`,
        kind: "approval",
        title: `${agent.name} has ${pendingApprovals.length} pending ${pendingApprovals.length === 1 ? "review" : "reviews"}`,
        description: "A Review Required decision was explicitly escalated to the configured human approval workflow.",
        severity: "warning",
        actionLabel: "Review decision",
        page: "audit-log",
      });
    }
    if (agent.status === "Active" && coverage.score < 60) {
      issues.push({
        id: `${agent.id}-coverage`,
        kind: "coverage",
        title: `${agent.name} has low Security Coverage`,
        description: `${coverage.score}% configured coverage. Review missing controls and recommendations for this agent.`,
        severity: "warning",
        actionLabel: "View coverage",
        tab: "overview",
      });
    }
    if (agent.status === "Active" && !hasCredential) {
      issues.push({
        id: `${agent.id}-credential`,
        kind: "credential",
        title: `${agent.name} has no active API credential`,
        description: "Rotate the credential to issue a new one-time key before the external agent calls the Gateway.",
        severity: "critical",
        actionLabel: "Manage access",
        tab: "access",
      });
    }

    return {
      agent,
      policy,
      logs,
      latestLog,
      coverage,
      activePauses,
      unresolvedExecutions,
      pendingApprovals,
      hasCredential,
      issues,
    };
  }), [agents, policies, auditLogs, emergencyPauses, latestCredentials]);

  const snapshotById = useMemo(() => new Map(agentSnapshots.map((snapshot) => [snapshot.agent.id, snapshot])), [agentSnapshots]);
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];
  const selectedSnapshot = selectedAgent ? snapshotById.get(selectedAgent.id) : undefined;
  const selectedPolicy = selectedSnapshot?.policy;
  const selectedLogs = selectedSnapshot?.logs || [];
  const selectedPendingApprovals = selectedAgent
    ? approvals.filter((approval) => approval.agentId === selectedAgent.id && ["Pending", "Configuration Required"].includes(approval.reviewStatus))
    : [];
  const selectedDeleteBlockers = selectedAgent ? [
    ...(selectedAgent.status !== "Revoked" ? ["Revoke the agent before deletion."] : []),
    ...(selectedPendingApprovals.length ? [`${selectedPendingApprovals.length} approval request${selectedPendingApprovals.length === 1 ? " is" : "s are"} still pending.`] : []),
    ...((selectedSnapshot?.activePauses.length || 0) > 0 ? [`${selectedSnapshot?.activePauses.length} emergency pause${selectedSnapshot?.activePauses.length === 1 ? " is" : "s are"} still active.`] : []),
    ...((selectedSnapshot?.unresolvedExecutions.length || 0) > 0 ? [`${selectedSnapshot?.unresolvedExecutions.length} execution${selectedSnapshot?.unresolvedExecutions.length === 1 ? " is" : "s are"} unresolved.`] : []),
  ] : [];
  const agentAuditLogs = selectedLogs.slice(0, 5);
  const rawKey = selectedAgent && latestCredentials?.id === selectedAgent.id
    ? latestCredentials.apiKey
    : selectedAgent?.apiKey;
  const selectedSnippet = selectedAgent ? integrationSnippet(selectedAgent, rawKey) : "";
  const selectedSkill = selectedAgent ? agentSkillKit(selectedAgent, rawKey, skillTarget, selectedSnippet) : "";
  const skillFilename = !selectedAgent
    ? "SKILL.md"
    : skillTarget === ".env"
      ? `magen3-${selectedAgent.id.toLowerCase()}.env`
      : skillTarget === "API Snippet"
        ? `magen3-${selectedAgent.id.toLowerCase()}-gateway.js`
        : "SKILL.md";

  const scopedAgentIds = useMemo(() => new Set(agents.map((agent) => agent.id)), [agents]);
  const scopedAuditLogs = useMemo(() => auditLogs.filter((log) => scopedAgentIds.has(log.agentId)), [auditLogs, scopedAgentIds]);
  const today = new Date();
  const requestsToday = scopedAuditLogs.filter((log) => isSameDay(new Date(log.timestamp), today)).length;
  const unresolvedExecutions = scopedAuditLogs.filter((log) => executionNeedsAttention(log));
  const activeAgentsCount = agents.filter((agent) => agent.status === "Active").length;
  const agentsNeedingAttention = agentSnapshots.filter((snapshot) => snapshot.agent.status === "Active" && snapshot.issues.length > 0).length;

  const attentionItems = useMemo(() => {
    const items: Array<AgentAttentionIssue & { agentId?: string; agentName?: string }> = [];
    if (!apiOnline) {
      items.push({
        id: "gateway-unavailable",
        kind: "gateway",
        title: "Gateway is unavailable",
        description: "Connected agents cannot submit new intents until backend connectivity is restored.",
        severity: "critical",
        actionLabel: "Open settings",
        page: "settings",
      });
    }
    for (const snapshot of agentSnapshots) {
      for (const issue of snapshot.issues) {
        items.push({ ...issue, agentId: snapshot.agent.id, agentName: snapshot.agent.name });
      }
    }
    return items;
  }, [apiOnline, agentSnapshots]);

  const filteredAgents = agents.filter((agent) => {
    const snapshot = snapshotById.get(agent.id);
    const policy = snapshot?.policy;
    const query = agentSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      agent.name.toLowerCase().includes(query) ||
      agent.id.toLowerCase().includes(query) ||
      agent.type.toLowerCase().includes(query) ||
      normalizeCapabilities(agent.executionCapabilities, agent.type).some((capability) => capability.toLowerCase().includes(query));
    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "No Policy" ? !policy : agent.status === statusFilter);
    const matchesPolicy = policyFilter === "All" || policy?.id === policyFilter;
    return matchesSearch && matchesStatus && matchesPolicy;
  });

  const openAgent = useCallback((agentId: string, tab: ConnectedAgentTab = "overview") => {
    setSelectedAgentId(agentId);
    setActiveTab(tab);
    setShowMobileDirectory(false);
  }, []);

  const handleAttentionAction = useCallback((item: AgentAttentionIssue & { agentId?: string }) => {
    if (item.agentId) {
      setSelectedAgentId(item.agentId);
    }
    if (item.page) {
      onNavigate(item.page);
      return;
    }
    if (item.tab) {
      setActiveTab(item.tab);
      setShowMobileDirectory(false);
    }
  }, [onNavigate]);

  const compactCapabilities = (capabilities: ExecutionCapability[], maximum = 3) => (
    <div className="flex flex-wrap gap-1.5">
      {capabilities.slice(0, maximum).map((capability) => (
        <span key={capability} className="rounded-full border border-[#1E293B] bg-[#050B14] px-2 py-0.5 text-[10px] font-semibold text-[#94A3B8]">
          {capability}
        </span>
      ))}
      {capabilities.length > maximum && (
        <span className="rounded-full border border-[#1E293B] bg-[#050B14] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
          +{capabilities.length - maximum} more
        </span>
      )}
    </div>
  );

  const detailTabs = [
    { id: "overview", label: "Overview", icon: Eye },
    { id: "setup", label: "Setup & Integration", icon: Code2 },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "access", label: "Access", icon: Lock },
  ] as const;

  const decisionCounts = selectedLogs.reduce((counts, log) => {
    counts.total += 1;
    if (log.decision === "Allowed") counts.allowed += 1;
    if (log.decision === "Blocked") counts.blocked += 1;
    if (log.decision === "Review Required") counts.review += 1;
    return counts;
  }, { total: 0, allowed: 0, blocked: 0, review: 0 });

  const selectedCapabilities = selectedAgent
    ? normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connected Agents"
        description="Register and manage external agents authorised to call Magen3 before wallet signing or blockchain execution."
        meta={<>
          <span className="inline-flex rounded-full border border-[#1E293B] bg-[#0B1220] px-2.5 py-1 text-xs font-semibold text-[#94A3B8]">{activeAgentsCount} active {activeAgentsCount === 1 ? "agent" : "agents"}</span>
          {!apiOnline && <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#EF4444]"><Server size={12} /> Gateway unavailable</span>}
        </>}
        actions={<>
          <details className="relative group">
            <summary className="list-none cursor-pointer rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-xs text-[#94A3B8] hover:text-[#F8FAFC]">Owner wallet <ChevronDown size={13} className="ml-1 inline transition-transform group-open:rotate-180" /></summary>
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[#1E293B] bg-[#0B1220] p-3 shadow-2xl"><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Registration owner</div><div className="mt-2 break-all font-mono text-xs text-[#F8FAFC]">{walletAddress || "Wallet not available"}</div></div>
          </details>
          <Btn variant="primary" onClick={() => { setRegistrationMode("guided"); setShowRegister(true); }}><Plus size={16} /> Register Agent</Btn>
        </>}
      />

      {latestCredentials?.apiKey && !credentialAcknowledged && (
        <div className={`${CARD_GLOW} border-[#22C55E]/30 p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#22C55E]">
                <CheckCircle size={13} /> One-time credential
              </div>
              <h2 className="mt-3 text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Save {latestCredentials.name}'s new API key</h2>
              <p className="mt-1 text-sm text-[#94A3B8]">This raw key is shown once. Store it securely before leaving this session.</p>
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                <code className="min-w-0 flex-1 break-all text-xs text-[#F8FAFC]">{latestCredentials.apiKey}</code>
                <button type="button" onClick={() => copyText("new api key", latestCredentials.apiKey || "")} className="shrink-0 text-[#22D3EE] hover:text-[#F8FAFC]" aria-label="Copy new API key"><Copy size={15} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
              <Btn variant="secondary" size="sm" onClick={() => { void copyText("new api key", latestCredentials.apiKey || ""); recordLatestCredentialSaved(); }}><Copy size={14} /> {copied === "new api key" ? "Copied" : "Copy API Key"}</Btn>
              <Btn variant="secondary" size="sm" onClick={() => { downloadText(`magen3-${latestCredentials.id.toLowerCase()}.env`, envTemplate(latestCredentials, latestCredentials.apiKey)); recordLatestCredentialSaved(); }}><FileText size={14} /> Download .env</Btn>
              <Btn variant="outline" size="sm" onClick={() => openAgent(latestCredentials.id, "setup")}><Code2 size={14} /> Open Setup</Btn>
              <Btn variant="ghost" size="sm" onClick={acknowledgeLatestCredential}><CheckCircle size={14} /> I have saved it</Btn>
            </div>
          </div>
          {copied === "copy failed" && <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">Copy was blocked by the browser. Select the key text and copy it manually.</div>}
        </div>
      )}

      <div className={`${CARD_GLOW} overflow-hidden bg-[#1E293B]`}>
        <div className="grid gap-px sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active Agents", value: activeAgentsCount, detail: `${agents.length} registered`, icon: <Bot size={18} />, tone: "text-[#22C55E]" },
            { label: "Need Attention", value: agentsNeedingAttention, detail: agentsNeedingAttention ? "configuration or action required" : "all active agents clear", icon: <AlertTriangle size={18} />, tone: agentsNeedingAttention ? "text-[#F59E0B]" : "text-[#22C55E]" },
            { label: "Requests Today", value: requestsToday, detail: "gateway intents received", icon: <Activity size={18} />, tone: "text-[#22D3EE]" },
            { label: "Unresolved", value: unresolvedExecutions.length, detail: unresolvedExecutions.length ? "execution or settlement state" : "settlement clear", icon: <RefreshCw size={18} />, tone: unresolvedExecutions.length ? "text-[#F59E0B]" : "text-[#22C55E]" },
          ].map((metric) => (
            <div key={metric.label} className="flex items-start justify-between gap-3 bg-[#111827] p-4 sm:p-5">
              <div>
                <div className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{metric.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{metric.label}</div>
                <div className="mt-1 text-[11px] text-[#64748B]">{metric.detail}</div>
              </div>
              <div className={`rounded-xl border border-[#1E293B] bg-[#0B1220] p-2 ${metric.tone}`}>{metric.icon}</div>
            </div>
          ))}
        </div>
      </div>

      <section className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><AlertTriangle size={17} className={attentionItems.length ? "text-[#F59E0B]" : "text-[#22C55E]"} /><h2 className={SECTION_TITLE}>Agents Needing Attention</h2></div>
            <p className="mt-1 text-xs text-[#94A3B8]">Only operational or configuration issues that require action appear here.</p>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${attentionItems.length ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]" : "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]"}`}>{attentionItems.length ? `${attentionItems.length} open` : "All clear"}</span>
        </div>
        {attentionItems.length === 0 ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4">
            <CheckCircle size={18} className="shrink-0 text-[#22C55E]" />
            <div><div className="text-sm font-semibold text-[#F8FAFC]">All active agents are operating normally</div><div className="mt-1 text-xs text-[#94A3B8]">No missing policy, paused scope, unresolved execution, pending review, low coverage, or credential issue was detected.</div></div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {attentionItems.slice(0, 6).map((item) => (
              <div key={item.id} className={`rounded-xl border p-4 ${item.severity === "critical" ? "border-[#EF4444]/25 bg-[#EF4444]/5" : "border-[#F59E0B]/25 bg-[#F59E0B]/5"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-sm font-semibold text-[#F8FAFC]">{item.title}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{item.description}</div></div>
                  <button type="button" onClick={() => handleAttentionAction(item)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${item.severity === "critical" ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]" : "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#FCD34D]"}`}>{item.actionLabel}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {attentionItems.length > 6 && <div className="mt-3 text-xs text-[#64748B]">{attentionItems.length - 6} additional items are available through the affected agent and Audit Logs.</div>}
      </section>

      <div className={`${CARD} p-4 xl:hidden`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <select className={`${INPUT_CLS} appearance-none pr-10`} value={selectedAgent?.id || ""} onChange={(event) => openAgent(event.target.value, "overview")}>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.status}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          </div>
          <Btn variant="secondary" size="sm" onClick={() => setShowMobileDirectory((current) => !current)}><Search size={14} /> {showMobileDirectory ? "Hide directory" : "Browse agents"}</Btn>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.82fr)_1.5fr]">
        <div className={`${CARD} ${showMobileDirectory ? "block" : "hidden"} overflow-hidden xl:block`}>
          <div className="space-y-3 border-b border-[#1E293B] p-4">
            <div className="flex items-center justify-between gap-3"><div><h2 className={SECTION_TITLE}>Agent Directory</h2><div className="mt-1 text-xs text-[#64748B]">Select an agent to open its control centre.</div></div><span className="rounded-full bg-[#0B1220] px-2.5 py-1 text-xs text-[#94A3B8]">{filteredAgents.length}/{agents.length}</span></div>
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" /><input className={`${INPUT_CLS} pl-9`} value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder="Search name, ID, or capability" /></div>
            <div className="flex flex-wrap gap-2">
              {(["All", "Active", "Revoked", "No Policy"] as const).map((status) => (
                <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${statusFilter === status ? "border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]" : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]"}`}>{status}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2">
              <Filter size={14} className="text-[#94A3B8]" />
              <select className="min-w-0 flex-1 bg-transparent text-xs text-[#F8FAFC] outline-none" value={policyFilter} onChange={(event) => setPolicyFilter(event.target.value)}>
                <option className="bg-[#0B1220]" value="All">All policies</option>
                {policies.filter((policy) => policy.status === "Active").map((policy) => <option className="bg-[#0B1220]" key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
            </div>
          </div>
          <div className="max-h-[720px] space-y-2 overflow-y-auto p-3">
            {filteredAgents.length === 0 ? (
              agents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#22D3EE]/25 bg-[#22D3EE]/5 p-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#22D3EE]/20 bg-[#0B1220]"><Bot size={22} className="text-[#22D3EE]" /></div>
                  <h3 className="mt-4 text-sm font-semibold text-[#F8FAFC]">Protect your first agent</h3>
                  <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-[#94A3B8]">Guided Setup creates the agent, secure starter policy, credential, integration instructions, and first protected test.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2"><Btn variant="primary" size="sm" onClick={() => { setRegistrationMode("guided"); setShowRegister(true); }}><ShieldCheck size={14} /> Start Guided Setup</Btn><Btn variant="ghost" size="sm" onClick={() => { setRegistrationMode("advanced"); setShowRegister(true); }}>Advanced Setup</Btn></div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center"><Search size={28} className="mx-auto mb-3 text-[#94A3B8]" /><p className="text-sm text-[#94A3B8]">No agents match these filters.</p><button type="button" onClick={() => { setAgentSearch(""); setStatusFilter("All"); setPolicyFilter("All"); }} className="mt-3 text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]">Clear filters</button></div>
              )
            ) : filteredAgents.map((agent) => {
              const snapshot = snapshotById.get(agent.id);
              if (!snapshot) return null;
              const active = selectedAgent?.id === agent.id;
              const capabilities = normalizeCapabilities(agent.executionCapabilities, agent.type);
              const coverageTone = snapshot.coverage.score >= 80 ? "bg-[#22C55E]" : snapshot.coverage.score >= 60 ? "bg-[#22D3EE]" : "bg-[#F59E0B]";
              return (
                <button key={agent.id} onClick={() => openAgent(agent.id, "overview")} className={`w-full rounded-xl border p-3.5 text-left transition-all ${active ? "border-[#22D3EE]/40 bg-[#22D3EE]/10" : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate font-semibold font-['Space_Grotesk'] text-[#F8FAFC]">{agent.name}</h3>{snapshot.issues.length > 0 && <AlertTriangle size={14} className={snapshot.issues.some((issue) => issue.severity === "critical") ? "shrink-0 text-[#EF4444]" : "shrink-0 text-[#F59E0B]"} />}</div><div className="mt-1 truncate text-xs text-[#94A3B8]">{agent.status === "Active" ? "Agent Active" : "Agent Revoked"} · {snapshot.policy ? snapshot.policy.name : "No Active Policy"}</div></div>
                    {snapshot.activePauses.length > 0 && <span className="shrink-0 rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FCA5A5]">Paused</span>}
                  </div>
                  <div className="mt-3">{compactCapabilities(capabilities, 3)}</div>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div className="min-w-0 flex-1"><div className="flex items-center justify-between text-[10px]"><span className="font-semibold uppercase tracking-wider text-[#64748B]">Coverage</span><span className="font-semibold text-[#F8FAFC]">{snapshot.coverage.score}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#050B14]"><div className={`h-full rounded-full ${coverageTone}`} style={{ width: `${snapshot.coverage.score}%` }} /></div></div>
                    <div className="shrink-0 text-right"><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Last active</div><div className="mt-1 text-[10px] text-[#94A3B8]">{snapshot.latestLog ? fmtTs(snapshot.latestLog.timestamp) : "Never"}</div></div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${CARD_GLOW} min-h-[560px] p-5`}>
          {!selectedAgent || !selectedSnapshot ? (
            agents.length === 0 ? (
              <EmptyState title="Your first protected agent starts here" description="Choose a use case and Magen3 will prepare secure capabilities, an active starter policy, one-time credentials, integration instructions, and a safe first Gateway test." action={<div className="flex flex-wrap justify-center gap-2"><Btn variant="primary" onClick={() => { setRegistrationMode("guided"); setShowRegister(true); }}><ShieldCheck size={16} /> Start Guided Setup</Btn><Btn variant="secondary" onClick={() => { setRegistrationMode("advanced"); setShowRegister(true); }}>Advanced Setup</Btn></div>} />
            ) : (
              <EmptyState title="Select an agent" description="Choose a connected agent to view operational status, setup, activity, and access controls." action={<Btn variant="primary" onClick={() => setShowMobileDirectory(true)}><Search size={16} /> Browse Agents</Btn>} />
            )
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{selectedAgent.name}</h2>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selectedAgent.status === "Active" ? "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/25 bg-[#EF4444]/10 text-[#EF4444]"}`}>Agent {selectedAgent.status}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selectedPolicy ? "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{selectedPolicy ? "Policy Active" : "No Active Policy"}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${apiOnline ? "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/25 bg-[#EF4444]/10 text-[#EF4444]"}`}>Gateway {apiOnline ? "Connected" : "Unavailable"}</span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm text-[#94A3B8]">{selectedAgent.purpose || "No purpose added yet."}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#94A3B8]"><span>Coverage <strong className="text-[#F8FAFC]">{selectedSnapshot.coverage.score}%</strong></span><span>Last active <strong className="text-[#F8FAFC]">{selectedSnapshot.latestLog ? fmtTs(selectedSnapshot.latestLog.timestamp) : "No activity yet"}</strong></span><span>{selectedCapabilities.length} execution {selectedCapabilities.length === 1 ? "capability" : "capabilities"}</span></div>
                  <div className="mt-3">{compactCapabilities(selectedCapabilities, 4)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn variant="secondary" size="sm" onClick={() => onNavigate("intent-playground")}><Send size={14} /> Test Intent</Btn>
                  <Btn variant="secondary" size="sm" onClick={() => copyText("agent id", selectedAgent.id)}><Copy size={14} /> {copied === "agent id" ? "Copied" : "Copy Agent ID"}</Btn>
                  <details className="relative group">
                    <summary className="list-none cursor-pointer rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC]">More actions <ChevronDown size={13} className="ml-1 inline transition-transform group-open:rotate-180" /></summary>
                    <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B1220] p-1.5 shadow-2xl">
                      <button type="button" onClick={() => onNavigate("policies")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><FileText size={14} /> Manage policy</button>
                      <button type="button" onClick={() => rotateKey(selectedAgent.id)} disabled={selectedAgent.status === "Revoked"} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC] disabled:opacity-50"><Lock size={14} /> Rotate API key</button>
                      <button type="button" onClick={() => setActiveTab("access")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><ShieldAlert size={14} /> Emergency controls</button>
                      <button type="button" onClick={() => setActiveTab("access")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#FCA5A5] hover:bg-[#EF4444]/10"><XCircle size={14} /> Revoke access</button>
                    </div>
                  </details>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto border-b border-[#1E293B] pb-3">
                {detailTabs.map((tab) => {
                  const Icon = tab.icon;
                  return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? "border-[#22D3EE]/40 bg-[#22D3EE]/10 text-[#22D3EE]" : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]"}`}><Icon size={14} /> {tab.label}</button>;
                })}
              </div>

              {activeTab === "overview" && (
                <div className="space-y-4">
                  {selectedSnapshot.issues.length > 0 ? (
                    <div className="rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-4">
                      <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Attention required · {selectedSnapshot.issues.length}</div><div className="mt-1 text-xs text-[#94A3B8]">Resolve these items to improve this agent's operational readiness.</div></div><AlertTriangle size={18} className="text-[#F59E0B]" /></div>
                      <div className="mt-3 space-y-2">{selectedSnapshot.issues.slice(0, 3).map((issue) => <button key={issue.id} type="button" onClick={() => handleAttentionAction({ ...issue, agentId: selectedAgent.id })} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-left"><span className="text-xs text-[#F8FAFC]">{issue.title}</span><span className="shrink-0 text-[10px] font-semibold text-[#F59E0B]">{issue.actionLabel} →</span></button>)}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4"><CheckCircle size={18} className="text-[#22C55E]" /><div><div className="text-sm font-semibold text-[#F8FAFC]">No action required</div><div className="mt-1 text-xs text-[#94A3B8]">Policy, credential, coverage, approval, pause, and execution state are clear for this agent.</div></div></div>
                  )}

                  {selectedSnapshot.unresolvedExecutions.length > 0 && <button type="button" onClick={() => { try { window.sessionStorage.setItem("magen3:audit-record-id", selectedSnapshot.unresolvedExecutions[0].id); } catch {} onNavigate("audit-log"); }} className="w-full rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-4 text-left"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Unresolved execution · {selectedSnapshot.unresolvedExecutions.length}</div><div className="mt-1 text-xs leading-relaxed text-[#FCD34D]">Review reconciliation state before submitting another execution attempt.</div></div><ArrowRight size={18} className="shrink-0 text-[#F59E0B]" /></div></button>}

                  <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                    <div className="space-y-4">
                      <CoverageCard agent={selectedAgent} policy={selectedPolicy} logs={selectedLogs} onNavigate={onNavigate} />

                      <div className={`${CARD} p-4`}>
                        <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Decision Insights</div><div className="mt-1 text-sm text-[#94A3B8]">Observed Gateway decisions for this agent.</div></div><TrendingUp size={18} className="text-[#22D3EE]" /></div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">{[["Total", decisionCounts.total], ["Allowed", decisionCounts.allowed], ["Review", decisionCounts.review], ["Blocked", decisionCounts.blocked]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-2.5"><div className="text-lg font-bold text-[#F8FAFC]">{String(value)}</div><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">{String(label)}</div></div>)}</div>
                      </div>

                      <details className={`${CARD} group p-4`} open={showAgentDetails} onToggle={(event) => setShowAgentDetails((event.currentTarget as HTMLDetailsElement).open)}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Agent details</div><div className="mt-1 text-xs text-[#94A3B8]">Identity, ownership, capabilities, policy, and creation metadata.</div></div><ChevronDown size={15} className="text-[#64748B] transition-transform group-open:rotate-180" /></summary>
                        <div className="mt-4 border-t border-[#1E293B] pt-4"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{[["Agent ID", selectedAgent.id], ["Agent Type", selectedAgent.type], ["Permission Level", selectedAgent.permissionLevel], ["Owner Wallet", selectedAgent.ownerWalletAddress || walletAddress || "Unknown"], ["Assigned Policy", selectedPolicy?.name || "No active policy"], ["Created", fmtTs(selectedAgent.createdAt)]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-all text-xs text-[#F8FAFC]">{value}</div></div>)}</div><div className="mt-4"><div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Execution capabilities</div><div className="mt-2"><CapabilityChips capabilities={selectedCapabilities} compact /></div></div><p className="mt-4 text-xs leading-relaxed text-[#94A3B8]">Magen3 identifies the external agent with Agent ID plus API key. The execution wallet submitted with each Gateway request is audited separately and does not need to match the owner wallet.</p></div>
                      </details>
                    </div>

                    <div className="space-y-4">
                      <IntegrationHealthPanel compact agent={selectedAgent} policy={selectedPolicy} logs={selectedLogs} apiOnline={apiOnline} emergencyPauses={selectedSnapshot.activePauses} />

                      <div className={`${CARD} p-4`}>
                        <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Recent Activity</div><div className="mt-1 text-xs text-[#94A3B8]">Latest decisions and execution state.</div></div><Btn variant="ghost" size="sm" onClick={() => setActiveTab("activity")}>View activity <ChevronRight size={13} /></Btn></div>
                        <div className="mt-3 divide-y divide-[#1E293B]">{agentAuditLogs.length === 0 ? <div className="py-5 text-center text-xs text-[#94A3B8]">No Gateway activity yet.</div> : agentAuditLogs.slice(0, 3).map((log) => <div key={log.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><DecisionBadge decision={log.decision} /><span className="truncate text-xs font-semibold text-[#F8FAFC]">{log.action}{log.amount > 0 ? ` · ${log.amount} ${auditAsset(log)}` : ""}</span></div><div className="mt-1 truncate text-[11px] text-[#64748B]">{fmtTs(log.timestamp)} · {executionProofStatus(log.executionStatus, log.executionTxHash).label}</div></div><ChevronRight size={14} className="shrink-0 text-[#64748B]" /></div>)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "setup" && (
                <div className="space-y-4">
                  <div className={`${CARD} p-4`}>
                    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Integration Readiness</div><div className="mt-1 text-xs text-[#94A3B8]">Complete these steps before the external agent requests execution.</div></div><Code2 size={18} className="text-[#22D3EE]" /></div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">{[
                      { label: "Agent registered", detail: selectedAgent.id, complete: true },
                      { label: "API credential active", detail: selectedSnapshot.hasCredential ? "Credential available" : "Rotate to issue a key", complete: selectedSnapshot.hasCredential && selectedAgent.status === "Active" },
                      { label: "Policy assigned", detail: selectedPolicy?.name || "No active policy", complete: Boolean(selectedPolicy) },
                      { label: "Gateway prerequisites ready", detail: apiOnline && selectedAgent.status === "Active" && selectedSnapshot.hasCredential && Boolean(selectedPolicy) ? "Ready for verification" : "Resolve missing prerequisite", complete: apiOnline && selectedAgent.status === "Active" && selectedSnapshot.hasCredential && Boolean(selectedPolicy) },
                      { label: "First intent received", detail: selectedLogs.length ? fmtTs(selectedLogs[0].timestamp) : "No intent observed", complete: selectedLogs.length > 0 },
                    ].map((item) => <div key={item.label} className="flex items-start gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-3">{item.complete ? <CheckCircle size={16} className="mt-0.5 shrink-0 text-[#22C55E]" /> : <Clock size={16} className="mt-0.5 shrink-0 text-[#F59E0B]" />}<div className="min-w-0"><div className="text-xs font-semibold text-[#F8FAFC]">{item.label}</div><div className="mt-1 break-all text-[11px] text-[#64748B]">{item.detail}</div></div></div>)}</div>
                    {!selectedPolicy && <div className="mt-3"><Btn variant="outline" size="sm" onClick={() => onNavigate("policies")}><FileText size={14} /> Configure Policy</Btn></div>}
                  </div>

                  <div className={`${CARD} p-4`}>
                    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">Connection Details</div><div className="mt-1 text-xs text-[#94A3B8]">Use the Agent ID and one-time API key from a secure server-side environment.</div></div><Server size={18} className="text-[#22D3EE]" /></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">{[["Agent ID", selectedAgent.id], ["API Key", rawKey || selectedAgent.apiKeyPreview || "Rotate key to issue"], ["Magen3 API Base URL", gatewayBaseUrl], ["Verify URL", `${gatewayVerifyUrl}?agentId=${selectedAgent.id}`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">{label}</span><button type="button" aria-label={`Copy ${label}`} className="text-[#22D3EE] hover:text-[#F8FAFC]" onClick={() => copyText(label, value)}><Copy size={13} /></button></div><div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>{label === "API Key" && !rawKey && selectedAgent.apiKeyPreview && <div className="mt-2 text-[11px] text-[#64748B]">Stored preview only. Rotate the key to generate a new full key.</div>}</div>)}</div>
                  </div>

                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#050B14] p-4">
                    <button type="button" onClick={() => setShowSkillKit((current) => !current)} className="flex w-full items-start justify-between gap-4 text-left"><div><div className="inline-flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]"><Code2 size={16} className="text-[#22D3EE]" /> Agent Skill Kit</div><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Export instructions for Claude, Codex, custom agents, environment configuration, or direct API integration.</p></div><span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#22D3EE]">{showSkillKit ? "Close" : "Open Skill Kit"}<ChevronDown size={14} className={showSkillKit ? "rotate-180" : ""} /></span></button>
                    {showSkillKit && <div className="mt-4 border-t border-[#1E293B] pt-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{(["Claude", "Codex", "Custom Agent", ".env", "API Snippet"] as const).map((target) => <button key={target} onClick={() => setSkillTarget(target)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${skillTarget === target ? "border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]" : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]"}`}>{target}</button>)}</div><div className="flex flex-wrap gap-2"><Btn variant="outline" size="sm" onClick={() => copyText("agent skill", selectedSkill)}><Copy size={14} /> {copied === "agent skill" ? "Copied" : `Copy ${skillTarget}`}</Btn><Btn variant="secondary" size="sm" onClick={() => downloadText(skillFilename, selectedSkill)}><FileText size={14} /> Download</Btn></div></div><div className="mt-4 grid gap-2 sm:grid-cols-3 text-xs"><div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Use in</div><div className="mt-1 text-[#F8FAFC]">{skillTarget === "Claude" ? "Claude Project / chat" : skillTarget === "Codex" ? "Codex SKILL.md" : skillTarget === "Custom Agent" ? "System instructions" : skillTarget === ".env" ? "Agent secrets" : "Agent source code"}</div></div><div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Policy</div><div className="mt-1 text-[#F8FAFC]">{selectedPolicy?.name || "Not assigned"}</div></div><div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Credential</div><div className="mt-1 text-[#F8FAFC]">{rawKey ? "Full one-time key included" : "Preview or placeholder only"}</div></div></div><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#020617] p-4 text-xs leading-relaxed text-[#94A3B8]"><code>{selectedSkill}</code></pre></div>}
                  </div>
                  {copied === "copy failed" && <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">Copy was blocked by the browser. Select the text and copy it manually.</div>}
                </div>
              )}

              {activeTab === "activity" && (
                <div className="space-y-3">
                  {agentAuditLogs.length === 0 ? <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center"><Activity size={28} className="mx-auto mb-3 text-[#94A3B8]" /><p className="text-sm text-[#94A3B8]">No Gateway activity for this agent yet.</p></div> : agentAuditLogs.map((log) => {
                    const proof = decisionProofStatus(log);
                    const execution = executionProofStatus(log.executionStatus, log.executionTxHash);
                    return <button type="button" key={log.id} onClick={() => { try { window.sessionStorage.setItem("magen3:audit-record-id", log.id); } catch {} onNavigate("audit-log"); }} className="w-full rounded-xl border border-[#1E293B] bg-[#050B14] p-4 text-left transition-colors hover:border-[#334155]"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><DecisionBadge decision={log.decision} /><span className="text-xs text-[#64748B]">{fmtTs(log.timestamp)}</span></div><div className="mt-2 truncate text-sm font-semibold text-[#F8FAFC]">{log.action}{log.amount > 0 ? ` · ${log.amount} ${auditAsset(log)}` : ""}</div><div className="mt-1 truncate text-xs text-[#94A3B8]">{log.target}</div></div><div className="flex flex-wrap gap-2 text-[10px]"><span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${proof.className}`}>Proof: {proof.label}</span><span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${execution.className}`}>Execution: {execution.label}</span></div></div></button>;
                  })}
                  <div className="flex justify-end border-t border-[#1E293B] pt-4"><Btn variant="secondary" size="sm" onClick={() => onNavigate("audit-log")}><Scroll size={14} /> View Complete Audit Log</Btn></div>
                </div>
              )}

              {activeTab === "access" && (
                <div className="space-y-4">
                  <div className={`${CARD} p-4`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-[#F8FAFC]">API Credential</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${selectedSnapshot.hasCredential && selectedAgent.status === "Active" ? "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{selectedSnapshot.hasCredential ? "Credential Active" : "Credential Missing"}</span></div><p className="mt-1 text-xs text-[#94A3B8]">Raw keys are shown once after registration or rotation. Magen3 displays only the stored preview later.</p><div className="mt-3 break-all font-mono text-xs text-[#F8FAFC]">{rawKey || selectedAgent.apiKeyPreview || "No active API key preview"}</div>{rawKey && <button type="button" onClick={() => copyText("raw api key", rawKey)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-1.5 text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]"><Copy size={13} /> {copied === "raw api key" ? "Copied" : "Copy Full API Key"}</button>}</div><Btn variant="secondary" size="sm" onClick={() => rotateKey(selectedAgent.id)} disabled={selectedAgent.status === "Revoked"}><Lock size={14} /> Rotate API Key</Btn></div>
                  </div>

                  <EmergencyControlsPanel pauses={emergencyPauses} agents={agents} policies={policies} walletAddress={walletAddress} selectedAgentId={selectedAgent.id} compact onCreatePause={onCreateEmergencyPause} onResumePause={onResumeEmergencyPause} />

                  <div className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/5 p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div><h3 className="text-sm font-semibold text-[#F8FAFC]">Revoke agent access</h3><p className="mt-1 text-xs text-[#94A3B8]">Immediately disables the Agent ID and API key. The registration remains visible and can still be reviewed.</p></div>
                        <Btn variant="danger" size="sm" onClick={() => revokeAgent(selectedAgent.id)} disabled={selectedAgent.status === "Revoked"}><XCircle size={14} /> {selectedAgent.status === "Revoked" ? "Agent Revoked" : "Revoke Agent"}</Btn>
                      </div>
                      <div className="border-t border-[#EF4444]/20 pt-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div><h3 className="text-sm font-semibold text-[#F8FAFC]">Permanently delete agent</h3><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Removes the agent registration, API credential and assigned policies. Historical Audit Logs, decisions, approvals, Gateway requests and Casper proof evidence remain available.</p></div>
                          <Btn variant="danger" size="sm" onClick={() => { setDeleteAgentTarget(selectedAgent); setDeleteConfirmation(""); setDeleteError(""); }}><Trash2 size={14} /> Delete Agent</Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                  {copied === "copy failed" && <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">Copy was blocked by the browser. Select the key text and copy it manually.</div>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteAgentTarget && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#020617]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-agent-title">
          <div className="w-full max-w-lg rounded-2xl border border-[#EF4444]/30 bg-[#0B1220] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><div className="inline-flex items-center gap-2 rounded-full border border-[#EF4444]/25 bg-[#EF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#FCA5A5]"><Trash2 size={13} /> Permanent deletion</div><h2 id="delete-agent-title" className="mt-3 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Delete {deleteAgentTarget.name}?</h2><p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">This removes the agent registration, API credential and {policies.filter((policy) => policy.agentId === deleteAgentTarget.id).length} assigned {policies.filter((policy) => policy.agentId === deleteAgentTarget.id).length === 1 ? "policy" : "policies"}. Historical security evidence remains read-only.</p></div>
              <button type="button" aria-label="Close delete agent dialog" className="rounded-lg border border-[#1E293B] p-2 text-[#94A3B8] hover:text-[#F8FAFC]" onClick={() => { setDeleteAgentTarget(null); setDeleteConfirmation(""); setDeleteError(""); }} disabled={deleteSubmitting}><X size={16} /></button>
            </div>

            {selectedDeleteBlockers.length > 0 && deleteAgentTarget.id === selectedAgent?.id && (
              <div className="mt-4 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#FCD34D]"><AlertTriangle size={15} /> Resolve these items first</div>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[#FDE68A]">{selectedDeleteBlockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
              <label htmlFor="delete-agent-confirmation" className="text-xs font-semibold text-[#F8FAFC]">Type <span className="font-mono text-[#FCA5A5]">{deleteAgentTarget.name}</span> to confirm</label>
              <input id="delete-agent-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border border-[#334155] bg-[#020617] px-3 py-2 text-sm text-[#F8FAFC] outline-none focus:border-[#EF4444]" autoComplete="off" disabled={deleteSubmitting} />
            </div>

            {deleteError && <div className="mt-3 rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">{deleteError}</div>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Btn variant="secondary" onClick={() => { setDeleteAgentTarget(null); setDeleteConfirmation(""); setDeleteError(""); }} disabled={deleteSubmitting}>Cancel</Btn>
              <Btn variant="danger" onClick={deleteAgent} disabled={deleteSubmitting || deleteConfirmation !== deleteAgentTarget.name || (deleteAgentTarget.id === selectedAgent?.id && selectedDeleteBlockers.length > 0)}><Trash2 size={15} /> {deleteSubmitting ? "Deleting…" : "Delete Permanently"}</Btn>
            </div>
          </div>
        </div>
      )}

      <AgentRegistrationWizard
        open={showRegister}
        initialMode={registrationMode}
        policies={policies}
        walletAddress={walletAddress}
        onClose={() => setShowRegister(false)}
        onNavigate={onNavigate}
        onRegisterAgent={onRegisterAgent}
        onCreatePolicy={onCreatePolicy}
        onSubmitGatewayIntent={onSubmitGatewayIntent}
        onCreated={(agent) => {
          setLatestCredentials(agent);
          setCredentialAcknowledged(false);
          setSelectedAgentId(agent.id);
          setActiveTab("overview");
        }}
      />
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// Policies Page
// ──────────────────────────────────────────────────────────



function ApprovalPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const organizationalEnabled = String(values.approvalOrganizationalQuorumEnabled ?? "No") === "Yes";
  const configuredWallets = String(values.approvalApproverWallets ?? "").split("\n").map((wallet) => wallet.trim()).filter(Boolean);
  const applyTeamQuorumPreset = () => {
    if (configuredWallets.length === 0) return;
    const required = Math.min(2, configuredWallets.length);
    onChange({
      approvalOrganizationalQuorumEnabled: "Yes",
      approvalWorkflowMode: required > 1 ? "Quorum" : "Single",
      approvalRequiredCount: String(required),
      approvalGroups: JSON.stringify([{ id: "approvers", name: "Authorized Approvers", role: "Approver", wallets: configuredWallets }], null, 2),
      approvalTiers: JSON.stringify([{ id: "standard", name: "Standard Approval", requiredGroups: [{ groupId: "approvers", approvals: required }], requiredApprovals: required }], null, 2),
      approvalOrganizationDefaults: "{}",
      approvalEscalationRules: "[]",
      approvalEmergencyGroupIds: "",
    });
  };
  const applyTreasurySecurityPreset = () => {
    if (configuredWallets.length < 4) return;
    const treasuryWallets = configuredWallets.slice(0, -2);
    const securityWallet = configuredWallets[configuredWallets.length - 2];
    const backupWallet = configuredWallets[configuredWallets.length - 1];
    const treasuryRequired = Math.min(2, treasuryWallets.length);
    onChange({
      approvalOrganizationalQuorumEnabled: "Yes",
      approvalWorkflowMode: "Quorum",
      approvalRequiredCount: "1",
      approvalGroups: JSON.stringify([
        { id: "treasury", name: "Treasury", role: "Treasury Approver", wallets: treasuryWallets, backupGroupIds: ["backup"] },
        { id: "security", name: "Security", role: "Security Approver", wallets: [securityWallet] },
        { id: "backup", name: "Backup Approvers", role: "Backup Treasury Approver", wallets: [backupWallet] },
      ], null, 2),
      approvalTiers: JSON.stringify([
        { id: "standard", name: "Standard Treasury", maxAmount: 999.999999, capabilities: ["Treasury Operations"], requiredGroups: [{ groupId: "treasury", approvals: 1 }], requiredApprovals: 1 },
        { id: "controlled", name: "Controlled Treasury", minAmount: 1000, maxAmount: 9999.999999, capabilities: ["Treasury Operations"], requiredGroups: [{ groupId: "treasury", approvals: treasuryRequired }], requiredApprovals: treasuryRequired },
        { id: "high-value", name: "High Value Treasury", minAmount: 10000, capabilities: ["Treasury Operations"], requiredGroups: [{ groupId: "treasury", approvals: treasuryRequired }, { groupId: "security", approvals: 1 }], requiredApprovals: treasuryRequired + 1, executionDelaySeconds: 1800, executionWindowSeconds: 900 },
      ], null, 2),
      approvalOrganizationDefaults: "{}",
      approvalEscalationRules: JSON.stringify([{ id: "activate-backup-after-15m", name: "Activate treasury backup", afterSeconds: 900, activateBackups: true }], null, 2),
      approvalEmergencyGroupIds: "security",
    });
  };
  return (
    <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Policy & Approval Controls · Review Resolution</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Choose how Review Required conditions are resolved. Autonomous remediation keeps routine agent workflows automated; Human Approval & Quorum remains available for explicit governance and exceptional risk.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Review Resolution Strategy" value={String(values.reviewResolutionMode ?? "Autonomous")} onChange={(value) => onChange({ reviewResolutionMode: value })} options={["Autonomous", "Balanced", "Human Governed"]} />
        <SelectField label="Enable Approval Workflow" value={String(values.approvalWorkflowEnabled ?? "")} onChange={(value) => onChange({ approvalWorkflowEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Workflow Mode" value={String(values.approvalWorkflowMode ?? "")} onChange={(value) => onChange({ approvalWorkflowMode: value })} options={["Single", "Quorum"]} />
        <InputField label="Required Approvals" value={String(values.approvalRequiredCount ?? "")} onChange={(value) => onChange({ approvalRequiredCount: value })} type="number" />
        <InputField label="Approval Expiry (minutes)" value={String(values.approvalExpiryMinutes ?? "")} onChange={(value) => onChange({ approvalExpiryMinutes: value })} type="number" />
        <SelectField label="Owner Wallet Fallback" value={String(values.approvalAllowOwnerFallback ?? "")} onChange={(value) => onChange({ approvalAllowOwnerFallback: value })} options={["Yes", "No"]} />
        <SelectField label="Separation of Duties" value={String(values.approvalSeparationOfDuties ?? "")} onChange={(value) => onChange({ approvalSeparationOfDuties: value })} options={["Yes", "No"]} />
        <SelectField label="Require Rejection Comment" value={String(values.approvalRequireRejectComment ?? "")} onChange={(value) => onChange({ approvalRequireRejectComment: value })} options={["Yes", "No"]} />
        <SelectField label="Require Casper Wallet Signature" value={String(values.requireCryptographicReviewerSignature ?? "Yes")} onChange={(value) => onChange({ requireCryptographicReviewerSignature: value })} options={["Yes", "No"]} />
        <InputField label="Signature Lifetime (sec)" value={String(values.approvalSignatureLifetimeSeconds ?? "300")} onChange={(value) => onChange({ approvalSignatureLifetimeSeconds: value })} type="number" />
        <SelectField label="Require Chain Binding" value={String(values.requireReviewerChainBinding ?? "Yes")} onChange={(value) => onChange({ requireReviewerChainBinding: value })} options={["Yes", "No"]} />
        <SelectField label="Require Domain Separation" value={String(values.requireApprovalDomainSeparation ?? "Yes")} onChange={(value) => onChange({ requireApprovalDomainSeparation: value })} options={["Yes", "No"]} />
        <InputField label="Reviewer Chain Name" value={String(values.approvalSignatureChainName ?? "casper-test")} onChange={(value) => onChange({ approvalSignatureChainName: value })} />
        <div className="md:col-span-2">
          <TextareaField label="Authorized Approver Wallets (one per line)" value={String(values.approvalApproverWallets ?? "")} onChange={(value) => onChange({ approvalApproverWallets: value })} />
        </div>
      </div>
      <details className="mt-4 rounded-xl border border-[#22D3EE]/20 bg-[#07131F] p-4" open={organizationalEnabled}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#F8FAFC]">Approval Escalation & Organizational Quorum</div>
              <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Resolve value-, capability-, action-, and contract-specific approval tiers; require named organizational groups; activate backups over time; and enforce execution delays and signing windows.</p>
            </div>
            <StatusBadge status="Live" />
          </div>
        </summary>
        <div className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Safe starter configurations</div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">Add authorized reviewer wallets above, then apply a deterministic preset and customize its JSON only where needed.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="secondary" size="sm" disabled={configuredWallets.length === 0} onClick={applyTeamQuorumPreset}>Team Quorum</Btn>
              <Btn variant="outline" size="sm" disabled={configuredWallets.length < 4} onClick={applyTreasurySecurityPreset}>Treasury + Security</Btn>
            </div>
          </div>
          {configuredWallets.length < 4 && <p className="mt-2 text-[11px] text-[#64748B]">Treasury + Security needs at least four authorized wallets: two treasury reviewers, one security reviewer, and one backup.</p>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SelectField label="Enable Organizational Quorum" value={String(values.approvalOrganizationalQuorumEnabled ?? "No")} onChange={(value) => onChange({ approvalOrganizationalQuorumEnabled: value })} options={["Yes", "No"]} />
          <InputField label="Default Execution Delay (sec)" value={String(values.approvalExecutionDelaySeconds ?? "0")} onChange={(value) => onChange({ approvalExecutionDelaySeconds: value })} type="number" />
          <InputField label="Default Execution Window (sec)" value={String(values.approvalExecutionWindowSeconds ?? "0")} onChange={(value) => onChange({ approvalExecutionWindowSeconds: value })} type="number" />
          <div className="md:col-span-3">
            <TextareaField label="Approver Groups (JSON)" value={String(values.approvalGroups ?? "[]")} onChange={(value) => onChange({ approvalGroups: value })} placeholder={`[\n  {\"id\":\"treasury\",\"name\":\"Treasury\",\"role\":\"Treasury Approver\",\"wallets\":[\"01...\"],\"backupGroupIds\":[\"backup\"]}\n]`} />
          </div>
          <div className="md:col-span-3">
            <TextareaField label="Approval Tiers (JSON)" value={String(values.approvalTiers ?? "[]")} onChange={(value) => onChange({ approvalTiers: value })} placeholder={`[\n  {\"id\":\"high-value\",\"name\":\"High Value\",\"minAmount\":1000,\"capabilities\":[\"Treasury Operations\"],\"requiredGroups\":[{\"groupId\":\"treasury\",\"approvals\":2},{\"groupId\":\"security\",\"approvals\":1}],\"requiredApprovals\":3,\"executionDelaySeconds\":1800,\"executionWindowSeconds\":900}\n]`} />
          </div>
          <div className="md:col-span-2">
            <TextareaField label="Timed Escalation Rules (JSON)" value={String(values.approvalEscalationRules ?? "[]")} onChange={(value) => onChange({ approvalEscalationRules: value })} placeholder={`[\n  {\"id\":\"backup-after-15m\",\"afterSeconds\":900,\"activateBackups\":true}\n]`} />
          </div>
          <TextareaField label="Emergency Group IDs (one per line)" value={String(values.approvalEmergencyGroupIds ?? "")} onChange={(value) => onChange({ approvalEmergencyGroupIds: value })} placeholder={"security\nemergency"} />
          <div className="md:col-span-3">
            <TextareaField label="Organization Defaults (JSON)" value={String(values.approvalOrganizationDefaults ?? "{}")} onChange={(value) => onChange({ approvalOrganizationDefaults: value })} placeholder={'{"requiredGroups":[{"groupId":"treasury","approvals":1}],"requiredApprovals":1}'} />
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Tier resolution is deterministic. A tier matches only when every configured amount, action, capability, and contract condition matches. Unknown groups or impossible quorum configurations become Configuration Required; Magen3 never silently weakens the rule.</p>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">When enabled, Magen3 issues a one-time, exact-bound challenge and Casper Wallet signs the response. Only verified signatures count toward quorum. Signature hashes and verification evidence are stored; private keys and raw transaction signatures never enter Magen3.</p>
    </div>
  );
}


function EmergencyControlsPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const enabled = String(values.emergencyControlsEnabled ?? "Yes") !== "No";
  const automaticEnabled = String(values.automaticPauseEnabled ?? "No") === "Yes";
  return (
    <div className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Policy & Approval Controls · Emergency Circuit Breaker</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Stop signing and execution through deterministic, scoped pauses. Manual pauses are available from Agent Details and Settings; optional automatic triggers create the same audited pause records.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Policy Controls" value={String(values.emergencyControlsEnabled ?? "Yes")} onChange={(value) => onChange({ emergencyControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Automatic Pause Triggers" value={String(values.automaticPauseEnabled ?? "No")} onChange={(value) => onChange({ automaticPauseEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Automatic Pause Decision" value={String(values.emergencyAutomaticPauseAction ?? "Blocked")} onChange={(value) => onChange({ emergencyAutomaticPauseAction: value })} options={["Blocked", "Review Required"]} />
        <InputField label="Default Pause Duration (sec)" value={String(values.emergencyPauseDurationSeconds ?? "3600")} onChange={(value) => onChange({ emergencyPauseDurationSeconds: value })} type="number" />
        <SelectField label="Resume Requires Approval" value={String(values.emergencyResumeRequiresApproval ?? "No")} onChange={(value) => onChange({ emergencyResumeRequiresApproval: value })} options={["Yes", "No"]} />
        <InputField label="Resume Quorum" value={String(values.emergencyResumeQuorum ?? "1")} onChange={(value) => onChange({ emergencyResumeQuorum: value })} type="number" />
      </div>
      {enabled && automaticEnabled && (
        <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Automatic trigger thresholds</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <InputField label="Repeated Blocks" value={String(values.emergencyRepeatedBlockThreshold ?? "5")} onChange={(value) => onChange({ emergencyRepeatedBlockThreshold: value })} type="number" />
            <InputField label="Replay Attempts" value={String(values.emergencyReplayAttemptThreshold ?? "1")} onChange={(value) => onChange({ emergencyReplayAttemptThreshold: value })} type="number" />
            <InputField label="Requests Per Window" value={String(values.emergencyRequestFrequencyThreshold ?? "120")} onChange={(value) => onChange({ emergencyRequestFrequencyThreshold: value })} type="number" />
            <InputField label="Lookback Window (sec)" value={String(values.emergencyLookbackSeconds ?? "3600")} onChange={(value) => onChange({ emergencyLookbackSeconds: value })} type="number" />
            <InputField label="Spending Spike Multiplier" value={String(values.emergencySpendingSpikeMultiplier ?? "5")} onChange={(value) => onChange({ emergencySpendingSpikeMultiplier: value })} type="number" />
            <InputField label="Provider Failures" value={String(values.emergencyProviderFailureThreshold ?? "3")} onChange={(value) => onChange({ emergencyProviderFailureThreshold: value })} type="number" />
            <InputField label="Unresolved Executions" value={String(values.emergencyUnresolvedExecutionThreshold ?? "5")} onChange={(value) => onChange({ emergencyUnresolvedExecutionThreshold: value })} type="number" />
            <InputField label="Unresolved x402" value={String(values.emergencyUnresolvedX402Threshold ?? "3")} onChange={(value) => onChange({ emergencyUnresolvedX402Threshold: value })} type="number" />
            <InputField label="Bridge Failures" value={String(values.emergencyBridgeFailureThreshold ?? "3")} onChange={(value) => onChange({ emergencyBridgeFailureThreshold: value })} type="number" />
            <SelectField label="Pause on Threat Match" value={String(values.emergencyPauseOnThreatMatch ?? "Yes")} onChange={(value) => onChange({ emergencyPauseOnThreatMatch: value })} options={["Yes", "No"]} />
            <SelectField label="Pause on Oracle Disagreement" value={String(values.emergencyPauseOnOracleDisagreement ?? "Yes")} onChange={(value) => onChange({ emergencyPauseOnOracleDisagreement: value })} options={["Yes", "No"]} />
            <SelectField label="Pause on Privileged Failure" value={String(values.emergencyPauseOnPrivilegedActionFailure ?? "Yes")} onChange={(value) => onChange({ emergencyPauseOnPrivilegedActionFailure: value })} options={["Yes", "No"]} />
          </div>
        </details>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Pause state is enforced before authorization and checked again before execution confirmation. Resume never bypasses audit history; approval-gated resumes remain bound to the exact pause.</p>
    </div>
  );
}

function ExecutionIntegrityPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Execution Integrity · Lifecycle & Replay</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bind each request to a unique intent ID, idempotency key, short validity window, deterministic fingerprint, and safe retry state before wallet signing.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.lifecycleControlsEnabled ?? "")} onChange={(value) => onChange({ lifecycleControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.lifecycleControlMode ?? "")} onChange={(value) => onChange({ lifecycleControlMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Metadata Unavailable" value={String(values.lifecycleUnavailableAction ?? "")} onChange={(value) => onChange({ lifecycleUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require Intent ID" value={String(values.lifecycleRequireIntentId ?? "")} onChange={(value) => onChange({ lifecycleRequireIntentId: value })} options={["Yes", "No"]} />
        <SelectField label="Require Idempotency Key" value={String(values.lifecycleRequireIdempotencyKey ?? "")} onChange={(value) => onChange({ lifecycleRequireIdempotencyKey: value })} options={["Yes", "No"]} />
        <SelectField label="Require Created At" value={String(values.lifecycleRequireCreatedAt ?? "")} onChange={(value) => onChange({ lifecycleRequireCreatedAt: value })} options={["Yes", "No"]} />
        <SelectField label="Require Expiry" value={String(values.lifecycleRequireExpiry ?? "")} onChange={(value) => onChange({ lifecycleRequireExpiry: value })} options={["Yes", "No"]} />
        <SelectField label="Require Sequence" value={String(values.lifecycleRequireSequence ?? "")} onChange={(value) => onChange({ lifecycleRequireSequence: value })} options={["Yes", "No"]} />
        <SelectField label="Prevent Duplicate Fingerprint" value={String(values.lifecyclePreventDuplicateFingerprint ?? "")} onChange={(value) => onChange({ lifecyclePreventDuplicateFingerprint: value })} options={["Yes", "No"]} />
        <SelectField label="Prevent Retry After Uncertain" value={String(values.lifecyclePreventRetryAfterUncertain ?? "")} onChange={(value) => onChange({ lifecyclePreventRetryAfterUncertain: value })} options={["Yes", "No"]} />
        <SelectField label="Prevent Parameter Mutation" value={String(values.lifecyclePreventParameterMutation ?? "")} onChange={(value) => onChange({ lifecyclePreventParameterMutation: value })} options={["Yes", "No"]} />
        <InputField label="Max Intent Age (sec)" value={String(values.lifecycleMaxIntentAgeSeconds ?? "")} onChange={(value) => onChange({ lifecycleMaxIntentAgeSeconds: value })} type="number" />
        <InputField label="Future Clock Skew (sec)" value={String(values.lifecycleMaxFutureSkewSeconds ?? "")} onChange={(value) => onChange({ lifecycleMaxFutureSkewSeconds: value })} type="number" />
        <InputField label="Max Lifetime (sec)" value={String(values.lifecycleMaxLifetimeSeconds ?? "")} onChange={(value) => onChange({ lifecycleMaxLifetimeSeconds: value })} type="number" />
        <InputField label="Replay Window (sec)" value={String(values.lifecycleReplayWindowSeconds ?? "")} onChange={(value) => onChange({ lifecycleReplayWindowSeconds: value })} type="number" />
        <InputField label="Maximum Retry Attempts" value={String(values.lifecycleMaxRetryAttempts ?? "")} onChange={(value) => onChange({ lifecycleMaxRetryAttempts: value })} type="number" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Legacy policies remain non-breaking. New policies enable strict lifecycle metadata by default; the server computes the canonical fingerprint and never accepts signing secrets.</p>
      <details className="mt-4 rounded-lg border border-[#22D3EE]/20 bg-[#050B14] p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#F8FAFC]">Execution Integrity · Reconciliation</div>
              <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Enforce transaction binding, submission attempts, pending and uncertain retry rules, replacement links, confirmation/finality, resource delivery, and refund state after authorization.</p>
            </div>
            <StatusBadge status="Foundation Available" />
          </div>
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SelectField label="Enable Reconciliation" value={String(values.reconciliationEnabled ?? "Yes")} onChange={(value) => onChange({ reconciliationEnabled: value })} options={["Yes", "No"]} />
          <InputField label="Maximum Submission Attempts" value={String(values.maximumSubmissionAttempts ?? "3")} onChange={(value) => onChange({ maximumSubmissionAttempts: value })} type="number" />
          <SelectField label="Retry While Pending" value={String(values.pendingRetryAction ?? "Block")} onChange={(value) => onChange({ pendingRetryAction: value })} options={["Block", "Review"]} />
          <SelectField label="Retry While Uncertain" value={String(values.uncertainRetryAction ?? "Block")} onChange={(value) => onChange({ uncertainRetryAction: value })} options={["Block", "Review"]} />
          <InputField label="Required Confirmations" value={String(values.requiredConfirmations ?? "1")} onChange={(value) => onChange({ requiredConfirmations: value })} type="number" />
          <InputField label="Finality Timeout (sec)" value={String(values.finalityTimeoutSeconds ?? "3600")} onChange={(value) => onChange({ finalityTimeoutSeconds: value })} type="number" />
          <SelectField label="Allow Replacement" value={String(values.replacementAllowed ?? "Yes")} onChange={(value) => onChange({ replacementAllowed: value })} options={["Yes", "No"]} />
          <SelectField label="Require Resource Delivery" value={String(values.resourceDeliveryRequired ?? "No")} onChange={(value) => onChange({ resourceDeliveryRequired: value })} options={["Yes", "No"]} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">This foundation validates authenticated reports and deterministic transitions. It is not marked Live until a real chain-specific transaction polling adapter independently verifies state end to end.</p>
      </details>
    </div>
  );
}

function InstructionIntegrityPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Agent Trust & Access · Instruction Integrity</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bind sensitive execution to a stable user goal, trusted source provenance, exact protected parameters, and contained tool permissions before wallet signing.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.instructionIntegrityEnabled ?? "")} onChange={(value) => onChange({ instructionIntegrityEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.instructionIntegrityMode ?? "")} onChange={(value) => onChange({ instructionIntegrityMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="External High-Risk Action" value={String(values.externalContentHighRiskAction ?? "")} onChange={(value) => onChange({ externalContentHighRiskAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require External Confirmation" value={String(values.requireUserConfirmationForExternalContent ?? "")} onChange={(value) => onChange({ requireUserConfirmationForExternalContent: value })} options={["Yes", "No"]} />
        <SelectField label="Allow Parameter Changes" value={String(values.allowParameterChangesAfterGoal ?? "")} onChange={(value) => onChange({ allowParameterChangesAfterGoal: value })} options={["Yes", "No"]} />
        <SelectField label="Require Change Reason" value={String(values.requireParameterChangeReason ?? "")} onChange={(value) => onChange({ requireParameterChangeReason: value })} options={["Yes", "No"]} />
        <TextareaField label="Goal-Bound Actions (one per line)" value={String(values.requireGoalBindingForActions ?? "")} onChange={(value) => onChange({ requireGoalBindingForActions: value })} />
        <TextareaField label="Allowed Source Domains" value={String(values.allowedSourceDomains ?? "")} onChange={(value) => onChange({ allowedSourceDomains: value })} />
        <TextareaField label="Blocked Source Domains" value={String(values.blockedSourceDomains ?? "")} onChange={(value) => onChange({ blockedSourceDomains: value })} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">The Gateway evaluates supplied provenance and deterministic hashes. This does not claim to detect every prompt-injection or semantic-manipulation attack, and private prompt contents are not required.</p>
    </div>
  );
}

function ToolMcpIntegrityPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Agent Trust & Access · Tool & MCP Integrity</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Approve exact MCP servers and tools, then bind versions, manifests, schemas, descriptions, TLS, origins, credential scope, and least-privilege permissions before execution.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.toolIntegrityEnabled ?? "")} onChange={(value) => onChange({ toolIntegrityEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.toolIntegrityMode ?? "")} onChange={(value) => onChange({ toolIntegrityMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Tool / Server" value={String(values.unknownToolAction ?? "")} onChange={(value) => onChange({ unknownToolAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Permission Expansion" value={String(values.permissionExpansionAction ?? "")} onChange={(value) => onChange({ permissionExpansionAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require Manifest Hash" value={String(values.requireManifestHash ?? "")} onChange={(value) => onChange({ requireManifestHash: value })} options={["Yes", "No"]} />
        <SelectField label="Require Schema Hash" value={String(values.requireSchemaHash ?? "")} onChange={(value) => onChange({ requireSchemaHash: value })} options={["Yes", "No"]} />
        <SelectField label="Require TLS" value={String(values.requireTls ?? "")} onChange={(value) => onChange({ requireTls: value })} options={["Yes", "No"]} />
        <SelectField label="Allow Version Changes" value={String(values.allowToolVersionChanges ?? "")} onChange={(value) => onChange({ allowToolVersionChanges: value })} options={["Yes", "No"]} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3" open>
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Approved server and tool bindings</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextareaField label="Approved MCP Servers" value={String(values.approvedMcpServers ?? "")} onChange={(value) => onChange({ approvedMcpServers: value })} />
          <TextareaField label="Approved Tools" value={String(values.approvedTools ?? "")} onChange={(value) => onChange({ approvedTools: value })} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#64748B]">Server format: <code>server-id|https://server.example|manifestSha256</code>. Tool format: <code>server-id|tool.name|version|manifestHash|schemaHash|descriptionHash|scope1,scope2|credential-scope|origin</code>.</p>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Magen3 verifies supplied identity and hashes but does not certify arbitrary tool code. Never submit MCP credentials, private keys, wallet signatures, or secret tool output.</p>
    </div>
  );
}

function DelegationSafetyPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#14B8A6]/20 bg-[#14B8A6]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Agent Trust & Access · Delegation & Session Key Safety</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Verify Casper-signed, short-lived delegated authority and enforce exact network, contract, method, asset, amount, frequency, lifetime, depth, and revocation scopes.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.delegationControlsEnabled ?? "")} onChange={(value) => onChange({ delegationControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.delegationMode ?? "")} onChange={(value) => onChange({ delegationMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Delegate" value={String(values.unknownDelegateAction ?? "")} onChange={(value) => onChange({ unknownDelegateAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Unavailable Attestation" value={String(values.delegationUnavailableAction ?? "")} onChange={(value) => onChange({ delegationUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require Expiry" value={String(values.requireExpiringDelegation ?? "")} onChange={(value) => onChange({ requireExpiringDelegation: value })} options={["Yes", "No"]} />
        <InputField label="Maximum Lifetime (sec)" value={String(values.maximumDelegationLifetime ?? "")} onChange={(value) => onChange({ maximumDelegationLifetime: value })} type="number" />
        <InputField label="Maximum Delegation Depth" value={String(values.maximumDelegationDepth ?? "")} onChange={(value) => onChange({ maximumDelegationDepth: value })} type="number" />
        <SelectField label="Allow Redelegation" value={String(values.allowRedelegation ?? "")} onChange={(value) => onChange({ allowRedelegation: value })} options={["Yes", "No"]} />
        <SelectField label="Require Scope Binding" value={String(values.requireScopeBinding ?? "")} onChange={(value) => onChange({ requireScopeBinding: value })} options={["Yes", "No"]} />
        <SelectField label="Require Casper Attestation" value={String(values.requireCryptographicDelegationAttestation ?? "")} onChange={(value) => onChange({ requireCryptographicDelegationAttestation: value })} options={["Yes", "No"]} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Delegate approval and revocation lists</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <TextareaField label="Approved Delegates (one per line)" value={String(values.approvedDelegates ?? "")} onChange={(value) => onChange({ approvedDelegates: value })} />
          <TextareaField label="Blocked Delegates (one per line)" value={String(values.blockedDelegates ?? "")} onChange={(value) => onChange({ blockedDelegates: value })} />
          <TextareaField label="Revoked Delegation IDs" value={String(values.revokedDelegationIds ?? "")} onChange={(value) => onChange({ revokedDelegationIds: value })} />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Raw delegation signatures are used transiently for verification and are never stored in Audit Logs. External wallet or smart-account revocation must be supplied through a trusted adapter or policy update.</p>
    </div>
  );
}

function RpcChainIntegrityPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Execution Integrity · RPC & Chain Integrity</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bind authorization to approved RPC providers, the expected chain identity, fresh synchronized blocks, multi-provider agreement, and auditable failover evidence.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.rpcIntegrityEnabled ?? "")} onChange={(value) => onChange({ rpcIntegrityEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.rpcIntegrityMode ?? "")} onChange={(value) => onChange({ rpcIntegrityMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Provider Disagreement" value={String(values.rpcIntegrityDisagreementAction ?? "")} onChange={(value) => onChange({ rpcIntegrityDisagreementAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Evidence Unavailable" value={String(values.rpcIntegrityUnavailableAction ?? "")} onChange={(value) => onChange({ rpcIntegrityUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require TLS" value={String(values.rpcIntegrityRequireTls ?? "")} onChange={(value) => onChange({ rpcIntegrityRequireTls: value })} options={["Yes", "No"]} />
        <SelectField label="Require Network Identity" value={String(values.rpcIntegrityRequireNetworkIdentity ?? "")} onChange={(value) => onChange({ rpcIntegrityRequireNetworkIdentity: value })} options={["Yes", "No"]} />
        <SelectField label="Allow Automatic Failover" value={String(values.rpcIntegrityAllowAutomaticFailover ?? "")} onChange={(value) => onChange({ rpcIntegrityAllowAutomaticFailover: value })} options={["Yes", "No"]} />
        <InputField label="Maximum Block Age (sec)" value={String(values.rpcIntegrityMaximumBlockAgeSeconds ?? "")} onChange={(value) => onChange({ rpcIntegrityMaximumBlockAgeSeconds: value })} type="number" />
        <InputField label="Minimum RPC Providers" value={String(values.rpcIntegrityMinimumProviders ?? "")} onChange={(value) => onChange({ rpcIntegrityMinimumProviders: value })} type="number" />
        <InputField label="Maximum Height Difference" value={String(values.rpcIntegrityMaximumHeightDifference ?? "")} onChange={(value) => onChange({ rpcIntegrityMaximumHeightDifference: value })} type="number" />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3" open>
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Approved provider bindings</summary>
        <div className="mt-3">
          <TextareaField label="Approved RPC Endpoints" value={String(values.approvedRpcEndpoints ?? "")} onChange={(value) => onChange({ approvedRpcEndpoints: value })} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#64748B]">One per line: <code>https://rpc.example/rpc|provider-id|chain-name|network-id|optional-genesis-hash</code>. Provider credentials must never be entered here.</p>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">The deterministic evaluator is implemented. The control remains Foundation Available until deployed trusted adapters collect and verify real provider observations end to end.</p>
    </div>
  );
}

function GasSponsorshipFeeSafetyPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Execution Integrity · Gas Sponsorship & Fee Safety</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bound network fees, relayers, EVM Paymasters, sponsorship expiry and scope, payer identity, rolling budgets, operation counts, and repeated failure thresholds before signing.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.feeSafetyEnabled ?? "")} onChange={(value) => onChange({ feeSafetyEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.feeSafetyMode ?? "")} onChange={(value) => onChange({ feeSafetyMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Sponsorship Unavailable" value={String(values.feeSafetySponsorshipUnavailableAction ?? "")} onChange={(value) => onChange({ feeSafetySponsorshipUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <InputField label="Maximum Network Fee" value={String(values.feeSafetyMaximumNetworkFee ?? "")} onChange={(value) => onChange({ feeSafetyMaximumNetworkFee: value })} type="number" />
        <InputField label="Maximum EVM Gas Price" value={String(values.feeSafetyMaximumGasPrice ?? "")} onChange={(value) => onChange({ feeSafetyMaximumGasPrice: value })} type="number" />
        <InputField label="Maximum EVM Priority Fee" value={String(values.feeSafetyMaximumPriorityFee ?? "")} onChange={(value) => onChange({ feeSafetyMaximumPriorityFee: value })} type="number" />
        <InputField label="Rolling Sponsored Budget" value={String(values.feeSafetySponsoredBudget ?? "")} onChange={(value) => onChange({ feeSafetySponsoredBudget: value })} type="number" />
        <InputField label="Maximum Sponsored Operations" value={String(values.feeSafetyMaximumSponsoredOperations ?? "")} onChange={(value) => onChange({ feeSafetyMaximumSponsoredOperations: value })} type="number" />
        <InputField label="Maximum Failed Sponsored Operations" value={String(values.feeSafetyMaximumFailedSponsoredOperations ?? "")} onChange={(value) => onChange({ feeSafetyMaximumFailedSponsoredOperations: value })} type="number" />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Sponsor, Paymaster, expiry, and evidence controls</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <TextareaField label="Approved Sponsors / Relayers" value={String(values.feeSafetyApprovedSponsors ?? "")} onChange={(value) => onChange({ feeSafetyApprovedSponsors: value })} />
          <TextareaField label="Approved EVM Paymasters" value={String(values.feeSafetyApprovedPaymasters ?? "")} onChange={(value) => onChange({ feeSafetyApprovedPaymasters: value })} />
          <InputField label="Rolling Window (sec)" value={String(values.feeSafetyLookbackSeconds ?? "")} onChange={(value) => onChange({ feeSafetyLookbackSeconds: value })} type="number" />
          <SelectField label="Require Sponsorship Expiry" value={String(values.feeSafetyRequireSponsorshipExpiry ?? "")} onChange={(value) => onChange({ feeSafetyRequireSponsorshipExpiry: value })} options={["Yes", "No"]} />
          <SelectField label="Require Sponsor Evidence Hash" value={String(values.feeSafetyRequireSponsorEvidence ?? "")} onChange={(value) => onChange({ feeSafetyRequireSponsorEvidence: value })} options={["Yes", "No"]} />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Casper relayer evidence and EVM Paymaster fields remain isolated. Never submit sponsor credentials, raw signatures, private keys, signed transactions, or Paymaster secrets.</p>
    </div>
  );
}

function TokenPermissionPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Contract & Permission Safety · Token Permissions</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Constrain approvals, permits, NFT operators, batch authority, and delegated spenders before signing. Permit identity and protected parameters are fingerprinted for replay prevention.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.tokenPermissionControlsEnabled ?? "")} onChange={(value) => onChange({ tokenPermissionControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.tokenPermissionMode ?? "")} onChange={(value) => onChange({ tokenPermissionMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Spender" value={String(values.tokenPermissionUnknownSpenderAction ?? "")} onChange={(value) => onChange({ tokenPermissionUnknownSpenderAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Unlimited Approval" value={String(values.tokenPermissionUnlimitedApprovalAction ?? "")} onChange={(value) => onChange({ tokenPermissionUnlimitedApprovalAction: value })} options={["Warn", "Review", "Block"]} />
        <InputField label="Maximum Approval Amount" value={String(values.tokenPermissionMaxApprovalAmount ?? "")} onChange={(value) => onChange({ tokenPermissionMaxApprovalAmount: value })} type="number" />
        <InputField label="Max Approval / Transaction Ratio" value={String(values.tokenPermissionMaxApprovalToTransactionRatio ?? "")} onChange={(value) => onChange({ tokenPermissionMaxApprovalToTransactionRatio: value })} type="number" />
        <TextareaField label="Approved Spenders (one per line)" value={String(values.tokenPermissionApprovedSpenders ?? "")} onChange={(value) => onChange({ tokenPermissionApprovedSpenders: value })} />
        <TextareaField label="Blocked Spenders (one per line)" value={String(values.tokenPermissionBlockedSpenders ?? "")} onChange={(value) => onChange({ tokenPermissionBlockedSpenders: value })} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Advanced permit, NFT, batch, and reset controls</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <InputField label="Maximum Permit Lifetime (sec)" value={String(values.tokenPermissionMaxLifetimeSeconds ?? "")} onChange={(value) => onChange({ tokenPermissionMaxLifetimeSeconds: value })} type="number" />
          <SelectField label="Require Permit Expiry" value={String(values.tokenPermissionRequireExpiry ?? "")} onChange={(value) => onChange({ tokenPermissionRequireExpiry: value })} options={["Yes", "No"]} />
          <SelectField label="Require Permit Nonce" value={String(values.tokenPermissionRequireNonce ?? "")} onChange={(value) => onChange({ tokenPermissionRequireNonce: value })} options={["Yes", "No"]} />
          <SelectField label="Require Chain Binding" value={String(values.tokenPermissionRequireChainBinding ?? "")} onChange={(value) => onChange({ tokenPermissionRequireChainBinding: value })} options={["Yes", "No"]} />
          <SelectField label="Require Allowance Reset" value={String(values.tokenPermissionRequireAllowanceReset ?? "")} onChange={(value) => onChange({ tokenPermissionRequireAllowanceReset: value })} options={["Yes", "No"]} />
          <SelectField label="Allow NFT Operator Approval" value={String(values.tokenPermissionAllowNftOperatorApproval ?? "")} onChange={(value) => onChange({ tokenPermissionAllowNftOperatorApproval: value })} options={["Yes", "No"]} />
          <SelectField label="Allow Batch Approval" value={String(values.tokenPermissionAllowBatchApproval ?? "")} onChange={(value) => onChange({ tokenPermissionAllowBatchApproval: value })} options={["Yes", "No"]} />
          <InputField label="Maximum Batch Size" value={String(values.tokenPermissionMaximumBatchSize ?? "")} onChange={(value) => onChange({ tokenPermissionMaximumBatchSize: value })} type="number" />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Only explicit token-permission metadata activates this control. Generic contract calls remain compatible. Never send permit signatures or wallet secrets to the Gateway.</p>
    </div>
  );
}

function PrivilegedActionPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Contract & Permission Safety · Privileged Actions</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Classify supported administrative calls and bind upgrades, ownership, roles, minting, pausing, treasury withdrawals, oracle changes, and permission changes to deterministic policy and Human Approval.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.privilegedActionControlsEnabled ?? "")} onChange={(value) => onChange({ privilegedActionControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.privilegedActionMode ?? "")} onChange={(value) => onChange({ privilegedActionMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Privileged Action" value={String(values.unknownPrivilegedAction ?? "")} onChange={(value) => onChange({ unknownPrivilegedAction: value })} options={["Warn", "Review", "Block"]} />
        <TextareaField label="Actions Requiring Review" value={String(values.privilegedActionsRequiringReview ?? "")} onChange={(value) => onChange({ privilegedActionsRequiringReview: value })} />
        <TextareaField label="Blocked Privileged Actions" value={String(values.privilegedActionsBlocked ?? "")} onChange={(value) => onChange({ privilegedActionsBlocked: value })} />
        <TextareaField label="Approved Administrators" value={String(values.approvedAdministrators ?? "")} onChange={(value) => onChange({ approvedAdministrators: value })} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Advanced implementation and quorum rules</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextareaField label="Approved Implementations" value={String(values.approvedImplementations ?? "")} onChange={(value) => onChange({ approvedImplementations: value })} />
          <TextareaField label="Per-action Quorum (Action=Count)" value={String(values.privilegedActionQuorumRules ?? "")} onChange={(value) => onChange({ privilegedActionQuorumRules: value })} />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Only explicit metadata or entry points in Magen3's supported deterministic map are classified. Unknown calls follow policy; generic contract calls are not mislabeled as privileged.</p>
    </div>
  );
}

function ContractUpgradePolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Contract & Permission Safety · Contract Upgrades</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bind the current and proposed implementation, authorized upgrade administrator, code hash, delay, and exact Human Approval quorum before wallet signing.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.contractUpgradeControlsEnabled ?? "")} onChange={(value) => onChange({ contractUpgradeControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.contractUpgradeMode ?? "")} onChange={(value) => onChange({ contractUpgradeMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Implementation" value={String(values.contractUpgradeUnknownImplementationAction ?? "")} onChange={(value) => onChange({ contractUpgradeUnknownImplementationAction: value })} options={["Warn", "Review", "Block"]} />
        <TextareaField label="Approved Implementations" value={String(values.contractUpgradeApprovedImplementations ?? "")} onChange={(value) => onChange({ contractUpgradeApprovedImplementations: value })} />
        <TextareaField label="Blocked Implementations" value={String(values.contractUpgradeBlockedImplementations ?? "")} onChange={(value) => onChange({ contractUpgradeBlockedImplementations: value })} />
        <TextareaField label="Approved Upgrade Administrators" value={String(values.contractUpgradeApprovedAdministrators ?? "")} onChange={(value) => onChange({ contractUpgradeApprovedAdministrators: value })} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Advanced approval and delay controls</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SelectField label="Require Human Approval" value={String(values.contractUpgradeRequiresApproval ?? "")} onChange={(value) => onChange({ contractUpgradeRequiresApproval: value })} options={["Yes", "No"]} />
          <InputField label="Required Quorum" value={String(values.contractUpgradeQuorum ?? "")} onChange={(value) => onChange({ contractUpgradeQuorum: value })} type="number" />
          <InputField label="Upgrade Delay (seconds)" value={String(values.contractUpgradeDelaySeconds ?? "")} onChange={(value) => onChange({ contractUpgradeDelaySeconds: value })} type="number" />
          <SelectField label="Require Code Hash" value={String(values.contractUpgradeRequireCodeHash ?? "")} onChange={(value) => onChange({ contractUpgradeRequireCodeHash: value })} options={["Yes", "No"]} />
          <SelectField label="Require Upgrade Administrator" value={String(values.contractUpgradeRequireAdministrator ?? "")} onChange={(value) => onChange({ contractUpgradeRequireAdministrator: value })} options={["Yes", "No"]} />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">This control reuses Privileged Action classification, exact approval binding, organizational quorum, and Audit Logs. It evaluates unsigned metadata only and never receives upgrade signatures or private keys.</p>
    </div>
  );
}

function ContractArgumentPolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Contract & Permission Safety · Contract Arguments</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Apply deterministic rules to the exact runtime arguments used by a specific contract and entry point before wallet signing.</p>
        </div>
        <StatusBadge status="Live" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.contractArgumentControlsEnabled ?? "")} onChange={(value) => onChange({ contractArgumentControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.contractArgumentMode ?? "")} onChange={(value) => onChange({ contractArgumentMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="No Matching Rule" value={String(values.contractArgumentUnknownRuleAction ?? "")} onChange={(value) => onChange({ contractArgumentUnknownRuleAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Unknown Argument" value={String(values.contractArgumentUnknownArgumentAction ?? "")} onChange={(value) => onChange({ contractArgumentUnknownArgumentAction: value })} options={["Warn", "Review", "Block"]} />
      </div>
      <details className="mt-4 rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Exact contract and entry-point rules</summary>
        <div className="mt-3">
          <TextareaField
            label="Contract Argument Rules (JSON array)"
            value={String(values.contractArgumentRules ?? "[]")}
            onChange={(value) => onChange({ contractArgumentRules: value })}
            placeholder={'[{"id":"transfer-safe","contract":"contract-...","entryPoint":"transfer","requiredArgs":["recipient","amount"],"allowedArgs":["recipient","amount"],"argumentTypes":{"recipient":"address","amount":"integer"},"numericLimits":{"amount":{"min":1,"max":100}},"addressRules":{"recipient":{"allowed":["01..."]}}}]'}
          />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Rules support required and allowed names, argumentTypes, numericLimits, addressRules, booleanRules, enumRules, and per-rule unknownArgumentAction. The complete runtimeArgs object is fingerprinted and remains covered by exact Human Approval binding.</p>
    </div>
  );
}

function X402PolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">x402 Payment Controls Foundation</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bind an HTTP 402 payment to the exact resource, merchant, recipient, network, token, amount, expiry, and request fingerprint before PAYMENT-SIGNATURE creation. Settlement is reconciled separately after payment.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.x402ControlsEnabled ?? "")} onChange={(value) => onChange({ x402ControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.x402ControlMode ?? "")} onChange={(value) => onChange({ x402ControlMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Metadata Unavailable" value={String(values.x402UnavailableAction ?? "")} onChange={(value) => onChange({ x402UnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <TextareaField label="Allowed Protocol Versions" value={String(values.x402AllowedVersions ?? "")} onChange={(value) => onChange({ x402AllowedVersions: value })} />
        <TextareaField label="Allowed Schemes" value={String(values.x402AllowedSchemes ?? "")} onChange={(value) => onChange({ x402AllowedSchemes: value })} />
        <TextareaField label="Allowed HTTP Methods" value={String(values.x402AllowedMethods ?? "")} onChange={(value) => onChange({ x402AllowedMethods: value })} />
        <TextareaField label="Approved Merchant Domains" value={String(values.x402AllowedMerchants ?? "")} onChange={(value) => onChange({ x402AllowedMerchants: value })} />
        <TextareaField label="Blocked Merchant Domains" value={String(values.x402BlockedMerchants ?? "")} onChange={(value) => onChange({ x402BlockedMerchants: value })} />
        <TextareaField label="Approved Recipients" value={String(values.x402AllowedRecipients ?? "")} onChange={(value) => onChange({ x402AllowedRecipients: value })} />
        <TextareaField label="Approved CAIP-2 Networks" value={String(values.x402AllowedNetworks ?? "")} onChange={(value) => onChange({ x402AllowedNetworks: value })} />
        <TextareaField label="Approved Payment Assets" value={String(values.x402AllowedAssets ?? "")} onChange={(value) => onChange({ x402AllowedAssets: value })} />
        <TextareaField label="Asset Decimals (ASSET=decimals)" value={String(values.x402AssetDecimals ?? "")} onChange={(value) => onChange({ x402AssetDecimals: value })} />
        <TextareaField label="Approved Facilitators" value={String(values.x402AllowedFacilitators ?? "")} onChange={(value) => onChange({ x402AllowedFacilitators: value })} />
        <InputField label="Maximum Payment" value={String(values.x402MaxPayment ?? "")} onChange={(value) => onChange({ x402MaxPayment: value })} type="number" />
        <InputField label="Daily x402 Limit" value={String(values.x402DailyLimit ?? "")} onChange={(value) => onChange({ x402DailyLimit: value })} type="number" />
        <InputField label="Monthly x402 Limit" value={String(values.x402MonthlyLimit ?? "")} onChange={(value) => onChange({ x402MonthlyLimit: value })} type="number" />
        <InputField label="Review Threshold" value={String(values.x402ReviewThreshold ?? "")} onChange={(value) => onChange({ x402ReviewThreshold: value })} type="number" />
        <InputField label="Maximum Payments / Hour" value={String(values.x402MaxPaymentsPerHour ?? "")} onChange={(value) => onChange({ x402MaxPaymentsPerHour: value })} type="number" />
        <InputField label="Max Authorization Lifetime (sec)" value={String(values.x402MaxAuthorizationLifetimeSeconds ?? "")} onChange={(value) => onChange({ x402MaxAuthorizationLifetimeSeconds: value })} type="number" />
        <SelectField label="Require HTTPS" value={String(values.x402RequireHttps ?? "")} onChange={(value) => onChange({ x402RequireHttps: value })} options={["Yes", "No"]} />
        <SelectField label="Require PAYMENT-REQUIRED Hash" value={String(values.x402RequirePaymentRequiredHash ?? "")} onChange={(value) => onChange({ x402RequirePaymentRequiredHash: value })} options={["Yes", "No"]} />
        <SelectField label="Bind Unsafe Request Bodies" value={String(values.x402RequireBodyHashForUnsafeMethods ?? "")} onChange={(value) => onChange({ x402RequireBodyHashForUnsafeMethods: value })} options={["Yes", "No"]} />
        <SelectField label="Require Unique Request ID" value={String(values.x402RequireRequestId ?? "")} onChange={(value) => onChange({ x402RequireRequestId: value })} options={["Yes", "No"]} />
        <SelectField label="Require Client Fingerprint" value={String(values.x402RequireClientFingerprint ?? "")} onChange={(value) => onChange({ x402RequireClientFingerprint: value })} options={["Yes", "No"]} />
        <SelectField label="Prevent Ambiguous Retry" value={String(values.x402PreventAmbiguousRetry ?? "")} onChange={(value) => onChange({ x402PreventAmbiguousRetry: value })} options={["Yes", "No"]} />
        <InputField label="Maximum Settlement Attempts" value={String(values.x402MaxSettlementAttempts ?? "")} onChange={(value) => onChange({ x402MaxSettlementAttempts: value })} type="number" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">The exact scheme is supported first. Magen3 never receives PAYMENT-SIGNATURE, signed payment payloads, private keys, mnemonics, or wallet approvals.</p>
    </div>
  );
}

function CompliancePolicyFields({
  values,
  onChange,
}: {
  values: Record<string, unknown>;
  onChange: (patch: Record<string, string>) => void;
}) {
  return (
    <div className="rounded-xl border border-[#34D399]/20 bg-[#34D399]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Compliance Controls Foundation</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Evaluate non-sensitive attestation statuses, opaque Travel Rule references, jurisdiction and counterparty policy, screening evidence, and exact configured matches. Do not submit names, identity documents, or other personal data.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.complianceControlsEnabled ?? "")} onChange={(value) => onChange({ complianceControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Violation Handling" value={String(values.complianceControlMode ?? "")} onChange={(value) => onChange({ complianceControlMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Evidence Unavailable" value={String(values.complianceUnavailableAction ?? "")} onChange={(value) => onChange({ complianceUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require Originator Attestation" value={String(values.complianceRequireOriginatorAttestation ?? "")} onChange={(value) => onChange({ complianceRequireOriginatorAttestation: value })} options={["Yes", "No"]} />
        <SelectField label="Require Beneficiary Attestation" value={String(values.complianceRequireBeneficiaryAttestation ?? "")} onChange={(value) => onChange({ complianceRequireBeneficiaryAttestation: value })} options={["Yes", "No"]} />
        <SelectField label="Require Travel Rule Evidence" value={String(values.complianceRequireTravelRule ?? "")} onChange={(value) => onChange({ complianceRequireTravelRule: value })} options={["Yes", "No"]} />
        <InputField label="Travel Rule Threshold" value={String(values.complianceTravelRuleThreshold ?? "")} onChange={(value) => onChange({ complianceTravelRuleThreshold: value })} type="number" />
        <SelectField label="Require Screening Evidence" value={String(values.complianceRequireSanctionsScreening ?? "")} onChange={(value) => onChange({ complianceRequireSanctionsScreening: value })} options={["Yes", "No"]} />
        <SelectField label="Maximum Risk Rating" value={String(values.complianceMaximumRiskRating ?? "")} onChange={(value) => onChange({ complianceMaximumRiskRating: value })} options={["Low", "Medium", "High", "Critical"]} />
        <InputField label="Max Attestation Age (sec)" value={String(values.complianceMaxAttestationAgeSeconds ?? "")} onChange={(value) => onChange({ complianceMaxAttestationAgeSeconds: value })} type="number" />
        <InputField label="Max Screening Age (sec)" value={String(values.complianceMaxScreeningAgeSeconds ?? "")} onChange={(value) => onChange({ complianceMaxScreeningAgeSeconds: value })} type="number" />
        <TextareaField label="Required Actions" value={String(values.complianceRequiredActions ?? "")} onChange={(value) => onChange({ complianceRequiredActions: value })} />
        <TextareaField label="Allowed Jurisdictions" value={String(values.complianceAllowedJurisdictions ?? "")} onChange={(value) => onChange({ complianceAllowedJurisdictions: value })} />
        <TextareaField label="Review Jurisdictions" value={String(values.complianceReviewJurisdictions ?? "")} onChange={(value) => onChange({ complianceReviewJurisdictions: value })} />
        <TextareaField label="Blocked Jurisdictions" value={String(values.complianceBlockedJurisdictions ?? "")} onChange={(value) => onChange({ complianceBlockedJurisdictions: value })} />
        <TextareaField label="Allowed Counterparty Types" value={String(values.complianceAllowedCounterpartyTypes ?? "")} onChange={(value) => onChange({ complianceAllowedCounterpartyTypes: value })} />
        <TextareaField label="Accepted Evidence Providers" value={String(values.complianceAcceptedProviders ?? "")} onChange={(value) => onChange({ complianceAcceptedProviders: value })} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">This configuration provides deterministic execution controls and audit evidence. It does not determine legal obligations or guarantee compliance.</p>
    </div>
  );
}

function PoliciesPage({
  agents,
  policies,
  onCreatePolicy,
  onUpdatePolicy,
  walletAddress,
  approvals,
  onRespondApproval,
  onNavigate,
}: {
  agents: Agent[];
  policies: Policy[];
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onUpdatePolicy: (id: string, policy: Partial<Policy>) => Promise<void> | void;
  walletAddress: string;
  approvals: ApprovalRequest[];
  onRespondApproval: (id: string, response: "Approve" | "Reject", comment?: string) => Promise<ApprovalRequest>;
  onNavigate: (page: Page) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    agentId: agents[0]?.id || "",
    maxTransaction: "",
    dailyLimit: "",
    approvalThreshold: "",
    limitBasis: typeof window !== "undefined" ? (localStorage.getItem("magen3.defaultLimitUnit") || "Fiat Value") : "Fiat Value",
    referenceCurrency: typeof window !== "undefined" ? (localStorage.getItem("magen3.referenceCurrency") || "USD") : "USD",
    hourlyLimit: "",
    perDestinationLimit: "",
    walletPercentageLimit: "",
    emergencyControlsEnabled: "Yes",
    automaticPauseEnabled: "No",
    emergencyAutomaticPauseAction: "Blocked",
    emergencyRepeatedBlockThreshold: "5",
    emergencyReplayAttemptThreshold: "1",
    emergencyRequestFrequencyThreshold: "120",
    emergencyLookbackSeconds: "3600",
    emergencySpendingSpikeMultiplier: "5",
    emergencyProviderFailureThreshold: "3",
    emergencyUnresolvedExecutionThreshold: "5",
    emergencyUnresolvedX402Threshold: "3",
    emergencyBridgeFailureThreshold: "3",
    emergencyPauseDurationSeconds: "3600",
    emergencyResumeRequiresApproval: "No",
    emergencyResumeQuorum: "1",
    emergencyPauseOnThreatMatch: "Yes",
    emergencyPauseOnOracleDisagreement: "Yes",
    emergencyPauseOnPrivilegedActionFailure: "Yes",
    reviewResolutionMode: "Autonomous",
    approvalWorkflowEnabled: "Yes",
    approvalWorkflowMode: "Single",
    approvalRequiredCount: "1",
    approvalExpiryMinutes: "60",
    approvalAllowOwnerFallback: "Yes",
    approvalSeparationOfDuties: "No",
    approvalRequireRejectComment: "Yes",
    approvalApproverWallets: "",
    requireCryptographicReviewerSignature: "Yes",
    approvalSignatureLifetimeSeconds: "300",
    requireReviewerChainBinding: "Yes",
    requireApprovalDomainSeparation: "Yes",
    approvalSignatureChainName: "casper-test",
    approvalOrganizationalQuorumEnabled: "No",
    approvalGroups: "[]",
    approvalTiers: "[]",
    approvalOrganizationDefaults: "{}",
    approvalEscalationRules: "[]",
    approvalEmergencyGroupIds: "",
    approvalExecutionDelaySeconds: "0",
    approvalExecutionWindowSeconds: "0",
    trustedContracts: "",
    blockedContracts: "",
    allowedEntryPoints: "",
    instructionIntegrityEnabled: "Yes",
    instructionIntegrityMode: "Review",
    requireGoalBindingForActions: "Transfer\nSwap\nStake\nBridge\nx402 Payment\nDAO Treasury Payment\nContract Interaction\nDeposit to Vault",
    requireUserConfirmationForExternalContent: "Yes",
    allowedSourceDomains: "",
    blockedSourceDomains: "",
    externalContentHighRiskAction: "Review",
    allowParameterChangesAfterGoal: "No",
    requireParameterChangeReason: "Yes",
    toolIntegrityEnabled: "Yes",
    toolIntegrityMode: "Review",
    approvedMcpServers: OFFICIAL_MCP_SERVER_BINDING,
    approvedTools: OFFICIAL_MCP_TOOL_BINDINGS,
    requireManifestHash: "Yes",
    requireSchemaHash: "Yes",
    requireTls: "Yes",
    allowToolVersionChanges: "No",
    unknownToolAction: "Review",
    permissionExpansionAction: "Block",
    delegationControlsEnabled: "Yes",
    delegationMode: "Review",
    requireExpiringDelegation: "Yes",
    maximumDelegationLifetime: "3600",
    maximumDelegationDepth: "1",
    allowRedelegation: "No",
    approvedDelegates: "",
    blockedDelegates: "",
    revokedDelegationIds: "",
    unknownDelegateAction: "Review",
    requireScopeBinding: "Yes",
    requireCryptographicDelegationAttestation: "Yes",
    delegationUnavailableAction: "Review",
    rpcIntegrityEnabled: "No",
    rpcIntegrityMode: "Review",
    approvedRpcEndpoints: "https://node.testnet.casper.network/rpc|casper-testnet-primary|casper-test|casper-testnet",
    rpcIntegrityRequireTls: "Yes",
    rpcIntegrityMaximumBlockAgeSeconds: "120",
    rpcIntegrityMinimumProviders: "1",
    rpcIntegrityMaximumHeightDifference: "5",
    rpcIntegrityDisagreementAction: "Block",
    rpcIntegrityUnavailableAction: "Review",
    rpcIntegrityRequireNetworkIdentity: "Yes",
    rpcIntegrityAllowAutomaticFailover: "No",
    feeSafetyEnabled: "No",
    feeSafetyMode: "Review",
    feeSafetyMaximumNetworkFee: "5",
    feeSafetyMaximumGasPrice: "100",
    feeSafetyMaximumPriorityFee: "10",
    feeSafetyApprovedSponsors: "magen3-relayer",
    feeSafetyApprovedPaymasters: "",
    feeSafetySponsorshipUnavailableAction: "Review",
    feeSafetySponsoredBudget: "100",
    feeSafetyMaximumSponsoredOperations: "100",
    feeSafetyMaximumFailedSponsoredOperations: "3",
    feeSafetyLookbackSeconds: "86400",
    feeSafetyRequireSponsorshipExpiry: "Yes",
    feeSafetyRequireSponsorEvidence: "Yes",
    lifecycleControlsEnabled: "Yes",

    lifecycleControlMode: "Enforce",
    lifecycleUnavailableAction: "Warn",
    lifecycleRequireIntentId: "Yes",
    lifecycleRequireIdempotencyKey: "Yes",
    lifecycleRequireCreatedAt: "Yes",
    lifecycleRequireExpiry: "Yes",
    lifecycleRequireSequence: "No",
    lifecyclePreventDuplicateFingerprint: "Yes",
    lifecyclePreventRetryAfterUncertain: "Yes",
    lifecyclePreventParameterMutation: "Yes",
    lifecycleMaxIntentAgeSeconds: "600",
    lifecycleMaxFutureSkewSeconds: "120",
    lifecycleMaxLifetimeSeconds: "900",
    lifecycleReplayWindowSeconds: "86400",
    lifecycleMaxRetryAttempts: "3",
    reconciliationEnabled: "Yes",
    maximumSubmissionAttempts: "3",
    pendingRetryAction: "Block",
    uncertainRetryAction: "Block",
    requiredConfirmations: "1",
    finalityTimeoutSeconds: "3600",
    replacementAllowed: "Yes",
    resourceDeliveryRequired: "No",
    threatIntelligenceMode: "Review",
    threatIntelligenceMinConfidence: "70",
    threatIntelligenceUnavailableAction: "Warn",
    oracleValidationMode: "Review",
    oracleValidationMaxAgeSeconds: "120",
    oracleValidationMaxDeviationBps: "300",
    oracleValidationMaxSourceSpreadBps: "500",
    oracleValidationMinConfidence: "70",
    oracleValidationMinSources: "1",
    oracleValidationUnavailableAction: "Warn",
    bridgeControlMode: "Review",
    bridgeControlUnavailableAction: "Review",
    bridgeAllowedProviders: "",
    bridgeAllowedSourceChains: "casper-test",
    bridgeAllowedDestinationChains: "",
    bridgeBlockedDestinationChains: "",
    bridgeAllowedAssets: "CSPR",
    bridgeMaxAmount: "100",
    bridgeMaxFeeBps: "100",
    bridgeMaxQuoteAgeSeconds: "300",
    bridgeRequireQuoteExpiry: "Yes",
    bridgeMinSourceConfirmations: "2",
    bridgeMinDestinationConfirmations: "12",
    tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Review",
    tokenPermissionMaxApprovalAmount: "0",
    tokenPermissionMaxApprovalToTransactionRatio: "2",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "No",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
    privilegedActionControlsEnabled: "Yes",
    privilegedActionMode: "Review",
    privilegedActionsRequiringReview: "Ownership Transfer\nAdministrator Change\nProxy Upgrade\nImplementation Change\nRole Grant\nRole Revoke\nMint\nPause\nUnpause\nFreeze\nEmergency Withdrawal\nTreasury Withdrawal\nOracle Replacement\nFee Recipient Change\nBridge Validator Change\nPermission Change",
    privilegedActionsBlocked: "",
    approvedAdministrators: "",
    approvedImplementations: "",
    privilegedActionQuorumRules: "",
    unknownPrivilegedAction: "Review",
    contractUpgradeControlsEnabled: "Yes",
    contractUpgradeMode: "Review",
    contractUpgradeApprovedImplementations: "",
    contractUpgradeBlockedImplementations: "",
    contractUpgradeRequiresApproval: "Yes",
    contractUpgradeQuorum: "2",
    contractUpgradeDelaySeconds: "0",
    contractUpgradeRequireCodeHash: "Yes",
    contractUpgradeRequireAdministrator: "Yes",
    contractUpgradeApprovedAdministrators: "",
    contractUpgradeUnknownImplementationAction: "Review",
    contractArgumentControlsEnabled: "No",
    contractArgumentMode: "Review",
    contractArgumentUnknownRuleAction: "Review",
    contractArgumentUnknownArgumentAction: "Block",
    contractArgumentRules: "[]",
    x402ControlsEnabled: "Yes",
    x402ControlMode: "Review",
    x402UnavailableAction: "Review",
    x402AllowedVersions: "2",
    x402AllowedSchemes: "exact",
    x402AllowedMethods: "GET\nHEAD\nPOST",
    x402AllowedNetworks: "eip155:84532",
    x402AllowedAssets: "USDC",
    x402AssetDecimals: "USDC=6",
    x402AllowedFacilitators: "https://x402.org/facilitator",
    x402AllowedMerchants: "api.example.com",
    x402BlockedMerchants: "",
    x402AllowedRecipients: "0x1111111111111111111111111111111111111111",
    x402MaxPayment: "5",
    x402DailyLimit: "25",
    x402MonthlyLimit: "250",
    x402ReviewThreshold: "3",
    x402MaxPaymentsPerHour: "20",
    x402MaxAuthorizationLifetimeSeconds: "600",
    x402RequireHttps: "Yes",
    x402RequirePaymentRequiredHash: "Yes",
    x402RequireBodyHashForUnsafeMethods: "Yes",
    x402RequireRequestId: "Yes",
    x402RequireClientFingerprint: "No",
    x402PreventAmbiguousRetry: "Yes",
    x402MaxSettlementAttempts: "1",
    complianceControlsEnabled: "Yes",
    complianceControlMode: "Review",
    complianceUnavailableAction: "Review",
    complianceRequiredActions: "Transfer\nDAO Treasury Payment\nBridge",
    complianceRequireOriginatorAttestation: "Yes",
    complianceRequireBeneficiaryAttestation: "Yes",
    complianceRequireTravelRule: "Yes",
    complianceTravelRuleThreshold: "1",
    complianceRequireSanctionsScreening: "Yes",
    complianceAllowedJurisdictions: "",
    complianceBlockedJurisdictions: "",
    complianceReviewJurisdictions: "",
    complianceAllowedCounterpartyTypes: "VASP\nOrganization\nSelf-hosted Wallet",
    complianceAcceptedProviders: "",
    complianceMaxAttestationAgeSeconds: "86400",
    complianceMaxScreeningAgeSeconds: "3600",
    complianceMaximumRiskRating: "Medium",
    blockedActions: [] as string[],
    riskMode: "Balanced" as RiskMode,
  });
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [copiedPolicyHash, setCopiedPolicyHash] = useState("");
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [approvalBusy, setApprovalBusy] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [policyFormError, setPolicyFormError] = useState("");
  const copyPolicyHash = useCallback(async (policyHash: string) => {
    const copiedOk = await writeClipboard(policyHash);
    setCopiedPolicyHash(copiedOk ? policyHash : "copy failed");
    setTimeout(() => setCopiedPolicyHash(""), copiedOk ? 1400 : 1800);
  }, []);
  const [editForm, setEditForm] = useState({
    name: "",
    maxTransaction: "",
    dailyLimit: "",
    approvalThreshold: "",
    emergencyControlsEnabled: "Yes",
    automaticPauseEnabled: "No",
    emergencyAutomaticPauseAction: "Blocked",
    emergencyRepeatedBlockThreshold: "5",
    emergencyReplayAttemptThreshold: "1",
    emergencyRequestFrequencyThreshold: "120",
    emergencyLookbackSeconds: "3600",
    emergencySpendingSpikeMultiplier: "5",
    emergencyProviderFailureThreshold: "3",
    emergencyUnresolvedExecutionThreshold: "5",
    emergencyUnresolvedX402Threshold: "3",
    emergencyBridgeFailureThreshold: "3",
    emergencyPauseDurationSeconds: "3600",
    emergencyResumeRequiresApproval: "No",
    emergencyResumeQuorum: "1",
    emergencyPauseOnThreatMatch: "Yes",
    emergencyPauseOnOracleDisagreement: "Yes",
    emergencyPauseOnPrivilegedActionFailure: "Yes",
    reviewResolutionMode: "Autonomous",
    approvalWorkflowEnabled: "Yes",
    approvalWorkflowMode: "Single",
    approvalRequiredCount: "1",
    approvalExpiryMinutes: "60",
    approvalAllowOwnerFallback: "Yes",
    approvalSeparationOfDuties: "No",
    approvalRequireRejectComment: "Yes",
    approvalApproverWallets: "",
    requireCryptographicReviewerSignature: "Yes",
    approvalSignatureLifetimeSeconds: "300",
    requireReviewerChainBinding: "Yes",
    requireApprovalDomainSeparation: "Yes",
    approvalSignatureChainName: "casper-test",
    approvalOrganizationalQuorumEnabled: "No",
    approvalGroups: "[]",
    approvalTiers: "[]",
    approvalOrganizationDefaults: "{}",
    approvalEscalationRules: "[]",
    approvalEmergencyGroupIds: "",
    approvalExecutionDelaySeconds: "0",
    approvalExecutionWindowSeconds: "0",
    trustedContracts: "",
    blockedContracts: "",
    allowedEntryPoints: "",
    instructionIntegrityEnabled: "Yes",
    instructionIntegrityMode: "Review",
    requireGoalBindingForActions: "Transfer\nSwap\nStake\nBridge\nx402 Payment\nDAO Treasury Payment\nContract Interaction\nDeposit to Vault",
    requireUserConfirmationForExternalContent: "Yes",
    allowedSourceDomains: "",
    blockedSourceDomains: "",
    externalContentHighRiskAction: "Review",
    allowParameterChangesAfterGoal: "No",
    requireParameterChangeReason: "Yes",
    toolIntegrityEnabled: "Yes",
    toolIntegrityMode: "Review",
    approvedMcpServers: OFFICIAL_MCP_SERVER_BINDING,
    approvedTools: OFFICIAL_MCP_TOOL_BINDINGS,
    requireManifestHash: "Yes",
    requireSchemaHash: "Yes",
    requireTls: "Yes",
    allowToolVersionChanges: "No",
    unknownToolAction: "Review",
    permissionExpansionAction: "Block",
    delegationControlsEnabled: "Yes",
    delegationMode: "Review",
    requireExpiringDelegation: "Yes",
    maximumDelegationLifetime: "3600",
    maximumDelegationDepth: "1",
    allowRedelegation: "No",
    approvedDelegates: "",
    blockedDelegates: "",
    revokedDelegationIds: "",
    unknownDelegateAction: "Review",
    requireScopeBinding: "Yes",
    requireCryptographicDelegationAttestation: "Yes",
    delegationUnavailableAction: "Review",
    rpcIntegrityEnabled: "No",
    rpcIntegrityMode: "Review",
    approvedRpcEndpoints: "https://node.testnet.casper.network/rpc|casper-testnet-primary|casper-test|casper-testnet",
    rpcIntegrityRequireTls: "Yes",
    rpcIntegrityMaximumBlockAgeSeconds: "120",
    rpcIntegrityMinimumProviders: "1",
    rpcIntegrityMaximumHeightDifference: "5",
    rpcIntegrityDisagreementAction: "Block",
    rpcIntegrityUnavailableAction: "Review",
    rpcIntegrityRequireNetworkIdentity: "Yes",
    rpcIntegrityAllowAutomaticFailover: "No",
    feeSafetyEnabled: "No",
    feeSafetyMode: "Review",
    feeSafetyMaximumNetworkFee: "5",
    feeSafetyMaximumGasPrice: "100",
    feeSafetyMaximumPriorityFee: "10",
    feeSafetyApprovedSponsors: "magen3-relayer",
    feeSafetyApprovedPaymasters: "",
    feeSafetySponsorshipUnavailableAction: "Review",
    feeSafetySponsoredBudget: "100",
    feeSafetyMaximumSponsoredOperations: "100",
    feeSafetyMaximumFailedSponsoredOperations: "3",
    feeSafetyLookbackSeconds: "86400",
    feeSafetyRequireSponsorshipExpiry: "Yes",
    feeSafetyRequireSponsorEvidence: "Yes",
    lifecycleControlsEnabled: "Yes",

    lifecycleControlMode: "Enforce",
    lifecycleUnavailableAction: "Warn",
    lifecycleRequireIntentId: "Yes",
    lifecycleRequireIdempotencyKey: "Yes",
    lifecycleRequireCreatedAt: "Yes",
    lifecycleRequireExpiry: "Yes",
    lifecycleRequireSequence: "No",
    lifecyclePreventDuplicateFingerprint: "Yes",
    lifecyclePreventRetryAfterUncertain: "Yes",
    lifecyclePreventParameterMutation: "Yes",
    lifecycleMaxIntentAgeSeconds: "600",
    lifecycleMaxFutureSkewSeconds: "120",
    lifecycleMaxLifetimeSeconds: "900",
    lifecycleReplayWindowSeconds: "86400",
    lifecycleMaxRetryAttempts: "3",
    reconciliationEnabled: "Yes",
    maximumSubmissionAttempts: "3",
    pendingRetryAction: "Block",
    uncertainRetryAction: "Block",
    requiredConfirmations: "1",
    finalityTimeoutSeconds: "3600",
    replacementAllowed: "Yes",
    resourceDeliveryRequired: "No",
    threatIntelligenceMode: "Review",
    threatIntelligenceMinConfidence: "70",
    threatIntelligenceUnavailableAction: "Warn",
    oracleValidationMode: "Review",
    oracleValidationMaxAgeSeconds: "120",
    oracleValidationMaxDeviationBps: "300",
    oracleValidationMaxSourceSpreadBps: "500",
    oracleValidationMinConfidence: "70",
    oracleValidationMinSources: "1",
    oracleValidationUnavailableAction: "Warn",
    bridgeControlMode: "Review",
    bridgeControlUnavailableAction: "Review",
    bridgeAllowedProviders: "",
    bridgeAllowedSourceChains: "casper-test",
    bridgeAllowedDestinationChains: "",
    bridgeBlockedDestinationChains: "",
    bridgeAllowedAssets: "CSPR",
    bridgeMaxAmount: "100",
    bridgeMaxFeeBps: "100",
    bridgeMaxQuoteAgeSeconds: "300",
    bridgeRequireQuoteExpiry: "Yes",
    bridgeMinSourceConfirmations: "2",
    bridgeMinDestinationConfirmations: "12",
    tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Review",
    tokenPermissionMaxApprovalAmount: "0",
    tokenPermissionMaxApprovalToTransactionRatio: "2",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "No",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
    privilegedActionControlsEnabled: "Yes",
    privilegedActionMode: "Review",
    privilegedActionsRequiringReview: "Ownership Transfer\nAdministrator Change\nProxy Upgrade\nImplementation Change\nRole Grant\nRole Revoke\nMint\nPause\nUnpause\nFreeze\nEmergency Withdrawal\nTreasury Withdrawal\nOracle Replacement\nFee Recipient Change\nBridge Validator Change\nPermission Change",
    privilegedActionsBlocked: "",
    approvedAdministrators: "",
    approvedImplementations: "",
    privilegedActionQuorumRules: "",
    unknownPrivilegedAction: "Review",
    contractUpgradeControlsEnabled: "Yes",
    contractUpgradeMode: "Review",
    contractUpgradeApprovedImplementations: "",
    contractUpgradeBlockedImplementations: "",
    contractUpgradeRequiresApproval: "Yes",
    contractUpgradeQuorum: "2",
    contractUpgradeDelaySeconds: "0",
    contractUpgradeRequireCodeHash: "Yes",
    contractUpgradeRequireAdministrator: "Yes",
    contractUpgradeApprovedAdministrators: "",
    contractUpgradeUnknownImplementationAction: "Review",
    contractArgumentControlsEnabled: "No",
    contractArgumentMode: "Review",
    contractArgumentUnknownRuleAction: "Review",
    contractArgumentUnknownArgumentAction: "Block",
    contractArgumentRules: "[]",
    x402ControlsEnabled: "Yes",
    x402ControlMode: "Review",
    x402UnavailableAction: "Review",
    x402AllowedVersions: "2",
    x402AllowedSchemes: "exact",
    x402AllowedMethods: "GET\nHEAD\nPOST",
    x402AllowedNetworks: "eip155:84532",
    x402AllowedAssets: "USDC",
    x402AssetDecimals: "USDC=6",
    x402AllowedFacilitators: "https://x402.org/facilitator",
    x402AllowedMerchants: "api.example.com",
    x402BlockedMerchants: "",
    x402AllowedRecipients: "0x1111111111111111111111111111111111111111",
    x402MaxPayment: "5",
    x402DailyLimit: "25",
    x402MonthlyLimit: "250",
    x402ReviewThreshold: "3",
    x402MaxPaymentsPerHour: "20",
    x402MaxAuthorizationLifetimeSeconds: "600",
    x402RequireHttps: "Yes",
    x402RequirePaymentRequiredHash: "Yes",
    x402RequireBodyHashForUnsafeMethods: "Yes",
    x402RequireRequestId: "Yes",
    x402RequireClientFingerprint: "No",
    x402PreventAmbiguousRetry: "Yes",
    x402MaxSettlementAttempts: "1",
    complianceControlsEnabled: "Yes",
    complianceControlMode: "Review",
    complianceUnavailableAction: "Review",
    complianceRequiredActions: "Transfer\nDAO Treasury Payment\nBridge",
    complianceRequireOriginatorAttestation: "Yes",
    complianceRequireBeneficiaryAttestation: "Yes",
    complianceRequireTravelRule: "Yes",
    complianceTravelRuleThreshold: "1",
    complianceRequireSanctionsScreening: "Yes",
    complianceAllowedJurisdictions: "",
    complianceBlockedJurisdictions: "",
    complianceReviewJurisdictions: "",
    complianceAllowedCounterpartyTypes: "VASP\nOrganization\nSelf-hosted Wallet",
    complianceAcceptedProviders: "",
    complianceMaxAttestationAgeSeconds: "86400",
    complianceMaxScreeningAgeSeconds: "3600",
    complianceMaximumRiskRating: "Medium",
    blockedActions: [] as string[],
    riskMode: "Balanced" as RiskMode,
    status: "Active" as "Active" | "Inactive",
  });

  const createPolicy = useCallback(async () => {
    if (!form.name.trim() || !form.agentId) return false;
    setPolicyFormError("");
    let organizationalFields: ReturnType<typeof parseOrganizationalApprovalFields>;
    let contractArgumentRules: unknown[];
    try {
      organizationalFields = parseOrganizationalApprovalFields(form);
      contractArgumentRules = parseContractArgumentRules(form.contractArgumentRules);
    } catch (error) {
      setPolicyFormError(error instanceof Error ? error.message : "The organizational approval configuration is invalid.");
      return false;
    }
    const createdPolicy = await onCreatePolicy({
      name: form.name,
      agentId: form.agentId,
      maxTransaction: Number(form.maxTransaction) || 50,
      dailyLimit: Number(form.dailyLimit) || 200,
      approvalThreshold: Number(form.approvalThreshold) || 100,
      trustedContracts: form.trustedContracts
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      blockedActions: form.blockedActions,
      riskMode: form.riskMode,
      status: "Active",
      structuredRules: {
        valueExposure: {
          enabled: true,
          limitBasis: form.limitBasis,
          referenceCurrency: form.referenceCurrency,
          automaticLimit: Number(form.approvalThreshold) || 100,
          reviewLimit: Number(form.approvalThreshold) || 100,
          maximumTransactionLimit: Number(form.maxTransaction) || 50,
          dailyLimit: Number(form.dailyLimit) || 200,
          ...(Number(form.hourlyLimit) > 0 ? { hourlyLimit: Number(form.hourlyLimit) } : {}),
          ...(Number(form.perDestinationLimit) > 0 ? { perDestinationLimit: Number(form.perDestinationLimit) } : {}),
          ...(Number(form.walletPercentageLimit) > 0 ? { walletPercentageLimit: Number(form.walletPercentageLimit) } : {}),
          maxPriceAgeSeconds: 120,
        },
        blockedContracts: form.blockedContracts.split("\n").map((item) => item.trim()).filter(Boolean),
        allowedEntryPoints: form.allowedEntryPoints.split("\n").map((item) => item.trim()).filter(Boolean),
        emergencyControlsEnabled: form.emergencyControlsEnabled !== "No",
        automaticPauseEnabled: form.automaticPauseEnabled === "Yes",
        emergencyAutomaticPauseAction: form.emergencyAutomaticPauseAction,
        emergencyRepeatedBlockThreshold: Math.max(1, Number(form.emergencyRepeatedBlockThreshold) || 5),
        emergencyReplayAttemptThreshold: Math.max(1, Number(form.emergencyReplayAttemptThreshold) || 1),
        emergencyRequestFrequencyThreshold: Math.max(1, Number(form.emergencyRequestFrequencyThreshold) || 120),
        emergencyLookbackSeconds: Math.max(60, Number(form.emergencyLookbackSeconds) || 3600),
        emergencySpendingSpikeMultiplier: Math.max(1, Number(form.emergencySpendingSpikeMultiplier) || 5),
        emergencyProviderFailureThreshold: Math.max(1, Number(form.emergencyProviderFailureThreshold) || 3),
        emergencyUnresolvedExecutionThreshold: Math.max(1, Number(form.emergencyUnresolvedExecutionThreshold) || 5),
        emergencyUnresolvedX402Threshold: Math.max(1, Number(form.emergencyUnresolvedX402Threshold) || 3),
        emergencyBridgeFailureThreshold: Math.max(1, Number(form.emergencyBridgeFailureThreshold) || 3),
        emergencyPauseDurationSeconds: Math.max(0, Number(form.emergencyPauseDurationSeconds) || 3600),
        emergencyResumeRequiresApproval: form.emergencyResumeRequiresApproval === "Yes",
        emergencyResumeQuorum: Math.max(1, Math.min(10, Number(form.emergencyResumeQuorum) || 1)),
        emergencyPauseOnThreatMatch: form.emergencyPauseOnThreatMatch !== "No",
        emergencyPauseOnOracleDisagreement: form.emergencyPauseOnOracleDisagreement !== "No",
        emergencyPauseOnPrivilegedActionFailure: form.emergencyPauseOnPrivilegedActionFailure !== "No",
        reviewResolutionMode: form.reviewResolutionMode || "Autonomous",
        approvalWorkflowEnabled: form.approvalWorkflowEnabled !== "No",
        approvalWorkflowMode: form.approvalWorkflowMode,
        approvalRequiredCount: Math.max(1, Math.min(10, Number(form.approvalRequiredCount) || 1)),
        approvalExpiryMinutes: Math.max(5, Math.min(10080, Number(form.approvalExpiryMinutes) || 60)),
        approvalAllowOwnerFallback: form.approvalAllowOwnerFallback !== "No",
        approvalSeparationOfDuties: form.approvalSeparationOfDuties === "Yes",
        approvalRequireRejectComment: form.approvalRequireRejectComment !== "No",
        approvalApproverWallets: form.approvalApproverWallets.split("\n").map((item) => item.trim()).filter(Boolean),
        requireCryptographicReviewerSignature: form.requireCryptographicReviewerSignature !== "No",
        approvalSignatureLifetimeSeconds: Math.max(30, Math.min(1800, Number(form.approvalSignatureLifetimeSeconds) || 300)),
        requireReviewerChainBinding: form.requireReviewerChainBinding !== "No",
        requireApprovalDomainSeparation: form.requireApprovalDomainSeparation !== "No",
        approvalSignatureChainName: form.approvalSignatureChainName.trim() || "casper-test",
        approvalOrganizationalQuorumEnabled: form.approvalOrganizationalQuorumEnabled === "Yes",
        approvalGroups: organizationalFields.groups,
        approvalTiers: organizationalFields.tiers,
        approvalOrganizationDefaults: organizationalFields.defaults,
        approvalEscalationRules: organizationalFields.escalations,
        approvalEmergencyGroupIds: organizationalFields.emergencyGroupIds,
        approvalExecutionDelaySeconds: Math.max(0, Number(form.approvalExecutionDelaySeconds) || 0),
        approvalExecutionWindowSeconds: Math.max(0, Number(form.approvalExecutionWindowSeconds) || 0),
        instructionIntegrityEnabled: form.instructionIntegrityEnabled !== "No",
        instructionIntegrityMode: form.instructionIntegrityMode,
        requireGoalBindingForActions: form.requireGoalBindingForActions.split("\n").map((item) => item.trim()).filter(Boolean),
        requireUserConfirmationForExternalContent: form.requireUserConfirmationForExternalContent !== "No",
        allowedSourceDomains: form.allowedSourceDomains.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        blockedSourceDomains: form.blockedSourceDomains.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        externalContentHighRiskAction: form.externalContentHighRiskAction,
        allowParameterChangesAfterGoal: form.allowParameterChangesAfterGoal === "Yes",
        requireParameterChangeReason: form.requireParameterChangeReason !== "No",
        toolIntegrityEnabled: form.toolIntegrityEnabled !== "No",
        toolIntegrityMode: form.toolIntegrityMode,
        approvedMcpServers: form.approvedMcpServers.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedTools: form.approvedTools.split("\n").map((item) => item.trim()).filter(Boolean),
        requireManifestHash: form.requireManifestHash !== "No",
        requireSchemaHash: form.requireSchemaHash !== "No",
        requireTls: form.requireTls !== "No",
        allowToolVersionChanges: form.allowToolVersionChanges === "Yes",
        unknownToolAction: form.unknownToolAction,
        permissionExpansionAction: form.permissionExpansionAction,
        delegationControlsEnabled: form.delegationControlsEnabled !== "No",
        delegationMode: form.delegationMode,
        requireExpiringDelegation: form.requireExpiringDelegation !== "No",
        maximumDelegationLifetime: Number(form.maximumDelegationLifetime || 3600),
        maximumDelegationDepth: Number(form.maximumDelegationDepth || 1),
        allowRedelegation: form.allowRedelegation === "Yes",
        approvedDelegates: form.approvedDelegates.split("\n").map((item) => item.trim()).filter(Boolean),
        blockedDelegates: form.blockedDelegates.split("\n").map((item) => item.trim()).filter(Boolean),
        revokedDelegationIds: form.revokedDelegationIds.split("\n").map((item) => item.trim()).filter(Boolean),
        unknownDelegateAction: form.unknownDelegateAction,
        requireScopeBinding: form.requireScopeBinding !== "No",
        requireCryptographicDelegationAttestation: form.requireCryptographicDelegationAttestation !== "No",
        delegationUnavailableAction: form.delegationUnavailableAction,
        rpcIntegrityEnabled: form.rpcIntegrityEnabled === "Yes",
        rpcIntegrityMode: form.rpcIntegrityMode,
        approvedRpcEndpoints: form.approvedRpcEndpoints.split("\n").map((item) => item.trim()).filter(Boolean),
        rpcIntegrityRequireTls: form.rpcIntegrityRequireTls !== "No",
        rpcIntegrityMaximumBlockAgeSeconds: Math.max(5, Number(form.rpcIntegrityMaximumBlockAgeSeconds) || 120),
        rpcIntegrityMinimumProviders: Math.max(1, Math.min(10, Number(form.rpcIntegrityMinimumProviders) || 1)),
        rpcIntegrityMaximumHeightDifference: Math.max(0, Number(form.rpcIntegrityMaximumHeightDifference) || 5),
        rpcIntegrityDisagreementAction: form.rpcIntegrityDisagreementAction,
        rpcIntegrityUnavailableAction: form.rpcIntegrityUnavailableAction,
        rpcIntegrityRequireNetworkIdentity: form.rpcIntegrityRequireNetworkIdentity !== "No",
        rpcIntegrityAllowAutomaticFailover: form.rpcIntegrityAllowAutomaticFailover === "Yes",
        feeSafetyEnabled: form.feeSafetyEnabled === "Yes",
        feeSafetyMode: form.feeSafetyMode,
        feeSafetyMaximumNetworkFee: Number(form.feeSafetyMaximumNetworkFee) > 0 ? Number(form.feeSafetyMaximumNetworkFee) : null,
        feeSafetyMaximumGasPrice: Number(form.feeSafetyMaximumGasPrice) > 0 ? Number(form.feeSafetyMaximumGasPrice) : null,
        feeSafetyMaximumPriorityFee: Number(form.feeSafetyMaximumPriorityFee) >= 0 ? Number(form.feeSafetyMaximumPriorityFee) : null,
        feeSafetyApprovedSponsors: form.feeSafetyApprovedSponsors.split("\n").map((item) => item.trim()).filter(Boolean),
        feeSafetyApprovedPaymasters: form.feeSafetyApprovedPaymasters.split("\n").map((item) => item.trim()).filter(Boolean),
        feeSafetySponsorshipUnavailableAction: form.feeSafetySponsorshipUnavailableAction,
        feeSafetySponsoredBudget: Number(form.feeSafetySponsoredBudget) > 0 ? Number(form.feeSafetySponsoredBudget) : null,
        feeSafetyMaximumSponsoredOperations: Math.max(1, Number(form.feeSafetyMaximumSponsoredOperations) || 100),
        feeSafetyMaximumFailedSponsoredOperations: Math.max(0, Number(form.feeSafetyMaximumFailedSponsoredOperations) || 0),
        feeSafetyLookbackSeconds: Math.max(60, Number(form.feeSafetyLookbackSeconds) || 86400),
        feeSafetyRequireSponsorshipExpiry: form.feeSafetyRequireSponsorshipExpiry !== "No",
        feeSafetyRequireSponsorEvidence: form.feeSafetyRequireSponsorEvidence === "Yes",
        lifecycleControlsEnabled: form.lifecycleControlsEnabled !== "No",
        lifecycleControlMode: form.lifecycleControlMode,
        lifecycleUnavailableAction: form.lifecycleUnavailableAction,
        lifecycleRequireIntentId: form.lifecycleRequireIntentId !== "No",
        lifecycleRequireIdempotencyKey: form.lifecycleRequireIdempotencyKey !== "No",
        lifecycleRequireCreatedAt: form.lifecycleRequireCreatedAt !== "No",
        lifecycleRequireExpiry: form.lifecycleRequireExpiry !== "No",
        lifecycleRequireSequence: form.lifecycleRequireSequence === "Yes",
        lifecyclePreventDuplicateFingerprint: form.lifecyclePreventDuplicateFingerprint !== "No",
        lifecyclePreventRetryAfterUncertain: form.lifecyclePreventRetryAfterUncertain !== "No",
        lifecyclePreventParameterMutation: form.lifecyclePreventParameterMutation !== "No",
        lifecycleMaxIntentAgeSeconds: Math.max(30, Number(form.lifecycleMaxIntentAgeSeconds) || 600),
        lifecycleMaxFutureSkewSeconds: Math.max(0, Number(form.lifecycleMaxFutureSkewSeconds) || 120),
        lifecycleMaxLifetimeSeconds: Math.max(30, Number(form.lifecycleMaxLifetimeSeconds) || 900),
        lifecycleReplayWindowSeconds: Math.max(60, Number(form.lifecycleReplayWindowSeconds) || 86400),
        lifecycleMaxRetryAttempts: Math.max(0, Number(form.lifecycleMaxRetryAttempts) || 3),
        reconciliationEnabled: form.reconciliationEnabled !== "No",
        maximumSubmissionAttempts: Math.max(1, Math.min(100, Number(form.maximumSubmissionAttempts) || 3)),
        pendingRetryAction: form.pendingRetryAction,
        uncertainRetryAction: form.uncertainRetryAction,
        requiredConfirmations: Math.max(1, Math.min(10000, Number(form.requiredConfirmations) || 1)),
        finalityTimeoutSeconds: Math.max(30, Math.min(2592000, Number(form.finalityTimeoutSeconds) || 3600)),
        replacementAllowed: form.replacementAllowed !== "No",
        resourceDeliveryRequired: form.resourceDeliveryRequired === "Yes",
        threatIntelligenceMode: form.threatIntelligenceMode,
        threatIntelligenceMinConfidence: clampPercentage(form.threatIntelligenceMinConfidence),
        threatIntelligenceUnavailableAction: form.threatIntelligenceUnavailableAction,
        oracleValidationMode: form.oracleValidationMode,
        oracleValidationMaxAgeSeconds: Math.max(5, Number(form.oracleValidationMaxAgeSeconds) || 120),
        oracleValidationMaxDeviationBps: Math.max(1, Math.min(10000, Number(form.oracleValidationMaxDeviationBps) || 300)),
        oracleValidationMaxSourceSpreadBps: Math.max(1, Math.min(10000, Number(form.oracleValidationMaxSourceSpreadBps) || 500)),
        oracleValidationMinConfidence: clampPercentage(form.oracleValidationMinConfidence),
        oracleValidationMinSources: Math.max(1, Math.min(20, Number(form.oracleValidationMinSources) || 1)),
        oracleValidationUnavailableAction: form.oracleValidationUnavailableAction,
        bridgeControlMode: form.bridgeControlMode,
        bridgeControlUnavailableAction: form.bridgeControlUnavailableAction,
        bridgeAllowedProviders: form.bridgeAllowedProviders.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedSourceChains: form.bridgeAllowedSourceChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedDestinationChains: form.bridgeAllowedDestinationChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeBlockedDestinationChains: form.bridgeBlockedDestinationChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedAssets: form.bridgeAllowedAssets.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        bridgeMaxAmount: Math.max(0, Number(form.bridgeMaxAmount) || 0),
        bridgeMaxFeeBps: Math.max(0, Math.min(10000, Number(form.bridgeMaxFeeBps) || 100)),
        bridgeMaxQuoteAgeSeconds: Math.max(5, Number(form.bridgeMaxQuoteAgeSeconds) || 300),
        bridgeRequireQuoteExpiry: form.bridgeRequireQuoteExpiry !== "No",
        bridgeMinSourceConfirmations: Math.max(0, Number(form.bridgeMinSourceConfirmations) || 0),
        bridgeMinDestinationConfirmations: Math.max(0, Number(form.bridgeMinDestinationConfirmations) || 0),
        tokenPermissionControlsEnabled: form.tokenPermissionControlsEnabled !== "No",
        tokenPermissionMode: form.tokenPermissionMode,
        tokenPermissionUnknownSpenderAction: form.tokenPermissionUnknownSpenderAction,
        tokenPermissionUnlimitedApprovalAction: form.tokenPermissionUnlimitedApprovalAction,
        tokenPermissionMaxApprovalAmount: Math.max(0, Number(form.tokenPermissionMaxApprovalAmount) || 0),
        tokenPermissionMaxApprovalToTransactionRatio: Math.max(0, Number(form.tokenPermissionMaxApprovalToTransactionRatio) || 2),
        tokenPermissionMaxLifetimeSeconds: Math.max(0, Number(form.tokenPermissionMaxLifetimeSeconds) || 3600),
        tokenPermissionRequireExpiry: form.tokenPermissionRequireExpiry !== "No",
        tokenPermissionRequireAllowanceReset: form.tokenPermissionRequireAllowanceReset === "Yes",
        tokenPermissionApprovedSpenders: form.tokenPermissionApprovedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionBlockedSpenders: form.tokenPermissionBlockedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionAllowNftOperatorApproval: form.tokenPermissionAllowNftOperatorApproval === "Yes",
        tokenPermissionAllowBatchApproval: form.tokenPermissionAllowBatchApproval === "Yes",
        tokenPermissionRequireChainBinding: form.tokenPermissionRequireChainBinding !== "No",
        tokenPermissionRequireNonce: form.tokenPermissionRequireNonce !== "No",
        tokenPermissionMaximumBatchSize: Math.max(1, Math.min(100, Number(form.tokenPermissionMaximumBatchSize) || 10)),
        privilegedActionControlsEnabled: form.privilegedActionControlsEnabled !== "No",
        privilegedActionMode: form.privilegedActionMode,
        privilegedActionsRequiringReview: form.privilegedActionsRequiringReview.split("\n").map((item) => item.trim()).filter(Boolean),
        privilegedActionsBlocked: form.privilegedActionsBlocked.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedAdministrators: form.approvedAdministrators.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedImplementations: form.approvedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        privilegedActionQuorumRules: parsePrivilegedQuorumRules(form.privilegedActionQuorumRules),
        unknownPrivilegedAction: form.unknownPrivilegedAction,
        contractUpgradeControlsEnabled: form.contractUpgradeControlsEnabled !== "No",
        contractUpgradeMode: form.contractUpgradeMode,
        contractUpgradeApprovedImplementations: form.contractUpgradeApprovedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeBlockedImplementations: form.contractUpgradeBlockedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeRequiresApproval: form.contractUpgradeRequiresApproval !== "No",
        contractUpgradeQuorum: Math.max(1, Math.min(10, Number(form.contractUpgradeQuorum) || 2)),
        contractUpgradeDelaySeconds: Math.max(0, Number(form.contractUpgradeDelaySeconds) || 0),
        contractUpgradeRequireCodeHash: form.contractUpgradeRequireCodeHash !== "No",
        contractUpgradeRequireAdministrator: form.contractUpgradeRequireAdministrator !== "No",
        contractUpgradeApprovedAdministrators: form.contractUpgradeApprovedAdministrators.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeUnknownImplementationAction: form.contractUpgradeUnknownImplementationAction,
        contractArgumentControlsEnabled: form.contractArgumentControlsEnabled === "Yes",
        contractArgumentMode: form.contractArgumentMode,
        contractArgumentUnknownRuleAction: form.contractArgumentUnknownRuleAction,
        contractArgumentUnknownArgumentAction: form.contractArgumentUnknownArgumentAction,
        contractArgumentRules,
        x402ControlsEnabled: form.x402ControlsEnabled !== "No",
        x402ControlMode: form.x402ControlMode,
        x402UnavailableAction: form.x402UnavailableAction,
        x402AllowedVersions: form.x402AllowedVersions.split("\n").map((item) => item.trim()).filter(Boolean),
        x402AllowedSchemes: form.x402AllowedSchemes.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedMethods: form.x402AllowedMethods.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        x402AllowedNetworks: form.x402AllowedNetworks.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedAssets: form.x402AllowedAssets.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        x402AssetDecimals: parseAssetDecimals(form.x402AssetDecimals),
        x402AllowedFacilitators: form.x402AllowedFacilitators.split("\n").map((item) => item.trim()).filter(Boolean),
        x402AllowedMerchants: form.x402AllowedMerchants.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402BlockedMerchants: form.x402BlockedMerchants.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedRecipients: form.x402AllowedRecipients.split("\n").map((item) => item.trim()).filter(Boolean),
        x402MaxPayment: Math.max(0, Number(form.x402MaxPayment) || 0),
        x402DailyLimit: Math.max(0, Number(form.x402DailyLimit) || 0),
        x402MonthlyLimit: Math.max(0, Number(form.x402MonthlyLimit) || 0),
        x402ReviewThreshold: Math.max(0, Number(form.x402ReviewThreshold) || 0),
        x402MaxPaymentsPerHour: Math.max(1, Number(form.x402MaxPaymentsPerHour) || 20),
        x402MaxAuthorizationLifetimeSeconds: Math.max(30, Number(form.x402MaxAuthorizationLifetimeSeconds) || 600),
        x402RequireHttps: form.x402RequireHttps !== "No",
        x402RequirePaymentRequiredHash: form.x402RequirePaymentRequiredHash !== "No",
        x402RequireBodyHashForUnsafeMethods: form.x402RequireBodyHashForUnsafeMethods !== "No",
        x402RequireRequestId: form.x402RequireRequestId !== "No",
        x402RequireClientFingerprint: form.x402RequireClientFingerprint === "Yes",
        x402PreventAmbiguousRetry: form.x402PreventAmbiguousRetry !== "No",
        x402MaxSettlementAttempts: Math.max(1, Number(form.x402MaxSettlementAttempts) || 1),
        complianceControlsEnabled: form.complianceControlsEnabled !== "No",
        complianceControlMode: form.complianceControlMode,
        complianceUnavailableAction: form.complianceUnavailableAction,
        complianceRequiredActions: form.complianceRequiredActions.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceRequireOriginatorAttestation: form.complianceRequireOriginatorAttestation !== "No",
        complianceRequireBeneficiaryAttestation: form.complianceRequireBeneficiaryAttestation !== "No",
        complianceRequireTravelRule: form.complianceRequireTravelRule !== "No",
        complianceTravelRuleThreshold: Math.max(0, Number(form.complianceTravelRuleThreshold) || 0),
        complianceRequireSanctionsScreening: form.complianceRequireSanctionsScreening !== "No",
        complianceAllowedJurisdictions: form.complianceAllowedJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceBlockedJurisdictions: form.complianceBlockedJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceReviewJurisdictions: form.complianceReviewJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceAllowedCounterpartyTypes: form.complianceAllowedCounterpartyTypes.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceAcceptedProviders: form.complianceAcceptedProviders.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceMaxAttestationAgeSeconds: Math.max(60, Number(form.complianceMaxAttestationAgeSeconds) || 86400),
        complianceMaxScreeningAgeSeconds: Math.max(60, Number(form.complianceMaxScreeningAgeSeconds) || 3600),
        complianceMaximumRiskRating: form.complianceMaximumRiskRating,
      },
    });
    setForm({
      name: "",
      agentId: agents[0]?.id || "",
      maxTransaction: "",
      dailyLimit: "",
      approvalThreshold: "",
      limitBasis: typeof window !== "undefined" ? (localStorage.getItem("magen3.defaultLimitUnit") || "Fiat Value") : "Fiat Value",
      referenceCurrency: typeof window !== "undefined" ? (localStorage.getItem("magen3.referenceCurrency") || "USD") : "USD",
      hourlyLimit: "",
      perDestinationLimit: "",
      walletPercentageLimit: "",
      reviewResolutionMode: "Autonomous",
      emergencyControlsEnabled: "Yes",
    automaticPauseEnabled: "No",
    emergencyAutomaticPauseAction: "Blocked",
    emergencyRepeatedBlockThreshold: "5",
    emergencyReplayAttemptThreshold: "1",
    emergencyRequestFrequencyThreshold: "120",
    emergencyLookbackSeconds: "3600",
    emergencySpendingSpikeMultiplier: "5",
    emergencyProviderFailureThreshold: "3",
    emergencyUnresolvedExecutionThreshold: "5",
    emergencyUnresolvedX402Threshold: "3",
    emergencyBridgeFailureThreshold: "3",
    emergencyPauseDurationSeconds: "3600",
    emergencyResumeRequiresApproval: "No",
    emergencyResumeQuorum: "1",
    emergencyPauseOnThreatMatch: "Yes",
    emergencyPauseOnOracleDisagreement: "Yes",
    emergencyPauseOnPrivilegedActionFailure: "Yes",
    approvalWorkflowEnabled: "Yes",
      approvalWorkflowMode: "Single",
      approvalRequiredCount: "1",
      approvalExpiryMinutes: "60",
      approvalAllowOwnerFallback: "Yes",
      approvalSeparationOfDuties: "No",
      approvalRequireRejectComment: "Yes",
      approvalApproverWallets: "",
    requireCryptographicReviewerSignature: "Yes",
    approvalSignatureLifetimeSeconds: "300",
    requireReviewerChainBinding: "Yes",
    requireApprovalDomainSeparation: "Yes",
    approvalSignatureChainName: "casper-test",
    approvalOrganizationalQuorumEnabled: "No",
    approvalGroups: "[]",
    approvalTiers: "[]",
    approvalOrganizationDefaults: "{}",
    approvalEscalationRules: "[]",
    approvalEmergencyGroupIds: "",
    approvalExecutionDelaySeconds: "0",
    approvalExecutionWindowSeconds: "0",
      trustedContracts: "",
      blockedContracts: "",
      allowedEntryPoints: "",
      instructionIntegrityEnabled: "Yes",
    instructionIntegrityMode: "Review",
    requireGoalBindingForActions: "Transfer\nSwap\nStake\nBridge\nx402 Payment\nDAO Treasury Payment\nContract Interaction\nDeposit to Vault",
    requireUserConfirmationForExternalContent: "Yes",
    allowedSourceDomains: "",
    blockedSourceDomains: "",
    externalContentHighRiskAction: "Review",
    allowParameterChangesAfterGoal: "No",
    requireParameterChangeReason: "Yes",
    toolIntegrityEnabled: "Yes",
    toolIntegrityMode: "Review",
    approvedMcpServers: OFFICIAL_MCP_SERVER_BINDING,
    approvedTools: OFFICIAL_MCP_TOOL_BINDINGS,
    requireManifestHash: "Yes",
    requireSchemaHash: "Yes",
    requireTls: "Yes",
    allowToolVersionChanges: "No",
    unknownToolAction: "Review",
    permissionExpansionAction: "Block",
    delegationControlsEnabled: "Yes",
    delegationMode: "Review",
    requireExpiringDelegation: "Yes",
    maximumDelegationLifetime: "3600",
    maximumDelegationDepth: "1",
    allowRedelegation: "No",
    approvedDelegates: "",
    blockedDelegates: "",
    revokedDelegationIds: "",
    unknownDelegateAction: "Review",
    requireScopeBinding: "Yes",
    requireCryptographicDelegationAttestation: "Yes",
    delegationUnavailableAction: "Review",
    rpcIntegrityEnabled: "No",
    rpcIntegrityMode: "Review",
    approvedRpcEndpoints: "https://node.testnet.casper.network/rpc|casper-testnet-primary|casper-test|casper-testnet",
    rpcIntegrityRequireTls: "Yes",
    rpcIntegrityMaximumBlockAgeSeconds: "120",
    rpcIntegrityMinimumProviders: "1",
    rpcIntegrityMaximumHeightDifference: "5",
    rpcIntegrityDisagreementAction: "Block",
    rpcIntegrityUnavailableAction: "Review",
    rpcIntegrityRequireNetworkIdentity: "Yes",
    rpcIntegrityAllowAutomaticFailover: "No",
    feeSafetyEnabled: "No",
    feeSafetyMode: "Review",
    feeSafetyMaximumNetworkFee: "5",
    feeSafetyMaximumGasPrice: "100",
    feeSafetyMaximumPriorityFee: "10",
    feeSafetyApprovedSponsors: "magen3-relayer",
    feeSafetyApprovedPaymasters: "",
    feeSafetySponsorshipUnavailableAction: "Review",
    feeSafetySponsoredBudget: "100",
    feeSafetyMaximumSponsoredOperations: "100",
    feeSafetyMaximumFailedSponsoredOperations: "3",
    feeSafetyLookbackSeconds: "86400",
    feeSafetyRequireSponsorshipExpiry: "Yes",
    feeSafetyRequireSponsorEvidence: "Yes",
    lifecycleControlsEnabled: "Yes",

      lifecycleControlMode: "Enforce",
      lifecycleUnavailableAction: "Warn",
      lifecycleRequireIntentId: "Yes",
      lifecycleRequireIdempotencyKey: "Yes",
      lifecycleRequireCreatedAt: "Yes",
      lifecycleRequireExpiry: "Yes",
      lifecycleRequireSequence: "No",
      lifecyclePreventDuplicateFingerprint: "Yes",
      lifecyclePreventRetryAfterUncertain: "Yes",
      lifecyclePreventParameterMutation: "Yes",
      lifecycleMaxIntentAgeSeconds: "600",
      lifecycleMaxFutureSkewSeconds: "120",
      lifecycleMaxLifetimeSeconds: "900",
      lifecycleReplayWindowSeconds: "86400",
      lifecycleMaxRetryAttempts: "3",
    reconciliationEnabled: "Yes",
    maximumSubmissionAttempts: "3",
    pendingRetryAction: "Block",
    uncertainRetryAction: "Block",
    requiredConfirmations: "1",
    finalityTimeoutSeconds: "3600",
    replacementAllowed: "Yes",
    resourceDeliveryRequired: "No",
      threatIntelligenceMode: "Review",
      threatIntelligenceMinConfidence: "70",
      threatIntelligenceUnavailableAction: "Warn",
      oracleValidationMode: "Review",
      oracleValidationMaxAgeSeconds: "120",
      oracleValidationMaxDeviationBps: "300",
      oracleValidationMaxSourceSpreadBps: "500",
      oracleValidationMinConfidence: "70",
      oracleValidationMinSources: "1",
      oracleValidationUnavailableAction: "Warn",
      bridgeControlMode: "Review",
      bridgeControlUnavailableAction: "Review",
      bridgeAllowedProviders: "",
      bridgeAllowedSourceChains: "casper-test",
      bridgeAllowedDestinationChains: "",
      bridgeBlockedDestinationChains: "",
      bridgeAllowedAssets: "CSPR",
      bridgeMaxAmount: "100",
      bridgeMaxFeeBps: "100",
      bridgeMaxQuoteAgeSeconds: "300",
      bridgeRequireQuoteExpiry: "Yes",
      bridgeMinSourceConfirmations: "2",
      bridgeMinDestinationConfirmations: "12",
      tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Review",
    tokenPermissionMaxApprovalAmount: "0",
    tokenPermissionMaxApprovalToTransactionRatio: "2",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "No",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
    privilegedActionControlsEnabled: "Yes",
    privilegedActionMode: "Review",
    privilegedActionsRequiringReview: "Ownership Transfer\nAdministrator Change\nProxy Upgrade\nImplementation Change\nRole Grant\nRole Revoke\nMint\nPause\nUnpause\nFreeze\nEmergency Withdrawal\nTreasury Withdrawal\nOracle Replacement\nFee Recipient Change\nBridge Validator Change\nPermission Change",
    privilegedActionsBlocked: "",
    approvedAdministrators: "",
    approvedImplementations: "",
    privilegedActionQuorumRules: "",
    unknownPrivilegedAction: "Review",
    contractUpgradeControlsEnabled: "Yes",
    contractUpgradeMode: "Review",
    contractUpgradeApprovedImplementations: "",
    contractUpgradeBlockedImplementations: "",
    contractUpgradeRequiresApproval: "Yes",
    contractUpgradeQuorum: "2",
    contractUpgradeDelaySeconds: "0",
    contractUpgradeRequireCodeHash: "Yes",
    contractUpgradeRequireAdministrator: "Yes",
    contractUpgradeApprovedAdministrators: "",
    contractUpgradeUnknownImplementationAction: "Review",
    contractArgumentControlsEnabled: "No",
    contractArgumentMode: "Review",
    contractArgumentUnknownRuleAction: "Review",
    contractArgumentUnknownArgumentAction: "Block",
    contractArgumentRules: "[]",
    x402ControlsEnabled: "Yes",
      x402ControlMode: "Review",
      x402UnavailableAction: "Review",
      x402AllowedVersions: "2",
      x402AllowedSchemes: "exact",
      x402AllowedMethods: "GET\nHEAD\nPOST",
      x402AllowedNetworks: "eip155:84532",
      x402AllowedAssets: "USDC",
      x402AssetDecimals: "USDC=6",
      x402AllowedFacilitators: "https://x402.org/facilitator",
      x402AllowedMerchants: "api.example.com",
      x402BlockedMerchants: "",
      x402AllowedRecipients: "0x1111111111111111111111111111111111111111",
      x402MaxPayment: "5",
      x402DailyLimit: "25",
      x402MonthlyLimit: "250",
      x402ReviewThreshold: "3",
      x402MaxPaymentsPerHour: "20",
      x402MaxAuthorizationLifetimeSeconds: "600",
      x402RequireHttps: "Yes",
      x402RequirePaymentRequiredHash: "Yes",
      x402RequireBodyHashForUnsafeMethods: "Yes",
      x402RequireRequestId: "Yes",
      x402RequireClientFingerprint: "No",
      x402PreventAmbiguousRetry: "Yes",
      x402MaxSettlementAttempts: "1",
      complianceControlsEnabled: "Yes",
      complianceControlMode: "Review",
      complianceUnavailableAction: "Review",
      complianceRequiredActions: "Transfer\nDAO Treasury Payment\nBridge",
      complianceRequireOriginatorAttestation: "Yes",
      complianceRequireBeneficiaryAttestation: "Yes",
      complianceRequireTravelRule: "Yes",
      complianceTravelRuleThreshold: "1",
      complianceRequireSanctionsScreening: "Yes",
      complianceAllowedJurisdictions: "",
      complianceBlockedJurisdictions: "",
      complianceReviewJurisdictions: "",
      complianceAllowedCounterpartyTypes: "VASP\nOrganization\nSelf-hosted Wallet",
      complianceAcceptedProviders: "",
      complianceMaxAttestationAgeSeconds: "86400",
      complianceMaxScreeningAgeSeconds: "3600",
      complianceMaximumRiskRating: "Medium",
      blockedActions: [],
      riskMode: "Balanced",
    });
    return Boolean(createdPolicy);
  }, [agents, form, onCreatePolicy, walletAddress]);

  const openPolicyEditor = useCallback((policy: Policy) => {
    setPolicyFormError("");
    setEditingPolicy(policy);
    setEditForm({
      name: policy.name,
      maxTransaction: String(policy.maxTransaction),
      dailyLimit: String(policy.dailyLimit),
      approvalThreshold: String(policy.approvalThreshold),
      emergencyControlsEnabled: policy.structuredRules?.emergencyControlsEnabled === false ? "No" : "Yes",
      automaticPauseEnabled: policy.structuredRules?.automaticPauseEnabled === true ? "Yes" : "No",
      emergencyAutomaticPauseAction: String(policy.structuredRules?.emergencyAutomaticPauseAction || "Blocked"),
      emergencyRepeatedBlockThreshold: String(typeof policy.structuredRules?.emergencyRepeatedBlockThreshold === "number" ? policy.structuredRules.emergencyRepeatedBlockThreshold : 5),
      emergencyReplayAttemptThreshold: String(typeof policy.structuredRules?.emergencyReplayAttemptThreshold === "number" ? policy.structuredRules.emergencyReplayAttemptThreshold : 1),
      emergencyRequestFrequencyThreshold: String(typeof policy.structuredRules?.emergencyRequestFrequencyThreshold === "number" ? policy.structuredRules.emergencyRequestFrequencyThreshold : 120),
      emergencyLookbackSeconds: String(typeof policy.structuredRules?.emergencyLookbackSeconds === "number" ? policy.structuredRules.emergencyLookbackSeconds : 3600),
      emergencySpendingSpikeMultiplier: String(typeof policy.structuredRules?.emergencySpendingSpikeMultiplier === "number" ? policy.structuredRules.emergencySpendingSpikeMultiplier : 5),
      emergencyProviderFailureThreshold: String(typeof policy.structuredRules?.emergencyProviderFailureThreshold === "number" ? policy.structuredRules.emergencyProviderFailureThreshold : 3),
      emergencyUnresolvedExecutionThreshold: String(typeof policy.structuredRules?.emergencyUnresolvedExecutionThreshold === "number" ? policy.structuredRules.emergencyUnresolvedExecutionThreshold : 5),
      emergencyUnresolvedX402Threshold: String(typeof policy.structuredRules?.emergencyUnresolvedX402Threshold === "number" ? policy.structuredRules.emergencyUnresolvedX402Threshold : 3),
      emergencyBridgeFailureThreshold: String(typeof policy.structuredRules?.emergencyBridgeFailureThreshold === "number" ? policy.structuredRules.emergencyBridgeFailureThreshold : 3),
      emergencyPauseDurationSeconds: String(typeof policy.structuredRules?.emergencyPauseDurationSeconds === "number" ? policy.structuredRules.emergencyPauseDurationSeconds : 3600),
      emergencyResumeRequiresApproval: policy.structuredRules?.emergencyResumeRequiresApproval === true ? "Yes" : "No",
      emergencyResumeQuorum: String(typeof policy.structuredRules?.emergencyResumeQuorum === "number" ? policy.structuredRules.emergencyResumeQuorum : 1),
      emergencyPauseOnThreatMatch: policy.structuredRules?.emergencyPauseOnThreatMatch === false ? "No" : "Yes",
      emergencyPauseOnOracleDisagreement: policy.structuredRules?.emergencyPauseOnOracleDisagreement === false ? "No" : "Yes",
      emergencyPauseOnPrivilegedActionFailure: policy.structuredRules?.emergencyPauseOnPrivilegedActionFailure === false ? "No" : "Yes",
      reviewResolutionMode: String(policy.structuredRules?.reviewResolutionMode || "Autonomous"),
      approvalWorkflowEnabled: policy.structuredRules?.approvalWorkflowEnabled === true ? "Yes" : "No",
      approvalWorkflowMode: typeof policy.structuredRules?.approvalWorkflowMode === "string" ? policy.structuredRules.approvalWorkflowMode : "Single",
      approvalRequiredCount: String(typeof policy.structuredRules?.approvalRequiredCount === "number" ? policy.structuredRules.approvalRequiredCount : 1),
      approvalExpiryMinutes: String(typeof policy.structuredRules?.approvalExpiryMinutes === "number" ? policy.structuredRules.approvalExpiryMinutes : 60),
      approvalAllowOwnerFallback: policy.structuredRules?.approvalAllowOwnerFallback === false ? "No" : "Yes",
      approvalSeparationOfDuties: policy.structuredRules?.approvalSeparationOfDuties === true ? "Yes" : "No",
      approvalRequireRejectComment: policy.structuredRules?.approvalRequireRejectComment === false ? "No" : "Yes",
      approvalApproverWallets: Array.isArray(policy.structuredRules?.approvalApproverWallets) ? (policy.structuredRules.approvalApproverWallets as string[]).join("\n") : "",
      requireCryptographicReviewerSignature: policy.structuredRules?.requireCryptographicReviewerSignature === true ? "Yes" : "No",
      approvalSignatureLifetimeSeconds: String(typeof policy.structuredRules?.approvalSignatureLifetimeSeconds === "number" ? policy.structuredRules.approvalSignatureLifetimeSeconds : 300),
      requireReviewerChainBinding: policy.structuredRules?.requireReviewerChainBinding === false ? "No" : "Yes",
      requireApprovalDomainSeparation: policy.structuredRules?.requireApprovalDomainSeparation === false ? "No" : "Yes",
      approvalSignatureChainName: String(policy.structuredRules?.approvalSignatureChainName || "casper-test"),
      approvalOrganizationalQuorumEnabled: policy.structuredRules?.approvalOrganizationalQuorumEnabled === true ? "Yes" : "No",
      approvalGroups: formatPolicyJson(policy.structuredRules?.approvalGroups, "[]"),
      approvalTiers: formatPolicyJson(policy.structuredRules?.approvalTiers, "[]"),
      approvalOrganizationDefaults: formatPolicyJson(policy.structuredRules?.approvalOrganizationDefaults, "{}"),
      approvalEscalationRules: formatPolicyJson(policy.structuredRules?.approvalEscalationRules, "[]"),
      approvalEmergencyGroupIds: Array.isArray(policy.structuredRules?.approvalEmergencyGroupIds) ? (policy.structuredRules.approvalEmergencyGroupIds as string[]).join("\n") : "",
      approvalExecutionDelaySeconds: String(typeof policy.structuredRules?.approvalExecutionDelaySeconds === "number" ? policy.structuredRules.approvalExecutionDelaySeconds : 0),
      approvalExecutionWindowSeconds: String(typeof policy.structuredRules?.approvalExecutionWindowSeconds === "number" ? policy.structuredRules.approvalExecutionWindowSeconds : 0),
      trustedContracts: policy.trustedContracts.join("\n"),
      blockedContracts: Array.isArray(policy.structuredRules?.blockedContracts) ? (policy.structuredRules?.blockedContracts as string[]).join("\n") : "",
      allowedEntryPoints: Array.isArray(policy.structuredRules?.allowedEntryPoints) ? (policy.structuredRules?.allowedEntryPoints as string[]).join("\n") : "",
      instructionIntegrityEnabled: policy.structuredRules?.instructionIntegrityEnabled === true ? "Yes" : "No",
      instructionIntegrityMode: String(policy.structuredRules?.instructionIntegrityMode || "Review"),
      requireGoalBindingForActions: Array.isArray(policy.structuredRules?.requireGoalBindingForActions) ? policy.structuredRules.requireGoalBindingForActions.join("\n") : "Transfer\nSwap\nStake\nBridge\nx402 Payment\nDAO Treasury Payment\nContract Interaction\nDeposit to Vault",
      requireUserConfirmationForExternalContent: policy.structuredRules?.requireUserConfirmationForExternalContent === false ? "No" : "Yes",
      allowedSourceDomains: Array.isArray(policy.structuredRules?.allowedSourceDomains) ? policy.structuredRules.allowedSourceDomains.join("\n") : "",
      blockedSourceDomains: Array.isArray(policy.structuredRules?.blockedSourceDomains) ? policy.structuredRules.blockedSourceDomains.join("\n") : "",
      externalContentHighRiskAction: String(policy.structuredRules?.externalContentHighRiskAction || "Review"),
      allowParameterChangesAfterGoal: policy.structuredRules?.allowParameterChangesAfterGoal === true ? "Yes" : "No",
      requireParameterChangeReason: policy.structuredRules?.requireParameterChangeReason === false ? "No" : "Yes",
      toolIntegrityEnabled: policy.structuredRules?.toolIntegrityEnabled === true ? "Yes" : "No",
      toolIntegrityMode: String(policy.structuredRules?.toolIntegrityMode || "Review"),
      approvedMcpServers: Array.isArray(policy.structuredRules?.approvedMcpServers) ? policy.structuredRules.approvedMcpServers.map((item) => typeof item === "string" ? item : [item.id || item.serverId || "", item.url || item.serverUrl || "", item.manifestHash || ""].join("|")).join("\n") : "",
      approvedTools: Array.isArray(policy.structuredRules?.approvedTools) ? policy.structuredRules.approvedTools.map((item) => typeof item === "string" ? item : [item.serverId || item.mcpServerId || "", item.name || item.toolName || "", item.version || item.toolVersion || "", item.manifestHash || "", item.schemaHash || "", item.descriptionHash || "", Array.isArray(item.permissionScopes) ? item.permissionScopes.join(",") : "", Array.isArray(item.credentialScopes) ? item.credentialScopes.join(",") : item.credentialScope || "", item.origin || item.toolOrigin || ""].join("|")).join("\n") : "",
      requireManifestHash: policy.structuredRules?.requireManifestHash === false ? "No" : "Yes",
      requireSchemaHash: policy.structuredRules?.requireSchemaHash === false ? "No" : "Yes",
      requireTls: policy.structuredRules?.requireTls === false ? "No" : "Yes",
      allowToolVersionChanges: policy.structuredRules?.allowToolVersionChanges === true ? "Yes" : "No",
      unknownToolAction: String(policy.structuredRules?.unknownToolAction || "Review"),
      permissionExpansionAction: String(policy.structuredRules?.permissionExpansionAction || "Block"),
      delegationControlsEnabled: policy.structuredRules?.delegationControlsEnabled === true ? "Yes" : "No",
      delegationMode: String(policy.structuredRules?.delegationMode || "Review"),
      requireExpiringDelegation: policy.structuredRules?.requireExpiringDelegation === false ? "No" : "Yes",
      maximumDelegationLifetime: String(policy.structuredRules?.maximumDelegationLifetime || 3600),
      maximumDelegationDepth: String(policy.structuredRules?.maximumDelegationDepth ?? 1),
      allowRedelegation: policy.structuredRules?.allowRedelegation === true ? "Yes" : "No",
      approvedDelegates: Array.isArray(policy.structuredRules?.approvedDelegates) ? policy.structuredRules.approvedDelegates.join("\n") : "",
      blockedDelegates: Array.isArray(policy.structuredRules?.blockedDelegates) ? policy.structuredRules.blockedDelegates.join("\n") : "",
      revokedDelegationIds: Array.isArray(policy.structuredRules?.revokedDelegationIds) ? policy.structuredRules.revokedDelegationIds.join("\n") : "",
      unknownDelegateAction: String(policy.structuredRules?.unknownDelegateAction || "Review"),
      requireScopeBinding: policy.structuredRules?.requireScopeBinding === false ? "No" : "Yes",
      requireCryptographicDelegationAttestation: policy.structuredRules?.requireCryptographicDelegationAttestation === false ? "No" : "Yes",
      delegationUnavailableAction: String(policy.structuredRules?.delegationUnavailableAction || "Review"),
      rpcIntegrityEnabled: policy.structuredRules?.rpcIntegrityEnabled === true ? "Yes" : "No",
      rpcIntegrityMode: String(policy.structuredRules?.rpcIntegrityMode || "Review"),
      approvedRpcEndpoints: Array.isArray(policy.structuredRules?.approvedRpcEndpoints) ? policy.structuredRules.approvedRpcEndpoints.map((item) => typeof item === "string" ? item : [item.endpoint || item.url || "", item.id || item.providerId || "", item.chainName || "", item.networkIdentifier || "", item.genesisHash || ""].join("|")).join("\n") : "",
      rpcIntegrityRequireTls: policy.structuredRules?.rpcIntegrityRequireTls === false ? "No" : "Yes",
      rpcIntegrityMaximumBlockAgeSeconds: String(policy.structuredRules?.rpcIntegrityMaximumBlockAgeSeconds || 120),
      rpcIntegrityMinimumProviders: String(policy.structuredRules?.rpcIntegrityMinimumProviders || 1),
      rpcIntegrityMaximumHeightDifference: String(policy.structuredRules?.rpcIntegrityMaximumHeightDifference ?? 5),
      rpcIntegrityDisagreementAction: String(policy.structuredRules?.rpcIntegrityDisagreementAction || "Block"),
      rpcIntegrityUnavailableAction: String(policy.structuredRules?.rpcIntegrityUnavailableAction || "Review"),
      rpcIntegrityRequireNetworkIdentity: policy.structuredRules?.rpcIntegrityRequireNetworkIdentity === false ? "No" : "Yes",
      rpcIntegrityAllowAutomaticFailover: policy.structuredRules?.rpcIntegrityAllowAutomaticFailover === true ? "Yes" : "No",
      feeSafetyEnabled: policy.structuredRules?.feeSafetyEnabled === true ? "Yes" : "No",
      feeSafetyMode: String(policy.structuredRules?.feeSafetyMode || "Review"),
      feeSafetyMaximumNetworkFee: String(policy.structuredRules?.feeSafetyMaximumNetworkFee ?? 5),
      feeSafetyMaximumGasPrice: String(policy.structuredRules?.feeSafetyMaximumGasPrice ?? 100),
      feeSafetyMaximumPriorityFee: String(policy.structuredRules?.feeSafetyMaximumPriorityFee ?? 10),
      feeSafetyApprovedSponsors: Array.isArray(policy.structuredRules?.feeSafetyApprovedSponsors) ? policy.structuredRules.feeSafetyApprovedSponsors.join("\n") : "",
      feeSafetyApprovedPaymasters: Array.isArray(policy.structuredRules?.feeSafetyApprovedPaymasters) ? policy.structuredRules.feeSafetyApprovedPaymasters.join("\n") : "",
      feeSafetySponsorshipUnavailableAction: String(policy.structuredRules?.feeSafetySponsorshipUnavailableAction || "Review"),
      feeSafetySponsoredBudget: String(policy.structuredRules?.feeSafetySponsoredBudget ?? 100),
      feeSafetyMaximumSponsoredOperations: String(policy.structuredRules?.feeSafetyMaximumSponsoredOperations ?? 100),
      feeSafetyMaximumFailedSponsoredOperations: String(policy.structuredRules?.feeSafetyMaximumFailedSponsoredOperations ?? 3),
      feeSafetyLookbackSeconds: String(policy.structuredRules?.feeSafetyLookbackSeconds ?? 86400),
      feeSafetyRequireSponsorshipExpiry: policy.structuredRules?.feeSafetyRequireSponsorshipExpiry === false ? "No" : "Yes",
      feeSafetyRequireSponsorEvidence: policy.structuredRules?.feeSafetyRequireSponsorEvidence === true ? "Yes" : "No",
      lifecycleControlsEnabled: policy.structuredRules?.lifecycleControlsEnabled === false ? "No" : "Yes",
      lifecycleControlMode: typeof policy.structuredRules?.lifecycleControlMode === "string" ? policy.structuredRules.lifecycleControlMode : "Observe",
      lifecycleUnavailableAction: typeof policy.structuredRules?.lifecycleUnavailableAction === "string" ? policy.structuredRules.lifecycleUnavailableAction : "Warn",
      lifecycleRequireIntentId: policy.structuredRules?.lifecycleRequireIntentId === true ? "Yes" : "No",
      lifecycleRequireIdempotencyKey: policy.structuredRules?.lifecycleRequireIdempotencyKey === true ? "Yes" : "No",
      lifecycleRequireCreatedAt: policy.structuredRules?.lifecycleRequireCreatedAt === true ? "Yes" : "No",
      lifecycleRequireExpiry: policy.structuredRules?.lifecycleRequireExpiry === true ? "Yes" : "No",
      lifecycleRequireSequence: policy.structuredRules?.lifecycleRequireSequence === true ? "Yes" : "No",
      lifecyclePreventDuplicateFingerprint: policy.structuredRules?.lifecyclePreventDuplicateFingerprint === true ? "Yes" : "No",
      lifecyclePreventRetryAfterUncertain: policy.structuredRules?.lifecyclePreventRetryAfterUncertain === false ? "No" : "Yes",
      lifecyclePreventParameterMutation: policy.structuredRules?.lifecyclePreventParameterMutation === false ? "No" : "Yes",
      lifecycleMaxIntentAgeSeconds: String(typeof policy.structuredRules?.lifecycleMaxIntentAgeSeconds === "number" ? policy.structuredRules.lifecycleMaxIntentAgeSeconds : 900),
      lifecycleMaxFutureSkewSeconds: String(typeof policy.structuredRules?.lifecycleMaxFutureSkewSeconds === "number" ? policy.structuredRules.lifecycleMaxFutureSkewSeconds : 300),
      lifecycleMaxLifetimeSeconds: String(typeof policy.structuredRules?.lifecycleMaxLifetimeSeconds === "number" ? policy.structuredRules.lifecycleMaxLifetimeSeconds : 3600),
      lifecycleReplayWindowSeconds: String(typeof policy.structuredRules?.lifecycleReplayWindowSeconds === "number" ? policy.structuredRules.lifecycleReplayWindowSeconds : 86400),
      lifecycleMaxRetryAttempts: String(typeof policy.structuredRules?.lifecycleMaxRetryAttempts === "number" ? policy.structuredRules.lifecycleMaxRetryAttempts : 3),
      reconciliationEnabled: policy.structuredRules?.reconciliationEnabled === false ? "No" : "Yes",
      maximumSubmissionAttempts: String(typeof policy.structuredRules?.maximumSubmissionAttempts === "number" ? policy.structuredRules.maximumSubmissionAttempts : 3),
      pendingRetryAction: typeof policy.structuredRules?.pendingRetryAction === "string" ? policy.structuredRules.pendingRetryAction : "Block",
      uncertainRetryAction: typeof policy.structuredRules?.uncertainRetryAction === "string" ? policy.structuredRules.uncertainRetryAction : "Block",
      requiredConfirmations: String(typeof policy.structuredRules?.requiredConfirmations === "number" ? policy.structuredRules.requiredConfirmations : 1),
      finalityTimeoutSeconds: String(typeof policy.structuredRules?.finalityTimeoutSeconds === "number" ? policy.structuredRules.finalityTimeoutSeconds : 3600),
      replacementAllowed: policy.structuredRules?.replacementAllowed === false ? "No" : "Yes",
      resourceDeliveryRequired: policy.structuredRules?.resourceDeliveryRequired === true ? "Yes" : "No",
      threatIntelligenceMode: typeof policy.structuredRules?.threatIntelligenceMode === "string" ? policy.structuredRules.threatIntelligenceMode : "Observe",
      threatIntelligenceMinConfidence: String(typeof policy.structuredRules?.threatIntelligenceMinConfidence === "number" ? policy.structuredRules.threatIntelligenceMinConfidence : 70),
      threatIntelligenceUnavailableAction: typeof policy.structuredRules?.threatIntelligenceUnavailableAction === "string" ? policy.structuredRules.threatIntelligenceUnavailableAction : "Warn",
      oracleValidationMode: typeof policy.structuredRules?.oracleValidationMode === "string" ? policy.structuredRules.oracleValidationMode : "Observe",
      oracleValidationMaxAgeSeconds: String(typeof policy.structuredRules?.oracleValidationMaxAgeSeconds === "number" ? policy.structuredRules.oracleValidationMaxAgeSeconds : 120),
      oracleValidationMaxDeviationBps: String(typeof policy.structuredRules?.oracleValidationMaxDeviationBps === "number" ? policy.structuredRules.oracleValidationMaxDeviationBps : 300),
      oracleValidationMaxSourceSpreadBps: String(typeof policy.structuredRules?.oracleValidationMaxSourceSpreadBps === "number" ? policy.structuredRules.oracleValidationMaxSourceSpreadBps : 500),
      oracleValidationMinConfidence: String(typeof policy.structuredRules?.oracleValidationMinConfidence === "number" ? policy.structuredRules.oracleValidationMinConfidence : 70),
      oracleValidationMinSources: String(typeof policy.structuredRules?.oracleValidationMinSources === "number" ? policy.structuredRules.oracleValidationMinSources : 1),
      oracleValidationUnavailableAction: typeof policy.structuredRules?.oracleValidationUnavailableAction === "string" ? policy.structuredRules.oracleValidationUnavailableAction : "Warn",
      bridgeControlMode: typeof policy.structuredRules?.bridgeControlMode === "string" ? policy.structuredRules.bridgeControlMode : "Observe",
      bridgeControlUnavailableAction: typeof policy.structuredRules?.bridgeControlUnavailableAction === "string" ? policy.structuredRules.bridgeControlUnavailableAction : "Warn",
      bridgeAllowedProviders: Array.isArray(policy.structuredRules?.bridgeAllowedProviders) ? (policy.structuredRules.bridgeAllowedProviders as string[]).join("\n") : "",
      bridgeAllowedSourceChains: Array.isArray(policy.structuredRules?.bridgeAllowedSourceChains) ? (policy.structuredRules.bridgeAllowedSourceChains as string[]).join("\n") : "casper-test",
      bridgeAllowedDestinationChains: Array.isArray(policy.structuredRules?.bridgeAllowedDestinationChains) ? (policy.structuredRules.bridgeAllowedDestinationChains as string[]).join("\n") : "",
      bridgeBlockedDestinationChains: Array.isArray(policy.structuredRules?.bridgeBlockedDestinationChains) ? (policy.structuredRules.bridgeBlockedDestinationChains as string[]).join("\n") : "",
      bridgeAllowedAssets: Array.isArray(policy.structuredRules?.bridgeAllowedAssets) ? (policy.structuredRules.bridgeAllowedAssets as string[]).join("\n") : "CSPR",
      bridgeMaxAmount: String(typeof policy.structuredRules?.bridgeMaxAmount === "number" ? policy.structuredRules.bridgeMaxAmount : 100),
      bridgeMaxFeeBps: String(typeof policy.structuredRules?.bridgeMaxFeeBps === "number" ? policy.structuredRules.bridgeMaxFeeBps : 100),
      bridgeMaxQuoteAgeSeconds: String(typeof policy.structuredRules?.bridgeMaxQuoteAgeSeconds === "number" ? policy.structuredRules.bridgeMaxQuoteAgeSeconds : 300),
      bridgeRequireQuoteExpiry: policy.structuredRules?.bridgeRequireQuoteExpiry === false ? "No" : "Yes",
      bridgeMinSourceConfirmations: String(typeof policy.structuredRules?.bridgeMinSourceConfirmations === "number" ? policy.structuredRules.bridgeMinSourceConfirmations : 2),
      bridgeMinDestinationConfirmations: String(typeof policy.structuredRules?.bridgeMinDestinationConfirmations === "number" ? policy.structuredRules.bridgeMinDestinationConfirmations : 12),
      tokenPermissionControlsEnabled: policy.structuredRules?.tokenPermissionControlsEnabled === false ? "No" : "Yes",
      tokenPermissionMode: typeof policy.structuredRules?.tokenPermissionMode === "string" ? policy.structuredRules.tokenPermissionMode : "Review",
      tokenPermissionUnknownSpenderAction: typeof policy.structuredRules?.tokenPermissionUnknownSpenderAction === "string" ? policy.structuredRules.tokenPermissionUnknownSpenderAction : "Review",
      tokenPermissionUnlimitedApprovalAction: typeof policy.structuredRules?.tokenPermissionUnlimitedApprovalAction === "string" ? policy.structuredRules.tokenPermissionUnlimitedApprovalAction : "Review",
      tokenPermissionMaxApprovalAmount: String(typeof policy.structuredRules?.tokenPermissionMaxApprovalAmount === "number" ? policy.structuredRules.tokenPermissionMaxApprovalAmount : 0),
      tokenPermissionMaxApprovalToTransactionRatio: String(typeof policy.structuredRules?.tokenPermissionMaxApprovalToTransactionRatio === "number" ? policy.structuredRules.tokenPermissionMaxApprovalToTransactionRatio : 2),
      tokenPermissionMaxLifetimeSeconds: String(typeof policy.structuredRules?.tokenPermissionMaxLifetimeSeconds === "number" ? policy.structuredRules.tokenPermissionMaxLifetimeSeconds : 3600),
      tokenPermissionRequireExpiry: policy.structuredRules?.tokenPermissionRequireExpiry === false ? "No" : "Yes",
      tokenPermissionRequireAllowanceReset: policy.structuredRules?.tokenPermissionRequireAllowanceReset === true ? "Yes" : "No",
      tokenPermissionApprovedSpenders: Array.isArray(policy.structuredRules?.tokenPermissionApprovedSpenders) ? (policy.structuredRules.tokenPermissionApprovedSpenders as string[]).join("\n") : "",
      tokenPermissionBlockedSpenders: Array.isArray(policy.structuredRules?.tokenPermissionBlockedSpenders) ? (policy.structuredRules.tokenPermissionBlockedSpenders as string[]).join("\n") : "",
      tokenPermissionAllowNftOperatorApproval: policy.structuredRules?.tokenPermissionAllowNftOperatorApproval === true ? "Yes" : "No",
      tokenPermissionAllowBatchApproval: policy.structuredRules?.tokenPermissionAllowBatchApproval === true ? "Yes" : "No",
      tokenPermissionRequireChainBinding: policy.structuredRules?.tokenPermissionRequireChainBinding === false ? "No" : "Yes",
      tokenPermissionRequireNonce: policy.structuredRules?.tokenPermissionRequireNonce === false ? "No" : "Yes",
      tokenPermissionMaximumBatchSize: String(typeof policy.structuredRules?.tokenPermissionMaximumBatchSize === "number" ? policy.structuredRules.tokenPermissionMaximumBatchSize : 10),
      privilegedActionControlsEnabled: policy.structuredRules?.privilegedActionControlsEnabled === true ? "Yes" : "No",
      privilegedActionMode: typeof policy.structuredRules?.privilegedActionMode === "string" ? policy.structuredRules.privilegedActionMode : "Review",
      privilegedActionsRequiringReview: Array.isArray(policy.structuredRules?.privilegedActionsRequiringReview) ? (policy.structuredRules.privilegedActionsRequiringReview as string[]).join("\n") : "",
      privilegedActionsBlocked: Array.isArray(policy.structuredRules?.privilegedActionsBlocked) ? (policy.structuredRules.privilegedActionsBlocked as string[]).join("\n") : "",
      approvedAdministrators: Array.isArray(policy.structuredRules?.approvedAdministrators) ? (policy.structuredRules.approvedAdministrators as string[]).join("\n") : "",
      approvedImplementations: Array.isArray(policy.structuredRules?.approvedImplementations) ? (policy.structuredRules.approvedImplementations as string[]).join("\n") : "",
      privilegedActionQuorumRules: stringifyPrivilegedQuorumRules(policy.structuredRules?.privilegedActionQuorumRules),
      unknownPrivilegedAction: typeof policy.structuredRules?.unknownPrivilegedAction === "string" ? policy.structuredRules.unknownPrivilegedAction : "Review",
      contractUpgradeControlsEnabled: policy.structuredRules?.contractUpgradeControlsEnabled === false ? "No" : "Yes",
      contractUpgradeMode: typeof policy.structuredRules?.contractUpgradeMode === "string" ? policy.structuredRules.contractUpgradeMode : "Review",
      contractUpgradeApprovedImplementations: Array.isArray(policy.structuredRules?.contractUpgradeApprovedImplementations) ? policy.structuredRules.contractUpgradeApprovedImplementations.join("\n") : "",
      contractUpgradeBlockedImplementations: Array.isArray(policy.structuredRules?.contractUpgradeBlockedImplementations) ? policy.structuredRules.contractUpgradeBlockedImplementations.join("\n") : "",
      contractUpgradeRequiresApproval: policy.structuredRules?.contractUpgradeRequiresApproval === false ? "No" : "Yes",
      contractUpgradeQuorum: String(typeof policy.structuredRules?.contractUpgradeQuorum === "number" ? policy.structuredRules.contractUpgradeQuorum : 2),
      contractUpgradeDelaySeconds: String(typeof policy.structuredRules?.contractUpgradeDelaySeconds === "number" ? policy.structuredRules.contractUpgradeDelaySeconds : 0),
      contractUpgradeRequireCodeHash: policy.structuredRules?.contractUpgradeRequireCodeHash === false ? "No" : "Yes",
      contractUpgradeRequireAdministrator: policy.structuredRules?.contractUpgradeRequireAdministrator === false ? "No" : "Yes",
      contractUpgradeApprovedAdministrators: Array.isArray(policy.structuredRules?.contractUpgradeApprovedAdministrators) ? policy.structuredRules.contractUpgradeApprovedAdministrators.join("\n") : "",
      contractUpgradeUnknownImplementationAction: typeof policy.structuredRules?.contractUpgradeUnknownImplementationAction === "string" ? policy.structuredRules.contractUpgradeUnknownImplementationAction : "Review",
      contractArgumentControlsEnabled: policy.structuredRules?.contractArgumentControlsEnabled === true ? "Yes" : "No",
      contractArgumentMode: typeof policy.structuredRules?.contractArgumentMode === "string" ? policy.structuredRules.contractArgumentMode : "Review",
      contractArgumentUnknownRuleAction: typeof policy.structuredRules?.contractArgumentUnknownRuleAction === "string" ? policy.structuredRules.contractArgumentUnknownRuleAction : "Review",
      contractArgumentUnknownArgumentAction: typeof policy.structuredRules?.contractArgumentUnknownArgumentAction === "string" ? policy.structuredRules.contractArgumentUnknownArgumentAction : "Block",
      contractArgumentRules: JSON.stringify(Array.isArray(policy.structuredRules?.contractArgumentRules) ? policy.structuredRules.contractArgumentRules : [], null, 2),
      x402ControlsEnabled: policy.structuredRules?.x402ControlsEnabled === false ? "No" : "Yes",
      x402ControlMode: typeof policy.structuredRules?.x402ControlMode === "string" ? policy.structuredRules.x402ControlMode : "Observe",
      x402UnavailableAction: typeof policy.structuredRules?.x402UnavailableAction === "string" ? policy.structuredRules.x402UnavailableAction : "Warn",
      x402AllowedVersions: Array.isArray(policy.structuredRules?.x402AllowedVersions) ? (policy.structuredRules.x402AllowedVersions as string[]).join("\n") : "2",
      x402AllowedSchemes: Array.isArray(policy.structuredRules?.x402AllowedSchemes) ? (policy.structuredRules.x402AllowedSchemes as string[]).join("\n") : "exact",
      x402AllowedMethods: Array.isArray(policy.structuredRules?.x402AllowedMethods) ? (policy.structuredRules.x402AllowedMethods as string[]).join("\n") : "GET\nHEAD\nPOST",
      x402AllowedNetworks: Array.isArray(policy.structuredRules?.x402AllowedNetworks) ? (policy.structuredRules.x402AllowedNetworks as string[]).join("\n") : "",
      x402AllowedAssets: Array.isArray(policy.structuredRules?.x402AllowedAssets) ? (policy.structuredRules.x402AllowedAssets as string[]).join("\n") : "USDC",
      x402AssetDecimals: stringifyAssetDecimals(policy.structuredRules?.x402AssetDecimals),
      x402AllowedFacilitators: Array.isArray(policy.structuredRules?.x402AllowedFacilitators) ? (policy.structuredRules.x402AllowedFacilitators as string[]).join("\n") : "",
      x402AllowedMerchants: Array.isArray(policy.structuredRules?.x402AllowedMerchants) ? (policy.structuredRules.x402AllowedMerchants as string[]).join("\n") : "",
      x402BlockedMerchants: Array.isArray(policy.structuredRules?.x402BlockedMerchants) ? (policy.structuredRules.x402BlockedMerchants as string[]).join("\n") : "",
      x402AllowedRecipients: Array.isArray(policy.structuredRules?.x402AllowedRecipients) ? (policy.structuredRules.x402AllowedRecipients as string[]).join("\n") : "",
      x402MaxPayment: String(typeof policy.structuredRules?.x402MaxPayment === "number" ? policy.structuredRules.x402MaxPayment : 0),
      x402DailyLimit: String(typeof policy.structuredRules?.x402DailyLimit === "number" ? policy.structuredRules.x402DailyLimit : 0),
      x402MonthlyLimit: String(typeof policy.structuredRules?.x402MonthlyLimit === "number" ? policy.structuredRules.x402MonthlyLimit : 0),
      x402ReviewThreshold: String(typeof policy.structuredRules?.x402ReviewThreshold === "number" ? policy.structuredRules.x402ReviewThreshold : 0),
      x402MaxPaymentsPerHour: String(typeof policy.structuredRules?.x402MaxPaymentsPerHour === "number" ? policy.structuredRules.x402MaxPaymentsPerHour : 20),
      x402MaxAuthorizationLifetimeSeconds: String(typeof policy.structuredRules?.x402MaxAuthorizationLifetimeSeconds === "number" ? policy.structuredRules.x402MaxAuthorizationLifetimeSeconds : 600),
      x402RequireHttps: policy.structuredRules?.x402RequireHttps === false ? "No" : "Yes",
      x402RequirePaymentRequiredHash: policy.structuredRules?.x402RequirePaymentRequiredHash === false ? "No" : "Yes",
      x402RequireBodyHashForUnsafeMethods: policy.structuredRules?.x402RequireBodyHashForUnsafeMethods === false ? "No" : "Yes",
      x402RequireRequestId: policy.structuredRules?.x402RequireRequestId === false ? "No" : "Yes",
      x402RequireClientFingerprint: policy.structuredRules?.x402RequireClientFingerprint === true ? "Yes" : "No",
      x402PreventAmbiguousRetry: policy.structuredRules?.x402PreventAmbiguousRetry === false ? "No" : "Yes",
      x402MaxSettlementAttempts: String(typeof policy.structuredRules?.x402MaxSettlementAttempts === "number" ? policy.structuredRules.x402MaxSettlementAttempts : 1),
      complianceControlsEnabled: policy.structuredRules?.complianceControlsEnabled === false ? "No" : "Yes",
      complianceControlMode: typeof policy.structuredRules?.complianceControlMode === "string" ? policy.structuredRules.complianceControlMode : "Observe",
      complianceUnavailableAction: typeof policy.structuredRules?.complianceUnavailableAction === "string" ? policy.structuredRules.complianceUnavailableAction : "Warn",
      complianceRequiredActions: Array.isArray(policy.structuredRules?.complianceRequiredActions) ? (policy.structuredRules.complianceRequiredActions as string[]).join("\n") : "",
      complianceRequireOriginatorAttestation: policy.structuredRules?.complianceRequireOriginatorAttestation === false ? "No" : "Yes",
      complianceRequireBeneficiaryAttestation: policy.structuredRules?.complianceRequireBeneficiaryAttestation === false ? "No" : "Yes",
      complianceRequireTravelRule: policy.structuredRules?.complianceRequireTravelRule === false ? "No" : "Yes",
      complianceTravelRuleThreshold: String(typeof policy.structuredRules?.complianceTravelRuleThreshold === "number" ? policy.structuredRules.complianceTravelRuleThreshold : 1),
      complianceRequireSanctionsScreening: policy.structuredRules?.complianceRequireSanctionsScreening === false ? "No" : "Yes",
      complianceAllowedJurisdictions: Array.isArray(policy.structuredRules?.complianceAllowedJurisdictions) ? (policy.structuredRules.complianceAllowedJurisdictions as string[]).join("\n") : "",
      complianceBlockedJurisdictions: Array.isArray(policy.structuredRules?.complianceBlockedJurisdictions) ? (policy.structuredRules.complianceBlockedJurisdictions as string[]).join("\n") : "",
      complianceReviewJurisdictions: Array.isArray(policy.structuredRules?.complianceReviewJurisdictions) ? (policy.structuredRules.complianceReviewJurisdictions as string[]).join("\n") : "",
      complianceAllowedCounterpartyTypes: Array.isArray(policy.structuredRules?.complianceAllowedCounterpartyTypes) ? (policy.structuredRules.complianceAllowedCounterpartyTypes as string[]).join("\n") : "VASP\nOrganization\nSelf-hosted Wallet",
      complianceAcceptedProviders: Array.isArray(policy.structuredRules?.complianceAcceptedProviders) ? (policy.structuredRules.complianceAcceptedProviders as string[]).join("\n") : "",
      complianceMaxAttestationAgeSeconds: String(typeof policy.structuredRules?.complianceMaxAttestationAgeSeconds === "number" ? policy.structuredRules.complianceMaxAttestationAgeSeconds : 86400),
      complianceMaxScreeningAgeSeconds: String(typeof policy.structuredRules?.complianceMaxScreeningAgeSeconds === "number" ? policy.structuredRules.complianceMaxScreeningAgeSeconds : 3600),
      complianceMaximumRiskRating: typeof policy.structuredRules?.complianceMaximumRiskRating === "string" ? policy.structuredRules.complianceMaximumRiskRating : "Medium",
      blockedActions: policy.blockedActions,
      riskMode: policy.riskMode,
      status: policy.status,
    });
  }, []);

  const savePolicyEdit = useCallback(async () => {
    if (!editingPolicy || !editForm.name.trim()) return;
    setPolicyFormError("");
    let organizationalFields: ReturnType<typeof parseOrganizationalApprovalFields>;
    let contractArgumentRules: unknown[];
    try {
      organizationalFields = parseOrganizationalApprovalFields(editForm);
      contractArgumentRules = parseContractArgumentRules(editForm.contractArgumentRules);
    } catch (error) {
      setPolicyFormError(error instanceof Error ? error.message : "The organizational approval configuration is invalid.");
      return;
    }
    await onUpdatePolicy(editingPolicy.id, {
      name: editForm.name,
      maxTransaction: Number(editForm.maxTransaction) || editingPolicy.maxTransaction,
      dailyLimit: Number(editForm.dailyLimit) || editingPolicy.dailyLimit,
      approvalThreshold: Number(editForm.approvalThreshold) || editingPolicy.approvalThreshold,
      trustedContracts: editForm.trustedContracts
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      blockedActions: editForm.blockedActions,
      riskMode: editForm.riskMode,
      status: editForm.status,
      structuredRules: {
        ...(editingPolicy.structuredRules || {}),
        blockedContracts: editForm.blockedContracts.split("\n").map((item) => item.trim()).filter(Boolean),
        allowedEntryPoints: editForm.allowedEntryPoints.split("\n").map((item) => item.trim()).filter(Boolean),
        emergencyControlsEnabled: editForm.emergencyControlsEnabled !== "No",
        automaticPauseEnabled: editForm.automaticPauseEnabled === "Yes",
        emergencyAutomaticPauseAction: editForm.emergencyAutomaticPauseAction,
        emergencyRepeatedBlockThreshold: Math.max(1, Number(editForm.emergencyRepeatedBlockThreshold) || 5),
        emergencyReplayAttemptThreshold: Math.max(1, Number(editForm.emergencyReplayAttemptThreshold) || 1),
        emergencyRequestFrequencyThreshold: Math.max(1, Number(editForm.emergencyRequestFrequencyThreshold) || 120),
        emergencyLookbackSeconds: Math.max(60, Number(editForm.emergencyLookbackSeconds) || 3600),
        emergencySpendingSpikeMultiplier: Math.max(1, Number(editForm.emergencySpendingSpikeMultiplier) || 5),
        emergencyProviderFailureThreshold: Math.max(1, Number(editForm.emergencyProviderFailureThreshold) || 3),
        emergencyUnresolvedExecutionThreshold: Math.max(1, Number(editForm.emergencyUnresolvedExecutionThreshold) || 5),
        emergencyUnresolvedX402Threshold: Math.max(1, Number(editForm.emergencyUnresolvedX402Threshold) || 3),
        emergencyBridgeFailureThreshold: Math.max(1, Number(editForm.emergencyBridgeFailureThreshold) || 3),
        emergencyPauseDurationSeconds: Math.max(0, Number(editForm.emergencyPauseDurationSeconds) || 3600),
        emergencyResumeRequiresApproval: editForm.emergencyResumeRequiresApproval === "Yes",
        emergencyResumeQuorum: Math.max(1, Math.min(10, Number(editForm.emergencyResumeQuorum) || 1)),
        emergencyPauseOnThreatMatch: editForm.emergencyPauseOnThreatMatch !== "No",
        emergencyPauseOnOracleDisagreement: editForm.emergencyPauseOnOracleDisagreement !== "No",
        emergencyPauseOnPrivilegedActionFailure: editForm.emergencyPauseOnPrivilegedActionFailure !== "No",
        reviewResolutionMode: editForm.reviewResolutionMode || "Autonomous",
        approvalWorkflowEnabled: editForm.approvalWorkflowEnabled !== "No",
        approvalWorkflowMode: editForm.approvalWorkflowMode,
        approvalRequiredCount: Math.max(1, Math.min(10, Number(editForm.approvalRequiredCount) || 1)),
        approvalExpiryMinutes: Math.max(5, Math.min(10080, Number(editForm.approvalExpiryMinutes) || 60)),
        approvalAllowOwnerFallback: editForm.approvalAllowOwnerFallback !== "No",
        approvalSeparationOfDuties: editForm.approvalSeparationOfDuties === "Yes",
        approvalRequireRejectComment: editForm.approvalRequireRejectComment !== "No",
        approvalApproverWallets: editForm.approvalApproverWallets.split("\n").map((item) => item.trim()).filter(Boolean),
        requireCryptographicReviewerSignature: editForm.requireCryptographicReviewerSignature !== "No",
        approvalSignatureLifetimeSeconds: Math.max(30, Math.min(1800, Number(editForm.approvalSignatureLifetimeSeconds) || 300)),
        requireReviewerChainBinding: editForm.requireReviewerChainBinding !== "No",
        requireApprovalDomainSeparation: editForm.requireApprovalDomainSeparation !== "No",
        approvalSignatureChainName: editForm.approvalSignatureChainName.trim() || "casper-test",
        approvalOrganizationalQuorumEnabled: editForm.approvalOrganizationalQuorumEnabled === "Yes",
        approvalGroups: organizationalFields.groups,
        approvalTiers: organizationalFields.tiers,
        approvalOrganizationDefaults: organizationalFields.defaults,
        approvalEscalationRules: organizationalFields.escalations,
        approvalEmergencyGroupIds: organizationalFields.emergencyGroupIds,
        approvalExecutionDelaySeconds: Math.max(0, Number(editForm.approvalExecutionDelaySeconds) || 0),
        approvalExecutionWindowSeconds: Math.max(0, Number(editForm.approvalExecutionWindowSeconds) || 0),
        instructionIntegrityEnabled: editForm.instructionIntegrityEnabled !== "No",
        instructionIntegrityMode: editForm.instructionIntegrityMode,
        requireGoalBindingForActions: editForm.requireGoalBindingForActions.split("\n").map((item) => item.trim()).filter(Boolean),
        requireUserConfirmationForExternalContent: editForm.requireUserConfirmationForExternalContent !== "No",
        allowedSourceDomains: editForm.allowedSourceDomains.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        blockedSourceDomains: editForm.blockedSourceDomains.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        externalContentHighRiskAction: editForm.externalContentHighRiskAction,
        allowParameterChangesAfterGoal: editForm.allowParameterChangesAfterGoal === "Yes",
        requireParameterChangeReason: editForm.requireParameterChangeReason !== "No",
        toolIntegrityEnabled: editForm.toolIntegrityEnabled !== "No",
        toolIntegrityMode: editForm.toolIntegrityMode,
        approvedMcpServers: editForm.approvedMcpServers.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedTools: editForm.approvedTools.split("\n").map((item) => item.trim()).filter(Boolean),
        requireManifestHash: editForm.requireManifestHash !== "No",
        requireSchemaHash: editForm.requireSchemaHash !== "No",
        requireTls: editForm.requireTls !== "No",
        allowToolVersionChanges: editForm.allowToolVersionChanges === "Yes",
        unknownToolAction: editForm.unknownToolAction,
        permissionExpansionAction: editForm.permissionExpansionAction,
        delegationControlsEnabled: editForm.delegationControlsEnabled !== "No",
        delegationMode: editForm.delegationMode,
        requireExpiringDelegation: editForm.requireExpiringDelegation !== "No",
        maximumDelegationLifetime: Number(editForm.maximumDelegationLifetime || 3600),
        maximumDelegationDepth: Number(editForm.maximumDelegationDepth || 1),
        allowRedelegation: editForm.allowRedelegation === "Yes",
        approvedDelegates: editForm.approvedDelegates.split("\n").map((item) => item.trim()).filter(Boolean),
        blockedDelegates: editForm.blockedDelegates.split("\n").map((item) => item.trim()).filter(Boolean),
        revokedDelegationIds: editForm.revokedDelegationIds.split("\n").map((item) => item.trim()).filter(Boolean),
        unknownDelegateAction: editForm.unknownDelegateAction,
        requireScopeBinding: editForm.requireScopeBinding !== "No",
        requireCryptographicDelegationAttestation: editForm.requireCryptographicDelegationAttestation !== "No",
        delegationUnavailableAction: editForm.delegationUnavailableAction,
        rpcIntegrityEnabled: editForm.rpcIntegrityEnabled === "Yes",
        rpcIntegrityMode: editForm.rpcIntegrityMode,
        approvedRpcEndpoints: editForm.approvedRpcEndpoints.split("\n").map((item) => item.trim()).filter(Boolean),
        rpcIntegrityRequireTls: editForm.rpcIntegrityRequireTls !== "No",
        rpcIntegrityMaximumBlockAgeSeconds: Math.max(5, Number(editForm.rpcIntegrityMaximumBlockAgeSeconds) || 120),
        rpcIntegrityMinimumProviders: Math.max(1, Math.min(10, Number(editForm.rpcIntegrityMinimumProviders) || 1)),
        rpcIntegrityMaximumHeightDifference: Math.max(0, Number(editForm.rpcIntegrityMaximumHeightDifference) || 5),
        rpcIntegrityDisagreementAction: editForm.rpcIntegrityDisagreementAction,
        rpcIntegrityUnavailableAction: editForm.rpcIntegrityUnavailableAction,
        rpcIntegrityRequireNetworkIdentity: editForm.rpcIntegrityRequireNetworkIdentity !== "No",
        rpcIntegrityAllowAutomaticFailover: editForm.rpcIntegrityAllowAutomaticFailover === "Yes",
        feeSafetyEnabled: editForm.feeSafetyEnabled === "Yes",
        feeSafetyMode: editForm.feeSafetyMode,
        feeSafetyMaximumNetworkFee: Number(editForm.feeSafetyMaximumNetworkFee) > 0 ? Number(editForm.feeSafetyMaximumNetworkFee) : null,
        feeSafetyMaximumGasPrice: Number(editForm.feeSafetyMaximumGasPrice) > 0 ? Number(editForm.feeSafetyMaximumGasPrice) : null,
        feeSafetyMaximumPriorityFee: Number(editForm.feeSafetyMaximumPriorityFee) >= 0 ? Number(editForm.feeSafetyMaximumPriorityFee) : null,
        feeSafetyApprovedSponsors: editForm.feeSafetyApprovedSponsors.split("\n").map((item) => item.trim()).filter(Boolean),
        feeSafetyApprovedPaymasters: editForm.feeSafetyApprovedPaymasters.split("\n").map((item) => item.trim()).filter(Boolean),
        feeSafetySponsorshipUnavailableAction: editForm.feeSafetySponsorshipUnavailableAction,
        feeSafetySponsoredBudget: Number(editForm.feeSafetySponsoredBudget) > 0 ? Number(editForm.feeSafetySponsoredBudget) : null,
        feeSafetyMaximumSponsoredOperations: Math.max(1, Number(editForm.feeSafetyMaximumSponsoredOperations) || 100),
        feeSafetyMaximumFailedSponsoredOperations: Math.max(0, Number(editForm.feeSafetyMaximumFailedSponsoredOperations) || 0),
        feeSafetyLookbackSeconds: Math.max(60, Number(editForm.feeSafetyLookbackSeconds) || 86400),
        feeSafetyRequireSponsorshipExpiry: editForm.feeSafetyRequireSponsorshipExpiry !== "No",
        feeSafetyRequireSponsorEvidence: editForm.feeSafetyRequireSponsorEvidence === "Yes",
        lifecycleControlsEnabled: editForm.lifecycleControlsEnabled !== "No",
        lifecycleControlMode: editForm.lifecycleControlMode,
        lifecycleUnavailableAction: editForm.lifecycleUnavailableAction,
        lifecycleRequireIntentId: editForm.lifecycleRequireIntentId !== "No",
        lifecycleRequireIdempotencyKey: editForm.lifecycleRequireIdempotencyKey !== "No",
        lifecycleRequireCreatedAt: editForm.lifecycleRequireCreatedAt !== "No",
        lifecycleRequireExpiry: editForm.lifecycleRequireExpiry !== "No",
        lifecycleRequireSequence: editForm.lifecycleRequireSequence === "Yes",
        lifecyclePreventDuplicateFingerprint: editForm.lifecyclePreventDuplicateFingerprint !== "No",
        lifecyclePreventRetryAfterUncertain: editForm.lifecyclePreventRetryAfterUncertain !== "No",
        lifecyclePreventParameterMutation: editForm.lifecyclePreventParameterMutation !== "No",
        lifecycleMaxIntentAgeSeconds: Math.max(30, Number(editForm.lifecycleMaxIntentAgeSeconds) || 600),
        lifecycleMaxFutureSkewSeconds: Math.max(0, Number(editForm.lifecycleMaxFutureSkewSeconds) || 120),
        lifecycleMaxLifetimeSeconds: Math.max(30, Number(editForm.lifecycleMaxLifetimeSeconds) || 900),
        lifecycleReplayWindowSeconds: Math.max(60, Number(editForm.lifecycleReplayWindowSeconds) || 86400),
        lifecycleMaxRetryAttempts: Math.max(0, Number(editForm.lifecycleMaxRetryAttempts) || 3),
        reconciliationEnabled: editForm.reconciliationEnabled !== "No",
        maximumSubmissionAttempts: Math.max(1, Math.min(100, Number(editForm.maximumSubmissionAttempts) || 3)),
        pendingRetryAction: editForm.pendingRetryAction,
        uncertainRetryAction: editForm.uncertainRetryAction,
        requiredConfirmations: Math.max(1, Math.min(10000, Number(editForm.requiredConfirmations) || 1)),
        finalityTimeoutSeconds: Math.max(30, Math.min(2592000, Number(editForm.finalityTimeoutSeconds) || 3600)),
        replacementAllowed: editForm.replacementAllowed !== "No",
        resourceDeliveryRequired: editForm.resourceDeliveryRequired === "Yes",
        threatIntelligenceMode: editForm.threatIntelligenceMode,
        threatIntelligenceMinConfidence: clampPercentage(editForm.threatIntelligenceMinConfidence),
        threatIntelligenceUnavailableAction: editForm.threatIntelligenceUnavailableAction,
        oracleValidationMode: editForm.oracleValidationMode,
        oracleValidationMaxAgeSeconds: Math.max(5, Number(editForm.oracleValidationMaxAgeSeconds) || 120),
        oracleValidationMaxDeviationBps: Math.max(1, Math.min(10000, Number(editForm.oracleValidationMaxDeviationBps) || 300)),
        oracleValidationMaxSourceSpreadBps: Math.max(1, Math.min(10000, Number(editForm.oracleValidationMaxSourceSpreadBps) || 500)),
        oracleValidationMinConfidence: clampPercentage(editForm.oracleValidationMinConfidence),
        oracleValidationMinSources: Math.max(1, Math.min(20, Number(editForm.oracleValidationMinSources) || 1)),
        oracleValidationUnavailableAction: editForm.oracleValidationUnavailableAction,
        bridgeControlMode: editForm.bridgeControlMode,
        bridgeControlUnavailableAction: editForm.bridgeControlUnavailableAction,
        bridgeAllowedProviders: editForm.bridgeAllowedProviders.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedSourceChains: editForm.bridgeAllowedSourceChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedDestinationChains: editForm.bridgeAllowedDestinationChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeBlockedDestinationChains: editForm.bridgeBlockedDestinationChains.split("\n").map((item) => item.trim()).filter(Boolean),
        bridgeAllowedAssets: editForm.bridgeAllowedAssets.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        bridgeMaxAmount: Math.max(0, Number(editForm.bridgeMaxAmount) || 0),
        bridgeMaxFeeBps: Math.max(0, Math.min(10000, Number(editForm.bridgeMaxFeeBps) || 100)),
        bridgeMaxQuoteAgeSeconds: Math.max(5, Number(editForm.bridgeMaxQuoteAgeSeconds) || 300),
        bridgeRequireQuoteExpiry: editForm.bridgeRequireQuoteExpiry !== "No",
        bridgeMinSourceConfirmations: Math.max(0, Number(editForm.bridgeMinSourceConfirmations) || 0),
        bridgeMinDestinationConfirmations: Math.max(0, Number(editForm.bridgeMinDestinationConfirmations) || 0),
        tokenPermissionControlsEnabled: editForm.tokenPermissionControlsEnabled !== "No",
        tokenPermissionMode: editForm.tokenPermissionMode,
        tokenPermissionUnknownSpenderAction: editForm.tokenPermissionUnknownSpenderAction,
        tokenPermissionUnlimitedApprovalAction: editForm.tokenPermissionUnlimitedApprovalAction,
        tokenPermissionMaxApprovalAmount: Math.max(0, Number(editForm.tokenPermissionMaxApprovalAmount) || 0),
        tokenPermissionMaxApprovalToTransactionRatio: Math.max(0, Number(editForm.tokenPermissionMaxApprovalToTransactionRatio) || 2),
        tokenPermissionMaxLifetimeSeconds: Math.max(0, Number(editForm.tokenPermissionMaxLifetimeSeconds) || 3600),
        tokenPermissionRequireExpiry: editForm.tokenPermissionRequireExpiry !== "No",
        tokenPermissionRequireAllowanceReset: editForm.tokenPermissionRequireAllowanceReset === "Yes",
        tokenPermissionApprovedSpenders: editForm.tokenPermissionApprovedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionBlockedSpenders: editForm.tokenPermissionBlockedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionAllowNftOperatorApproval: editForm.tokenPermissionAllowNftOperatorApproval === "Yes",
        tokenPermissionAllowBatchApproval: editForm.tokenPermissionAllowBatchApproval === "Yes",
        tokenPermissionRequireChainBinding: editForm.tokenPermissionRequireChainBinding !== "No",
        tokenPermissionRequireNonce: editForm.tokenPermissionRequireNonce !== "No",
        tokenPermissionMaximumBatchSize: Math.max(1, Math.min(100, Number(editForm.tokenPermissionMaximumBatchSize) || 10)),
        privilegedActionControlsEnabled: editForm.privilegedActionControlsEnabled !== "No",
        privilegedActionMode: editForm.privilegedActionMode,
        privilegedActionsRequiringReview: editForm.privilegedActionsRequiringReview.split("\n").map((item) => item.trim()).filter(Boolean),
        privilegedActionsBlocked: editForm.privilegedActionsBlocked.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedAdministrators: editForm.approvedAdministrators.split("\n").map((item) => item.trim()).filter(Boolean),
        approvedImplementations: editForm.approvedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        privilegedActionQuorumRules: parsePrivilegedQuorumRules(editForm.privilegedActionQuorumRules),
        unknownPrivilegedAction: editForm.unknownPrivilegedAction,
        contractUpgradeControlsEnabled: editForm.contractUpgradeControlsEnabled !== "No",
        contractUpgradeMode: editForm.contractUpgradeMode,
        contractUpgradeApprovedImplementations: editForm.contractUpgradeApprovedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeBlockedImplementations: editForm.contractUpgradeBlockedImplementations.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeRequiresApproval: editForm.contractUpgradeRequiresApproval !== "No",
        contractUpgradeQuorum: Math.max(1, Math.min(10, Number(editForm.contractUpgradeQuorum) || 2)),
        contractUpgradeDelaySeconds: Math.max(0, Number(editForm.contractUpgradeDelaySeconds) || 0),
        contractUpgradeRequireCodeHash: editForm.contractUpgradeRequireCodeHash !== "No",
        contractUpgradeRequireAdministrator: editForm.contractUpgradeRequireAdministrator !== "No",
        contractUpgradeApprovedAdministrators: editForm.contractUpgradeApprovedAdministrators.split("\n").map((item) => item.trim()).filter(Boolean),
        contractUpgradeUnknownImplementationAction: editForm.contractUpgradeUnknownImplementationAction,
        contractArgumentControlsEnabled: editForm.contractArgumentControlsEnabled === "Yes",
        contractArgumentMode: editForm.contractArgumentMode,
        contractArgumentUnknownRuleAction: editForm.contractArgumentUnknownRuleAction,
        contractArgumentUnknownArgumentAction: editForm.contractArgumentUnknownArgumentAction,
        contractArgumentRules,
        x402ControlsEnabled: editForm.x402ControlsEnabled !== "No",
        x402ControlMode: editForm.x402ControlMode,
        x402UnavailableAction: editForm.x402UnavailableAction,
        x402AllowedVersions: editForm.x402AllowedVersions.split("\n").map((item) => item.trim()).filter(Boolean),
        x402AllowedSchemes: editForm.x402AllowedSchemes.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedMethods: editForm.x402AllowedMethods.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        x402AllowedNetworks: editForm.x402AllowedNetworks.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedAssets: editForm.x402AllowedAssets.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        x402AssetDecimals: parseAssetDecimals(editForm.x402AssetDecimals),
        x402AllowedFacilitators: editForm.x402AllowedFacilitators.split("\n").map((item) => item.trim()).filter(Boolean),
        x402AllowedMerchants: editForm.x402AllowedMerchants.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402BlockedMerchants: editForm.x402BlockedMerchants.split("\n").map((item) => item.trim().toLowerCase()).filter(Boolean),
        x402AllowedRecipients: editForm.x402AllowedRecipients.split("\n").map((item) => item.trim()).filter(Boolean),
        x402MaxPayment: Math.max(0, Number(editForm.x402MaxPayment) || 0),
        x402DailyLimit: Math.max(0, Number(editForm.x402DailyLimit) || 0),
        x402MonthlyLimit: Math.max(0, Number(editForm.x402MonthlyLimit) || 0),
        x402ReviewThreshold: Math.max(0, Number(editForm.x402ReviewThreshold) || 0),
        x402MaxPaymentsPerHour: Math.max(1, Number(editForm.x402MaxPaymentsPerHour) || 20),
        x402MaxAuthorizationLifetimeSeconds: Math.max(30, Number(editForm.x402MaxAuthorizationLifetimeSeconds) || 600),
        x402RequireHttps: editForm.x402RequireHttps !== "No",
        x402RequirePaymentRequiredHash: editForm.x402RequirePaymentRequiredHash !== "No",
        x402RequireBodyHashForUnsafeMethods: editForm.x402RequireBodyHashForUnsafeMethods !== "No",
        x402RequireRequestId: editForm.x402RequireRequestId !== "No",
        x402RequireClientFingerprint: editForm.x402RequireClientFingerprint === "Yes",
        x402PreventAmbiguousRetry: editForm.x402PreventAmbiguousRetry !== "No",
        x402MaxSettlementAttempts: Math.max(1, Number(editForm.x402MaxSettlementAttempts) || 1),
        complianceControlsEnabled: editForm.complianceControlsEnabled !== "No",
        complianceControlMode: editForm.complianceControlMode,
        complianceUnavailableAction: editForm.complianceUnavailableAction,
        complianceRequiredActions: editForm.complianceRequiredActions.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceRequireOriginatorAttestation: editForm.complianceRequireOriginatorAttestation !== "No",
        complianceRequireBeneficiaryAttestation: editForm.complianceRequireBeneficiaryAttestation !== "No",
        complianceRequireTravelRule: editForm.complianceRequireTravelRule !== "No",
        complianceTravelRuleThreshold: Math.max(0, Number(editForm.complianceTravelRuleThreshold) || 0),
        complianceRequireSanctionsScreening: editForm.complianceRequireSanctionsScreening !== "No",
        complianceAllowedJurisdictions: editForm.complianceAllowedJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceBlockedJurisdictions: editForm.complianceBlockedJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceReviewJurisdictions: editForm.complianceReviewJurisdictions.split("\n").map((item) => item.trim().toUpperCase()).filter(Boolean),
        complianceAllowedCounterpartyTypes: editForm.complianceAllowedCounterpartyTypes.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceAcceptedProviders: editForm.complianceAcceptedProviders.split("\n").map((item) => item.trim()).filter(Boolean),
        complianceMaxAttestationAgeSeconds: Math.max(60, Number(editForm.complianceMaxAttestationAgeSeconds) || 86400),
        complianceMaxScreeningAgeSeconds: Math.max(60, Number(editForm.complianceMaxScreeningAgeSeconds) || 3600),
        complianceMaximumRiskRating: editForm.complianceMaximumRiskRating,
      },
    });
    setEditingPolicy(null);
  }, [editForm, editingPolicy, onUpdatePolicy]);

  const submitApprovalResponse = useCallback(async (approval: ApprovalRequest, response: "Approve" | "Reject") => {
    const comment = approvalComments[approval.id] || "";
    if (response === "Reject" && approval.reviewContext?.requireRejectComment !== false && !comment.trim()) {
      setApprovalError("A rejection comment is required by the active policy before signing.");
      return;
    }
    setApprovalBusy(approval.id);
    setApprovalError("");
    try {
      await onRespondApproval(approval.id, response, comment);
      setApprovalComments((current) => ({ ...current, [approval.id]: "" }));
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to update the approval request.");
    } finally {
      setApprovalBusy("");
    }
  }, [approvalComments, onRespondApproval]);

  const pendingApprovals = approvals.filter((approval) => ["Pending", "Configuration Required"].includes(approval.reviewStatus));
  const resolvedApprovals = approvals.filter((approval) => !["Pending", "Configuration Required"].includes(approval.reviewStatus));
  const [policiesTab, setPoliciesTab] = useState<"policies" | "approvals">(() => {
    try {
      const requestedTab = window.sessionStorage.getItem("magen3:policies-tab");
      window.sessionStorage.removeItem("magen3:policies-tab");
      return requestedTab === "approvals" ? "approvals" : "policies";
    } catch {
      return "policies";
    }
  });
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?.id || "");
  const [policyDetailTab, setPolicyDetailTab] = useState<"overview" | "controls" | "approval">("overview");
  const [createPolicyOpen, setCreatePolicyOpen] = useState(false);
  const [createPolicyStep, setCreatePolicyStep] = useState(1);
  const [createTemplate, setCreateTemplate] = useState("Custom");
  const [createAdvancedArea, setCreateAdvancedArea] = useState("agent-trust-access");
  const [editSection, setEditSection] = useState("basics");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);
  const [policySearch, setPolicySearch] = useState("");
  const [mobilePolicyDirectoryOpen, setMobilePolicyDirectoryOpen] = useState(false);

  useEffect(() => {
    try {
      const requestedApprovalId = window.sessionStorage.getItem("magen3:approval-request-id");
      if (!requestedApprovalId) return;
      if (approvals.some((approval) => approval.id === requestedApprovalId)) {
        setPoliciesTab("approvals");
        setSelectedApprovalId(requestedApprovalId);
        window.sessionStorage.removeItem("magen3:approval-request-id");
      }
    } catch {}
  }, [approvals]);

  useEffect(() => {
    if (!policies.length) {
      setSelectedPolicyId("");
      return;
    }
    if (!policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(policies[0].id);
    }
  }, [policies, selectedPolicyId]);

  useEffect(() => {
    if (!form.agentId && agents[0]?.id) {
      setForm((current) => ({ ...current, agentId: agents[0].id }));
    }
  }, [agents, form.agentId]);

  const selectedPolicy = policies.find((policy) => policy.id === selectedPolicyId) || policies[0] || null;
  const selectedApproval = approvals.find((approval) => approval.id === selectedApprovalId) || null;
  const activePolicies = policies.filter((policy) => policy.status === "Active");
  const protectedAgentIds = new Set(activePolicies.map((policy) => policy.agentId));
  const agentsWithoutPolicy = agents.filter((agent) => agent.status === "Active" && !protectedAgentIds.has(agent.id));
  const orphanPolicies = policies.filter((policy) => !agents.some((agent) => agent.id === policy.agentId));
  const policiesNeedingAttention = policies.filter((policy) => policy.status !== "Active" || !agents.some((agent) => agent.id === policy.agentId));
  const attentionCount = policiesNeedingAttention.length + agentsWithoutPolicy.length;

  const filteredPolicies = policies.filter((policy) => {
    const agent = agents.find((item) => item.id === policy.agentId);
    const haystack = `${policy.name} ${policy.id} ${agent?.name || policy.agentId}`.toLowerCase();
    return haystack.includes(policySearch.trim().toLowerCase());
  });

  const applyPolicyTemplate = useCallback((templateName: string) => {
    const template = POLICY_TEMPLATES[templateName] || POLICY_TEMPLATES.Custom;
    setCreateTemplate(templateName);
    setForm((current) => ({
      ...current,
      maxTransaction: String(template.maxTransaction),
      dailyLimit: String(template.dailyLimit),
      approvalThreshold: String(template.approvalThreshold),
      trustedContracts: template.trustedContracts.join("\n"),
      blockedActions: template.blockedActions,
      riskMode: template.riskMode,
    }));
  }, []);

  const beginCreatePolicy = useCallback(() => {
    const selectedAgent = agents.find((agent) => agent.id === form.agentId) || agents[0];
    const recommendation = selectedAgent
      ? recommendedPolicyTemplate(normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type))
      : "Custom";
    applyPolicyTemplate(recommendation);
    setCreatePolicyStep(1);
    setCreateAdvancedArea("agent-trust-access");
    setPolicyFormError("");
    setCreatePolicyOpen(true);
  }, [agents, applyPolicyTemplate, form.agentId]);

  const activatePolicyFromDrawer = useCallback(async () => {
    if (!form.name.trim() || !form.agentId) {
      setPolicyFormError("Policy name and agent are required before activation.");
      setCreatePolicyStep(1);
      return;
    }
    const created = await createPolicy();
    if (created) {
      setCreatePolicyOpen(false);
      setCreatePolicyStep(1);
    }
  }, [createPolicy, form.agentId, form.name]);

  const policyRuleEnabled = useCallback((policy: Policy, key: string, fallback = false) => {
    const value = policy.structuredRules?.[key];
    return typeof value === "boolean" ? value : fallback;
  }, []);

  const getPolicyAreaSummaries = useCallback((policy: Policy) => {
    const rules = policy.structuredRules || {};
    const modeEnabled = (key: string, fallback = "Disabled") => {
      const value = rules[key];
      return typeof value === "string" && value !== "Disabled" ? true : fallback !== "Disabled";
    };
    return [
      {
        id: "agent-trust-access",
        name: "Agent Trust & Access",
        icon: ShieldCheck,
        enabled: [
          policyRuleEnabled(policy, "instructionIntegrityEnabled", true),
          policyRuleEnabled(policy, "toolIntegrityEnabled", true),
          policyRuleEnabled(policy, "delegationControlsEnabled", true),
        ].filter(Boolean).length,
        total: 3,
        detail: "Instruction provenance, approved tooling, credentials and delegated authority.",
      },
      {
        id: "policy-approval-controls",
        name: "Policy & Approval Controls",
        icon: Lock,
        enabled: [true, policyRuleEnabled(policy, "approvalWorkflowEnabled", true), policyRuleEnabled(policy, "emergencyControlsEnabled", true)].filter(Boolean).length,
        total: 3,
        detail: "Deterministic limits, Human Approval, quorum and emergency controls.",
      },
      {
        id: "wallet-asset-safety",
        name: "Wallet & Asset Safety",
        icon: Wallet,
        enabled: [policy.maxTransaction > 0, policy.dailyLimit > 0, policy.trustedContracts.length > 0].filter(Boolean).length,
        total: 3,
        detail: "Transaction limits, daily spend and approved destinations or assets.",
      },
      {
        id: "contract-permission-safety",
        name: "Contract & Permission Safety",
        icon: Code2,
        enabled: [
          policyRuleEnabled(policy, "tokenPermissionControlsEnabled", true),
          policyRuleEnabled(policy, "privilegedActionControlsEnabled", true),
          policyRuleEnabled(policy, "contractUpgradeControlsEnabled", true),
          policyRuleEnabled(policy, "contractArgumentControlsEnabled", false),
        ].filter(Boolean).length,
        total: 4,
        detail: "Contract allowlists, token permissions, privileged calls, upgrades and arguments.",
      },
      {
        id: "execution-integrity",
        name: "Execution Integrity",
        icon: Activity,
        enabled: [
          policyRuleEnabled(policy, "lifecycleControlsEnabled", true),
          policyRuleEnabled(policy, "reconciliationEnabled", true),
          policyRuleEnabled(policy, "rpcIntegrityEnabled", false),
          policyRuleEnabled(policy, "feeSafetyEnabled", false),
        ].filter(Boolean).length,
        total: 4,
        detail: "Lifecycle, replay, chain integrity, fee safety and reconciliation.",
      },
      {
        id: "market-oracle-integrity",
        name: "Market & Oracle Integrity",
        icon: TrendingUp,
        enabled: [modeEnabled("oracleValidationMode", "Review")].filter(Boolean).length,
        total: 1,
        detail: "Oracle freshness, source agreement and execution-price validation.",
      },
      {
        id: "cross-chain-payment-controls",
        name: "Cross-chain & Payment Controls",
        icon: Globe,
        enabled: [policyRuleEnabled(policy, "x402ControlsEnabled", true), modeEnabled("bridgeControlMode", "Review")].filter(Boolean).length,
        total: 2,
        detail: "Bridge routes, machine payments and settlement boundaries.",
      },
      {
        id: "threat-compliance",
        name: "Threat & Compliance",
        icon: ShieldAlert,
        enabled: [modeEnabled("threatIntelligenceMode", "Review"), policyRuleEnabled(policy, "complianceControlsEnabled", true)].filter(Boolean).length,
        total: 2,
        detail: "Threat feeds, screening, attestations and jurisdiction controls.",
      },
    ];
  }, [policyRuleEnabled]);

  const selectedPolicyAreas = selectedPolicy ? getPolicyAreaSummaries(selectedPolicy) : [];
  const selectedPolicyEnabledControls = selectedPolicyAreas.reduce((total, area) => total + area.enabled, 0);
  const selectedPolicyControlTotal = selectedPolicyAreas.reduce((total, area) => total + area.total, 0);
  const selectedPolicyAgent = selectedPolicy ? agents.find((agent) => agent.id === selectedPolicy.agentId) : undefined;
  const selectedPolicyCapabilities = selectedPolicyAgent
    ? normalizeCapabilities(selectedPolicyAgent.executionCapabilities, selectedPolicyAgent.type)
    : selectedPolicy?.capabilityScope || [];

  const renderThreatFields = (values: typeof form | typeof editForm, onChange: (patch: Record<string, string>) => void) => (
    <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Threat Intelligence</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Choose how exact provider indicators affect authorization when threat data is present or unavailable.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Match Handling" value={values.threatIntelligenceMode} onChange={(value) => onChange({ threatIntelligenceMode: value })} options={["Observe", "Review", "Enforce"]} />
        <InputField label="Minimum Confidence (%)" value={values.threatIntelligenceMinConfidence} onChange={(value) => onChange({ threatIntelligenceMinConfidence: value })} type="number" />
        <SelectField label="Feed Unavailable" value={values.threatIntelligenceUnavailableAction} onChange={(value) => onChange({ threatIntelligenceUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
      </div>
    </div>
  );

  const renderOracleFields = (values: typeof form | typeof editForm, onChange: (patch: Record<string, string>) => void) => (
    <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Oracle Validation</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Set feed freshness, confidence, source quorum and allowed execution deviation.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Validation Mode" value={values.oracleValidationMode} onChange={(value) => onChange({ oracleValidationMode: value })} options={["Observe", "Review", "Enforce"]} />
        <InputField label="Max Quote Age (sec)" value={values.oracleValidationMaxAgeSeconds} onChange={(value) => onChange({ oracleValidationMaxAgeSeconds: value })} type="number" />
        <InputField label="Max Deviation (bps)" value={values.oracleValidationMaxDeviationBps} onChange={(value) => onChange({ oracleValidationMaxDeviationBps: value })} type="number" />
        <InputField label="Max Source Spread (bps)" value={values.oracleValidationMaxSourceSpreadBps} onChange={(value) => onChange({ oracleValidationMaxSourceSpreadBps: value })} type="number" />
        <InputField label="Minimum Confidence (%)" value={values.oracleValidationMinConfidence} onChange={(value) => onChange({ oracleValidationMinConfidence: value })} type="number" />
        <InputField label="Minimum Sources" value={values.oracleValidationMinSources} onChange={(value) => onChange({ oracleValidationMinSources: value })} type="number" />
        <SelectField label="Feed Unavailable" value={values.oracleValidationUnavailableAction} onChange={(value) => onChange({ oracleValidationUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
      </div>
    </div>
  );

  const renderBridgeFields = (values: typeof form | typeof editForm, onChange: (patch: Record<string, string>) => void) => (
    <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Bridge Controls</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Validate approved providers, chain boundaries, route fees, quote age and confirmation requirements.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Control Mode" value={values.bridgeControlMode} onChange={(value) => onChange({ bridgeControlMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Route Metadata Unavailable" value={values.bridgeControlUnavailableAction} onChange={(value) => onChange({ bridgeControlUnavailableAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Require Quote Expiry" value={values.bridgeRequireQuoteExpiry} onChange={(value) => onChange({ bridgeRequireQuoteExpiry: value })} options={["Yes", "No"]} />
        <TextareaField label="Allowed Providers" value={values.bridgeAllowedProviders} onChange={(value) => onChange({ bridgeAllowedProviders: value })} />
        <TextareaField label="Allowed Source Chains" value={values.bridgeAllowedSourceChains} onChange={(value) => onChange({ bridgeAllowedSourceChains: value })} />
        <TextareaField label="Allowed Destination Chains" value={values.bridgeAllowedDestinationChains} onChange={(value) => onChange({ bridgeAllowedDestinationChains: value })} />
        <TextareaField label="Blocked Destination Chains" value={values.bridgeBlockedDestinationChains} onChange={(value) => onChange({ bridgeBlockedDestinationChains: value })} />
        <TextareaField label="Allowed Assets" value={values.bridgeAllowedAssets} onChange={(value) => onChange({ bridgeAllowedAssets: value })} />
        <InputField label="Maximum Bridge Amount" value={values.bridgeMaxAmount} onChange={(value) => onChange({ bridgeMaxAmount: value })} type="number" />
        <InputField label="Maximum Fee (bps)" value={values.bridgeMaxFeeBps} onChange={(value) => onChange({ bridgeMaxFeeBps: value })} type="number" />
        <InputField label="Maximum Quote Age (sec)" value={values.bridgeMaxQuoteAgeSeconds} onChange={(value) => onChange({ bridgeMaxQuoteAgeSeconds: value })} type="number" />
        <InputField label="Source Confirmations" value={values.bridgeMinSourceConfirmations} onChange={(value) => onChange({ bridgeMinSourceConfirmations: value })} type="number" />
        <InputField label="Destination Confirmations" value={values.bridgeMinDestinationConfirmations} onChange={(value) => onChange({ bridgeMinDestinationConfirmations: value })} type="number" />
      </div>
    </div>
  );

  const renderCreateAdvancedArea = () => {
    const patch = (values: Record<string, string>) => setForm((current) => ({ ...current, ...values }));
    switch (createAdvancedArea) {
      case "agent-trust-access":
        return <div className="space-y-4"><InstructionIntegrityPolicyFields values={form} onChange={patch} /><ToolMcpIntegrityPolicyFields values={form} onChange={patch} /><DelegationSafetyPolicyFields values={form} onChange={patch} /></div>;
      case "policy-approval-controls":
        return <div className="space-y-4"><ApprovalPolicyFields values={form} onChange={patch} /><EmergencyControlsPolicyFields values={form} onChange={patch} /></div>;
      case "wallet-asset-safety":
        return <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><p className="text-xs leading-relaxed text-[#94A3B8]">Wallet and asset safety uses the essential transaction, daily-spend and destination controls configured in Step 2. Asset identity and contract-risk providers remain governed by their existing backend availability.</p></div>;
      case "contract-permission-safety":
        return <div className="space-y-4"><TokenPermissionPolicyFields values={form} onChange={patch} /><PrivilegedActionPolicyFields values={form} onChange={patch} /><ContractUpgradePolicyFields values={form} onChange={patch} /><ContractArgumentPolicyFields values={form} onChange={patch} /></div>;
      case "execution-integrity":
        return <div className="space-y-4"><ExecutionIntegrityPolicyFields values={form} onChange={patch} /><RpcChainIntegrityPolicyFields values={form} onChange={patch} /><GasSponsorshipFeeSafetyPolicyFields values={form} onChange={patch} /></div>;
      case "market-oracle-integrity":
        return renderOracleFields(form, (values) => patch(values));
      case "cross-chain-payment-controls":
        return <div className="space-y-4"><X402PolicyFields values={form} onChange={patch} />{renderBridgeFields(form, (values) => patch(values))}</div>;
      case "threat-compliance":
        return <div className="space-y-4">{renderThreatFields(form, (values) => patch(values))}<CompliancePolicyFields values={form} onChange={patch} /></div>;
      default:
        return null;
    }
  };

  const editSections = [
    { id: "basics", label: "Policy Basics" },
    { id: "limits", label: "Limits & Destinations" },
    { id: "agent-trust", label: "Agent Trust & Access" },
    { id: "approval", label: "Policy & Approval" },
    { id: "contract", label: "Contract & Permission" },
    { id: "execution", label: "Execution Integrity" },
    { id: "market", label: "Market & Oracle" },
    { id: "cross-chain", label: "Cross-chain & Payments" },
    { id: "threat", label: "Threat & Compliance" },
  ];

  const renderEditSection = () => {
    const patch = (values: Record<string, string>) => setEditForm((current) => ({ ...current, ...values }));
    switch (editSection) {
      case "basics":
        return (
          <div className="space-y-4">
            <InputField label="Policy Name" value={editForm.name} onChange={(value) => setEditForm((current) => ({ ...current, name: value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField label="Risk Mode" value={editForm.riskMode} onChange={(value) => setEditForm((current) => ({ ...current, riskMode: value as RiskMode }))} options={["Conservative", "Balanced", "Aggressive"]} />
              <SelectField label="Status" value={editForm.status} onChange={(value) => setEditForm((current) => ({ ...current, status: value as "Active" | "Inactive" }))} options={["Active", "Inactive"]} />
            </div>
          </div>
        );
      case "limits":
        return (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <InputField label="Max Tx (CSPR)" value={editForm.maxTransaction} onChange={(value) => setEditForm((current) => ({ ...current, maxTransaction: value }))} type="number" />
              <InputField label="Daily Limit (CSPR)" value={editForm.dailyLimit} onChange={(value) => setEditForm((current) => ({ ...current, dailyLimit: value }))} type="number" />
              <InputField label="Approval Above" value={editForm.approvalThreshold} onChange={(value) => setEditForm((current) => ({ ...current, approvalThreshold: value }))} type="number" />
            </div>
            <TextareaField label="Trusted Targets" value={editForm.trustedContracts} onChange={(value) => setEditForm((current) => ({ ...current, trustedContracts: value }))} />
            <div className="grid gap-3 md:grid-cols-2">
              <TextareaField label="Blocked Contracts" value={editForm.blockedContracts} onChange={(value) => setEditForm((current) => ({ ...current, blockedContracts: value }))} />
              <TextareaField label="Allowed Entry Points" value={editForm.allowedEntryPoints} onChange={(value) => setEditForm((current) => ({ ...current, allowedEntryPoints: value }))} />
            </div>
          </div>
        );
      case "agent-trust":
        return <div className="space-y-4"><InstructionIntegrityPolicyFields values={editForm} onChange={patch} /><ToolMcpIntegrityPolicyFields values={editForm} onChange={patch} /><DelegationSafetyPolicyFields values={editForm} onChange={patch} /></div>;
      case "approval":
        return <div className="space-y-4"><ApprovalPolicyFields values={editForm} onChange={patch} /><EmergencyControlsPolicyFields values={editForm} onChange={patch} /></div>;
      case "contract":
        return <div className="space-y-4"><TokenPermissionPolicyFields values={editForm} onChange={patch} /><PrivilegedActionPolicyFields values={editForm} onChange={patch} /><ContractUpgradePolicyFields values={editForm} onChange={patch} /><ContractArgumentPolicyFields values={editForm} onChange={patch} /></div>;
      case "execution":
        return <div className="space-y-4"><ExecutionIntegrityPolicyFields values={editForm} onChange={patch} /><RpcChainIntegrityPolicyFields values={editForm} onChange={patch} /><GasSponsorshipFeeSafetyPolicyFields values={editForm} onChange={patch} /></div>;
      case "market":
        return renderOracleFields(editForm, (values) => patch(values));
      case "cross-chain":
        return <div className="space-y-4"><X402PolicyFields values={editForm} onChange={patch} />{renderBridgeFields(editForm, (values) => patch(values))}</div>;
      case "threat":
        return <div className="space-y-4">{renderThreatFields(editForm, (values) => patch(values))}<CompliancePolicyFields values={editForm} onChange={patch} /></div>;
      default:
        return null;
    }
  };

  const openEditor = useCallback((policy: Policy) => {
    setEditSection("basics");
    openPolicyEditor(policy);
  }, [openPolicyEditor]);

  const renderApprovalCompactRow = (approval: ApprovalRequest) => {
    const eligible = approval.approverWallets.some((item) => item.toLowerCase() === walletAddress.toLowerCase());
    const alreadyResponded = approval.responses.some((item) => item.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    const actionable = approval.reviewStatus === "Pending" && eligible && !alreadyResponded;
    const statusTone = approval.reviewStatus === "Approved" ? "text-[#22C55E]" : approval.reviewStatus === "Rejected" || approval.reviewStatus === "Expired" ? "text-[#EF4444]" : "text-[#F59E0B]";
    return (
      <div key={approval.id} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-semibold ${statusTone}`}>{approval.reviewStatus}</span>
              <span className="rounded-full border border-[#334155] px-2 py-0.5 text-[10px] text-[#94A3B8]">{approval.actionType}</span>
              {actionable && <span className="rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-2 py-0.5 text-[10px] text-[#22D3EE]">You can review</span>}
            </div>
            <div className="mt-2 text-sm font-medium text-[#F8FAFC]">{approval.amount} · {approval.target || "No target"}</div>
            <div className="mt-1 text-xs text-[#94A3B8]">{approval.policyName || "Unknown policy"} · {approval.approvalsReceived}/{approval.requiredApprovals} approvals · expires {approval.expiresAt ? fmtTs(approval.expiresAt) : "not set"}</div>
          </div>
          <Btn variant={actionable ? "primary" : "secondary"} size="sm" onClick={() => setSelectedApprovalId(approval.id)}>
            Review request
            <ChevronRight size={14} />
          </Btn>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        description="Control what each agent may execute and when exact-intent Human Approval is required."
        actions={<Btn variant="primary" onClick={beginCreatePolicy}><Plus size={16} /> Create Policy</Btn>}
      />

      <div className="inline-flex rounded-xl border border-[#1E293B] bg-[#0B1220] p-1">
        <button type="button" onClick={() => setPoliciesTab("policies")} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${policiesTab === "policies" ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}>Policies</button>
        <button type="button" onClick={() => setPoliciesTab("approvals")} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${policiesTab === "approvals" ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}>
          Approval Queue
          {pendingApprovals.length > 0 && <span className="rounded-full bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] text-[#F59E0B]">{pendingApprovals.length}</span>}
        </button>
      </div>

      <OperationalSummary items={[
        { label: "Active Policies", value: activePolicies.length, detail: "Currently enforceable", icon: <FileText size={18} /> },
        { label: "Agents Protected", value: protectedAgentIds.size, detail: `${agents.length} registered agents`, icon: <ShieldCheck size={18} />, tone: "text-[#22C55E]" },
        { label: "Need Attention", value: attentionCount, detail: attentionCount ? "Configuration action required" : "No policy gaps", icon: <AlertTriangle size={18} />, tone: attentionCount ? "text-[#F59E0B]" : "text-[#22C55E]" },
        { label: "Pending Approvals", value: pendingApprovals.length, detail: "Exact-intent reviews", icon: <Clock size={18} />, tone: pendingApprovals.length ? "text-[#F59E0B]" : "text-[#22C55E]" },
      ]} />

      {policiesTab === "policies" ? (
        <>
          {attentionCount > 0 && (
            <div className="rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#F8FAFC]"><AlertTriangle size={16} className="text-[#F59E0B]" />Policies needing attention</div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {agentsWithoutPolicy.map((agent) => (
                  <button key={agent.id} type="button" onClick={() => { setForm((current) => ({ ...current, agentId: agent.id, name: `${agent.name} Policy` })); beginCreatePolicy(); }} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-3 text-left hover:border-[#22D3EE]/40">
                    <div><div className="text-xs font-medium text-[#F8FAFC]">{agent.name} has no active policy</div><div className="mt-0.5 text-[11px] text-[#94A3B8]">Create a deterministic policy before production execution.</div></div>
                    <ChevronRight size={15} className="text-[#22D3EE]" />
                  </button>
                ))}
                {orphanPolicies.map((policy) => (
                  <button key={policy.id} type="button" onClick={() => { setSelectedPolicyId(policy.id); setPolicyDetailTab("overview"); }} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-3 text-left hover:border-[#22D3EE]/40">
                    <div><div className="text-xs font-medium text-[#F8FAFC]">{policy.name} is not linked to a registered agent</div><div className="mt-0.5 text-[11px] text-[#94A3B8]">Review the legacy agent binding before using this policy.</div></div>
                    <ChevronRight size={15} className="text-[#22D3EE]" />
                  </button>
                ))}
                {policiesNeedingAttention.filter((policy) => policy.status !== "Active").map((policy) => (
                  <button key={policy.id} type="button" onClick={() => { setSelectedPolicyId(policy.id); setPolicyDetailTab("overview"); }} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-3 text-left hover:border-[#22D3EE]/40">
                    <div><div className="text-xs font-medium text-[#F8FAFC]">{policy.name} is inactive</div><div className="mt-0.5 text-[11px] text-[#94A3B8]">Review and activate it if the assigned agent still needs protection.</div></div>
                    <ChevronRight size={15} className="text-[#22D3EE]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {policies.length === 0 ? (
            <div className={`${CARD} p-8 text-center sm:p-10`}>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE]"><FileText size={24} /></div>
              <div className="mt-4 text-lg font-semibold text-[#F8FAFC]">{agents.length === 0 ? "Your starter policy is created during Guided Setup" : "No policy is assigned yet"}</div>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#94A3B8]">{agents.length === 0 ? "Protect the first agent and Magen3 will apply capability-aware limits, review thresholds, lifecycle safety, and recommended controls automatically." : "Create a deterministic policy for the connected agent, or start Guided Setup again for a simpler capability-aware configuration."}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">{agents.length === 0 && <Btn variant="primary" onClick={() => requestAgentOnboarding(onNavigate, "guided")}><ShieldCheck size={16} /> Start Guided Setup</Btn>}<Btn variant={agents.length === 0 ? "secondary" : "primary"} onClick={beginCreatePolicy}><Plus size={16} /> Create Policy Manually</Btn></div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className={`${CARD} h-fit overflow-hidden`}>
                <div className="border-b border-[#1E293B] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="text-sm font-semibold text-[#F8FAFC]">Policy directory</div><div className="mt-0.5 text-xs text-[#94A3B8]">{filteredPolicies.length} policies</div></div>
                    <button type="button" onClick={() => setMobilePolicyDirectoryOpen((current) => !current)} className="rounded-lg border border-[#1E293B] p-2 text-[#94A3B8] xl:hidden"><Menu size={16} /></button>
                  </div>
                  <div className="relative mt-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                    <input value={policySearch} onChange={(event) => setPolicySearch(event.target.value)} placeholder="Search policies" className={`${INPUT_CLS} pl-9 text-xs`} />
                  </div>
                </div>
                <div className={`${mobilePolicyDirectoryOpen ? "block" : "hidden"} max-h-[640px] overflow-y-auto p-2 xl:block`}>
                  {filteredPolicies.map((policy) => {
                    const agent = agents.find((item) => item.id === policy.agentId);
                    const isSelected = selectedPolicy?.id === policy.id;
                    const areas = getPolicyAreaSummaries(policy);
                    const enabledCount = areas.reduce((total, area) => total + area.enabled, 0);
                    const totalCount = areas.reduce((total, area) => total + area.total, 0);
                    return (
                      <button key={policy.id} type="button" onClick={() => { setSelectedPolicyId(policy.id); setPolicyDetailTab("overview"); setMobilePolicyDirectoryOpen(false); }} className={`mb-2 w-full rounded-xl border p-3 text-left transition-colors ${isSelected ? "border-[#22D3EE]/45 bg-[#22D3EE]/8" : "border-transparent bg-[#0B1220] hover:border-[#334155]"}`}>
                        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#F8FAFC]">{policy.name}</div><div className="mt-0.5 truncate text-xs text-[#94A3B8]">{agent?.name || policy.agentId}</div></div><span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${policy.status === "Active" ? "bg-[#22C55E]" : "bg-[#64748B]"}`} /></div>
                        <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full border border-[#334155] px-2 py-0.5 text-[10px] text-[#94A3B8]">{policy.riskMode}</span><span className="rounded-full border border-[#334155] px-2 py-0.5 text-[10px] text-[#94A3B8]">{enabledCount}/{totalCount} controls</span></div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><div><div className="text-[#64748B]">Max</div><div className="mt-0.5 text-[#F8FAFC]">{policy.maxTransaction} CSPR</div></div><div><div className="text-[#64748B]">Daily</div><div className="mt-0.5 text-[#F8FAFC]">{policy.dailyLimit} CSPR</div></div><div><div className="text-[#64748B]">Review</div><div className="mt-0.5 text-[#F8FAFC]">{policy.approvalThreshold} CSPR</div></div></div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedPolicy && (
                <div className={`${CARD} min-w-0 overflow-hidden`}>
                  <div className="border-b border-[#1E293B] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{selectedPolicy.name}</h2><StatusBadge status={selectedPolicy.status} /></div>
                        <div className="mt-1 text-sm text-[#94A3B8]">{selectedPolicyAgent?.name || selectedPolicy.agentId} · {selectedPolicy.riskMode} mode</div>
                        <div className="mt-3 flex flex-wrap gap-1.5">{selectedPolicyCapabilities.slice(0, 3).map((capability) => <span key={capability} className="rounded-full border border-[#334155] bg-[#0B1220] px-2 py-1 text-[10px] text-[#94A3B8]">{capability}</span>)}{selectedPolicyCapabilities.length > 3 && <span className="rounded-full border border-[#334155] bg-[#0B1220] px-2 py-1 text-[10px] text-[#94A3B8]">+{selectedPolicyCapabilities.length - 3}</span>}</div>
                      </div>
                      <div className="flex flex-wrap gap-2"><Btn variant="secondary" size="sm" onClick={() => copyPolicyHash(selectedPolicy.policyHash)}><Copy size={14} />Copy hash</Btn><Btn variant="primary" size="sm" onClick={() => openEditor(selectedPolicy)}>Edit Policy</Btn></div>
                    </div>
                  </div>
                  <div className="border-b border-[#1E293B] px-5">
                    <div className="flex gap-5 overflow-x-auto">
                      {[{ id: "overview", label: "Overview" }, { id: "controls", label: "Controls" }, { id: "approval", label: "Approval Rules" }].map((tab) => <button key={tab.id} type="button" onClick={() => setPolicyDetailTab(tab.id as typeof policyDetailTab)} className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${policyDetailTab === tab.id ? "border-[#22D3EE] text-[#22D3EE]" : "border-transparent text-[#94A3B8] hover:text-[#F8FAFC]"}`}>{tab.label}</button>)}
                    </div>
                  </div>
                  <div className="p-5">
                    {copiedPolicyHash === selectedPolicy.policyHash && <div className="mb-4 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-2 text-xs text-[#BBF7D0]">Policy hash copied.</div>}
                    {copiedPolicyHash === "copy failed" && <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">Copy was blocked. Select the policy hash and copy it manually.</div>}
                    {policyDetailTab === "overview" && (
                      <div className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Max transaction", `${selectedPolicy.maxTransaction} CSPR`], ["Daily limit", `${selectedPolicy.dailyLimit} CSPR`], ["Review above", `${selectedPolicy.approvalThreshold} CSPR`], ["Controls enabled", `${selectedPolicyEnabledControls}/${selectedPolicyControlTotal}`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 text-base font-semibold text-[#F8FAFC]">{value}</div></div>)}</div>
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Policy posture</div><div className="mt-3 space-y-3 text-xs"><div className="flex items-center justify-between"><span className="text-[#94A3B8]">Risk mode</span><span className="text-[#F8FAFC]">{selectedPolicy.riskMode}</span></div><div className="flex items-center justify-between"><span className="text-[#94A3B8]">Review resolution</span><span className="text-[#F8FAFC]">{String(selectedPolicy.structuredRules?.reviewResolutionMode || "Autonomous")}</span></div><div className="flex items-center justify-between"><span className="text-[#94A3B8]">Status</span><span className={selectedPolicy.status === "Active" ? "text-[#22C55E]" : "text-[#94A3B8]"}>{selectedPolicy.status}</span></div><div className="flex items-center justify-between"><span className="text-[#94A3B8]">Created</span><span className="text-[#F8FAFC]">{fmtTs(selectedPolicy.createdAt)}</span></div><div className="flex items-start justify-between gap-4"><span className="text-[#94A3B8]">Policy hash</span><span className="max-w-[220px] truncate font-mono text-[#22D3EE]" title={selectedPolicy.policyHash}>{selectedPolicy.policyHash}</span></div></div></div>
                          <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Configuration status</div><div className="mt-3 space-y-2">{selectedPolicyAreas.filter((area) => area.enabled < area.total).slice(0, 4).map((area) => <div key={area.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#050B14] px-3 py-2"><div className="text-xs text-[#F8FAFC]">{area.name}</div><div className="text-[10px] text-[#F59E0B]">{area.total - area.enabled} available</div></div>)}{selectedPolicyAreas.every((area) => area.enabled === area.total) && <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/5 px-3 py-3 text-xs text-[#BBF7D0]">All currently represented policy controls are configured.</div>}</div></div>
                        </div>
                        <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-[#F8FAFC]">Trusted targets</div><div className="mt-1 text-xs text-[#94A3B8]">Destinations and contracts allowed by this policy.</div></div><span className="text-xs text-[#64748B]">{selectedPolicy.trustedContracts.length}</span></div>{selectedPolicy.trustedContracts.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{selectedPolicy.trustedContracts.slice(0, 6).map((target) => <span key={target} className="max-w-full truncate rounded-lg border border-[#334155] bg-[#050B14] px-2.5 py-1.5 font-mono text-[10px] text-[#94A3B8]" title={target}>{target}</span>)}</div> : <div className="mt-3 text-xs text-[#F59E0B]">No trusted targets configured. Unknown destinations will follow the active validation and review rules.</div>}</div>
                      </div>
                    )}
                    {policyDetailTab === "controls" && <div className="space-y-3">{selectedPolicyAreas.map((area) => { const Icon = area.icon; return <button key={area.id} type="button" onClick={() => { setEditSection(area.id === "agent-trust-access" ? "agent-trust" : area.id === "policy-approval-controls" ? "approval" : area.id === "contract-permission-safety" ? "contract" : area.id === "execution-integrity" ? "execution" : area.id === "market-oracle-integrity" ? "market" : area.id === "cross-chain-payment-controls" ? "cross-chain" : area.id === "threat-compliance" ? "threat" : "limits"); openPolicyEditor(selectedPolicy); }} className="flex w-full items-center gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-4 text-left hover:border-[#22D3EE]/35"><div className="rounded-lg border border-[#334155] bg-[#050B14] p-2 text-[#22D3EE]"><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold text-[#F8FAFC]">{area.name}</div><span className={`text-xs ${area.enabled === area.total ? "text-[#22C55E]" : "text-[#F59E0B]"}`}>{area.enabled}/{area.total} enabled</span></div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{area.detail}</div></div><ChevronRight size={16} className="text-[#64748B]" /></button>; })}</div>}
                    {policyDetailTab === "approval" && (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-3">{[["Review strategy", String(selectedPolicy.structuredRules?.reviewResolutionMode || "Autonomous")], ["Workflow", policyRuleEnabled(selectedPolicy, "approvalWorkflowEnabled", true) ? "Enabled" : "Disabled"], ["Required approvals", String(selectedPolicy.structuredRules?.approvalRequiredCount ?? 1)], ["Expiry", `${String(selectedPolicy.structuredRules?.approvalExpiryMinutes ?? 60)} min`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 text-base font-semibold text-[#F8FAFC]">{value}</div></div>)}</div>
                        <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Reviewer protection</div><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="text-[#64748B]">Cryptographic signatures</div><div className="mt-1 text-[#F8FAFC]">{policyRuleEnabled(selectedPolicy, "requireCryptographicReviewerSignature", true) ? "Required" : "Not required"}</div></div><div className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="text-[#64748B]">Separation of duties</div><div className="mt-1 text-[#F8FAFC]">{policyRuleEnabled(selectedPolicy, "approvalSeparationOfDuties", false) ? "Required" : "Not required"}</div></div><div className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="text-[#64748B]">Organizational quorum</div><div className="mt-1 text-[#F8FAFC]">{policyRuleEnabled(selectedPolicy, "approvalOrganizationalQuorumEnabled", false) ? "Enabled" : "Single-list quorum"}</div></div><div className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="text-[#64748B]">Execution delay</div><div className="mt-1 text-[#F8FAFC]">{String(selectedPolicy.structuredRules?.approvalExecutionDelaySeconds ?? 0)} sec</div></div></div></div>
                        <Btn variant="secondary" onClick={() => { setEditSection("approval"); openPolicyEditor(selectedPolicy); }}>Configure approval rules<ChevronRight size={14} /></Btn>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className={`${CARD} p-5`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2"><Clock size={17} className="text-[#A78BFA]" /><h2 className={SECTION_TITLE}>Approval Queue</h2><StatusBadge status="Foundation Available" /></div><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">Only Review Required decisions that the active strategy escalates to humans appear here. Autonomous remediation stays inside the agent flow, while approval requests remain exact-bound to the protected intent.</p></div><div className="flex gap-2 text-xs"><span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-3 py-1 text-[#F59E0B]">{pendingApprovals.length} pending</span><span className="rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-3 py-1 text-[#22C55E]">{approvals.filter((item) => item.reviewStatus === "Approved").length} approved</span></div></div>
            {approvalError && <div className="mt-4 rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">{approvalError}</div>}
          </div>
          {pendingApprovals.length === 0 ? <div className={`${CARD} p-8 text-center`}><CheckCircle size={28} className="mx-auto text-[#22C55E]" /><div className="mt-3 text-sm font-semibold text-[#F8FAFC]">No pending approvals</div><p className="mt-1 text-xs text-[#94A3B8]">Human-escalated Review Required decisions will appear here. Autonomous remediation does not create unnecessary approval requests.</p></div> : <div className="space-y-3">{pendingApprovals.map(renderApprovalCompactRow)}</div>}
          {resolvedApprovals.length > 0 && <div className={`${CARD} overflow-hidden`}><button type="button" onClick={() => setShowApprovalHistory((current) => !current)} className="flex w-full items-center justify-between p-4 text-left"><div><div className="text-sm font-semibold text-[#F8FAFC]">Approval history</div><div className="mt-0.5 text-xs text-[#94A3B8]">{resolvedApprovals.length} resolved requests</div></div><ChevronDown size={16} className={`text-[#64748B] transition-transform ${showApprovalHistory ? "rotate-180" : ""}`} /></button>{showApprovalHistory && <div className="space-y-3 border-t border-[#1E293B] p-4">{resolvedApprovals.map(renderApprovalCompactRow)}</div>}</div>}
        </div>
      )}

      {createPolicyOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/65" onClick={() => setCreatePolicyOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-5xl flex-col border-l border-[#1E293B] bg-[#050B14] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] px-5 py-4"><div><div className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Create Policy</div><div className="mt-1 text-sm text-[#94A3B8]">Build a deterministic policy with recommended controls first and advanced settings only when needed.</div></div><button type="button" onClick={() => setCreatePolicyOpen(false)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><X size={18} /></button></div>
            <div className="border-b border-[#1E293B] px-5 py-3"><div className="flex min-w-max gap-2 overflow-x-auto">{["Foundation", "Essential limits", "Recommended controls", "Advanced controls", "Review & activate"].map((label, index) => { const step = index + 1; return <button key={label} type="button" onClick={() => setCreatePolicyStep(step)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${createPolicyStep === step ? "bg-[#22D3EE]/12 text-[#22D3EE]" : step < createPolicyStep ? "text-[#22C55E]" : "text-[#64748B]"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${createPolicyStep === step ? "border-[#22D3EE]" : step < createPolicyStep ? "border-[#22C55E]" : "border-[#334155]"}`}>{step < createPolicyStep ? <CheckCircle size={12} /> : step}</span>{label}</button>; })}</div></div>
            <div className="flex-1 overflow-y-auto p-5">
              {createPolicyStep === 1 && <div className="mx-auto max-w-3xl space-y-4"><div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Policy foundation</div><p className="mt-1 text-xs text-[#94A3B8]">Choose the agent and a starter posture. Templates only prefill existing enforceable fields.</p></div><InputField label="Policy Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="e.g. YieldBot Balanced Policy" /><div><label className={LABEL_CLS}>Connected Agent</label><select className={`${INPUT_CLS} cursor-pointer`} value={form.agentId} onChange={(event) => { const value = event.target.value; const agent = agents.find((item) => item.id === value); setForm((current) => ({ ...current, agentId: value })); if (agent) applyPolicyTemplate(recommendedPolicyTemplate(normalizeCapabilities(agent.executionCapabilities, agent.type))); }}>{agents.map((agent) => <option key={agent.id} value={agent.id} className="bg-[#0B1220]">{agent.name}</option>)}</select></div><SelectField label="Starter Template" value={createTemplate} onChange={applyPolicyTemplate} options={Object.keys(POLICY_TEMPLATES)} /><SelectField label="Risk Mode" value={form.riskMode} onChange={(value) => setForm((current) => ({ ...current, riskMode: value as RiskMode }))} options={["Conservative", "Balanced", "Aggressive"]} /></div>}
              {createPolicyStep === 2 && <div className="mx-auto max-w-4xl space-y-4"><div className="grid gap-3 md:grid-cols-2"><SelectField label="Limit unit" value={form.limitBasis} onChange={(value) => setForm((current) => ({ ...current, limitBasis: value }))} options={["Fiat Value", "Network Native Asset"]} />{form.limitBasis === "Fiat Value" && <SelectField label="Reference currency" value={form.referenceCurrency} onChange={(value) => setForm((current) => ({ ...current, referenceCurrency: value }))} options={["USD"]} />}</div><div className="grid gap-3 md:grid-cols-3"><InputField label={`Maximum transaction (${form.limitBasis === "Fiat Value" ? form.referenceCurrency : "native asset"})`} value={form.maxTransaction} onChange={(value) => setForm((current) => ({ ...current, maxTransaction: value }))} type="number" /><InputField label={`Daily exposure (${form.limitBasis === "Fiat Value" ? form.referenceCurrency : "native asset"})`} value={form.dailyLimit} onChange={(value) => setForm((current) => ({ ...current, dailyLimit: value }))} type="number" /><InputField label={`Automatic threshold (${form.limitBasis === "Fiat Value" ? form.referenceCurrency : "native asset"})`} value={form.approvalThreshold} onChange={(value) => setForm((current) => ({ ...current, approvalThreshold: value }))} type="number" /></div><details className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Advanced limits</summary><div className="mt-4 grid gap-3 md:grid-cols-3"><InputField label="Hourly exposure" value={form.hourlyLimit} onChange={(value) => setForm((current) => ({ ...current, hourlyLimit: value }))} type="number" /><InputField label="Per-destination exposure" value={form.perDestinationLimit} onChange={(value) => setForm((current) => ({ ...current, perDestinationLimit: value }))} type="number" /><InputField label="Wallet percentage (%)" value={form.walletPercentageLimit} onChange={(value) => setForm((current) => ({ ...current, walletPercentageLimit: value }))} type="number" /></div></details><TextareaField label="Trusted Targets" value={form.trustedContracts} onChange={(value) => setForm((current) => ({ ...current, trustedContracts: value }))} /><div className="grid gap-3 md:grid-cols-2"><TextareaField label="Blocked Contracts" value={form.blockedContracts} onChange={(value) => setForm((current) => ({ ...current, blockedContracts: value }))} /><TextareaField label="Allowed Contract Entry Points" value={form.allowedEntryPoints} onChange={(value) => setForm((current) => ({ ...current, allowedEntryPoints: value }))} /></div></div>}
              {createPolicyStep === 3 && <div className="mx-auto max-w-4xl space-y-4"><div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Recommended for this agent</div><p className="mt-1 text-xs text-[#94A3B8]">Recommendations are derived from the selected agent’s execution capabilities and do not replace policy enforcement.</p></div><div className="grid gap-3 md:grid-cols-2">{recommendedModules(normalizeCapabilities(agents.find((agent) => agent.id === form.agentId)?.executionCapabilities, agents.find((agent) => agent.id === form.agentId)?.type)).map((module) => <div key={module.id} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#F8FAFC]">{module.name}</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{module.description}</div></div><CheckCircle size={16} className="shrink-0 text-[#22C55E]" /></div><div className="mt-3 text-[10px] uppercase tracking-wider text-[#64748B]">{module.controls.filter((control) => control.configurable).length} configurable controls</div></div>)}</div></div>}
              {createPolicyStep === 4 && <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]"><div className={`${CARD} h-fit p-2`}>{PROTECTION_MODULE_CATALOG.map((area) => <button key={area.id} type="button" onClick={() => setCreateAdvancedArea(area.id)} className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-xs ${createAdvancedArea === area.id ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:bg-[#0B1220] hover:text-[#F8FAFC]"}`}>{area.name}</button>)}</div><div className="min-w-0">{renderCreateAdvancedArea()}</div></div>}
              {createPolicyStep === 5 && <div className="mx-auto max-w-4xl space-y-4"><div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Review before activation</div><p className="mt-1 text-xs text-[#94A3B8]">Magen3 will create the policy using the exact fields below. Existing agents, keys and Gateway contracts remain unchanged.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Agent", agents.find((agent) => agent.id === form.agentId)?.name || "Not selected"], ["Template", createTemplate], ["Max transaction", `${form.maxTransaction || 0} CSPR`], ["Daily limit", `${form.dailyLimit || 0} CSPR`], ["Review above", `${form.approvalThreshold || 0} CSPR`], ["Risk mode", form.riskMode], ["Review resolution", form.reviewResolutionMode], ["Approval workflow", form.approvalWorkflowEnabled], ["Lifecycle controls", form.lifecycleControlsEnabled]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 text-sm font-semibold text-[#F8FAFC]">{value}</div></div>)}</div>{policyFormError && <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">{policyFormError}</div>}</div>}
            </div>
            <div className="flex items-center justify-between border-t border-[#1E293B] bg-[#050B14] px-5 py-4"><Btn variant="secondary" onClick={() => createPolicyStep === 1 ? setCreatePolicyOpen(false) : setCreatePolicyStep((step) => Math.max(1, step - 1))}>{createPolicyStep === 1 ? "Cancel" : "Back"}</Btn>{createPolicyStep < 5 ? <Btn variant="primary" onClick={() => setCreatePolicyStep((step) => Math.min(5, step + 1))}>Continue<ArrowRight size={15} /></Btn> : <Btn variant="primary" onClick={activatePolicyFromDrawer}><ShieldCheck size={15} />Activate Policy</Btn>}</div>
          </div>
        </div>
      )}

      {editingPolicy && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/65" onClick={() => setEditingPolicy(null)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-6xl flex-col border-l border-[#1E293B] bg-[#050B14] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] px-5 py-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Edit Policy</h2><span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] text-[#F59E0B]">Unsaved changes remain local until saved</span></div><p className="mt-1 text-sm text-[#94A3B8]">{editingPolicy.name} · adjust one protection area at a time.</p></div><button type="button" onClick={() => setEditingPolicy(null)} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><X size={18} /></button></div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[250px_minmax(0,1fr)]"><div className="hidden overflow-y-auto border-r border-[#1E293B] p-3 lg:block">{editSections.map((section) => <button key={section.id} type="button" onClick={() => setEditSection(section.id)} className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left text-xs ${editSection === section.id ? "bg-[#22D3EE]/12 text-[#22D3EE]" : "text-[#94A3B8] hover:bg-[#0B1220] hover:text-[#F8FAFC]"}`}>{section.label}</button>)}</div><div className="min-w-0 overflow-y-auto p-5"><div className="mb-4 lg:hidden"><div><label className={LABEL_CLS}>Policy section</label><select className={`${INPUT_CLS} cursor-pointer`} value={editSection} onChange={(event) => setEditSection(event.target.value)}>{editSections.map((section) => <option key={section.id} value={section.id} className="bg-[#0B1220]">{section.label}</option>)}</select></div></div><div className="mx-auto max-w-4xl">{renderEditSection()}</div>{policyFormError && <div className="mx-auto mt-4 max-w-4xl rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">{policyFormError}</div>}</div></div>
            <div className="flex items-center justify-end gap-3 border-t border-[#1E293B] bg-[#050B14] px-5 py-4"><Btn variant="secondary" onClick={() => setEditingPolicy(null)}>Cancel</Btn><Btn variant="primary" onClick={savePolicyEdit}>Save Policy</Btn></div>
          </div>
        </div>
      )}

      {selectedApproval && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/65" onClick={() => setSelectedApprovalId("")} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#1E293B] bg-[#050B14] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#1E293B] px-5 py-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Review Request</h2><span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-2 py-0.5 text-[10px] text-[#F59E0B]">{selectedApproval.reviewStatus}</span></div><p className="mt-1 text-sm text-[#94A3B8]">Exact intent and quorum evidence for {selectedApproval.actionType}.</p></div><button type="button" onClick={() => setSelectedApprovalId("")} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"><X size={18} /></button></div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="grid gap-3 sm:grid-cols-2"><div><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Action</div><div className="mt-1 text-sm text-[#F8FAFC]">{selectedApproval.actionType}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Amount</div><div className="mt-1 text-sm text-[#F8FAFC]">{selectedApproval.amount}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Target</div><div className="mt-1 break-all text-sm text-[#F8FAFC]">{selectedApproval.target || "No target"}</div></div><div><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Policy</div><div className="mt-1 text-sm text-[#F8FAFC]">{selectedApproval.policyName || "Unknown policy"}</div></div></div><div className="mt-4 border-t border-[#1E293B] pt-4"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Why review is required</div><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{selectedApproval.reason}</p></div></div>
              <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Approval binding</div><div className="mt-3 break-all font-mono text-xs text-[#22D3EE]">{selectedApproval.bindingHash || "Unavailable"}</div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><div className="text-[10px] text-[#64748B]">Quorum</div><div className="mt-1 text-xs text-[#F8FAFC]">{selectedApproval.approvalsReceived}/{selectedApproval.requiredApprovals}</div></div><div><div className="text-[10px] text-[#64748B]">Signature</div><div className="mt-1 text-xs text-[#F8FAFC]">{selectedApproval.signatureRequired ? "Casper required" : "Policy response"}</div></div><div><div className="text-[10px] text-[#64748B]">Expires</div><div className="mt-1 text-xs text-[#F8FAFC]">{selectedApproval.expiresAt ? fmtTs(selectedApproval.expiresAt) : "Not set"}</div></div></div></div>
              {(selectedApproval.groupProgress || []).length > 0 && <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Reviewer groups</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(selectedApproval.groupProgress || []).map((group) => <div key={group.groupId} className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="text-[#F8FAFC]">{group.groupName}</span><span className={group.satisfied ? "text-[#22C55E]" : "text-[#F59E0B]"}>{group.received}/{group.required}</span></div>{group.role && <div className="mt-0.5 text-[10px] text-[#64748B]">{group.role}</div>}</div>)}</div></div>}
              {selectedApproval.responses.length > 0 && <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><div className="text-sm font-semibold text-[#F8FAFC]">Reviewer responses</div><div className="mt-3 space-y-2">{selectedApproval.responses.map((response, index) => <div key={`${response.walletAddress}-${index}`} className="rounded-lg bg-[#050B14] px-3 py-2 text-xs"><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[#94A3B8]">{response.walletAddress}</span><span className={response.response === "Approved" ? "text-[#22C55E]" : "text-[#EF4444]"}>{response.response}</span></div>{response.comment && <div className="mt-1 text-[#94A3B8]">{response.comment}</div>}</div>)}</div></div>}
              {selectedApproval.reviewStatus === "Pending" && selectedApproval.approverWallets.some((item) => item.toLowerCase() === walletAddress.toLowerCase()) && !selectedApproval.responses.some((item) => item.walletAddress.toLowerCase() === walletAddress.toLowerCase()) && <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4"><label className={LABEL_CLS}>Reviewer note</label><textarea className={`${INPUT_CLS} min-h-24 resize-none text-xs`} value={approvalComments[selectedApproval.id] || ""} onChange={(event) => setApprovalComments((current) => ({ ...current, [selectedApproval.id]: event.target.value }))} placeholder="Optional approval note; required for rejection" /><div className="mt-3 grid grid-cols-2 gap-2"><Btn variant="secondary" className="justify-center border-[#EF4444]/30 text-[#FCA5A5] hover:bg-[#EF4444]/10" disabled={approvalBusy === selectedApproval.id} onClick={() => submitApprovalResponse(selectedApproval, "Reject")}>Sign and reject</Btn><Btn variant="primary" className="justify-center" disabled={approvalBusy === selectedApproval.id} onClick={() => submitApprovalResponse(selectedApproval, "Approve")}>Sign and approve</Btn></div></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function auditDecisionExplanation(log: AuditLog | null): DecisionExplanation | undefined {
  const originalIntent = log?.originalIntent;
  if (!originalIntent || typeof originalIntent !== "object") return undefined;
  const decisionContext = originalIntent["magen3DecisionContext"];
  if (!decisionContext || typeof decisionContext !== "object") return undefined;
  const explanation = (decisionContext as Record<string, unknown>)["decisionExplanation"];
  return explanation && typeof explanation === "object" ? explanation as DecisionExplanation : undefined;
}

function diagnosticValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "Not available";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function AuditLogPage({
  auditLogs,
  policies,
  onRecordAuditLog,
  onPrepareCasperPayload,
  onConfirmCasperDeploy,
  onConfirmExecutionDeploy,
  developerMode,
  onNavigate,
}: {
  auditLogs: AuditLog[];
  policies: Policy[];
  onRecordAuditLog: (id: string) => Promise<AuditLog> | AuditLog;
  onPrepareCasperPayload: (id: string) => Promise<CasperPreparedPayload>;
  onConfirmCasperDeploy: (id: string, deployHash: string) => Promise<AuditLog>;
  onConfirmExecutionDeploy: (id: string, deployHash: string, signedBy?: string, note?: string) => Promise<AuditLog>;
  developerMode: boolean;
  onNavigate: (page: Page) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterShield, setFilterShield] = useState("All");
  const [filterDecision, setFilterDecision] = useState("All");
  const [filterRisk, setFilterRisk] = useState("All");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [casperPrepared, setCasperPrepared] = useState<CasperPreparedPayload | null>(null);
  const [casperLoading, setCasperLoading] = useState(false);
  const [casperError, setCasperError] = useState("");
  const [deployHash, setDeployHash] = useState("");
  const [executionHash, setExecutionHash] = useState("");
  const [copiedPayload, setCopiedPayload] = useState(false);

  useEffect(() => {
    try {
      const requestedId = window.sessionStorage.getItem("magen3:audit-record-id");
      if (!requestedId) return;
      const requested = auditLogs.find((log) => log.id === requestedId);
      if (requested) {
        setSelected(requested);
        window.sessionStorage.removeItem("magen3:audit-record-id");
      }
    } catch {}
  }, [auditLogs]);

  const filtered = auditLogs.filter((l) => {
    if (
      search &&
      !l.agentName.toLowerCase().includes(search.toLowerCase()) &&
      !l.action.toLowerCase().includes(search.toLowerCase()) &&
      !l.id.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterShield !== "All" && l.shield !== filterShield) return false;
    if (filterDecision !== "All" && l.decision !== filterDecision) return false;
    if (filterRisk !== "All" && l.risk !== filterRisk) return false;
    return true;
  });
  const selectedPolicy = selected
    ? policies.find((policy) => policy.agentId === selected.agentId && policy.name === selected.policyUsed) ||
      policies.find((policy) => policy.agentId === selected.agentId)
    : undefined;
  const selectedExplanation = auditDecisionExplanation(selected);

  useEffect(() => {
    if (!selected) return;
    const refreshed = auditLogs.find((log) => log.id === selected.id);
    if (refreshed && refreshed !== selected) setSelected(refreshed);
  }, [auditLogs, selected?.id]);

  useEffect(() => {
    setCasperPrepared(null);
    setCasperError("");
    setDeployHash(selected?.txHash && isRealCasperDeployHash(selected.txHash) ? normalizeCasperDeployHash(selected.txHash) : "");
    setExecutionHash(selected?.executionTxHash && isRealCasperDeployHash(selected.executionTxHash) ? normalizeCasperDeployHash(selected.executionTxHash) : "");
    setCopiedPayload(false);
  }, [selected?.id, selected?.txHash, selected?.executionTxHash]);

  const prepareCasperPayload = useCallback(async (logId: string) => {
    setCasperLoading(true);
    setCasperError("");
    setCopiedPayload(false);
    try {
      const prepared = await onPrepareCasperPayload(logId);
      setCasperPrepared(prepared);
    } catch (error) {
      setCasperError(error instanceof Error ? error.message : "Unable to prepare Casper payload");
    } finally {
      setCasperLoading(false);
    }
  }, [onPrepareCasperPayload]);

  const copyCasperPayload = useCallback(async () => {
    if (!casperPrepared) return;
    const body = JSON.stringify(casperPrepared, null, 2);
    const copiedOk = await writeClipboard(body);
    if (copiedOk) {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 1500);
    } else {
      setCasperError("Could not copy payload. You can still select and copy it manually.");
    }
  }, [casperPrepared]);

  const confirmDeployHash = useCallback(async () => {
    if (!selected) return;
    const normalizedDeployHash = normalizeCasperDeployHash(deployHash);
    if (!isRealCasperDeployHash(normalizedDeployHash)) {
      setCasperError("Paste the 64-character Casper deploy hash returned by casper-client, without the hash- prefix.");
      return;
    }
    setCasperLoading(true);
    setCasperError("");
    try {
      const updated = await onConfirmCasperDeploy(selected.id, normalizedDeployHash);
      setSelected(updated);
      setDeployHash(normalizeCasperDeployHash(updated.txHash));
    } catch (error) {
      setCasperError(error instanceof Error ? error.message : "Unable to confirm deploy hash");
    } finally {
      setCasperLoading(false);
    }
  }, [deployHash, onConfirmCasperDeploy, selected]);

  const confirmExecutionHash = useCallback(async () => {
    if (!selected) return;
    const normalizedDeployHash = normalizeCasperDeployHash(executionHash);
    if (!isRealCasperDeployHash(normalizedDeployHash)) {
      setCasperError("Paste the 64-character Casper execution deploy hash returned after wallet signing.");
      return;
    }
    setCasperLoading(true);
    setCasperError("");
    try {
      const updated = await onConfirmExecutionDeploy(
        selected.id,
        normalizedDeployHash,
        selected.executionWalletAddress || selected.walletAddress,
        "Execution transaction signed after Magen3 approval."
      );
      setSelected(updated);
      setExecutionHash(normalizeCasperDeployHash(updated.executionTxHash || ""));
    } catch (error) {
      setCasperError(error instanceof Error ? error.message : "Unable to confirm execution hash");
    } finally {
      setCasperLoading(false);
    }
  }, [executionHash, onConfirmExecutionDeploy, selected]);

  const recordAuditOnChain = useCallback(async (logId: string) => {
    const updated = await onRecordAuditLog(logId);
    setSelected((prev) => (prev && prev.id === logId ? updated : prev));
  }, [onRecordAuditLog]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Audit Log
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Every Magen3 security decision, ready for Casper Testnet recording.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
          />
          <input
            className={`${INPUT_CLS} pl-9`}
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${INPUT_CLS} w-auto min-w-36`}
          value={filterShield}
          onChange={(e) => setFilterShield(e.target.value)}
        >
          <option className="bg-[#0B1220]">All</option>
          <option className="bg-[#0B1220]">Agent Shield</option>
        </select>
        <select
          className={`${INPUT_CLS} w-auto min-w-36`}
          value={filterDecision}
          onChange={(e) => setFilterDecision(e.target.value)}
        >
          <option className="bg-[#0B1220]">All</option>
          <option className="bg-[#0B1220]">Allowed</option>
          <option className="bg-[#0B1220]">Blocked</option>
          <option className="bg-[#0B1220]">Review Required</option>
        </select>
        <select
          className={`${INPUT_CLS} w-auto min-w-32`}
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
        >
          <option className="bg-[#0B1220]">All</option>
          <option className="bg-[#0B1220]">Low</option>
          <option className="bg-[#0B1220]">Medium</option>
          <option className="bg-[#0B1220]">High</option>
        </select>
      </div>

      {/* Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1E293B] bg-[#0B1220]">
                {[
                  "Time",
                  "Shield",
                  "Agent",
                  "Action",
                  "Amount",
                  "Decision",
                  "Risk",
                  "Decision Proof Hash",
                  "Execution Proof",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-[#94A3B8] uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-[#1E293B]/50 hover:bg-[#0B1220]/60 transition-colors"
                >
                  <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap text-xs">
                    {fmtTs(log.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">
                    {log.shield}
                  </td>
                  <td className="px-4 py-3 text-[#F8FAFC] font-medium whitespace-nowrap">
                    {log.agentName}
                  </td>
                  <td className="px-4 py-3 text-[#94A3B8] whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-[#F8FAFC] whitespace-nowrap font-mono">
                    {log.amount} {auditAsset(log)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DecisionBadge decision={log.decision} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <RiskBadge risk={log.risk} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#94A3B8] whitespace-nowrap">
                    {log.txHash ? (
                      isRealCasperDeployHash(log.txHash) ? (
                        <a
                          href={casperDeployUrl(log.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-[#22D3EE] hover:text-[#F8FAFC]"
                        >
                          <span>{truncate(normalizeCasperDeployHash(log.txHash))}</span>
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[#F59E0B]">
                          <span>Unconfirmed</span>
                          <span className="text-[#94A3B8]">{truncate(log.txHash)}</span>
                        </div>
                      )
                    ) : (
                      <span className="text-[#94A3B8]/70">{decisionProofStatus(log).label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {log.executionTxHash && isRealCasperDeployHash(log.executionTxHash) && log.action !== "x402 Payment" ? (
                      <a
                        href={casperDeployUrl(log.executionTxHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[#22C55E] hover:text-[#F8FAFC]"
                      >
                        <span>{truncate(normalizeCasperDeployHash(log.executionTxHash))}</span>
                        <ExternalLink size={11} />
                      </a>
                    ) : log.action === "x402 Payment" && log.executionTxHash ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[#22C55E]">{executionProofStatus(log.executionStatus || "", log.executionTxHash).label}</span>
                        <span className="text-[#94A3B8]">{truncate(log.executionTxHash)}</span>
                      </div>
                    ) : (
                      <span className="text-[#94A3B8]/70">{executionProofStatus(log.executionStatus || "", log.executionTxHash || "").label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(log)}
                      className="p-1.5 text-[#94A3B8] hover:text-[#22D3EE] hover:bg-[#22D3EE]/10 rounded transition-colors"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    {auditLogs.length === 0 ? (
                      <div className="mx-auto max-w-md">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/10"><Scroll size={21} className="text-[#22D3EE]" /></div>
                        <h3 className="mt-4 font-semibold text-[#F8FAFC]">Your first Magen3 decision will appear here</h3>
                        <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Run a protected test to create an audit record, inspect the deterministic decision, and follow its Casper proof status.</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2"><Btn variant="primary" size="sm" onClick={() => onNavigate("intent-playground")}><Send size={14} /> Run a Protected Test</Btn><Btn variant="ghost" size="sm" onClick={() => requestAgentOnboarding(onNavigate, "guided")}>Start Guided Setup</Btn></div>
                      </div>
                    ) : (
                      <div><div className="font-semibold text-[#F8FAFC]">No records match these filters</div><div className="mt-1 text-sm text-[#94A3B8]">Adjust the search or filters to view existing decisions.</div><button type="button" onClick={() => { setSearch(""); setFilterShield("All"); setFilterDecision("All"); setFilterRisk("All"); }} className="mt-3 text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]">Clear filters</button></div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSelected(null)}
          />
          <div className="relative bg-[#0B1220] border-l border-[#1E293B] w-full max-w-lg overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[#1E293B] sticky top-0 bg-[#0B1220]">
              <div>
                <h3 className="font-semibold text-[#F8FAFC] font-['Space_Grotesk']">
                  Audit Record
                </h3>
                <div className="text-xs text-[#94A3B8] font-mono mt-0.5">
                  {selected.id}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-3">
                <DecisionBadge decision={selected.decision} />
                <RiskBadge risk={selected.risk} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#22D3EE]/20 bg-[#050B14] p-3">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Decision Proof Hash</div>
                  <div className="mt-1 font-mono text-xs text-[#F8FAFC] break-all">
                    {selected.txHash ? normalizeCasperDeployHash(selected.txHash) : selected.decisionProofStatus === "failed" ? "Relayer failed" : "Queued for relayer"}
                  </div>
                  <div className="mt-2 text-xs text-[#94A3B8]">
                    Exists for Allowed, Blocked, and Review Required decisions.
                  </div>
                </div>
                <div className="rounded-xl border border-[#22C55E]/20 bg-[#050B14] p-3">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Execution Hash</div>
                  <div className="mt-1 font-mono text-xs text-[#F8FAFC] break-all">
                    {selected.executionTxHash ? normalizeCasperDeployHash(selected.executionTxHash) : "None"}
                  </div>
                  <div className="mt-2 text-xs text-[#94A3B8]">
                    Only appears after an approved action is actually signed and submitted.
                  </div>
                </div>
              </div>
              {[
                ["Decision ID", selected.id],
                ["Agent Owner Wallet", selected.agentOwnerWalletAddress || selected.walletAddress],
                ["Execution Wallet", selected.executionWalletAddress || selected.walletAddress],
                ["Agent ID", selected.agentId],
                ["Policy Used", selected.policyUsed],
                ["Policy ID", selectedPolicy?.id || "Not available on this audit record"],
                ["Policy Hash", selectedPolicy?.policyHash || "Not available on this audit record"],
                ["Shield Type", selected.shield],
                ["Action Type", selected.action],
                ["Target", selected.target],
                ["Amount", `${selected.amount} ${auditAsset(selected)}`],
                ["Risk Score", `${selected.riskScore}/100`],
                ["Timestamp", fmtTs(selected.timestamp)],
                [
                  "Decision Proof Hash",
                  selected.txHash || "Not yet recorded on-chain",
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#94A3B8] uppercase tracking-wider">
                    {k}
                  </span>
                  <span className="text-sm text-[#F8FAFC] font-mono break-all">
                    {v}
                  </span>
                </div>
              ))}
              <div>
                <span className="text-xs text-[#94A3B8] uppercase tracking-wider">
                  Reason
                </span>
                <p className="text-sm text-[#F8FAFC] mt-1 leading-relaxed">
                  {selected.reason}
                </p>
              </div>

              <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Security Guidance</div>
                <div className="mt-3 space-y-3 text-sm">
                  <div><span className="text-xs uppercase tracking-wider text-[#94A3B8]">Why this happened</span><p className="mt-1 leading-relaxed text-[#F8FAFC]">{selected.primaryReason || selected.reason || "Magen3 returned this decision from the active deterministic policy."}</p></div>
                  <div><span className="text-xs uppercase tracking-wider text-[#94A3B8]">Policy rule</span><p className="mt-1 text-[#F8FAFC]">{selected.triggeredRule || "No single blocking rule was recorded."}</p></div>
                  <div><span className="text-xs uppercase tracking-wider text-[#94A3B8]">Suggested resolution</span><p className="mt-1 leading-relaxed text-[#F8FAFC]">{selected.suggestedResolution || (selected.decision === "Allowed" ? "Proceed to wallet signing only after confirming the displayed execution parameters." : "Review the active policy and change only authorized request parameters before retrying.")}</p></div>
                  {selectedExplanation?.code && (
                    <div className="grid gap-3 rounded-lg border border-[#1E293B] bg-[#050B14] p-3 sm:grid-cols-2">
                      <div><span className="text-xs uppercase tracking-wider text-[#64748B]">Explanation code</span><p className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{selectedExplanation.code}</p></div>
                      <div><span className="text-xs uppercase tracking-wider text-[#64748B]">Affected field</span><p className="mt-1 font-mono text-xs text-[#F8FAFC]">{selectedExplanation.field || "General policy finding"}</p></div>
                      {selectedExplanation.expected !== undefined && <div><span className="text-xs uppercase tracking-wider text-[#64748B]">Expected</span><p className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{diagnosticValue(selectedExplanation.expected)}</p></div>}
                      {selectedExplanation.received !== undefined && <div><span className="text-xs uppercase tracking-wider text-[#64748B]">Received</span><p className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{diagnosticValue(selectedExplanation.received)}</p></div>}
                      {selectedExplanation.mismatchFields && selectedExplanation.mismatchFields.length > 0 && <div className="sm:col-span-2"><span className="text-xs uppercase tracking-wider text-[#64748B]">Changed protected fields</span><p className="mt-1 text-xs text-[#F8FAFC]">{selectedExplanation.mismatchFields.join(", ")}</p></div>}
                    </div>
                  )}
                </div>
              </div>

              {(selected.approvalRequestId || selected.approvalStatus) && selected.approvalStatus !== "not_required" && (
                <div className="rounded-xl border border-[#A78BFA]/25 bg-[#A78BFA]/5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-[#A78BFA]">Human Approval Workflow</div>
                      <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">The approval is bound to this exact intent hash. Parameter changes require a new Magen3 decision and approval.</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${selected.approvalStatus === "Approved" ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]" : selected.approvalStatus === "Rejected" || selected.approvalStatus === "Expired" ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]" : "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{selected.approvalStatus || "Pending"}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                    <div><span className="text-[#64748B] uppercase tracking-wider">Approval request</span><div className="mt-1 break-all font-mono text-[#F8FAFC]">{selected.approvalRequestId || "Not configured"}</div></div>
                    <div><span className="text-[#64748B] uppercase tracking-wider">Quorum</span><div className="mt-1 text-[#F8FAFC]">{selected.approvalReceivedCount || 0}/{selected.approvalRequiredCount || 0} approvals</div></div>
                    <div><span className="text-[#64748B] uppercase tracking-wider">Expires</span><div className="mt-1 text-[#F8FAFC]">{selected.approvalExpiresAt ? new Date(selected.approvalExpiresAt).toLocaleString() : "Not available"}</div></div>
                    <div><span className="text-[#64748B] uppercase tracking-wider">Resolved</span><div className="mt-1 text-[#F8FAFC]">{selected.approvalResolvedAt ? new Date(selected.approvalResolvedAt).toLocaleString() : "Not yet"}</div></div>
                  </div>
                  <div className="mt-3">
                    <span className="text-xs uppercase tracking-wider text-[#64748B]">Exact-intent binding hash</span>
                    <div className="mt-1 break-all rounded-lg border border-[#1E293B] bg-[#020617] p-2 font-mono text-xs text-[#A78BFA]">{selected.approvalBindingHash || "Unavailable"}</div>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Signature-enabled policies require a one-time Casper Wallet message signature from each counted reviewer. The backend verifies exact binding, signer, response, nonce, chain, domain, and expiry, while storing hashes rather than raw signatures.</p>
                </div>
              )}

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Execution Capabilities</div>
                <div className="mt-2"><CapabilityChips capabilities={normalizeCapabilities(selected.capabilityContext)} /></div>
              </div>

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Security Pipeline</div>
                <div className="mt-4"><PipelineTimeline stages={selected.pipelineStages} developerMode={developerMode} /></div>
              </div>

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Protection Findings</div>
                <div className="mt-3"><FindingsPanel findings={selected.moduleFindings} developerMode={developerMode} /></div>
              </div>

              {selected.originalIntent && (
                <details className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4" open={developerMode}>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Original Intent{developerMode ? " · Developer Mode" : ""}</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#020617] p-3 text-xs leading-relaxed text-[#94A3B8]">{JSON.stringify(selected.originalIntent, null, 2)}</pre>
                </details>
              )}
              <details className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4" open={developerMode}>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Technical audit evidence{developerMode ? " · Expanded" : ""}</summary>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#020617] p-3 text-xs leading-relaxed text-[#94A3B8]">{JSON.stringify({
                  auditId: selected.id,
                  policyUsed: selected.policyUsed,
                  triggeredRule: selected.triggeredRule,
                  capabilityContext: selected.capabilityContext,
                  pipelineStages: selected.pipelineStages,
                  moduleFindings: selected.moduleFindings,
                  approvalBindingHash: selected.approvalBindingHash,
                  decisionProofStatus: selected.decisionProofStatus,
                  executionReconciliation: selected.executionReconciliation,
                }, null, 2)}</pre>
              </details>

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-3">Proof Timeline</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["Intent received", "Complete", "text-[#22C55E]"],
                    ["Magen3 decision", selected.decision, selected.decision === "Blocked" ? "text-[#EF4444]" : selected.decision === "Review Required" ? "text-[#F59E0B]" : "text-[#22C55E]"],
                    ["Casper decision proof", decisionProofStatus(selected).label, isRealCasperDeployHash(selected.txHash) ? "text-[#22C55E]" : selected.decisionProofStatus === "failed" ? "text-[#EF4444]" : "text-[#F59E0B]"],
                    [selected.action === "x402 Payment" ? "Payment settlement" : "Execution proof", executionProofStatus(selected.executionStatus || "", selected.executionTxHash || "").label, (isRealCasperDeployHash(selected.executionTxHash || "") || selected.executionStatus === "x402_confirmed") ? "text-[#22C55E]" : selected.executionStatus === "x402_failed" ? "text-[#EF4444]" : "text-[#94A3B8]"],
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                      <div className="text-[#94A3B8]">{label}</div>
                      <div className={`mt-1 font-semibold ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {(() => {
                const proof = decisionProofStatus(selected);
                const realDeploy = isRealCasperDeployHash(selected.txHash);
                const normalizedTxHash = normalizeCasperDeployHash(selected.txHash);
                return (
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#050B14] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold font-['Space_Grotesk']">
                          <ShieldCheck size={16} className="text-[#22D3EE]" />
                          Decision Proof on Casper
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-1">
                          Verifies that Magen3 reviewed this intent and anchored the decision to Casper Testnet.
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${proof.className}`}>
                        {proof.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Network</span>
                        <div className="text-[#F8FAFC] mt-1">Casper Testnet</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Entrypoint</span>
                        <div className="text-[#F8FAFC] mt-1">record_decision</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Decision Deploy Hash</span>
                        <div className={`font-mono mt-1 break-all ${realDeploy ? "text-[#22D3EE]" : "text-[#F8FAFC]"}`}>
                          {selected.txHash ? normalizedTxHash : "Not confirmed yet"}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Relayer Status</span>
                        <div className="text-[#F8FAFC] mt-1">{selected.decisionProofStatus || "queued"}</div>
                      </div>
                      {selected.decisionProofError && (
                        <div className="col-span-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 p-3">
                          <span className="text-[#FCA5A5] uppercase tracking-wider">Relayer Note</span>
                          <div className="text-[#FCA5A5] mt-1">{selected.decisionProofError}</div>
                        </div>
                      )}
                      {casperPrepared?.payloadHash && (
                        <div className="col-span-2">
                          <span className="text-[#94A3B8] uppercase tracking-wider">Decision Payload Hash</span>
                          <div className="text-[#22D3EE] font-mono mt-1 break-all">{casperPrepared.payloadHash}</div>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Contract Hash</span>
                        <div className="text-[#F8FAFC] font-mono mt-1 break-all">
                          {casperPrepared?.casper.contractHash || DEPLOYED_MAGEN3_CONTRACT_HASH}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Explorer</span>
                        {realDeploy ? (
                          <a
                            href={casperDeployUrl(selected.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 text-[#22D3EE] hover:text-[#F8FAFC]"
                          >
                            View decision proof on CSPR.live
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <div className="text-[#94A3B8] mt-1">Magen3 automatically queues every recordable decision for the relayer. The link appears after Casper returns a real decision deploy hash.</div>
                        )}
                      </div>
                    </div>

                    <details className="border-t border-[#1E293B] pt-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8] hover:text-[#22D3EE]">
                        Advanced manual decision proof fallback
                      </summary>
                      <div className="mt-3 space-y-2">
                        <InputField
                          label={realDeploy ? "Replace Decision Deploy Hash" : "Decision Deploy Hash"}
                          value={deployHash}
                          onChange={setDeployHash}
                          placeholder="Paste 64-character record_decision deploy hash from Casper"
                        />
                        <Btn
                          variant="outline"
                          size="sm"
                          className="w-full justify-center"
                          onClick={confirmDeployHash}
                          disabled={!deployHash.trim() || casperLoading}
                        >
                          <CheckCircle size={14} />
                          {realDeploy ? "Update Decision Proof" : "Confirm Decision Proof Hash"}
                        </Btn>
                      </div>
                    </details>
                  </div>
                );
              })()}

              {(() => {
                const executionStatus = executionProofStatus(selected.executionStatus || "", selected.executionTxHash || "");
                const isX402Payment = selected.action === "x402 Payment";
                const settlement = isX402Payment ? auditX402Settlement(selected) : null;
                const realExecution = isRealCasperDeployHash(selected.executionTxHash || "");
                const canAttachExecution = selected.decision === "Allowed" && !isX402Payment;
                const settlementReference = typeof settlement?.facilitatorReference === "string" ? settlement.facilitatorReference : "Not reported";
                const resourceDelivered = settlement?.resourceDelivered === true;
                return (
                  <div className="rounded-xl border border-[#22C55E]/20 bg-[#050B14] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold font-['Space_Grotesk']">
                          <Send size={16} className="text-[#22C55E]" />
                          {isX402Payment ? "Payment Settlement" : "Execution Proof"}
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-1">
                          {isX402Payment
                            ? "Shows the settlement and paid-resource delivery state reported by the authenticated external x402 adapter."
                            : "Shows whether the execution wallet actually signed and submitted the approved action."}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${executionStatus.className}`}>
                        {executionStatus.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">{isX402Payment ? "Settlement Status" : "Execution Status"}</span>
                        <div className="text-[#F8FAFC] mt-1">{selected.executionStatus || "not_submitted"}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">{isX402Payment ? "Payment Wallet" : "Signed By"}</span>
                        <div className="text-[#F8FAFC] mt-1 break-all">{selected.executionSignedBy || selected.executionWalletAddress || (isX402Payment ? "Not reported" : "Waiting for wallet signature")}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">{isX402Payment ? "Settlement Transaction Hash" : "Execution Deploy Hash"}</span>
                        <div className={`font-mono mt-1 break-all ${(realExecution || selected.executionStatus === "x402_confirmed") ? "text-[#22C55E]" : "text-[#F8FAFC]"}`}>
                          {selected.executionTxHash ? (isX402Payment ? selected.executionTxHash : normalizeCasperDeployHash(selected.executionTxHash)) : "None"}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Submission Attempt</span>
                        <div className="text-[#F8FAFC] mt-1">{selected.executionAttemptCount || 0}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Confirmations</span>
                        <div className="text-[#F8FAFC] mt-1">{selected.executionConfirmations || 0} / {selected.executionRequiredConfirmations || 1}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Finality</span>
                        <div className={`mt-1 font-semibold ${selected.executionFinalizedAt ? "text-[#22C55E]" : selected.executionFinalityDeadline ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>
                          {selected.executionFinalizedAt ? `Finalized ${fmtTs(selected.executionFinalizedAt)}` : selected.executionFinalityDeadline ? `Due ${fmtTs(selected.executionFinalityDeadline)}` : "Not reported"}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Reconciliation Provider</span>
                        <div className="text-[#F8FAFC] mt-1 break-all">{selected.reconciliationProvider || "Not reported"}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Resource Delivery</span>
                        <div className={`mt-1 font-semibold ${selected.resourceDeliveryStatus === "delivered" ? "text-[#22C55E]" : selected.resourceDeliveryStatus === "pending" ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>{selected.resourceDeliveryStatus || "not_required"}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Refund</span>
                        <div className={`mt-1 font-semibold ${selected.refundStatus === "refunded" ? "text-[#22C55E]" : selected.refundStatus === "pending" ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>{selected.refundStatus || "not_applicable"}</div>
                      </div>
                      {(selected.executionReplacedBy || selected.executionReplacementOf) && (
                        <div className="col-span-2">
                          <span className="text-[#94A3B8] uppercase tracking-wider">Replacement Link</span>
                          <div className="text-[#C4B5FD] font-mono mt-1 break-all">{selected.executionReplacedBy || selected.executionReplacementOf}</div>
                          {(selected.executionReplacedByAuditId || selected.executionReplacementAuditId) && <div className="mt-1 text-[#94A3B8]">Audit: {selected.executionReplacedByAuditId || selected.executionReplacementAuditId}</div>}
                        </div>
                      )}
                      {selected.executionFailureReason && (
                        <div className="col-span-2 rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 p-3">
                          <span className="text-[#FCA5A5] uppercase tracking-wider">Failure Reason</span>
                          <div className="text-[#FCA5A5] mt-1">{selected.executionFailureReason}</div>
                        </div>
                      )}
                      {isX402Payment && (
                        <>
                          <div>
                            <span className="text-[#94A3B8] uppercase tracking-wider">Facilitator Reference</span>
                            <div className="text-[#F8FAFC] mt-1 break-all">{settlementReference}</div>
                          </div>
                          <div>
                            <span className="text-[#94A3B8] uppercase tracking-wider">Resource Delivered</span>
                            <div className={`mt-1 font-semibold ${resourceDelivered ? "text-[#22C55E]" : "text-[#F59E0B]"}`}>{resourceDelivered ? "Confirmed" : "Not confirmed"}</div>
                          </div>
                        </>
                      )}
                      <div className="col-span-2 rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Why</span>
                        <div className="text-[#F8FAFC] mt-1">{executionProofExplanation(selected)}</div>
                      </div>
                      {selected.executionNote && (
                        <div className="col-span-2">
                          <span className="text-[#94A3B8] uppercase tracking-wider">{isX402Payment ? "Settlement Note" : "Execution Note"}</span>
                          <div className="text-[#F8FAFC] mt-1">{selected.executionNote}</div>
                        </div>
                      )}
                      {Array.isArray(selected.executionHistory) && selected.executionHistory.length > 0 && (
                        <details className="col-span-2 rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                          <summary className="cursor-pointer text-[#94A3B8] uppercase tracking-wider">Reconciliation History · {selected.executionHistory.length} event{selected.executionHistory.length === 1 ? "" : "s"}</summary>
                          <div className="mt-3 space-y-2">
                            {[...selected.executionHistory].reverse().map((event, index) => (
                              <div key={`${String(event.fingerprint || event.observedAt || index)}-${index}`} className="rounded-lg border border-[#1E293B] bg-[#050B14] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-[#F8FAFC]">{String(event.status || "unknown")}</span>
                                  <span className="text-[#94A3B8]">{event.observedAt ? fmtTs(String(event.observedAt)) : "Timestamp unavailable"}</span>
                                </div>
                                <div className="mt-2 grid gap-2 md:grid-cols-3 text-[#94A3B8]">
                                  <span>Attempt {String(event.attempt ?? 0)}</span>
                                  <span>{String(event.confirmations ?? 0)} confirmations</span>
                                  <span>{event.provider ? `Provider ${String(event.provider)}` : "Provider not reported"}</span>
                                </div>
                                {event.transactionHash && <div className="mt-2 break-all font-mono text-[#22D3EE]">{String(event.transactionHash)}</div>}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Explorer</span>
                        {realExecution && !isX402Payment ? (
                          <a
                            href={casperDeployUrl(selected.executionTxHash || "")}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 text-[#22C55E] hover:text-[#F8FAFC]"
                          >
                            View execution on CSPR.live
                            <ExternalLink size={12} />
                          </a>
                        ) : isX402Payment ? (
                          <div className="text-[#94A3B8] mt-1">
                            Magen3 stores the reported settlement transaction hash without guessing a network explorer. Verify it through the explorer or facilitator appropriate to the payment network.
                          </div>
                        ) : (
                          <div className="text-[#94A3B8] mt-1">
                            {selected.decision === "Allowed"
                              ? "Available after the execution wallet signs and submits the approved Casper transaction."
                              : "No execution explorer link is expected because this action was not approved for execution."}
                          </div>
                        )}
                      </div>
                    </div>

                    {isX402Payment ? (
                      <div className="rounded-lg border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-3 text-xs leading-relaxed text-[#94A3B8]">
                        Settlement state must be reported through the authenticated <span className="font-mono text-[#F8FAFC]">/api/agent-gateway/x402/settlements</span> endpoint using the authorized request fingerprint. Magen3 does not accept PAYMENT-SIGNATURE or signed payment payloads.
                      </div>
                    ) : canAttachExecution ? (
                      <details className="border-t border-[#1E293B] pt-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8] hover:text-[#22C55E]">
                          Advanced manual execution hash fallback
                        </summary>
                        <div className="mt-3 space-y-2">
                          <InputField
                            label={realExecution ? "Replace Execution Deploy Hash" : "Execution Deploy Hash"}
                            value={executionHash}
                            onChange={setExecutionHash}
                            placeholder="Paste the real transaction/deploy hash after wallet signing"
                          />
                          <Btn
                            variant="outline"
                            size="sm"
                            className="w-full justify-center"
                            onClick={confirmExecutionHash}
                            disabled={!executionHash.trim() || casperLoading}
                          >
                            <ShieldCheck size={14} />
                            {realExecution ? "Update Execution Proof" : "Attach Execution Hash"}
                          </Btn>
                        </div>
                      </details>
                    ) : (
                      <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3 text-xs text-[#94A3B8]">
                        Execution is disabled because Magen3 did not approve this action.
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-[#1E293B] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider">
                      Decision Proof Recorder
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Magen3 automatically tries to record every recordable decision. Use this section to inspect the payload, retry the relayer, or manually confirm a deploy hash if needed.
                    </p>
                  </div>
                  {selected.txHash && <StatusBadge status="Active" />}
                </div>

                {casperError && (
                  <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-xs text-[#EF4444]">
                    {casperError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Btn
                    variant="secondary"
                    size="sm"
                    onClick={() => prepareCasperPayload(selected.id)}
                    disabled={casperLoading}
                  >
                    <Code2 size={14} />
                    {casperLoading ? "Preparing..." : "Prepare Decision Payload"}
                  </Btn>
                  {!selected.txHash && (
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={() => recordAuditOnChain(selected.id)}
                      disabled={casperLoading}
                    >
                      <Database size={14} />
                      Retry Decision Proof
                    </Btn>
                  )}
                </div>

                {casperPrepared && (
                  <div className="space-y-3 rounded-lg bg-[#050B14] border border-[#1E293B] p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Network</span>
                        <div className="text-[#F8FAFC] mt-1">{casperPrepared.casper.network || "casper-testnet"}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Entrypoint</span>
                        <div className="text-[#F8FAFC] mt-1">{casperPrepared.contractEntrypoint}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Decision Payload Hash</span>
                        <div className="text-[#22D3EE] font-mono mt-1 break-all">{casperPrepared.payloadHash}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Contract Hash</span>
                        <div className="text-[#F8FAFC] font-mono mt-1 break-all">
                          {casperPrepared.casper.contractHash || "Not configured yet"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#94A3B8] uppercase tracking-wider">Runtime Args</span>
                        <button
                          onClick={copyCasperPayload}
                          className="inline-flex items-center gap-1 text-xs text-[#22D3EE] hover:text-[#F8FAFC]"
                        >
                          <Copy size={12} />
                          {copiedPayload ? "Copied" : "Copy JSON"}
                        </button>
                      </div>
                      <pre className="max-h-44 overflow-auto rounded-lg bg-[#0B1220] border border-[#1E293B] p-3 text-xs text-[#94A3B8]">
                        {JSON.stringify(casperPrepared.runtimeArgs, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Docs Page
// ──────────────────────────────────────────────────────────

const docsSidebar = [
  {
    group: "Getting Started",
    items: [
      { id: "intro", label: "What is Magen3?" },
      { id: "architecture", label: "How Magen3 Works" },
      { id: "cross-chain-doc", label: "Cross-chain Model" },
      { id: "quick-start", label: "Quick Start" },
      { id: "core-concepts", label: "Core Concepts" },
    ],
  },
  {
    group: "Agent Shield",
    items: [
      { id: "agent-shield-doc", label: "Agent Shield Overview" },
      { id: "shield-modules-doc", label: "Protection Modules" },
      { id: "emergency-controls-doc", label: "Emergency Circuit Breaker" },
      { id: "threat-intelligence-doc", label: "Threat Intelligence" },
      { id: "agent-flow-doc", label: "Security Pipeline" },
      { id: "connected-agents-doc", label: "Execution Capabilities" },
    ],
  },
  {
    group: "Agent Management",
    items: [
      { id: "connected-agents-doc", label: "Connected Agents" },
      { id: "api-keys-doc", label: "Agent API Keys" },
      { id: "agent-flow-doc", label: "Agent Gateway Flow" },
      { id: "api-request-doc", label: "Integration Examples" },
      { id: "case-study-doc", label: "Case Study: Lobstar Wilde" },
    ],
  },
  {
    group: "Developer Platform",
    items: [
      { id: "developer-portal-doc", label: "Developer Portal" },
      { id: "sdk-typescript-doc", label: "TypeScript SDK" },
      { id: "sdk-python-doc", label: "Python SDK" },
      { id: "mcp-server-doc", label: "MCP Server" },
      { id: "agent-skills-doc", label: "Agent Skills Kit" },
      { id: "integration-test-doc", label: "Real Agent Test" },
    ],
  },
  {
    group: "Audit & Proofs",
    items: [
      { id: "proofs-doc", label: "Casper Decision Proof" },
      { id: "proofs-doc", label: "Execution Proof" },
      { id: "proofs-doc", label: "Decision vs Execution Hash" },
    ],
  },
  {
    group: "Reference",
    items: [
      { id: "security-doc", label: "Security Model" },
      { id: "troubleshooting-doc", label: "Troubleshooting" },
      { id: "faq-doc", label: "FAQ" },
    ],
  },
];

const docsOnThisPage = [
  { id: "intro", label: "What is Magen3?" },
  { id: "architecture", label: "Platform Architecture" },
  { id: "cross-chain-doc", label: "Cross-chain Model" },
  { id: "shield-modules-doc", label: "Protection Modules" },
  { id: "emergency-controls-doc", label: "Emergency Circuit Breaker" },
  { id: "threat-intelligence-doc", label: "Threat Intelligence" },
  { id: "agent-flow-doc", label: "Agent Shield Flow" },
  { id: "connected-agents-doc", label: "Connected Agents" },
  { id: "api-keys-doc", label: "Agent API Keys" },
  { id: "api-request-doc", label: "Gateway API" },
  { id: "developer-portal-doc", label: "Developer Portal" },
  { id: "sdk-typescript-doc", label: "TypeScript SDK" },
  { id: "sdk-python-doc", label: "Python SDK" },
  { id: "mcp-server-doc", label: "MCP Server" },
  { id: "agent-skills-doc", label: "Agent Skills Kit" },
  { id: "integration-test-doc", label: "Real Agent Test" },
  { id: "security-doc", label: "Security Model" },
  { id: "case-study-doc", label: "Case Study" },
  { id: "proofs-doc", label: "Casper Proofs" },
  { id: "troubleshooting-doc", label: "Troubleshooting" },
  { id: "faq-doc", label: "FAQ" },
];

function scrollToDocSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function DocsBadge({ label, variant }: { label: string; variant: "live" | "preview" | "info" | "warning" }) {
  const styles = {
    live: "border-[#22C55E]/30 bg-[#22C55E]/15 text-[#22C55E]",
    preview: "border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]",
    info: "border-[#22D3EE]/20 bg-[#22D3EE]/10 text-[#22D3EE]",
    warning: "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[variant]}`}>
      {label}
    </span>
  );
}

function DocsCallout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "danger" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-[#22D3EE]/25 bg-[#22D3EE]/5",
    warning: "border-[#F59E0B]/30 bg-[#F59E0B]/5",
    danger: "border-[#EF4444]/30 bg-[#EF4444]/5",
    success: "border-[#22C55E]/30 bg-[#22C55E]/5",
  };
  const iconStyles = {
    info: "text-[#22D3EE]",
    warning: "text-[#F59E0B]",
    danger: "text-[#EF4444]",
    success: "text-[#22C55E]",
  };
  const Icon = type === "danger" ? ShieldX : type === "success" ? CheckCircle : type === "warning" ? AlertTriangle : Shield;

  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${styles[type]}`}>
      <Icon size={16} className={`mt-0.5 shrink-0 ${iconStyles[type]}`} />
      <div className="text-sm leading-relaxed text-[#94A3B8]">{children}</div>
    </div>
  );
}

function DocsCodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    const copiedOk = await writeClipboard(code);
    setCopied(copiedOk);
    setTimeout(() => setCopied(false), 1400);
  }, [code]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#1E293B] bg-[#050B14]">
      <div className="flex items-center justify-between border-b border-[#1E293B] px-4 py-2">
        <span className="font-mono text-xs uppercase tracking-wider text-[#94A3B8]">{lang}</span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8] transition-colors hover:text-[#22D3EE]"
        >
          {copied ? <CheckCircle size={12} className="text-[#22C55E]" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre p-5 font-mono text-xs leading-relaxed text-[#94A3B8]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function DocsFlowStep({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="min-w-[128px] rounded-xl border border-[#1E293B] bg-[#111827] px-3 py-3 text-center">
      <div className="font-['Space_Grotesk'] text-xs font-semibold text-[#F8FAFC]">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-[#94A3B8]">{sub}</div>}
    </div>
  );
}

function DocsFlowArrow() {
  return <ChevronRight size={16} className="shrink-0 text-[#22D3EE]" />;
}

function DocsPage() {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    new Set(["Getting Started", "Agent Shield", "Agent Management", "Developer Platform"])
  );

  const filteredSidebar = docsSidebar
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        !search.trim() || item.label.toLowerCase().includes(search.trim().toLowerCase())
      ),
    }))
    .filter((group) => group.items.length > 0);

  const toggleGroup = useCallback((group: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const apiRequest = `POST /api/agent-gateway/intents

x-magen3-agent-key: YOUR_AGENT_API_KEY
Content-Type: application/json

{
  "source": "YieldBot AI",
  "agentId": "MAG-AGENT-...",
  "targetChain": "casper-testnet",
  "walletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "executionWalletAddress": "EXECUTION_WALLET_PUBLIC_KEY",
  "goal": "Stake 15 CSPR to a trusted validator",
  "reason": "The agent prepared this action and needs Magen3 approval.",
  "action": {
    "type": "Stake",
    "amount": 15,
    "asset": "CSPR",
    "target": "VALIDATOR_OR_CONTRACT_ADDRESS",
    "targetType": "Trusted Contract"
  }
}`;

  const apiResponse = `{
  "executionApproved": true,
  "result": {
    "decision": "Allowed",
    "risk": "Low",
    "reason": "The action matches the active policy."
  },
  "nextAction": "Request wallet signature before execution"
}`;

  return (
    <div className="flex min-h-[calc(100vh-57px)] bg-[#050B14]">
      <aside className="hidden w-64 shrink-0 border-r border-[#1E293B] bg-[#0B1220] lg:flex lg:flex-col">
        <div className="border-b border-[#1E293B] p-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className={`${INPUT_CLS} pl-9 text-xs`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search docs..."
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {filteredSidebar.map((group) => (
            <div key={group.group} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.group)}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
              >
                {group.group}
                <ChevronDown
                  size={13}
                  className={`transition-transform ${openGroups.has(group.group) ? "" : "-rotate-90"}`}
                />
              </button>
              {openGroups.has(group.group) && (
                <div className="mb-2 ml-2">
                  {group.items.map((item) => (
                    <button
                      type="button"
                      key={`${group.group}-${item.label}`}
                      onClick={() => scrollToDocSection(item.id)}
                      className="block w-full rounded-lg px-4 py-1.5 text-left text-sm text-[#94A3B8] transition-colors hover:bg-[#1E293B]/70 hover:text-[#F8FAFC]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="border-b border-[#1E293B] bg-[#050B14] px-6 py-6 lg:px-8">
          <div className="max-w-5xl">
            <div className="mb-3 flex items-center gap-2">
              <BrandLogo className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">
                Documentation
              </span>
            </div>
            <h1 className="font-['Space_Grotesk'] text-3xl font-bold text-[#F8FAFC]">
              Magen3 Docs
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#94A3B8]">
              Developer and security documentation for the Magen3 Platform, Agent Shield, execution capabilities, protection modules, policies, integrations, audit logs, and Casper decision proofs.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <DocsBadge label="Agent Shield Live" variant="live" />
              <DocsBadge label="Casper Testnet" variant="info" />
              <DocsBadge label="Cross-chain Gateway" variant="info" />
            </div>
          </div>
        </header>

        <div className="flex">
          <article className="min-w-0 flex-1 px-6 py-8 lg:px-8">
            <div className="max-w-4xl space-y-12">
              <section id="intro" className="scroll-mt-8">
                <DocsBadge label="Getting Started" variant="live" />
                <h2 className="mt-4 font-['Space_Grotesk'] text-3xl font-bold text-[#F8FAFC]">
                  What is Magen3?
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[#94A3B8]">
                  Magen3 is a modular execution firewall for autonomous blockchain agents. It protects an agent before wallet signing or blockchain execution by authenticating the caller, loading its execution capabilities and active policy, running relevant protection checks, assessing risk, and returning Allowed, Blocked, or Review Required.
                </p>
                <p className="mt-4 text-base leading-relaxed text-[#94A3B8]">
                  Magen3 sits between <span className="font-semibold text-[#F8FAFC]">agent intent</span> and{" "}
                  <span className="font-semibold text-[#F8FAFC]">execution</span>. Agent Shield is the live centerpiece; protection modules live under it rather than being presented as separate live products.
                </p>
              </section>

              <section id="architecture" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Platform Architecture</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Magen3 coordinates the complete pre-execution journey through a single platform architecture.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      icon: Layers,
                      title: "Agent Shield",
                      desc: "Coordinates authentication, configuration, policy, relevant protection checks, risk assessment, decision, audit, and proof.",
                    },
                    {
                      icon: FileText,
                      title: "Policy and Risk Engines",
                      desc: "Deterministic rules and structured findings produce Allowed, Blocked, or Review Required.",
                    },
                    {
                      icon: Server,
                      title: "Gateway and Integrations",
                      desc: "External agents connect through HTTP, SDKs, MCP, Codex skills, or compatible autonomous runtimes.",
                    },
                    {
                      icon: Database,
                      title: "Audit and Casper Proof",
                      desc: "Every decision is stored with its pipeline, findings, explanation, and proof state.",
                    },
                  ].map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.title} className={`${CARD} p-5 transition-colors hover:border-[#22D3EE]/25`}>
                        <div className="mb-3 flex items-center gap-2.5">
                          <div className="rounded-lg bg-[#22D3EE]/10 p-2 text-[#22D3EE]">
                            <Icon size={18} />
                          </div>
                          <h3 className="font-['Space_Grotesk'] font-semibold text-[#F8FAFC]">
                            {card.title}
                          </h3>
                        </div>
                        <p className="text-sm leading-relaxed text-[#94A3B8]">{card.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section id="cross-chain-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Cross-chain Model</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Magen3 is chain-agnostic at the policy and gateway layer. The current implementation uses Casper
                  Testnet for decision proofs, while the action being reviewed can describe an intended
                  execution on Casper, an EVM chain, Solana, or another target environment.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {[
                    ["Policy layer", "Magen3 evaluates the agent, action type, target, amount, and risk before execution."],
                    ["Target chain", "The external agent can include the intended execution chain in the intent payload."],
                    ["Execution layer", "Wallet signing and transaction submission still happen outside Magen3."],
                    ["Proof layer", "The current implementation records Magen3's decision proof on Casper Testnet."],
                  ].map(([title, desc]) => (
                    <div key={title} className={`${CARD} p-4`}>
                      <div className="mb-2 flex items-center gap-2 text-[#22D3EE]">
                        <Globe size={15} />
                        <h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3>
                      </div>
                      <p className="text-xs leading-relaxed text-[#94A3B8]">{desc}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-5">
                  <div className="flex min-w-max items-center gap-2">
                    <DocsFlowStep label="Agent intent" sub="Any supported chain" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Magen3 policy" sub="Chain-agnostic check" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Decision" sub="Allow / Block / Review" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Target-chain execution" sub="Only if allowed" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Casper proof" sub="Audit record" />
                  </div>
                </div>
                <div className="mt-5">
                  <DocsCallout type="info">
                    Cross-chain support should be presented as an architecture. The live implementation records
                    decision proofs on Casper Testnet; full target-chain adapters can be added as the
                    gateway expands.
                  </DocsCallout>
                </div>
              </section>

              <section id="quick-start" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Quick Start</h2>
                <div className="mt-5 grid gap-3">
                  {[
                    "Connect Casper Wallet as the Magen3 owner wallet.",
                    "Register an agent through the guided wizard and select one or more execution capabilities.",
                    "Accept or customize the recommended protection and starter policy.",
                    "Copy the one-time Agent ID and API key into the external agent.",
                    "Test the real request format in Intent Playground, then send every production intent before wallet signing.",
                    "Review structured findings, timeline stages, audit logs, and Casper decision-proof status.",
                  ].map((step, index) => (
                    <div key={step} className="flex gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE]/10 text-xs font-bold text-[#22D3EE]">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-relaxed text-[#94A3B8]">{step}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="core-concepts" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Core Concepts</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Connected Agent", "The external AI app, bot, or autonomous system calling Magen3."],
                    ["Agent ID", "The public identifier for the connected agent."],
                    ["Agent API Key", "The secret credential used by that agent to call the gateway."],
                    ["Execution Capabilities", "One or more descriptions of what the agent can execute: Trading, Wallet Management, Treasury Operations, dApp Interactions, Enterprise Automation, or Custom."],
                    ["Protection Modules", "Relevant Agent Shield checks with honest Live, Foundation Available, Preview, or Planned status."],
                    ["Target Chain", "The chain or execution environment the external agent intends to use."],
                    ["Execution Wallet", "The wallet that signs the real transaction after approval."],
                    ["Decision", "Allowed, Blocked, or Review Required."],
                    ["Decision Proof", "The Casper record proving Magen3 reviewed the action."],
                  ].map(([title, desc]) => (
                    <div key={title} className={`${CARD} p-4`}>
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="shield-modules-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Shield Protection Modules</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Protection modules live under Agent Shield. Status is based on the current backend, not marketing language. Preview and Planned modules do not silently contribute a pass result.
                </p>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B]">
                  <table className="w-full text-sm">
                    <thead className="bg-[#050B14]"><tr className="border-b border-[#1E293B]">{["Module", "Status", "Current checks", "Capabilities"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">{heading}</th>)}</tr></thead>
                    <tbody className="divide-y divide-[#1E293B]">
                      {PROTECTION_MODULE_CATALOG.map((module) => (
                        <tr key={module.id} className="bg-[#111827] align-top">
                          <td className="px-4 py-3"><div className="font-semibold text-[#F8FAFC]">{module.name}</div><div className="mt-1 max-w-xs text-xs leading-relaxed text-[#94A3B8]">{module.description}</div></td>
                          <td className="px-4 py-3"><StatusBadge status={module.status} /></td>
                          <td className="px-4 py-3 text-xs leading-relaxed text-[#94A3B8]">{module.currentChecks.length ? module.currentChecks.join(" · ") : "No backend checks implemented."}</td>
                          <td className="px-4 py-3"><CapabilityChips capabilities={module.capabilities} compact /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-5"><DocsCallout type="info"><span className="font-semibold text-[#F8FAFC]">Eight protection areas:</span> Agent Trust & Access, Policy & Approval Controls, Wallet & Asset Safety, Contract & Permission Safety, Execution Integrity, Market & Oracle Integrity, Cross-chain & Payment Controls, and Threat & Compliance. Status is shown per control. Transaction preflight and Lifecycle & Replay are Live inside Execution Integrity. Execution & Settlement Reconciliation now has authenticated reporting, deterministic transitions, retry prevention, replacement tracking, finality, delivery, and refund handling as Foundation Available; real chain polling remains the Live criterion. Stateful simulation remains Foundation Available.</DocsCallout></div>
              </section>


              <section id="emergency-controls-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <div className="flex flex-wrap items-center gap-2"><h2 className={SECTION_TITLE}>Emergency Circuit Breaker</h2><DocsBadge label="Live" variant="live" /></div>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Emergency Controls persist scoped pause records separately from agent credentials and policies. Owners can stop one agent, capability, action, policy, Trading, Contract, Bridge, x402, all execution, or the wallet-owned platform scope. Matching requests return Blocked or Review Required before wallet signing.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {[
                    ["Persistent scope", "Pause state survives process restarts in PostgreSQL and has matching memory-store behavior."],
                    ["Automatic triggers", "Opt-in thresholds can react to replay, repeated blocks, threat, oracle, provider, settlement, and privileged-action findings."],
                    ["Audited resume", "Expiry, direct resume, and approval-gated quorum resume preserve exact evidence and Casper proof state."],
                  ].map(([title, description]) => <div key={title} className={`${CARD} p-4`}><h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{description}</p></div>)}
                </div>
                <div className="mt-5"><DocsCallout type="danger">An active pause must not be bypassed through a different tool, route, provider, action label, or retry key. Resolve the incident through the authorized resume workflow.</DocsCallout></div>
              </section>

              <section id="threat-intelligence-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Threat Intelligence Foundation</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Magen3 can screen normalized Casper wallet, account-hash, Contract Hash, and Package Hash identifiers against an operator-configured JSON feed. Matching is deterministic and exact. A no-match result means only that the configured feed contained no exact indicator for the submitted form; it is not proof that a target is safe.
                </p>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {[
                    ["Observe", "Record exact matches without changing authorization."],
                    ["Review", "Require human review for medium-or-higher matches above the confidence threshold."],
                    ["Enforce", "Block high or critical matches and review medium matches."],
                  ].map(([title, description]) => (
                    <div key={title} className={`${CARD} p-4`}><h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{description}</p></div>
                  ))}
                </div>
                <div className="mt-5"><DocsCallout type="warning">A stale or unavailable feed never counts as a pass. Policies can Warn, require Review, or Block when the feed cannot be used. No external provider is bundled, so the module remains Foundation Available.</DocsCallout></div>
              </section>

              <section id="agent-shield-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Shield</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Agent Shield is the live protection system for autonomous agents. It authenticates the agent, loads its execution-capability configuration and effective policy, runs only relevant checks, produces structured findings, performs deterministic risk assessment, stores the audit record, and submits the Casper decision proof.
                </p>
              </section>

              <section id="agent-flow-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Shield & Gateway Flow</h2>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-5">
                  <div className="flex min-w-max items-center gap-2">
                    <DocsFlowStep label="Intent received" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Agent authenticated" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Configuration + policy" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Emergency pause state" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Relevant checks" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Risk + decision" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Audit + Casper proof" />
                  </div>
                </div>
                <div className="mt-5">
                  <DocsCallout type="warning">
                    External agents should never request wallet signing before Magen3 returns an{" "}
                    <span className="font-semibold text-[#22C55E]">Allowed</span> decision.
                  </DocsCallout>
                </div>
              </section>

              <section id="connected-agents-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Connected Agents</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Connected Agents are external AI apps, bots, or autonomous systems allowed to call Magen3. Each agent can select multiple execution capabilities. Capabilities drive protection and starter-policy recommendations, while the active policy remains the source of authorization.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Agent ID", "Identifies the external agent."],
                    ["API Key", "Authenticates each gateway request."],
                    ["Capabilities", "Describe the agent’s execution surfaces and drive relevant recommendations."],
                    ["Policy", "Deterministically controls what the agent can do."],
                    ["Security Coverage", "Explains configuration completeness without claiming invulnerability."],
                    ["Integration Health", "Uses gateway, credential, policy, recent intent, audit, and proof data."],
                  ].map(([title, desc]) => (
                    <div key={title} className={`${CARD} p-4`}>
                      <h3 className="text-sm font-semibold text-[#22D3EE]">{title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="api-keys-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent API Keys</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  One API key is created per connected agent. Policies attach to agents, not global app keys.
                  Raw API keys are shown once after registration or rotation.
                </p>
                <div className="mt-5">
                  <DocsCallout type="danger">
                    If a key is lost, rotate it. If an agent is compromised, revoke it. Magen3 stores only
                    the secure key hash and preview after the one-time display.
                  </DocsCallout>
                </div>
              </section>

              <section id="api-request-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Gateway API Example</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  External agents submit action intents to the gateway before requesting wallet signatures.
                </p>
                <div className="mt-5">
                  <DocsCodeBlock lang="http" code={apiRequest} />
                </div>
                <h3 className="mt-6 text-sm font-semibold text-[#F8FAFC]">Example response</h3>
                <div className="mt-3">
                  <DocsCodeBlock lang="json" code={apiResponse} />
                </div>
              </section>

              <section id="developer-portal-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <div className="flex flex-wrap items-center gap-2">
                  <DocsBadge label="Developer Platform" variant="live" />
                  <DocsBadge label="Official SDKs" variant="info" />
                  <DocsBadge label="MCP" variant="info" />
                </div>
                <h2 className={`${SECTION_TITLE} mt-4`}>Developer Portal</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#94A3B8]">
                  Integrate an external DeFi agent, treasury bot, trading agent, or MCP-compatible assistant
                  with the same Magen3 Gateway used by Agent Shield. Register the agent first, assign an active
                  policy, then choose the integration path that matches the agent runtime.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {[
                    { icon: <Code2 size={18} />, title: "TypeScript SDK", text: "For Node.js, TypeScript, LangGraph, trading bots, and custom Web3 agents.", target: "sdk-typescript-doc" },
                    { icon: <FileText size={18} />, title: "Python SDK", text: "For Python agents, CrewAI, AutoGen, research agents, and automation services.", target: "sdk-python-doc" },
                    { icon: <Server size={18} />, title: "MCP Server", text: "For Codex and other MCP-compatible agents that discover Magen3 as a tool.", target: "mcp-server-doc" },
                    { icon: <Bot size={18} />, title: "Agent Skills Kit", text: "Behavioral instructions that tell an agent when to check intent and how to obey decisions.", target: "agent-skills-doc" },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.title}
                      onClick={() => scrollToDocSection(item.target)}
                      className="rounded-xl border border-[#1E293B] bg-[#111827] p-5 text-left transition-colors hover:border-[#22D3EE]/40 hover:bg-[#111827]/80"
                    >
                      <span className="mb-3 inline-flex rounded-lg border border-[#22D3EE]/20 bg-[#22D3EE]/10 p-2 text-[#22D3EE]">{item.icon}</span>
                      <span className="block text-sm font-semibold text-[#F8FAFC]">{item.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-[#94A3B8]">{item.text}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-5">
                  <DocsCallout type="warning">
                    SDKs and MCP evaluate intent; they do not read browser-wallet storage, expose private keys,
                    approve wallet popups, or sign transactions. Wallet approval remains human-controlled.
                  </DocsCallout>
                </div>
              </section>

              <section id="sdk-typescript-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Official TypeScript SDK</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Install the public beta package in the external agent backend. <code className="text-[#22D3EE]">MAGEN3_GATEWAY_URL</code> is the API base URL only.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="bash" code={`pnpm add @magen3/sdk@beta`} /></div>
                <div className="mt-4"><DocsCodeBlock lang="env" code={`MAGEN3_GATEWAY_URL=https://magen3-production.up.railway.app
MAGEN3_AGENT_ID=MAG-AGENT-...
MAGEN3_API_KEY=YOUR_PRIVATE_AGENT_KEY`} /></div>
                <div className="mt-4"><DocsCodeBlock lang="typescript" code={`import {
  Magen3Client,
  createMagen3InstructionIntegrityBinding,
  getMagen3AgentMessage,
} from "@magen3/sdk";

const magen3 = Magen3Client.fromEnv(process.env);
intent.action.instructionIntegrity = await createMagen3InstructionIntegrityBinding(intent, {
  goalId: stableGoalId,
  originalUserRequest,
});

const decision = await magen3.checkIntent(intent);
if (decision.result.decision !== "Allowed" || decision.executionApproved !== true) {
  throw new Error(getMagen3AgentMessage(decision));
}`} /></div>
                <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
                  Use <code className="text-[#F8FAFC]">createMagen3InstructionIntegrityBinding</code> so Magen3 can identify the exact protected field that is missing or changed. Use <code className="text-[#F8FAFC]">requireAllowed</code> when the caller should throw automatically on Blocked, Review Required, malformed responses, authentication failures, and gateway errors.
                </p>
              </section>

              <section id="sdk-python-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Official Python SDK</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  The Python SDK uses the same three canonical environment variables as the TypeScript SDK and MCP server.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="bash" code={`python -m pip install -e packages/sdk-python`} /></div>
                <div className="mt-4"><DocsCodeBlock lang="python" code={`from magen3 import (
    Magen3Client,
    create_instruction_integrity_binding,
    get_agent_message,
)

client = Magen3Client.from_env()
intent["action"]["instructionIntegrity"] = create_instruction_integrity_binding(
    intent,
    goal_id=stable_goal_id,
    original_user_request=original_user_request,
)
decision = client.check_intent(intent)
if decision.get("result", {}).get("decision") != "Allowed" or not decision.get("executionApproved"):
    raise RuntimeError(get_agent_message(decision))`} /></div>
              </section>

              <section id="mcp-server-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Official MCP Server</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  The local stdio server lives at <code className="text-[#22D3EE]">packages/mcp-server</code>. It exposes six tools to MCP-compatible agents and supplies stable Tool & MCP Integrity metadata for its execution gates.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {["magen3_verify_agent", "magen3_get_intent_schema", "magen3_check_intent", "magen3_require_allowed", "magen3_get_approval", "magen3_report_x402_settlement"].map((tool) => (
                    <div key={tool} className="rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-3 font-mono text-xs text-[#22D3EE]">{tool}</div>
                  ))}
                </div>
                <div className="mt-5"><DocsCodeBlock lang="powershell" code={`pnpm mcp:build

codex mcp add magen3 \
  --env MAGEN3_GATEWAY_URL="https://magen3-production.up.railway.app" \
  --env MAGEN3_AGENT_ID="MAG-AGENT-..." \
  --env MAGEN3_API_KEY="YOUR_PRIVATE_KEY" \
  -- node "C:\\dev\\magen3\\packages\\mcp-server\\dist\\server.js"`} /></div>
                <DocsCallout type="info">
                  Keep the API key in local environment configuration. Do not commit it, place it in an Agent Skills file, or include it in screenshots.
                </DocsCallout>
                <div className="mt-4 rounded-xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[#F8FAFC]">Tool & MCP Integrity</h3>
                    <DocsBadge label="Live" variant="live" />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#94A3B8]">
                    The official adapter injects an exact server ID, package version, manifest/schema/description hashes, origin, transport assertion, credential-scope label, and least-privilege permission scope when downstream metadata is absent. Explicit downstream tool metadata is preserved and evaluated against the active policy.
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#64748B]">
                    Magen3 stores only public identifiers, hashes, and scopes. It never receives MCP credentials or secret tool output and does not claim to certify arbitrary tool code.
                  </p>
                </div>
              </section>

              <section id="agent-skills-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Skills Kit</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Connected Agents generates an Agent Skills Kit for the selected integration target. The skill tells the agent to submit every blockchain intent before execution and strictly obey Allowed, Blocked, and Review Required.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="text" code={`Before any Web3 execution:
1. Call Magen3 with the exact intended action.
2. Allowed: continue only when executionApproved is true and parameters are unchanged.
3. Blocked: stop immediately and show agentMessage.
4. Review Required: stop and inspect reviewResolution; remediate autonomously unless humanActionRequired is true.
5. Gateway or authentication error: fail closed; never bypass Magen3.`} /></div>
              </section>

              <section id="integration-test-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Test With a Real Agent</h2>
                <ol className="mt-5 space-y-3">
                  {[
                    "Register the external agent in Connected Agents and save its one-time API key securely.",
                    "Assign an active policy with predictable Allowed, Review Required, and Blocked limits.",
                    "Configure the TypeScript SDK, Python SDK, or MCP server with the Gateway URL, Agent ID, and API key.",
                    "Submit a harmless Casper Testnet intent below the policy limit without signing or broadcasting it.",
                    "Submit intents that trigger Review Required and Blocked, and verify the agent stops correctly.",
                    "Open Audit Logs and confirm the agent identity, decision, reason, risk, and Casper proof status.",
                  ].map((step, index) => (
                    <li key={step} className="flex gap-3 rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#22D3EE]/10 text-xs font-semibold text-[#22D3EE]">{index + 1}</span>
                      <span className="text-sm leading-relaxed text-[#94A3B8]">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-5"><DocsCallout type="success">
                  A successful integration proves the independent agent authenticates through its own Connected Agent, receives Magen3 decisions, obeys those decisions, and creates audit records before wallet signing.
                </DocsCallout></div>
              </section>

              <section id="security-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Security Model</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    "One API key per agent",
                    "Policy belongs to the agent",
                    "Owner wallet manages the agent",
                    "Execution wallet signs the actual transaction",
                    "Raw keys are shown once",
                    "Revoked agents cannot call the gateway",
                    "Unsafe actions fail closed",
                    "Decision records are auditable",
                  ].map((item) => (
                    <div key={item} className="flex gap-2.5 rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-3">
                      <CheckCircle size={14} className="mt-0.5 shrink-0 text-[#22C55E]" />
                      <span className="text-sm text-[#94A3B8]">{item}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section id="case-study-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Case Study: Wallet-Connected Agents Need Guardrails</h2>
                <div className="mt-5 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-[#F59E0B]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]">
                      Public AI-Agent Incident · 2026
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-[#94A3B8]">
                    Public reporting about a wallet-connected AI crypto agent called{" "}
                    <span className="font-semibold text-[#F8FAFC]">Lobstar Wilde</span> described an
                    unexpected token transfer after the agent processed an external request. The exact
                    financial impact depends on valuation and liquidity assumptions, but the security lesson
                    is clear: autonomous agents with wallet access need hard execution policies before they
                    can move assets.
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">
                    Agent Shield is designed to reduce this class of preventable execution failure by requiring
                    external agent actions to pass through policy checks before wallet signing. It is a guardrail,
                    not a claim that every possible exploit is automatically prevented.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs">
                    <a
                      href="https://www.ccn.com/education/crypto/ai-agent-sends-5-percent-memecoin-supply-250k-lobstar-wilde-incident/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#22D3EE] hover:text-[#F8FAFC]"
                    >
                      CCN report <ExternalLink size={11} />
                    </a>
                    <a
                      href="https://crypto.news/ai-trading-bot-lobstar-wilde-transfer-memecoin-2026/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#22D3EE] hover:text-[#F8FAFC]"
                    >
                      Crypto.news report <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-5">
                  <div className="flex min-w-max items-center gap-2">
                    <DocsFlowStep label="Public prompt" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Agent prepares action" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Magen3 checks policy" />
                    <DocsFlowArrow />
                    <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-3 text-center">
                      <div className="text-xs font-semibold text-[#EF4444]">Unsafe transfer blocked</div>
                    </div>
                    <DocsFlowArrow />
                    <DocsFlowStep label="Approved action" sub="Wallet signing" />
                  </div>
                </div>
              </section>

              <section id="proofs-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Decision and Execution Proofs</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Decision Proof records that Magen3 reviewed an action before execution. This is different
                  from the execution transaction itself.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className={`${CARD} p-5`}>
                    <div className="mb-3 flex items-center gap-2 text-[#22D3EE]">
                      <Database size={16} />
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">Decision Proof</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-[#94A3B8]">
                      <li>Records Magen3's policy decision</li>
                      <li>Shows what was allowed, blocked, or reviewed</li>
                      <li>Can be anchored on Casper</li>
                    </ul>
                  </div>
                  <div className={`${CARD} p-5`}>
                    <div className="mb-3 flex items-center gap-2 text-[#22C55E]">
                      <Send size={16} />
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">Execution Proof</h3>
                    </div>
                    <ul className="space-y-2 text-sm text-[#94A3B8]">
                      <li>Shows the real wallet transaction</li>
                      <li>Comes after wallet signing</li>
                      <li>Only exists if execution happens</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="troubleshooting-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Troubleshooting</h2>
                <div className="mt-5 grid gap-3">
                  {[
                    ["Gateway Unavailable", "Check that the backend service is running and VITE_API_URL points to the correct deployment."],
                    ["Invalid API Key", "The key may have been rotated or the agent revoked. Rotate or re-register from Connected Agents."],
                    ["No Active Policy", "Create and activate a policy for the connected agent before gateway execution."],
                    ["Casper Wallet Not Detected", "Install and unlock Casper Wallet in the browser before connecting."],
                    ["Decision Proof Pending", "Check the audit log and retry decision proof recording if the relayer has not confirmed a hash."],
                  ].map(([title, desc]) => (
                    <div key={title} className={`${CARD} p-4`}>
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#94A3B8]">{desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section id="faq-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>FAQ</h2>
                <div className="mt-5 space-y-3">
                  {[
                    ["What is live in Magen3?", "Agent Shield is live as the complete agent-protection flow. Individual protection modules are labeled Live, Foundation Available, Preview, or Planned according to real implementation status."],
                    ["Can Magen3 be cross-chain?", "Yes at the gateway and policy layer. The current implementation records decision proofs on Casper Testnet while future adapters can support more target chains."],
                    ["Is it one API key for the whole app?", "No. Use one API key per connected agent."],
                    ["Is it one API key per policy?", "No. Policies attach to agents. API keys authenticate agents."],
                    ["Can the execution wallet differ from the owner wallet?", "Yes. The owner wallet manages the agent in Magen3; the execution wallet signs in the external app. Live Wallet Validation checks the execution public key independently."],
                    ["Does Magen3 sign transactions?", "No. Magen3 checks and records decisions. Wallet signing still happens through the execution wallet."],
                    ["What does Casper Testnet do?", "Casper Testnet is the current proof and audit layer for Magen3 decisions. It records the gateway decision, not the target-chain transaction itself."],
                  ].map(([question, answer]) => (
                    <div key={question} className={`${CARD} p-4`}>
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">{question}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </article>

          <aside className="hidden w-56 shrink-0 px-5 py-8 xl:block">
            <div className="sticky top-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                On this page
              </p>
              <nav className="space-y-1">
                {docsOnThisPage.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToDocSection(item.id)}
                    className="block w-full py-1 text-left text-xs leading-snug text-[#94A3B8] transition-colors hover:text-[#22D3EE]"
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// Intent Playground
// ──────────────────────────────────────────────────────────

const PLAYGROUND_DEMO_EXECUTION_WALLET = `01${"1".repeat(64)}`;
const PLAYGROUND_DEMO_RECIPIENT = `01${"2".repeat(64)}`;
const PLAYGROUND_DEMO_UNAPPROVED_RECIPIENT = `02${"3".repeat(66)}`;
const PLAYGROUND_DEMO_CONTRACT = `contract-${"4".repeat(64)}`;
const PLAYGROUND_DEMO_UNAPPROVED_CONTRACT = `contract-package-${"5".repeat(64)}`;
const PLAYGROUND_THREAT_INTEL_TARGET = `01${"6".repeat(64)}`;
const PLAYGROUND_DEMO_EVM_RECIPIENT = `0x${"7".repeat(40)}`;
const PLAYGROUND_COMPLIANCE_MATCH_TARGET = `01${"8".repeat(64)}`;
const PLAYGROUND_X402_RECIPIENT = `0x${"1".repeat(40)}`;
const PLAYGROUND_X402_PAYER = `0x${"2".repeat(40)}`;
const PLAYGROUND_X402_PAYMENT_REQUIRED_HASH = "b".repeat(64);
const PLAYGROUND_TOKEN_SPENDER = `01${"9".repeat(64)}`;
const PLAYGROUND_BLOCKED_TOKEN_SPENDER = `01${"a".repeat(64)}`;

function firstStringRule(policy: Policy | undefined, key: string, fallback: string) {
  const value = policy?.structuredRules?.[key];
  return Array.isArray(value) && typeof value[0] === "string" && value[0].trim() ? value[0].trim() : fallback;
}

function playgroundTokenPermission(policy: Policy | undefined, walletAddress: string, overrides: Record<string, unknown> = {}) {
  const tokenContract = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
  return {
    permissionType: "Fungible Token Approval",
    owner: walletAddress || PLAYGROUND_DEMO_EXECUTION_WALLET,
    tokenContract,
    tokenStandard: "CEP-18",
    spender: firstStringRule(policy, "tokenPermissionApprovedSpenders", PLAYGROUND_TOKEN_SPENDER),
    approvalAmount: 10,
    intendedTransactionAmount: 10,
    unlimited: false,
    network: "casper-test",
    approvedProtocol: "playground-router",
    allowanceResetExpected: false,
    ...overrides,
  };
}

function playgroundX402Payment(policy: Policy | undefined, overrides: Record<string, unknown> = {}) {
  const merchantDomain = firstStringRule(policy, "x402AllowedMerchants", "api.example.com");
  const resourceUrl = `https://${merchantDomain}/agent-data`;
  return {
    version: 2,
    scheme: "exact",
    resourceUrl,
    method: "GET",
    merchantDomain,
    payTo: firstStringRule(policy, "x402AllowedRecipients", PLAYGROUND_X402_RECIPIENT),
    asset: firstStringRule(policy, "x402AllowedAssets", "USDC"),
    network: firstStringRule(policy, "x402AllowedNetworks", "eip155:84532"),
    facilitator: firstStringRule(policy, "x402AllowedFacilitators", "https://x402.org/facilitator"),
    amountAtomic: "1000000",
    maxTimeoutSeconds: 300,
    requirementsReceivedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    requestId: `playground-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    paymentRequiredHash: PLAYGROUND_X402_PAYMENT_REQUIRED_HASH,
    settlementStatus: "not_submitted",
    settlementAttempt: 0,
    ...overrides,
  };
}

function firstConfiguredContract(policy?: Policy) {
  return policy?.trustedContracts.find((target) => /^(?:hash-|contract-|contract-hash-|contract-package-|contract-package-hash-|package-)[0-9a-f]{64}$/i.test(target));
}

function firstConfiguredWallet(policy?: Policy) {
  return policy?.trustedContracts.find((target) => /^(?:01[0-9a-f]{64}|02[0-9a-f]{66}|account-hash-[0-9a-f]{64})$/i.test(target));
}

function firstConfiguredContractArgumentRule(policy?: Policy) {
  const rules = policy?.structuredRules?.contractArgumentRules;
  if (!Array.isArray(rules)) return null;
  const rule = rules.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
  return rule || null;
}

function playgroundArgsFromRule(rule: Record<string, unknown> | null, walletAddress: string) {
  if (!rule) return { recipient: walletAddress || PLAYGROUND_DEMO_RECIPIENT, amount: "10", mode: "safe" };
  const required = Array.isArray(rule.requiredArgs) ? rule.requiredArgs.map(String) : [];
  const types = rule.argumentTypes && typeof rule.argumentTypes === "object" && !Array.isArray(rule.argumentTypes) ? rule.argumentTypes as Record<string, unknown> : {};
  const numeric = rule.numericLimits && typeof rule.numericLimits === "object" && !Array.isArray(rule.numericLimits) ? rule.numericLimits as Record<string, unknown> : {};
  const addresses = rule.addressRules && typeof rule.addressRules === "object" && !Array.isArray(rule.addressRules) ? rule.addressRules as Record<string, unknown> : {};
  const booleans = rule.booleanRules && typeof rule.booleanRules === "object" && !Array.isArray(rule.booleanRules) ? rule.booleanRules as Record<string, unknown> : {};
  const enums = rule.enumRules && typeof rule.enumRules === "object" && !Array.isArray(rule.enumRules) ? rule.enumRules as Record<string, unknown> : {};
  const names = [...new Set([...required, ...Object.keys(types), ...Object.keys(numeric), ...Object.keys(addresses), ...Object.keys(booleans), ...Object.keys(enums)])];
  const args: Record<string, unknown> = {};
  names.forEach((name) => {
    const addressRule = addresses[name] && typeof addresses[name] === "object" && !Array.isArray(addresses[name]) ? addresses[name] as Record<string, unknown> : {};
    const allowedAddresses = Array.isArray(addressRule.allowed) ? addressRule.allowed : Array.isArray(addressRule.allowlist) ? addressRule.allowlist : [];
    const enumRule = enums[name];
    const enumValues = Array.isArray(enumRule) ? enumRule : enumRule && typeof enumRule === "object" && !Array.isArray(enumRule) && Array.isArray((enumRule as Record<string, unknown>).allowed) ? (enumRule as Record<string, unknown>).allowed as unknown[] : [];
    const booleanRule = booleans[name] && typeof booleans[name] === "object" && !Array.isArray(booleans[name]) ? booleans[name] as Record<string, unknown> : {};
    const booleanValues = Array.isArray(booleanRule.allowed) ? booleanRule.allowed.filter((value) => typeof value === "boolean") : [];
    const numericRule = numeric[name] && typeof numeric[name] === "object" && !Array.isArray(numeric[name]) ? numeric[name] as Record<string, unknown> : {};
    const type = String(types[name] || "").toLowerCase();
    if (allowedAddresses.length > 0) args[name] = String(allowedAddresses[0]);
    else if (["address", "account", "contract", "recipient"].includes(type)) args[name] = walletAddress || PLAYGROUND_DEMO_RECIPIENT;
    else if (enumValues.length > 0) args[name] = enumValues[0];
    else if (booleanValues.length > 0) args[name] = booleanValues[0];
    else if (["boolean", "bool"].includes(type)) args[name] = false;
    else if (["array", "list", "tuple"].includes(type)) args[name] = [];
    else if (["object", "map"].includes(type)) args[name] = {};
    else if (numericRule.min !== undefined) args[name] = String(numericRule.min);
    else if (["number", "decimal", "float", "integer", "int", "u8", "u32", "u64", "u128", "u256", "u512"].includes(type)) args[name] = "1";
    else args[name] = "sample";
  });
  return args;
}

function contractIdentifierTypeFor(target: string) {
  return /^(?:contract-package-|contract-package-hash-|package-)/i.test(target) ? "Package Hash" : "Contract Hash";
}

function playgroundPreflight(overrides: Record<string, unknown> = {}) {
  return {
    paymentAmountMotes: "5000000000",
    gasPriceTolerance: 1,
    ttl: "30m",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function playgroundLifecycle(overrides: Record<string, unknown> = {}) {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    intentId: `intent:${nonce}`,
    idempotencyKey: `idempotency:${nonce}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempt: 0,
    ...overrides,
  };
}


function playgroundPrivilegedAction(policy: Policy | undefined, classifiedAction: string, overrides: Record<string, unknown> = {}) {
  const contract = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
  const approvedAdministrator = firstStringRule(policy, "approvedAdministrators", PLAYGROUND_DEMO_RECIPIENT);
  const approvedImplementation = firstStringRule(policy, "approvedImplementations", `contract-hash-${"b".repeat(64)}`);
  return {
    classifiedAction,
    contract,
    entryPoint: classifiedAction.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    methodSignature: "",
    currentValue: "current",
    requestedValue: "requested",
    recipient: approvedAdministrator,
    implementation: approvedImplementation,
    classifierSource: "magen3-intent-playground",
    classifierVersion: "1.0.0",
    network: "casper-test",
    ...overrides,
  };
}

function playgroundComplianceEvidence(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    originatorJurisdiction: "NG", beneficiaryJurisdiction: "US", counterpartyType: "VASP",
    originatorAttestation: { status: "Verified", provider: "Verified Provider", reference: "ORIGINATOR-001", issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
    beneficiaryAttestation: { status: "Verified", provider: "Verified Provider", reference: "BENEFICIARY-001", issuedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 86_400_000).toISOString() },
    travelRule: { status: "Complete", reference: "TRAVEL-RULE-001", dataHash: "c".repeat(64) },
    screening: { status: "Clear", provider: "Verified Provider", reference: "SCREEN-001", screenedAt: new Date(now - 30_000).toISOString() },
    riskRating: "Low", originatorVaspId: "VASP-NG-001", beneficiaryVaspId: "VASP-US-002",
    ...overrides,
  };
}

function playgroundToolIntegrity(policy: Policy | undefined, overrides: Record<string, unknown> = {}) {
  const serverEntry = Array.isArray(policy?.structuredRules?.approvedMcpServers) ? policy?.structuredRules?.approvedMcpServers[0] : undefined;
  const toolEntry = Array.isArray(policy?.structuredRules?.approvedTools) ? policy?.structuredRules?.approvedTools[0] : undefined;
  const serverParts = typeof serverEntry === "string" ? serverEntry.split("|") : [];
  const toolParts = typeof toolEntry === "string" ? toolEntry.split("|") : [];
  const manifestHash = String((typeof toolEntry === "object" && toolEntry ? toolEntry.manifestHash : toolParts[3]) || (typeof serverEntry === "object" && serverEntry ? serverEntry.manifestHash : serverParts[2]) || "a".repeat(64));
  return {
    mcpServerId: String((typeof serverEntry === "object" && serverEntry ? (serverEntry.id || serverEntry.serverId) : serverParts[0]) || "mcp-main"),
    mcpServerUrl: String((typeof serverEntry === "object" && serverEntry ? (serverEntry.url || serverEntry.serverUrl) : serverParts[1]) || "https://mcp.example"),
    toolName: String((typeof toolEntry === "object" && toolEntry ? (toolEntry.name || toolEntry.toolName) : toolParts[1]) || "wallet.transfer"),
    toolVersion: String((typeof toolEntry === "object" && toolEntry ? (toolEntry.version || toolEntry.toolVersion) : toolParts[2]) || "1.0.0"),
    manifestHash,
    schemaHash: String((typeof toolEntry === "object" && toolEntry ? toolEntry.schemaHash : toolParts[4]) || "b".repeat(64)),
    descriptionHash: String((typeof toolEntry === "object" && toolEntry ? toolEntry.descriptionHash : toolParts[5]) || "c".repeat(64)),
    permissionScopes: typeof toolEntry === "object" && toolEntry && Array.isArray(toolEntry.permissionScopes) ? toolEntry.permissionScopes : String(toolParts[6] || "capability:Wallet Management").split(",").filter(Boolean),
    credentialScope: String((typeof toolEntry === "object" && toolEntry ? (Array.isArray(toolEntry.credentialScopes) ? toolEntry.credentialScopes[0] : toolEntry.credentialScope) : toolParts[7]) || "wallet-limited"),
    tls: true,
    toolOrigin: String((typeof toolEntry === "object" && toolEntry ? (toolEntry.origin || toolEntry.toolOrigin) : toolParts[8]) || "magen3-mcp"),
    approvedAt: new Date().toISOString(),
    ...overrides,
  };
}

function playgroundDelegation(walletAddress: string, policy: Policy | undefined, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const approvedDelegates = Array.isArray(policy?.structuredRules?.approvedDelegates)
    ? policy.structuredRules.approvedDelegates.map((item) => String(item)).filter(Boolean)
    : [];
  const revokedDelegationIds = Array.isArray(policy?.structuredRules?.revokedDelegationIds)
    ? policy.structuredRules.revokedDelegationIds.map((item) => String(item)).filter(Boolean)
    : [];
  return {
    delegationId: `delegation:playground-${Date.now()}`,
    delegatingWallet: walletAddress,
    delegate: approvedDelegates[0] || "playground-session-agent",
    allowedNetworks: ["casper-test"],
    allowedContracts: [],
    allowedMethods: ["Transfer"],
    allowedAssets: ["CSPR"],
    nativeAmountLimit: 10,
    maxTransactionAmount: 10,
    maxFrequency: 5,
    validFrom: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
    revocationStatus: "Active",
    delegationDepth: 0,
    redelegationAllowed: false,
    nonce: `delegation-nonce-${Date.now()}`,
    chainName: "casper-test",
    ...(revokedDelegationIds[0] ? { configuredRevokedDelegationId: revokedDelegationIds[0] } : {}),
    ...overrides,
  };
}

function playgroundRpcIntegrity(policy: Policy | undefined, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  const approvedEntries = Array.isArray(policy?.structuredRules?.approvedRpcEndpoints)
    ? policy.structuredRules.approvedRpcEndpoints
    : [];
  const first = approvedEntries[0];
  const parts = typeof first === "string" ? first.split("|").map((item) => item.trim()) : [];
  const entry = first && typeof first === "object" && !Array.isArray(first) ? first as Record<string, unknown> : undefined;
  const endpoint = String(entry?.endpoint || entry?.url || parts[0] || "https://node.testnet.casper.network/rpc");
  const providerId = String(entry?.id || entry?.providerId || parts[1] || "casper-testnet-primary");
  const chainName = String(entry?.chainName || parts[2] || "casper-test");
  const networkIdentifier = String(entry?.networkIdentifier || parts[3] || "casper-testnet");
  const genesisHash = String(entry?.genesisHash || parts[4] || "a".repeat(64)).replace(/^0x/, "");
  return {
    expectedChainName: chainName,
    expectedNetworkIdentifier: networkIdentifier,
    expectedGenesisHash: genesisHash,
    selectedEndpoint: endpoint,
    selectedProviderId: providerId,
    providerObservations: [{
      providerId, endpoint, chainName, networkIdentifier, genesisHash, tls: endpoint.startsWith("https://"), synced: true,
      latestBlockHeight: 125000, latestBlockTimestamp: new Date(now - 5_000).toISOString(), responseTimestamp: new Date(now).toISOString(),
      timedOut: false, rateLimited: false, speculative: false, transactionStatusHash: "b".repeat(64), contractStateHash: "c".repeat(64),
    }],
    automaticFailoverUsed: false,
    ...overrides,
  };
}

function playgroundFeeSafety(policy: Policy | undefined, overrides: Record<string, unknown> = {}) {
  const approvedSponsors = Array.isArray(policy?.structuredRules?.feeSafetyApprovedSponsors)
    ? policy.structuredRules.feeSafetyApprovedSponsors.map((item) => String(item)).filter(Boolean)
    : [];
  const now = Date.now();
  return {
    chainFamily: "Casper",
    chainName: "casper-test",
    networkFee: 1,
    feeUnit: "CSPR",
    sponsor: approvedSponsors[0] || "magen3-relayer",
    sponsorshipId: `sponsorship:playground-${now}`,
    sponsorshipExpiry: new Date(now + 15 * 60_000).toISOString(),
    sponsorshipScopes: ["Transfer"],
    sponsorSignatureHash: "e".repeat(64),
    expectedPayer: approvedSponsors[0] || "magen3-relayer",
    actualPayer: approvedSponsors[0] || "magen3-relayer",
    sponsored: true,
    sponsorshipAvailable: true,
    rollingSponsoredSpend: 1,
    rollingSponsoredOperations: 1,
    rollingFailedSponsoredOperations: 0,
    ...overrides,
  };
}

const PLAYGROUND_EXAMPLES: Record<string, (agent: Agent, walletAddress: string, policy?: Policy) => Record<string, unknown>> = {
  "Fee safety — bounded Casper sponsorship": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Authorize a bounded Casper relayer fee before execution",
    reason: "Demonstrate approved sponsor, payer, expiry, scope, evidence hash, and rolling budget checks.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", feeSafety: playgroundFeeSafety(policy), preflight: playgroundPreflight() },
  }),
  "Fee safety — excessive network fee": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Detect an excessive sponsored network fee",
    reason: "The submitted network fee intentionally exceeds the configured maximum.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", feeSafety: playgroundFeeSafety(policy, { networkFee: 999 }), preflight: playgroundPreflight() },
  }),
  "Fee safety — EVM Paymaster fields on Casper": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Block EVM-only Paymaster evidence from a Casper transaction",
    reason: "The request intentionally mixes a Paymaster and EVM gas fields into a Casper flow.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", feeSafety: playgroundFeeSafety(policy, { paymaster: "0x1111111111111111111111111111111111111111", gasPrice: 30, priorityFee: 2 }), preflight: playgroundPreflight() },
  }),
  "RPC integrity — approved provider": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Verify approved RPC network identity before execution",
    reason: "Demonstrate fresh synchronized TLS evidence from the policy-approved provider.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", rpcIntegrity: playgroundRpcIntegrity(policy), preflight: playgroundPreflight() },
  }),
  "RPC integrity — stale provider": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Detect stale RPC chain state",
    reason: "The selected provider intentionally reports an old latest-block timestamp.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", rpcIntegrity: playgroundRpcIntegrity(policy, { providerObservations: [{ providerId: "casper-testnet-primary", endpoint: "https://node.testnet.casper.network/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: "a".repeat(64), tls: true, synced: true, latestBlockHeight: 125000, latestBlockTimestamp: new Date(Date.now() - 15 * 60_000).toISOString(), responseTimestamp: new Date().toISOString(), timedOut: false, rateLimited: false, speculative: false }] }), preflight: playgroundPreflight() },
  }),
  "RPC integrity — network mismatch": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Block execution when the provider reports the wrong network",
    reason: "The provider intentionally reports a mainnet identity for a Casper Testnet request.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", rpcIntegrity: playgroundRpcIntegrity(policy, { providerObservations: [{ providerId: "casper-testnet-primary", endpoint: "https://node.testnet.casper.network/rpc", chainName: "casper", networkIdentifier: "casper-mainnet", genesisHash: "d".repeat(64), tls: true, synced: true, latestBlockHeight: 125000, latestBlockTimestamp: new Date(Date.now() - 5_000).toISOString(), responseTimestamp: new Date().toISOString(), timedOut: false, rateLimited: false, speculative: false }] }), preflight: playgroundPreflight() },
  }),
  "RPC integrity — provider unavailable": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Route unavailable RPC evidence according to policy",
    reason: "The selected approved provider intentionally reports a timeout.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", rpcIntegrity: playgroundRpcIntegrity(policy, { providerObservations: [{ providerId: "casper-testnet-primary", endpoint: "https://node.testnet.casper.network/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: "a".repeat(64), tls: true, synced: true, latestBlockHeight: 125000, latestBlockTimestamp: new Date(Date.now() - 5_000).toISOString(), responseTimestamp: new Date().toISOString(), timedOut: true, rateLimited: false, speculative: false }] }), preflight: playgroundPreflight() },
  }),
  "Instruction integrity — trusted goal": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT;
    return {
      source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
      goal: "Execute a goal-bound transfer from a trusted user instruction",
      reason: "Demonstrate stable goal binding, trusted provenance, and unchanged protected execution parameters.",
      action: {
        type: "Transfer", amount: 5, asset: "CSPR", target: approvedWallet, targetType: "Wallet Address",
        instructionIntegrity: {
          goalId: `goal:trusted-transfer-${Date.now()}`, originalUserGoalHash: "1".repeat(64), initiatedBy: "user", intentSource: "user",
          sourceDomains: [], externalContentUsed: false, userConfirmed: true, sourceTrustLevel: "trusted",
          originalPermissionScopes: ["wallet:transfer"], currentPermissionScopes: ["wallet:transfer"],
        },
        preflight: playgroundPreflight(),
      },
    };
  },
  "Instruction integrity — webpage changed destination": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Detect an external webpage changing the protected transfer destination",
    reason: "The original parameter hash intentionally differs and no independent user confirmation is supplied.",
    action: {
      type: "Transfer", amount: 5, asset: "CSPR", target: PLAYGROUND_DEMO_UNAPPROVED_RECIPIENT, targetType: "Wallet Address",
      instructionIntegrity: { goalId: "goal:web-destination-change", originalUserGoalHash: "2".repeat(64), initiatedBy: "external-content", intentSource: "webpage", sourceDomains: ["untrusted.example"], externalContentUsed: true, userConfirmed: false, sourceTrustLevel: "untrusted", originalParameterHash: "3".repeat(64), parameterChangeReason: "The webpage supplied a different destination." },
      preflight: playgroundPreflight(),
    },
  }),
  "Instruction integrity — tool expanded scope": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Prevent a tool result from expanding its own approved permission scope",
    reason: "The current tool scopes intentionally add treasury execution beyond the original wallet-read scope.",
    action: {
      type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address",
      instructionIntegrity: { goalId: "goal:tool-scope-expansion", originalUserGoalHash: "4".repeat(64), initiatedBy: "tool", intentSource: "tool-output", toolName: "treasury-helper", toolServer: "approved-mcp", sourceDomains: [], externalContentUsed: false, userConfirmed: false, sourceTrustLevel: "trusted", originalPermissionScopes: ["wallet:read"], currentPermissionScopes: ["wallet:read", "treasury:execute"] },
      preflight: playgroundPreflight(),
    },
  }),
  "Instruction integrity — missing goal binding": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Confirm sensitive execution without stable goal evidence requires review",
    reason: "Provenance is supplied, but goalId and originalUserGoalHash are intentionally omitted.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", instructionIntegrity: { initiatedBy: "user", intentSource: "user", sourceDomains: [], externalContentUsed: false, userConfirmed: true, sourceTrustLevel: "trusted" }, preflight: playgroundPreflight() },
  }),
  "Tool integrity — approved unchanged tool": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Execute through one approved unchanged MCP tool",
    reason: "Verify exact server/tool identity, hashes, TLS, origin, credential scope, and least-privilege permissions.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", toolIntegrity: playgroundToolIntegrity(policy), preflight: playgroundPreflight() },
  }),
  "Tool integrity — changed schema": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Block a material tool schema change",
    reason: "The supplied schema hash intentionally differs from the approved tool binding.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", toolIntegrity: playgroundToolIntegrity(policy, { schemaHash: "d".repeat(64) }), preflight: playgroundPreflight() },
  }),
  "Tool integrity — unknown tool": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Review an unapproved MCP tool",
    reason: "The tool name is intentionally outside the approved tool allowlist.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", toolIntegrity: playgroundToolIntegrity(policy, { toolName: "unknown.tool" }), preflight: playgroundPreflight() },
  }),
  "Tool integrity — permission expansion": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Block tool permission-scope expansion",
    reason: "The tool intentionally requests a scope beyond its approved least-privilege set.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", toolIntegrity: playgroundToolIntegrity(policy, { permissionScopes: ["wallet:read", "wallet:write"] }), preflight: playgroundPreflight() },
  }),
  "Delegation safety — missing Casper signature": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Review a bounded delegation that has not yet been signed by the delegating Casper wallet",
    reason: "The scope is intentionally bounded, but the cryptographic attestation signature is omitted. A real Allowed flow must be created and signed by a trusted wallet adapter outside this static example.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", delegation: playgroundDelegation(walletAddress, policy), preflight: playgroundPreflight() },
  }),
  "Delegation safety — revoked delegation": (agent, walletAddress, policy) => {
    const configuredRevoked = Array.isArray(policy?.structuredRules?.revokedDelegationIds) ? String(policy?.structuredRules?.revokedDelegationIds[0] || "") : "";
    return {
      source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
      goal: "Block execution through revoked delegated authority",
      reason: "The delegation is intentionally marked revoked; revocation is a hard block even when other evidence is incomplete.",
      action: { type: "Transfer", amount: 5, asset: "CSPR", target: firstConfiguredWallet(policy) || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", chainName: "casper-test", delegation: playgroundDelegation(walletAddress, policy, { delegationId: configuredRevoked || "delegation:revoked-playground", revocationStatus: "Revoked" }), preflight: playgroundPreflight() },
    };
  },
  "Delegation safety — method outside scope": (agent, walletAddress, policy) => ({
    source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
    goal: "Block a delegated request that exceeds its authorized method scope",
    reason: "The delegation authorizes only Transfer, while the request attempts a Contract Interaction.",
    action: { type: "Contract Interaction", amount: 1, asset: "CSPR", target: firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT, targetType: "Trusted Contract", contractIdentifierType: contractIdentifierTypeFor(firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT), entryPoint: "mint", chainName: "casper-test", delegation: playgroundDelegation(walletAddress, policy, { allowedMethods: ["Transfer"], allowedContracts: [firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT] }), preflight: playgroundPreflight({ runtimeArgs: { amount: "1" } }) },
  }),
  "Fresh lifecycle-bound transfer": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Authorize one uniquely identified transfer exactly once",
      reason: "Exercise intent ID, idempotency, freshness, expiry, fingerprint, and retry controls before wallet signing.",
      action: {
        type: "Transfer",
        amount: 5,
        asset: "CSPR",
        target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT,
        targetType: "Wallet Address",
        lifecycle: playgroundLifecycle(),
        preflight: playgroundPreflight(),
      },
    };
  },
  "Duplicate lifecycle intent — run twice": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    const createdAt = new Date().toISOString();
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Confirm the same business intent cannot be authorized twice",
      reason: "Submit this exact JSON once, then submit it again without reloading the example. The second request must be blocked as a replay.",
      action: {
        type: "Transfer",
        amount: 5,
        asset: "CSPR",
        target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT,
        targetType: "Wallet Address",
        lifecycle: { intentId: "intent:playground-duplicate-001", idempotencyKey: "idempotency:playground-duplicate-001", createdAt, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), attempt: 0 },
        preflight: playgroundPreflight(),
      },
    };
  },
  "Expired lifecycle intent": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Confirm an expired authorization cannot reach wallet signing",
      reason: "The lifecycle validity window intentionally ended before submission.",
      action: {
        type: "Transfer",
        amount: 5,
        asset: "CSPR",
        target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT,
        targetType: "Wallet Address",
        lifecycle: playgroundLifecycle({ intentId: `intent:expired-${Date.now()}`, idempotencyKey: `idempotency:expired-${Date.now()}`, createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), expiresAt: new Date(Date.now() - 10 * 60_000).toISOString() }),
        preflight: playgroundPreflight(),
      },
    };
  },
  Swap: (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Swap 10 CSPR through a structurally valid execution route",
      reason: approvedContract ? "Test the active policy and preflight bounds before requesting a wallet signature." : "Validate a structurally valid unapproved route; add the exact contract to Trusted Targets to receive Allowed.",
      action: {
        type: "Swap",
        amount: 10,
        asset: "CSPR",
        outputAsset: "USD",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        chainName: "casper-test",
        oracle: {
          baseAsset: "CSPR",
          quoteAsset: "USD",
          executionPrice: 0.025,
          quoteTimestamp: new Date().toISOString(),
        },
        preflight: playgroundPreflight({ slippageBps: 300, expectedOutput: 0.25, minimumReceived: 0.24 }),
      },
    };
  },
  Transfer: (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Transfer 5 CSPR to a structurally valid wallet",
      reason: approvedWallet ? "Validate wallet format, approved destination, spend controls, and execution preflight before signing." : "Validate a structurally valid unapproved wallet; add it to Trusted Targets to receive Allowed.",
      action: { type: "Transfer", amount: 5, asset: "CSPR", target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", preflight: playgroundPreflight() },
    };
  },
  "Unapproved wallet": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Test review behavior for a valid but unapproved wallet",
    reason: "Verify destination controls without using a malformed address.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: PLAYGROUND_DEMO_UNAPPROVED_RECIPIENT, targetType: "Wallet Address" },
  }),
  "Threat intelligence feed match": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Screen a synthetic testnet wallet against the configured Threat Intelligence feed",
    reason: "Load backend/data/threat-intelligence.example.json as the feed and add the exact target to Trusted Targets to isolate the reputation decision.",
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: PLAYGROUND_THREAT_INTEL_TARGET,
      targetType: "Wallet Address",
      preflight: playgroundPreflight(),
    },
  }),
  "Malformed wallet": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm malformed wallet destinations are blocked",
    reason: "Exercise deterministic wallet-address validation.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: "RECIPIENT_PUBLIC_KEY", targetType: "Wallet Address" },
  }),
  "Self transfer": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm exact self-transfer requests are blocked",
    reason: "Exercise source and destination comparison.",
    action: { type: "Transfer", amount: 5, asset: "CSPR", target: walletAddress, targetType: "Wallet Address" },
  }),
  Stake: (agent, walletAddress, policy) => {
    const approvedValidator = firstConfiguredWallet(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Stake 15 CSPR with a structurally valid validator public key",
      reason: approvedValidator ? "Validate the active policy and execution preflight before staking." : "Validate a structurally valid unapproved validator key; add it to Trusted Targets to receive Allowed.",
      action: { type: "Stake", amount: 15, asset: "CSPR", target: approvedValidator || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", preflight: playgroundPreflight() },
    };
  },
  "Contract call": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Call a structurally valid smart contract through Agent Shield",
      reason: approvedContract ? "Validate an approved contract and entry point before signing." : "Validate a contract call; add this contract to Trusted Targets to receive Allowed.",
      action: {
        type: "Contract Interaction",
        amount: 0,
        asset: "CSPR",
        target: approvedContract || PLAYGROUND_DEMO_CONTRACT,
        targetType: approvedContract ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(approvedContract || PLAYGROUND_DEMO_CONTRACT),
        entryPoint: "call",
        chainName: "casper-test",
        preflight: playgroundPreflight({ runtimeArgs: { amount: "0" } }),
      },
    };
  },
  "Contract arguments — matching rule": (agent, walletAddress, policy) => {
    const rule = firstConfiguredContractArgumentRule(policy);
    const target = String(rule?.contract || rule?.target || firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT);
    const entryPoint = String(rule?.entryPoint || rule?.entry_point || "transfer");
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Evaluate exact runtime arguments against the active contract and entry-point rule",
      reason: rule ? "This example is generated from the first configured Contract Argument Policy rule." : "Configure a contractArgumentRules entry in Policies, then reload this example for a rule-matched request.",
      action: {
        type: "Contract Interaction",
        amount: 0,
        asset: "CSPR",
        target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        entryPoint,
        chainName: "casper-test",
        preflight: playgroundPreflight({ runtimeArgs: playgroundArgsFromRule(rule, walletAddress) }),
      },
    };
  },
  "Unapproved contract": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Test policy behavior for a valid but unapproved contract package",
    reason: "Confirm that target labels do not grant trust without an exact policy match.",
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: PLAYGROUND_DEMO_UNAPPROVED_CONTRACT,
      targetType: "Unknown Contract",
      contractIdentifierType: "Package Hash",
      entryPoint: "call",
      chainName: "casper-test",
    },
  }),
  "Malformed contract": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm malformed contract identifiers are blocked",
    reason: "Exercise deterministic Casper contract-identifier validation.",
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: "CONTRACT_HASH",
      targetType: "Unknown Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint: "call",
      chainName: "casper-test",
    },
  }),
  "Missing entry point": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm direct contract calls require an entry point",
    reason: "Exercise contract-call metadata validation.",
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: PLAYGROUND_DEMO_CONTRACT,
      targetType: "Unknown Contract",
      contractIdentifierType: "Contract Hash",
      chainName: "casper-test",
    },
  }),
  "Wrong contract network": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm cross-network contract intents are blocked",
    reason: "Exercise chain-name consistency against the configured Magen3 deployment.",
    action: {
      type: "Contract Interaction",
      amount: 0,
      asset: "CSPR",
      target: PLAYGROUND_DEMO_CONTRACT,
      targetType: "Unknown Contract",
      contractIdentifierType: "Contract Hash",
      entryPoint: "call",
      chainName: "casper",
    },
  }),
  "Approved privileged mint": (agent, walletAddress, policy) => {
    const target = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Mint a bounded amount through an explicitly classified administrative call",
      reason: "Exercise supported classification, contract binding, recipient validation, amount validation, policy review, and exact Human Approval binding.",
      action: {
        type: "Contract Interaction",
        amount: 10,
        asset: "CSPR",
        target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        entryPoint: "mint",
        chainName: "casper-test",
        privilegedAction: playgroundPrivilegedAction(policy, "Mint", { entryPoint: "mint", recipient: walletAddress, requestedValue: { amount: 10 }, currentValue: { totalSupply: 1000 } }),
        preflight: playgroundPreflight({ runtimeArgs: { recipient: walletAddress, amount: "10" } }),
      },
    };
  },
  "Ownership transfer requiring review": (agent, walletAddress, policy) => {
    const target = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
    const newOwner = firstStringRule(policy, "approvedAdministrators", PLAYGROUND_DEMO_RECIPIENT);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Transfer contract ownership only through configured Human Approval",
      reason: "Ownership Transfer should resolve against the privileged review matrix and any action-specific quorum without changing the generic contract flow.",
      action: {
        type: "Contract Interaction", amount: 0, asset: "CSPR", target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target), entryPoint: "transfer_ownership", chainName: "casper-test",
        privilegedAction: playgroundPrivilegedAction(policy, "Ownership Transfer", { entryPoint: "transfer_ownership", currentValue: walletAddress, requestedValue: newOwner, recipient: newOwner, implementation: "" }),
        preflight: playgroundPreflight({ runtimeArgs: { new_owner: newOwner } }),
      },
    };
  },
  "Unapproved proxy implementation": (agent, walletAddress, policy) => {
    const target = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
    const implementation = `contract-hash-${"c".repeat(64)}`;
    return {
      source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
      goal: "Reject or review a proxy upgrade to an implementation outside policy",
      reason: "The requested implementation is intentionally not selected from approvedImplementations.",
      action: {
        type: "Contract Interaction", amount: 0, asset: "CSPR", target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target), entryPoint: "upgrade_to", chainName: "casper-test",
        privilegedAction: playgroundPrivilegedAction(policy, "Proxy Upgrade", { entryPoint: "upgrade_to", currentValue: `contract-hash-${"a".repeat(64)}`, requestedValue: implementation, implementation, recipient: walletAddress }),
        contractUpgrade: {
          contract: target,
          currentImplementation: `contract-hash-${"a".repeat(64)}`,
          requestedImplementation: implementation,
          requestedCodeHash: "d".repeat(64),
          upgradeAdministrator: walletAddress,
          requestedAt: new Date().toISOString(),
          network: "casper-test",
        },
        preflight: playgroundPreflight({ runtimeArgs: { implementation } }),
      },
    };
  },
  "Unknown privileged method": (agent, walletAddress, policy) => {
    const target = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
    return {
      source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
      goal: "Apply configured unknown-action behavior to an explicit administrative call",
      reason: "The declared action is intentionally outside Magen3's supported deterministic classification set.",
      action: {
        type: "Contract Interaction", amount: 0, asset: "CSPR", target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target), entryPoint: "admin_sweep", chainName: "casper-test",
        privilegedAction: playgroundPrivilegedAction(policy, "Custom Admin Sweep", { entryPoint: "admin_sweep", recipient: walletAddress, implementation: "" }),
        preflight: playgroundPreflight({ runtimeArgs: { recipient: walletAddress } }),
      },
    };
  },
  "Contradictory privileged classification": (agent, walletAddress, policy) => {
    const target = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
    return {
      source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress,
      goal: "Block an adapter that labels a pause call as minting",
      reason: "Declared action and deterministic entry-point classification intentionally contradict each other.",
      action: {
        type: "Contract Interaction", amount: 0, asset: "CSPR", target,
        targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target), entryPoint: "pause", chainName: "casper-test",
        privilegedAction: playgroundPrivilegedAction(policy, "Mint", { entryPoint: "pause", recipient: walletAddress, requestedValue: { paused: true }, implementation: "" }),
        preflight: playgroundPreflight(),
      },
    };
  },
  "Bounded token approval": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress);
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Grant one bounded token allowance to an approved spender", reason: "Evaluate token identity, spender policy, amount, and approval-to-transaction ratio before signing.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "approve", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Unlimited token approval": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { approvalAmount: undefined, unlimited: true });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Confirm unlimited token authority cannot silently pass", reason: "The authority is intentionally unlimited and follows the active Warn, Review, or Block policy action.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "approve", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Unknown token spender": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { spender: PLAYGROUND_BLOCKED_TOKEN_SPENDER });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Confirm an unapproved spender requires review or is blocked", reason: "The exact spender is intentionally outside the active approved-spender list.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "approve", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Expired token permit": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { permissionType: "Permit Authorization", nonce: "expired-permit-nonce", permitId: "expired-permit", deadline: new Date(Date.now() - 60_000).toISOString() });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Confirm an expired permit is blocked", reason: "The permit deadline is intentionally in the past.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "permit", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Permit replay (submit twice)": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { permissionType: "Permit Authorization", nonce: "playground-replay-nonce", permitId: "playground-replay-permit", deadline: new Date(Date.now() + 30 * 60_000).toISOString() });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Demonstrate persisted permit replay prevention", reason: "Submit this exact payload twice. The first evaluation may pass; the second is blocked by the stored permit fingerprint.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "permit", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "NFT operator approval": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { permissionType: "NFT Operator Approval", approvalAmount: undefined, intendedTransactionAmount: undefined, operatorForAll: true });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Evaluate reusable NFT operator-for-all authority", reason: "The operator-for-all flag follows the active Token Permission policy.", action: { type: "Contract Interaction", amount: 0, asset: "NFT", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "set_approval_for_all", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Batch token approval": (agent, walletAddress, policy) => {
    const permission = playgroundTokenPermission(policy, walletAddress, { permissionType: "Batch Approval", batchItems: [{ tokenContract: firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT, spender: firstStringRule(policy, "tokenPermissionApprovedSpenders", PLAYGROUND_TOKEN_SPENDER), amount: 5 }, { tokenContract: firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT, spender: firstStringRule(policy, "tokenPermissionApprovedSpenders", PLAYGROUND_TOKEN_SPENDER), amount: 5 }] });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Evaluate bounded batch token authority", reason: "Batch enablement and maximum size are enforced by the active policy.", action: { type: "Contract Interaction", amount: 10, asset: "TEST", target: permission.tokenContract, targetType: firstConfiguredContract(policy) ? "Trusted Contract" : "Unknown Contract", contractIdentifierType: contractIdentifierTypeFor(String(permission.tokenContract)), entryPoint: "batch_approve", chainName: "casper-test", tokenPermission: permission, preflight: playgroundPreflight() } };
  },
  "Oracle price within bounds": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Validate a priced Swap against a fresh multi-source oracle feed",
      reason: "Configure backend/data/oracle-validation.example.json, refresh its timestamps, and use a trusted contract to isolate Oracle Validation.",
      action: {
        type: "Swap",
        amount: 10,
        asset: "CSPR",
        outputAsset: "USD",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        entryPoint: "swap",
        chainName: "casper-test",
        oracle: { baseAsset: "CSPR", quoteAsset: "USD", executionPrice: 0.025, quoteTimestamp: new Date().toISOString() },
        preflight: playgroundPreflight({ slippageBps: 300, expectedOutput: 0.25, minimumReceived: 0.24 }),
      },
    };
  },
  "Oracle price deviation": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Confirm excessive execution-price deviation is reviewed or blocked",
      reason: "The proposed 0.04 USD/CSPR price is intentionally far from the included synthetic 0.025 USD/CSPR reference.",
      action: {
        type: "Swap",
        amount: 10,
        asset: "CSPR",
        outputAsset: "USD",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        entryPoint: "swap",
        chainName: "casper-test",
        oracle: { baseAsset: "CSPR", quoteAsset: "USD", executionPrice: 0.04, quoteTimestamp: new Date().toISOString() },
        preflight: playgroundPreflight({ slippageBps: 300, expectedOutput: 0.4, minimumReceived: 0.38 }),
      },
    };
  },
  "Stale oracle quote": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Confirm stale execution quotes cannot silently pass Oracle Validation",
      reason: "The oracle quote timestamp is intentionally older than the default policy freshness window.",
      action: {
        type: "Swap",
        amount: 10,
        asset: "CSPR",
        outputAsset: "USD",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Unknown Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        entryPoint: "swap",
        chainName: "casper-test",
        oracle: { baseAsset: "CSPR", quoteAsset: "USD", executionPrice: 0.025, quoteTimestamp: new Date(Date.now() - 10 * 60_000).toISOString() },
        preflight: playgroundPreflight({ slippageBps: 300, expectedOutput: 0.25, minimumReceived: 0.24 }),
      },
    };
  },
  "Bridge route within policy": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Bridge CSPR through a policy-approved provider and destination route",
      reason: "Configure the Bridge Controls policy allowlists and add the exact bridge contract to Trusted Targets to isolate route validation.",
      action: {
        type: "Bridge",
        amount: 10,
        asset: "CSPR",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Bridge Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        chainName: "casper-test",
        preflight: playgroundPreflight(),
        bridge: {
          sourceChain: "casper-test",
          destinationChain: "ethereum-sepolia",
          provider: "Test Bridge",
          routeId: "route-001",
          destinationAddress: PLAYGROUND_DEMO_EVM_RECIPIENT,
          asset: "CSPR",
          feeBps: 50,
          expectedOutput: 9.95,
          minimumReceived: 9.8,
          quoteTimestamp: new Date().toISOString(),
          quoteExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          sourceConfirmations: 2,
          destinationConfirmations: 12,
        },
      },
    };
  },
  "Unapproved bridge destination": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Verify an unapproved bridge destination chain is reviewed or blocked",
      reason: "The route intentionally targets base-sepolia while the starter example expects ethereum-sepolia.",
      action: {
        type: "Bridge",
        amount: 10,
        asset: "CSPR",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Bridge Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        chainName: "casper-test",
        bridge: {
          sourceChain: "casper-test",
          destinationChain: "base-sepolia",
          provider: "Test Bridge",
          routeId: "route-unapproved-chain",
          destinationAddress: PLAYGROUND_DEMO_EVM_RECIPIENT,
          asset: "CSPR",
          feeBps: 50,
          expectedOutput: 9.95,
          minimumReceived: 9.8,
          quoteTimestamp: new Date().toISOString(),
          quoteExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          sourceConfirmations: 2,
          destinationConfirmations: 12,
        },
      },
    };
  },
  "Expired bridge quote": (agent, walletAddress, policy) => {
    const approvedContract = firstConfiguredContract(policy);
    const target = approvedContract || PLAYGROUND_DEMO_UNAPPROVED_CONTRACT;
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: walletAddress,
      goal: "Confirm expired bridge routes cannot continue to wallet signing",
      reason: "The provider route expiry is intentionally in the past.",
      action: {
        type: "Bridge",
        amount: 10,
        asset: "CSPR",
        target,
        targetType: approvedContract ? "Trusted Contract" : "Bridge Contract",
        contractIdentifierType: contractIdentifierTypeFor(target),
        chainName: "casper-test",
        bridge: {
          sourceChain: "casper-test",
          destinationChain: "ethereum-sepolia",
          provider: "Test Bridge",
          routeId: "route-expired",
          destinationAddress: PLAYGROUND_DEMO_EVM_RECIPIENT,
          asset: "CSPR",
          feeBps: 50,
          expectedOutput: 9.95,
          minimumReceived: 9.8,
          quoteTimestamp: new Date(Date.now() - 60_000).toISOString(),
          quoteExpiresAt: new Date(Date.now() - 1_000).toISOString(),
          sourceConfirmations: 2,
          destinationConfirmations: 12,
        },
      },
    };
  },
  "Compliance evidence complete": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Evaluate complete non-sensitive compliance evidence before a controlled transfer", reason: "Use opaque verification references and status evidence without sending names, documents, or personal identity data.", action: { type: "Transfer", amount: 5, asset: "CSPR", target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", preflight: playgroundPreflight(), compliance: playgroundComplianceEvidence() } };
  },
  "Incomplete Travel Rule evidence": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy);
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Confirm incomplete Travel Rule evidence is reviewed or blocked by policy", reason: "The example intentionally omits the opaque evidence reference and hash.", action: { type: "Transfer", amount: 5, asset: "CSPR", target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", preflight: playgroundPreflight(), compliance: playgroundComplianceEvidence({ travelRule: { status: "Incomplete", reference: "", dataHash: "" } }) } };
  },
  "Rejected beneficiary attestation": (agent, walletAddress, policy) => {
    const approvedWallet = firstConfiguredWallet(policy); const evidence = playgroundComplianceEvidence();
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Confirm a rejected required attestation stops execution", reason: "Rejected verification is a deterministic hard block before wallet signing.", action: { type: "Transfer", amount: 5, asset: "CSPR", target: approvedWallet || PLAYGROUND_DEMO_RECIPIENT, targetType: "Wallet Address", preflight: playgroundPreflight(), compliance: { ...evidence, beneficiaryAttestation: { ...(evidence.beneficiaryAttestation as Record<string, unknown>), status: "Rejected" } } } };
  },
  "Configured compliance feed match": (agent, walletAddress) => ({ source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: walletAddress, goal: "Screen a synthetic wallet against the included Compliance Controls feed", reason: "Configure backend/data/compliance-controls.example.json and trust the exact test target only when isolating the compliance decision.", action: { type: "Transfer", amount: 5, asset: "CSPR", target: PLAYGROUND_COMPLIANCE_MATCH_TARGET, targetType: "Wallet Address", preflight: playgroundPreflight(), compliance: playgroundComplianceEvidence() } }),
  "Approved x402 API payment": (agent, walletAddress, policy) => {
    const payment = playgroundX402Payment(policy);
    return {
      source: "Magen3 Intent Playground",
      agentId: agent.id,
      walletAddress,
      executionWalletAddress: PLAYGROUND_X402_PAYER,
      goal: "Authorize an exact x402 payment for one approved API resource",
      reason: "Bind the merchant, resource, recipient, network, token, amount, expiry, payment requirements, and unique request before any payment signature is created.",
      action: { type: "x402 Payment", amount: 1, asset: payment.asset, target: payment.resourceUrl, targetType: "x402 Merchant", x402: payment },
    };
  },
  "New x402 merchant": (agent, walletAddress, policy) => {
    const payment = playgroundX402Payment(policy, { resourceUrl: "https://new-merchant.example/data", merchantDomain: "new-merchant.example" });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: PLAYGROUND_X402_PAYER, goal: "Confirm a new merchant cannot silently receive payment", reason: "The merchant is intentionally outside the configured allowlist.", action: { type: "x402 Payment", amount: 1, asset: payment.asset, target: payment.resourceUrl, targetType: "x402 Merchant", x402: payment } };
  },
  "x402 payment above limit": (agent, walletAddress, policy) => {
    const configured = Number(policy?.structuredRules?.x402MaxPayment || 5);
    const amount = Math.max(6, configured + 1);
    const payment = playgroundX402Payment(policy, { amountAtomic: String(Math.round(amount * 1_000_000)) });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: PLAYGROUND_X402_PAYER, goal: "Confirm excessive x402 payments are reviewed or blocked", reason: "The requested amount intentionally exceeds the active x402 per-payment limit.", action: { type: "x402 Payment", amount, asset: payment.asset, target: payment.resourceUrl, targetType: "x402 Merchant", x402: payment } };
  },
  "Expired x402 requirement": (agent, walletAddress, policy) => {
    const payment = playgroundX402Payment(policy, { validUntil: new Date(Date.now() - 60_000).toISOString() });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: PLAYGROUND_X402_PAYER, goal: "Confirm expired payment requirements are blocked", reason: "The authorization expiry is intentionally in the past.", action: { type: "x402 Payment", amount: 1, asset: payment.asset, target: payment.resourceUrl, targetType: "x402 Merchant", x402: payment } };
  },
  "Ambiguous x402 settlement retry": (agent, walletAddress, policy) => {
    const payment = playgroundX402Payment(policy, { settlementStatus: "uncertain", settlementAttempt: 1 });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress, executionWalletAddress: PLAYGROUND_X402_PAYER, goal: "Prevent a duplicate payment after an uncertain settlement", reason: "Magen3 must reconcile the existing attempt rather than authorize another signature.", action: { type: "x402 Payment", amount: 1, asset: payment.asset, target: payment.resourceUrl, targetType: "x402 Merchant", x402: payment } };
  },
  "Expired preflight": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm expired transaction metadata is blocked before signing",
    reason: "Exercise deterministic timestamp and TTL freshness checks.",
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: PLAYGROUND_DEMO_RECIPIENT,
      targetType: "Wallet Address",
      preflight: playgroundPreflight({ timestamp: "2020-01-01T00:00:00.000Z", ttl: "30m" }),
    },
  }),
  "Invalid payment budget": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm malformed payment metadata is blocked",
    reason: "Exercise positive-integer mote validation.",
    action: {
      type: "Transfer",
      amount: 5,
      asset: "CSPR",
      target: PLAYGROUND_DEMO_RECIPIENT,
      targetType: "Wallet Address",
      preflight: playgroundPreflight({ paymentAmountMotes: "-1" }),
    },
  }),
  "Invalid swap bounds": (agent, walletAddress) => ({
    source: "Magen3 Intent Playground",
    agentId: agent.id,
    walletAddress,
    executionWalletAddress: walletAddress,
    goal: "Confirm internally inconsistent swap metadata is blocked",
    reason: "Exercise slippage and minimum-received structure checks.",
    action: {
      type: "Swap",
      amount: 10,
      asset: "CSPR",
      target: "DEX_ROUTER_OR_CONTRACT",
      targetType: "Trusted Contract",
      preflight: playgroundPreflight({ slippageBps: 10001, expectedOutput: 9.8, minimumReceived: 10 }),
    },
  }),
};

function IntentPlaygroundPage({
  agents,
  policies,
  auditLogs,
  walletAddress,
  apiOnline,
  onSubmitGatewayIntent,
  onNavigate,
  developerMode,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  walletAddress: string;
  apiOnline: boolean;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
  onNavigate: (page: Page) => void;
  developerMode: boolean;
}) {
  const activeAgents = agents.filter((agent) => agent.status === "Active");
  const [agentId, setAgentId] = useState(activeAgents[0]?.id || "");
  const [apiKey, setApiKey] = useState(activeAgents[0]?.apiKey || "");
  const [example, setExample] = useState("Transfer");
  const [requestJson, setRequestJson] = useState("");
  const [result, setResult] = useState<AgentGatewayResponse | null>(null);
  const [settling, setSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedAgent = activeAgents.find((agent) => agent.id === agentId) || activeAgents[0];
  const selectedPolicy = selectedAgent ? getActivePolicy(policies, selectedAgent.id) : undefined;

  const loadExample = useCallback((name: string, agent = selectedAgent) => {
    if (!agent) return;
    const payload = PLAYGROUND_EXAMPLES[name](agent, walletAddress || PLAYGROUND_DEMO_EXECUTION_WALLET, selectedPolicy);
    setExample(name);
    setRequestJson(JSON.stringify(payload, null, 2));
    setResult(null);
    setSettlementResult(null);
    setError("");
  }, [selectedAgent, selectedPolicy, walletAddress]);

  useEffect(() => {
    if (!selectedAgent) return;
    setAgentId(selectedAgent.id);
    if (selectedAgent.apiKey) setApiKey(selectedAgent.apiKey);
    loadExample(example, selectedAgent);
  // The selected agent is the source of truth for the generated payload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id]);

  const submit = useCallback(async () => {
    setError("");
    setResult(null);
    if (!selectedAgent) {
      setError("Register an active agent before testing an intent.");
      return;
    }
    if (!apiOnline) {
      setError("The Magen3 Gateway is unavailable. Restore the deployed backend before testing an authenticated intent.");
      return;
    }
    if (!apiKey.trim()) {
      setError("Enter the raw API key. Magen3 never recovers stored keys; rotate the key if it is no longer available.");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(requestJson) as Record<string, unknown>;
    } catch {
      setError("The request body is not valid JSON.");
      return;
    }
    if (parsed.agentId !== selectedAgent.id) {
      setError("The request agentId must match the selected registered agent.");
      return;
    }
    if (!parsed.action || typeof parsed.action !== "object") {
      setError("The request must include an action object supported by the gateway.");
      return;
    }
    setSubmitting(true);
    try {
      setResult(await onSubmitGatewayIntent(parsed, apiKey.trim()));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit the intent.");
    } finally {
      setSubmitting(false);
    }
  }, [apiKey, apiOnline, onSubmitGatewayIntent, requestJson, selectedAgent]);

  const reportTestSettlement = useCallback(async () => {
    const context = result?.result.x402PaymentControlsContext;
    if (!result || !selectedAgent || !context?.requestFingerprint || !apiKey.trim()) return;
    setSettling(true);
    setError("");
    try {
      const response = await api.updateX402Settlement({
        auditLogId: result.auditLog.id,
        agentId: selectedAgent.id,
        status: "confirmed",
        transactionHash: `0x${"d".repeat(64)}`,
        attempt: 1,
        requestFingerprint: context.requestFingerprint,
        facilitatorReference: "intent-playground-test-settlement",
        resourceDelivered: true,
        note: "Synthetic Playground reconciliation record; replace with the real facilitator response in production.",
      }, apiKey.trim());
      setSettlementResult(response as Record<string, unknown>);
    } catch (settlementError) {
      setError(settlementError instanceof Error ? settlementError.message : "Unable to report the x402 settlement.");
    } finally {
      setSettling(false);
    }
  }, [apiKey, result, selectedAgent]);

  if (activeAgents.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Intent Playground" description="Test the real Magen3 Gateway request format before integrating an external agent." />
        <EmptyState title="Run your first protected decision" description="Guided Setup creates a real Agent ID, starter policy, one-time credential, and a safe sample intent. The test evaluates the Gateway without signing or submitting a blockchain transaction." action={<div className="flex flex-wrap justify-center gap-2"><Btn variant="primary" onClick={() => requestAgentOnboarding(onNavigate, "guided")}><ShieldCheck size={16} /> Start Guided Setup</Btn><Btn variant="secondary" onClick={() => requestAgentOnboarding(onNavigate, "advanced")}>Advanced Setup</Btn></div>} />
      </div>
    );
  }

  const readiness = [
    { label: "Agent", status: selectedAgent ? "Active" : "Missing", tone: selectedAgent ? "success" as const : "danger" as const },
    { label: "Credential", status: apiKey.trim() ? "Entered" : "Required", tone: apiKey.trim() ? "success" as const : "warning" as const },
    { label: "Policy", status: selectedPolicy ? "Active" : "Missing", tone: selectedPolicy ? "success" as const : "danger" as const },
    { label: "Gateway", status: apiOnline ? "Online" : "Unavailable", tone: apiOnline ? "success" as const : "danger" as const },
  ];

  const allFindings = result?.result.moduleFindings || result?.auditLog.moduleFindings || [];
  const findingPriority: Record<string, number> = { fail: 0, unavailable: 1, warning: 2, pass: 3, skipped: 4 };
  const topFindings = [...allFindings].sort((left, right) => (findingPriority[left.status] ?? 9) - (findingPriority[right.status] ?? 9)).slice(0, 3);
  const nextAction = !result
    ? "Evaluate an intent"
    : result.approval
      ? "Open Approval Queue and collect the required reviewer quorum."
      : result.result.decision === "Allowed"
        ? "Confirm the exact parameters, then request wallet signing."
        : result.result.decision === "Review Required"
          ? "Resolve the review condition before signing or execution."
          : "Correct the triggered rule and submit a new intent with a new idempotency key.";

  const contextEntries = result ? [
    ["Execution Integrity", result.result.executionIntegrityContext],
    ["RPC & Chain Integrity", result.result.rpcChainIntegrityContext],
    ["Gas Sponsorship & Fee Safety", result.result.gasSponsorshipFeeSafetyContext],
    ["Oracle Validation", result.result.oracleValidationContext],
    ["x402 Payment Controls", result.result.x402PaymentControlsContext],
    ["Bridge Controls", result.result.bridgeControlsContext],
    ["Compliance Controls", result.result.complianceControlsContext],
  ].filter((entry) => Boolean(entry[1])) as Array<[string, unknown]> : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intent Playground"
        description="Submit an authenticated intent, understand the deterministic decision, and inspect technical evidence only when needed."
        meta={<span className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-semibold text-[#22D3EE]"><Code2 size={13} /> Real Gateway Contract</span>}
        actions={<Btn variant="secondary" onClick={() => onNavigate("audit-log")}><Scroll size={16} /> Open Audit Logs</Btn>}
      />

      <div className={`${CARD} p-4`}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{readiness.map((item) => <div key={item.label}><CompactStatusRow label={item.label} status={item.status} tone={item.tone} /></div>)}</div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className={`${CARD_GLOW} space-y-4 p-5`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={LABEL_CLS}>Registered Agent</label><select className={`${INPUT_CLS} cursor-pointer`} value={selectedAgent?.id || ""} onChange={(event) => { const value = event.target.value; const next = activeAgents.find((agent) => agent.id === value); setAgentId(value); setApiKey(next?.apiKey || ""); if (next) loadExample(example, next); }}>{activeAgents.map((agent) => <option key={agent.id} value={agent.id} className="bg-[#0B1220]">{agent.name}</option>)}</select></div>
            <SelectField label="Example" value={example} onChange={(value) => loadExample(value)} options={Object.keys(PLAYGROUND_EXAMPLES)} />
          </div>
          <div><label className={LABEL_CLS}>Agent API Key</label><input className={INPUT_CLS} type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the one-time raw key or rotate the agent key" /><p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">Held only in this page state and sent in the existing <span className="font-mono text-[#94A3B8]">x-magen3-agent-key</span> header.</p></div>
          <div><div className="mb-2 flex items-center justify-between gap-3"><label className={LABEL_CLS}>Gateway Request JSON</label><button type="button" onClick={() => loadExample(example)} className="text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]">Reset example</button></div><textarea className={`${INPUT_CLS} min-h-[390px] resize-y font-mono text-xs leading-relaxed`} value={requestJson} onChange={(event) => setRequestJson(event.target.value)} spellCheck={false} /></div>
          {error && <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{error}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-[#94A3B8]">Policy: <span className="text-[#F8FAFC]">{selectedPolicy?.name || "No active policy"}</span></div><Btn variant="primary" onClick={submit} disabled={submitting || !apiOnline}><Send size={16} /> {submitting ? "Evaluating…" : "Evaluate Intent"}</Btn></div>
        </div>

        <div className="space-y-5">
          {!result ? (
            <div className={`${CARD} p-8`}><EmptyState title="No request submitted" description="Choose an example, edit the request, and evaluate it against the selected agent’s real active policy." /></div>
          ) : (
            <>
              <div className={`${CARD_GLOW} p-5`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><DecisionBadge decision={result.result.decision} /><RiskBadge risk={result.result.risk} /></div><h2 className="mt-3 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{result.agentMessage || result.decisionExplanation?.userMessage || result.result.decisionExplanation?.userMessage || result.result.primaryReason || result.result.reason}</h2><p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{result.result.suggestedResolution || result.result.recommendedAction}</p></div>
                  <div className="rounded-xl border border-[#1E293B] bg-[#050B14] px-3 py-2 text-right text-xs text-[#94A3B8]">Risk score<div className="mt-1 text-2xl font-bold text-[#F8FAFC]">{result.result.riskScore}</div></div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">Triggered rule</div><div className="mt-1 text-sm text-[#F8FAFC]">{result.result.triggeredRule || "No blocking rule"}</div></div><div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">Next action</div><div className="mt-1 text-sm leading-relaxed text-[#F8FAFC]">{nextAction}</div></div></div>
                {developerMode && (result.decisionExplanation || result.result.decisionExplanation)?.code && <div className="mt-3 rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-[#22D3EE]">Developer diagnostic</div><div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-2"><div>Code: <span className="font-mono text-[#F8FAFC]">{(result.decisionExplanation || result.result.decisionExplanation)?.code}</span></div><div>Field: <span className="font-mono text-[#F8FAFC]">{(result.decisionExplanation || result.result.decisionExplanation)?.field || "—"}</span></div><div>Expected: <span className="font-mono text-[#F8FAFC]">{diagnosticValue((result.decisionExplanation || result.result.decisionExplanation)?.expected)}</span></div><div>Received: <span className="font-mono text-[#F8FAFC]">{diagnosticValue((result.decisionExplanation || result.result.decisionExplanation)?.received)}</span></div></div>{((result.decisionExplanation || result.result.decisionExplanation)?.mismatchFields || []).length > 0 && <div className="mt-2 text-xs text-[#94A3B8]">Changed fields: <span className="font-mono text-[#F8FAFC]">{(result.decisionExplanation || result.result.decisionExplanation)?.mismatchFields?.join(", ")}</span></div>}</div>}
                <div className="mt-4 flex flex-wrap gap-2">{result.approval && <Btn variant="secondary" size="sm" onClick={() => { try { window.sessionStorage.setItem("magen3:policies-tab", "approvals"); window.sessionStorage.setItem("magen3:approval-request-id", result.approval?.id || ""); } catch {} onNavigate("policies"); }}><Clock size={14} /> Open Approval Queue</Btn>}<Btn variant="ghost" size="sm" onClick={() => { try { window.sessionStorage.setItem("magen3:audit-record-id", result.auditLog.id); } catch {} onNavigate("audit-log"); }}><Scroll size={14} /> Open audit record</Btn></div>
              </div>

              <div className={`${CARD} p-5`}>
                <div className="flex items-center justify-between gap-3"><div><h2 className={SECTION_TITLE}>Key Findings</h2><p className="mt-1 text-xs text-[#94A3B8]">The highest-priority control findings from this evaluation.</p></div><span className="rounded-full border border-[#1E293B] bg-[#050B14] px-2.5 py-1 text-xs text-[#94A3B8]">{allFindings.length} total</span></div>
                <div className="mt-4">{topFindings.length > 0 ? <FindingsPanel findings={topFindings} developerMode={developerMode} /> : <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-4 text-sm text-[#94A3B8]">No structured findings are available.</div>}</div>
              </div>

              {result.result.x402PaymentControlsContext && result.result.decision === "Allowed" && (
                <div className={`${CARD} p-4`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-[#F8FAFC]">x402 test settlement</div><div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Record a clearly labelled synthetic settlement for this Playground request. Production adapters must report the real facilitator result.</div></div><Btn variant="secondary" size="sm" onClick={reportTestSettlement} disabled={settling || Boolean(settlementResult)}>{settling ? "Reporting…" : settlementResult ? "Settlement recorded" : "Report test settlement"}</Btn></div>{settlementResult && <div className="mt-3 rounded-lg border border-[#22C55E]/25 bg-[#22C55E]/5 p-2 text-xs text-[#BBF7D0]">Settlement reconciliation stored. Open Audit Logs to inspect the timeline.</div>}</div>
              )}

              <details className={`${CARD} p-5`} open={developerMode}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Full Security Pipeline{developerMode ? " · Developer Mode" : ""}</summary><div className="mt-4"><PipelineTimeline stages={result.result.pipelineStages || result.auditLog.pipelineStages} developerMode={developerMode} /></div></details>
              <details className={`${CARD} p-5`} open={developerMode}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">All structured findings{developerMode ? " · Developer Mode" : ""}</summary><div className="mt-4"><FindingsPanel findings={allFindings} developerMode={developerMode} /></div></details>
              {contextEntries.length > 0 && <details className={`${CARD} p-5`} open={developerMode}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Control-specific context{developerMode ? " · Developer Mode" : ""}</summary><div className="mt-4 space-y-3">{contextEntries.map(([label, value]) => <details key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#F8FAFC]">{label}</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[#94A3B8]">{JSON.stringify(value, null, 2)}</pre></details>)}</div></details>}
              <details className={`${CARD} p-5`} open={developerMode}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Original request{developerMode ? " · Developer Mode" : ""}</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#020617] p-4 text-xs text-[#94A3B8]">{JSON.stringify(result.auditLog.originalIntent || {}, null, 2)}</pre></details>
              <details className={`${CARD} p-5`} open={developerMode}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Raw gateway response{developerMode ? " · Developer Mode" : ""}</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#020617] p-4 text-xs text-[#94A3B8]">{JSON.stringify(result, null, 2)}</pre></details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// Settings Page
// ──────────────────────────────────────────────────────────

function SettingsPage({
  agents,
  policies,
  auditLogs,
  apiOnline,
  threatIntelligenceStatus,
  oracleValidationStatus,
  complianceControlsStatus,
  x402PaymentControlsStatus,
  emergencyPauses,
  walletAddress,
  developerMode,
  onDeveloperModeChange,
  onNavigate,
  onCreateEmergencyPause,
  onResumeEmergencyPause,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  apiOnline: boolean;
  threatIntelligenceStatus: ThreatIntelligenceStatus;
  oracleValidationStatus: OracleValidationStatus;
  complianceControlsStatus: ComplianceControlsStatus;
  x402PaymentControlsStatus: X402PaymentControlsStatus;
  emergencyPauses: EmergencyPause[];
  walletAddress: string;
  developerMode: boolean;
  onDeveloperModeChange: (enabled: boolean) => void;
  onNavigate: (page: Page) => void;
  onCreateEmergencyPause: (body: Record<string, unknown>) => Promise<unknown>;
  onResumeEmergencyPause: (id: string, reason: string) => Promise<unknown>;
}) {
  type SettingsTab = "general" | "providers" | "emergency" | "developer";
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [copiedSetting, setCopiedSetting] = useState("");
  const [expandedProvider, setExpandedProvider] = useState("");
  const [showAdvancedEndpoints, setShowAdvancedEndpoints] = useState(false);
  const [defaultLimitUnit, setDefaultLimitUnit] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("magen3.defaultLimitUnit") || "Fiat Value") : "Fiat Value");
  const [referenceCurrency, setReferenceCurrency] = useState(() => typeof window !== "undefined" ? (localStorage.getItem("magen3.referenceCurrency") || "USD") : "USD");
  const savePolicyDefaults = (unit: string, currency: string) => { setDefaultLimitUnit(unit); setReferenceCurrency(currency); localStorage.setItem("magen3.defaultLimitUnit", unit); localStorage.setItem("magen3.referenceCurrency", currency); };

  const copySetting = useCallback(async (label: string, value: string) => {
    const copiedOk = await writeClipboard(value);
    setCopiedSetting(copiedOk ? label : "copy failed");
    setTimeout(() => setCopiedSetting(""), copiedOk ? 1400 : 1800);
  }, []);

  const gatewayRows = [
    ["API Base URL", api.baseUrl],
    ["Gateway Intent URL", `${api.baseUrl}/api/agent-gateway/intents`],
    ["Gateway Verify URL", `${api.baseUrl}/api/agent-gateway/me?agentId=YOUR_AGENT_ID`],
    ["Threat Intelligence Status", `${api.baseUrl}/api/threat-intelligence/status`],
    ["Oracle Validation Status", `${api.baseUrl}/api/oracle-validation/status`],
    ["Compliance Controls Status", `${api.baseUrl}/api/compliance-controls/status`],
    ["Execution Integrity Status", `${api.baseUrl}/api/execution-integrity/status`],
    ["Execution Reconciliation Status", `${api.baseUrl}/api/execution-reconciliation/status`],
    ["Execution Reconciliation Reporting", `${api.baseUrl}/api/agent-gateway/executions/reconcile`],
    ["Execution Reconciliation Polling", `${api.baseUrl}/api/agent-gateway/executions/poll`],
    ["Emergency Controls Status", `${api.baseUrl}/api/emergency-controls/status`],
    ["Instruction Integrity Status", `${api.baseUrl}/api/instruction-integrity/status`],
    ["Tool & MCP Integrity Status", `${api.baseUrl}/api/tool-mcp-integrity/status`],
    ["Delegation Safety Status", `${api.baseUrl}/api/delegation-safety/status`],
    ["RPC & Chain Integrity Status", `${api.baseUrl}/api/rpc-chain-integrity/status`],
    ["Gas Sponsorship & Fee Safety Status", `${api.baseUrl}/api/gas-sponsorship-fee-safety/status`],
    ["Emergency Pause Management", `${api.baseUrl}/api/emergency-pauses`],
    ["Token Permission Controls Status", `${api.baseUrl}/api/token-permission-controls/status`],
    ["x402 Payment Controls Status", `${api.baseUrl}/api/x402-payment-controls/status`],
    ["x402 Settlement Reporting", `${api.baseUrl}/api/agent-gateway/x402/settlements`],
    ["Agent API Keys", "Created and rotated from Connected Agents"],
  ];
  const essentialGatewayRows = [gatewayRows[0], gatewayRows[1], gatewayRows[2], gatewayRows[8]];
  const advancedGatewayRows = gatewayRows.filter((row) => !essentialGatewayRows.includes(row));
  const backendEnvironment = api.baseUrl.includes("localhost") || api.baseUrl.includes("127.0.0.1") ? "Local backend" : "Deployed backend";
  const activePauses = emergencyPauses.filter((pause) => pause.active === true || pause.status === "Active");
  const proofRecords = auditLogs.filter((log) => Boolean(log.txHash || log.decisionProofStatus));

  const providerServices = [
    {
      id: "threat",
      label: "Threat Intelligence",
      description: "Configured indicator-feed observations used by deterministic threat checks.",
      status: threatIntelligenceStatus.status === "available" ? "Available" : "Unavailable",
      icon: <ShieldAlert size={17} />,
      details: [
        ["Source", threatIntelligenceStatus.sourceName || "No feed configured"],
        ["Feed state", threatIntelligenceStatus.status || "unavailable"],
        ["Active indicators", String(threatIntelligenceStatus.activeIndicatorCount ?? threatIntelligenceStatus.indicatorCount ?? 0)],
        ["Feed records", String(threatIntelligenceStatus.indicatorCount || 0)],
      ],
      error: threatIntelligenceStatus.error || "",
      note: "Provider credentials and raw configured locations are never displayed.",
    },
    {
      id: "oracle",
      label: "Oracle Validation",
      description: "Price-feed observations used by market-sensitive policy checks.",
      status: oracleValidationStatus.status === "available" ? "Available" : "Unavailable",
      icon: <Activity size={17} />,
      details: [
        ["Source", oracleValidationStatus.sourceName || "No feed configured"],
        ["Feed state", oracleValidationStatus.status || "unavailable"],
        ["Asset pairs", String(oracleValidationStatus.pairCount || 0)],
        ["Observations", String(oracleValidationStatus.observationCount || 0)],
      ],
      error: oracleValidationStatus.error || "",
      note: "Unavailable or stale observations remain explicit and are never treated as a passing check.",
    },
    {
      id: "compliance",
      label: "Compliance Controls",
      description: "Opaque screening and jurisdiction evidence without raw personal identity data.",
      status: complianceControlsStatus.status === "available" ? "Available" : "Unavailable",
      icon: <ShieldCheck size={17} />,
      details: [
        ["Source", complianceControlsStatus.sourceName || "No feed configured"],
        ["Feed state", complianceControlsStatus.status || "unavailable"],
        ["Active indicators", String(complianceControlsStatus.activeIndicatorCount ?? complianceControlsStatus.indicatorCount ?? 0)],
        ["Jurisdiction rules", String(complianceControlsStatus.activeJurisdictionCount ?? complianceControlsStatus.jurisdictionCount ?? 0)],
      ],
      error: complianceControlsStatus.error || "",
      note: "Magen3 stores status evidence and opaque references, not names or identity documents.",
    },
    {
      id: "x402",
      label: "x402 Payment Controls",
      description: "Exact-payment request binding, replay protection, and settlement reporting capability.",
      status: x402PaymentControlsStatus.status === "foundation-available" ? "Foundation" : "Unavailable",
      icon: <Zap size={17} />,
      details: [
        ["Protocol", `x402 v${x402PaymentControlsStatus.protocolVersion || 2}`],
        ["Schemes", (x402PaymentControlsStatus.supportedSchemes || ["exact"]).join(", ")],
        ["Request binding", x402PaymentControlsStatus.requestBinding ? "Enabled" : "Unavailable"],
        ["Settlement reporting", x402PaymentControlsStatus.settlementReporting ? "Enabled" : "Unavailable"],
      ],
      error: "",
      note: "Magen3 does not receive signing keys or raw PAYMENT-SIGNATURE payloads.",
    },
  ];

  const providerCounts = {
    available: providerServices.filter((service) => service.status === "Available").length,
    unavailable: providerServices.filter((service) => service.status === "Unavailable").length,
    foundation: providerServices.filter((service) => service.status === "Foundation").length,
  };

  const providerClass = (status: string) => status === "Available"
    ? "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]"
    : status === "Foundation"
      ? "border-[#22D3EE]/25 bg-[#22D3EE]/10 text-[#22D3EE]"
      : "border-[#F59E0B]/25 bg-[#F59E0B]/10 text-[#F59E0B]";

  const openDeveloperPortal = () => {
    window.location.hash = "developer-portal-doc";
    onNavigate("docs");
    window.setTimeout(() => document.getElementById("developer-portal-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const EndpointRow = ({ label, value }: { label: string; value: string; key?: string }) => (
    <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div>
          <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
        </div>
        {value.startsWith("http") && <button type="button" aria-label={`Copy ${label}`} onClick={() => void copySetting(label, value)} className="shrink-0 rounded-lg border border-[#1E293B] bg-[#050B14] p-2 text-[#22D3EE] hover:border-[#22D3EE]/35 hover:text-[#F8FAFC]"><Copy size={14} /></button>}
      </div>
    </div>
  );

  const tabs: Array<{ id: SettingsTab; label: string; icon: ReactElement; badge?: string }> = [
    { id: "general", label: "General", icon: <Settings size={15} /> },
    { id: "providers", label: "Provider Services", icon: <Server size={15} />, badge: providerCounts.unavailable ? String(providerCounts.unavailable) : undefined },
    { id: "emergency", label: "Emergency Controls", icon: <ShieldAlert size={15} />, badge: activePauses.length ? String(activePauses.length) : undefined },
    { id: "developer", label: "Developer", icon: <Code2 size={15} /> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Settings"
        description="Manage the active environment, provider services, emergency controls, and developer preferences."
        meta={!apiOnline ? <span className="inline-flex items-center gap-1.5 rounded-full border border-[#EF4444]/30 bg-[#EF4444]/10 px-2.5 py-1 text-xs font-semibold text-[#EF4444]"><Server size={12} /> Gateway unavailable</span> : undefined}
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-1">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? "bg-[#111827] text-[#F8FAFC] shadow-sm" : "text-[#94A3B8] hover:bg-[#111827]/60 hover:text-[#F8FAFC]"}`}>
            <span className={activeTab === tab.id ? "text-[#22D3EE]" : "text-[#64748B]"}>{tab.icon}</span>{tab.label}
            {tab.badge && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${tab.id === "emergency" ? "bg-[#EF4444]/15 text-[#FCA5A5]" : "bg-[#F59E0B]/15 text-[#FCD34D]"}`}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Active Environment</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Read-only deployment values used by the current browser session.</p></div><Globe size={20} className="text-[#22D3EE]" /></div>
              <div className="mt-4 divide-y divide-[#1E293B]">
                {[
                  ["Network", "Casper Testnet"],
                  ["API environment", backendEnvironment],
                  ["Gateway", apiOnline ? "Connected" : "Unavailable"],
                  ["Decision proofs", proofRecords.length > 0 ? `${proofRecords.length} observed records` : "Backend-managed"],
                ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3"><div className="text-xs text-[#94A3B8]">{label}</div><div className="text-right text-sm font-medium text-[#F8FAFC]">{value}</div></div>)}
              </div>
              <div className="mt-3 rounded-lg border border-[#22D3EE]/15 bg-[#22D3EE]/5 p-3 text-[11px] leading-relaxed text-[#94A3B8]">Environment values are controlled by Railway, Vercel, and backend configuration. They cannot be changed from this browser.</div>
            </div>

            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Deployment Information</h2><p className="mt-1 text-xs text-[#94A3B8]">Safe, non-secret values for troubleshooting the active interface.</p></div><Database size={20} className="text-[#A78BFA]" /></div>
              <div className="mt-4 space-y-3">
                <EndpointRow label="API base URL" value={api.baseUrl} />
                <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Magen3 version</div><div className="mt-1 text-sm font-semibold text-[#F8FAFC]">{__MAGEN3_VERSION__}</div></div><div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">Wallet scope</div><div className="mt-1 truncate text-sm font-semibold text-[#F8FAFC]" title={walletAddress}>{walletAddress ? `${walletAddress.slice(0, 10)}…${walletAddress.slice(-8)}` : "Not connected"}</div></div></div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className={`${CARD_GLOW} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">First Agent Setup</div><h2 className="mt-1 text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Need help finishing onboarding?</h2><p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">Reopen Guided Setup to protect another agent, or review the Dashboard checklist for credentials, first intent, and Casper proof progress.</p></div><ShieldCheck size={21} className="shrink-0 text-[#22D3EE]" /></div>
              <div className="mt-4 flex flex-wrap gap-2"><Btn variant="primary" size="sm" onClick={() => requestAgentOnboarding(onNavigate, "guided")}><ArrowRight size={14} /> Start Guided Setup</Btn><Btn variant="secondary" size="sm" onClick={() => onNavigate("dashboard")}>View Setup Checklist</Btn></div>
            </div>
            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Policy Defaults</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Used only for new policies. Existing policies keep their current denomination and are never silently converted.</p></div><Scale size={20} className="text-[#22D3EE]" /></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><SelectField label="Default limit unit" value={defaultLimitUnit} onChange={(value) => savePolicyDefaults(value, referenceCurrency)} options={["Fiat Value", "Network Native Asset"]} />{defaultLimitUnit === "Fiat Value" && <SelectField label="Preferred reference currency" value={referenceCurrency} onChange={(value) => savePolicyDefaults(defaultLimitUnit, value)} options={["USD"]} />}</div>
            </div>
            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Interface Preferences</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Preferences are stored only in this browser and do not change policy enforcement.</p></div><Settings size={20} className="text-[#22D3EE]" /></div>
              <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div><div className="text-sm font-semibold text-[#F8FAFC]">Developer Mode</div><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Open raw Gateway responses, finding evidence, pipeline identifiers, and audit diagnostics by default.</p></div>
                  <button type="button" role="switch" aria-checked={developerMode} aria-label="Toggle Developer Mode" onClick={() => onDeveloperModeChange(!developerMode)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${developerMode ? "bg-[#22D3EE]" : "bg-[#1E293B]"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${developerMode ? "translate-x-5" : ""}`} /></button>
                </div>
                <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${developerMode ? "border-[#22D3EE]/20 bg-[#22D3EE]/5 text-[#BAE6FD]" : "border-[#1E293B] bg-[#050B14] text-[#64748B]"}`}>{developerMode ? "Technical evidence is expanded by default in Intent Playground and Audit Logs." : "Technical evidence remains available through manual expansion when Developer Mode is off."}</div>
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Diagnostics Snapshot</h2><p className="mt-1 text-xs text-[#94A3B8]">A local, non-secret summary for support and deployment verification.</p></div><Code2 size={20} className="text-[#A78BFA]" /></div>
              <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#020617] p-4 text-xs leading-relaxed text-[#94A3B8]">{JSON.stringify({ magen3Version: __MAGEN3_VERSION__, network: "casper-testnet", gatewayOnline: apiOnline, providerServices: providerCounts, activeEmergencyPauses: activePauses.length, agentCount: agents.length, policyCount: policies.length, auditCount: auditLogs.length, developerMode }, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {activeTab === "providers" && (
        <div className="space-y-5">
          <div className={`${CARD} p-5`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className={SECTION_TITLE}>Provider Services</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">Backend-derived provider capability and feed state. Unavailable services remain explicit and never silently pass a required control.</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-3 py-1 text-[#22C55E]">{providerCounts.available} Available</span><span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-3 py-1 text-[#F59E0B]">{providerCounts.unavailable} Unavailable</span><span className="rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-3 py-1 text-[#22D3EE]">{providerCounts.foundation} Foundation</span></div></div>
          </div>
          <div className={`${CARD} overflow-hidden`}>
            {providerServices.map((service, index) => {
              const expanded = expandedProvider === service.id;
              return <div key={service.id} className={index > 0 ? "border-t border-[#1E293B]" : ""}><button type="button" onClick={() => setExpandedProvider(expanded ? "" : service.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#111827]/45"><span className={`rounded-lg border p-2 ${providerClass(service.status)}`}>{service.icon}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-[#F8FAFC]">{service.label}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${providerClass(service.status)}`}>{service.status}</span></span><span className="mt-1 block text-xs leading-relaxed text-[#94A3B8]">{service.description}</span></span><ChevronDown size={16} className={`shrink-0 text-[#64748B] transition-transform ${expanded ? "rotate-180" : ""}`} /></button>{expanded && <div className="border-t border-[#1E293B] bg-[#050B14] p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{service.details.map(([label, value]) => <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[10px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-words text-sm text-[#F8FAFC]">{value}</div></div>)}</div>{service.error && <div className="mt-3 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-xs leading-relaxed text-[#FCD34D]">{service.error}</div>}<div className="mt-3 text-[11px] leading-relaxed text-[#64748B]">{service.note}</div></div>}</div>;
            })}
          </div>
        </div>
      )}

      {activeTab === "emergency" && (
        <div className="space-y-5">
          <div className={`${CARD} p-5`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className={SECTION_TITLE}>Emergency Controls</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">Pause one agent, capability, action, policy, or all outgoing execution. Activations, expiry, resume approvals, and operator reasons remain audited.</p></div><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${activePauses.length ? "border-[#EF4444]/25 bg-[#EF4444]/10 text-[#EF4444]" : "border-[#22C55E]/25 bg-[#22C55E]/10 text-[#22C55E]"}`}>{activePauses.length ? `${activePauses.length} Active Pause${activePauses.length === 1 ? "" : "s"}` : "No Active Pauses"}</span></div></div>
          <EmergencyControlsPanel pauses={emergencyPauses} agents={agents} policies={policies} walletAddress={walletAddress} compact onCreatePause={onCreateEmergencyPause} onResumePause={onResumeEmergencyPause} />
        </div>
      )}

      {activeTab === "developer" && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="space-y-5">
            <div className={`${CARD} p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className={SECTION_TITLE}>Developer Integration</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#94A3B8]">Use the Agent ID and one-time API key from Connected Agents. Full SDK, MCP, and integration guidance remains in the Developer Portal.</p></div><Btn variant="secondary" size="sm" onClick={openDeveloperPortal}><ExternalLink size={14} /> Open Developer Portal</Btn></div>
              <div className="mt-4 space-y-3">{essentialGatewayRows.map(([label, value]) => <EndpointRow key={label} label={label} value={value} />)}</div>
              {copiedSetting && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${copiedSetting === "copy failed" ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]" : "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#BBF7D0]"}`}>{copiedSetting === "copy failed" ? "Copy was blocked by the browser." : `${copiedSetting} copied.`}</div>}
            </div>
            <div className={`${CARD} overflow-hidden`}><button type="button" onClick={() => setShowAdvancedEndpoints((current) => !current)} className="flex w-full items-center justify-between p-4 text-left"><div><div className="text-sm font-semibold text-[#F8FAFC]">Advanced endpoint reference</div><div className="mt-1 text-xs text-[#94A3B8]">Provider, integrity, emergency, token-permission, and payment endpoints.</div></div><ChevronDown size={16} className={`text-[#64748B] transition-transform ${showAdvancedEndpoints ? "rotate-180" : ""}`} /></button>{showAdvancedEndpoints && <div className="space-y-3 border-t border-[#1E293B] p-4">{advancedGatewayRows.map(([label, value]) => <EndpointRow key={label} label={label} value={value} />)}</div>}</div>
          </div>
          <div className="space-y-5">
            <div className={`${CARD} p-5`}><div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Developer Mode</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">This browser preference changes only technical presentation, never the deterministic decision.</p></div><button type="button" role="switch" aria-checked={developerMode} aria-label="Toggle Developer Mode" onClick={() => onDeveloperModeChange(!developerMode)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${developerMode ? "bg-[#22D3EE]" : "bg-[#1E293B]"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${developerMode ? "translate-x-5" : ""}`} /></button></div><div className={`mt-4 rounded-xl border p-3 text-xs leading-relaxed ${developerMode ? "border-[#22D3EE]/20 bg-[#22D3EE]/5 text-[#BAE6FD]" : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8]"}`}>{developerMode ? "Active. Raw responses and technical evidence open automatically." : "Off. Technical evidence stays collapsed until explicitly opened."}</div></div>
            <div className={`${CARD} p-5`}><div className="flex items-start justify-between gap-4"><div><h2 className={SECTION_TITLE}>Runtime Diagnostics</h2><p className="mt-1 text-xs text-[#94A3B8]">Safe values only. Secrets, raw API keys, provider credentials, and wallet signatures are excluded.</p></div><Server size={20} className="text-[#A78BFA]" /></div><div className="mt-4 space-y-2 text-xs">{[["Version", __MAGEN3_VERSION__], ["Network", "casper-testnet"], ["Gateway", apiOnline ? "online" : "unavailable"], ["Provider services", `${providerCounts.available} available · ${providerCounts.unavailable} unavailable · ${providerCounts.foundation} foundation`], ["Emergency pauses", String(activePauses.length)]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2"><span className="text-[#64748B]">{label}</span><span className="text-right font-mono text-[#F8FAFC]">{value}</span></div>)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// App Shell
// ──────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>("landing");
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [apiOnline, setApiOnline] = useState(false);
  const [threatIntelligenceStatus, setThreatIntelligenceStatus] = useState<ThreatIntelligenceStatus>({ status: "unavailable", sourceType: "none", sourceName: "No threat intelligence feed configured", indicatorCount: 0 });
  const [oracleValidationStatus, setOracleValidationStatus] = useState<OracleValidationStatus>({ status: "unavailable", sourceType: "none", sourceName: "No oracle feed configured", observationCount: 0, pairCount: 0 });
  const [complianceControlsStatus, setComplianceControlsStatus] = useState<ComplianceControlsStatus>({ status: "unavailable", sourceType: "none", sourceName: "No compliance controls feed configured", indicatorCount: 0, jurisdictionCount: 0 });
  const [x402PaymentControlsStatus, setX402PaymentControlsStatus] = useState<X402PaymentControlsStatus>({ status: "foundation-available", protocolVersion: 2, supportedSchemes: ["exact"], requestBinding: true, replayProtection: true, settlementReporting: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [developerMode, setDeveloperMode] = useState(() => {
    try {
      return window.localStorage.getItem("magen3.developerMode") === "true";
    } catch {
      return false;
    }
  });
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [emergencyPauses, setEmergencyPauses] = useState<EmergencyPause[]>([]);
  const [onboardingRequest, setOnboardingRequest] = useState<OnboardingLaunchRequest | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("magen3.developerMode", String(developerMode));
    } catch {
      // Browser storage may be unavailable in private or restricted contexts.
    }
  }, [developerMode]);

  useEffect(() => {
    let cancelled = false;

    api.health()
      .then(() => {
        if (!cancelled) setApiOnline(true);
      })
      .catch(() => {
        if (!cancelled) setApiOnline(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const refreshThreatStatus = async () => {
      try {
        const payload = await api.threatIntelligenceStatus();
        if (!cancelled) setThreatIntelligenceStatus(payload.threatIntelligence as ThreatIntelligenceStatus);
      } catch {
        if (!cancelled) setThreatIntelligenceStatus((previous) => ({ ...previous, status: "unavailable", error: "Threat Intelligence status endpoint is unavailable." }));
      }
    };
    void refreshThreatStatus();
    intervalId = setInterval(() => void refreshThreatStatus(), 60_000);
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const refreshOracleStatus = async () => {
      try {
        const payload = await api.oracleValidationStatus();
        if (!cancelled) setOracleValidationStatus(payload.oracleValidation as OracleValidationStatus);
      } catch {
        if (!cancelled) setOracleValidationStatus((previous) => ({ ...previous, status: "unavailable", error: "Oracle Validation status endpoint is unavailable." }));
      }
    };
    void refreshOracleStatus();
    intervalId = setInterval(() => void refreshOracleStatus(), 60_000);
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const refreshComplianceStatus = async () => {
      try {
        const payload = await api.complianceControlsStatus();
        if (!cancelled) setComplianceControlsStatus(payload.complianceControls as ComplianceControlsStatus);
      } catch {
        if (!cancelled) setComplianceControlsStatus((previous) => ({ ...previous, status: "unavailable", error: "Compliance Controls status endpoint is unavailable." }));
      }
    };
    void refreshComplianceStatus();
    intervalId = setInterval(() => void refreshComplianceStatus(), 60_000);
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshX402Status = async () => {
      try {
        const payload = await api.x402PaymentControlsStatus();
        if (!cancelled) setX402PaymentControlsStatus(payload.x402PaymentControls as X402PaymentControlsStatus);
      } catch {
        if (!cancelled) setX402PaymentControlsStatus((previous) => ({ ...previous, status: "unavailable" }));
      }
    };
    void refreshX402Status();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (!walletConnected || !walletAddress) {
      setAgents([]);
      setPolicies([]);
      setAuditLogs([]);
      setApprovals([]);
      setEmergencyPauses([]);
      return () => {
        cancelled = true;
      };
    }

    const refresh = async () => {
      try {
        const payload = await api.bootstrap(walletAddress);
        if (cancelled) return;
        if (Array.isArray(payload.agents)) {
          setAgents((previous) => payload.agents.map((agent: Agent) => ({
            ...agent,
            apiKey: previous.find((item) => item.id === agent.id)?.apiKey,
          })));
        }
        if (Array.isArray(payload.policies)) setPolicies(payload.policies as Policy[]);
        if (Array.isArray(payload.auditLogs)) setAuditLogs(payload.auditLogs as AuditLog[]);
        if (Array.isArray(payload.approvals)) setApprovals(payload.approvals as ApprovalRequest[]);
        if (Array.isArray(payload.emergencyPauses)) setEmergencyPauses(payload.emergencyPauses as EmergencyPause[]);
        setApiOnline(true);
      } catch {
        if (!cancelled) setApiOnline(false);
      }
    };

    void refresh();
    intervalId = setInterval(() => void refresh(), 6000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [walletConnected, walletAddress]);

  useEffect(() => {
    let cancelled = false;

    restoreCasperWalletConnection()
      .then((connection) => {
        if (cancelled || !connection) return;
        setWalletAddress(connection.publicKey);
        setWalletConnected(true);
        setWalletError("");
      })
      .catch(() => {
        // Wallet may be locked, unavailable, or not yet approved for this site.
        // We keep this silent so users are only prompted when they click Connect.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectWallet = useCallback(async () => {
    setWalletConnecting(true);
    setWalletError("");

    try {
      if (!isCasperWalletInstalled()) {
        throw new Error(
          "Casper Wallet extension was not detected. Install Casper Wallet in this browser, unlock it, then refresh Magen3."
        );
      }

      const connection = await connectCasperWallet();
      setWalletAddress(connection.publicKey);
      setWalletConnected(true);

      // Keep this call only as a backend health check. The wallet address now comes from Casper Wallet, not from backend session data.
      try {
        await api.connectWallet(connection.publicKey);
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    } catch (error) {
      setWalletConnected(false);
      setWalletAddress("");
      setWalletError(error instanceof Error ? error.message : "Unable to connect Casper Wallet.");
    } finally {
      setWalletConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectCasperWallet();
    } catch {
      // If the extension is unavailable during disconnect, still clear local app state.
    }
    setWalletConnected(false);
    setWalletAddress("");
    setWalletError("");
  }, []);

  const onRegisterAgent = useCallback(async (agent: AgentRegistrationDraft) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before registering an agent.");
      return undefined;
    }

    try {
      const response = await api.createAgent({ ...agent, walletAddress, ownerWalletAddress: walletAddress });
      const created = response.agent as Agent;
      setAgents((prev) => [created, ...prev]);
      setApiOnline(true);
      return created;
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to register agent.");
      return undefined;
    }
  }, [walletAddress]);

  const onRotateAgentApiKey = useCallback(async (id: string) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before rotating an agent API key.");
      return undefined;
    }

    try {
      const response = await api.rotateAgentApiKey(id, walletAddress);
      const updated = response.agent as Agent;
      setAgents((prev) => prev.map((agent) => agent.id === updated.id ? updated : agent));
      setApiOnline(true);
      return updated;
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to rotate agent API key.");
      return undefined;
    }
  }, [walletAddress]);

  const onRevokeAgent = useCallback(async (id: string) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before revoking an agent.");
      return undefined;
    }

    try {
      const response = await api.revokeAgent(id, walletAddress);
      const updated = response.agent as Agent;
      setAgents((prev) => prev.map((agent) => agent.id === updated.id ? updated : agent));
      setApiOnline(true);
      return updated;
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to revoke agent.");
      return undefined;
    }
  }, [walletAddress]);

  const onDeleteAgent = useCallback(async (id: string, confirmation: string) => {
    if (!walletAddress) {
      throw new Error("Connect Casper Wallet before deleting an agent.");
    }
    try {
      const response = await api.deleteAgent(id, walletAddress, confirmation);
      const deletedPolicyIds = Array.isArray(response.deletedPolicyIds) ? response.deletedPolicyIds as string[] : [];
      setAgents((previous) => previous.filter((agent) => agent.id !== id));
      setPolicies((previous) => previous.filter((policy) => !deletedPolicyIds.includes(policy.id) && policy.agentId !== id));
      setApiOnline(true);
      return response as { ok: boolean; deletedAgent: { id: string; name: string }; deletedPolicyIds: string[] };
    } catch (error) {
      setApiOnline(false);
      throw error;
    }
  }, [walletAddress]);

  const onCreatePolicy = useCallback(async (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before creating a policy.");
      return;
    }

    try {
      const response = await api.createPolicy({ ...policy, walletAddress });
      const created = response.policy as Policy;
      setPolicies((prev) => [created, ...prev]);
      if (Array.isArray(response.agents)) setAgents(response.agents as Agent[]);
      if (response.auditLog) setAuditLogs((prev) => [response.auditLog as AuditLog, ...prev]);
      setApiOnline(true);
      return created;
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to create policy.");
    }
  }, [walletAddress]);

  const onUpdatePolicy = useCallback(async (id: string, policy: Partial<Policy>) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before updating a policy.");
      return;
    }

    try {
      const response = await api.updatePolicy(id, { ...policy, walletAddress });
      const updated = response.policy as Policy;
      setPolicies((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      if (Array.isArray(response.agents)) setAgents(response.agents as Agent[]);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to update policy.");
    }
  }, [walletAddress]);

  const onRespondApproval = useCallback(async (id: string, response: "Approve" | "Reject", comment = "") => {
    if (!walletAddress) throw new Error("Connect Casper Wallet before responding to an approval request.");
    const approval = approvals.find((item) => item.id === id);
    let signaturePayload: Record<string, unknown> = {};
    if (approval?.signatureRequired) {
      const issued = await api.createApprovalChallenge(id, { walletAddress, response });
      const challenge = issued?.challenge as { id?: string; message?: string } | undefined;
      if (!challenge?.id || !challenge.message) throw new Error("Magen3 could not create the one-time reviewer signature challenge.");
      const signatureHex = await signCasperWalletMessage(challenge.message, walletAddress);
      signaturePayload = { challengeId: challenge.id, signatureHex };
    }
    const payload = await api.respondApproval(id, { walletAddress, response, comment, ...signaturePayload });
    if (payload.approval) {
      const updated = payload.approval as ApprovalRequest;
      setApprovals((previous) => previous.map((item) => item.id === updated.id ? updated : item));
    }
    if (payload.auditLog) {
      const updatedAudit = payload.auditLog as AuditLog;
      setAuditLogs((previous) => previous.map((item) => item.id === updatedAudit.id ? updatedAudit : item));
    }
    if (payload.emergencyPause) {
      const updatedPause = payload.emergencyPause as EmergencyPause;
      setEmergencyPauses((previous) => previous.map((item) => item.id === updatedPause.id ? updatedPause : item));
    }
    if (payload.resumeAuditLog) {
      const resumeAudit = payload.resumeAuditLog as AuditLog;
      setAuditLogs((previous) => previous.some((item) => item.id === resumeAudit.id) ? previous : [resumeAudit, ...previous]);
    }
    setApiOnline(true);
    return payload.approval as ApprovalRequest;
  }, [approvals, walletAddress]);

  const onCreateEmergencyPause = useCallback(async (body: Record<string, unknown>) => {
    if (!walletAddress) throw new Error("Connect Casper Wallet before activating Emergency Controls.");
    const payload = await api.createEmergencyPause({ ...body, walletAddress });
    if (payload.emergencyPause) {
      const pause = payload.emergencyPause as EmergencyPause;
      setEmergencyPauses((previous) => previous.some((item) => item.id === pause.id) ? previous.map((item) => item.id === pause.id ? pause : item) : [pause, ...previous]);
    }
    if (payload.auditLog) setAuditLogs((previous) => [payload.auditLog as AuditLog, ...previous]);
    setApiOnline(true);
    return payload;
  }, [walletAddress]);

  const onResumeEmergencyPause = useCallback(async (id: string, reason: string) => {
    if (!walletAddress) throw new Error("Connect Casper Wallet before resuming Emergency Controls.");
    const payload = await api.resumeEmergencyPause(id, { walletAddress, reason });
    if (payload.emergencyPause) {
      const pause = payload.emergencyPause as EmergencyPause;
      setEmergencyPauses((previous) => previous.map((item) => item.id === pause.id ? pause : item));
    }
    if (payload.approval) {
      const approval = payload.approval as ApprovalRequest;
      setApprovals((previous) => previous.some((item) => item.id === approval.id) ? previous.map((item) => item.id === approval.id ? approval : item) : [approval, ...previous]);
    }
    if (payload.auditLog) {
      const audit = payload.auditLog as AuditLog;
      setAuditLogs((previous) => previous.some((item) => item.id === audit.id) ? previous : [audit, ...previous]);
    }
    setApiOnline(true);
    return payload;
  }, [walletAddress]);

  const onPrepareCasperPayload = useCallback(async (id: string) => {
    const response = await api.prepareCasperPayload(id);
    setApiOnline(true);
    return response as CasperPreparedPayload;
  }, []);

  const onConfirmCasperDeploy = useCallback(async (id: string, deployHash: string) => {
    const response = await api.confirmCasperDeploy(id, deployHash);
    const updated = response.auditLog as AuditLog;
    setAuditLogs((prev) =>
      prev.map((log) => (log.id === id ? updated : log))
    );
    setApiOnline(true);
    return updated;
  }, []);

  const onConfirmExecutionDeploy = useCallback(async (id: string, deployHash: string, signedBy?: string, note?: string) => {
    const response = await api.confirmExecutionDeploy(id, deployHash, signedBy || walletAddress, note);
    const updated = response.auditLog as AuditLog;
    setAuditLogs((prev) =>
      prev.map((log) => (log.id === id ? updated : log))
    );
    setApiOnline(true);
    return updated;
  }, [walletAddress]);

  const onSubmitGatewayIntent = useCallback(async (intent: Record<string, unknown>, apiKey?: string) => {
    const response = await api.submitAgentGatewayIntent(intent, apiKey) as AgentGatewayResponse;
    if (response.auditLog) {
      setAuditLogs((prev) => {
        const exists = prev.some((log) => log.id === response.auditLog.id);
        return exists ? prev.map((log) => log.id === response.auditLog.id ? response.auditLog : log) : [response.auditLog, ...prev];
      });
    }
    if (response.approval) {
      setApprovals((previous) => {
        const exists = previous.some((item) => item.id === response.approval?.id);
        return exists ? previous.map((item) => item.id === response.approval?.id ? response.approval as ApprovalRequest : item) : [response.approval as ApprovalRequest, ...previous];
      });
    }
    if (response.emergencyPause) {
      setEmergencyPauses((previous) => previous.some((item) => item.id === response.emergencyPause?.id) ? previous : [response.emergencyPause as EmergencyPause, ...previous]);
    }
    setApiOnline(true);
    return response;
  }, []);

  const onRecordAuditLog = useCallback(async (id: string) => {
    try {
      const response = await api.recordAuditLog(id);
      const updated = response.auditLog as AuditLog;
      setAuditLogs((prev) => prev.map((log) => log.id === updated.id ? updated : log));
      setApiOnline(true);
      return updated;
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Automatic recording is disabled. Use a real Casper deploy hash.");
      throw error;
    }
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
  }, []);

  const startOnboarding = useCallback((mode: OnboardingSetupMode = "guided") => {
    setOnboardingRequest({ mode, nonce: Date.now() });
    setPage("connected-agents");
  }, []);

  if (page === "landing") {
    return (
      <LandingPage onLaunchApp={() => setPage("dashboard")} onOpenDocs={() => setPage("docs")} />
    );
  }

  const pageComponents: Record<Exclude<Page, "landing" | "docs">, ReactElement> = {
    dashboard: (
      <DashboardPage
        walletConnected={walletConnected}
        onConnectWallet={connectWallet}
        walletConnecting={walletConnecting}
        walletError={walletError}
        apiOnline={apiOnline}
        threatIntelligenceStatus={threatIntelligenceStatus}
        oracleValidationStatus={oracleValidationStatus}
        complianceControlsStatus={complianceControlsStatus}
        x402PaymentControlsStatus={x402PaymentControlsStatus}
        auditLogs={auditLogs}
        policies={policies}
        agents={agents}
        approvals={approvals}
        emergencyPauses={emergencyPauses}
        onNavigate={navigate}
        onStartOnboarding={startOnboarding}
      />
    ),
    "connected-agents": (
      <ConnectedAgentsPage
        agents={agents}
        policies={policies}
        onRegisterAgent={onRegisterAgent}
        onRotateAgentApiKey={onRotateAgentApiKey}
        onRevokeAgent={onRevokeAgent}
        onDeleteAgent={onDeleteAgent}
        onCreatePolicy={onCreatePolicy}
        onSubmitGatewayIntent={onSubmitGatewayIntent}
        onNavigate={navigate}
        onboardingRequest={onboardingRequest}
        onOnboardingRequestHandled={() => setOnboardingRequest(null)}
        auditLogs={auditLogs}
        approvals={approvals}
        walletAddress={walletAddress}
        apiOnline={apiOnline}
        emergencyPauses={emergencyPauses}
        onCreateEmergencyPause={onCreateEmergencyPause}
        onResumeEmergencyPause={onResumeEmergencyPause}
      />
    ),
    shields: (
      <AgentShieldPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        apiOnline={apiOnline}
        onNavigate={navigate}
      />
    ),
    policies: (
      <PoliciesPage
        agents={agents}
        policies={policies}
        onCreatePolicy={onCreatePolicy}
        onUpdatePolicy={onUpdatePolicy}
        walletAddress={walletAddress}
        approvals={approvals}
        onRespondApproval={onRespondApproval}
        onNavigate={navigate}
      />
    ),
    "intent-playground": (
      <IntentPlaygroundPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        walletAddress={walletAddress}
        apiOnline={apiOnline}
        onSubmitGatewayIntent={onSubmitGatewayIntent}
        onNavigate={navigate}
        developerMode={developerMode}
      />
    ),
    "audit-log": (
      <AuditLogPage
        auditLogs={auditLogs}
        policies={policies}
        onRecordAuditLog={onRecordAuditLog}
        onPrepareCasperPayload={onPrepareCasperPayload}
        onConfirmCasperDeploy={onConfirmCasperDeploy}
        onConfirmExecutionDeploy={onConfirmExecutionDeploy}
        developerMode={developerMode}
        onNavigate={navigate}
      />
    ),
    settings: (
      <SettingsPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        apiOnline={apiOnline}
        threatIntelligenceStatus={threatIntelligenceStatus}
        oracleValidationStatus={oracleValidationStatus}
        complianceControlsStatus={complianceControlsStatus}
        x402PaymentControlsStatus={x402PaymentControlsStatus}
        emergencyPauses={emergencyPauses}
        walletAddress={walletAddress}
        developerMode={developerMode}
        onDeveloperModeChange={setDeveloperMode}
        onNavigate={navigate}
        onCreateEmergencyPause={onCreateEmergencyPause}
        onResumeEmergencyPause={onResumeEmergencyPause}
      />
    ),
  };

  return (
    <div
      className="flex min-h-screen bg-[#050B14]"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <Sidebar
        currentPage={page}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          walletConnected={walletConnected}
          walletAddress={walletAddress}
          apiOnline={apiOnline}
          onConnectWallet={connectWallet}
          onDisconnectWallet={disconnectWallet}
          walletConnecting={walletConnecting}
          walletError={walletError}
        />
        <main className={`flex-1 overflow-auto ${page === "docs" ? "p-0" : "p-6"}`}>
          {page === "docs" ? (
            <DocsPage />
          ) : !walletConnected ? (
            <WalletConnectionRequired
              onConnectWallet={connectWallet}
              walletConnecting={walletConnecting}
              walletError={walletError}
            />
          ) : (
            pageComponents[page as Exclude<Page, "landing" | "docs">]
          )}
        </main>
      </div>
    </div>
  );
}
