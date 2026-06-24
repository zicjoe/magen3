import { useState, useCallback, type ReactElement } from "react";
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
  Code2,
  ChevronRight,
  Menu,
} from "lucide-react";

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type Page =
  | "landing"
  | "dashboard"
  | "shields"
  | "agent-shield"
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
  | "Oracle Data Update";
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

// ──────────────────────────────────────────────────────────
// Mock Data
// ──────────────────────────────────────────────────────────

const mockAgents: Agent[] = [
  {
    id: "MAG-AGENT-001",
    name: "YieldBot",
    type: "DeFi Agent",
    purpose: "Manage staking and yield actions",
    permissionLevel: "Limited Execution",
    status: "Policy Active",
    createdAt: "2025-06-10T09:00:00Z",
  },
  {
    id: "MAG-AGENT-002",
    name: "TreasuryGuard",
    type: "Treasury Agent",
    purpose: "Oversee DAO treasury disbursements",
    permissionLevel: "Full Execution with Review",
    status: "Policy Active",
    createdAt: "2025-06-15T11:30:00Z",
  },
];

const mockPolicies: Policy[] = [
  {
    id: "POL-001",
    name: "Safe DeFi Policy",
    agentId: "MAG-AGENT-001",
    maxTransaction: 50,
    dailyLimit: 200,
    approvalThreshold: 100,
    trustedContracts: [
      "0xStakingContract123",
      "0xYieldVault456",
    ],
    blockedActions: ["Oracle Data Update", "RWA Proof Update"],
    riskMode: "Balanced",
    status: "Active",
    createdAt: "2025-06-11T10:00:00Z",
    policyHash: "0xpol...a3f1",
  },
  {
    id: "POL-002",
    name: "Treasury Conservative",
    agentId: "MAG-AGENT-002",
    maxTransaction: 500,
    dailyLimit: 1000,
    approvalThreshold: 250,
    trustedContracts: ["0xDAOTreasury789"],
    blockedActions: ["Swap", "Contract Interaction"],
    riskMode: "Conservative",
    status: "Active",
    createdAt: "2025-06-16T08:00:00Z",
    policyHash: "0xpol...b7c2",
  },
];

const mockAuditLogs: AuditLog[] = [
  {
    id: "AUD-001",
    timestamp: "2025-06-24T14:32:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Stake",
    amount: 25,
    target: "0xStakingContract123",
    targetType: "Trusted Contract",
    decision: "Allowed",
    risk: "Low",
    reason: "Amount is within policy limit and target contract is trusted.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "0xcasper...tx001",
    riskScore: 8,
  },
  {
    id: "AUD-002",
    timestamp: "2025-06-24T13:15:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Transfer",
    amount: 500,
    target: "0xUnknownContract999",
    targetType: "Unknown Contract",
    decision: "Blocked",
    risk: "High",
    reason: "Amount exceeds max transaction limit and target is not trusted.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "",
    riskScore: 87,
  },
  {
    id: "AUD-003",
    timestamp: "2025-06-24T12:00:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Deposit to Vault",
    amount: 120,
    target: "0xYieldVault456",
    targetType: "Trusted Contract",
    decision: "Review Required",
    risk: "Medium",
    reason: "Target is trusted, but amount is above approval threshold.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "",
    riskScore: 52,
  },
  {
    id: "AUD-004",
    timestamp: "2025-06-24T09:45:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-002",
    agentName: "TreasuryGuard",
    action: "DAO Treasury Payment",
    amount: 300,
    target: "0xDAOTreasury789",
    targetType: "DAO Treasury",
    decision: "Review Required",
    risk: "Medium",
    reason: "Treasury payment above threshold requires governance approval.",
    policyUsed: "Treasury Conservative",
    walletAddress: "0xWallet...abc1",
    txHash: "",
    riskScore: 44,
  },
  {
    id: "AUD-005",
    timestamp: "2025-06-23T17:20:00Z",
    shield: "Agent Shield",
    agentId: "MAG-AGENT-001",
    agentName: "YieldBot",
    action: "Claim Rewards",
    amount: 12,
    target: "0xStakingContract123",
    targetType: "Trusted Contract",
    decision: "Allowed",
    risk: "Low",
    reason: "Reward claim is within policy limits from a trusted contract.",
    policyUsed: "Safe DeFi Policy",
    walletAddress: "0xWallet...abc1",
    txHash: "0xcasper...tx002",
    riskScore: 5,
  },
];

const mockDashboardStats: DashboardStats = {
  activeShields: 1,
  protectedActions: 127,
  blockedActions: 14,
  reviewRequired: 8,
  casperAuditRecords: 103,
};

