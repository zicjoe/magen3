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
  | "settings"
  | "docs";

type Decision = "Allowed" | "Blocked" | "Review Required";
type Risk = "Low" | "Medium" | "High" | "Critical";
type ShieldStatus = "Available" | "Preview" | "Coming Soon";
type ShieldGroup = "Execution Shields" | "Infrastructure Shields" | "Intelligence Shields";
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
  status: "Active" | "Revoked";
  createdAt: string;
  ownerWalletAddress?: string;
  apiKey?: string;
  apiKeyPreview?: string;
  apiKeyIssuedAt?: string;
  apiKeyRotatedAt?: string;
  revokedAt?: string;
}

type AgentRegistrationDraft = Pick<Agent, "name" | "type" | "purpose" | "permissionLevel">;

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
  group: ShieldGroup;
  riskCategory: string;
  icon: string;
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
  nextAction: string;
}

// ──────────────────────────────────────────────────────────
// Static Catalog
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
    group: "Execution Shields",
    riskCategory: "Agent Execution",
    icon: "bot",
  },
  {
    id: "shield-wallet",
    name: "Wallet Shield",
    description:
      "Review transaction requests, spending limits, and wallet-connected execution before signing.",
    status: "Preview",
    group: "Execution Shields",
    riskCategory: "Wallet Execution",
    icon: "wallet",
  },
  {
    id: "shield-contract",
    name: "Contract Shield",
    description:
      "Analyze risky smart-contract interactions, upgrades, and admin permission changes.",
    status: "Preview",
    group: "Execution Shields",
    riskCategory: "Smart Contract",
    icon: "code",
  },
  {
    id: "shield-dao",
    name: "DAO Shield",
    description:
      "Verify that treasury execution matches approved governance decisions.",
    status: "Preview",
    group: "Execution Shields",
    riskCategory: "Governance",
    icon: "building",
  },
  {
    id: "shield-bridge",
    name: "Bridge Shield",
    description:
      "Check bridge routes, destination addresses, and transfer constraints before cross-chain movement.",
    status: "Preview",
    group: "Infrastructure Shields",
    riskCategory: "Cross-chain Bridge",
    icon: "globe",
  },
  {
    id: "shield-oracle",
    name: "Oracle Shield",
    description:
      "Detect suspicious data updates before they trigger on-chain decisions.",
    status: "Preview",
    group: "Infrastructure Shields",
    riskCategory: "Data Feed",
    icon: "globe",
  },
  {
    id: "shield-access",
    name: "Access Shield",
    description:
      "Review privileged access, signer roles, admin changes, and sensitive permissions.",
    status: "Preview",
    group: "Infrastructure Shields",
    riskCategory: "Access Control",
    icon: "lock",
  },
  {
    id: "shield-rwa",
    name: "RWA Shield",
    description:
      "Check asset verification, proof expiry, and risk status before protocol action.",
    status: "Preview",
    group: "Intelligence Shields",
    riskCategory: "Real World Assets",
    icon: "database",
  },
  {
    id: "shield-simulation",
    name: "Simulation Shield",
    description:
      "Simulate high-risk execution paths and highlight policy conflicts before approval.",
    status: "Preview",
    group: "Intelligence Shields",
    riskCategory: "Execution Simulation",
    icon: "activity",
  },
  {
    id: "shield-threat-intel",
    name: "Threat Intel Shield",
    description:
      "Use risk signals and known threat patterns to flag unsafe targets or behavior.",
    status: "Preview",
    group: "Intelligence Shields",
    riskCategory: "Threat Intelligence",
    icon: "shield",
  },
];

