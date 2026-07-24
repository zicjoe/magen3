import { useState, useEffect, useCallback, useMemo, type ReactElement } from "react";
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
  Code2,
  ChevronRight,
  Menu,
  Layers,
} from "lucide-react";
import { api } from "./lib/api";
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
} from "./lib/casperWallet";

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
  | "Token Approval"
  | "Allowance Increase"
  | "Allowance Decrease"
  | "Allowance Reset"
  | "Permit Authorization"
  | "NFT Operator Approval"
  | "Batch Approval"
  | "Delegated Spender Permission"
  | "Policy Activation";
type TargetType =
  | "Trusted Contract"
  | "Unknown Contract"
  | "Wallet Address"
  | "DAO Treasury"
  | "RWA Registry"
  | "Oracle Feed"
  | "Bridge Contract"
  | "Token Contract"
  | "x402 Merchant";

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
  remainingApprovals: number;
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

interface DashboardStats {
  activeShields: number;
  protectedActions: number;
  blockedActions: number;
  reviewRequired: number;
  casperAuditRecords: number;
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
  moduleFindings?: ModuleFinding[];
  modulesEvaluated?: string[];
  capabilityContext?: ExecutionCapability[];
  pipelineStages?: PipelineStage[];
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
  tokenPermissionControlsContext?: {
    status?: string;
    availability?: string;
    enabled?: boolean;
    mode?: string;
    kind?: string;
    standard?: string;
    network?: string;
    networkFamily?: string;
    chainId?: string;
    tokenContract?: string;
    tokenContractKind?: string;
    owner?: string;
    spender?: string;
    intendedSpender?: string;
    approvalAmount?: number | null;
    intendedTransactionAmount?: number | null;
    approvalRatio?: number | null;
    unlimited?: boolean;
    deadline?: string;
    lifetimeSeconds?: number | null;
    nonce?: string;
    permitIdentifier?: string;
    permitSignatureHash?: string;
    fingerprint?: string;
    clientFingerprint?: string;
    batchSize?: number;
    resetAfterUse?: boolean;
    oneTime?: boolean;
    reusable?: boolean;
    previousFingerprintCount?: number;
    previousSignatureHashCount?: number;
    humanApprovalBinding?: string;
    securityBoundary?: string;
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

function auditTokenPermission(log: AuditLog) {
  const permission = auditAction(log).tokenPermission;
  return permission && typeof permission === "object" && !Array.isArray(permission)
    ? permission as Record<string, unknown>
    : null;
}

function executionProofStatus(status = "", txHash = "") {
  if (status === "x402_confirmed") return { label: "Payment confirmed", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (status === "x402_submitted" || status === "x402_pending") return { label: "Settlement pending", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "x402_uncertain") return { label: "Settlement uncertain", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "x402_failed") return { label: "Settlement failed", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
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
  status: "Available" | "Live" | "Foundation Available" | "Preview" | "Planned" | "Coming Soon" | "Active" | "Inactive" | "Policy Active" | "No Policy" | "Paused" | "Revoked";
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

function PipelineTimeline({ stages }: { stages?: PipelineStage[] }) {
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
          </div>
        </div>
      ))}
    </div>
  );
}

function FindingsPanel({ findings }: { findings?: ModuleFinding[] }) {
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
        </div>
      ))}
    </div>
  );
}