const mockShieldModules: ShieldModule[] = [
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

const mockExamples = [
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
  { id: "agent-shield", label: "Agent Shield", icon: <Bot size={18} /> },
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
  onConnectWallet,
}: {
  walletConnected: boolean;
  walletAddress: string;
  onConnectWallet: () => void;
}) {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#1E293B] bg-[#050B14]/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Network badge */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#FF3B3B] animate-pulse" />
        <span className="text-xs font-semibold text-[#FF3B3B] uppercase tracking-wider">
          Casper Testnet
        </span>
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
        {walletConnected ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#111827] border border-[#1E293B] rounded-lg">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#22D3EE] to-[#0EA5E9]" />
            <span className="text-sm text-[#F8FAFC] font-mono">
              {truncate(walletAddress, 20)}
            </span>
            <ChevronDown size={14} className="text-[#94A3B8]" />
          </div>
        ) : (
          <Btn variant="primary" size="sm" onClick={onConnectWallet}>
            <Wallet size={14} />
            Connect Wallet
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
              { v: "127+", l: "Protected Actions" },
              { v: "5", l: "Shield Modules" },
              { v: "103", l: "Casper Records" },
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
          {mockShieldModules.map((m) => (
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
        © 2025 Magen3 · Built on Casper Network
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
}: {
  walletConnected: boolean;
  onConnectWallet: () => void;
}) {
  if (!walletConnected) {
    return (
      <EmptyState
        title="Connect Your Wallet"
        description="Connect your Casper wallet to access the security dashboard and start protecting your agents."
        action={
          <Btn variant="primary" size="lg" onClick={onConnectWallet}>
            <Wallet size={18} />
            Connect Wallet
          </Btn>
        }
      />
    );
  }

  const recentLogs = mockAuditLogs.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Active Shields"
          value={mockDashboardStats.activeShields}
          icon={<Shield size={20} />}
          color="cyan"
        />
        <StatCard
          label="Protected Actions"
          value={mockDashboardStats.protectedActions}
          icon={<ShieldCheck size={20} />}
          color="green"
          trend="+12"
        />
        <StatCard
          label="Blocked Actions"
          value={mockDashboardStats.blockedActions}
          icon={<ShieldX size={20} />}
          color="red"
        />
        <StatCard
          label="Review Required"
          value={mockDashboardStats.reviewRequired}
          icon={<Clock size={20} />}
          color="amber"
        />
        <StatCard
          label="Casper Records"
          value={mockDashboardStats.casperAuditRecords}
          icon={<Database size={20} />}
          color="purple"
        />
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
            {[
              { label: "Low Risk", count: 89, color: "#22C55E", pct: 70 },
              { label: "Medium Risk", count: 24, color: "#F59E0B", pct: 19 },
              { label: "High Risk", count: 14, color: "#EF4444", pct: 11 },
            ].map((r) => (
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
                  Safe DeFi Policy
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Agent</span>
                <span className="text-[#F8FAFC]">YieldBot</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Max Tx</span>
                <span className="text-[#F8FAFC]">50 CSPR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Daily Limit</span>
                <span className="text-[#F8FAFC]">200 CSPR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Risk Mode</span>
                <span className="text-[#F59E0B] font-medium">Balanced</span>
              </div>
              <div className="pt-2 border-t border-[#1E293B] flex justify-between">
                <span className="text-[#94A3B8]">Status</span>
                <StatusBadge status="Active" />
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
        {mockShieldModules.map((m) => (
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

function AgentShieldPage() {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [form, setForm] = useState({
    name: "",
    type: "DeFi Agent" as AgentType,
    purpose: "",
    permissionLevel: "Limited Execution" as PermissionLevel,
  });

  const registerAgent = useCallback(() => {
    if (!form.name.trim()) return;
    const newAgent: Agent = {
      id: `MAG-AGENT-00${agents.length + 1}`,
      name: form.name,
      type: form.type,
      purpose: form.purpose,
      permissionLevel: form.permissionLevel,
      status: "No Policy",
      createdAt: new Date().toISOString(),
    };
    setAgents((prev) => [...prev, newAgent]);
    setForm({ name: "", type: "DeFi Agent", purpose: "", permissionLevel: "Limited Execution" });
  }, [form, agents.length]);

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
          {mockAuditLogs.slice(0, 3).map((log) => (
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

function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>(mockPolicies);
  const [form, setForm] = useState({
    name: "",
    agentId: mockAgents[0].id,
    maxTransaction: "",
    dailyLimit: "",
    approvalThreshold: "",
    trustedContracts: "",
    blockedActions: [] as string[],
    riskMode: "Balanced" as RiskMode,
  });

  const createPolicy = useCallback(() => {
    if (!form.name.trim()) return;
    const newPolicy: Policy = {
      id: `POL-00${policies.length + 1}`,
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
      createdAt: new Date().toISOString(),
      policyHash: "0xpol...pending",
    };
    setPolicies((prev) => [...prev, newPolicy]);
    setForm({
      name: "",
      agentId: mockAgents[0].id,
      maxTransaction: "",
      dailyLimit: "",
      approvalThreshold: "",
      trustedContracts: "",
      blockedActions: [],
      riskMode: "Balanced",
    });
  }, [form, policies.length]);

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
              options={mockAgents.map((a) => a.id)}
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
            const agent = mockAgents.find((a) => a.id === pol.agentId);
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

function ActionReviewPage() {
  const [form, setForm] = useState<ActionRequest>({
    agentId: mockAgents[0].id,
    actionType: "Stake",
    amount: 25,
    target: "",
    targetType: "Trusted Contract",
  });
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const analyzeAction = useCallback(() => {
    setAnalyzing(true);
    setResult(null);
    setRecorded(false);
    setTimeout(() => {
      const ex = mockExamples.find(
        (e) =>
          e.agentId === form.agentId &&
          e.actionType === form.actionType &&
          e.amount === form.amount
      );
      if (ex) {
        setResult(ex.result);
      } else {
        const risk: Risk =
          form.amount > 100 ? "High" : form.amount > 50 ? "Medium" : "Low";
        const decision: Decision =
          form.targetType === "Unknown Contract" || form.amount > 200
            ? "Blocked"
            : form.amount > 50
            ? "Review Required"
            : "Allowed";
        setResult({
          decision,
          risk,
          riskScore:
            decision === "Allowed" ? 10 : decision === "Blocked" ? 85 : 50,
          policyChecksPassed: decision !== "Blocked" ? ["Target validated"] : [],
          policyChecksFailed:
            decision === "Blocked" ? ["Amount exceeds policy limit"] : [],
          reason:
            decision === "Allowed"
              ? "Action is within policy parameters."
              : decision === "Blocked"
              ? "Action violates one or more policy rules."
              : "Action requires manual review before execution.",
          recommendedAction:
            decision === "Allowed"
              ? "Proceed with execution."
              : decision === "Blocked"
              ? "Do not execute. Review the action parameters."
              : "Request human approval before proceeding.",
        });
      }
      setAnalyzing(false);
    }, 1200);
  }, [form]);

  const recordDecisionOnChain = useCallback(() => {
    setRecorded(true);
  }, []);

  const approveOnce = useCallback(() => {
    console.log("approveOnce");
  }, []);

  const rejectAction = useCallback(() => {
    setResult(null);
  }, []);

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
        {mockExamples.map((ex, i) => (
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
              setRecorded(false);
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
              options={mockAgents.map((a) => a.id)}
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
                {recorded ? (
                  <div className="flex items-center gap-2 text-sm text-[#22C55E]">
                    <CheckCircle size={16} />
                    Recorded on Casper Testnet
                  </div>
                ) : (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={recordDecisionOnChain}
                  >
                    <Database size={14} />
                    Record on Casper
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
// Audit Log Page
// ──────────────────────────────────────────────────────────

function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [filterShield, setFilterShield] = useState("All");
  const [filterDecision, setFilterDecision] = useState("All");
  const [filterRisk, setFilterRisk] = useState("All");
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const filtered = mockAuditLogs.filter((l) => {
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
                  "Tx Hash",
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
                      <div className="flex items-center gap-1.5 text-[#22D3EE]">
                        <span>{truncate(log.txHash)}</span>
                        <ExternalLink size={11} />
                      </div>
                    ) : (
                      <span className="text-[#94A3B8]/40">Pending</span>
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
                  <td colSpan={9} className="px-4 py-12 text-center text-[#94A3B8]">
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
              {!selected.txHash && (
                <Btn variant="primary" className="w-full justify-center">
                  <Database size={14} />
                  Record on Casper Testnet
                </Btn>
              )}
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

function SettingsPage() {
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
                  agentCount: mockAgents.length,
                  policyCount: mockPolicies.length,
                  auditCount: mockAuditLogs.length,
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
  const [walletAddress] = useState("0xCasper1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const connectWallet = useCallback(() => {
    setWalletConnected(true);
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
      />
    ),
    shields: <ShieldsPage onNavigate={navigate} />,
    "agent-shield": <AgentShieldPage />,
    policies: <PoliciesPage />,
    "action-review": <ActionReviewPage />,
    "audit-log": <AuditLogPage />,
    settings: <SettingsPage />,
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
          onConnectWallet={connectWallet}
        />
        <main className="flex-1 p-6 overflow-auto">
          {pageComponents[page as Exclude<Page, "landing">]}
        </main>
      </div>
    </div>
  );
}
