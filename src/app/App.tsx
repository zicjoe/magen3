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
  FlaskConical,
  Settings,
  Wallet,
  ChevronDown,
  Bell,
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
} from "lucide-react";
import { api } from "./lib/api";
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
  | "agent-shield"
  | "gateway-integration"
  | "policies"
  | "action-review"
  | "audit-log"
  | "settings";

type Decision = "Allowed" | "Blocked" | "Review Required";
type Risk = "Low" | "Medium" | "High" | "Critical";
type ShieldStatus = "Available" | "Preview" | "Coming Soon";
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
  | "Policy Activation";
type TargetType =
  | "Trusted Contract"
  | "Unknown Contract"
  | "Wallet Address"
  | "DAO Treasury"
  | "RWA Registry"
  | "Oracle Feed";

interface Agent {
  id: string;
  name: string;
  type: AgentType;
  purpose: string;
  permissionLevel: PermissionLevel;
  status: "Policy Active" | "No Policy" | "Paused";
  createdAt: string;
  ownerWalletAddress?: string;
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
  txHash: string;
  executionStatus?: string;
  executionTxHash?: string;
  executionSignedBy?: string;
  executionNote?: string;
  executionUpdatedAt?: string;
  riskScore: number;
}

interface DashboardStats {
  activeShields: number;
  protectedActions: number;
  blockedActions: number;
  reviewRequired: number;
  casperAuditRecords: number;
}

interface ShieldModule {
  id: string;
  name: string;
  description: string;
  status: ShieldStatus;
  riskCategory: string;
  icon: string;
}

interface ActionRequest {
  agentId: string;
  actionType: ActionType;
  amount: number;
  target: string;
  targetType: TargetType;
}