const shieldModuleGroups: { group: ShieldGroup; description: string; modules: ShieldModule[] }[] = [
  {
    group: "Execution Shields",
    description: "Policy checks for actions that directly reach wallets, contracts, agents, or DAOs.",
    modules: shieldModulesCatalog.filter((module) => module.group === "Execution Shields"),
  },
  {
    group: "Infrastructure Shields",
    description: "Controls for bridge, oracle, and access-control surfaces that can amplify execution risk.",
    modules: shieldModulesCatalog.filter((module) => module.group === "Infrastructure Shields"),
  },
  {
    group: "Intelligence Shields",
    description: "Risk intelligence and simulation layers for context-aware execution decisions.",
    modules: shieldModulesCatalog.filter((module) => module.group === "Intelligence Shields"),
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

function decisionProofStatus(log: AuditLog) {
  if (isRealCasperDeployHash(log.txHash)) return { label: "Recorded on Casper", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (log.decisionProofStatus === "failed") return { label: "Relayer Failed", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (log.decisionProofStatus === "queued") return { label: "Queued for Relayer", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (log.decisionProofStatus === "not_recordable") return { label: "Not Recordable", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  return casperProofStatus(log.txHash);
}

function executionProofStatus(status = "", txHash = "") {
  if (isRealCasperDeployHash(txHash)) return { label: "Executed", className: "bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30" };
  if (status === "approved_pending_signature") return { label: "Waiting for signature", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "blocked_not_submitted") return { label: "Blocked before execution", className: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" };
  if (status === "review_required_not_submitted") return { label: "Review required", className: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20" };
  if (status === "not_required") return { label: "Not required", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
  return { label: "Not submitted", className: "bg-[#94A3B8]/10 text-[#94A3B8] border-[#94A3B8]/20" };
}

function executionProofExplanation(log: AuditLog) {
  if (isRealCasperDeployHash(log.executionTxHash || "")) {
    return "The approved action was signed and submitted. The execution deploy hash is the real Casper transaction footprint.";
  }
  if (log.executionStatus === "blocked_not_submitted" || log.decision === "Blocked") {
    return "No execution hash exists because Magen3 blocked this action before wallet signing.";
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
  status: "Available" | "Preview" | "Coming Soon" | "Active" | "Inactive" | "Policy Active" | "No Policy" | "Paused" | "Revoked";
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
  { id: "shields", label: "Shield Modules", icon: <Shield size={18} /> },
  { id: "connected-agents", label: "Connected Agents", icon: <Bot size={18} /> },
  { id: "policies", label: "Policies", icon: <FileText size={18} /> },
  { id: "audit-log", label: "Audit Logs", icon: <Scroll size={18} /> },
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
      className={`flex flex-col bg-[#0B1220] border-r border-[#1E293B] ${collapsed ? "w-16" : "w-60"} min-h-screen`}
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
          <a href="#shield-modules" className="hover:text-[#F8FAFC] transition-colors">
            Shield Modules
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
            Protect wallets, AI agents, smart contracts, DAOs, RWA protocols, and
            oracle-driven actions before unsafe execution reaches the blockchain.
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
              { v: "Live", l: "Casper Wallet" },
              { v: "10", l: "Shield Modules" },
              { v: "On-chain", l: "Decision Proof" },
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
      <section id="how-it-works" className="bg-[#0B1220] py-24">
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

      {/* Shield Modules */}
      <section id="shield-modules" className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold font-['Space_Grotesk'] mb-4">
            Shield Modules
          </h2>
          <p className="text-[#94A3B8] text-lg">
            Specialized protection layers for every Web3 threat surface.
          </p>
        </div>
        <div className="space-y-10">
          {shieldModuleGroups.map((group) => (
            <div key={group.group}>
              <div className="mb-4">
                <h3 className="font-['Space_Grotesk'] text-xl font-semibold text-[#F8FAFC]">
                  {group.group}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[#94A3B8]">
                  {group.description}
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.modules.map((m) => (
                  <div
                    key={m.id}
                    className={`${CARD} p-6 hover:border-[#22D3EE]/30`}
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
                    <h4 className="font-semibold text-[#F8FAFC] mb-2 font-['Space_Grotesk']">
                      {m.name}
                    </h4>
                    <p className="text-sm text-[#94A3B8] leading-relaxed mb-4">
                      {m.description}
                    </p>
                    <span className="text-xs text-[#94A3B8] bg-[#0B1220] px-2 py-1 rounded">
                      {m.riskCategory}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
            Connect your Casper wallet and deploy your first Shield in minutes.
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
  const operationalItems = [
    { label: "Connected wallet", value: "Active", done: walletConnected },
    { label: "Registered agents", value: String(agents.length), done: agents.length > 0 },
    { label: "Active policies", value: String(policies.filter((policy) => policy.status === "Active").length), done: Boolean(activePolicy) },
    { label: "Audit records", value: String(auditLogs.length), done: auditLogs.length > 0 },
    { label: "Casper proofs", value: String(dashboardStats.casperAuditRecords), done: dashboardStats.casperAuditRecords > 0 },
  ];

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
              <Activity size={14} />
              Gateway Status
            </div>
            <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">
              Real wallet-scoped activity
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
        <div className="mt-4 grid md:grid-cols-5 gap-2">
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
      <div className="space-y-8">
        {shieldModuleGroups.map((group) => (
          <section key={group.group} className="space-y-4">
            <div>
              <h2 className="font-['Space_Grotesk'] text-lg font-semibold text-[#F8FAFC]">
                {group.group}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[#94A3B8]">
                {group.description}
              </p>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {group.modules.map((m) => (
                <div key={m.id} className={`${CARD_GLOW} p-6 flex flex-col`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-[#22D3EE]/10 rounded-xl">
                      <Shield size={22} className="text-[#22D3EE]" />
                    </div>
                    <StatusBadge status={m.status} />
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
                        onClick={() => onNavigate("connected-agents")}
                      >
                        Open Shield
                      </Btn>
                    ) : (
                      <Btn variant="secondary" size="sm" disabled>
                        Preview
                      </Btn>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
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
  auditLogs,
  walletAddress,
  apiOnline,
}: {
  agents: Agent[];
  policies: Policy[];
  onRegisterAgent: (agent: AgentRegistrationDraft) => Promise<Agent | undefined> | Agent | undefined;
  onRotateAgentApiKey: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  onRevokeAgent: (id: string) => Promise<Agent | undefined> | Agent | undefined;
  auditLogs: AuditLog[];
  walletAddress: string;
  apiOnline: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "DeFi Agent" as AgentType,
    purpose: "",
    permissionLevel: "Limited Execution" as PermissionLevel,
  });
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

  const registerAgent = useCallback(async () => {
    if (!form.name.trim()) return;
    const created = await onRegisterAgent({
      name: form.name,
      type: form.type,
      purpose: form.purpose,
      permissionLevel: form.permissionLevel,
    });
    if (created) {
      setLatestCredentials(created);
      setSelectedAgentId(created.id);
      setShowRegister(false);
    }
    setForm({ name: "", type: "DeFi Agent", purpose: "", permissionLevel: "Limited Execution" });
  }, [form, onRegisterAgent]);

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

  const agentAuditLogs = selectedAgent
    ? auditLogs.filter((log) => log.agentId === selectedAgent.id).slice(0, 5)
    : [];
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
      agent.type.toLowerCase().includes(query);
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
                placeholder="Search by name, ID, or type"
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
              const latestLog = auditLogs.find((log) => log.agentId === agent.id);
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
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-[#050B14] p-2">
                      <div className="text-[#94A3B8]">Type</div>
                      <div className="truncate text-[#F8FAFC]">{agent.type}</div>
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
              { id: "security", label: "Security", icon: Lock },
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
                    <div className="mt-2 text-xs text-[#94A3B8]">{selectedAgent.type} · {selectedAgent.permissionLevel}</div>
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
                                {log.action} · {log.amount} CSPR
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

      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowRegister(false)} />
          <div className={`${CARD_GLOW} relative w-full max-w-xl p-6`}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[#F8FAFC]">Register External Agent</h2>
                <p className="text-sm text-[#94A3B8] mt-1">
                  Add the external app or autonomous agent that will call Magen3 before execution.
                </p>
              </div>
              <button
                onClick={() => setShowRegister(false)}
                className="p-2 text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <InputField
                label="Agent Name"
                value={form.name}
                onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="e.g. YieldBot AI"
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
                  onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                  placeholder="Describe what this external agent does..."
                />
              </div>
              <SelectField
                label="Permission Level"
                value={form.permissionLevel}
                onChange={(v) => setForm((p) => ({ ...p, permissionLevel: v as PermissionLevel }))}
                options={[
                  "Read Only",
                  "Limited Execution",
                  "Full Execution with Review",
                ]}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Btn variant="secondary" onClick={() => setShowRegister(false)}>
                  Cancel
                </Btn>
                <Btn variant="primary" onClick={registerAgent}>
                  <Plus size={16} /> Register Agent
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
// Policies Page
// ──────────────────────────────────────────────────────────

function PoliciesPage({
  agents,
  policies,
  onCreatePolicy,
  onUpdatePolicy,
  walletAddress,
}: {
  agents: Agent[];
  policies: Policy[];
  onCreatePolicy: (policy: Omit<Policy, "id" | "createdAt" | "policyHash">) => Promise<void> | void;
  onUpdatePolicy: (id: string, policy: Partial<Policy>) => Promise<void> | void;
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
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [copiedPolicyHash, setCopiedPolicyHash] = useState("");
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
    trustedContracts: "",
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

  const openPolicyEditor = useCallback((policy: Policy) => {
    setEditingPolicy(policy);
    setEditForm({
      name: policy.name,
      maxTransaction: String(policy.maxTransaction),
      dailyLimit: String(policy.dailyLimit),
      approvalThreshold: String(policy.approvalThreshold),
      trustedContracts: policy.trustedContracts.join("\n"),
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
    });
    setEditingPolicy(null);
  }, [editForm, editingPolicy, onUpdatePolicy]);

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
              <div className="grid md:grid-cols-2 gap-3">
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
                      <span className="text-[#94A3B8]/70">{decisionProofStatus(log).label}</span>
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
                ["Amount", `${selected.amount} CSPR`],
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

              <div className="rounded-xl border border-[#1E293B] bg-[#050B14] p-4">
                <div className="text-xs text-[#94A3B8] uppercase tracking-wider mb-3">Proof Timeline</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["Intent received", "Complete", "text-[#22C55E]"],
                    ["Magen3 decision", selected.decision, selected.decision === "Blocked" ? "text-[#EF4444]" : selected.decision === "Review Required" ? "text-[#F59E0B]" : "text-[#22C55E]"],
                    ["Casper decision proof", decisionProofStatus(selected).label, isRealCasperDeployHash(selected.txHash) ? "text-[#22C55E]" : selected.decisionProofStatus === "failed" ? "text-[#EF4444]" : "text-[#F59E0B]"],
                    ["Execution proof", executionProofStatus(selected.executionStatus || "", selected.executionTxHash || "").label, isRealCasperDeployHash(selected.executionTxHash || "") ? "text-[#22C55E]" : "text-[#94A3B8]"],
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
                const realExecution = isRealCasperDeployHash(selected.executionTxHash || "");
                const canAttachExecution = selected.decision === "Allowed";
                return (
                  <div className="rounded-xl border border-[#22C55E]/20 bg-[#050B14] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold font-['Space_Grotesk']">
                          <Send size={16} className="text-[#22C55E]" />
                          Execution Proof
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-1">
                          Shows whether the execution wallet actually signed and submitted the approved action.
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
                          {selected.executionTxHash ? normalizeCasperDeployHash(selected.executionTxHash) : "None"}
                        </div>
                      </div>
                      <div className="col-span-2 rounded-lg border border-[#1E293B] bg-[#0B1220] p-3">
                        <span className="text-[#94A3B8] uppercase tracking-wider">Why</span>
                        <div className="text-[#F8FAFC] mt-1">{executionProofExplanation(selected)}</div>
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
                          <div className="text-[#94A3B8] mt-1">
                            {selected.decision === "Allowed"
                              ? "Available after the execution wallet signs and submits the approved Casper transaction."
                              : "No execution explorer link is expected because this action was not approved for execution."}
                          </div>
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
    group: "Shield Modules",
    items: [
      { id: "shield-modules-doc", label: "Shield Overview" },
      { id: "shield-modules-doc", label: "Execution Shields" },
      { id: "shield-modules-doc", label: "Infrastructure Shields" },
      { id: "shield-modules-doc", label: "Intelligence Shields" },
      { id: "agent-shield-doc", label: "Agent Shield" },
    ],
  },
  {
    group: "Agent Shield",
    items: [
      { id: "connected-agents-doc", label: "Connected Agents" },
      { id: "api-keys-doc", label: "Agent API Keys" },
      { id: "agent-flow-doc", label: "Agent Gateway Flow" },
      { id: "api-request-doc", label: "Integration Examples" },
      { id: "case-study-doc", label: "Case Study: Lobstar Wilde" },
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
  { id: "shield-modules-doc", label: "Shield Modules" },
  { id: "agent-flow-doc", label: "Agent Shield Flow" },
  { id: "connected-agents-doc", label: "Connected Agents" },
  { id: "api-keys-doc", label: "Agent API Keys" },
  { id: "api-request-doc", label: "Gateway API" },
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
    new Set(["Getting Started", "Shield Modules", "Agent Shield"])
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
              Developer and security documentation for Magen3 Shield modules, policy enforcement,
              agent gateway integrations, and Casper decision proofs.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <DocsBadge label="Casper Testnet" variant="warning" />
              <DocsBadge label="Cross-chain Gateway" variant="info" />
              <DocsBadge label="Modular Shields" variant="info" />
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
                  Magen3 is a modular Web3 security gateway for execution protection. It checks risky
                  actions from AI agents, smart contracts, DAOs, RWA workflows, and oracle-driven systems
                  before those actions reach the blockchain or target execution environment.
                </p>
                <p className="mt-4 text-base leading-relaxed text-[#94A3B8]">
                  Magen3 sits between <span className="font-semibold text-[#F8FAFC]">intent</span> and{" "}
                  <span className="font-semibold text-[#F8FAFC]">execution</span>. It gives Web3 teams a
                  policy layer, gateway layer, and audit layer for controlling high-risk actions before
                  wallet signing or protocol execution.
                </p>
              </section>

              <section id="architecture" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Platform Architecture</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Magen3 is built around four layers that work together to protect high-risk Web3 actions.
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      icon: Layers,
                      title: "Shield Modules",
                      desc: "Protection modules for different Web3 execution surfaces.",
                    },
                    {
                      icon: FileText,
                      title: "Policy Engine",
                      desc: "Rules that decide whether an action is Allowed, Blocked, or requires Review.",
                    },
                    {
                      icon: Server,
                      title: "Gateway API",
                      desc: "External agents and apps submit chain-aware action intents before execution.",
                    },
                    {
                      icon: Database,
                      title: "Casper Decision Proofs",
                      desc: "Policy decisions can be recorded on Casper for verifiable audit trails.",
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
                    "Connect Casper Wallet as the owner wallet.",
                    "Register a Connected Agent and copy the one-time API key.",
                    "Create an active policy for that agent.",
                    "Send agent intents to the Magen3 Gateway before wallet signing.",
                    "Review audit logs and attach Casper decision proofs.",
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
                <h2 className={SECTION_TITLE}>Shield Modules</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Magen3 is not only Agent Shield. Agent Shield is the first live module; the broader
                  platform is designed around grouped Shields for different execution surfaces.
                </p>
                <div className="mt-5 space-y-5">
                  {shieldModuleGroups.map((group) => (
                    <div key={group.group} className="overflow-hidden rounded-xl border border-[#1E293B]">
                      <div className="border-b border-[#1E293B] bg-[#0B1220] px-4 py-3">
                        <h3 className="font-['Space_Grotesk'] text-sm font-semibold text-[#F8FAFC]">
                          {group.group}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">
                          {group.description}
                        </p>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-[#050B14]">
                          <tr className="border-b border-[#1E293B]">
                            {["Shield", "Status", "Purpose"].map((heading) => (
                              <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E293B]">
                          {group.modules.map((module) => (
                            <tr key={module.id} className="bg-[#111827]">
                              <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{module.name}</td>
                              <td className="px-4 py-3">
                                <DocsBadge
                                  label={module.status === "Available" ? "Live" : module.status}
                                  variant={module.status === "Available" ? "live" : "preview"}
                                />
                              </td>
                              <td className="px-4 py-3 text-[#94A3B8]">{module.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <div className="mt-5">
                  <DocsCallout type="info">
                    <span className="font-semibold text-[#F8FAFC]">Agent Shield is live first.</span> Other
                    Shields show the broader architecture and future protection surfaces.
                  </DocsCallout>
                </div>
              </section>

              <section id="agent-shield-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Shield</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">
                  Agent Shield protects autonomous agents before they execute wallet or protocol actions.
                  External agents submit intent, Magen3 checks the active policy, and only approved actions
                  should continue to wallet signing.
                </p>
              </section>

              <section id="agent-flow-doc" className="scroll-mt-8 border-t border-[#1E293B] pt-10">
                <h2 className={SECTION_TITLE}>Agent Shield Flow</h2>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#1E293B] bg-[#0B1220] p-5">
                  <div className="flex min-w-max items-center gap-2">
                    <DocsFlowStep label="External Agent" sub="Submits intent" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Magen3 Gateway" sub="Receives request" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Policy Check" sub="Evaluates rules" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Decision" sub="Allowed / Blocked / Review" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Wallet Signature" sub="Only if Allowed" />
                    <DocsFlowArrow />
                    <DocsFlowStep label="Casper Proof" sub="Audit record" />
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
                  Connected Agents are external AI apps, bots, or autonomous systems allowed to call Magen3.
                  The owner wallet registers the agent, while the execution wallet signs the real transaction
                  in the external app.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Agent ID", "Identifies the external agent."],
                    ["API Key", "Authenticates each gateway request."],
                    ["Policy", "Controls what the agent can do."],
                    ["Audit Logs", "Track every decision and proof state."],
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
                    ["Is Magen3 only Agent Shield?", "No. Agent Shield is the first live Shield. Magen3 is built as a modular Shield platform."],
                    ["Can Magen3 be cross-chain?", "Yes at the gateway and policy layer. The current implementation records decision proofs on Casper Testnet while future adapters can support more target chains."],
                    ["Is it one API key for the whole app?", "No. Use one API key per connected agent."],
                    ["Is it one API key per policy?", "No. Policies attach to agents. API keys authenticate agents."],
                    ["Can the execution wallet differ from the owner wallet?", "Yes. The owner wallet manages the agent in Magen3; the execution wallet signs in the external app."],
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);

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
      setPolicies((prev) => [response.policy as Policy, ...prev]);
      if (Array.isArray(response.agents)) setAgents(response.agents as Agent[]);
      if (response.auditLog) setAuditLogs((prev) => [response.auditLog as AuditLog, ...prev]);
      setApiOnline(true);
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
        auditLogs={auditLogs}
        policies={policies}
        agents={agents}
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
        auditLogs={auditLogs}
        walletAddress={walletAddress}
        apiOnline={apiOnline}
      />
    ),
    shields: <ShieldsPage onNavigate={navigate} />,
    policies: (
      <PoliciesPage
        agents={agents}
        policies={policies}
        onCreatePolicy={onCreatePolicy}
        onUpdatePolicy={onUpdatePolicy}
        walletAddress={walletAddress}
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
        <main className={`flex-1 overflow-auto ${page === "docs" ? "p-0" : "p-6"}`}>
          {page === "docs" ? (
            <DocsPage />
          ) : (
            pageComponents[page as Exclude<Page, "landing" | "docs">]
          )}
        </main>
      </div>
    </div>
  );
}