function IntegrationHealthPanel({ agent, policy, logs, apiOnline }: { agent: Agent; policy?: Policy; logs: AuditLog[]; apiOnline: boolean }) {
  const health = deriveIntegrationHealth(agent, policy, logs, apiOnline);
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
        {health.checks.map((check) => (
          <div key={check.label} className="flex items-start justify-between gap-3 rounded-lg bg-[#0B1220] p-2.5">
            <div>
              <div className="text-xs font-medium text-[#F8FAFC]">{check.label}</div>
              <div className="mt-0.5 text-[11px] text-[#94A3B8]">{check.detail}</div>
            </div>
            <span className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${check.status === "healthy" ? "bg-[#22C55E]" : check.status === "attention" || check.status === "unavailable" ? "bg-[#F59E0B]" : "bg-[#64748B]"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentInsightsPanel({ agent, logs }: { agent: Agent; logs: AuditLog[] }) {
  const scoped = logs.filter((log) => log.agentId === agent.id);
  const counts = {
    total: scoped.length,
    allowed: scoped.filter((log) => log.decision === "Allowed").length,
    blocked: scoped.filter((log) => log.decision === "Blocked").length,
    review: scoped.filter((log) => log.decision === "Review Required").length,
  };

  const blockReasons = new Map<string, number>();
  const triggeredRules = new Map<string, number>();
  const capabilityUsage = new Map<string, number>();
  for (const log of scoped) {
    if (log.decision === "Blocked") {
      const reason = log.primaryReason || log.triggeredRule || log.reason || "Unspecified policy reason";
      blockReasons.set(reason, (blockReasons.get(reason) || 0) + 1);
    }
    if (log.triggeredRule) {
      triggeredRules.set(log.triggeredRule, (triggeredRules.get(log.triggeredRule) || 0) + 1);
    }
    for (const capability of normalizeCapabilities(log.capabilityContext, agent.type)) {
      capabilityUsage.set(capability, (capabilityUsage.get(capability) || 0) + 1);
    }
  }

  const topEntry = (values: Map<string, number>) =>
    [...values.entries()].sort((left, right) => right[1] - left[1])[0];
  const topBlockReason = topEntry(blockReasons);
  const topTriggeredRule = topEntry(triggeredRules);
  const capabilitySummary = [...capabilityUsage.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Agent Insights</div>
          <div className="mt-1 text-sm text-[#94A3B8]">Observed gateway decisions only; no opaque reputation score.</div>
        </div>
        <TrendingUp size={20} className="text-[#22D3EE]" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Total", counts.total],
          ["Allowed", counts.allowed],
          ["Blocked", counts.blocked],
          ["Review", counts.review],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-2.5">
            <div className="text-lg font-bold text-[#F8FAFC]">{String(value)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">{String(label)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Most common block reason</div>
          <div className="mt-1 text-xs leading-relaxed text-[#F8FAFC]">{topBlockReason ? `${topBlockReason[0]} (${topBlockReason[1]})` : "No blocked decisions observed."}</div>
        </div>
        <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Most frequent triggered rule</div>
          <div className="mt-1 text-xs leading-relaxed text-[#F8FAFC]">{topTriggeredRule ? `${topTriggeredRule[0]} (${topTriggeredRule[1]})` : "No triggered-rule evidence yet."}</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">Capability context observed</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(capabilitySummary.length ? capabilitySummary : normalizeCapabilities(agent.executionCapabilities, agent.type).map((capability) => [capability, 0] as [string, number])).map(([capability, count]) => (
            <span key={capability} className="rounded-full border border-[#1E293B] bg-[#050B14] px-2.5 py-1 text-xs text-[#94A3B8]">{capability}{count ? ` · ${count}` : " · no intent yet"}</span>
          ))}
        </div>
      </div>
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
          <div className="text-xs text-[#94A3B8]/60 text-center">
            Casper Testnet
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
          <div className="w-2 h-2 rounded-full bg-[#FF3B3B]" />
          <span className="text-xs font-semibold text-[#FF3B3B] uppercase tracking-wider">
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
        {walletConnected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full">
            <ShieldCheck size={13} className="text-[#22C55E]" />
            <span className="text-xs text-[#22C55E] font-semibold">
              Wallet Connected
            </span>
          </div>
        )}
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
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#22D3EE] to-[#0EA5E9]" />
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
            <div className="w-1.5 h-1.5 rounded-full bg-[#FF3B3B]" />
            <span className="text-xs text-[#FF3B3B] font-semibold uppercase tracking-wide">
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
  onNavigate,
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
  onNavigate: (p: Page) => void;
}) {
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
  const activePolicy = policies.find((p) => p.status === "Active");
  const activePolicyAgent = activePolicy
    ? agents.find((a) => a.id === activePolicy.agentId)
    : null;
  const riskOverviewBase = ["Low", "Medium", "High"].map((risk) => ({
    label: `${risk} Risk`,
    count: auditLogs.filter((log) =>
      risk === "High" ? log.risk === "High" || log.risk === "Critical" : log.risk === risk
    ).length,
    color: risk === "Low" ? "#22C55E" : risk === "Medium" ? "#F59E0B" : "#EF4444",
  }));
  const totalRiskRecords = Math.max(1, riskOverviewBase.reduce((sum, item) => sum + item.count, 0));
  const riskOverview = riskOverviewBase.map((item) => ({
    ...item,
    pct: Math.round((item.count / totalRiskRecords) * 100),
  }));
  const today = new Date();
  const decisionsToday = auditLogs.filter((log) => isSameDay(new Date(log.timestamp), today));
  const agentCoverage = agents.map((agent) => {
    const agentLogs = auditLogs.filter((log) => log.agentId === agent.id);
    return { agent, coverage: calculateSecurityCoverage(agent, getActivePolicy(policies, agent.id), agentLogs) };
  });
  const averageCoverage = agentCoverage.length ? Math.round(agentCoverage.reduce((sum, item) => sum + item.coverage.score, 0) / agentCoverage.length) : 0;
  const agentsNeedingAttention = [...agentCoverage].filter((item) => item.coverage.score < 85).sort((a, b) => a.coverage.score - b.coverage.score).slice(0, 3);

  const threatFeedOperational = threatIntelligenceStatus.status === "available";
  const activeThreatIndicators = threatIntelligenceStatus.activeIndicatorCount ?? threatIntelligenceStatus.indicatorCount ?? 0;
  const threatFeedLabel = threatFeedOperational
    ? `${activeThreatIndicators} active indicators`
    : threatIntelligenceStatus.status === "stale"
      ? "Stale"
      : "Unavailable";
  const oracleFeedOperational = oracleValidationStatus.status === "available";
  const oracleFeedLabel = oracleFeedOperational
    ? `${oracleValidationStatus.pairCount || 0} pairs`
    : oracleValidationStatus.status === "stale"
      ? "Stale"
      : "Unavailable";
  const x402FoundationAvailable = x402PaymentControlsStatus.status === "foundation-available";
  const x402PaymentsToday = decisionsToday.filter((log) => log.action === "x402 Payment");
  const pendingApprovals = approvals.filter((approval) => approval.reviewStatus === "Pending" || approval.reviewStatus === "Configuration Required");
  const tokenPermissionAlertRules = new Set(["Unlimited token approval", "Unlimited batch approval", "Unknown spender", "Unknown batch spender", "Multiple batch spenders", "Maximum token permission lifetime", "Long-lived reusable authority", "Permit replay", "Reused permit signature", "Changed permit parameters"]);
  const tokenPermissionAlerts = auditLogs.flatMap((log) => (log.moduleFindings || []).filter((finding) => finding.module === "Token Approval & Permit Safety" && ["fail", "warning"].includes(finding.status) && tokenPermissionAlertRules.has(finding.rule)).map((finding) => ({ log, finding }))).slice(0, 4);
  const tokenPermissionRelevantCapabilities = new Set<ExecutionCapability>(["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation"]);
  const agentsWithTokenPermissionsDisabled = agents.filter((agent) => normalizeCapabilities(agent.executionCapabilities, agent.type).some((capability) => tokenPermissionRelevantCapabilities.has(capability)) && getActivePolicy(policies, agent.id)?.structuredRules?.tokenPermissionControlsEnabled !== true);
  const complianceFeedOperational = complianceControlsStatus.status === "available";
  const complianceFeedLabel = complianceFeedOperational
    ? `${complianceControlsStatus.activeIndicatorCount ?? complianceControlsStatus.indicatorCount ?? 0} indicators · ${complianceControlsStatus.activeJurisdictionCount ?? complianceControlsStatus.jurisdictionCount ?? 0} jurisdictions`
    : complianceControlsStatus.status === "stale"
      ? "Stale"
      : "Unavailable";

  const operationalItems = [
    { label: "Connected wallet", value: "Active", done: walletConnected },
    { label: "Registered agents", value: String(agents.length), done: agents.length > 0 },
    { label: "Active policies", value: String(policies.filter((policy) => policy.status === "Active").length), done: Boolean(activePolicy) },
    { label: "Audit records", value: String(auditLogs.length), done: auditLogs.length > 0 },
    { label: "Casper proofs", value: String(dashboardStats.casperAuditRecords), done: dashboardStats.casperAuditRecords > 0 },
    { label: "Threat feed", value: threatFeedLabel, done: threatFeedOperational },
    { label: "Oracle feed", value: oracleFeedLabel, done: oracleFeedOperational },
    { label: "Compliance feed", value: complianceFeedLabel, done: complianceFeedOperational },
    { label: "x402 controls", value: x402PaymentsToday.length ? `${x402PaymentsToday.length} today` : "Ready", done: x402FoundationAvailable },
    { label: "Approval queue", value: String(pendingApprovals.length), done: pendingApprovals.length === 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Connected Agents" value={agents.length} icon={<Bot size={20} />} color="cyan" />
        <StatCard label="Decisions Today" value={decisionsToday.length} icon={<Activity size={20} />} color="purple" />
        <StatCard label="Allowed" value={decisionsToday.filter((log) => log.decision === "Allowed").length} icon={<ShieldCheck size={20} />} color="green" />
        <StatCard label="Blocked" value={decisionsToday.filter((log) => log.decision === "Blocked").length} icon={<ShieldX size={20} />} color="red" />
        <StatCard label="Review Required" value={decisionsToday.filter((log) => log.decision === "Review Required").length} icon={<Clock size={20} />} color="amber" />
      </div>

      <div className={`${CARD_GLOW} p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#22D3EE] text-xs font-semibold uppercase tracking-wider mb-2">
              <Activity size={14} />
              Platform Status
            </div>
            <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
              {apiOnline ? "Magen3 Gateway online" : "Magen3 Gateway unavailable"}
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1 max-w-3xl">
              Dashboard numbers come from the connected wallet, registered agents, active policies, saved audit records, and confirmed Casper decision proofs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="sm" onClick={() => onNavigate("connected-agents")}>
              Open Connected Agents
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => onNavigate("audit-log")}>
              Open Decision Proof
            </Btn>
          </div>
        </div>
        <div className="mt-4 grid md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8 gap-2">
          {operationalItems.map((item) => (
            <div key={item.label} className={`rounded-lg border px-3 py-2 text-xs ${
              item.done
                ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#BBF7D0]"
                : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8]"
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span>{item.label}</span>
                <span className="font-semibold text-[#F8FAFC]">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed ${
          threatFeedOperational
            ? "border-[#22C55E]/25 bg-[#22C55E]/5 text-[#BBF7D0]"
            : "border-[#F59E0B]/25 bg-[#F59E0B]/5 text-[#FCD34D]"
        }`}>
          <span className="font-semibold">Threat Intelligence Foundation:</span>{" "}
          {threatFeedOperational
            ? `${threatIntelligenceStatus.sourceName || "Configured feed"} is fresh and exposes ${activeThreatIndicators} active exact-match indicator${activeThreatIndicators === 1 ? "" : "s"}.`
            : `${threatIntelligenceStatus.status === "stale" ? "The configured feed is stale" : "No fresh feed is available"}. Each policy decides whether that condition warns, requires review, or blocks; it never counts as a pass.`}
        </div>
        {pendingApprovals.length > 0 && (
          <button type="button" onClick={() => onNavigate("policies")} className="mt-3 flex w-full items-start justify-between gap-4 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-left text-xs text-[#FCD34D] transition-colors hover:border-[#F59E0B]/45">
            <span><span className="font-semibold">Human approval required:</span> {pendingApprovals.length} exact-bound request{pendingApprovals.length === 1 ? " is" : "s are"} waiting in Policy & Approval Controls.</span>
            <ArrowRight size={15} className="mt-0.5 shrink-0" />
          </button>
        )}
        {(tokenPermissionAlerts.length > 0 || agentsWithTokenPermissionsDisabled.length > 0) && (
          <div className="mt-3 rounded-xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-xs text-[#FCD34D]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><span className="font-semibold">Token permission attention:</span> {tokenPermissionAlerts.length > 0 ? `${tokenPermissionAlerts.length} recent high-signal approval or permit finding${tokenPermissionAlerts.length === 1 ? "" : "s"}.` : "No recent token-permission finding."} {agentsWithTokenPermissionsDisabled.length > 0 ? `${agentsWithTokenPermissionsDisabled.length} relevant agent${agentsWithTokenPermissionsDisabled.length === 1 ? " has" : "s have"} Token Permissions disabled.` : ""}</div>
              <button type="button" onClick={() => onNavigate(tokenPermissionAlerts.length > 0 ? "audit-log" : "policies")} className="inline-flex items-center gap-1 font-semibold text-[#F8FAFC] hover:text-[#22D3EE]">Review <ArrowRight size={13} /></button>
            </div>
            {tokenPermissionAlerts.length > 0 && <div className="mt-2 space-y-1 text-[#FDE68A]">{tokenPermissionAlerts.slice(0, 3).map(({ log, finding }) => <div key={`${log.id}-${finding.rule}`}>{log.agentName}: {finding.rule} · {log.decision}</div>)}</div>}
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <div className={`${CARD_GLOW} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Security Coverage</div><div className="mt-2 text-4xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{averageCoverage}%</div><div className="mt-1 text-sm text-[#94A3B8]">Average configured protection across registered agents.</div></div>
            <ShieldCheck size={25} className="text-[#22D3EE]" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#1E293B]"><div className="h-full rounded-full bg-[#22D3EE] transition-all" style={{ width: `${averageCoverage}%` }} /></div>
          <p className="mt-3 text-xs leading-relaxed text-[#64748B]">Coverage measures configured controls and observed integration state. It is not a guarantee against every exploit.</p>
        </div>
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between gap-3"><div><h2 className={SECTION_TITLE}>Agents Needing Attention</h2><p className="mt-1 text-xs text-[#94A3B8]">Highest-impact configuration improvements.</p></div><Btn variant="secondary" size="sm" onClick={() => onNavigate("connected-agents")}>Manage Agents</Btn></div>
          <div className="mt-4 space-y-2">
            {agentsNeedingAttention.length === 0 ? <div className="rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-4 text-sm text-[#BBF7D0]">All registered agents have a strong configuration foundation.</div> : agentsNeedingAttention.map(({ agent, coverage }) => (
              <div key={agent.id} className="flex flex-col gap-3 rounded-xl border border-[#1E293B] bg-[#0B1220] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="font-semibold text-[#F8FAFC]">{agent.name}</div><div className="mt-1 truncate text-xs text-[#94A3B8]">{coverage.recommendations[0]?.recommendation || "Review the agent configuration."}</div></div>
                <div className="shrink-0 text-right"><div className="text-lg font-bold text-[#F8FAFC]">{coverage.score}%</div><div className="text-[10px] uppercase tracking-wider text-[#94A3B8]">coverage</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className={`${CARD_GLOW} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_TITLE}>Recent Activity</h2>
            <span className="text-xs text-[#94A3B8]">Latest records</span>
          </div>
          <div className="space-y-2">
            {recentLogs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center text-sm text-[#94A3B8]">
                No audit activity yet. Register an agent, create a policy, then let the external agent call the gateway.
              </div>
            ) : recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#0B1220] hover:bg-[#0D1626] transition-colors"
              >
                <div className="flex-shrink-0">
                  <DecisionBadge decision={log.decision} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#F8FAFC] font-medium truncate">
                    {log.agentName} · {log.action}
                  </div>
                  <div className="text-xs text-[#94A3B8]">
                    {log.amount} {auditAsset(log)} · {truncate(log.target)}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <RiskBadge risk={log.risk} />
                  <div className="text-xs text-[#94A3B8] mt-1">
                    {fmtTs(log.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Overview + Policy Summary */}
        <div className="space-y-4">
          <div className={`${CARD} p-5`}>
            <h2 className={`${SECTION_TITLE} mb-4`}>Risk Overview</h2>
            {riskOverview.map((r) => (
              <div key={r.label} className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#94A3B8]">{r.label}</span>
                  <span style={{ color: r.color }} className="font-semibold">
                    {r.count}
                  </span>
                </div>
                <div className="h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${r.pct}%`, backgroundColor: r.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-5`}>
            <h2 className={`${SECTION_TITLE} mb-4`}>Active Policy</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Policy</span>
                <span className="text-[#F8FAFC] font-medium">
                  {activePolicy?.name || "No active policy"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Agent</span>
                <span className="text-[#F8FAFC]">{activePolicyAgent?.name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Max Tx</span>
                <span className="text-[#F8FAFC]">{activePolicy ? `${activePolicy.maxTransaction} CSPR` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Daily Limit</span>
                <span className="text-[#F8FAFC]">{activePolicy ? `${activePolicy.dailyLimit} CSPR` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Risk Mode</span>
                <span className="text-[#F59E0B] font-medium">{activePolicy?.riskMode || "—"}</span>
              </div>
              <div className="pt-2 border-t border-[#1E293B] flex justify-between">
                <span className="text-[#94A3B8]">Status</span>
                <StatusBadge status={activePolicy?.status || "Inactive"} />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Agent Shield Page
// ──────────────────────────────────────────────────────────

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
  const activeAgents = agents.filter((agent) => agent.status === "Active");
  const coverages = activeAgents.map((agent) => calculateSecurityCoverage(agent, getActivePolicy(policies, agent.id), auditLogs.filter((log) => log.agentId === agent.id)));
  const averageCoverage = coverages.length ? Math.round(coverages.reduce((sum, item) => sum + item.score, 0) / coverages.length) : 0;
  const latestLog = auditLogs[0];
  const protectionControls = PROTECTION_MODULE_CATALOG.flatMap((area) => area.controls);
  const statusCounts = protectionControls.reduce<Record<string, number>>((acc, control) => {
    acc[control.status] = (acc[control.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#22C55E]">
            <ShieldCheck size={13} /> Agent Shield Live
          </div>
          <h1 className="mt-3 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Agent Shield</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#94A3B8]">
            The live pre-execution protection system for autonomous blockchain agents. Agent Shield authenticates the agent, loads its configuration and policy, runs relevant checks, returns Allowed / Blocked / Review Required, stores the audit record, and submits a Casper decision proof.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => onNavigate("intent-playground")}><Send size={16} /> Test Intent</Btn>
          <Btn variant="primary" onClick={() => onNavigate("connected-agents")}><Plus size={16} /> Register Agent</Btn>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Connected Agents", agents.length, Bot],
          ["Active Policies", policies.filter((policy) => policy.status === "Active").length, FileText],
          ["Average Coverage", `${averageCoverage}%`, ShieldCheck],
          ["Decisions", auditLogs.length, Activity],
          ["Gateway", apiOnline ? "Online" : "Unavailable", Server],
        ].map(([label, value, Icon]) => {
          const MetricIcon = Icon as typeof Bot;
          return (
            <div key={String(label)} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{String(value)}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{String(label)}</div>
                </div>
                <MetricIcon size={18} className="text-[#22D3EE]" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className={`${CARD_GLOW} p-5`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className={SECTION_TITLE}>Security Pipeline</h2>
              <p className="mt-1 text-sm text-[#94A3B8]">Every intent follows this deterministic flow. Only relevant checks are evaluated.</p>
            </div>
            {latestLog && <DecisionBadge decision={latestLog.decision} />}
          </div>
          <div className="mt-5">
            <PipelineTimeline stages={latestLog?.pipelineStages} />
          </div>
        </div>

        <div className={`${CARD_GLOW} p-5`}>
          <h2 className={SECTION_TITLE}>Current Protection Status</h2>
          <p className="mt-1 text-sm text-[#94A3B8]">Statuses reflect actual backend enforcement, foundation work, and roadmap state.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(["Live", "Foundation Available", "Preview", "Planned"] as const).map((status) => (
              <div key={status} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-3">
                <StatusBadge status={status} />
                <div className="mt-2 text-2xl font-bold text-[#F8FAFC]">{statusCounts[status] || 0}</div>
                <div className="mt-1 text-xs text-[#94A3B8]">security controls</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-3 text-xs leading-relaxed text-[#94A3B8]">
            A module marked unavailable in an audit finding did not contribute a pass result. Planned and Preview modules never silently authorize execution.
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className={SECTION_TITLE}>Agent Shield Protection Areas</h2>
          <p className="mt-1 text-sm text-[#94A3B8]">Eight coherent areas keep the product clear. Each area reveals only the controls relevant to an agent’s execution capabilities.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {PROTECTION_MODULE_CATALOG.map((area) => {
            const live = area.controls.filter((control) => control.status === "Live").length;
            const foundation = area.controls.filter((control) => control.status === "Foundation Available").length;
            const planned = area.controls.filter((control) => control.status === "Planned").length;
            return (
              <div key={area.id} className={`${CARD} flex flex-col p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/10 p-2.5 text-[#22D3EE]"><Shield size={20} /></div>
                  <div className="text-right text-[11px] text-[#94A3B8]">{live} Live · {foundation} Foundation · {planned} Planned</div>
                </div>
                <h3 className="mt-4 text-lg font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{area.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{area.description}</p>
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">Relevant capabilities</div>
                  <CapabilityChips capabilities={area.capabilities} compact />
                </div>
                <div className="mt-4 space-y-2 border-t border-[#1E293B] pt-4">
                  {area.controls.map((control) => (
                    <div key={control.id} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-[#F8FAFC]">{control.name}</div>
                          <div className="mt-1 text-[11px] leading-relaxed text-[#94A3B8]">{control.description}</div>
                        </div>
                        <StatusBadge status={control.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}


function AgentRegistrationWizard({
  open,
  policies,
  onClose,
  onRegisterAgent,
  onCreatePolicy,
  onCreated,
}: {
  open: boolean;
  policies: Policy[];
  onClose: () => void;
  onRegisterAgent: (agent: AgentRegistrationDraft) => Promise<Agent | undefined> | Agent | undefined;
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onCreated: (agent: Agent) => void;
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settlementResult, setSettlementResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [createdAgent, setCreatedAgent] = useState<Agent | null>(null);
  const [copied, setCopied] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    purpose: "",
    permissionLevel: "Limited Execution" as PermissionLevel,
    executionCapabilities: ["Trading"] as ExecutionCapability[],
    policyMode: "recommended" as "recommended" | "existing" | "custom",
    templateType: "Conservative Trading",
    existingPolicyId: "",
    policyName: "Conservative Trading Policy",
    maxTransaction: 25,
    dailyLimit: 100,
    approvalThreshold: 15,
    trustedContractsText: "",
    blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update", "Bridge"] as string[],
    riskMode: "Conservative" as RiskMode,
  });

  const steps = ["Agent Details", "Capabilities", "Protection", "Starter Policy", "Review", "Quick Start"];
  const capabilities = normalizeCapabilities(draft.executionCapabilities);
  const modules = recommendedModules(capabilities);
  const selectedExistingPolicy = policies.find((policy) => policy.id === draft.existingPolicyId);

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

  const canContinue = step === 1
    ? Boolean(draft.name.trim() && draft.purpose.trim())
    : step === 2
      ? capabilities.length > 0
      : step === 4
        ? draft.policyMode === "existing"
          ? Boolean(selectedExistingPolicy)
          : Boolean(draft.policyName.trim() && draft.maxTransaction > 0 && draft.dailyLimit > 0 && draft.approvalThreshold >= 0)
        : true;

  const closeWizard = useCallback(() => {
    if (step === 6) {
      setStep(1);
      setCreatedAgent(null);
      setError("");
      setCopied("");
      setDraft({
        name: "",
        purpose: "",
        permissionLevel: "Limited Execution",
        executionCapabilities: ["Trading"],
        policyMode: "recommended",
        templateType: "Conservative Trading",
        existingPolicyId: "",
        policyName: "Conservative Trading Policy",
        maxTransaction: 25,
        dailyLimit: 100,
        approvalThreshold: 15,
        trustedContractsText: "",
        blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update", "Bridge"],
        riskMode: "Conservative",
      });
    }
    onClose();
  }, [onClose, step]);

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
        },
        onboardingStatus: "complete",
      });
      if (!agent) throw new Error("The agent could not be registered.");

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

      const sourceRules: Record<string, unknown> = policyValues.structuredRules || {};

      const policy = await onCreatePolicy({
        ...policyValues,
        agentId: agent.id,
        status: "Active",
        capabilityScope: capabilities,
        structuredRules: {
          ...sourceRules,
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
          tokenPermissionControlsEnabled: typeof sourceRules.tokenPermissionControlsEnabled === "boolean" ? sourceRules.tokenPermissionControlsEnabled : capabilities.some((item) => ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item)),
          tokenPermissionMode: typeof sourceRules.tokenPermissionMode === "string" ? sourceRules.tokenPermissionMode : "Review",
          tokenPermissionUnknownSpenderAction: typeof sourceRules.tokenPermissionUnknownSpenderAction === "string" ? sourceRules.tokenPermissionUnknownSpenderAction : "Review",
          tokenPermissionUnlimitedApprovalAction: typeof sourceRules.tokenPermissionUnlimitedApprovalAction === "string" ? sourceRules.tokenPermissionUnlimitedApprovalAction : "Block",
          tokenPermissionMaxApprovalAmount: typeof sourceRules.tokenPermissionMaxApprovalAmount === "number" ? sourceRules.tokenPermissionMaxApprovalAmount : Number(policyValues.maxTransaction) || 100,
          tokenPermissionMaxApprovalToTransactionRatio: typeof sourceRules.tokenPermissionMaxApprovalToTransactionRatio === "number" ? sourceRules.tokenPermissionMaxApprovalToTransactionRatio : 1.25,
          tokenPermissionMaxLifetimeSeconds: typeof sourceRules.tokenPermissionMaxLifetimeSeconds === "number" ? sourceRules.tokenPermissionMaxLifetimeSeconds : 3600,
          tokenPermissionRequireExpiry: typeof sourceRules.tokenPermissionRequireExpiry === "boolean" ? sourceRules.tokenPermissionRequireExpiry : true,
          tokenPermissionRequireAllowanceReset: typeof sourceRules.tokenPermissionRequireAllowanceReset === "boolean" ? sourceRules.tokenPermissionRequireAllowanceReset : true,
          tokenPermissionApprovedSpenders: Array.isArray(sourceRules.tokenPermissionApprovedSpenders) ? sourceRules.tokenPermissionApprovedSpenders : [],
          tokenPermissionBlockedSpenders: Array.isArray(sourceRules.tokenPermissionBlockedSpenders) ? sourceRules.tokenPermissionBlockedSpenders : [],
          tokenPermissionAllowNftOperatorApproval: typeof sourceRules.tokenPermissionAllowNftOperatorApproval === "boolean" ? sourceRules.tokenPermissionAllowNftOperatorApproval : false,
          tokenPermissionAllowBatchApproval: typeof sourceRules.tokenPermissionAllowBatchApproval === "boolean" ? sourceRules.tokenPermissionAllowBatchApproval : false,
          tokenPermissionRequireChainBinding: typeof sourceRules.tokenPermissionRequireChainBinding === "boolean" ? sourceRules.tokenPermissionRequireChainBinding : true,
          tokenPermissionRequireNonce: typeof sourceRules.tokenPermissionRequireNonce === "boolean" ? sourceRules.tokenPermissionRequireNonce : true,
          tokenPermissionMaximumBatchSize: typeof sourceRules.tokenPermissionMaximumBatchSize === "number" ? sourceRules.tokenPermissionMaximumBatchSize : 10,
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
          enforcedFields: ["maxTransaction", "dailyLimit", "approvalThreshold", "approvalWorkflowEnabled", "approvalWorkflowMode", "approvalRequiredCount", "approvalExpiryMinutes", "approvalAllowOwnerFallback", "approvalSeparationOfDuties", "approvalRequireRejectComment", "approvalApproverWallets", "tokenPermissionControlsEnabled", "tokenPermissionMode", "tokenPermissionUnknownSpenderAction", "tokenPermissionUnlimitedApprovalAction", "tokenPermissionMaxApprovalAmount", "tokenPermissionMaxApprovalToTransactionRatio", "tokenPermissionMaxLifetimeSeconds", "tokenPermissionRequireExpiry", "tokenPermissionRequireAllowanceReset", "tokenPermissionApprovedSpenders", "tokenPermissionBlockedSpenders", "tokenPermissionAllowNftOperatorApproval", "tokenPermissionAllowBatchApproval", "tokenPermissionRequireChainBinding", "tokenPermissionRequireNonce", "tokenPermissionMaximumBatchSize", "trustedContracts", "blockedActions", "riskMode", "threatIntelligenceMode", "threatIntelligenceMinConfidence", "threatIntelligenceUnavailableAction", "oracleValidationMode", "oracleValidationMaxAgeSeconds", "oracleValidationMaxDeviationBps", "oracleValidationMaxSourceSpreadBps", "oracleValidationMinConfidence", "oracleValidationMinSources", "oracleValidationUnavailableAction", "bridgeControlMode", "bridgeControlUnavailableAction", "bridgeAllowedProviders", "bridgeAllowedSourceChains", "bridgeAllowedDestinationChains", "bridgeBlockedDestinationChains", "bridgeAllowedAssets", "bridgeMaxAmount", "bridgeMaxFeeBps", "bridgeMaxQuoteAgeSeconds", "bridgeRequireQuoteExpiry", "bridgeMinSourceConfirmations", "bridgeMinDestinationConfirmations", "x402ControlsEnabled", "x402ControlMode", "x402UnavailableAction", "x402AllowedVersions", "x402AllowedSchemes", "x402AllowedMethods", "x402AllowedNetworks", "x402AllowedAssets", "x402AssetDecimals", "x402AllowedFacilitators", "x402AllowedMerchants", "x402BlockedMerchants", "x402AllowedRecipients", "x402MaxPayment", "x402DailyLimit", "x402MonthlyLimit", "x402ReviewThreshold", "x402MaxPaymentsPerHour", "x402MaxAuthorizationLifetimeSeconds", "x402RequireHttps", "x402RequirePaymentRequiredHash", "x402RequireBodyHashForUnsafeMethods", "x402RequireRequestId", "x402RequireClientFingerprint", "x402PreventAmbiguousRetry", "x402MaxSettlementAttempts", "complianceControlsEnabled", "complianceControlMode", "complianceUnavailableAction", "complianceRequiredActions", "complianceRequireOriginatorAttestation", "complianceRequireBeneficiaryAttestation", "complianceRequireTravelRule", "complianceTravelRuleThreshold", "complianceRequireSanctionsScreening", "complianceAllowedJurisdictions", "complianceBlockedJurisdictions", "complianceReviewJurisdictions", "complianceAllowedCounterpartyTypes", "complianceAcceptedProviders", "complianceMaxAttestationAgeSeconds", "complianceMaxScreeningAgeSeconds", "complianceMaximumRiskRating"],
          configurationOnly: [],
        },
      });
      if (!policy) {
        setError("The agent was registered, but the starter policy could not be created. Create a policy from the Policies page before sending intents.");
      }
      setCreatedAgent(agent);
      onCreated(agent);
      setStep(6);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete agent registration.");
    } finally {
      setSubmitting(false);
    }
  }, [capabilities, draft, modules, onCreatePolicy, onCreated, onRegisterAgent, selectedExistingPolicy]);

  const copyValue = useCallback(async (label: string, value: string) => {
    if (!value) return;
    const ok = await writeClipboard(value);
    setCopied(ok ? label : "failed");
    setTimeout(() => setCopied(""), 1500);
  }, []);

  if (!open) return null;

  const gatewayUrl = `${api.baseUrl}/api/agent-gateway/intents`;
  const verifyUrl = `${api.baseUrl}/api/agent-gateway/me`;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="absolute inset-0 bg-black/70" />
      <div className={`${CARD_GLOW} relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden`}>
        <div className="border-b border-[#1E293B] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Guided Onboarding</div>
              <h2 className="mt-1 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Register and protect an external agent</h2>
              <p className="mt-1 text-sm text-[#94A3B8]">Configure identity, execution capabilities, protection, policy, and integration credentials.</p>
            </div>
            <button type="button" onClick={closeWizard} className="rounded-lg p-2 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]" aria-label="Close registration wizard"><X size={18} /></button>
          </div>
          <div className="mt-5 grid grid-cols-6 gap-2">
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
          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
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
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {module.controls.filter((control) => control.status !== "Planned").map((control) => (
                        <span key={control.id} className="inline-flex items-center gap-1.5 rounded-full border border-[#1E293B] bg-[#050B14] px-2.5 py-1 text-[10px] text-[#CBD5E1]">
                          {control.name}<StatusBadge status={control.status} />
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] text-[#64748B]">{module.configurable ? "Configuration available through policy fields." : "No live configuration is exposed yet."}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
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
                    Enforced now: maximum transaction, daily limit, review threshold, blocked actions, trusted targets, risk mode, wallet validation, contract validation, and deterministic execution preflight. Token Approval & Permit Safety is recommended for agents that can trade, manage wallets or treasuries, interact with dApps, or automate enterprise execution; its provider-agnostic Foundation rules start in Review mode with bounded amounts, short lifetimes, spender policy, and replay binding. Threat Intelligence, Oracle Validation, Bridge Controls, and Compliance Controls Foundation rules are also added in Review mode. External feeds, current non-sensitive compliance evidence, and complete provider-supplied bridge metadata are still required for operational checks. Policy-specific maximum slippage, full stateful simulation, provider solvency, cross-chain delivery verification, and legal compliance guarantees are not represented as Live.
                  </div>
                </>
              )}
            </div>
          )}

          {step === 5 && (
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

          {step === 6 && createdAgent && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[#22C55E]/30 bg-[#22C55E]/10 p-4">
                <div className="flex items-start gap-3"><CheckCircle size={22} className="flex-shrink-0 text-[#22C55E]" /><div><h3 className="font-bold text-[#F8FAFC]">Agent registration complete</h3><p className="mt-1 text-sm text-[#BBF7D0]">Copy the raw API key now. Magen3 stores only its hash and preview after this session.</p></div></div>
              </div>
              {error && <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-sm text-[#F59E0B]">{error}</div>}
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Agent ID", createdAgent.id],
                  ["API Key", createdAgent.apiKey || "Not available—rotate from Credentials"],
                  ["Gateway URL", gatewayUrl],
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

          {error && step !== 6 && <div className="mt-5 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{error}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#1E293B] p-4 sm:px-6">
          <Btn variant="secondary" onClick={() => step > 1 && step < 6 ? setStep((current) => current - 1) : closeWizard()} disabled={submitting}>{step > 1 && step < 6 ? "Back" : step === 6 ? "Close" : "Cancel"}</Btn>
          {step < 5 && <Btn variant="primary" onClick={() => setStep((current) => current + 1)} disabled={!canContinue}><ArrowRight size={15} /> Next</Btn>}
          {step === 5 && <Btn variant="primary" onClick={createAgentAndPolicy} disabled={submitting || !canContinue}>{submitting ? "Creating…" : "Create Agent and Policy"}</Btn>}
          {step === 6 && <Btn variant="primary" onClick={closeWizard}>Open Agent Control Center</Btn>}
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
  onCreatePolicy,
  onNavigate,
  auditLogs,
  walletAddress,
  apiOnline,
}: {
  agents: Agent[];
  policies: Policy[];
  onRegisterAgent: (agent: AgentRegistrationDraft) => Promise<Agent | undefined> | Agent | undefined;
  onRotateAgentApiKey: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  onRevokeAgent: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onNavigate: (page: Page) => void;
  auditLogs: AuditLog[];
  walletAddress: string;
  apiOnline: boolean;
}) {
  const [latestCredentials, setLatestCredentials] = useState<Agent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [copied, setCopied] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Revoked" | "No Policy">("All");
  const [policyFilter, setPolicyFilter] = useState("All");
  const [activeTab, setActiveTab] = useState<"overview" | "integration" | "activity" | "security">("overview");
  const [skillTarget, setSkillTarget] = useState<"Claude" | "Codex" | "Custom Agent" | ".env" | "API Snippet">("Claude");

  const gatewayUrl = `${api.baseUrl}/api/agent-gateway/intents`;
  const gatewayVerifyUrl = `${api.baseUrl}/api/agent-gateway/me`;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];
  const selectedPolicy = selectedAgent ? getActivePolicy(policies, selectedAgent.id) : undefined;

  useEffect(() => {
    if (!selectedAgentId && agents[0]?.id) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

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

  const integrationSnippet = useCallback((agent: Agent, apiKeyValue?: string) => `const agentId = "${agent.id}";
const agentApiKey = process.env.MAGEN3_AGENT_KEY || "${apiKeyValue || "PASTE_AGENT_API_KEY_ONCE"}";
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
  throw new Error(decision.result?.reason || "Magen3 did not approve execution");
}
// Only after this should the external agent request the execution wallet signature.`, [gatewayUrl, gatewayVerifyUrl]);

  const envTemplate = useCallback((agent: Agent, apiKeyValue?: string) => `MAGEN3_AGENT_ID=${agent.id}
MAGEN3_AGENT_KEY=${apiKeyValue || "PASTE_AGENT_API_KEY_ONCE_OR_ROTATE_KEY_IN_MAGEN3"}
MAGEN3_GATEWAY_URL=${gatewayUrl}
MAGEN3_VERIFY_URL=${gatewayVerifyUrl}
MAGEN3_AGENT_NAME="${agent.name}"
`, [gatewayUrl, gatewayVerifyUrl]);

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
- API key env var: MAGEN3_AGENT_KEY
- API key preview: ${agent.apiKeyPreview || "shown once after registration or rotation"}
- Gateway verify URL: ${gatewayVerifyUrl}?agentId=${agent.id}
- Gateway intent URL: ${gatewayUrl}

## Rules
1. Never execute a Web3 action before asking Magen3.
2. Identify with Agent ID and the Magen3 API key.
3. Treat the wallet connected inside the external agent as the execution wallet.
4. The execution wallet does not need to match the Magen3 owner/admin wallet.
5. If Magen3 returns Allowed, request the execution wallet signature.
6. If Magen3 returns Blocked, stop.
7. If Magen3 returns Review Required, pause for human/admin approval.
8. After real execution, send the real Casper deploy hash back to Magen3 audit.

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

Store the raw API key securely. ${apiKeyValue ? `Current one-time key: ${apiKeyValue}` : "If the raw API key is no longer visible, rotate the key in Magen3 Connected Agents."}

## Environment
\`\`\`env
${envTemplate(agent, apiKeyValue).trim()}
\`\`\`

## JavaScript Fetch Example
\`\`\`js
${snippet}
\`\`\`
`;
  }, [envTemplate, gatewayUrl, gatewayVerifyUrl]);

  const rotateKey = useCallback(async (agentId: string) => {
    const rotated = await onRotateAgentApiKey(agentId);
    if (rotated) {
      setLatestCredentials(rotated);
      setSelectedAgentId(rotated.id);
    }
  }, [onRotateAgentApiKey]);

  const revokeAgent = useCallback(async (agentId: string) => {
    const revoked = await onRevokeAgent(agentId);
    if (revoked) {
      setLatestCredentials(null);
    }
  }, [onRevokeAgent]);

  const allAgentAuditLogs = selectedAgent
    ? auditLogs.filter((log) => log.agentId === selectedAgent.id)
    : [];
  const agentAuditLogs = allAgentAuditLogs.slice(0, 5);
  const tokenPermissionRules = selectedPolicy?.structuredRules || {};
  const tokenPermissionEnabled = tokenPermissionRules.tokenPermissionControlsEnabled === true;
  const tokenPermissionApprovedSpenders = Array.isArray(tokenPermissionRules.tokenPermissionApprovedSpenders) ? tokenPermissionRules.tokenPermissionApprovedSpenders.map(String).filter(Boolean) : [];
  const tokenPermissionBlockedSpenders = Array.isArray(tokenPermissionRules.tokenPermissionBlockedSpenders) ? tokenPermissionRules.tokenPermissionBlockedSpenders.map(String).filter(Boolean) : [];
  const tokenPermissionLogs = allAgentAuditLogs.filter((log) => Boolean(auditTokenPermission(log)) || log.moduleFindings?.some((finding) => finding.module === "Token Approval & Permit Safety"));
  const recentTokenPermissionFindings = tokenPermissionLogs.flatMap((log) => (log.moduleFindings || []).filter((finding) => finding.module === "Token Approval & Permit Safety").map((finding) => ({ log, finding }))).slice(0, 4);
  const scopedAgentIds = new Set(agents.map((agent) => agent.id));
  const scopedAuditLogs = auditLogs.filter((log) => scopedAgentIds.has(log.agentId));
  const today = new Date();
  const requestsToday = scopedAuditLogs.filter((log) => isSameDay(new Date(log.timestamp), today)).length;
  const agentMetrics = [
    { label: "Active Agents", value: agents.filter((agent) => agent.status === "Active").length, icon: Bot },
    { label: "Revoked Agents", value: agents.filter((agent) => agent.status === "Revoked").length, icon: ShieldX },
    { label: "Requests Today", value: requestsToday, icon: Activity },
    { label: "Allowed", value: scopedAuditLogs.filter((log) => log.decision === "Allowed").length, icon: CheckCircle },
    { label: "Review Required", value: scopedAuditLogs.filter((log) => log.decision === "Review Required").length, icon: Clock },
    { label: "Blocked", value: scopedAuditLogs.filter((log) => log.decision === "Blocked").length, icon: XCircle },
  ];
  const filteredAgents = agents.filter((agent) => {
    const policy = getActivePolicy(policies, agent.id);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
            Connected Agents
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1 max-w-3xl">
            Register external agents that are allowed to call Magen3. Agent identity is Agent ID plus API key; the execution wallet is submitted later by the external agent and can be any Casper Wallet.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-semibold text-[#22D3EE]">
              <ShieldCheck size={13} /> Casper Testnet
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              apiOnline
                ? "border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]"
                : "border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#F59E0B]"
            }`}>
              <Server size={13} /> {apiOnline ? "Gateway Live" : "Gateway Unavailable"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-semibold text-[#22D3EE]">
              <Lock size={13} /> Wallet Scoped
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2 text-xs text-[#94A3B8]">
            Owner wallet: <span className="font-mono text-[#F8FAFC]">{truncate(walletAddress, 22)}</span>
          </div>
          <Btn variant="primary" onClick={() => setShowRegister(true)}>
            <Plus size={16} /> Register Agent
          </Btn>
        </div>
      </div>

      {latestCredentials?.apiKey && (
        <div className={`${CARD_GLOW} p-5 border-[#22C55E]/30`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-2.5 py-1 text-xs font-semibold text-[#22C55E] mb-3">
                <CheckCircle size={13} /> External Agent Registered
              </div>
              <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
                New API key generated
              </h2>
              <p className="text-sm text-[#94A3B8] mt-1">
                This is the only time Magen3 can show the full raw key. Copy it into the external agent now; after refresh, only the preview remains.
              </p>
            </div>
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => copyText("all details", `Agent ID: ${latestCredentials.id}\nGateway URL: ${gatewayUrl}\nVerify URL: ${gatewayVerifyUrl}?agentId=${latestCredentials.id}\nAPI Key: ${latestCredentials.apiKey}`)}
            >
              <Copy size={14} /> {copied === "all details" ? "Copied" : "Copy Details"}
            </Btn>
          </div>
          <div className="mt-4 grid lg:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              ["Agent ID", latestCredentials.id],
              ["Gateway URL", gatewayUrl],
              ["Verify URL", `${gatewayVerifyUrl}?agentId=${latestCredentials.id}`],
              ["API Key", latestCredentials.apiKey],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wider text-[#94A3B8]">{label}</span>
                  <button
                    type="button"
                    aria-label={`Copy ${label}`}
                    className="text-[#22D3EE] hover:text-[#F8FAFC]"
                    onClick={() => copyText(label, value)}
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
              </div>
            ))}
          </div>
          {copied === "copy failed" && (
            <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">
              Copy was blocked by the browser. Select the key text and copy it manually.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {agentMetrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className={`${CARD} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{metric.value}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{metric.label}</div>
                </div>
                <div className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-2 text-[#22D3EE]">
                  <Icon size={17} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid xl:grid-cols-[minmax(360px,0.95fr)_1.35fr] gap-6">
        <div className={`${CARD} overflow-hidden`}>
          <div className="border-b border-[#1E293B] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className={SECTION_TITLE}>Agents</h2>
              <span className="rounded-full bg-[#0B1220] px-2.5 py-1 text-xs text-[#94A3B8]">
                {filteredAgents.length}/{agents.length}
              </span>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input
                className={`${INPUT_CLS} pl-9`}
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                placeholder="Search by name, ID, or capability"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["All", "Active", "Revoked", "No Policy"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    statusFilter === status
                      ? "bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30"
                      : "bg-[#0B1220] text-[#94A3B8] border border-[#1E293B] hover:text-[#F8FAFC]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#0B1220] px-3 py-2">
              <Filter size={14} className="text-[#94A3B8]" />
              <select
                className="min-w-0 flex-1 bg-transparent text-xs text-[#F8FAFC] outline-none"
                value={policyFilter}
                onChange={(e) => setPolicyFilter(e.target.value)}
              >
                <option className="bg-[#0B1220]" value="All">All policies</option>
                {policies
                  .filter((policy) => policy.status === "Active")
                  .map((policy) => (
                    <option className="bg-[#0B1220]" key={policy.id} value={policy.id}>
                      {policy.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="max-h-[620px] overflow-y-auto p-3 space-y-2">
            {filteredAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center">
                <Bot size={28} className="mx-auto mb-3 text-[#94A3B8]" />
                <p className="text-sm text-[#94A3B8]">No agents match this view.</p>
              </div>
            ) : filteredAgents.map((agent) => {
              const assignedPolicy = getActivePolicy(policies, agent.id);
              const agentLogs = auditLogs.filter((log) => log.agentId === agent.id);
              const latestLog = agentLogs[0];
              const coverage = calculateSecurityCoverage(agent, assignedPolicy, agentLogs);
              const active = selectedAgent?.id === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgentId(agent.id);
                    setActiveTab("overview");
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    active
                      ? "border-[#22D3EE]/40 bg-[#22D3EE]/10"
                      : "border-[#1E293B] bg-[#0B1220] hover:border-[#334155]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-[#F8FAFC] font-['Space_Grotesk']">{agent.name}</h3>
                        <StatusBadge status={agent.status} />
                      </div>
                      <div className="mt-1 truncate text-xs text-[#94A3B8]">{agent.id}</div>
                    </div>
                    <StatusBadge status={assignedPolicy ? "Active" : "Inactive"} />
                  </div>
                  <div className="mt-3"><CapabilityChips capabilities={normalizeCapabilities(agent.executionCapabilities, agent.type)} compact /></div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-[#050B14] p-2">
                      <div className="text-[#94A3B8]">Security Coverage</div>
                      <div className="truncate font-semibold text-[#F8FAFC]">{coverage.score}%</div>
                    </div>
                    <div className="rounded-lg bg-[#050B14] p-2">
                      <div className="text-[#94A3B8]">Last Decision</div>
                      <div className="truncate text-[#F8FAFC]">{latestLog?.decision || "None"}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${CARD_GLOW} p-5 min-h-[520px]`}>
          {!selectedAgent ? (
            <EmptyState
              title="Select an agent"
              description="Choose a connected agent to view integration details, API status, audit activity, and the agent skill kit."
              action={<Btn variant="primary" onClick={() => setShowRegister(true)}><Plus size={16} /> Register Agent</Btn>}
            />
          ) : (() => {
            const latestLog = auditLogs.find((log) => log.agentId === selectedAgent.id);
            const rawKey = latestCredentials?.id === selectedAgent.id
              ? latestCredentials.apiKey
              : selectedAgent.apiKey;
            const snippet = integrationSnippet(selectedAgent, rawKey);
            const skill = agentSkillKit(selectedAgent, rawKey, skillTarget, snippet);
            const skillFilename =
              skillTarget === ".env"
                ? `magen3-${selectedAgent.id.toLowerCase()}.env`
                : skillTarget === "API Snippet"
                ? `magen3-${selectedAgent.id.toLowerCase()}-gateway.js`
                : "SKILL.md";
            const detailTabs = [
              { id: "overview", label: "Overview", icon: Eye },
              { id: "integration", label: "Integration", icon: Code2 },
              { id: "activity", label: "Activity", icon: Activity },
              { id: "security", label: "Credentials", icon: Lock },
            ] as const;
            return (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{selectedAgent.name}</h2>
                      <StatusBadge status={selectedAgent.status} />
                      <StatusBadge status={selectedPolicy ? "Active" : "Inactive"} />
                    </div>
                    <p className="text-sm text-[#94A3B8]">{selectedAgent.purpose || "No purpose added yet."}</p>
                    <div className="mt-2 text-xs text-[#94A3B8]">{selectedAgent.permissionLevel}</div>
                    <div className="mt-3"><CapabilityChips capabilities={normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type)} /></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="secondary" size="sm" onClick={() => copyText("agent id", selectedAgent.id)}>
                      <Copy size={14} /> {copied === "agent id" ? "Copied" : "Copy Agent ID"}
                    </Btn>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-b border-[#1E293B] pb-3">
                  {detailTabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                          activeTab === tab.id
                            ? "border-[#22D3EE]/40 bg-[#22D3EE]/10 text-[#22D3EE]"
                            : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8] hover:text-[#F8FAFC]"
                        }`}
                      >
                        <Icon size={14} /> {tab.label}
                      </button>
                    );
                  })}
                </div>

                {activeTab === "overview" && (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <CoverageCard agent={selectedAgent} policy={selectedPolicy} logs={auditLogs.filter((log) => log.agentId === selectedAgent.id)} onNavigate={onNavigate} />
                      <IntegrationHealthPanel agent={selectedAgent} policy={selectedPolicy} logs={auditLogs.filter((log) => log.agentId === selectedAgent.id)} apiOnline={apiOnline} />
                    </div>
                    <AgentInsightsPanel agent={selectedAgent} logs={auditLogs} />
                    <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><h3 className="text-sm font-semibold text-[#F8FAFC]">Execution Capabilities</h3><p className="mt-1 text-xs text-[#94A3B8]">Capabilities shape recommendations and relevant module coverage; the active policy remains the authorization source.</p></div>
                        <Btn variant="secondary" size="sm" onClick={() => onNavigate("policies")}><FileText size={14} /> Manage Policy</Btn>
                      </div>
                      <div className="mt-3"><CapabilityChips capabilities={normalizeCapabilities(selectedAgent.executionCapabilities, selectedAgent.type)} /></div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      {[
                        ["Agent ID", selectedAgent.id],
                        ["Agent Type", selectedAgent.type],
                        ["Wallet Owner", selectedAgent.ownerWalletAddress || walletAddress || "Unknown"],
                        ["Assigned Policy", selectedPolicy?.name || "No active policy"],
                        ["Last Request", latestLog ? fmtTs(latestLog.timestamp) : "No requests yet"],
                        ["Last Decision", latestLog?.decision || "No decision yet"],
                        ["API Key", selectedAgent.apiKeyPreview ? selectedAgent.apiKeyPreview : "Rotate key to issue"],
                        ["Created", fmtTs(selectedAgent.createdAt)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                          <div className="text-xs uppercase tracking-wider text-[#94A3B8]">{label}</div>
                          <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">How this agent is identified</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                        Magen3 identifies this external agent with Agent ID plus API key. The Casper wallet supplied in each gateway request is the execution wallet and does not need to match the owner wallet that registered this agent.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "integration" && (
                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-3">
                      {[
                        ["Gateway URL", gatewayUrl],
                        ["Verify URL", `${gatewayVerifyUrl}?agentId=${selectedAgent.id}`],
                        ["Agent ID", selectedAgent.id],
                        ["API Key", rawKey || selectedAgent.apiKeyPreview || "Rotate key to issue"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs uppercase tracking-wider text-[#94A3B8]">{label}</span>
                            <button
                              type="button"
                              aria-label={`Copy ${label}`}
                              className="text-[#22D3EE] hover:text-[#F8FAFC]"
                              onClick={() => copyText(label, value)}
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                          <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
                          {label === "API Key" && !rawKey && selectedAgent.apiKeyPreview && (
                            <div className="mt-2 text-[11px] leading-relaxed text-[#94A3B8]">
                              This is only the stored preview. Rotate the key to generate a new full key.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-[#22D3EE]/20 bg-[#050B14] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-semibold text-[#22D3EE] mb-3">
                            <Code2 size={13} /> Agent Skill Kit
                          </div>
                          <h3 className="text-sm font-semibold text-[#F8FAFC]">Export instructions for external AI tools</h3>
                          <p className="text-xs text-[#94A3B8] mt-1 max-w-2xl">
                            Give Claude, Codex, YieldBot AI, or a custom agent the exact rules for calling Magen3 before wallet signing. Agent identity is Agent ID plus API key; the execution wallet is supplied by the external agent.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Btn variant="outline" size="sm" onClick={() => copyText("agent skill", skill)}>
                            <Copy size={14} /> {copied === "agent skill" ? "Copied" : `Copy ${skillTarget}`}
                          </Btn>
                          <Btn variant="secondary" size="sm" onClick={() => downloadText(skillFilename, skill)}>
                            <FileText size={14} /> Download {skillFilename}
                          </Btn>
                        </div>
                      </div>
                      <div className="mb-4 flex flex-wrap gap-2">
                        {(["Claude", "Codex", "Custom Agent", ".env", "API Snippet"] as const).map((target) => (
                          <button
                            key={target}
                            onClick={() => setSkillTarget(target)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              skillTarget === target
                                ? "bg-[#22D3EE]/10 text-[#22D3EE] border border-[#22D3EE]/30"
                                : "bg-[#0B1220] text-[#94A3B8] border border-[#1E293B] hover:text-[#F8FAFC]"
                            }`}
                          >
                            {target}
                          </button>
                        ))}
                      </div>
                      <div className="mb-4 grid md:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                          <div className="text-[#94A3B8] uppercase tracking-wider">Use in</div>
                          <div className="mt-1 text-[#F8FAFC]">
                            {skillTarget === "Claude" ? "Claude Project / chat" : skillTarget === "Codex" ? "Codex SKILL.md" : skillTarget === "Custom Agent" ? "System instructions" : skillTarget === ".env" ? "Agent secrets" : "Agent source code"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                          <div className="text-[#94A3B8] uppercase tracking-wider">Policy status</div>
                          <div className="mt-1 text-[#F8FAFC]">{selectedPolicy?.name || "No active policy assigned"}</div>
                        </div>
                        <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                          <div className="text-[#94A3B8] uppercase tracking-wider">API key</div>
                          <div className="mt-1 text-[#F8FAFC]">{rawKey ? "Full key included" : "Preview only"}</div>
                        </div>
                      </div>
                      {copied === "copy failed" && (
                        <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">
                          Copy was blocked by the browser. Select the text and copy it manually.
                        </div>
                      )}
                      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#020617] p-4 text-xs leading-relaxed text-[#94A3B8]"><code>{skill}</code></pre>
                    </div>
                  </div>
                )}

                {activeTab === "activity" && (
                  <div className="space-y-3">
                    {agentAuditLogs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-8 text-center">
                        <Activity size={28} className="mx-auto mb-3 text-[#94A3B8]" />
                        <p className="text-sm text-[#94A3B8]">No gateway activity for this agent yet.</p>
                      </div>
                    ) : agentAuditLogs.map((log) => {
                      const proof = decisionProofStatus(log);
                      const execution = executionProofStatus(log.executionStatus, log.executionTxHash);
                      return (
                        <div key={log.id} className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <DecisionBadge decision={log.decision} />
                                <RiskBadge risk={log.risk} />
                                <span className="text-xs text-[#94A3B8]">{fmtTs(log.timestamp)}</span>
                              </div>
                              <div className="mt-2 text-sm font-semibold text-[#F8FAFC]">
                                {log.action} · {log.amount} {auditAsset(log)}
                              </div>
                              <div className="mt-1 break-all text-xs text-[#94A3B8]">Target: {log.target}</div>
                              <div className="mt-2 text-xs leading-relaxed text-[#94A3B8]">{log.reason}</div>
                            </div>
                            <div className="grid min-w-[220px] gap-2 text-xs">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${proof.className}`}>
                                Decision: {proof.label}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${execution.className}`}>
                                Execution: {execution.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeTab === "security" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#F8FAFC]">API credential</h3>
                          <p className="mt-1 text-xs text-[#94A3B8]">
                            Raw API keys are shown once after registration or rotation. Magen3 stores and displays only the key preview later.
                          </p>
                          <div className="mt-3 break-all font-mono text-xs text-[#F8FAFC]">
                            {rawKey || selectedAgent.apiKeyPreview || "No active API key preview"}
                          </div>
                          {rawKey && (
                            <button
                              type="button"
                              onClick={() => copyText("raw api key", rawKey)}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-1.5 text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]"
                            >
                              <Copy size={13} /> {copied === "raw api key" ? "Copied" : "Copy Full API Key"}
                            </button>
                          )}
                          {copied === "copy failed" && (
                            <div className="mt-3 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">
                              Copy was blocked by the browser. Select the key text and copy it manually.
                            </div>
                          )}
                        </div>
                        <Btn variant="secondary" size="sm" onClick={() => rotateKey(selectedAgent.id)} disabled={selectedAgent.status === "Revoked"}>
                          <Lock size={14} /> Rotate API Key
                        </Btn>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">Policy binding</h3>
                      <p className="mt-1 text-xs text-[#94A3B8]">
                        Gateway requests use this agent identity to find the assigned active policy. The submitted execution wallet is audited separately.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={selectedPolicy ? "Active" : "No Policy"} />
                        <span className="text-sm text-[#F8FAFC]">{selectedPolicy?.name || "No active policy assigned"}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#F8FAFC]">Token Permission Controls</h3>
                            <StatusBadge status="Foundation Available" />
                            <StatusBadge status={tokenPermissionEnabled ? "Active" : "Inactive"} />
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">
                            Explicit token approval and permit metadata is checked for spender identity, bounded authority, lifetime, exact binding, and replay before execution. Raw permit signatures are never accepted.
                          </p>
                        </div>
                        <Btn variant="secondary" size="sm" onClick={() => onNavigate("policies")}>Configure Policy</Btn>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs">
                        {[
                          ["Policy mode", String(tokenPermissionRules.tokenPermissionMode || "Not configured")],
                          ["Unlimited approvals", String(tokenPermissionRules.tokenPermissionUnlimitedApprovalAction || "Not configured")],
                          ["Maximum amount", String(tokenPermissionRules.tokenPermissionMaxApprovalAmount ?? "Not configured")],
                          ["Maximum ratio", String(tokenPermissionRules.tokenPermissionMaxApprovalToTransactionRatio ?? "Not configured")],
                          ["Maximum lifetime", tokenPermissionRules.tokenPermissionMaxLifetimeSeconds ? `${String(tokenPermissionRules.tokenPermissionMaxLifetimeSeconds)} seconds` : "Not configured"],
                          ["Approved spenders", String(tokenPermissionApprovedSpenders.length)],
                          ["Blocked spenders", String(tokenPermissionBlockedSpenders.length)],
                          ["Recent decisions", String(tokenPermissionLogs.length)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg border border-[#1E293B] bg-[#050B14] p-2.5">
                            <div className="text-[#64748B]">{label}</div><div className="mt-1 break-all font-semibold text-[#F8FAFC]">{value}</div>
                          </div>
                        ))}
                      </div>
                      {(tokenPermissionApprovedSpenders.length > 0 || tokenPermissionBlockedSpenders.length > 0) && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs">
                          <div className="rounded-lg border border-[#22C55E]/20 bg-[#22C55E]/5 p-3"><div className="font-semibold text-[#BBF7D0]">Approved spenders</div><div className="mt-2 space-y-1 font-mono text-[#94A3B8]">{tokenPermissionApprovedSpenders.slice(0, 4).map((spender) => <div key={spender} className="break-all">{spender}</div>)}</div></div>
                          <div className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 p-3"><div className="font-semibold text-[#FCA5A5]">Blocked spenders</div><div className="mt-2 space-y-1 font-mono text-[#94A3B8]">{tokenPermissionBlockedSpenders.slice(0, 4).map((spender) => <div key={spender} className="break-all">{spender}</div>)}</div></div>
                        </div>
                      )}
                      {recentTokenPermissionFindings.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">Recent token-permission findings</div>
                          {recentTokenPermissionFindings.map(({ log, finding }, index) => (
                            <div key={`${log.id}-${finding.rule}-${index}`} className="rounded-lg border border-[#1E293B] bg-[#050B14] p-3 text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[#F8FAFC]">{finding.rule}</span><DecisionBadge decision={log.decision} /></div>
                              <div className="mt-1 text-[#94A3B8]">{finding.message}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#EF4444]/25 bg-[#EF4444]/5 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-[#F8FAFC]">Revoke agent access</h3>
                          <p className="mt-1 text-xs text-[#94A3B8]">
                            Revoked agents can no longer use the gateway with their Agent ID and API key.
                          </p>
                        </div>
                        <Btn variant="danger" size="sm" onClick={() => revokeAgent(selectedAgent.id)} disabled={selectedAgent.status === "Revoked"}>
                          <XCircle size={14} /> Revoke Agent
                        </Btn>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      <AgentRegistrationWizard
        open={showRegister}
        policies={policies}
        onClose={() => setShowRegister(false)}
        onRegisterAgent={onRegisterAgent}
        onCreatePolicy={onCreatePolicy}
        onCreated={(agent) => {
          setLatestCredentials(agent);
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
  return (
    <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#F8FAFC]">Policy & Approval Controls · Human Approval & Quorum</div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Turn Review Required into a controlled queue bound to the exact intent, approved wallets, quorum, and expiry. Parameter changes require a new Magen3 decision.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Approval Workflow" value={String(values.approvalWorkflowEnabled ?? "")} onChange={(value) => onChange({ approvalWorkflowEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Workflow Mode" value={String(values.approvalWorkflowMode ?? "")} onChange={(value) => onChange({ approvalWorkflowMode: value })} options={["Single", "Quorum"]} />
        <InputField label="Required Approvals" value={String(values.approvalRequiredCount ?? "")} onChange={(value) => onChange({ approvalRequiredCount: value })} type="number" />
        <InputField label="Approval Expiry (minutes)" value={String(values.approvalExpiryMinutes ?? "")} onChange={(value) => onChange({ approvalExpiryMinutes: value })} type="number" />
        <SelectField label="Owner Wallet Fallback" value={String(values.approvalAllowOwnerFallback ?? "")} onChange={(value) => onChange({ approvalAllowOwnerFallback: value })} options={["Yes", "No"]} />
        <SelectField label="Separation of Duties" value={String(values.approvalSeparationOfDuties ?? "")} onChange={(value) => onChange({ approvalSeparationOfDuties: value })} options={["Yes", "No"]} />
        <SelectField label="Require Rejection Comment" value={String(values.approvalRequireRejectComment ?? "")} onChange={(value) => onChange({ approvalRequireRejectComment: value })} options={["Yes", "No"]} />
        <div className="md:col-span-2">
          <TextareaField label="Authorized Approver Wallets (one per line)" value={String(values.approvalApproverWallets ?? "")} onChange={(value) => onChange({ approvalApproverWallets: value })} />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Current approval responses are scoped to connected Casper wallet addresses. Cryptographic approver signatures are intentionally listed as future hardening rather than claimed as implemented.</p>
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
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Bound token authority to the exact chain, token, owner, spender, amount, lifetime, nonce, and canonical fingerprint. Generic contract calls are never guessed to be approvals.</p>
        </div>
        <StatusBadge status="Foundation Available" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SelectField label="Enable Controls" value={String(values.tokenPermissionControlsEnabled ?? "")} onChange={(value) => onChange({ tokenPermissionControlsEnabled: value })} options={["Yes", "No"]} />
        <SelectField label="Policy Mode" value={String(values.tokenPermissionMode ?? "")} onChange={(value) => onChange({ tokenPermissionMode: value })} options={["Observe", "Review", "Enforce"]} />
        <SelectField label="Unknown Spender" value={String(values.tokenPermissionUnknownSpenderAction ?? "")} onChange={(value) => onChange({ tokenPermissionUnknownSpenderAction: value })} options={["Warn", "Review", "Block"]} />
        <SelectField label="Unlimited Approval" value={String(values.tokenPermissionUnlimitedApprovalAction ?? "")} onChange={(value) => onChange({ tokenPermissionUnlimitedApprovalAction: value })} options={["Warn", "Review", "Block"]} />
        <InputField label="Maximum Approval Amount" value={String(values.tokenPermissionMaxApprovalAmount ?? "")} onChange={(value) => onChange({ tokenPermissionMaxApprovalAmount: value })} type="number" />
        <InputField label="Maximum Approval Ratio" value={String(values.tokenPermissionMaxApprovalToTransactionRatio ?? "")} onChange={(value) => onChange({ tokenPermissionMaxApprovalToTransactionRatio: value })} type="number" />
        <InputField label="Maximum Lifetime (sec)" value={String(values.tokenPermissionMaxLifetimeSeconds ?? "")} onChange={(value) => onChange({ tokenPermissionMaxLifetimeSeconds: value })} type="number" />
        <TextareaField label="Approved Spenders (one per line)" value={String(values.tokenPermissionApprovedSpenders ?? "")} onChange={(value) => onChange({ tokenPermissionApprovedSpenders: value })} />
        <TextareaField label="Blocked Spenders (one per line)" value={String(values.tokenPermissionBlockedSpenders ?? "")} onChange={(value) => onChange({ tokenPermissionBlockedSpenders: value })} />
      </div>
      <details className="mt-4 rounded-lg border border-[#334155] bg-[#020617]/30 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[#CBD5E1]">Advanced permit, NFT, and batch controls</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SelectField label="Require Expiry" value={String(values.tokenPermissionRequireExpiry ?? "")} onChange={(value) => onChange({ tokenPermissionRequireExpiry: value })} options={["Yes", "No"]} />
          <SelectField label="Require Allowance Reset" value={String(values.tokenPermissionRequireAllowanceReset ?? "")} onChange={(value) => onChange({ tokenPermissionRequireAllowanceReset: value })} options={["Yes", "No"]} />
          <SelectField label="Allow NFT Operator Approval" value={String(values.tokenPermissionAllowNftOperatorApproval ?? "")} onChange={(value) => onChange({ tokenPermissionAllowNftOperatorApproval: value })} options={["Yes", "No"]} />
          <SelectField label="Allow Batch Approval" value={String(values.tokenPermissionAllowBatchApproval ?? "")} onChange={(value) => onChange({ tokenPermissionAllowBatchApproval: value })} options={["Yes", "No"]} />
          <SelectField label="Require Chain Binding" value={String(values.tokenPermissionRequireChainBinding ?? "")} onChange={(value) => onChange({ tokenPermissionRequireChainBinding: value })} options={["Yes", "No"]} />
          <SelectField label="Require Permit Nonce" value={String(values.tokenPermissionRequireNonce ?? "")} onChange={(value) => onChange({ tokenPermissionRequireNonce: value })} options={["Yes", "No"]} />
          <InputField label="Maximum Batch Size" value={String(values.tokenPermissionMaximumBatchSize ?? "")} onChange={(value) => onChange({ tokenPermissionMaximumBatchSize: value })} type="number" />
        </div>
      </details>
      <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Raw permit signatures and signed payloads are rejected. This foundation evaluates declared metadata and audit replay state; it does not query current on-chain allowances or certify token safety.</p>
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
}: {
  agents: Agent[];
  policies: Policy[];
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<Policy | undefined> | Policy | undefined;
  onUpdatePolicy: (id: string, policy: Partial<Policy>) => Promise<void> | void;
  walletAddress: string;
  approvals: ApprovalRequest[];
  onRespondApproval: (id: string, response: "Approve" | "Reject", comment?: string) => Promise<ApprovalRequest>;
}) {
  const [form, setForm] = useState({
    name: "",
    agentId: agents[0]?.id || "",
    maxTransaction: "",
    dailyLimit: "",
    approvalThreshold: "",
    approvalWorkflowEnabled: "Yes",
    approvalWorkflowMode: "Single",
    approvalRequiredCount: "1",
    approvalExpiryMinutes: "60",
    approvalAllowOwnerFallback: "Yes",
    approvalSeparationOfDuties: "No",
    approvalRequireRejectComment: "Yes",
    approvalApproverWallets: "",
    trustedContracts: "",
    blockedContracts: "",
    allowedEntryPoints: "",
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
    tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Block",
    tokenPermissionMaxApprovalAmount: "100",
    tokenPermissionMaxApprovalToTransactionRatio: "1.25",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "Yes",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
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
    approvalWorkflowEnabled: "Yes",
    approvalWorkflowMode: "Single",
    approvalRequiredCount: "1",
    approvalExpiryMinutes: "60",
    approvalAllowOwnerFallback: "Yes",
    approvalSeparationOfDuties: "No",
    approvalRequireRejectComment: "Yes",
    approvalApproverWallets: "",
    trustedContracts: "",
    blockedContracts: "",
    allowedEntryPoints: "",
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
    tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Block",
    tokenPermissionMaxApprovalAmount: "100",
    tokenPermissionMaxApprovalToTransactionRatio: "1.25",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "Yes",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
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
    if (!form.name.trim() || !form.agentId) return;
    await onCreatePolicy({
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
        blockedContracts: form.blockedContracts.split("\n").map((item) => item.trim()).filter(Boolean),
        allowedEntryPoints: form.allowedEntryPoints.split("\n").map((item) => item.trim()).filter(Boolean),
        approvalWorkflowEnabled: form.approvalWorkflowEnabled !== "No",
        approvalWorkflowMode: form.approvalWorkflowMode,
        approvalRequiredCount: Math.max(1, Math.min(10, Number(form.approvalRequiredCount) || 1)),
        approvalExpiryMinutes: Math.max(5, Math.min(10080, Number(form.approvalExpiryMinutes) || 60)),
        approvalAllowOwnerFallback: form.approvalAllowOwnerFallback !== "No",
        approvalSeparationOfDuties: form.approvalSeparationOfDuties === "Yes",
        approvalRequireRejectComment: form.approvalRequireRejectComment !== "No",
        approvalApproverWallets: form.approvalApproverWallets.split("\n").map((item) => item.trim()).filter(Boolean),
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
        tokenPermissionControlsEnabled: form.tokenPermissionControlsEnabled !== "No",
        tokenPermissionMode: form.tokenPermissionMode,
        tokenPermissionUnknownSpenderAction: form.tokenPermissionUnknownSpenderAction,
        tokenPermissionUnlimitedApprovalAction: form.tokenPermissionUnlimitedApprovalAction,
        tokenPermissionMaxApprovalAmount: Math.max(0, Number(form.tokenPermissionMaxApprovalAmount) || 0),
        tokenPermissionMaxApprovalToTransactionRatio: Math.max(0, Number(form.tokenPermissionMaxApprovalToTransactionRatio) || 0),
        tokenPermissionMaxLifetimeSeconds: Math.max(1, Number(form.tokenPermissionMaxLifetimeSeconds) || 3600),
        tokenPermissionRequireExpiry: form.tokenPermissionRequireExpiry !== "No",
        tokenPermissionRequireAllowanceReset: form.tokenPermissionRequireAllowanceReset !== "No",
        tokenPermissionApprovedSpenders: form.tokenPermissionApprovedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionBlockedSpenders: form.tokenPermissionBlockedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionAllowNftOperatorApproval: form.tokenPermissionAllowNftOperatorApproval === "Yes",
        tokenPermissionAllowBatchApproval: form.tokenPermissionAllowBatchApproval === "Yes",
        tokenPermissionRequireChainBinding: form.tokenPermissionRequireChainBinding !== "No",
        tokenPermissionRequireNonce: form.tokenPermissionRequireNonce !== "No",
        tokenPermissionMaximumBatchSize: Math.max(1, Math.min(100, Number(form.tokenPermissionMaximumBatchSize) || 10)),
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
      approvalWorkflowEnabled: "Yes",
      approvalWorkflowMode: "Single",
      approvalRequiredCount: "1",
      approvalExpiryMinutes: "60",
      approvalAllowOwnerFallback: "Yes",
      approvalSeparationOfDuties: "No",
      approvalRequireRejectComment: "Yes",
      approvalApproverWallets: "",
      trustedContracts: "",
      blockedContracts: "",
      allowedEntryPoints: "",
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
      tokenPermissionControlsEnabled: "Yes",
    tokenPermissionMode: "Review",
    tokenPermissionUnknownSpenderAction: "Review",
    tokenPermissionUnlimitedApprovalAction: "Block",
    tokenPermissionMaxApprovalAmount: "100",
    tokenPermissionMaxApprovalToTransactionRatio: "1.25",
    tokenPermissionMaxLifetimeSeconds: "3600",
    tokenPermissionRequireExpiry: "Yes",
    tokenPermissionRequireAllowanceReset: "Yes",
    tokenPermissionApprovedSpenders: "",
    tokenPermissionBlockedSpenders: "",
    tokenPermissionAllowNftOperatorApproval: "No",
    tokenPermissionAllowBatchApproval: "No",
    tokenPermissionRequireChainBinding: "Yes",
    tokenPermissionRequireNonce: "Yes",
    tokenPermissionMaximumBatchSize: "10",
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
  }, [agents, form, onCreatePolicy, walletAddress]);

  const openPolicyEditor = useCallback((policy: Policy) => {
    setEditingPolicy(policy);
    setEditForm({
      name: policy.name,
      maxTransaction: String(policy.maxTransaction),
      dailyLimit: String(policy.dailyLimit),
      approvalThreshold: String(policy.approvalThreshold),
      approvalWorkflowEnabled: policy.structuredRules?.approvalWorkflowEnabled === true ? "Yes" : "No",
      approvalWorkflowMode: typeof policy.structuredRules?.approvalWorkflowMode === "string" ? policy.structuredRules.approvalWorkflowMode : "Single",
      approvalRequiredCount: String(typeof policy.structuredRules?.approvalRequiredCount === "number" ? policy.structuredRules.approvalRequiredCount : 1),
      approvalExpiryMinutes: String(typeof policy.structuredRules?.approvalExpiryMinutes === "number" ? policy.structuredRules.approvalExpiryMinutes : 60),
      approvalAllowOwnerFallback: policy.structuredRules?.approvalAllowOwnerFallback === false ? "No" : "Yes",
      approvalSeparationOfDuties: policy.structuredRules?.approvalSeparationOfDuties === true ? "Yes" : "No",
      approvalRequireRejectComment: policy.structuredRules?.approvalRequireRejectComment === false ? "No" : "Yes",
      approvalApproverWallets: Array.isArray(policy.structuredRules?.approvalApproverWallets) ? (policy.structuredRules.approvalApproverWallets as string[]).join("\n") : "",
      trustedContracts: policy.trustedContracts.join("\n"),
      blockedContracts: Array.isArray(policy.structuredRules?.blockedContracts) ? (policy.structuredRules?.blockedContracts as string[]).join("\n") : "",
      allowedEntryPoints: Array.isArray(policy.structuredRules?.allowedEntryPoints) ? (policy.structuredRules?.allowedEntryPoints as string[]).join("\n") : "",
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
      tokenPermissionControlsEnabled: policy.structuredRules?.tokenPermissionControlsEnabled === true ? "Yes" : "No",
      tokenPermissionMode: typeof policy.structuredRules?.tokenPermissionMode === "string" ? policy.structuredRules.tokenPermissionMode : "Observe",
      tokenPermissionUnknownSpenderAction: typeof policy.structuredRules?.tokenPermissionUnknownSpenderAction === "string" ? policy.structuredRules.tokenPermissionUnknownSpenderAction : "Review",
      tokenPermissionUnlimitedApprovalAction: typeof policy.structuredRules?.tokenPermissionUnlimitedApprovalAction === "string" ? policy.structuredRules.tokenPermissionUnlimitedApprovalAction : "Review",
      tokenPermissionMaxApprovalAmount: String(typeof policy.structuredRules?.tokenPermissionMaxApprovalAmount === "number" ? policy.structuredRules.tokenPermissionMaxApprovalAmount : 0),
      tokenPermissionMaxApprovalToTransactionRatio: String(typeof policy.structuredRules?.tokenPermissionMaxApprovalToTransactionRatio === "number" ? policy.structuredRules.tokenPermissionMaxApprovalToTransactionRatio : 0),
      tokenPermissionMaxLifetimeSeconds: String(typeof policy.structuredRules?.tokenPermissionMaxLifetimeSeconds === "number" ? policy.structuredRules.tokenPermissionMaxLifetimeSeconds : 3600),
      tokenPermissionRequireExpiry: policy.structuredRules?.tokenPermissionRequireExpiry === true ? "Yes" : "No",
      tokenPermissionRequireAllowanceReset: policy.structuredRules?.tokenPermissionRequireAllowanceReset === true ? "Yes" : "No",
      tokenPermissionApprovedSpenders: Array.isArray(policy.structuredRules?.tokenPermissionApprovedSpenders) ? (policy.structuredRules.tokenPermissionApprovedSpenders as string[]).join("\n") : "",
      tokenPermissionBlockedSpenders: Array.isArray(policy.structuredRules?.tokenPermissionBlockedSpenders) ? (policy.structuredRules.tokenPermissionBlockedSpenders as string[]).join("\n") : "",
      tokenPermissionAllowNftOperatorApproval: policy.structuredRules?.tokenPermissionAllowNftOperatorApproval === true ? "Yes" : "No",
      tokenPermissionAllowBatchApproval: policy.structuredRules?.tokenPermissionAllowBatchApproval === true ? "Yes" : "No",
      tokenPermissionRequireChainBinding: policy.structuredRules?.tokenPermissionRequireChainBinding === false ? "No" : "Yes",
      tokenPermissionRequireNonce: policy.structuredRules?.tokenPermissionRequireNonce === false ? "No" : "Yes",
      tokenPermissionMaximumBatchSize: String(typeof policy.structuredRules?.tokenPermissionMaximumBatchSize === "number" ? policy.structuredRules.tokenPermissionMaximumBatchSize : 10),
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
        approvalWorkflowEnabled: editForm.approvalWorkflowEnabled !== "No",
        approvalWorkflowMode: editForm.approvalWorkflowMode,
        approvalRequiredCount: Math.max(1, Math.min(10, Number(editForm.approvalRequiredCount) || 1)),
        approvalExpiryMinutes: Math.max(5, Math.min(10080, Number(editForm.approvalExpiryMinutes) || 60)),
        approvalAllowOwnerFallback: editForm.approvalAllowOwnerFallback !== "No",
        approvalSeparationOfDuties: editForm.approvalSeparationOfDuties === "Yes",
        approvalRequireRejectComment: editForm.approvalRequireRejectComment !== "No",
        approvalApproverWallets: editForm.approvalApproverWallets.split("\n").map((item) => item.trim()).filter(Boolean),
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
        tokenPermissionControlsEnabled: editForm.tokenPermissionControlsEnabled !== "No",
        tokenPermissionMode: editForm.tokenPermissionMode,
        tokenPermissionUnknownSpenderAction: editForm.tokenPermissionUnknownSpenderAction,
        tokenPermissionUnlimitedApprovalAction: editForm.tokenPermissionUnlimitedApprovalAction,
        tokenPermissionMaxApprovalAmount: Math.max(0, Number(editForm.tokenPermissionMaxApprovalAmount) || 0),
        tokenPermissionMaxApprovalToTransactionRatio: Math.max(0, Number(editForm.tokenPermissionMaxApprovalToTransactionRatio) || 0),
        tokenPermissionMaxLifetimeSeconds: Math.max(1, Number(editForm.tokenPermissionMaxLifetimeSeconds) || 3600),
        tokenPermissionRequireExpiry: editForm.tokenPermissionRequireExpiry !== "No",
        tokenPermissionRequireAllowanceReset: editForm.tokenPermissionRequireAllowanceReset !== "No",
        tokenPermissionApprovedSpenders: editForm.tokenPermissionApprovedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionBlockedSpenders: editForm.tokenPermissionBlockedSpenders.split("\n").map((item) => item.trim()).filter(Boolean),
        tokenPermissionAllowNftOperatorApproval: editForm.tokenPermissionAllowNftOperatorApproval === "Yes",
        tokenPermissionAllowBatchApproval: editForm.tokenPermissionAllowBatchApproval === "Yes",
        tokenPermissionRequireChainBinding: editForm.tokenPermissionRequireChainBinding !== "No",
        tokenPermissionRequireNonce: editForm.tokenPermissionRequireNonce !== "No",
        tokenPermissionMaximumBatchSize: Math.max(1, Math.min(100, Number(editForm.tokenPermissionMaximumBatchSize) || 10)),
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
    setApprovalBusy(approval.id);
    setApprovalError("");
    try {
      await onRespondApproval(approval.id, response, approvalComments[approval.id] || "");
      setApprovalComments((current) => ({ ...current, [approval.id]: "" }));
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to update the approval request.");
    } finally {
      setApprovalBusy("");
    }
  }, [approvalComments, onRespondApproval]);

  const pendingApprovals = approvals.filter((approval) => ["Pending", "Configuration Required"].includes(approval.reviewStatus));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Policies
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Create deterministic rules and resolve Review Required requests through exact-intent approval workflows.
        </p>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={17} className="text-[#A78BFA]" />
              <h2 className={SECTION_TITLE}>Human Approval Queue</h2>
              <StatusBadge status="Foundation Available" />
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#94A3B8]">Review Required decisions stay blocked from execution until the configured wallet quorum approves the exact binding hash. Rejection, expiry, or parameter changes prevent signing.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-[#F59E0B]/25 bg-[#F59E0B]/10 px-3 py-1 text-[#F59E0B]">{pendingApprovals.length} pending</span>
            <span className="rounded-full border border-[#22C55E]/25 bg-[#22C55E]/10 px-3 py-1 text-[#22C55E]">{approvals.filter((item) => item.reviewStatus === "Approved").length} approved</span>
          </div>
        </div>
        {approvalError && <div className="mt-4 rounded-lg border border-[#EF4444]/25 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#FCA5A5]">{approvalError}</div>}
        <div className="mt-4 space-y-3">
          {approvals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#334155] bg-[#0B1220] p-5 text-center">
              <div className="text-sm font-medium text-[#F8FAFC]">No approval requests yet</div>
              <p className="mt-1 text-xs text-[#94A3B8]">Enable Human Approval & Quorum on a policy, then submit an intent that returns Review Required.</p>
            </div>
          ) : approvals.slice(0, 12).map((approval) => {
            const eligible = approval.approverWallets.some((item) => item.toLowerCase() === walletAddress.toLowerCase());
            const alreadyResponded = approval.responses.some((item) => item.walletAddress.toLowerCase() === walletAddress.toLowerCase());
            const actionable = approval.reviewStatus === "Pending" && eligible && !alreadyResponded;
            const statusTone = approval.reviewStatus === "Approved" ? "text-[#22C55E]" : approval.reviewStatus === "Rejected" || approval.reviewStatus === "Expired" ? "text-[#EF4444]" : "text-[#F59E0B]";
            return (
              <div key={approval.id} className="rounded-xl border border-[#1E293B] bg-[#0B1220] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold ${statusTone}`}>{approval.reviewStatus}</span>
                      <span className="text-xs text-[#64748B]">{approval.approvalsReceived}/{approval.requiredApprovals} approvals</span>
                      <span className="rounded-full border border-[#334155] px-2 py-0.5 text-[10px] text-[#94A3B8]">{approval.actionType}</span>
                    </div>
                    <div className="mt-2 text-sm text-[#F8FAFC]">{approval.amount} · {approval.target || "No target"}</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{approval.reason}</p>
                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                      <div><span className="text-[#64748B]">Policy</span><div className="mt-0.5 text-[#F8FAFC]">{approval.policyName || "Unknown policy"}</div></div>
                      <div><span className="text-[#64748B]">Expires</span><div className="mt-0.5 text-[#F8FAFC]">{approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : "Not set"}</div></div>
                      <div><span className="text-[#64748B]">Binding</span><div className="mt-0.5 truncate font-mono text-[#22D3EE]" title={approval.bindingHash}>{approval.bindingHash || "Unavailable"}</div></div>
                    </div>
                  </div>
                  <div className="w-full shrink-0 lg:w-72">
                    {actionable ? (
                      <>
                        <textarea className={`${INPUT_CLS} min-h-20 resize-none text-xs`} value={approvalComments[approval.id] || ""} onChange={(event) => setApprovalComments((current) => ({ ...current, [approval.id]: event.target.value }))} placeholder="Optional approval note; required for rejection" />
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Btn variant="primary" size="sm" disabled={approvalBusy === approval.id} onClick={() => void submitApprovalResponse(approval, "Approve")}><CheckCircle size={14} /> Approve</Btn>
                          <Btn variant="danger" size="sm" disabled={approvalBusy === approval.id} onClick={() => void submitApprovalResponse(approval, "Reject")}><XCircle size={14} /> Reject</Btn>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-[#1E293B] bg-[#050B14] p-3 text-xs text-[#94A3B8]">
                        {alreadyResponded ? "This wallet already responded." : eligible ? `This request is ${approval.reviewStatus.toLowerCase()}.` : "The connected wallet is not an authorized approver."}
                      </div>
                    )}
                  </div>
                </div>
                {approval.responses.length > 0 && (
                  <div className="mt-3 border-t border-[#1E293B] pt-3">
                    <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Responses</div>
                    <div className="mt-2 space-y-1">
                      {approval.responses.map((response, index) => <div key={`${response.walletAddress}-${index}`} className="flex flex-wrap gap-2 text-xs text-[#94A3B8]"><span className={response.response === "Approved" ? "text-[#22C55E]" : "text-[#EF4444]"}>{response.response}</span><span className="font-mono">{response.walletAddress.length > 18 ? `${response.walletAddress.slice(0, 10)}...${response.walletAddress.slice(-6)}` : response.walletAddress}</span><span>{response.comment || "No comment"}</span><span className="text-[#64748B]">{new Date(response.timestamp).toLocaleString()}</span></div>)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className={`${CARD} p-6 lg:col-span-2`}>
          <h2 className={`${SECTION_TITLE} mb-5`}>New Policy</h2>
          <div className="space-y-4">
            <InputField
              label="Policy Name"
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
              placeholder="e.g. Safe DeFi Policy"
            />
            <SelectField
              label="Agent"
              value={form.agentId}
              onChange={(v) => setForm((p) => ({ ...p, agentId: v }))}
              options={agents.map((a) => a.id)}
            />
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Max Tx (CSPR)"
                value={form.maxTransaction}
                onChange={(v) => setForm((p) => ({ ...p, maxTransaction: v }))}
                placeholder="50"
                type="number"
              />
              <InputField
                label="Daily Limit (CSPR)"
                value={form.dailyLimit}
                onChange={(v) => setForm((p) => ({ ...p, dailyLimit: v }))}
                placeholder="200"
                type="number"
              />
            </div>
            <InputField
              label="Approval Required Above (CSPR)"
              value={form.approvalThreshold}
              onChange={(v) =>
                setForm((p) => ({ ...p, approvalThreshold: v }))
              }
              placeholder="100"
              type="number"
            />
            <div>
              <label className={LABEL_CLS}>Trusted Targets</label>
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={3}
                value={form.trustedContracts}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    trustedContracts: e.target.value,
                  }))
                }
                placeholder="One contract or wallet address per line"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>Blocked Contracts</label>
                <textarea
                  className={`${INPUT_CLS} resize-none font-mono text-xs`}
                  rows={3}
                  value={form.blockedContracts}
                  onChange={(event) => setForm((current) => ({ ...current, blockedContracts: event.target.value }))}
                  placeholder="One Contract Hash or Package Hash per line"
                />
                <p className="mt-1 text-xs text-[#64748B]">Exact policy blocklist. A match always produces Blocked.</p>
              </div>
              <div>
                <label className={LABEL_CLS}>Allowed Contract Entry Points</label>
                <textarea
                  className={`${INPUT_CLS} resize-none font-mono text-xs`}
                  rows={3}
                  value={form.allowedEntryPoints}
                  onChange={(event) => setForm((current) => ({ ...current, allowedEntryPoints: event.target.value }))}
                  placeholder={"swap\ndeposit\nwithdraw"}
                />
                <p className="mt-1 text-xs text-[#64748B]">Optional global allowlist. Leave empty for structural entry-point validation only.</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">Threat Intelligence Foundation</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Controls how exact matches from a configured fresh feed affect authorization. Feed absence never counts as a pass.</p>
                </div>
                <StatusBadge status="Foundation Available" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SelectField label="Match Handling" value={form.threatIntelligenceMode} onChange={(value) => setForm((current) => ({ ...current, threatIntelligenceMode: value }))} options={["Observe", "Review", "Enforce"]} />
                <InputField label="Minimum Confidence (%)" value={form.threatIntelligenceMinConfidence} onChange={(value) => setForm((current) => ({ ...current, threatIntelligenceMinConfidence: value }))} type="number" />
                <SelectField label="Feed Unavailable" value={form.threatIntelligenceUnavailableAction} onChange={(value) => setForm((current) => ({ ...current, threatIntelligenceUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
              </div>
            </div>
            <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">Oracle Validation Foundation</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Controls freshness, source quorum, confidence, cross-source spread, and maximum price deviation for priced intents. An unavailable feed never counts as a pass.</p>
                </div>
                <StatusBadge status="Foundation Available" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SelectField label="Validation Mode" value={form.oracleValidationMode} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMode: value }))} options={["Observe", "Review", "Enforce"]} />
                <InputField label="Max Quote Age (sec)" value={form.oracleValidationMaxAgeSeconds} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMaxAgeSeconds: value }))} type="number" />
                <InputField label="Max Deviation (bps)" value={form.oracleValidationMaxDeviationBps} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMaxDeviationBps: value }))} type="number" />
                <InputField label="Max Source Spread (bps)" value={form.oracleValidationMaxSourceSpreadBps} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMaxSourceSpreadBps: value }))} type="number" />
                <InputField label="Minimum Confidence (%)" value={form.oracleValidationMinConfidence} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMinConfidence: value }))} type="number" />
                <InputField label="Minimum Sources" value={form.oracleValidationMinSources} onChange={(value) => setForm((current) => ({ ...current, oracleValidationMinSources: value }))} type="number" />
                <SelectField label="Feed Unavailable" value={form.oracleValidationUnavailableAction} onChange={(value) => setForm((current) => ({ ...current, oracleValidationUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
              </div>
            </div>
            <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">Bridge Controls Foundation</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Validate provider-supplied routes, chain boundaries, destination formats, quote freshness, fees, assets, amounts, and confirmation requirements before signing.</p>
                </div>
                <StatusBadge status="Foundation Available" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SelectField label="Control Mode" value={form.bridgeControlMode} onChange={(value) => setForm((current) => ({ ...current, bridgeControlMode: value }))} options={["Observe", "Review", "Enforce"]} />
                <SelectField label="Route Metadata Unavailable" value={form.bridgeControlUnavailableAction} onChange={(value) => setForm((current) => ({ ...current, bridgeControlUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
                <SelectField label="Require Quote Expiry" value={form.bridgeRequireQuoteExpiry} onChange={(value) => setForm((current) => ({ ...current, bridgeRequireQuoteExpiry: value }))} options={["Yes", "No"]} />
                <TextareaField label="Allowed Providers (one per line)" value={form.bridgeAllowedProviders} onChange={(value) => setForm((current) => ({ ...current, bridgeAllowedProviders: value }))} />
                <TextareaField label="Allowed Source Chains" value={form.bridgeAllowedSourceChains} onChange={(value) => setForm((current) => ({ ...current, bridgeAllowedSourceChains: value }))} />
                <TextareaField label="Allowed Destination Chains" value={form.bridgeAllowedDestinationChains} onChange={(value) => setForm((current) => ({ ...current, bridgeAllowedDestinationChains: value }))} />
                <TextareaField label="Blocked Destination Chains" value={form.bridgeBlockedDestinationChains} onChange={(value) => setForm((current) => ({ ...current, bridgeBlockedDestinationChains: value }))} />
                <TextareaField label="Allowed Assets" value={form.bridgeAllowedAssets} onChange={(value) => setForm((current) => ({ ...current, bridgeAllowedAssets: value }))} />
                <InputField label="Maximum Bridge Amount" value={form.bridgeMaxAmount} onChange={(value) => setForm((current) => ({ ...current, bridgeMaxAmount: value }))} type="number" />
                <InputField label="Maximum Fee (bps)" value={form.bridgeMaxFeeBps} onChange={(value) => setForm((current) => ({ ...current, bridgeMaxFeeBps: value }))} type="number" />
                <InputField label="Maximum Quote Age (sec)" value={form.bridgeMaxQuoteAgeSeconds} onChange={(value) => setForm((current) => ({ ...current, bridgeMaxQuoteAgeSeconds: value }))} type="number" />
                <InputField label="Minimum Source Confirmations" value={form.bridgeMinSourceConfirmations} onChange={(value) => setForm((current) => ({ ...current, bridgeMinSourceConfirmations: value }))} type="number" />
                <InputField label="Minimum Destination Confirmations" value={form.bridgeMinDestinationConfirmations} onChange={(value) => setForm((current) => ({ ...current, bridgeMinDestinationConfirmations: value }))} type="number" />
              </div>
            </div>
            <ApprovalPolicyFields values={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <ExecutionIntegrityPolicyFields values={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <X402PolicyFields values={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <TokenPermissionPolicyFields values={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <CompliancePolicyFields values={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            <SelectField
              label="Risk Mode"
              value={form.riskMode}
              onChange={(v) =>
                setForm((p) => ({ ...p, riskMode: v as RiskMode }))
              }
              options={["Conservative", "Balanced", "Aggressive"]}
            />
            <Btn
              variant="primary"
              className="w-full justify-center"
              onClick={createPolicy}
            >
              <Plus size={16} />
              Activate Policy
            </Btn>
          </div>
        </div>

        {/* Policy Cards */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className={SECTION_TITLE}>Active Policies</h2>
          {policies.map((pol) => {
            const agent = agents.find((a) => a.id === pol.agentId);
            return (
              <div key={pol.id} className={`${CARD_GLOW} p-5`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#F8FAFC] font-['Space_Grotesk']">
                        {pol.name}
                      </h3>
                      <StatusBadge status={pol.status} />
                    </div>
                    <div className="text-xs text-[#94A3B8]">
                      {pol.id} · Agent: {agent?.name || pol.agentId}
                    </div>
                  </div>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => openPolicyEditor(pol)}
                  >
                    Edit
                  </Btn>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                  <div className="bg-[#0B1220] rounded-lg p-3">
                    <div className="text-xs text-[#94A3B8] mb-1">Max Tx</div>
                    <div className="text-[#F8FAFC] font-semibold">
                      {pol.maxTransaction} CSPR
                    </div>
                  </div>
                  <div className="bg-[#0B1220] rounded-lg p-3">
                    <div className="text-xs text-[#94A3B8] mb-1">
                      Daily Limit
                    </div>
                    <div className="text-[#F8FAFC] font-semibold">
                      {pol.dailyLimit} CSPR
                    </div>
                  </div>
                  <div className="bg-[#0B1220] rounded-lg p-3">
                    <div className="text-xs text-[#94A3B8] mb-1">Risk Mode</div>
                    <div
                      className={`font-semibold ${
                        pol.riskMode === "Conservative"
                          ? "text-[#22C55E]"
                          : pol.riskMode === "Balanced"
                          ? "text-[#F59E0B]"
                          : "text-[#EF4444]"
                      }`}
                    >
                      {pol.riskMode}
                    </div>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#1E293B] bg-[#050B14] px-3 py-2 text-xs text-[#94A3B8]">
                  <span className="font-semibold text-[#F8FAFC]">Threat Intelligence</span>
                  <span>{typeof pol.structuredRules?.threatIntelligenceMode === "string" ? pol.structuredRules.threatIntelligenceMode : "Observe"}</span>
                  <span>·</span>
                  <span>{typeof pol.structuredRules?.threatIntelligenceMinConfidence === "number" ? pol.structuredRules.threatIntelligenceMinConfidence : 70}% confidence</span>
                  <span>· unavailable: {typeof pol.structuredRules?.threatIntelligenceUnavailableAction === "string" ? pol.structuredRules.threatIntelligenceUnavailableAction : "Warn"}</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#1E293B] bg-[#050B14] px-3 py-2 text-xs text-[#94A3B8]">
                  <span className="font-semibold text-[#F8FAFC]">Oracle Validation</span>
                  <span>{typeof pol.structuredRules?.oracleValidationMode === "string" ? pol.structuredRules.oracleValidationMode : "Observe"}</span>
                  <span>·</span>
                  <span>max {typeof pol.structuredRules?.oracleValidationMaxDeviationBps === "number" ? pol.structuredRules.oracleValidationMaxDeviationBps : 300} bps deviation</span>
                  <span>·</span>
                  <span>{typeof pol.structuredRules?.oracleValidationMinSources === "number" ? pol.structuredRules.oracleValidationMinSources : 1} source minimum</span>
                  <span>· unavailable: {typeof pol.structuredRules?.oracleValidationUnavailableAction === "string" ? pol.structuredRules.oracleValidationUnavailableAction : "Warn"}</span>
                </div>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#1E293B] bg-[#050B14] px-3 py-2 text-xs text-[#94A3B8]">
                  <span className="font-semibold text-[#F8FAFC]">Bridge Controls</span>
                  <span>{typeof pol.structuredRules?.bridgeControlMode === "string" ? pol.structuredRules.bridgeControlMode : "Observe"}</span>
                  <span>·</span>
                  <span>{Array.isArray(pol.structuredRules?.bridgeAllowedProviders) ? pol.structuredRules.bridgeAllowedProviders.length : 0} approved providers</span>
                  <span>·</span>
                  <span>{Array.isArray(pol.structuredRules?.bridgeAllowedDestinationChains) ? pol.structuredRules.bridgeAllowedDestinationChains.length : 0} approved destinations</span>
                  <span>· max {typeof pol.structuredRules?.bridgeMaxFeeBps === "number" ? pol.structuredRules.bridgeMaxFeeBps : 100} bps fee</span>
                  <span>· unavailable: {typeof pol.structuredRules?.bridgeControlUnavailableAction === "string" ? pol.structuredRules.bridgeControlUnavailableAction : "Review"}</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[#1E293B] text-xs text-[#94A3B8]">
                  <span>Created {fmtTs(pol.createdAt)}</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span>{pol.policyHash}</span>
                    <button
                      type="button"
                      aria-label="Copy policy hash"
                      title="Copy policy hash"
                      onClick={() => copyPolicyHash(pol.policyHash)}
                      className="hover:text-[#F8FAFC] transition-colors"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
                {copiedPolicyHash === pol.policyHash && (
                  <div className="mt-2 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-2 text-xs text-[#BBF7D0]">
                    Policy hash copied.
                  </div>
                )}
                {copiedPolicyHash === "copy failed" && (
                  <div className="mt-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-xs text-[#F59E0B]">
                    Copy was blocked by the browser. Select the policy hash and copy it manually.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingPolicy(null)} />
          <div className={`${CARD_GLOW} relative w-full max-w-2xl p-6`}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Edit Policy</h2>
                <p className="text-sm text-[#94A3B8] mt-1">
                  Update limits and policy posture for the connected external agent.
                </p>
              </div>
              <button
                onClick={() => setEditingPolicy(null)}
                className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <InputField
                label="Policy Name"
                value={editForm.name}
                onChange={(v) => setEditForm((p) => ({ ...p, name: v }))}
              />
              <div className="grid md:grid-cols-3 gap-3">
                <InputField
                  label="Max Tx (CSPR)"
                  value={editForm.maxTransaction}
                  onChange={(v) => setEditForm((p) => ({ ...p, maxTransaction: v }))}
                  type="number"
                />
                <InputField
                  label="Daily Limit (CSPR)"
                  value={editForm.dailyLimit}
                  onChange={(v) => setEditForm((p) => ({ ...p, dailyLimit: v }))}
                  type="number"
                />
                <InputField
                  label="Approval Above"
                  value={editForm.approvalThreshold}
                  onChange={(v) => setEditForm((p) => ({ ...p, approvalThreshold: v }))}
                  type="number"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Trusted Targets</label>
                <textarea
                  className={`${INPUT_CLS} resize-none`}
                  rows={3}
                  value={editForm.trustedContracts}
                  onChange={(e) => setEditForm((p) => ({ ...p, trustedContracts: e.target.value }))}
                  placeholder="One contract or wallet address per line"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className={LABEL_CLS}>Blocked Contracts</label>
                  <textarea
                    className={`${INPUT_CLS} resize-none font-mono text-xs`}
                    rows={3}
                    value={editForm.blockedContracts}
                    onChange={(event) => setEditForm((current) => ({ ...current, blockedContracts: event.target.value }))}
                    placeholder="One Contract Hash or Package Hash per line"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Allowed Contract Entry Points</label>
                  <textarea
                    className={`${INPUT_CLS} resize-none font-mono text-xs`}
                    rows={3}
                    value={editForm.allowedEntryPoints}
                    onChange={(event) => setEditForm((current) => ({ ...current, allowedEntryPoints: event.target.value }))}
                    placeholder={"swap\ndeposit\nwithdraw"}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#F8FAFC]">Threat Intelligence Foundation</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Exact indicator matches are deterministic. Choose whether matches are observed, routed to review, or enforced as blocks.</p>
                  </div>
                  <StatusBadge status="Foundation Available" />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <SelectField label="Match Handling" value={editForm.threatIntelligenceMode} onChange={(value) => setEditForm((current) => ({ ...current, threatIntelligenceMode: value }))} options={["Observe", "Review", "Enforce"]} />
                  <InputField label="Minimum Confidence (%)" value={editForm.threatIntelligenceMinConfidence} onChange={(value) => setEditForm((current) => ({ ...current, threatIntelligenceMinConfidence: value }))} type="number" />
                  <SelectField label="Feed Unavailable" value={editForm.threatIntelligenceUnavailableAction} onChange={(value) => setEditForm((current) => ({ ...current, threatIntelligenceUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
                </div>
              </div>
              <div className="rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#F8FAFC]">Oracle Validation Foundation</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Compare priced intents with a fresh reference feed and choose whether integrity violations are observed, reviewed, or enforced.</p>
                  </div>
                  <StatusBadge status="Foundation Available" />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <SelectField label="Validation Mode" value={editForm.oracleValidationMode} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMode: value }))} options={["Observe", "Review", "Enforce"]} />
                  <InputField label="Max Quote Age (sec)" value={editForm.oracleValidationMaxAgeSeconds} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMaxAgeSeconds: value }))} type="number" />
                  <InputField label="Max Deviation (bps)" value={editForm.oracleValidationMaxDeviationBps} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMaxDeviationBps: value }))} type="number" />
                  <InputField label="Max Source Spread (bps)" value={editForm.oracleValidationMaxSourceSpreadBps} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMaxSourceSpreadBps: value }))} type="number" />
                  <InputField label="Minimum Confidence (%)" value={editForm.oracleValidationMinConfidence} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMinConfidence: value }))} type="number" />
                  <InputField label="Minimum Sources" value={editForm.oracleValidationMinSources} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationMinSources: value }))} type="number" />
                  <SelectField label="Feed Unavailable" value={editForm.oracleValidationUnavailableAction} onChange={(value) => setEditForm((current) => ({ ...current, oracleValidationUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">Bridge Controls Foundation</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Validate provider-supplied routes, chain boundaries, destination formats, quote freshness, fees, assets, amounts, and confirmation requirements before signing.</p>
                </div>
                <StatusBadge status="Foundation Available" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SelectField label="Control Mode" value={editForm.bridgeControlMode} onChange={(value) => setEditForm((current) => ({ ...current, bridgeControlMode: value }))} options={["Observe", "Review", "Enforce"]} />
                <SelectField label="Route Metadata Unavailable" value={editForm.bridgeControlUnavailableAction} onChange={(value) => setEditForm((current) => ({ ...current, bridgeControlUnavailableAction: value }))} options={["Warn", "Review", "Block"]} />
                <SelectField label="Require Quote Expiry" value={editForm.bridgeRequireQuoteExpiry} onChange={(value) => setEditForm((current) => ({ ...current, bridgeRequireQuoteExpiry: value }))} options={["Yes", "No"]} />
                <TextareaField label="Allowed Providers (one per line)" value={editForm.bridgeAllowedProviders} onChange={(value) => setEditForm((current) => ({ ...current, bridgeAllowedProviders: value }))} />
                <TextareaField label="Allowed Source Chains" value={editForm.bridgeAllowedSourceChains} onChange={(value) => setEditForm((current) => ({ ...current, bridgeAllowedSourceChains: value }))} />
                <TextareaField label="Allowed Destination Chains" value={editForm.bridgeAllowedDestinationChains} onChange={(value) => setEditForm((current) => ({ ...current, bridgeAllowedDestinationChains: value }))} />
                <TextareaField label="Blocked Destination Chains" value={editForm.bridgeBlockedDestinationChains} onChange={(value) => setEditForm((current) => ({ ...current, bridgeBlockedDestinationChains: value }))} />
                <TextareaField label="Allowed Assets" value={editForm.bridgeAllowedAssets} onChange={(value) => setEditForm((current) => ({ ...current, bridgeAllowedAssets: value }))} />
                <InputField label="Maximum Bridge Amount" value={editForm.bridgeMaxAmount} onChange={(value) => setEditForm((current) => ({ ...current, bridgeMaxAmount: value }))} type="number" />
                <InputField label="Maximum Fee (bps)" value={editForm.bridgeMaxFeeBps} onChange={(value) => setEditForm((current) => ({ ...current, bridgeMaxFeeBps: value }))} type="number" />
                <InputField label="Maximum Quote Age (sec)" value={editForm.bridgeMaxQuoteAgeSeconds} onChange={(value) => setEditForm((current) => ({ ...current, bridgeMaxQuoteAgeSeconds: value }))} type="number" />
                <InputField label="Minimum Source Confirmations" value={editForm.bridgeMinSourceConfirmations} onChange={(value) => setEditForm((current) => ({ ...current, bridgeMinSourceConfirmations: value }))} type="number" />
                <InputField label="Minimum Destination Confirmations" value={editForm.bridgeMinDestinationConfirmations} onChange={(value) => setEditForm((current) => ({ ...current, bridgeMinDestinationConfirmations: value }))} type="number" />
              </div>
            </div>
                <ApprovalPolicyFields values={editForm} onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))} />
                <ExecutionIntegrityPolicyFields values={editForm} onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))} />
                <X402PolicyFields values={editForm} onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))} />
                <TokenPermissionPolicyFields values={editForm} onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))} />
                <CompliancePolicyFields values={editForm} onChange={(patch) => setEditForm((current) => ({ ...current, ...patch }))} />
                <SelectField
                  label="Risk Mode"
                  value={editForm.riskMode}
                  onChange={(v) => setEditForm((p) => ({ ...p, riskMode: v as RiskMode }))}
                  options={["Conservative", "Balanced", "Aggressive"]}
                />
                <SelectField
                  label="Status"
                  value={editForm.status}
                  onChange={(v) => setEditForm((p) => ({ ...p, status: v as "Active" | "Inactive" }))}
                  options={["Active", "Inactive"]}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Btn variant="secondary" onClick={() => setEditingPolicy(null)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={savePolicyEdit}>
                  Save Policy
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Audit Log Page
// ──────────────────────────────────────────────────────────

function AuditLogPage({
  auditLogs,
  policies,
  onRecordAuditLog,
  onPrepareCasperPayload,
  onConfirmCasperDeploy,
  onConfirmExecutionDeploy,
}: {
  auditLogs: AuditLog[];
  policies: Policy[];
  onRecordAuditLog: (id: string) => Promise<AuditLog> | AuditLog;
  onPrepareCasperPayload: (id: string) => Promise<CasperPreparedPayload>;
  onConfirmCasperDeploy: (id: string, deployHash: string) => Promise<AuditLog>;
  onConfirmExecutionDeploy: (id: string, deployHash: string, signedBy?: string, note?: string) => Promise<AuditLog>;
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
                  <td colSpan={10} className="px-4 py-12 text-center text-[#94A3B8]">
                    No audit records match your filters.
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
                  <p className="mt-3 text-[11px] leading-relaxed text-[#64748B]">Current approver identity is wallet-address scoped in the connected application session. Cryptographic approver signatures remain a future hardening step and are not claimed as implemented.</p>
                </div>
              )}

              {(() => {
                const permission = auditTokenPermission(selected);
                if (!permission) return null;
                const tokenFindings = (selected.moduleFindings || []).filter((finding) => finding.module === "Token Approval & Permit Safety");
                const replayFinding = tokenFindings.find((finding) => ["Permit replay", "Reused permit signature", "Changed permit parameters", "Reused permission identifier"].includes(finding.rule));
                const approvalAmount = permission.approvalAmount ?? permission.approvalAmountAtomic ?? "Not supplied";
                const intendedAmount = permission.intendedTransactionAmount ?? selected.amount ?? "Not supplied";
                const numericApproval = Number(permission.approvalAmount);
                const numericIntended = Number(permission.intendedTransactionAmount ?? selected.amount);
                const approvalRatio = Number.isFinite(numericApproval) && Number.isFinite(numericIntended) && numericIntended > 0 ? numericApproval / numericIntended : null;
                const batch = Array.isArray(permission.batch) ? permission.batch : [];
                return (
                  <div className="rounded-xl border border-[#22D3EE]/25 bg-[#22D3EE]/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><div className="text-xs font-semibold uppercase tracking-wider text-[#22D3EE]">Token Approval & Permit Safety</div><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Sanitized approval metadata and deterministic binding evidence. Raw permit signatures and signed payloads are not accepted or displayed.</p></div>
                      <StatusBadge status="Foundation Available" />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                      {[
                        ["Token contract", permission.tokenContract || selected.target],
                        ["Token standard", permission.standard || "Unknown / not trusted"],
                        ["Owner", permission.owner || selected.executionWalletAddress || selected.walletAddress],
                        ["Spender", permission.spender || "Not supplied"],
                        ["Approval amount", approvalAmount],
                        ["Intended amount", intendedAmount],
                        ["Approval ratio", approvalRatio === null ? "Unavailable" : approvalRatio.toFixed(4)],
                        ["Unlimited approval", permission.unlimited === true || ["unlimited", "max", "maximum"].includes(String(permission.approvalAmount || "").toLowerCase()) ? "Yes" : "No"],
                        ["Permit nonce", permission.nonce || "Not supplied"],
                        ["Deadline", permission.deadline || "Not supplied"],
                        ["Chain binding", `${String(permission.network || "Not supplied")}${permission.chainId ? ` · chainId ${String(permission.chainId)}` : ""}`],
                        ["Token-contract binding", String(permission.tokenContract || "") === selected.target ? "Exact match" : "See findings"],
                        ["Replay result", replayFinding ? `${replayFinding.status}: ${replayFinding.rule}` : "No replay rule triggered"],
                        ["Batch size", String(batch.length)],
                        ["Active policy", selected.policyUsed],
                        ["Final decision", selected.decision],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-[#1E293B] bg-[#050B14] p-3"><div className="uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-all font-mono text-[#F8FAFC]">{String(value)}</div></div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg border border-[#1E293B] bg-[#050B14] p-3 text-xs">
                      <div className="uppercase tracking-wider text-[#64748B]">Triggered rule and remediation</div>
                      <div className="mt-1 font-semibold text-[#F8FAFC]">{selected.triggeredRule || tokenFindings.find((finding) => ["fail", "warning"].includes(finding.status))?.rule || "No adverse token-permission rule"}</div>
                      <div className="mt-1 leading-relaxed text-[#94A3B8]">{selected.suggestedResolution || tokenFindings.find((finding) => ["fail", "warning"].includes(finding.status))?.remediation || "Proceed only with the exact displayed token, owner, spender, amount, network, and deadline."}</div>
                    </div>
                    {(selected.approvalBindingHash || selected.approvalRequestId) && <div className="mt-3 rounded-lg border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-3 text-xs"><div className="uppercase tracking-wider text-[#A78BFA]">Human approval binding</div><div className="mt-1 break-all font-mono text-[#F8FAFC]">{selected.approvalBindingHash || "Approval request exists; binding hash unavailable."}</div></div>}
                  </div>
                );
              })()}

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Execution Capabilities</div>
                <div className="mt-2"><CapabilityChips capabilities={normalizeCapabilities(selected.capabilityContext)} /></div>
              </div>

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Security Pipeline</div>
                <div className="mt-4"><PipelineTimeline stages={selected.pipelineStages} /></div>
              </div>

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Protection Findings</div>
                <div className="mt-3"><FindingsPanel findings={selected.moduleFindings} /></div>
              </div>

              {selected.originalIntent && (
                <details className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Original Intent</summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[#1E293B] bg-[#020617] p-3 text-xs leading-relaxed text-[#94A3B8]">{JSON.stringify(selected.originalIntent, null, 2)}</pre>
                </details>
              )}

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
              <DocsBadge label="Casper Testnet" variant="warning" />
              <DocsBadge label="Cross-chain Gateway" variant="info" />
              <DocsBadge label="Agent Shield Live" variant="live" />
              <DocsBadge label="Policy Gateway" variant="info" />
              <DocsBadge label="Decision Proofs" variant="live" />
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
                <div className="mt-5"><DocsCallout type="info"><span className="font-semibold text-[#F8FAFC]">Eight protection areas:</span> Agent Trust & Access, Policy & Approval Controls, Wallet & Asset Safety, Contract & Permission Safety, Execution Integrity, Market & Oracle Integrity, Cross-chain & Payment Controls, and Threat & Compliance. Status is shown per control. Transaction preflight and Lifecycle & Replay are Live inside Execution Integrity; stateful simulation and settlement reconciliation remain Foundation Available.</DocsCallout></div>
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
                <h2 className={SECTION_TITLE}>Agent Shield Flow</h2>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-5">
                  <div className="flex min-w-max items-center gap-2">
                    <DocsFlowStep label="Intent received" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Agent authenticated" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Configuration + policy" />
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
                  The repository package is located at <code className="text-[#22D3EE]">packages/sdk-js</code> and is named <code className="text-[#22D3EE]">@magen3/sdk</code>.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="bash" code={`pnpm --filter @magen3/sdk build`} /></div>
                <div className="mt-4"><DocsCodeBlock lang="typescript" code={`import { Magen3Client } from "@magen3/sdk";

const magen3 = new Magen3Client({
  gatewayUrl: process.env.MAGEN3_GATEWAY_URL!,
  agentId: process.env.MAGEN3_AGENT_ID!,
  apiKey: process.env.MAGEN3_AGENT_KEY!,
});

const result = await magen3.requireAllowed(intent);`} /></div>
                <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
                  Use <code className="text-[#F8FAFC]">requireAllowed</code> for fail-closed execution. It stops on Blocked, Review Required, malformed responses, authentication failures, and gateway errors.
                </p>
              </section>

              <section id="sdk-python-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Official Python SDK</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  The repository package is located at <code className="text-[#22D3EE]">packages/sdk-python</code> and is named <code className="text-[#22D3EE]">magen3-sdk</code>.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="bash" code={`python -m pip install -e packages/sdk-python`} /></div>
                <div className="mt-4"><DocsCodeBlock lang="python" code={`from magen3 import Magen3Client

client = Magen3Client(
    gateway_url=os.environ["MAGEN3_GATEWAY_URL"],
    agent_id=os.environ["MAGEN3_AGENT_ID"],
    api_key=os.environ["MAGEN3_AGENT_KEY"],
)

result = client.require_allowed(intent)`} /></div>
              </section>

              <section id="mcp-server-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Official MCP Server</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  The local stdio server lives at <code className="text-[#22D3EE]">packages/mcp-server</code>. It exposes four tools to MCP-compatible agents.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {["magen3_verify_agent", "magen3_get_intent_schema", "magen3_check_intent", "magen3_require_allowed"].map((tool) => (
                    <div key={tool} className="rounded-lg border border-[#1E293B] bg-[#111827] px-4 py-3 font-mono text-xs text-[#22D3EE]">{tool}</div>
                  ))}
                </div>
                <div className="mt-5"><DocsCodeBlock lang="powershell" code={`pnpm mcp:build

codex mcp add magen3 \
  --env MAGEN3_GATEWAY_URL="YOUR_GATEWAY_URL" \
  --env MAGEN3_AGENT_ID="MAG-AGENT-..." \
  --env MAGEN3_AGENT_KEY="YOUR_PRIVATE_KEY" \
  -- node "C:\\dev\\magen3\\packages\\mcp-server\\dist\\server.js"`} /></div>
                <DocsCallout type="info">
                  Keep the API key in local environment configuration. Do not commit it, place it in an Agent Skills file, or include it in screenshots.
                </DocsCallout>
              </section>

              <section id="agent-skills-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Skills Kit</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Connected Agents generates an Agent Skills Kit for the selected integration target. The skill tells the agent to submit every blockchain intent before execution and strictly obey Allowed, Blocked, and Review Required.
                </p>
                <div className="mt-5"><DocsCodeBlock lang="text" code={`Before any Web3 execution:
1. Call Magen3 with the exact intended action.
2. Allowed: continue only toward human-controlled signing.
3. Blocked: stop immediately.
4. Review Required: pause and request human review.
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
                <h2 className={SECTION_TITLE}>Casper Decision Proofs</h2>
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
const PLAYGROUND_TOKEN_UNKNOWN_SPENDER = `02${"a".repeat(66)}`;
const PLAYGROUND_TOKEN_BLOCKED_SPENDER = `01${"b".repeat(64)}`;
const PLAYGROUND_EVM_TOKEN = `0x${"4".repeat(40)}`;
const PLAYGROUND_EVM_OWNER = `0x${"5".repeat(40)}`;
const PLAYGROUND_EVM_SPENDER = `0x${"6".repeat(40)}`;

function firstStringRule(policy: Policy | undefined, key: string, fallback: string) {
  const value = policy?.structuredRules?.[key];
  return Array.isArray(value) && typeof value[0] === "string" && value[0].trim() ? value[0].trim() : fallback;
}

function firstRuleMatching(policy: Policy | undefined, key: string, pattern: RegExp, fallback: string) {
  const value = policy?.structuredRules?.[key];
  if (!Array.isArray(value)) return fallback;
  const match = value.find((item) => typeof item === "string" && pattern.test(item.trim()));
  return typeof match === "string" ? match.trim() : fallback;
}

function playgroundCasperTokenPermission(policy: Policy | undefined, walletAddress: string, overrides: Record<string, unknown> = {}) {
  const tokenContract = firstConfiguredContract(policy) || PLAYGROUND_DEMO_CONTRACT;
  const owner = /^(?:01[0-9a-f]{64}|02[0-9a-f]{66})$/i.test(walletAddress) ? walletAddress : PLAYGROUND_DEMO_EXECUTION_WALLET;
  return {
    kind: "Token Approval",
    standard: "CEP-18-compatible",
    network: "casper-test",
    tokenContract,
    tokenIdentifierType: contractIdentifierTypeFor(tokenContract),
    owner,
    spender: firstRuleMatching(policy, "tokenPermissionApprovedSpenders", /^(?:01[0-9a-f]{64}|02[0-9a-f]{66}|account-hash-[0-9a-f]{64}|(?:contract|contract-package|package)(?:-hash)?-[0-9a-f]{64})$/i, PLAYGROUND_TOKEN_SPENDER),
    approvalAmount: 10,
    intendedTransactionAmount: 10,
    deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    oneTime: true,
    resetAfterUse: true,
    ...overrides,
  };
}

function playgroundEvmPermit(overrides: Record<string, unknown> = {}) {
  return {
    kind: "Permit Authorization",
    standard: "ERC-20 Permit",
    network: "eip155:84532",
    chainId: "84532",
    tokenContract: PLAYGROUND_EVM_TOKEN,
    owner: PLAYGROUND_EVM_OWNER,
    spender: PLAYGROUND_EVM_SPENDER,
    approvalAmount: 10,
    intendedTransactionAmount: 10,
    deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    nonce: "1",
    permitIdentifier: "playground-permit-1",
    permitSignatureHash: "e".repeat(64),
    oneTime: true,
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

const PLAYGROUND_EXAMPLES: Record<string, (agent: Agent, walletAddress: string, policy?: Policy) => Record<string, unknown>> = {
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
  "Bounded token approval": (agent, walletAddress, policy) => {
    const permission = playgroundCasperTokenPermission(policy, walletAddress);
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: permission.owner, executionWalletAddress: permission.owner, goal: "Grant only the token authority required for one intended transaction", reason: "The approval is explicitly classified, bounded, short-lived, owner-bound, spender-bound, and declares a post-use reset.", action: { type: "Token Approval", amount: 10, asset: "TOKEN", target: permission.tokenContract, targetType: "Token Contract", contractIdentifierType: permission.tokenIdentifierType, chainName: "casper-test", entryPoint: "approve", tokenPermission: permission } };
  },
  "Unlimited token approval": (agent, walletAddress, policy) => {
    const permission = playgroundCasperTokenPermission(policy, walletAddress, { unlimited: true, approvalAmount: "unlimited", approvalAmountAtomic: String((2n ** 256n) - 1n), oneTime: false, reusable: true, resetAfterUse: false });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: permission.owner, executionWalletAddress: permission.owner, goal: "Confirm unlimited delegated token authority is warned, reviewed, or blocked by policy", reason: "The example intentionally requests maximum authority rather than the amount needed for the transaction.", action: { type: "Token Approval", amount: 10, asset: "TOKEN", target: permission.tokenContract, targetType: "Token Contract", contractIdentifierType: permission.tokenIdentifierType, chainName: "casper-test", entryPoint: "approve", tokenPermission: permission } };
  },
  "Unknown token spender": (agent, walletAddress, policy) => {
    const permission = playgroundCasperTokenPermission(policy, walletAddress, { spender: PLAYGROUND_TOKEN_UNKNOWN_SPENDER });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: permission.owner, executionWalletAddress: permission.owner, goal: "Require policy handling for a structurally valid but unapproved spender", reason: "The spender is intentionally outside the token-permission approved-spender list.", action: { type: "Token Approval", amount: 10, asset: "TOKEN", target: permission.tokenContract, targetType: "Token Contract", contractIdentifierType: permission.tokenIdentifierType, chainName: "casper-test", entryPoint: "approve", tokenPermission: permission } };
  },
  "Blocked token spender": (agent, walletAddress, policy) => {
    const blockedSpender = firstRuleMatching(policy, "tokenPermissionBlockedSpenders", /^(?:01[0-9a-f]{64}|02[0-9a-f]{66}|account-hash-[0-9a-f]{64}|(?:contract|contract-package|package)(?:-hash)?-[0-9a-f]{64})$/i, PLAYGROUND_TOKEN_BLOCKED_SPENDER);
    const permission = playgroundCasperTokenPermission(policy, walletAddress, { spender: blockedSpender });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: permission.owner, executionWalletAddress: permission.owner, goal: "Confirm an explicitly blocked token spender cannot reach wallet signing", reason: "For a guaranteed Blocked result, add this exact spender to Token Permissions → Blocked spenders in the active policy.", action: { type: "Token Approval", amount: 10, asset: "TOKEN", target: permission.tokenContract, targetType: "Token Contract", contractIdentifierType: permission.tokenIdentifierType, chainName: "casper-test", entryPoint: "approve", tokenPermission: permission } };
  },
  "Expired token permit": (agent) => {
    const permission = playgroundEvmPermit({ deadline: new Date(Date.now() - 60_000).toISOString(), nonce: "expired-1", permitIdentifier: "playground-expired-permit", permitSignatureHash: "f".repeat(64) });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: PLAYGROUND_EVM_OWNER, executionWalletAddress: PLAYGROUND_EVM_OWNER, goal: "Block an already expired permit before any signed payload is used", reason: "Only unsigned metadata and a hash are submitted; the deadline is intentionally in the past.", action: { type: "Permit Authorization", amount: 10, asset: "TOKEN", target: PLAYGROUND_EVM_TOKEN, targetType: "Token Contract", chainName: "eip155:84532", entryPoint: "permit", tokenPermission: permission } };
  },
  "Token permit replay": (agent) => {
    const permission = playgroundEvmPermit({ nonce: "replay-1", permitIdentifier: "playground-replay-permit", permitSignatureHash: "d".repeat(64) });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: PLAYGROUND_EVM_OWNER, executionWalletAddress: PLAYGROUND_EVM_OWNER, goal: "Block reuse of the same canonical permit fingerprint and signature hash", reason: "Submit this same example twice. The first request records the binding; the second must be blocked as replay.", action: { type: "Permit Authorization", amount: 10, asset: "TOKEN", target: PLAYGROUND_EVM_TOKEN, targetType: "Token Contract", chainName: "eip155:84532", entryPoint: "permit", tokenPermission: permission } };
  },
  "NFT operator approval": (agent) => {
    const permission = playgroundEvmPermit({ kind: "NFT Operator Approval", standard: "ERC-721", approvalAmount: 1, intendedTransactionAmount: 1, nonce: "", permitIdentifier: "playground-nft-operator", permitSignatureHash: "", operatorApprovalForAll: true, reusable: true, oneTime: false });
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: PLAYGROUND_EVM_OWNER, executionWalletAddress: PLAYGROUND_EVM_OWNER, goal: "Require explicit policy handling for operator authority over all NFTs", reason: "The example declares approval-for-all authority rather than token-specific permission.", action: { type: "NFT Operator Approval", amount: 1, asset: "NFT", target: PLAYGROUND_EVM_TOKEN, targetType: "Token Contract", chainName: "eip155:84532", entryPoint: "setApprovalForAll", tokenPermission: permission } };
  },
  "Batch token approval": (agent, walletAddress, policy) => {
    const base = playgroundCasperTokenPermission(policy, walletAddress);
    const permission = { ...base, kind: "Batch Approval", approvalAmount: 15, intendedTransactionAmount: 15, spender: base.spender, batch: [
      { network: "casper-test", tokenContract: base.tokenContract, tokenIdentifierType: base.tokenIdentifierType, owner: base.owner, spender: base.spender, approvalAmount: 10 },
      { network: "casper-test", tokenContract: base.tokenContract, tokenIdentifierType: base.tokenIdentifierType, owner: base.owner, spender: PLAYGROUND_TOKEN_UNKNOWN_SPENDER, approvalAmount: 5 },
    ] };
    return { source: "Magen3 Intent Playground", agentId: agent.id, walletAddress: base.owner, executionWalletAddress: base.owner, goal: "Review a batch that delegates bounded authority to multiple spenders", reason: "The example exercises batch-size, per-item identity, spender policy, aggregate amount, and multi-spender findings.", action: { type: "Batch Approval", amount: 15, asset: "TOKEN", target: base.tokenContract, targetType: "Token Contract", contractIdentifierType: base.tokenIdentifierType, chainName: "casper-test", entryPoint: "approve", tokenPermission: permission } };
  },
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
  onSubmitGatewayIntent,
  onNavigate,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  walletAddress: string;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
  onNavigate: (page: Page) => void;
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
  const selectedLogs = selectedAgent ? auditLogs.filter((log) => log.agentId === selectedAgent.id) : [];

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
  }, [apiKey, onSubmitGatewayIntent, requestJson, selectedAgent]);

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
        <div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Intent Playground</h1>
          <p className="mt-1 text-sm text-[#94A3B8]">Test the real Magen3 Gateway request format before integrating an external agent.</p>
        </div>
        <EmptyState
          title="Register an active agent first"
          description="The Playground uses a real Agent ID, active policy, and API credential. It does not simulate a healthy integration."
          action={<Btn variant="primary" onClick={() => onNavigate("connected-agents")}><Plus size={16} /> Register Agent</Btn>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-2.5 py-1 text-xs font-semibold text-[#22D3EE]"><Code2 size={13} /> Real Gateway Contract</div>
          <h1 className="mt-3 text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Intent Playground</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#94A3B8]">Submit an authenticated intent to the existing gateway, inspect deterministic findings and pipeline stages, and open the resulting audit record.</p>
        </div>
        <Btn variant="secondary" onClick={() => onNavigate("audit-log")}><Scroll size={16} /> Open Audit Logs</Btn>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <div className={`${CARD_GLOW} p-5 space-y-4`}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={LABEL_CLS}>Registered Agent</label>
              <select
                className={`${INPUT_CLS} cursor-pointer`}
                value={selectedAgent?.id || ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const next = activeAgents.find((agent) => agent.id === value);
                  setAgentId(value);
                  setApiKey(next?.apiKey || "");
                  if (next) loadExample(example, next);
                }}
              >
                {activeAgents.map((agent) => <option key={agent.id} value={agent.id} className="bg-[#0B1220]">{agent.name}</option>)}
              </select>
            </div>
            <SelectField label="Example" value={example} onChange={(value) => loadExample(value)} options={Object.keys(PLAYGROUND_EXAMPLES)} />
          </div>

          <div>
            <label className={LABEL_CLS}>Agent API Key</label>
            <input
              className={INPUT_CLS}
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste the one-time raw key or rotate the agent key"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-[#64748B]">Held only in this page state and sent in the existing <span className="font-mono text-[#94A3B8]">x-magen3-agent-key</span> header. It is not added to the request JSON.</p>
          </div>

          <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-3 text-xs leading-relaxed text-[#94A3B8]">
            <div className="font-semibold text-[#22D3EE]">Live validation plus foundation security checks</div>
            <div className="mt-1">Agent Shield is organized into eight protection areas with control-level status. Wallet and Contract checks, transaction preflight, and Lifecycle & Replay are Live. Stateful simulation, Threat Intelligence, Oracle Validation, Bridge Controls, x402 Payment Controls, Compliance Controls, and selected settlement checks are Foundation Available. Unavailable controls never count as a pass.</div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className={LABEL_CLS}>Gateway Request JSON</label>
              <button type="button" onClick={() => loadExample(example)} className="text-xs font-semibold text-[#22D3EE] hover:text-[#F8FAFC]">Reset example</button>
            </div>
            <textarea
              className={`${INPUT_CLS} min-h-[390px] resize-y font-mono text-xs leading-relaxed`}
              value={requestJson}
              onChange={(event) => setRequestJson(event.target.value)}
              spellCheck={false}
            />
          </div>

          {error && <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{error}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#94A3B8]">Policy: <span className="text-[#F8FAFC]">{selectedPolicy?.name || "No active policy"}</span></div>
            <Btn variant="primary" onClick={submit} disabled={submitting}><Send size={16} /> {submitting ? "Evaluating…" : "Evaluate Intent"}</Btn>
          </div>
        </div>

        <div className="space-y-5">
          {selectedAgent && <IntegrationHealthPanel agent={selectedAgent} policy={selectedPolicy} logs={selectedLogs} apiOnline />}
          {!result ? (
            <div className={`${CARD} p-8`}>
              <EmptyState title="No request submitted" description="Choose an example, edit the request, and evaluate it against the selected agent’s real active policy." />
            </div>
          ) : (
            <>
              <div className={`${CARD_GLOW} p-5`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><DecisionBadge decision={result.result.decision} /><RiskBadge risk={result.result.risk} /></div>
                    <h2 className="mt-3 text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{result.result.primaryReason || result.result.reason}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{result.result.suggestedResolution || result.result.recommendedAction}</p>
                  </div>
                  <div className="rounded-xl border border-[#1E293B] bg-[#050B14] px-3 py-2 text-right text-xs text-[#94A3B8]">
                    Risk score<div className="mt-1 text-2xl font-bold text-[#F8FAFC]">{result.result.riskScore}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">Triggered rule</div><div className="mt-1 text-sm text-[#F8FAFC]">{result.result.triggeredRule || "No blocking rule"}</div></div>
                  <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">Audit record</div><div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{result.auditLog.id}</div></div>
                </div>
                {result.approval && (
                  <div className="mt-3 rounded-xl border border-[#A78BFA]/25 bg-[#A78BFA]/5 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#F8FAFC]">Human Approval & Quorum</div>
                        <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">This Review Required decision created an approval request bound to the exact audit intent.</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${result.approval.reviewStatus === "Approved" ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]" : result.approval.reviewStatus === "Rejected" || result.approval.reviewStatus === "Expired" ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]" : "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"}`}>{result.approval.reviewStatus}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Approval ID <span className="block break-all font-mono text-[#F8FAFC]">{result.approval.id}</span></div>
                      <div>Quorum <span className="block text-[#F8FAFC]">{result.approval.approvalsReceived}/{result.approval.requiredApprovals}</span></div>
                      <div>Expires <span className="block text-[#F8FAFC]">{new Date(result.approval.expiresAt).toLocaleString()}</span></div>
                      <div className="sm:col-span-3">Exact-intent binding <span className="block break-all font-mono text-[#A78BFA]">{result.approval.bindingHash}</span></div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[#1E293B] bg-[#050B14] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs leading-relaxed text-[#94A3B8]">Authorized reviewers respond from Policies → Human Approval Queue. The agent can poll this request by approval ID or audit ID but cannot approve itself.</div>
                      <Btn variant="secondary" size="sm" onClick={() => onNavigate("policies")}>Open approval queue</Btn>
                    </div>
                  </div>
                )}
                {result.result.threatIntelligenceContext && (
                  <div className="mt-3 rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Threat Intelligence context</div>
                      <span className="text-xs font-semibold text-[#22D3EE]">{result.result.threatIntelligenceContext.status || "unavailable"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Source <span className="block text-[#F8FAFC]">{result.result.threatIntelligenceContext.sourceName || "No feed configured"}</span></div>
                      <div>Active indicators <span className="block text-[#F8FAFC]">{result.result.threatIntelligenceContext.activeIndicatorCount ?? result.result.threatIntelligenceContext.indicatorCount ?? 0}</span></div>
                      <div>Matches <span className="block text-[#F8FAFC]">{result.result.threatIntelligenceContext.matchedIndicators?.length ?? 0}</span></div>
                    </div>
                    {result.result.threatIntelligenceContext.error && <div className="mt-2 text-xs text-[#F59E0B]">{result.result.threatIntelligenceContext.error}</div>}
                  </div>
                )}
                {result.result.oracleValidationContext && (
                  <div className="mt-3 rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Oracle Validation context</div>
                      <span className="text-xs font-semibold text-[#22D3EE]">{result.result.oracleValidationContext.status || "unavailable"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Pair <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.requestedPair || "Not supplied"}</span></div>
                      <div>Execution / reference <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.executionPrice ?? "—"} / {result.result.oracleValidationContext.referencePrice ?? "—"}</span></div>
                      <div>Deviation <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.deviationBps ?? "—"} bps</span></div>
                      <div>Sources <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.sourceCount ?? 0} / minimum {result.result.oracleValidationContext.minSources ?? 1}</span></div>
                      <div>Confidence <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.confidence ?? "—"}%</span></div>
                      <div>Source spread <span className="block text-[#F8FAFC]">{result.result.oracleValidationContext.sourceSpreadBps ?? "—"} bps</span></div>
                    </div>
                    {result.result.oracleValidationContext.error && <div className="mt-2 text-xs text-[#F59E0B]">{result.result.oracleValidationContext.error}</div>}
                  </div>
                )}
                {result.result.executionIntegrityContext && (
                  <div className="rounded-xl border border-[#38BDF8]/20 bg-[#38BDF8]/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[#F8FAFC]">Execution Integrity · Lifecycle & Replay</div>
                      <span className="text-xs font-semibold text-[#38BDF8]">{result.result.executionIntegrityContext.status || "observed"}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Intent ID <span className="block break-all text-[#F8FAFC]">{result.result.executionIntegrityContext.intentId || "Not supplied"}</span></div>
                      <div>Idempotency key <span className="block break-all text-[#F8FAFC]">{result.result.executionIntegrityContext.idempotencyKey || "Not supplied"}</span></div>
                      <div>Attempt <span className="block text-[#F8FAFC]">{result.result.executionIntegrityContext.attempt ?? 0}</span></div>
                      <div>Created <span className="block text-[#F8FAFC]">{result.result.executionIntegrityContext.createdAt || "Not supplied"}</span></div>
                      <div>Expires <span className="block text-[#F8FAFC]">{result.result.executionIntegrityContext.expiresAt || "Not supplied"}</span></div>
                      <div>Previous fingerprint matches <span className="block text-[#F8FAFC]">{result.result.executionIntegrityContext.previousFingerprintCount ?? 0}</span></div>
                      <div className="sm:col-span-3">Canonical fingerprint <span className="block break-all font-mono text-[#F8FAFC]">{result.result.executionIntegrityContext.fingerprint || "Not computed"}</span></div>
                    </div>
                  </div>
                )}
                {result.result.tokenPermissionControlsContext && (
                  <div className="mt-3 rounded-xl border border-[#A78BFA]/20 bg-[#A78BFA]/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Token Approval & Permit Safety context</div>
                      <span className="text-xs font-semibold text-[#A78BFA]">{result.result.tokenPermissionControlsContext.status || "foundation-available"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Permission <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.kind || "Not supplied"}</span></div>
                      <div>Token <span className="block break-all text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.tokenContract || "Not supplied"}</span></div>
                      <div>Spender <span className="block break-all text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.spender || "Not supplied"}</span></div>
                      <div>Authority <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.unlimited ? "Unlimited" : result.result.tokenPermissionControlsContext.approvalAmount ?? "—"}</span></div>
                      <div>Intended amount / ratio <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.intendedTransactionAmount ?? "—"} / {typeof result.result.tokenPermissionControlsContext.approvalRatio === "number" ? result.result.tokenPermissionControlsContext.approvalRatio.toFixed(4) : "—"}</span></div>
                      <div>Lifetime <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.lifetimeSeconds ?? "—"} sec</span></div>
                      <div>Network / chain <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.network || "—"} · {result.result.tokenPermissionControlsContext.chainId || "—"}</span></div>
                      <div>Nonce <span className="block break-all text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.nonce || "Not applicable"}</span></div>
                      <div>Replay history <span className="block text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.previousFingerprintCount ?? 0} matching fingerprint(s)</span></div>
                      <div className="sm:col-span-3">Canonical fingerprint <span className="block break-all font-mono text-[#F8FAFC]">{result.result.tokenPermissionControlsContext.fingerprint || "Not computed"}</span></div>
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-[#64748B]">Unsigned metadata and optional hashes only. Magen3 does not receive raw permit signatures or independently verify current on-chain allowance state in this Foundation release.</div>
                  </div>
                )}
                {result.result.x402PaymentControlsContext && (
                  <div className="mt-3 rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">x402 Payment Controls context</div>
                      <span className="text-xs font-semibold text-[#F59E0B]">{result.result.x402PaymentControlsContext.status || "foundation-available"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Merchant <span className="block break-all text-[#F8FAFC]">{result.result.x402PaymentControlsContext.merchantDomain || "Not supplied"}</span></div>
                      <div>Resource <span className="block break-all text-[#F8FAFC]">{result.result.x402PaymentControlsContext.resourceUrl || "Not supplied"}</span></div>
                      <div>Payment <span className="block text-[#F8FAFC]">{result.result.x402PaymentControlsContext.amount ?? "—"} {result.result.x402PaymentControlsContext.asset || ""}</span></div>
                      <div>Network <span className="block text-[#F8FAFC]">{result.result.x402PaymentControlsContext.network || "Not supplied"}</span></div>
                      <div>Scheme / version <span className="block text-[#F8FAFC]">{result.result.x402PaymentControlsContext.scheme || "—"} · v{result.result.x402PaymentControlsContext.version || "—"}</span></div>
                      <div>Settlement <span className="block text-[#F8FAFC]">{result.result.x402PaymentControlsContext.settlementStatus || "not_submitted"}</span></div>
                      <div className="sm:col-span-3">Request fingerprint <span className="block break-all font-mono text-[#F8FAFC]">{result.result.x402PaymentControlsContext.requestFingerprint || "Not computed"}</span></div>
                    </div>
                    {result.result.decision === "Allowed" && (
                      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[#1E293B] bg-[#050B14] p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-relaxed text-[#94A3B8]">Production adapters must report the real facilitator settlement. This button records a clearly labeled synthetic Playground settlement only.</div>
                        <Btn variant="secondary" size="sm" onClick={reportTestSettlement} disabled={settling || Boolean(settlementResult)}>{settling ? "Reporting…" : settlementResult ? "Settlement recorded" : "Report test settlement"}</Btn>
                      </div>
                    )}
                    {settlementResult && <div className="mt-2 rounded-lg border border-[#22C55E]/25 bg-[#22C55E]/5 p-2 text-xs text-[#BBF7D0]">Settlement reconciliation stored. Open Audit Logs to inspect the confirmed payment and resource-delivery timeline.</div>}
                  </div>
                )}
                {result.result.bridgeControlsContext && (
                  <div className="mt-3 rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Bridge Controls context</div>
                      <span className="text-xs font-semibold text-[#22D3EE]">{result.result.bridgeControlsContext.status || "unavailable"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Route <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.sourceChain || "—"} → {result.result.bridgeControlsContext.destinationChain || "—"}</span></div>
                      <div>Provider <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.provider || "Not supplied"}</span></div>
                      <div>Route ID <span className="block break-all text-[#F8FAFC]">{result.result.bridgeControlsContext.routeId || "Not supplied"}</span></div>
                      <div>Asset / amount <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.amount ?? "—"} {result.result.bridgeControlsContext.asset || ""}</span></div>
                      <div>Fee <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.feeBps ?? "—"} / max {result.result.bridgeControlsContext.maxFeeBps ?? "—"} bps</span></div>
                      <div>Destination format <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.destinationAddressFamily || "unknown"} · {result.result.bridgeControlsContext.destinationAddressValid === true ? "valid" : result.result.bridgeControlsContext.destinationAddressValid === false ? "invalid" : "unverified"}</span></div>
                      <div>Quote expiry <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.quoteExpiresAt || "Not supplied"}</span></div>
                      <div>Source confirmations <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.sourceConfirmations ?? "—"}</span></div>
                      <div>Destination confirmations <span className="block text-[#F8FAFC]">{result.result.bridgeControlsContext.destinationConfirmations ?? "—"}</span></div>
                    </div>
                  </div>
                )}
                {result.result.complianceControlsContext && (
                  <div className="mt-3 rounded-xl border border-[#34D399]/20 bg-[#34D399]/5 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wider text-[#64748B]">Compliance Controls context</div>
                      <span className="text-xs font-semibold text-[#34D399]">{result.result.complianceControlsContext.status || "unavailable"}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-xs text-[#94A3B8] sm:grid-cols-3">
                      <div>Jurisdictions <span className="block text-[#F8FAFC]">{result.result.complianceControlsContext.originatorJurisdiction || "—"} → {result.result.complianceControlsContext.beneficiaryJurisdiction || "—"}</span></div>
                      <div>Counterparty <span className="block text-[#F8FAFC]">{result.result.complianceControlsContext.counterpartyType || "Unknown"}</span></div>
                      <div>Attestations <span className="block text-[#F8FAFC]">{result.result.complianceControlsContext.originatorAttestationStatus || "Not Provided"} / {result.result.complianceControlsContext.beneficiaryAttestationStatus || "Not Provided"}</span></div>
                      <div>Travel Rule <span className="block text-[#F8FAFC]">{result.result.complianceControlsContext.travelRuleStatus || "Not Provided"}</span></div>
                      <div>Screening <span className="block text-[#F8FAFC]">{result.result.complianceControlsContext.screeningStatus || "Not Provided"}</span></div>
                      <div>Configured matches <span className="block text-[#F8FAFC]">{(result.result.complianceControlsContext.matchedIndicators?.length || 0) + (result.result.complianceControlsContext.matchedJurisdictions?.length || 0)}</span></div>
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-[#64748B]">Magen3 accepts non-sensitive statuses and opaque references only. A configured-feed no-match is not a legal-compliance guarantee.</div>
                  </div>
                )}
              </div>
              <div className={`${CARD} p-5`}><h2 className={SECTION_TITLE}>Live Execution Timeline</h2><div className="mt-4"><PipelineTimeline stages={result.result.pipelineStages || result.auditLog.pipelineStages} /></div></div>
              <FindingsPanel findings={result.result.moduleFindings || result.auditLog.moduleFindings} />
              <details className={`${CARD} p-5`}><summary className="cursor-pointer text-sm font-semibold text-[#F8FAFC]">Raw gateway response</summary><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#020617] p-4 text-xs text-[#94A3B8]">{JSON.stringify(result, null, 2)}</pre></details>
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
  threatIntelligenceStatus,
  oracleValidationStatus,
  complianceControlsStatus,
  x402PaymentControlsStatus,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  threatIntelligenceStatus: ThreatIntelligenceStatus;
  oracleValidationStatus: OracleValidationStatus;
  complianceControlsStatus: ComplianceControlsStatus;
  x402PaymentControlsStatus: X402PaymentControlsStatus;
}) {
  const [devMode, setDevMode] = useState(false);
  const [copiedSetting, setCopiedSetting] = useState("");
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
    ["x402 Payment Controls Status", `${api.baseUrl}/api/x402-payment-controls/status`],
    ["Token Permission Controls Status", `${api.baseUrl}/api/token-permission-controls/status`],
    ["x402 Settlement Reporting", `${api.baseUrl}/api/agent-gateway/x402/settlements`],
    ["Agent API Keys", "Created and rotated from Connected Agents"],
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Settings
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          View the active Magen3 environment and adjust local dashboard preferences.
        </p>
      </div>

      {/* Network */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-4`}>Network</h2>
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-sm font-medium text-[#F8FAFC]">
              Active Network
            </div>
            <div className="text-xs text-[#94A3B8] mt-0.5">
              Blockchain network for Magen3 audit records
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FF3B3B]/10 border border-[#FF3B3B]/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-[#FF3B3B]" />
            <span className="text-sm text-[#FF3B3B] font-semibold">
              Casper Testnet
            </span>
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className={SECTION_TITLE}>Threat Intelligence Foundation</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Actual backend feed status. Provider credentials and raw configured locations are never displayed.</p></div>
          <StatusBadge status={threatIntelligenceStatus.status === "available" ? "Foundation Available" : "Inactive"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Feed state", threatIntelligenceStatus.status || "unavailable"],
            ["Source", threatIntelligenceStatus.sourceName || "No feed configured"],
            ["Active indicators", String(threatIntelligenceStatus.activeIndicatorCount ?? threatIntelligenceStatus.indicatorCount ?? 0)],
            ["Feed records", String(threatIntelligenceStatus.indicatorCount || 0)],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-words text-sm text-[#F8FAFC]">{value}</div></div>)}
        </div>
        {threatIntelligenceStatus.error && <div className="mt-3 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-xs leading-relaxed text-[#FCD34D]">{threatIntelligenceStatus.error}</div>}
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className={SECTION_TITLE}>Oracle Validation Foundation</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Actual backend oracle-feed status. Provider credentials and raw configured locations are never displayed.</p></div>
          <StatusBadge status={oracleValidationStatus.status === "available" ? "Foundation Available" : "Inactive"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Feed state", oracleValidationStatus.status || "unavailable"],
            ["Source", oracleValidationStatus.sourceName || "No feed configured"],
            ["Asset pairs", String(oracleValidationStatus.pairCount || 0)],
            ["Observations", String(oracleValidationStatus.observationCount || 0)],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-words text-sm text-[#F8FAFC]">{value}</div></div>)}
        </div>
        {oracleValidationStatus.error && <div className="mt-3 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-xs leading-relaxed text-[#FCD34D]">{oracleValidationStatus.error}</div>}
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className={SECTION_TITLE}>Compliance Controls Foundation</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Actual backend screening-feed status. Magen3 accepts opaque references and status evidence, not names, identity documents, or other raw personal data.</p></div>
          <StatusBadge status={complianceControlsStatus.status === "available" ? "Foundation Available" : "Inactive"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Feed state", complianceControlsStatus.status || "unavailable"],
            ["Source", complianceControlsStatus.sourceName || "No feed configured"],
            ["Active indicators", String(complianceControlsStatus.activeIndicatorCount ?? complianceControlsStatus.indicatorCount ?? 0)],
            ["Jurisdiction rules", String(complianceControlsStatus.activeJurisdictionCount ?? complianceControlsStatus.jurisdictionCount ?? 0)],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-words text-sm text-[#F8FAFC]">{value}</div></div>)}
        </div>
        {complianceControlsStatus.error && <div className="mt-3 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-3 text-xs leading-relaxed text-[#FCD34D]">{complianceControlsStatus.error}</div>}
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className={SECTION_TITLE}>x402 Payment Controls Foundation</h2><p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">Gateway capability status. Magen3 authorizes exact-scheme payment requirements and reconciles reported settlement without receiving signing keys or PAYMENT-SIGNATURE payloads.</p></div>
          <StatusBadge status={x402PaymentControlsStatus.status === "foundation-available" ? "Foundation Available" : "Inactive"} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Protocol", `x402 v${x402PaymentControlsStatus.protocolVersion || 2}`],
            ["Schemes", (x402PaymentControlsStatus.supportedSchemes || ["exact"]).join(", ")],
            ["Request binding", x402PaymentControlsStatus.requestBinding ? "Enabled" : "Unavailable"],
            ["Settlement reporting", x402PaymentControlsStatus.settlementReporting ? "Enabled" : "Unavailable"],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3"><div className="text-[11px] uppercase tracking-wider text-[#64748B]">{label}</div><div className="mt-1 break-words text-sm text-[#F8FAFC]">{value}</div></div>)}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-4`}>Workspace Summary</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {[
            ["Agents", agents.length],
            ["Active Policies", policies.filter((policy) => policy.status === "Active").length],
            ["Audit Records", auditLogs.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
              <div className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{value}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-[#94A3B8]">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Gateway / Integration */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-1`}>Gateway / Integration</h2>
        <p className="text-xs text-[#94A3B8] mb-4">
          Use these endpoints with the Agent ID and API key created inside Connected Agents.
        </p>
        <div className="space-y-2">
          {gatewayRows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-[#94A3B8]">{label}</div>
                  <div className="mt-1 break-all font-mono text-xs text-[#F8FAFC]">{value}</div>
                </div>
                {value.startsWith("http") && (
                  <button
                    type="button"
                    aria-label={`Copy ${label}`}
                    onClick={() => copySetting(label, value)}
                    className="shrink-0 text-[#22D3EE] hover:text-[#F8FAFC]"
                  >
                    <Copy size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {copiedSetting && (
            <div className={`rounded-lg border px-3 py-2 text-xs ${
              copiedSetting === "copy failed"
                ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
                : "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#BBF7D0]"
            }`}>
              {copiedSetting === "copy failed" ? "Copy was blocked by the browser." : `${copiedSetting} copied.`}
            </div>
          )}
        </div>
      </div>

      {/* Developer Mode */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={SECTION_TITLE}>Developer Mode</h2>
            <p className="text-xs text-[#94A3B8] mt-1">
              Show raw decision payloads and verbose policy evaluation logs.
            </p>
          </div>
          <button
            onClick={() => setDevMode((p) => !p)}
            className={`relative w-11 h-6 rounded-full ${
              devMode ? "bg-[#22D3EE]" : "bg-[#1E293B]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full ${
                devMode ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        {devMode && (
          <div className="mt-4 p-3 bg-[#0B1220] rounded-lg border border-[#22D3EE]/20">
            <div className="flex items-center gap-2 text-xs text-[#22D3EE] mb-2">
              <Code2 size={13} />
              Developer mode active
            </div>
            <pre className="text-xs text-[#94A3B8] overflow-x-auto">
              {JSON.stringify(
                {
                  magen3Version: "0.1.0",
                  network: "casper-testnet",
                  agentCount: agents.length,
                  policyCount: policies.length,
                  auditCount: auditLogs.length,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
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
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

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
    const payload = await api.respondApproval(id, { walletAddress, response, comment });
    if (payload.approval) {
      const updated = payload.approval as ApprovalRequest;
      setApprovals((previous) => previous.map((item) => item.id === updated.id ? updated : item));
    }
    if (payload.auditLog) {
      const updatedAudit = payload.auditLog as AuditLog;
      setAuditLogs((previous) => previous.map((item) => item.id === updatedAudit.id ? updatedAudit : item));
    }
    setApiOnline(true);
    return payload.approval as ApprovalRequest;
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
        onNavigate={navigate}
      />
    ),
    "connected-agents": (
      <ConnectedAgentsPage
        agents={agents}
        policies={policies}
        onRegisterAgent={onRegisterAgent}
        onRotateAgentApiKey={onRotateAgentApiKey}
        onRevokeAgent={onRevokeAgent}
        onCreatePolicy={onCreatePolicy}
        onNavigate={navigate}
        auditLogs={auditLogs}
        walletAddress={walletAddress}
        apiOnline={apiOnline}
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
      />
    ),
    "intent-playground": (
      <IntentPlaygroundPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        walletAddress={walletAddress}
        onSubmitGatewayIntent={onSubmitGatewayIntent}
        onNavigate={navigate}
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
      />
    ),
    settings: (
      <SettingsPage agents={agents} policies={policies} auditLogs={auditLogs} threatIntelligenceStatus={threatIntelligenceStatus} oracleValidationStatus={oracleValidationStatus} complianceControlsStatus={complianceControlsStatus} x402PaymentControlsStatus={x402PaymentControlsStatus} />
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