interface DecisionResult {
  decision: Decision;
  risk: Risk;
  riskScore: number;
  policyChecksPassed: string[];
  policyChecksFailed: string[];
  reason: string;
  recommendedAction: string;
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

interface AgentRunnerProposal {
  rawGoal: string;
  request: ActionRequest;
  summary: string;
  reasoning: string[];
  confidence: number;
  executionPlan: string[];
}

interface AgentGatewayResponse {
  ok: boolean;
  gatewayRequest: {
    id: string;
    source: string;
    agentId: string;
    walletAddress: string;
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
  nextAction: string;
}

// ──────────────────────────────────────────────────────────
// Static Catalog and Sample Inputs
// ──────────────────────────────────────────────────────────

const initialAgents: Agent[] = [];

const initialPolicies: Policy[] = [];

const initialAuditLogs: AuditLog[] = [];

const initialDashboardStats: DashboardStats = {
  activeShields: 0,
  protectedActions: 0,
  blockedActions: 0,
  reviewRequired: 0,
  casperAuditRecords: 0,
};

const shieldModulesCatalog: ShieldModule[] = [
  {
    id: "shield-agent",
    name: "Agent Shield",
    description:
      "Protect wallets and protocols from unsafe AI-agent actions before they reach the chain.",
    status: "Available",
    riskCategory: "Agent Execution",
    icon: "bot",
  },
  {
    id: "shield-contract",
    name: "Contract Shield",
    description:
      "Analyze risky smart-contract interactions, upgrades, and admin permission changes.",
    status: "Preview",
    riskCategory: "Smart Contract",
    icon: "code",
  },
  {
    id: "shield-dao",
    name: "DAO Shield",
    description:
      "Verify that treasury execution matches approved governance decisions.",
    status: "Preview",
    riskCategory: "Governance",
    icon: "building",
  },
  {
    id: "shield-rwa",
    name: "RWA Shield",
    description:
      "Check asset verification, proof expiry, and risk status before protocol action.",
    status: "Preview",
    riskCategory: "Real World Assets",
    icon: "database",
  },
  {
    id: "shield-oracle",
    name: "Oracle Shield",
    description:
      "Detect suspicious data updates before they trigger on-chain decisions.",
    status: "Preview",
    riskCategory: "Data Feed",
    icon: "globe",
  },
];

const sampleActionExamples = [
  {
    agentId: "MAG-AGENT-001",
    actionType: "Stake" as ActionType,
    amount: 25,
    target: "0xStakingContract123",
    targetType: "Trusted Contract" as TargetType,
    result: {
      decision: "Allowed" as Decision,
      risk: "Low" as Risk,
      riskScore: 8,
      policyChecksPassed: [
        "Amount within max transaction limit (25 ≤ 50 CSPR)",
        "Target contract is trusted",
        "Action type allowed by policy",
        "Daily spending limit not exceeded",
      ],
      policyChecksFailed: [],
      reason: "Amount is within policy limit and target contract is trusted.",
      recommendedAction: "Proceed with staking operation.",
    } as DecisionResult,
  },
  {
    agentId: "MAG-AGENT-001",
    actionType: "Transfer" as ActionType,
    amount: 500,
    target: "0xUnknownContract999",
    targetType: "Unknown Contract" as TargetType,
    result: {
      decision: "Blocked" as Decision,
      risk: "High" as Risk,
      riskScore: 87,
      policyChecksPassed: [],
      policyChecksFailed: [
        "Amount exceeds max transaction limit (500 > 50 CSPR)",
        "Target contract is not trusted",
        "Daily limit would be exceeded",
      ],
      reason:
        "Amount exceeds max transaction limit and target is not trusted.",
      recommendedAction:
        "Do not execute. Review target contract and reduce amount below policy limit.",
    } as DecisionResult,
  },
  {
    agentId: "MAG-AGENT-001",
    actionType: "Deposit to Vault" as ActionType,
    amount: 120,
    target: "0xYieldVault456",
    targetType: "Trusted Contract" as TargetType,
    result: {
      decision: "Review Required" as Decision,
      risk: "Medium" as Risk,
      riskScore: 52,
      policyChecksPassed: [
        "Target contract is trusted",
        "Daily limit not exceeded",
      ],
      policyChecksFailed: [
        "Amount exceeds approval threshold (120 > 100 CSPR)",
      ],
      reason: "Target is trusted, but amount is above approval threshold.",
      recommendedAction:
        "Requires manual approval. Review the vault deposit before proceeding.",
    } as DecisionResult,
  },
];

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

function executionProofStatus(status = "", txHash = "") {
  if (isRealCasperDeployHash(txHash)) return { label: "Executed", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (status === "approved_pending_signature") return { label: "Waiting for signature", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "blocked_not_submitted") return { label: "Blocked before execution", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (status === "review_required_not_submitted") return { label: "Review required", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "not_required") return { label: "Not required", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  return { label: "Not submitted", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
}

function makeId(prefix: string) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function makePseudoHash(prefix: string) {
  const body = Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${prefix}${body}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getActivePolicy(policies: Policy[], agentId: string) {
  return policies.find((p) => p.agentId === agentId && p.status === "Active");
}

function getDailyUsed(auditLogs: AuditLog[], agentId: string) {
  const now = new Date();
  return auditLogs
    .filter(
      (log) =>
        log.agentId === agentId &&
        log.decision === "Allowed" &&
        isSameDay(new Date(log.timestamp), now)
    )
    .reduce((sum, log) => sum + log.amount, 0);
}

function targetIsTrusted(request: ActionRequest, policy: Policy) {
  const normalizedTarget = request.target.trim().toLowerCase();
  const trustedList = policy.trustedContracts.map((contract) =>
    contract.trim().toLowerCase()
  );
  return (
    request.targetType === "Trusted Contract" ||
    Boolean(normalizedTarget && trustedList.includes(normalizedTarget))
  );
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

function evaluateAction(
  request: ActionRequest,
  agents: Agent[],
  policies: Policy[],
  auditLogs: AuditLog[]
): DecisionResult {
  const agent = agents.find((a) => a.id === request.agentId);
  const policy = getActivePolicy(policies, request.agentId);
  const checksPassed: string[] = [];
  const checksFailed: string[] = [];

  if (!agent) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 82,
      policyChecksPassed: [],
      policyChecksFailed: ["Selected agent is not registered in Magen3"],
      reason: "Magen3 cannot allow execution from an unknown agent.",
      recommendedAction: "Register the agent before allowing any Web3 action.",
    };
  }

  if (!policy) {
    return {
      decision: "Blocked",
      risk: "High",
      riskScore: 78,
      policyChecksPassed: [`Agent ${agent.name} is registered`],
      policyChecksFailed: ["No active security policy found for this agent"],
      reason: "This agent has no active policy, so Magen3 blocks execution by default.",
      recommendedAction: "Create and activate a policy for this agent first.",
    };
  }

  const dailyUsed = getDailyUsed(auditLogs, request.agentId);
  const dailyAfterAction = dailyUsed + request.amount;
  const isTrusted = targetIsTrusted(request, policy);
  const isBlockedAction = policy.blockedActions.includes(request.actionType);
  const strictMode = policy.riskMode === "Conservative";
  const relaxedMode = policy.riskMode === "Aggressive";
  let score = 5;

  checksPassed.push(`Active policy found: ${policy.name}`);

  if (isBlockedAction) {
    checksFailed.push(`Action type is blocked by policy: ${request.actionType}`);
    score += 35;
  } else {
    checksPassed.push(`Action type is not blocked: ${request.actionType}`);
  }

  if (request.amount > policy.maxTransaction) {
    checksFailed.push(
      `Amount exceeds max transaction limit (${request.amount} > ${policy.maxTransaction} CSPR)`
    );
    score += 30;
  } else {
    checksPassed.push(
      `Amount within max transaction limit (${request.amount} ≤ ${policy.maxTransaction} CSPR)`
    );
  }

  if (dailyAfterAction > policy.dailyLimit) {
    checksFailed.push(
      `Daily limit would be exceeded (${dailyAfterAction} > ${policy.dailyLimit} CSPR)`
    );
    score += 25;
  } else {
    checksPassed.push(
      `Daily limit remains valid (${dailyAfterAction} ≤ ${policy.dailyLimit} CSPR)`
    );
  }

  if (isTrusted) {
    checksPassed.push("Target is trusted or policy-approved");
  } else {
    checksFailed.push("Target is not in the trusted contract list");
    score += strictMode ? 35 : 25;
  }

  if (request.amount > policy.approvalThreshold) {
    checksFailed.push(
      `Amount exceeds approval threshold (${request.amount} > ${policy.approvalThreshold} CSPR)`
    );
    score += relaxedMode ? 10 : 18;
  } else {
    checksPassed.push(
      `Amount below approval threshold (${request.amount} ≤ ${policy.approvalThreshold} CSPR)`
    );
  }

  const hardBlock =
    isBlockedAction ||
    request.amount > policy.maxTransaction ||
    dailyAfterAction > policy.dailyLimit ||
    (!isTrusted && (strictMode || request.targetType === "Unknown Contract"));
  const needsReview =
    !hardBlock &&
    (request.amount > policy.approvalThreshold || !isTrusted || request.targetType !== "Trusted Contract");

  const decision: Decision = hardBlock
    ? "Blocked"
    : needsReview
    ? "Review Required"
    : "Allowed";
  const riskScore = Math.min(99, Math.max(1, score));
  const risk: Risk =
    riskScore >= 85 ? "Critical" : riskScore >= 65 ? "High" : riskScore >= 35 ? "Medium" : "Low";

  return {
    decision,
    risk,
    riskScore,
    policyChecksPassed: checksPassed,
    policyChecksFailed: checksFailed,
    reason:
      decision === "Allowed"
        ? "This action matches the active policy and can be safely executed."
        : decision === "Blocked"
        ? "This action violates one or more hard policy rules and should not execute."
        : "This action is not fully unsafe, but it needs human approval before execution.",
    recommendedAction:
      decision === "Allowed"
        ? "Proceed with execution and record the decision on Casper."
        : decision === "Blocked"
        ? "Do not execute. Update the request or create a stricter review workflow."
        : "Ask the wallet owner or protocol admin to approve once or reject.",
  };
}


function pickAgentForRunner(agents: Agent[], policies: Policy[], currentAgentId: string) {
  if (currentAgentId) return currentAgentId;
  const activePolicy = policies.find((policy) => policy.status === "Active");
  return activePolicy?.agentId || agents[0]?.id || "";
}

function inferAmountFromGoal(goal: string) {
  const match = goal.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:cspr|token|tokens|pot)?\b/i);
  return match ? Number(match[1]) : 0;
}

function inferActionTypeFromGoal(goal: string): ActionType {
  const lower = goal.toLowerCase();
  if (/oracle|price feed|feed update|data update/.test(lower)) return "Oracle Data Update";
  if (/rwa|real world|proof update|asset proof/.test(lower)) return "RWA Proof Update";
  if (/dao|treasury|payment|grant|payout/.test(lower)) return "DAO Treasury Payment";
  if (/swap|exchange|trade/.test(lower)) return "Swap";
  if (/claim|reward/.test(lower)) return "Claim Rewards";
  if (/deposit|vault|lend|supply/.test(lower)) return "Deposit to Vault";
  if (/contract|call|execute|mint|upgrade/.test(lower)) return "Contract Interaction";
  if (/transfer|send|pay/.test(lower)) return "Transfer";
  if (/stake|delegate|validator/.test(lower)) return "Stake";
  return "Contract Interaction";
}

function inferTargetTypeFromGoal(goal: string, actionType: ActionType): TargetType {
  const lower = goal.toLowerCase();
  if (/unknown|new wallet|random|external/.test(lower)) return "Unknown Contract";
  if (/dao|treasury/.test(lower) || actionType === "DAO Treasury Payment") return "DAO Treasury";
  if (/rwa|registry|proof/.test(lower) || actionType === "RWA Proof Update") return "RWA Registry";
  if (/oracle|feed|price/.test(lower) || actionType === "Oracle Data Update") return "Oracle Feed";
  if (/wallet|address|recipient/.test(lower) || actionType === "Transfer") return "Wallet Address";
  if (/trusted|validator|staking|vault|approved|known/.test(lower)) return "Trusted Contract";
  return actionType === "Stake" || actionType === "Claim Rewards" ? "Trusted Contract" : "Unknown Contract";
}

function inferTargetFromGoal(goal: string, actionType: ActionType) {
  const trimmed = goal.trim();
  const explicit = trimmed.match(/(?:to|into|from|on|at|with|via)\s+([a-zA-Z0-9_:\-.]{3,})/i);
  const address = trimmed.match(/(hash-[a-f0-9]{64}|[a-f0-9]{64}|0x[a-fA-F0-9]{6,}|account-[a-zA-Z0-9\-]+)/);
  if (address?.[1]) return address[1].replace(/[,.]$/, "");
  if (explicit?.[1]) return explicit[1].replace(/[,.]$/, "");
  if (actionType === "Stake") return "trusted-validator-demo";
  if (actionType === "Claim Rewards") return "trusted-staking-contract";
  if (actionType === "DAO Treasury Payment") return "dao-treasury-demo";
  if (actionType === "Oracle Data Update") return "oracle-feed-demo";
  if (actionType === "RWA Proof Update") return "rwa-registry-demo";
  return "unknown-target-demo";
}

function buildAgentRunnerProposal(goal: string, agentId: string): AgentRunnerProposal {
  const cleanGoal = goal.trim();
  const actionType = inferActionTypeFromGoal(cleanGoal);
  const amount = inferAmountFromGoal(cleanGoal);
  const targetType = inferTargetTypeFromGoal(cleanGoal, actionType);
  const target = inferTargetFromGoal(cleanGoal, actionType);
  const hasAmount = amount > 0;
  const confidence = Math.max(62, Math.min(96, 72 + (hasAmount ? 12 : 0) + (target !== "unknown-target-demo" ? 8 : 0)));

  return {
    rawGoal: cleanGoal,
    request: {
      agentId,
      actionType,
      amount: hasAmount ? amount : 1,
      target,
      targetType,
    },
    summary: `Agent intends to ${actionType.toLowerCase()} ${hasAmount ? `${amount} CSPR` : "a small test amount"} ${target ? `against ${target}` : "against the selected target"}.`,
    reasoning: [
      `Intent classified as ${actionType}.`,
      hasAmount ? `Detected amount: ${amount} CSPR.` : "No clear amount detected, so Magen3 uses a conservative 1 CSPR test amount.",
      `Target classified as ${targetType}: ${target}.`,
      "Generated action is not executed directly; it must pass Magen3 policy review first.",
    ],
    confidence,
    executionPlan: [
      "Convert natural-language goal into a structured Web3 action request.",
      "Send the action request to Agent Shield for policy evaluation.",
      "Return Allowed, Blocked, or Review Required before any execution.",
      "Record the security decision in the audit log and anchor proof on Casper.",
    ],
  };
}

// ──────────────────────────────────────────────────────────
// Design tokens / shared classes
// ──────────────────────────────────────────────────────────

const CARD = "bg-[#111827] border border-[#1E293B] rounded-xl";
const CARD_GLOW =
  "bg-[#111827] border border-[#1E293B] rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.04)]";
const INPUT_CLS =
  "w-full bg-[#0B1220] border border-[#1E293B] rounded-lg px-3 py-2 text-[#F8FAFC] text-sm placeholder-[#94A3B8] focus:outline-none focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE]/30 transition-colors";
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
  status: "Available" | "Preview" | "Coming Soon" | "Active" | "Inactive" | "Policy Active" | "No Policy" | "Paused";
}) {
  const map: Record<string, string> = {
    Available: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    Active: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    "Policy Active": "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30",
    Preview: "bg-[#22D3EE]/10 text-[#22D3EE] border-[#22D3EE]/30",
    "Coming Soon": "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    Inactive: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20",
    "No Policy": "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
    Paused: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  };
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[status] || map["Coming Soon"]}`}
    >
      {status}
    </span>
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
      "bg-[#22D3EE] hover:bg-[#06B6D4] text-[#050B14] font-semibold shadow-[0_0_12px_rgba(34,211,238,0.25)] hover:shadow-[0_0_20px_rgba(34,211,238,0.35)]",
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
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 transition-all duration-200 ${variants[variant]} ${sizes[size]} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
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

// ──────────────────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────────────────

const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "shields", label: "Shields", icon: <Shield size={18} /> },
  { id: "agent-shield", label: "Agent Registry", icon: <Bot size={18} /> },
  { id: "gateway-integration", label: "Gateway Integration", icon: <Server size={18} /> },
  { id: "policies", label: "Policies", icon: <FileText size={18} /> },
  { id: "action-review", label: "Action Review", icon: <FlaskConical size={18} /> },
  { id: "audit-log", label: "Audit Log", icon: <Scroll size={18} /> },
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
      className={`flex flex-col bg-[#0B1220] border-r border-[#1E293B] transition-all duration-300 ${collapsed ? "w-16" : "w-60"} min-h-screen`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1E293B]">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#22D3EE]/15 flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.3)]">
          <ShieldCheck size={18} className="text-[#22D3EE]" />
        </div>
        {!collapsed && (
          <span className="font-bold text-[#F8FAFC] text-lg font-['Space_Grotesk'] tracking-tight">
            Magen<span className="text-[#22D3EE]">3</span>
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
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
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
                active
                  ? "bg-[#22D3EE]/10 text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]"
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
            Magen3 v0.1 · Casper Testnet
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
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#1E293B] bg-[#050B14]/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Network badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#FF3B3B] animate-pulse" />
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
            {apiOnline ? "API Online" : "Local Fallback"}
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {walletConnected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full">
            <ShieldCheck size={13} className="text-[#22C55E]" />
            <span className="text-xs text-[#22C55E] font-semibold">
              Protected
            </span>
          </div>
        )}
        <button className="relative p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] rounded-lg transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#22D3EE] rounded-full" />
        </button>
        {walletError && !walletConnected && (
          <div className="hidden lg:block max-w-[260px] truncate rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-1.5 text-xs text-[#F59E0B]" title={walletError}>
            {walletError}
          </div>
        )}
        {walletConnected ? (
          <button
            onClick={onDisconnectWallet}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#111827] border border-[#1E293B] rounded-lg hover:border-[#22D3EE]/40 transition-colors"
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

function LandingPage({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <div className="min-h-screen bg-[#050B14] text-[#F8FAFC] font-['Inter']">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[#1E293B]/60 backdrop-blur-sm sticky top-0 z-20 bg-[#050B14]/90">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#22D3EE]/15 flex items-center justify-center shadow-[0_0_10px_rgba(34,211,238,0.3)]">
            <ShieldCheck size={18} className="text-[#22D3EE]" />
          </div>
          <span className="font-bold text-xl font-['Space_Grotesk']">
            Magen<span className="text-[#22D3EE]">3</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#94A3B8]">
          {["How It Works", "Shield Modules", "Audit Demo", "Docs"].map((l) => (
            <a
              key={l}
              href="#"
              className="hover:text-[#F8FAFC] transition-colors"
            >
              {l}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FF3B3B]/10 border border-[#FF3B3B]/20 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-[#FF3B3B] animate-pulse" />
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
      <section className="relative overflow-hidden">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(34,211,238,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#22D3EE]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-8 py-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#22D3EE]/10 border border-[#22D3EE]/20 rounded-full text-xs text-[#22D3EE] font-semibold uppercase tracking-wider mb-8">
            <Zap size={12} />
            Web3 Execution Firewall · Now on Casper Testnet
          </div>
          <h1 className="text-5xl md:text-7xl font-bold font-['Space_Grotesk'] leading-tight mb-6">
            Magen3 is a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#22D3EE] to-[#06B6D4]">
              Web3 execution
            </span>{" "}
            firewall for autonomous agents.
          </h1>
          <p className="text-xl text-[#94A3B8] max-w-3xl mx-auto mb-12 leading-relaxed">
            Protect wallets, AI agents, smart contracts, DAOs, RWA protocols, and
            oracle-driven actions before unsafe execution reaches the blockchain.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Btn variant="primary" size="lg" onClick={onLaunchApp}>
              Launch App <ArrowRight size={18} />
            </Btn>
            <Btn variant="outline" size="lg">
              View Audit Demo <Eye size={18} />
            </Btn>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            {[
              { v: "Live", l: "Casper Wallet" },
              { v: "5", l: "Shield Modules" },
              { v: "On-chain", l: "Casper Proof" },
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
            Autonomous AI agents and smart contracts execute actions with speed
            and scale that humans cannot monitor in real time.
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
      <section className="bg-[#0B1220] py-24">
        <div className="max-w-6xl mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
              How Magen3 Works
            </h2>
            <p className="text-[#94A3B8] text-lg">
              Three-stage firewall between intent and execution.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: "01",
                title: "Intercept",
                desc: "Every agent action request is captured before it reaches the blockchain.",
                color: "text-[#22D3EE]",
              },
              {
                n: "02",
                title: "Analyze",
                desc: "Magen3 checks the action against your active Shield policies and risk rules.",
                color: "text-[#22D3EE]",
              },
              {
                n: "03",
                title: "Decide & Record",
                desc: "Decision is returned (Allowed / Blocked / Review Required) and recorded on Casper Testnet.",
                color: "text-[#22D3EE]",
              },
            ].map((s) => (
              <div key={s.n} className="relative">
                <div className="text-6xl font-bold font-['Space_Grotesk'] text-[#1E293B] mb-4">
                  {s.n}
                </div>
                <h3 className={`text-xl font-bold ${s.color} mb-3 font-['Space_Grotesk']`}>
                  {s.title}
                </h3>
                <p className="text-[#94A3B8] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Shield Modules */}
      <section className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
            Shield Modules
          </h2>
          <p className="text-[#94A3B8] text-lg">
            Specialized protection layers for every Web3 threat surface.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shieldModulesCatalog.map((m) => (
            <div
              key={m.id}
              className={`${CARD} p-6 hover:border-[#22D3EE]/30 transition-colors`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-[#22D3EE]/10 rounded-lg">
                  <Shield size={20} className="text-[#22D3EE]" />
                </div>
                <StatusBadge
                  status={
                    m.status === "Available"
                      ? "Available"
                      : m.status === "Preview"
                      ? "Preview"
                      : "Coming Soon"
                  }
                />
              </div>
              <h3 className="font-semibold text-[#F8FAFC] mb-2 font-['Space_Grotesk']">
                {m.name}
              </h3>
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                {m.description}
              </p>
              <span className="text-xs text-[#94A3B8] bg-[#0B1220] px-2 py-1 rounded">
                {m.riskCategory}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-b from-[#0B1220] to-[#050B14] py-24">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#22D3EE]/15 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,211,238,0.2)]">
            <ShieldCheck size={32} className="text-[#22D3EE]" />
          </div>
          <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
            Ready to protect your agents?
          </h2>
          <p className="text-[#94A3B8] text-lg mb-10">
            Connect your Casper wallet and deploy your first Shield in minutes.
          </p>
          <Btn variant="primary" size="lg" onClick={onLaunchApp}>
            Launch App <ArrowRight size={18} />
          </Btn>
        </div>
      </section>

      <footer className="border-t border-[#1E293B] py-8 text-center text-sm text-[#94A3B8]/60">
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
  auditLogs,
  policies,
  agents,
  onNavigate,
}: {
  walletConnected: boolean;
  onConnectWallet: () => void;
  walletConnecting: boolean;
  walletError: string;
  auditLogs: AuditLog[];
  policies: Policy[];
  agents: Agent[];
  onNavigate: (p: Page) => void;
}) {
  if (!walletConnected) {
    return (
      <EmptyState
        title="Connect Your Wallet"
        description="Connect your Casper wallet to access the security dashboard and start protecting your agents."
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
              Magen3 now connects to the real Casper Wallet browser extension and uses the active public key for Agent Shield audits.
            </p>
          </div>
        }
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
  const realCasperRecord = auditLogs.some((log) => isRealCasperDeployHash(log.txHash));
  const demoSteps = [
    { label: "Real Casper wallet connected", done: walletConnected },
    { label: "Agent registered", done: agents.length > 0 },
    { label: "Active policy created", done: Boolean(activePolicy) },
    { label: "Action reviewed by Magen3", done: auditLogs.length > 0 },
    { label: "Casper proof confirmed", done: realCasperRecord },
  ];
  const completedDemoSteps = demoSteps.filter((step) => step.done).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Active Shields"
          value={dashboardStats.activeShields}
          icon={<Shield size={20} />}
          color="cyan"
        />
        <StatCard
          label="Protected Actions"
          value={dashboardStats.protectedActions}
          icon={<ShieldCheck size={20} />}
          color="green"
          trend="+12"
        />
        <StatCard
          label="Blocked Actions"
          value={dashboardStats.blockedActions}
          icon={<ShieldX size={20} />}
          color="red"
        />
        <StatCard
          label="Review Required"
          value={dashboardStats.reviewRequired}
          icon={<Clock size={20} />}
          color="amber"
        />
        <StatCard
          label="Casper Records"
          value={dashboardStats.casperAuditRecords}
          icon={<Database size={20} />}
          color="purple"
        />
      </div>

      <div className={`${CARD_GLOW} p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#22D3EE] text-xs font-semibold uppercase tracking-wider mb-2">
              <CheckCircle size={14} />
              Demo Readiness
            </div>
            <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
              {completedDemoSteps}/5 core proof steps complete
            </h2>
            <p className="text-sm text-[#94A3B8] mt-1 max-w-3xl">
              The demo should show a real wallet, an Agent Shield policy decision, database-backed audit history, and a Casper Testnet deploy hash as proof.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="secondary" size="sm" onClick={() => onNavigate("gateway-integration")}>
              Open Gateway Setup
            </Btn>
            <Btn variant="primary" size="sm" onClick={() => onNavigate("audit-log")}>
              Open Casper Proof
            </Btn>
          </div>
        </div>
        <div className="mt-4 grid md:grid-cols-5 gap-2">
          {demoSteps.map((step) => (
            <div key={step.label} className={`rounded-lg border px-3 py-2 text-xs ${
              step.done
                ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#BBF7D0]"
                : "border-[#1E293B] bg-[#0B1220] text-[#94A3B8]"
            }`}>
              <div className="flex items-center gap-1.5">
                {step.done ? <CheckCircle size={13} className="text-[#22C55E]" /> : <Clock size={13} />}
                <span>{step.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className={`${CARD_GLOW} p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_TITLE}>Recent Activity</h2>
            <span className="text-xs text-[#94A3B8]">Last 24h</span>
          </div>
          <div className="space-y-2">
            {recentLogs.map((log) => (
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
                    {log.amount} CSPR · {truncate(log.target)}
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
// Shields Page
// ──────────────────────────────────────────────────────────

function ShieldsPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Shield Modules
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Available and upcoming protection modules for your Web3 stack.
        </p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {shieldModulesCatalog.map((m) => (
          <div key={m.id} className={`${CARD_GLOW} p-6 flex flex-col`}>
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-[#22D3EE]/10 rounded-xl">
                <Shield size={22} className="text-[#22D3EE]" />
              </div>
              <StatusBadge status={m.status as any} />
            </div>
            <h3 className="font-bold text-[#F8FAFC] text-lg mb-2 font-['Space_Grotesk']">
              {m.name}
            </h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed mb-4 flex-1">
              {m.description}
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-[#1E293B]">
              <span className="text-xs text-[#94A3B8] bg-[#0B1220] px-2.5 py-1 rounded-full">
                {m.riskCategory}
              </span>
              {m.status === "Available" ? (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate("agent-shield")}
                >
                  Open Shield
                </Btn>
              ) : (
                <Btn variant="secondary" size="sm" disabled>
                  Coming Soon
                </Btn>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Agent Shield Page
// ──────────────────────────────────────────────────────────

function AgentShieldPage({
  agents,
  onRegisterAgent,
  auditLogs,
}: {
  agents: Agent[];
  onRegisterAgent: (agent: Omit<Agent, "id" | "status" | "createdAt">) => Promise<void> | void;
  auditLogs: AuditLog[];
}) {
  const [form, setForm] = useState({
    name: "",
    type: "DeFi Agent" as AgentType,
    purpose: "",
    permissionLevel: "Limited Execution" as PermissionLevel,
  });

  const registerAgent = useCallback(async () => {
    if (!form.name.trim()) return;
    await onRegisterAgent({
      name: form.name,
      type: form.type,
      purpose: form.purpose,
      permissionLevel: form.permissionLevel,
    });
    setForm({ name: "", type: "DeFi Agent", purpose: "", permissionLevel: "Limited Execution" });
  }, [form, onRegisterAgent]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Agent Shield
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Register and manage AI agents under Magen3 protection.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Registration Form */}
        <div className={`${CARD} p-6 lg:col-span-1`}>
          <h2 className={`${SECTION_TITLE} mb-5`}>Register Agent</h2>
          <div className="space-y-4">
            <InputField
              label="Agent Name"
              value={form.name}
              onChange={(v) => setForm((p) => ({ ...p, name: v }))}
              placeholder="e.g. YieldBot"
            />
            <SelectField
              label="Agent Type"
              value={form.type}
              onChange={(v) => setForm((p) => ({ ...p, type: v as AgentType }))}
              options={[
                "DeFi Agent",
                "Trading Agent",
                "Treasury Agent",
                "RWA Agent",
                "Oracle Agent",
                "Custom Agent",
              ]}
            />
            <div>
              <label className={LABEL_CLS}>Agent Purpose</label>
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={3}
                value={form.purpose}
                onChange={(e) =>
                  setForm((p) => ({ ...p, purpose: e.target.value }))
                }
                placeholder="Describe what this agent does..."
              />
            </div>
            <SelectField
              label="Permission Level"
              value={form.permissionLevel}
              onChange={(v) =>
                setForm((p) => ({
                  ...p,
                  permissionLevel: v as PermissionLevel,
                }))
              }
              options={[
                "Read Only",
                "Limited Execution",
                "Full Execution with Review",
              ]}
            />
            <Btn variant="primary" className="w-full justify-center" onClick={registerAgent}>
              <Plus size={16} />
              Register Agent
            </Btn>
          </div>
        </div>

        {/* Agent List */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className={SECTION_TITLE}>Protected Agents</h2>
          {agents.map((agent) => (
            <div key={agent.id} className={`${CARD_GLOW} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-[#F8FAFC] font-['Space_Grotesk']">
                      {agent.name}
                    </h3>
                    <StatusBadge status={agent.status} />
                  </div>
                  <div className="text-xs text-[#94A3B8]">
                    {agent.id} · {agent.type}
                  </div>
                </div>
                <Btn variant="ghost" size="sm">
                  <Settings size={14} />
                </Btn>
              </div>
              <p className="text-sm text-[#94A3B8] mb-3">{agent.purpose}</p>
              <div className="flex items-center gap-3 pt-3 border-t border-[#1E293B]">
                <span className="text-xs bg-[#0B1220] text-[#94A3B8] px-2.5 py-1 rounded-full">
                  {agent.permissionLevel}
                </span>
                <span className="text-xs text-[#94A3B8]">
                  Registered {fmtTs(agent.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Preview */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-4`}>Agent Activity Preview</h2>
        <div className="space-y-2">
          {auditLogs.slice(0, 3).map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-4 p-3 rounded-lg bg-[#0B1220]"
            >
              <DecisionBadge decision={log.decision} />
              <div className="flex-1">
                <span className="text-sm text-[#F8FAFC]">
                  {log.agentName} · {log.action} · {log.amount} CSPR
                </span>
              </div>
              <RiskBadge risk={log.risk} />
              <span className="text-xs text-[#94A3B8]">
                {fmtTs(log.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Policies Page
// ──────────────────────────────────────────────────────────

function PoliciesPage({
  agents,
  policies,
  onCreatePolicy,
  walletAddress,
}: {
  agents: Agent[];
  policies: Policy[];
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<void> | void;
  walletAddress: string;
}) {
  const [form, setForm] = useState({
    name: "",
    agentId: agents[0]?.id || "",
    maxTransaction: "",
    dailyLimit: "",
    approvalThreshold: "",
    trustedContracts: "",
    blockedActions: [] as string[],
    riskMode: "Balanced" as RiskMode,
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
    });
    setForm({
      name: "",
      agentId: agents[0]?.id || "",
      maxTransaction: "",
      dailyLimit: "",
      approvalThreshold: "",
      trustedContracts: "",
      blockedActions: [],
      riskMode: "Balanced",
    });
  }, [agents, form, onCreatePolicy, walletAddress]);

  const updatePolicy = useCallback(
    (id: string) => {
      console.log("updatePolicy", id);
    },
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Policies
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Create and manage firewall rules for your agents.
        </p>
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
              <label className={LABEL_CLS}>Trusted Contracts</label>
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
                placeholder="One contract address per line"
              />
            </div>
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
                    onClick={() => updatePolicy(pol.id)}
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
                <div className="flex items-center justify-between pt-3 border-t border-[#1E293B] text-xs text-[#94A3B8]">
                  <span>Created {fmtTs(pol.createdAt)}</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span>{pol.policyHash}</span>
                    <button className="hover:text-[#F8FAFC] transition-colors">
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Action Review Page
// ──────────────────────────────────────────────────────────

function ActionReviewPage({
  agents,
  policies,
  auditLogs,
  onAnalyzeAction,
  onAddAuditLog,
  onRecordDecision,
  walletAddress,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  onAnalyzeAction: (request: ActionRequest) => Promise<DecisionResult> | DecisionResult;
  onAddAuditLog: (log: AuditLog) => Promise<void> | void;
  onRecordDecision: (log: AuditLog) => Promise<string> | string;
  walletAddress: string;
}) {
  const [form, setForm] = useState<ActionRequest>({
    agentId: agents[0]?.id || "",
    actionType: "Stake",
    amount: 25,
    target: "",
    targetType: "Trusted Contract",
  });
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recordedTxHash, setRecordedTxHash] = useState("");

  const analyzeAction = useCallback(async () => {
    setAnalyzing(true);
    setResult(null);
    setRecordedTxHash("");
    try {
      const decision = await onAnalyzeAction(form);
      setResult(decision);
    } finally {
      setAnalyzing(false);
    }
  }, [form, onAnalyzeAction]);

  const recordDecisionOnChain = useCallback(async () => {
    if (!result) return;
    const agent = agents.find((a) => a.id === form.agentId);
    const policy = getActivePolicy(policies, form.agentId);
    const log: AuditLog = {
      id: makeId("AUD"),
      timestamp: new Date().toISOString(),
      shield: "Agent Shield",
      agentId: form.agentId,
      agentName: agent?.name || form.agentId,
      action: form.actionType,
      amount: form.amount,
      target: form.target || "No target provided",
      targetType: form.targetType,
      decision: result.decision,
      risk: result.risk,
      reason: result.reason,
      policyUsed: policy?.name || "No active policy",
      walletAddress,
      txHash: "",
      riskScore: result.riskScore,
    };
    const txHash = await onRecordDecision(log);
    setRecordedTxHash(txHash || "saved");
  }, [agents, form, onRecordDecision, policies, result, walletAddress]);

  const approveOnce = useCallback(() => {
    if (!result) return;
    setResult({
      ...result,
      decision: "Allowed",
      risk: result.risk === "High" || result.risk === "Critical" ? "Medium" : result.risk,
      riskScore: Math.min(result.riskScore, 45),
      reason: `${result.reason} User approved this action once for the current session.`,
      recommendedAction: "Record the one-time approval on Casper before execution.",
    });
    setRecordedTxHash("");
  }, [result]);

  const rejectAction = useCallback(async () => {
    if (!result) return;
    const agent = agents.find((a) => a.id === form.agentId);
    const policy = getActivePolicy(policies, form.agentId);
    await onAddAuditLog({
      id: makeId("AUD"),
      timestamp: new Date().toISOString(),
      shield: "Agent Shield",
      agentId: form.agentId,
      agentName: agent?.name || form.agentId,
      action: form.actionType,
      amount: form.amount,
      target: form.target || "No target provided",
      targetType: form.targetType,
      decision: "Blocked",
      risk: result.risk === "Low" ? "Medium" : result.risk,
      reason: "The user rejected this action after Magen3 review.",
      policyUsed: policy?.name || "No active policy",
      walletAddress,
      txHash: "",
      riskScore: Math.max(result.riskScore, 55),
    });
    setResult(null);
    setRecordedTxHash("");
  }, [agents, form, onAddAuditLog, policies, result, walletAddress]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Action Review
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Simulate an AI agent requesting a Web3 action and review the Magen3 decision.
        </p>
      </div>

      {/* Quick examples */}
      <div className="flex gap-3 flex-wrap">
        <span className="text-xs text-[#94A3B8] py-2">Quick examples:</span>
        {sampleActionExamples.map((ex, i) => (
          <button
            key={i}
            onClick={() => {
              setForm({
                agentId: ex.agentId,
                actionType: ex.actionType,
                amount: ex.amount,
                target: ex.target,
                targetType: ex.targetType,
              });
              setResult(null);
              setRecordedTxHash("");
            }}
            className="text-xs px-3 py-1.5 bg-[#1E293B] hover:bg-[#263548] text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg transition-colors"
          >
            Example {i + 1}: {ex.actionType} {ex.amount} CSPR →{" "}
            <span
              className={
                ex.result.decision === "Allowed"
                  ? "text-[#22C55E]"
                  : ex.result.decision === "Blocked"
                  ? "text-[#EF4444]"
                  : "text-[#F59E0B]"
              }
            >
              {ex.result.decision}
            </span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Request Form */}
        <div className={`${CARD} p-6`}>
          <h2 className={`${SECTION_TITLE} mb-5`}>Action Request</h2>
          <div className="space-y-4">
            <SelectField
              label="Agent"
              value={form.agentId}
              onChange={(v) => setForm((p) => ({ ...p, agentId: v }))}
              options={agents.map((a) => a.id)}
            />
            <SelectField
              label="Action Type"
              value={form.actionType}
              onChange={(v) =>
                setForm((p) => ({ ...p, actionType: v as ActionType }))
              }
              options={[
                "Stake",
                "Transfer",
                "Swap",
                "Claim Rewards",
                "Deposit to Vault",
                "Contract Interaction",
                "DAO Treasury Payment",
                "RWA Proof Update",
                "Oracle Data Update",
              ]}
            />
            <InputField
              label="Amount (CSPR)"
              value={String(form.amount)}
              onChange={(v) =>
                setForm((p) => ({ ...p, amount: Number(v) || 0 }))
              }
              type="number"
              placeholder="0"
            />
            <InputField
              label="Target Address / Contract"
              value={form.target}
              onChange={(v) => setForm((p) => ({ ...p, target: v }))}
              placeholder="0x..."
            />
            <SelectField
              label="Target Type"
              value={form.targetType}
              onChange={(v) =>
                setForm((p) => ({ ...p, targetType: v as TargetType }))
              }
              options={[
                "Trusted Contract",
                "Unknown Contract",
                "Wallet Address",
                "DAO Treasury",
                "RWA Registry",
                "Oracle Feed",
              ]}
            />
            <Btn
              variant="primary"
              size="lg"
              className="w-full justify-center"
              onClick={analyzeAction}
              disabled={analyzing}
            >
              {analyzing ? (
                <>
                  <Activity size={16} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Analyze Action
                </>
              )}
            </Btn>
          </div>
        </div>

        {/* Decision Result */}
        <div>
          {!result && !analyzing && (
            <div className={`${CARD} h-full flex items-center justify-center p-10`}>
              <div className="text-center">
                <div className="p-4 bg-[#0B1220] rounded-full w-fit mx-auto mb-4">
                  <FlaskConical size={28} className="text-[#94A3B8]" />
                </div>
                <p className="text-[#94A3B8] text-sm">
                  Fill in the action request and click Analyze.
                </p>
              </div>
            </div>
          )}
          {analyzing && (
            <div className={`${CARD} h-full flex items-center justify-center p-10`}>
              <div className="text-center">
                <div className="p-4 bg-[#22D3EE]/10 rounded-full w-fit mx-auto mb-4 animate-pulse">
                  <Shield size={28} className="text-[#22D3EE]" />
                </div>
                <p className="text-[#94A3B8] text-sm">
                  Running policy checks...
                </p>
              </div>
            </div>
          )}
          {result && !analyzing && (
            <div
              className={`${CARD_GLOW} p-6 border-2 ${
                result.decision === "Allowed"
                  ? "border-[#22C55E]/30"
                  : result.decision === "Blocked"
                  ? "border-[#EF4444]/30"
                  : "border-[#F59E0B]/30"
              }`}
            >
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">
                    Decision
                  </div>
                  <DecisionBadge decision={result.decision} />
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">
                    Risk Score
                  </div>
                  <div
                    className={`text-3xl font-bold font-['Space_Grotesk'] ${
                      result.riskScore < 30
                        ? "text-[#22C55E]"
                        : result.riskScore < 60
                        ? "text-[#F59E0B]"
                        : "text-[#EF4444]"
                    }`}
                  >
                    {result.riskScore}
                    <span className="text-sm font-normal text-[#94A3B8]">
                      /100
                    </span>
                  </div>
                </div>
              </div>

              {result.policyChecksPassed.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">
                    Checks Passed
                  </div>
                  <ul className="space-y-1.5">
                    {result.policyChecksPassed.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm">
                        <CheckCircle
                          size={14}
                          className="text-[#22C55E] mt-0.5 flex-shrink-0"
                        />
                        <span className="text-[#94A3B8]">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.policyChecksFailed.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">
                    Checks Failed
                  </div>
                  <ul className="space-y-1.5">
                    {result.policyChecksFailed.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm">
                        <XCircle
                          size={14}
                          className="text-[#EF4444] mt-0.5 flex-shrink-0"
                        />
                        <span className="text-[#94A3B8]">{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-[#0B1220] rounded-lg p-4 mb-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">
                  Reason
                </div>
                <p className="text-sm text-[#F8FAFC]">{result.reason}</p>
              </div>

              <div className="bg-[#0B1220] rounded-lg p-4 mb-5">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">
                  Recommended Next Step
                </div>
                <p className="text-sm text-[#F8FAFC]">
                  {result.recommendedAction}
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {recordedTxHash ? (
                  <div className="flex flex-col gap-1 text-sm text-[#22C55E]">
                    <span className="flex items-center gap-2"><CheckCircle size={16} /> Saved to Audit Log</span>
                    <span className="font-mono text-xs text-[#94A3B8]">Open Audit Log to prepare and confirm real Casper proof.</span>
                  </div>
                ) : (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={recordDecisionOnChain}
                  >
                    <Database size={14} />
                    Save Audit Log
                  </Btn>
                )}
                {result.decision === "Review Required" && (
                  <Btn variant="secondary" size="sm" onClick={approveOnce}>
                    <CheckCircle size={14} />
                    Approve Once
                  </Btn>
                )}
                {result.decision !== "Allowed" && (
                  <Btn variant="danger" size="sm" onClick={rejectAction}>
                    <X size={14} />
                    Reject
                  </Btn>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// Gateway Integration Page
// ──────────────────────────────────────────────────────────

function GatewayIntegrationPage({
  agents,
  policies,
  auditLogs,
  walletAddress,
  apiOnline,
  onNavigate,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
  walletAddress: string;
  apiOnline: boolean;
  onNavigate: (p: Page) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [casperStatus, setCasperStatus] = useState<Record<string, unknown> | null>(null);
  const activeAgent = agents[0];
  const activePolicy = activeAgent ? getActivePolicy(policies, activeAgent.id) : undefined;
  const gatewayUrl = `${api.baseUrl}/api/agent-gateway/intents`;
  const lastRequest = auditLogs.find((log) => log.shield === "Agent Shield" && log.agentId === activeAgent?.id) || auditLogs[0];

  useEffect(() => {
    let cancelled = false;
    api.casperStatus()
      .then((response) => {
        if (!cancelled) setCasperStatus(response.casper || null);
      })
      .catch(() => {
        if (!cancelled) setCasperStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyText = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  }, []);

  const snippet = `const response = await fetch("${gatewayUrl}", {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-magen3-agent-key": process.env.MAGEN3_AGENT_KEY || ""\n  },\n  body: JSON.stringify({\n    source: "yieldbot-ai",\n    agentId: "${activeAgent?.id || "MAG-AGENT-..."}",\n    walletAddress: "${walletAddress || "CASPER_PUBLIC_KEY"}",\n    goal: "Stake 15 CSPR to trusted-validator-demo",\n    action: {\n      type: "Stake",\n      amount: 15,\n      asset: "CSPR",\n      target: "trusted-validator-demo",\n      targetType: "Trusted Contract"\n    }\n  })\n});\n\nconst decision = await response.json();\nif (!decision.executionApproved) {\n  throw new Error(decision.result.reason);\n}\n// Only now should the external agent request wallet signing.`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#22D3EE] text-xs font-semibold uppercase tracking-wider mb-2">
            <Server size={14} /> External Agent Integration
          </div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
            Gateway Integration
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1 max-w-3xl">
            Magen3 is now the admin and security gateway. External agents such as YieldBot connect here through API, then ask Magen3 before signing or executing Web3 actions.
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={() => onNavigate("agent-shield")}>
            <Bot size={16} /> Register Agent
          </Btn>
          <Btn variant="primary" onClick={() => onNavigate("policies")}>
            <ShieldCheck size={16} /> Manage Policy
          </Btn>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className={`${CARD_GLOW} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={SECTION_TITLE}>Connection Status</h2>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${apiOnline ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]" : "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"}`}>
              {apiOnline ? "API Online" : "API Offline"}
            </span>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Owner Wallet</div>
              <div className="mt-1 font-mono text-[#F8FAFC] break-all">{walletAddress || "Connect Casper Wallet"}</div>
            </div>
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Registered Agents</div>
              <div className="mt-1 text-[#F8FAFC]">{agents.length}</div>
            </div>
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Active Policy</div>
              <div className="mt-1 text-[#F8FAFC]">{activePolicy?.name || "No active policy yet"}</div>
            </div>
          </div>
        </div>

        <div className={`${CARD_GLOW} p-5 lg:col-span-2 space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className={SECTION_TITLE}>Gateway Details</h2>
              <p className="text-xs text-[#94A3B8] mt-1">Copy these into an external agent app like YieldBot AI.</p>
            </div>
            <Btn variant="outline" size="sm" onClick={() => copyText("snippet", snippet)}>
              <Copy size={14} /> {copied === "snippet" ? "Copied" : "Copy Code"}
            </Btn>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#94A3B8] uppercase tracking-wider">Gateway URL</span>
                <button className="text-[#22D3EE]" onClick={() => copyText("gateway", gatewayUrl)}><Copy size={13} /></button>
              </div>
              <div className="mt-1 font-mono text-xs text-[#F8FAFC] break-all">{gatewayUrl}</div>
            </div>
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#94A3B8] uppercase tracking-wider">Agent ID</span>
                {activeAgent && <button className="text-[#22D3EE]" onClick={() => copyText("agent", activeAgent.id)}><Copy size={13} /></button>}
              </div>
              <div className="mt-1 font-mono text-xs text-[#F8FAFC] break-all">{activeAgent?.id || "Register an agent first"}</div>
            </div>
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Casper Contract</div>
              <div className="mt-1 font-mono text-xs text-[#F8FAFC] break-all">{String(casperStatus?.contractHash || DEPLOYED_MAGEN3_CONTRACT_HASH || "Not configured")}</div>
            </div>
            <div className="rounded-xl bg-[#050B14] border border-[#1E293B] p-3">
              <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Gateway Rule</div>
              <div className="mt-1 text-xs text-[#F8FAFC]">External agents must stop unless Magen3 returns <span className="text-[#22C55E]">Allowed</span>.</div>
            </div>
          </div>
          {copied && <div className="text-xs text-[#22C55E]">Copied {copied} to clipboard.</div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${CARD} p-5`}>
          <h2 className={`${SECTION_TITLE} mb-4`}>External Agent Handshake</h2>
          <div className="space-y-3">
            {[
              ["1", "External agent prepares action", "YieldBot decides it wants to stake, swap, transfer, or call a contract."],
              ["2", "Agent calls Magen3 Gateway", "Magen3 checks wallet ownership, registered agent, policy, amount, target, and risk."],
              ["3", "Magen3 returns decision", "Allowed actions can request wallet signing. Blocked/review actions must stop."],
              ["4", "Audit and proof update", "Magen3 stores the decision, Casper proof, and later the execution hash."],
            ].map(([step, title, desc]) => (
              <div key={step} className="flex gap-3 rounded-xl border border-[#1E293B] bg-[#050B14] p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#22D3EE]/10 text-[#22D3EE] text-xs font-bold">{step}</div>
                <div>
                  <div className="text-sm font-semibold text-[#F8FAFC]">{title}</div>
                  <div className="text-xs text-[#94A3B8] mt-1">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_TITLE}>Latest Gateway Activity</h2>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("audit-log")}>
              View Audit Log <ChevronRight size={14} />
            </Btn>
          </div>
          {lastRequest ? (
            <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[#F8FAFC]">{lastRequest.agentName}</div>
                  <div className="text-xs text-[#94A3B8]">{fmtTs(lastRequest.timestamp)} · {lastRequest.action}</div>
                </div>
                <DecisionBadge decision={lastRequest.decision} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-[#94A3B8]">Amount</span><div className="text-[#F8FAFC]">{lastRequest.amount} CSPR</div></div>
                <div><span className="text-[#94A3B8]">Risk</span><div><RiskBadge risk={lastRequest.risk} /></div></div>
                <div className="col-span-2"><span className="text-[#94A3B8]">Target</span><div className="text-[#F8FAFC] break-all">{lastRequest.target}</div></div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No gateway requests yet"
              description="Connect an external agent like YieldBot AI. Its requests will appear here and in Audit Log."
              action={<Btn variant="secondary" onClick={() => onNavigate("agent-shield")}>Register Agent</Btn>}
            />
          )}
        </div>
      </div>

      <div className={`${CARD_GLOW} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={SECTION_TITLE}>Integration Code</h2>
          <Btn variant="secondary" size="sm" onClick={() => copyText("code", snippet)}>
            <Copy size={14} /> {copied === "code" ? "Copied" : "Copy"}
          </Btn>
        </div>
        <pre className="overflow-x-auto rounded-xl bg-[#050B14] border border-[#1E293B] p-4 text-xs text-[#94A3B8]"><code>{snippet}</code></pre>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Agent Runner Page
// ──────────────────────────────────────────────────────────

function AgentRunnerPage({
  agents,
  policies,
  walletAddress,
  onNavigate,
  onSubmitGatewayIntent,
}: {
  agents: Agent[];
  policies: Policy[];
  walletAddress: string;
  onNavigate: (p: Page) => void;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
}) {
  const initialAgentId = pickAgentForRunner(agents, policies, "");
  const [agentId, setAgentId] = useState(initialAgentId);
  const [goal, setGoal] = useState("Stake 15 CSPR to trusted-validator-demo");
  const [proposal, setProposal] = useState<AgentRunnerProposal | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [gatewayResponse, setGatewayResponse] = useState<AgentGatewayResponse | null>(null);
  const [gatewayError, setGatewayError] = useState("");
  const [copiedCurl, setCopiedCurl] = useState(false);

  useEffect(() => {
    if (!agentId && agents.length > 0) {
      setAgentId(pickAgentForRunner(agents, policies, ""));
    }
  }, [agentId, agents, policies]);

  const activePolicy = getActivePolicy(policies, agentId);
  const selectedAgent = agents.find((agent) => agent.id === agentId);

  const quickGoals = [
    "Stake 15 CSPR to trusted-validator-demo",
    "Transfer 9000 CSPR to unknown-wallet",
    "Call unknown contract to mint 5000 tokens",
    "Claim 8 CSPR rewards from trusted staking contract",
    "Send 300 CSPR DAO treasury payment to contributor-wallet",
  ];

  const generateAction = useCallback(() => {
    if (!goal.trim() || !agentId) return;
    setProposal(buildAgentRunnerProposal(goal, agentId));
    setResult(null);
    setGatewayResponse(null);
    setGatewayError("");
  }, [agentId, goal]);

  const gatewayIntent = useMemo(() => {
    if (!proposal) return null;
    return {
      source: "magen3-ui-agent-gateway",
      agentId: proposal.request.agentId,
      walletAddress,
      goal: proposal.rawGoal,
      reason: proposal.summary,
      action: {
        type: proposal.request.actionType,
        amount: proposal.request.amount,
        asset: "CSPR",
        target: proposal.request.target,
        targetType: proposal.request.targetType,
      },
    };
  }, [proposal, walletAddress]);

  const gatewayCurl = useMemo(() => {
    if (!gatewayIntent) return "";
    return `curl -X POST "${api.baseUrl}/api/agent-gateway/intents" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(gatewayIntent)}'`;
  }, [gatewayIntent]);

  const copyGatewayCurl = useCallback(async () => {
    if (!gatewayCurl) return;
    try {
      await navigator.clipboard.writeText(gatewayCurl);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    } catch {
      setGatewayError("Could not copy the curl command. You can still select it manually.");
    }
  }, [gatewayCurl]);

  const reviewProposal = useCallback(async () => {
    if (!gatewayIntent) return;
    setAnalyzing(true);
    setResult(null);
    setGatewayResponse(null);
    setGatewayError("");
    try {
      const response = await onSubmitGatewayIntent(gatewayIntent);
      setGatewayResponse(response);
      setResult(response.result);
    } catch (error) {
      setGatewayError(error instanceof Error ? error.message : "Agent Gateway request failed");
    } finally {
      setAnalyzing(false);
    }
  }, [gatewayIntent, onSubmitGatewayIntent]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#22D3EE] mb-3">
            <Bot size={13} /> Agent Gateway API
          </div>
          <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
            Real agent gateway
          </h1>
          <p className="text-[#94A3B8] text-sm mt-1 max-w-3xl">
            Use the same API endpoint an external AI agent would call before wallet signing or contract execution. The UI below is only a gateway lab for sending real API requests.
          </p>
        </div>
        <Btn variant="secondary" size="sm" onClick={() => onNavigate("audit-log")}>
          Open Audit Log <ArrowRight size={14} />
        </Btn>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        {[
          { label: "1. Intent", desc: "External agent calls API", icon: <Bot size={18} /> },
          { label: "2. Gateway", desc: "Magen3 validates request", icon: <Zap size={18} /> },
          { label: "3. Decision", desc: "Policy engine approves/blocks", icon: <Shield size={18} /> },
          { label: "4. Proof", desc: "Audit log + Casper payload", icon: <Database size={18} /> },
        ].map((step) => (
          <div key={step.label} className={`${CARD} p-4`}>
            <div className="flex items-center gap-2 text-[#22D3EE] mb-2">
              {step.icon}
              <span className="text-xs font-semibold uppercase tracking-wider">{step.label}</span>
            </div>
            <p className="text-sm text-[#F8FAFC] font-medium">{step.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className={`${CARD} p-6 xl:col-span-1`}>
          <h2 className={`${SECTION_TITLE} mb-5`}>Gateway Test Request</h2>
          <div className="space-y-4">
            <SelectField
              label="Agent"
              value={agentId}
              onChange={(v) => {
                setAgentId(v);
                setProposal(null);
                setResult(null);
                setGatewayResponse(null);
    setGatewayError("");
              }}
              options={agents.map((agent) => agent.id)}
            />

            <div className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
              <div className="flex items-center justify-between gap-3 text-xs mb-2">
                <span className="text-[#94A3B8] uppercase tracking-wider">Selected Agent</span>
                <StatusBadge status={selectedAgent?.status || "No Policy"} />
              </div>
              <div className="text-sm text-[#F8FAFC] font-semibold">{selectedAgent?.name || "No agent selected"}</div>
              <div className="text-xs text-[#94A3B8] mt-1">{selectedAgent?.type || "Register an agent first"}</div>
              <div className="mt-3 border-t border-[#1E293B] pt-3 text-xs text-[#94A3B8]">
                Active policy: <span className="text-[#F8FAFC]">{activePolicy?.name || "None"}</span>
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Agent Goal / Intent</label>
              <textarea
                className={`${INPUT_CLS} min-h-32 resize-none`}
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  setProposal(null);
                  setResult(null);
                  setGatewayResponse(null);
    setGatewayError("");
                }}
                placeholder="Example: Stake 15 CSPR to trusted-validator-demo"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {quickGoals.map((quickGoal) => (
                <button
                  key={quickGoal}
                  onClick={() => {
                    setGoal(quickGoal);
                    setProposal(null);
                    setResult(null);
                    setGatewayResponse(null);
    setGatewayError("");
                  }}
                  className="rounded-lg bg-[#1E293B] px-3 py-1.5 text-left text-xs text-[#94A3B8] transition-colors hover:bg-[#263548] hover:text-[#F8FAFC]"
                >
                  {quickGoal}
                </button>
              ))}
            </div>

            <Btn variant="primary" size="lg" className="w-full justify-center" onClick={generateAction} disabled={!agentId || !goal.trim()}>
              <Zap size={16} /> Build Gateway Request
            </Btn>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-6">
          <div className={`${CARD_GLOW} p-6`}>
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className={SECTION_TITLE}>Structured Agent Intent</h2>
                <p className="text-xs text-[#94A3B8] mt-1">This JSON is submitted to the real /api/agent-gateway/intents endpoint.</p>
              </div>
              {proposal && (
                <span className="rounded-full border border-[#22D3EE]/20 bg-[#22D3EE]/10 px-3 py-1 text-xs font-semibold text-[#22D3EE]">
                  {proposal.confidence}% confidence
                </span>
              )}
            </div>

            {!proposal ? (
              <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-10 text-center">
                <Bot size={30} className="mx-auto mb-3 text-[#94A3B8]" />
                <p className="text-sm text-[#94A3B8]">Build the gateway request to begin the real API test.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-[#0B1220] p-4">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Gateway Summary</div>
                  <p className="text-sm text-[#F8FAFC]">{proposal.summary}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  {[
                    ["Action Type", proposal.request.actionType],
                    ["Amount", `${proposal.request.amount} CSPR`],
                    ["Target", proposal.request.target],
                    ["Target Type", proposal.request.targetType],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                      <div className="text-[11px] text-[#94A3B8] uppercase tracking-wider mb-1">{label}</div>
                      <div className="font-mono text-[#F8FAFC] break-all">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Intent Parsing</div>
                    <ul className="space-y-1.5">
                      {proposal.reasoning.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                          <ChevronRight size={14} className="mt-0.5 flex-shrink-0 text-[#22D3EE]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Gateway Rules</div>
                    <ul className="space-y-1.5">
                      {proposal.executionPlan.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                          <ShieldCheck size={14} className="mt-0.5 flex-shrink-0 text-[#22C55E]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {gatewayIntent && (
                  <div className="rounded-lg border border-[#1E293B] bg-[#020617] p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-xs text-[#94A3B8] uppercase tracking-wider">External Agent API Call</div>
                      <button onClick={copyGatewayCurl} className="text-xs text-[#22D3EE] hover:text-[#F8FAFC]">
                        {copiedCurl ? "Copied" : "Copy curl"}
                      </button>
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-[#94A3B8]">{gatewayCurl}</pre>
                  </div>
                )}

                <Btn variant="primary" size="md" onClick={reviewProposal} disabled={analyzing}>
                  {analyzing ? <Activity size={16} className="animate-spin" /> : <Shield size={16} />}
                  {analyzing ? "Calling Agent Gateway..." : "Submit to Agent Gateway API"}
                </Btn>
              </div>
            )}
          </div>

          <div className={`${CARD_GLOW} p-6`}>
            <h2 className={`${SECTION_TITLE} mb-5`}>Agent Gateway Decision</h2>
            {gatewayError && (
              <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{gatewayError}</div>
            )}
            {!result && !analyzing && (
              <div className="rounded-xl border border-dashed border-[#1E293B] bg-[#0B1220] p-10 text-center">
                <Shield size={30} className="mx-auto mb-3 text-[#94A3B8]" />
                <p className="text-sm text-[#94A3B8]">The gateway request has not been submitted yet.</p>
              </div>
            )}
            {analyzing && (
              <div className="rounded-xl bg-[#0B1220] p-10 text-center">
                <Activity size={30} className="mx-auto mb-3 animate-spin text-[#22D3EE]" />
                <p className="text-sm text-[#94A3B8]">Calling the real backend gateway, checking policy limits, trusted targets, blocked actions, and daily exposure...</p>
              </div>
            )}
            {result && !analyzing && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <DecisionBadge decision={result.decision} />
                    <RiskBadge risk={result.risk} />
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider">Risk Score</div>
                    <div className="text-3xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">{result.riskScore}<span className="text-sm text-[#94A3B8]">/100</span></div>
                  </div>
                </div>

                <div className="rounded-lg bg-[#0B1220] p-4">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Decision Reason</div>
                  <p className="text-sm text-[#F8FAFC]">{result.reason}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Passed</div>
                    <ul className="space-y-1.5">
                      {result.policyChecksPassed.length === 0 ? (
                        <li className="text-sm text-[#94A3B8]">No passing checks.</li>
                      ) : result.policyChecksPassed.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                          <CheckCircle size={14} className="mt-0.5 flex-shrink-0 text-[#22C55E]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">Failed / Review Flags</div>
                    <ul className="space-y-1.5">
                      {result.policyChecksFailed.length === 0 ? (
                        <li className="text-sm text-[#94A3B8]">No failed checks.</li>
                      ) : result.policyChecksFailed.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[#94A3B8]">
                          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-[#F59E0B]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[#1E293B] pt-4">
                  {gatewayResponse?.auditLog ? (
                    <div className="flex flex-col gap-1 text-sm text-[#22C55E]">
                      <span className="flex items-center gap-2"><CheckCircle size={16} /> Gateway request saved to audit log</span>
                      <span className="font-mono text-xs text-[#94A3B8]">{gatewayResponse.auditLog.id} · {gatewayResponse.gatewayRequest.status}</span>
                      <span className="text-xs text-[#94A3B8]">{gatewayResponse.nextAction}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-[#94A3B8]">Submit the request to create a real audit log.</span>
                  )}
                  <Btn variant="secondary" size="sm" onClick={() => onNavigate("audit-log")}>
                    Open Audit Log / Casper Proof <ExternalLink size={14} />
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-3`}>Why this matters</h2>
        <p className="text-sm text-[#94A3B8] leading-relaxed">
          This page now uses a real backend gateway endpoint. An external AI agent can call the same API with a structured Web3 intent, and Magen3 will approve, block, or pause the action before any wallet signature or contract execution.
        </p>
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────
// External Agent Demo Page
// ──────────────────────────────────────────────────────────

type ExternalAgentMessage = {
  id: string;
  role: "user" | "agent" | "magen3" | "system";
  text: string;
  decision?: Decision;
  risk?: Risk;
  auditLogId?: string;
};

function ExternalAgentDemoPage({
  agents,
  policies,
  walletAddress,
  onNavigate,
  onSubmitGatewayIntent,
  onConfirmExecutionDeploy,
  onSignApprovedExecution,
}: {
  agents: Agent[];
  policies: Policy[];
  walletAddress: string;
  onNavigate: (p: Page) => void;
  onSubmitGatewayIntent: (intent: Record<string, unknown>, apiKey?: string) => Promise<AgentGatewayResponse>;
  onConfirmExecutionDeploy: (id: string, deployHash: string, signedBy?: string, note?: string) => Promise<AuditLog>;
  onSignApprovedExecution: (response: AgentGatewayResponse) => Promise<AuditLog>;
}) {
  const initialAgentId = pickAgentForRunner(agents, policies, "");
  const [agentId, setAgentId] = useState(initialAgentId);
  const [gatewayUrl] = useState(`${api.baseUrl}/api/agent-gateway/intents`);
  const [apiKey, setApiKey] = useState("");
  const [task, setTask] = useState("Stake 15 CSPR to trusted-validator-demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latestResponse, setLatestResponse] = useState<AgentGatewayResponse | null>(null);
  const [executionHash, setExecutionHash] = useState("");
  const [executionSaving, setExecutionSaving] = useState(false);
  const [executionSigning, setExecutionSigning] = useState(false);
  const [messages, setMessages] = useState<ExternalAgentMessage[]>([
    {
      id: makeId("MSG"),
      role: "agent",
      text: "YieldBot is connected to Magen3 Gateway. Give me a Web3 task and I will ask Magen3 before I try to execute anything.",
    },
  ]);

  useEffect(() => {
    if (!agentId && agents.length > 0) {
      setAgentId(pickAgentForRunner(agents, policies, ""));
    }
  }, [agentId, agents, policies]);

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const activePolicy = getActivePolicy(policies, agentId);

  const quickTasks = [
    "Stake 15 CSPR to trusted-validator-demo",
    "Transfer 9000 CSPR to unknown-wallet",
    "Deposit 75 CSPR into approved yield vault",
    "Call unknown contract to mint 5000 tokens",
  ];

  const appendMessage = useCallback((message: Omit<ExternalAgentMessage, "id">) => {
    setMessages((prev) => [...prev, { id: makeId("MSG"), ...message }]);
  }, []);

  const submitTask = useCallback(async () => {
    if (!task.trim() || !agentId) return;
    setBusy(true);
    setError("");
    setLatestResponse(null);
    setExecutionHash("");

    const proposal = buildAgentRunnerProposal(task, agentId);
    const intent = {
      source: selectedAgent?.name || "YieldBot external agent",
      agentId: proposal.request.agentId,
      walletAddress,
      goal: proposal.rawGoal,
      reason: "External agent user requested this task. The agent is checking Magen3 before execution.",
      action: {
        type: proposal.request.actionType,
        amount: proposal.request.amount,
        asset: "CSPR",
        target: proposal.request.target,
        targetType: proposal.request.targetType,
      },
    };

    appendMessage({ role: "user", text: task.trim() });
    appendMessage({
      role: "agent",
      text: `I prepared a ${proposal.request.actionType} action for ${proposal.request.amount} CSPR. Before execution, I am sending it to Magen3 Gateway for policy approval.`,
    });
    appendMessage({
      role: "system",
      text: `POST ${gatewayUrl} · agentId=${proposal.request.agentId}`,
    });

    try {
      const response = await onSubmitGatewayIntent(intent, apiKey.trim() || undefined);
      setLatestResponse(response);
      const result = response.result;
      const agentText =
        result.decision === "Allowed"
          ? `Magen3 approved this action. Risk: ${result.risk}. I am now waiting for the wallet owner to sign the real transaction. After signing, I will attach the execution hash back to Magen3.`
          : result.decision === "Blocked"
          ? `Magen3 blocked this action. Risk: ${result.risk}. I will stop and will not ask the wallet to sign it.`
          : `Magen3 says this needs human review. Risk: ${result.risk}. I will pause until an admin approves or rejects it.`;

      appendMessage({
        role: "magen3",
        decision: result.decision,
        risk: result.risk,
        auditLogId: response.auditLog?.id,
        text: `${result.decision} — ${result.reason}`,
      });
      appendMessage({ role: "agent", text: agentText });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reach Magen3 Gateway.";
      setError(message);
      appendMessage({ role: "agent", text: `I could not complete the safety check because Magen3 Gateway returned an error: ${message}` });
    } finally {
      setBusy(false);
    }
  }, [agentId, apiKey, appendMessage, gatewayUrl, onSubmitGatewayIntent, selectedAgent?.name, task, walletAddress]);

  const attachExecutionHash = useCallback(async () => {
    if (!latestResponse?.auditLog?.id) return;
    const normalized = normalizeCasperDeployHash(executionHash);
    if (!isRealCasperDeployHash(normalized)) {
      setError("Paste the real 64-character Casper execution deploy hash returned after the wallet signs.");
      return;
    }
    setExecutionSaving(true);
    setError("");
    try {
      const updated = await onConfirmExecutionDeploy(
        latestResponse.auditLog.id,
        normalized,
        walletAddress,
        "External agent action executed after Magen3 approval."
      );
      setLatestResponse((prev) => prev ? { ...prev, auditLog: updated } : prev);
      appendMessage({
        role: "agent",
        text: `Execution hash attached to Magen3 audit: ${truncate(normalized, 18)}. The audit now shows both the Magen3 decision proof and the real execution proof.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not attach execution hash.";
      setError(message);
      appendMessage({ role: "agent", text: `I could not attach the execution hash to Magen3: ${message}` });
    } finally {
      setExecutionSaving(false);
    }
  }, [appendMessage, executionHash, latestResponse?.auditLog?.id, onConfirmExecutionDeploy, walletAddress]);

  const signApprovedExecution = useCallback(async () => {
    if (!latestResponse?.executionApproved) return;
    if (!walletAddress) {
      setError("Connect Casper Wallet before signing approved execution.");
      return;
    }

    setExecutionSigning(true);
    setError("");
    appendMessage({
      role: "agent",
      text: "Magen3 approved this intent. I am now requesting the connected Casper Wallet to sign the approved execution proof.",
    });

    try {
      const updated = await onSignApprovedExecution(latestResponse);
      setLatestResponse((prev) => prev ? { ...prev, auditLog: updated } : prev);
      const hash = normalizeCasperDeployHash(updated.executionTxHash || "");
      setExecutionHash(hash);
      appendMessage({
        role: "agent",
        text: `Wallet signature complete. Casper returned execution deploy hash ${truncate(hash, 18)} and Magen3 attached it to the audit record.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallet signing or Casper submission failed.";
      setError(message);
      appendMessage({
        role: "agent",
        text: `I could not complete the wallet-signed execution proof: ${message}`,
      });
    } finally {
      setExecutionSigning(false);
    }
  }, [appendMessage, latestResponse, onSignApprovedExecution, walletAddress]);

  const messageStyles: Record<ExternalAgentMessage["role"], string> = {
    user: "ml-auto bg-[#22D3EE] text-[#050B14]",
    agent: "bg-[#1E293B] text-[#F8FAFC] border border-[#334155]",
    magen3: "bg-[#0B1220] text-[#F8FAFC] border border-[#22D3EE]/30",
    system: "bg-[#050B14] text-[#94A3B8] border border-[#1E293B] font-mono text-xs",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-[#22D3EE] text-xs font-semibold mb-3">
            <Server size={14} /> External Agent Demo
          </div>
          <h1 className="text-3xl font-bold text-[#F8FAFC] font-['Space_Grotesk'] mb-2">
            Customer Agent using Magen3
          </h1>
          <p className="text-[#94A3B8] max-w-3xl">
            This screen behaves like a separate AI agent owned by a customer. The agent receives a task, calls the Magen3 Gateway API, then shows the Magen3 decision inside its own chat before any execution.
          </p>
        </div>
        <Btn variant="outline" onClick={() => onNavigate("audit-log")}>
          Open Magen3 Audit Log <ExternalLink size={16} />
        </Btn>
      </div>

      <div className="grid xl:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-5">
          <div className={`${CARD_GLOW} p-5`}>
            <h2 className={`${SECTION_TITLE} mb-4`}>Agent Connection</h2>
            <div className="space-y-4">
              <SelectField
                label="Registered Magen3 Agent"
                value={agentId}
                onChange={setAgentId}
                options={agents.map((agent) => agent.id)}
              />
              <InputField label="Gateway URL" value={gatewayUrl} onChange={() => undefined} />
              <InputField
                label="Optional Agent API Key"
                value={apiKey}
                onChange={setApiKey}
                placeholder="Only needed if AGENT_GATEWAY_API_KEY is enabled"
              />
              <div className="rounded-lg bg-[#0B1220] border border-[#1E293B] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-[#94A3B8] uppercase tracking-wider">Agent</span>
                  <StatusBadge status={selectedAgent?.status || "No Policy"} />
                </div>
                <div className="text-sm text-[#F8FAFC] font-medium">{selectedAgent?.name || "No agent selected"}</div>
                <div className="text-xs text-[#94A3B8]">{selectedAgent?.purpose || "Register an agent in Magen3 first."}</div>
                <div className="border-t border-[#1E293B] pt-3">
                  <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-1">Active Policy</div>
                  <div className="text-sm text-[#F8FAFC]">{activePolicy?.name || "No active policy"}</div>
                  {activePolicy && (
                    <div className="text-xs text-[#94A3B8] mt-1">
                      Max {activePolicy.maxTransaction} CSPR · Review above {activePolicy.approvalThreshold} CSPR
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-lg bg-[#050B14] border border-[#1E293B] p-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-2">What this proves</div>
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  The customer is no longer clicking actions inside Magen3. Their own agent calls Magen3 and receives the safety decision back in the agent experience.
                </p>
              </div>
            </div>
          </div>

          {latestResponse && (
            <div className={`${CARD_GLOW} p-5`}>
              <h2 className={`${SECTION_TITLE} mb-4`}>Latest Gateway Response</h2>
              <div className="flex items-center gap-2 mb-4">
                <DecisionBadge decision={latestResponse.result.decision} />
                <RiskBadge risk={latestResponse.result.risk} />
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-[#94A3B8]">Execution approved</span>
                  <span className={latestResponse.executionApproved ? "text-[#22C55E]" : "text-[#F59E0B]"}>{latestResponse.executionApproved ? "Yes" : "No"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[#94A3B8]">Audit ID</span>
                  <span className="text-[#F8FAFC] font-mono text-xs">{latestResponse.auditLog.id}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[#94A3B8]">Gateway status</span>
                  <span className="text-[#F8FAFC] font-mono text-xs">{latestResponse.gatewayRequest.status}</span>
                </div>
              </div>
              {latestResponse.executionApproved && (
                <div className="mt-5 rounded-xl border border-[#22C55E]/20 bg-[#050B14] p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle size={16} className="mt-0.5 text-[#22C55E]" />
                    <div>
                      <div className="text-sm font-semibold text-[#F8FAFC]">Approved Execution</div>
                      <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                        Magen3 approved the intent. The same connected Casper Wallet can now sign an on-chain execution proof. The deploy hash is submitted to Casper and attached to this audit automatically.
                      </p>
                    </div>
                  </div>
                  <Btn
                    variant="primary"
                    size="sm"
                    className="w-full justify-center"
                    onClick={signApprovedExecution}
                    disabled={executionSigning || Boolean(latestResponse.auditLog.executionTxHash)}
                  >
                    {executionSigning ? <Activity size={14} className="animate-spin" /> : <Wallet size={14} />}
                    {latestResponse.auditLog.executionTxHash ? "Execution Signed" : "Sign with Connected Casper Wallet"}
                  </Btn>
                  <div className="border-t border-[#1E293B] pt-3 space-y-3">
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      Manual fallback: if wallet signing fails, submit the approved execution with CLI and paste the returned deploy hash below.
                    </p>
                    <InputField
                      label="Manual Execution Deploy Hash"
                      value={executionHash}
                      onChange={setExecutionHash}
                      placeholder="Paste real Casper deploy hash after wallet/CLI signing"
                    />
                    <Btn
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center"
                      onClick={attachExecutionHash}
                      disabled={executionSaving || !executionHash.trim()}
                    >
                      {executionSaving ? <Activity size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      Attach Manual Hash
                    </Btn>
                  </div>
                  {latestResponse.auditLog.executionTxHash && (
                    <a
                      href={casperDeployUrl(latestResponse.auditLog.executionTxHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#22D3EE] hover:text-[#F8FAFC]"
                    >
                      View execution on CSPR.live <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
              <Btn variant="secondary" size="sm" className="mt-4 w-full justify-center" onClick={() => onNavigate("audit-log")}>
                View audit proof <ExternalLink size={14} />
              </Btn>
            </div>
          )}
        </div>

        <div className={`${CARD_GLOW} overflow-hidden`}>
          <div className="border-b border-[#1E293B] p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#22D3EE]/15 flex items-center justify-center shadow-[0_0_16px_rgba(34,211,238,0.25)]">
                <Bot size={22} className="text-[#22D3EE]" />
              </div>
              <div>
                <div className="text-lg font-bold text-[#F8FAFC] font-['Space_Grotesk']">{selectedAgent?.name || "YieldBot"}</div>
                <div className="text-xs text-[#94A3B8]">Customer AI agent · Protected by Magen3 Gateway</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/30 bg-[#22C55E]/10 px-3 py-1 text-xs font-semibold text-[#22C55E]">
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" /> Connected
            </span>
          </div>

          <div className="h-[520px] overflow-y-auto p-5 space-y-4 bg-[#070D18]">
            {messages.map((message) => (
              <div key={message.id} className={`max-w-[82%] rounded-2xl px-4 py-3 ${messageStyles[message.role]} ${message.role === "user" ? "rounded-br-sm" : "rounded-bl-sm"}`}>
                <div className="mb-1 text-[10px] uppercase tracking-wider opacity-70">
                  {message.role === "user" ? "Customer" : message.role === "magen3" ? "Magen3 Gateway" : message.role === "system" ? "API call" : selectedAgent?.name || "YieldBot"}
                </div>
                <div className="text-sm leading-relaxed">{message.text}</div>
                {message.decision && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <DecisionBadge decision={message.decision} />
                    {message.risk && <RiskBadge risk={message.risk} />}
                    {message.auditLogId && <span className="text-xs font-mono text-[#94A3B8]">{message.auditLogId}</span>}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="max-w-[82%] rounded-2xl rounded-bl-sm bg-[#1E293B] border border-[#334155] px-4 py-3 text-[#F8FAFC]">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-[#94A3B8]">{selectedAgent?.name || "YieldBot"}</div>
                <div className="flex items-center gap-2 text-sm text-[#94A3B8]"><Activity size={14} className="animate-spin text-[#22D3EE]" /> Waiting for Magen3 Gateway decision...</div>
              </div>
            )}
          </div>

          <div className="border-t border-[#1E293B] p-5 bg-[#0B1220]">
            <div className="flex flex-wrap gap-2 mb-4">
              {quickTasks.map((quick) => (
                <button
                  key={quick}
                  onClick={() => setTask(quick)}
                  className="rounded-full border border-[#1E293B] bg-[#111827] px-3 py-1.5 text-xs text-[#94A3B8] hover:border-[#22D3EE]/40 hover:text-[#22D3EE] transition-colors"
                >
                  {quick}
                </button>
              ))}
            </div>
            {error && <div className="mb-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#FCA5A5]">{error}</div>}
            <div className="flex flex-col md:flex-row gap-3">
              <input
                className={`${INPUT_CLS} flex-1`}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Ask the agent to do a Web3 task..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) submitTask();
                }}
              />
              <Btn variant="primary" onClick={submitTask} disabled={busy || !agentId || !task.trim()}>
                {busy ? <Activity size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Send to Agent
              </Btn>
            </div>
            <p className="text-xs text-[#94A3B8] mt-3">
              The agent first asks Magen3. If approved, the wallet owner signs the real transaction and the execution hash is attached to the Magen3 audit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Audit Log Page
// ──────────────────────────────────────────────────────────

function AuditLogPage({
  auditLogs,
  onRecordAuditLog,
  onPrepareCasperPayload,
  onConfirmCasperDeploy,
  onConfirmExecutionDeploy,
}: {
  auditLogs: AuditLog[];
  onRecordAuditLog: (id: string) => Promise<string> | string;
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
    try {
      await navigator.clipboard.writeText(body);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 1500);
    } catch {
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
        selected.walletAddress,
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
    const txHash = await onRecordAuditLog(logId);
    setSelected((prev) => (prev && prev.id === logId ? { ...prev, txHash } : prev));
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
          <option className="bg-[#0B1220]">Contract Shield</option>
          <option className="bg-[#0B1220]">DAO Shield</option>
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
                  "Decision Proof",
                  "Execution",
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
                    {log.amount} CSPR
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
                      <span className="text-[#94A3B8]/40">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {log.executionTxHash && isRealCasperDeployHash(log.executionTxHash) ? (
                      <a
                        href={casperDeployUrl(log.executionTxHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[#22C55E] hover:text-[#F8FAFC]"
                      >
                        <span>{truncate(normalizeCasperDeployHash(log.executionTxHash))}</span>
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span className="text-[#94A3B8]/40">{executionProofStatus(log.executionStatus || "", log.executionTxHash || "").label}</span>
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative bg-[#0B1220] border-l border-[#1E293B] w-full max-w-lg overflow-y-auto shadow-2xl">
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
              {[
                ["Decision ID", selected.id],
                ["Wallet Address", selected.walletAddress],
                ["Agent ID", selected.agentId],
                ["Policy Used", selected.policyUsed],
                ["Shield Type", selected.shield],
                ["Action Type", selected.action],
                ["Target", selected.target],
                ["Amount", `${selected.amount} CSPR`],
                ["Risk Score", `${selected.riskScore}/100`],
                ["Timestamp", fmtTs(selected.timestamp)],
                [
                  "Transaction Hash",
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

              {(() => {
                const proof = casperProofStatus(selected.txHash);
                const realDeploy = isRealCasperDeployHash(selected.txHash);
                const normalizedTxHash = normalizeCasperDeployHash(selected.txHash);
                return (
                  <div className="rounded-xl border border-[#22D3EE]/20 bg-[#050B14] p-4 space-y-3 shadow-[0_0_20px_rgba(34,211,238,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold font-['Space_Grotesk']">
                          <ShieldCheck size={16} className="text-[#22D3EE]" />
                          Casper Proof
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-1">
                          Verifies that this Magen3 decision was anchored to Casper Testnet.
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
                        <span className="text-[#94A3B8] uppercase tracking-wider">Deploy Hash</span>
                        <div className={`font-mono mt-1 break-all ${realDeploy ? "text-[#22D3EE]" : "text-[#F8FAFC]"}`}>
                          {selected.txHash ? normalizedTxHash : "Not confirmed yet"}
                        </div>
                      </div>
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
                            View deploy on CSPR.live
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <div className="text-[#94A3B8] mt-1">Available after you confirm a real Casper deploy hash.</div>
                        )}
                      </div>
                    </div>

                    <details className="border-t border-[#1E293B] pt-3">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[#94A3B8] hover:text-[#22D3EE]">
                        Advanced manual Casper proof fallback
                      </summary>
                      <div className="mt-3 space-y-2">
                        <InputField
                          label={realDeploy ? "Replace Real Casper Deploy Hash" : "Real Casper Deploy Hash"}
                          value={deployHash}
                          onChange={setDeployHash}
                          placeholder="Paste 64-character deploy hash from casper-client"
                        />
                        <Btn
                          variant="outline"
                          size="sm"
                          className="w-full justify-center"
                          onClick={confirmDeployHash}
                          disabled={!deployHash.trim() || casperLoading}
                        >
                          <CheckCircle size={14} />
                          {realDeploy ? "Update Casper Proof" : "Confirm Real Deploy Hash"}
                        </Btn>
                      </div>
                    </details>
                  </div>
                );
              })()}

              {(() => {
                const executionStatus = executionProofStatus(selected.executionStatus || "", selected.executionTxHash || "");
                const realExecution = isRealCasperDeployHash(selected.executionTxHash || "");
                const canAttachExecution = selected.decision === "Allowed";
                return (
                  <div className="rounded-xl border border-[#22C55E]/20 bg-[#050B14] p-4 space-y-3 shadow-[0_0_20px_rgba(34,197,94,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold font-['Space_Grotesk']">
                          <Send size={16} className="text-[#22C55E]" />
                          Execution Proof
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-1">
                          Shows whether the approved action was actually signed and submitted after Magen3 allowed it.
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${executionStatus.className}`}>
                        {executionStatus.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Execution Status</span>
                        <div className="text-[#F8FAFC] mt-1">{selected.executionStatus || "not_submitted"}</div>
                      </div>
                      <div>
                        <span className="text-[#94A3B8] uppercase tracking-wider">Signed By</span>
                        <div className="text-[#F8FAFC] mt-1 break-all">{selected.executionSignedBy || "Waiting for wallet signature"}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Execution Deploy Hash</span>
                        <div className={`font-mono mt-1 break-all ${realExecution ? "text-[#22C55E]" : "text-[#F8FAFC]"}`}>
                          {selected.executionTxHash ? normalizeCasperDeployHash(selected.executionTxHash) : "Not executed yet"}
                        </div>
                      </div>
                      {selected.executionNote && (
                        <div className="col-span-2">
                          <span className="text-[#94A3B8] uppercase tracking-wider">Execution Note</span>
                          <div className="text-[#F8FAFC] mt-1">{selected.executionNote}</div>
                        </div>
                      )}
                      <div className="col-span-2">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Explorer</span>
                        {realExecution ? (
                          <a
                            href={casperDeployUrl(selected.executionTxHash || "")}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1.5 text-[#22C55E] hover:text-[#F8FAFC]"
                          >
                            View execution on CSPR.live
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          <div className="text-[#94A3B8] mt-1">Available after a real approved transaction is signed and submitted.</div>
                        )}
                      </div>
                    </div>

                    {canAttachExecution ? (
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
                      Casper Recorder
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Prepare the runtime args, sign the real Casper deploy, then paste the real deploy hash after signing.
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
                    {casperLoading ? "Preparing..." : "Prepare Payload"}
                  </Btn>
                  {!selected.txHash && (
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={() => recordAuditOnChain(selected.id)}
                      disabled={casperLoading}
                    >
                      <Database size={14} />
                      Record Disabled
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
                        <span className="text-[#94A3B8] uppercase tracking-wider">Payload Hash</span>
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
// Settings Page
// ──────────────────────────────────────────────────────────

function SettingsPage({
  agents,
  policies,
  auditLogs,
}: {
  agents: Agent[];
  policies: Policy[];
  auditLogs: AuditLog[];
}) {
  const [devMode, setDevMode] = useState(false);
  const [riskMode, setRiskMode] = useState("Balanced");
  const [notifications, setNotifications] = useState({
    blocked: true,
    review: true,
    allowed: false,
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
          Settings
        </h1>
        <p className="text-[#94A3B8] text-sm mt-1">
          Configure your Magen3 environment and preferences.
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
            <div className="w-2 h-2 rounded-full bg-[#FF3B3B] animate-pulse" />
            <span className="text-sm text-[#FF3B3B] font-semibold">
              Casper Testnet
            </span>
          </div>
        </div>
      </div>

      {/* Risk */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-4`}>Default Risk Mode</h2>
        <div className="grid grid-cols-3 gap-3">
          {["Conservative", "Balanced", "Aggressive"].map((m) => (
            <button
              key={m}
              onClick={() => setRiskMode(m)}
              className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                riskMode === m
                  ? m === "Conservative"
                    ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]"
                    : m === "Balanced"
                    ? "border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]"
                    : "border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]"
                  : "border-[#1E293B] text-[#94A3B8] hover:border-[#94A3B8]/30"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-4`}>Notification Preferences</h2>
        <div className="space-y-3">
          {[
            {
              key: "blocked",
              label: "Blocked Actions",
              desc: "Alert when an action is blocked",
            },
            {
              key: "review",
              label: "Review Required",
              desc: "Alert when manual review is needed",
            },
            {
              key: "allowed",
              label: "Allowed Actions",
              desc: "Alert when an action is approved",
            },
          ].map((n) => (
            <div
              key={n.key}
              className="flex items-center justify-between py-2"
            >
              <div>
                <div className="text-sm font-medium text-[#F8FAFC]">
                  {n.label}
                </div>
                <div className="text-xs text-[#94A3B8]">{n.desc}</div>
              </div>
              <button
                onClick={() =>
                  setNotifications((p) => ({
                    ...p,
                    [n.key]: !p[n.key as keyof typeof p],
                  }))
                }
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  notifications[n.key as keyof typeof notifications]
                    ? "bg-[#22D3EE]"
                    : "bg-[#1E293B]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    notifications[n.key as keyof typeof notifications]
                      ? "translate-x-5"
                      : ""
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* API / Integration */}
      <div className={`${CARD} p-5`}>
        <h2 className={`${SECTION_TITLE} mb-1`}>API / Integration</h2>
        <p className="text-xs text-[#94A3B8] mb-4">
          Placeholder for backend API keys and webhook configuration.
        </p>
        <div className="space-y-3">
          <InputField
            label="API Endpoint"
            value=""
            onChange={() => {}}
            placeholder="https://api.magen3.io/v1"
          />
          <InputField
            label="API Key"
            value=""
            onChange={() => {}}
            placeholder="mag3_sk_..."
            type="password"
          />
          <Btn variant="secondary" size="sm">
            Save Integration
          </Btn>
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
            className={`relative w-11 h-6 rounded-full transition-colors ${
              devMode ? "bg-[#22D3EE]" : "bg-[#1E293B]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);

  useEffect(() => {
    let cancelled = false;

    if (!walletConnected || !walletAddress) {
      setAgents([]);
      setPolicies([]);
      setAuditLogs([]);
      return () => {
        cancelled = true;
      };
    }

    api.bootstrap(walletAddress)
      .then((payload) => {
        if (cancelled) return;
        if (Array.isArray(payload.agents)) setAgents(payload.agents as Agent[]);
        if (Array.isArray(payload.policies)) setPolicies(payload.policies as Policy[]);
        if (Array.isArray(payload.auditLogs)) setAuditLogs(payload.auditLogs as AuditLog[]);
        setApiOnline(true);
      })
      .catch(() => {
        if (!cancelled) {
          setApiOnline(false);
          setAgents([]);
          setPolicies([]);
          setAuditLogs([]);
        }
      });
    return () => {
      cancelled = true;
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

  const onRegisterAgent = useCallback(async (agent: Omit<Agent, "id" | "status" | "createdAt">) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before registering an agent.");
      return;
    }

    try {
      const response = await api.createAgent({ ...agent, walletAddress, ownerWalletAddress: walletAddress });
      setAgents((prev) => [response.agent as Agent, ...prev]);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to register agent.");
    }
  }, [walletAddress]);

  const onCreatePolicy = useCallback(async (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => {
    if (!walletAddress) {
      setWalletError("Connect Casper Wallet before creating a policy.");
      return;
    }

    try {
      const response = await api.createPolicy({ ...policy, walletAddress });
      setPolicies((prev) => [response.policy as Policy, ...prev]);
      if (Array.isArray(response.agents)) setAgents(response.agents as Agent[]);
      if (response.auditLog) setAuditLogs((prev) => [response.auditLog as AuditLog, ...prev]);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to create policy.");
    }
  }, [walletAddress]);

  const onAnalyzeAction = useCallback(async (request: ActionRequest) => {
    try {
      const response = await api.analyzeAction({ ...request, walletAddress } as unknown as Record<string, unknown>);
      setApiOnline(true);
      return response.result as DecisionResult;
    } catch (error) {
      setApiOnline(false);
      return {
        decision: "Blocked",
        risk: "High",
        riskScore: 90,
        policyChecksPassed: [],
        policyChecksFailed: ["Magen3 backend could not verify this action"],
        reason: error instanceof Error ? error.message : "Magen3 could not reach the real policy engine.",
        recommendedAction: "Do not execute until the Magen3 API is online and the connected wallet is verified.",
      } as DecisionResult;
    }
  }, [walletAddress]);

  const onAddAuditLog = useCallback(async (log: AuditLog) => {
    try {
      const response = await api.createAuditLog({ ...log, walletAddress } as unknown as Record<string, unknown>);
      setAuditLogs((prev) => [response.auditLog as AuditLog, ...prev]);
      setApiOnline(true);
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to save audit log.");
    }
  }, [walletAddress]);

  const onRecordDecision = useCallback(async (log: AuditLog) => {
    try {
      const created = await api.createAuditLog({ ...log, walletAddress } as unknown as Record<string, unknown>);
      const auditLog = created.auditLog as AuditLog;
      setAuditLogs((prev) => [auditLog, ...prev]);
      setApiOnline(true);
      return "";
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Unable to save decision.");
      return "";
    }
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
    setApiOnline(true);
    return response;
  }, []);

  const onRecordAuditLog = useCallback(async (id: string) => {
    try {
      await api.recordAuditLog(id);
      setApiOnline(true);
      return "";
    } catch (error) {
      setApiOnline(false);
      setWalletError(error instanceof Error ? error.message : "Automatic recording is disabled. Use a real Casper deploy hash.");
      return "";
    }
  }, []);

  const navigate = useCallback((p: Page) => {
    setPage(p);
  }, []);

  if (page === "landing") {
    return (
      <LandingPage onLaunchApp={() => setPage("dashboard")} />
    );
  }

  const pageComponents: Record<Exclude<Page, "landing">, ReactElement> = {
    dashboard: (
      <DashboardPage
        walletConnected={walletConnected}
        onConnectWallet={connectWallet}
        walletConnecting={walletConnecting}
        walletError={walletError}
        auditLogs={auditLogs}
        policies={policies}
        agents={agents}
        onNavigate={navigate}
      />
    ),
    shields: <ShieldsPage onNavigate={navigate} />,
    "agent-shield": (
      <AgentShieldPage
        agents={agents}
        onRegisterAgent={onRegisterAgent}
        auditLogs={auditLogs}
      />
    ),
    "gateway-integration": (
      <GatewayIntegrationPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        walletAddress={walletAddress}
        apiOnline={apiOnline}
        onNavigate={navigate}
      />
    ),
    policies: (
      <PoliciesPage
        agents={agents}
        policies={policies}
        onCreatePolicy={onCreatePolicy}
        walletAddress={walletAddress}
      />
    ),
    "action-review": (
      <ActionReviewPage
        agents={agents}
        policies={policies}
        auditLogs={auditLogs}
        onAnalyzeAction={onAnalyzeAction}
        onAddAuditLog={onAddAuditLog}
        onRecordDecision={onRecordDecision}
        walletAddress={walletAddress}
      />
    ),
    "audit-log": (
      <AuditLogPage
        auditLogs={auditLogs}
        onRecordAuditLog={onRecordAuditLog}
        onPrepareCasperPayload={onPrepareCasperPayload}
        onConfirmCasperDeploy={onConfirmCasperDeploy}
        onConfirmExecutionDeploy={onConfirmExecutionDeploy}
      />
    ),
    settings: (
      <SettingsPage agents={agents} policies={policies} auditLogs={auditLogs} />
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
        <main className="flex-1 p-6 overflow-auto">
          {pageComponents[page as Exclude<Page, "landing">]}
        </main>
      </div>
    </div>
  );
}
