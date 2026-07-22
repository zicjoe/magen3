export type ExecutionCapability =
  | "Trading"
  | "Wallet Management"
  | "Treasury Operations"
  | "dApp Interactions"
  | "Enterprise Automation"
  | "Custom";

export type ModuleAvailability = "Live" | "Foundation Available" | "Preview" | "Planned";

const SUBSTANTIVE_EXECUTION_PREFLIGHT_RULES = new Set([
  "Payment budget format",
  "Gas-price tolerance format",
  "Transaction TTL format",
  "Transaction timestamp format",
  "Transaction freshness",
  "Transaction hash format",
  "Swap slippage bounds",
  "Swap output bounds",
  "Runtime arguments structure",
]);

function hasSubstantiveExecutionPreflightPass(findings: ModuleFinding[] = []) {
  return findings.some((finding) =>
    finding.module === "Execution Simulation" &&
    finding.status === "pass" &&
    SUBSTANTIVE_EXECUTION_PREFLIGHT_RULES.has(finding.rule));
}
export type FindingStatus = "pass" | "warning" | "fail" | "unavailable" | "skipped";
export type PipelineStatus = "completed" | "warning" | "failed" | "pending" | "skipped";

export interface ModuleFinding {
  module: string;
  status: FindingStatus;
  severity: "info" | "low" | "medium" | "high" | "critical" | string;
  rule: string;
  message: string;
  evidence?: Record<string, unknown>;
  remediation?: string;
}

export interface PipelineStage {
  id: string;
  label: string;
  status: PipelineStatus;
  timestamp?: string;
}

export const EXECUTION_CAPABILITY_CATALOG: Array<{
  id: ExecutionCapability;
  description: string;
}> = [
  { id: "Trading", description: "Autonomous swaps, routing, staking, yield actions, and trade execution." },
  { id: "Wallet Management", description: "Transfers, wallet operations, destination management, and balance actions." },
  { id: "Treasury Operations", description: "DAO or organization fund management, high-value actions, and approval-controlled execution." },
  { id: "dApp Interactions", description: "Contract calls, DeFi protocols, vaults, staking, borrowing, bridging, and application workflows." },
  { id: "Enterprise Automation", description: "Organization-grade workflows, internal permissions, compliance, and controlled automation." },
  { id: "Custom", description: "Developer-defined execution capability that does not fit a standard category." },
];

export const CAPABILITY_PACKS: Array<{
  name: string;
  description: string;
  capabilities: ExecutionCapability[];
}> = [
  {
    name: "Trading Automation Pack",
    description: "Trading, wallet operations, and protocol interactions for execution agents.",
    capabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  },
  {
    name: "Treasury Automation Pack",
    description: "Treasury controls, wallet operations, and governed protocol interactions.",
    capabilities: ["Treasury Operations", "Wallet Management", "dApp Interactions"],
  },
  {
    name: "Enterprise Operations Pack",
    description: "Controlled organization workflows, treasury actions, and dApp execution.",
    capabilities: ["Enterprise Automation", "Treasury Operations", "dApp Interactions"],
  },
];

export const PROTECTION_MODULE_CATALOG: Array<{
  id: string;
  name: string;
  description: string;
  status: ModuleAvailability;
  capabilities: ExecutionCapability[];
  currentChecks: string[];
  futureChecks: string[];
  configurable: boolean;
}> = [
  {
    id: "identity-authentication",
    name: "Identity and Authentication",
    description: "Authenticates each external agent before an intent reaches policy evaluation.",
    status: "Live",
    capabilities: EXECUTION_CAPABILITY_CATALOG.map((item) => item.id),
    currentChecks: ["Agent ID exists", "Agent is active", "API key hash matches"],
    futureChecks: ["Credential scopes", "Key expiry policies"],
    configurable: true,
  },
  {
    id: "policy-enforcement",
    name: "Policy Enforcement",
    description: "Loads the active agent policy and evaluates deterministic execution rules.",
    status: "Live",
    capabilities: EXECUTION_CAPABILITY_CATALOG.map((item) => item.id),
    currentChecks: ["Blocked actions", "Maximum transaction", "Daily limit", "Human review threshold"],
    futureChecks: ["Time-window controls", "Role-scoped approvals"],
    configurable: true,
  },
  {
    id: "wallet-validation",
    name: "Wallet Validation",
    description: "Validates the execution wallet, wallet destinations, spend controls, and review thresholds before signing.",
    status: "Live",
    capabilities: EXECUTION_CAPABILITY_CATALOG.map((item) => item.id),
    currentChecks: [
      "Casper execution-wallet public-key format",
      "Wallet destination format and classification",
      "Exact self-transfer prevention",
      "Approved wallet destinations",
      "Maximum transaction and daily wallet spending limits",
      "High-value human-review threshold",
      "Independent owner and execution wallet context",
    ],
    futureChecks: ["Address reputation", "On-chain wallet behavior signals", "Public-key to account-hash equivalence checks"],
    configurable: true,
  },
  {
    id: "contract-validation",
    name: "Contract Validation",
    description: "Validates Casper contract identity, call metadata, network binding, and policy approval before signing.",
    status: "Live",
    capabilities: ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"],
    currentChecks: [
      "Contract target classification",
      "Contract Hash and Package Hash structure",
      "Contract/package type consistency",
      "Entry-point structure",
      "Package-version semantics",
      "Casper chain-name consistency when supplied",
      "Approved and blocked contract policy controls",
      "Optional entry-point allowlist",
    ],
    futureChecks: ["On-chain entry-point discovery", "Upgrade, admin-key, and contract-verification analysis"],
    configurable: true,
  },
  {
    id: "execution-simulation",
    name: "Execution Simulation",
    description: "Runs deterministic transaction-construction preflight before a wallet is asked to sign.",
    status: "Foundation Available",
    capabilities: ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions"],
    currentChecks: [
      "Positive amount checks for value-bearing actions",
      "Payment budget and gas-price tolerance structure",
      "Transaction TTL, timestamp, freshness, and hash structure",
      "Swap slippage and quote-bound consistency",
      "Contract runtime-argument structure",
      "Explicit unavailable state for full speculative execution",
    ],
    futureChecks: ["State-diff simulation", "Contract revert and CLType analysis", "Verified gas-cost estimation"],
    configurable: false,
  },
  {
    id: "threat-intelligence",
    name: "Threat Intelligence",
    description: "Screens normalized Casper wallet and contract identities against a configured, freshness-checked intelligence feed.",
    status: "Foundation Available",
    capabilities: EXECUTION_CAPABILITY_CATALOG.map((item) => item.id),
    currentChecks: [
      "Execution-wallet and target identity normalization",
      "Exact wallet, account-hash, Contract Hash, and Package Hash matching",
      "Feed availability, freshness, and cache state",
      "Indicator severity and confidence threshold",
      "Observe, Review, and Enforce policy modes",
      "Warn, Review, or Block behavior when the feed is unavailable",
    ],
    futureChecks: ["Managed reputation-provider adapters", "Cross-source corroboration", "Behavioral and exploit-pattern intelligence"],
    configurable: true,
  },
  {
    id: "oracle-validation",
    name: "Oracle Validation",
    description: "Validates oracle freshness and price integrity before dependent actions.",
    status: "Planned",
    capabilities: ["Trading", "dApp Interactions"],
    currentChecks: [],
    futureChecks: ["Price deviation", "Freshness", "Multi-source comparison"],
    configurable: false,
  },
  {
    id: "bridge-controls",
    name: "Bridge Controls",
    description: "Controls routes, destinations, and transfer parameters for bridge actions.",
    status: "Planned",
    capabilities: ["Trading", "Wallet Management", "dApp Interactions"],
    currentChecks: [],
    futureChecks: ["Approved bridges", "Route risk", "Destination-chain constraints"],
    configurable: false,
  },
  {
    id: "compliance-controls",
    name: "Compliance Controls",
    description: "Adds policy-driven compliance checks for controlled organization workflows.",
    status: "Planned",
    capabilities: ["Treasury Operations", "Enterprise Automation"],
    currentChecks: [],
    futureChecks: ["Sanctions screening", "KYC/AML attestations", "Jurisdiction rules"],
    configurable: false,
  },
  {
    id: "risk-assessment",
    name: "Risk Assessment",
    description: "Combines deterministic findings into Allowed, Blocked, or Review Required.",
    status: "Live",
    capabilities: EXECUTION_CAPABILITY_CATALOG.map((item) => item.id),
    currentChecks: ["Finding severity", "Hard-block rules", "Human-review conditions", "Explainable risk score"],
    futureChecks: ["Additional verified module signals"],
    configurable: false,
  },
];

const LEGACY_TYPE_MAP: Record<string, ExecutionCapability[]> = {
  "DeFi Agent": ["Trading", "dApp Interactions"],
  "Trading Agent": ["Trading"],
  "Treasury Agent": ["Treasury Operations", "Wallet Management"],
  "RWA Agent": ["Enterprise Automation", "dApp Interactions"],
  "Oracle Agent": ["dApp Interactions"],
  "Custom Agent": ["Custom"],
};

export function normalizeCapabilities(value?: unknown, legacyType = "Custom Agent"): ExecutionCapability[] {
  const valid = Array.isArray(value)
    ? [...new Set(value.filter((item): item is ExecutionCapability =>
        typeof item === "string" && EXECUTION_CAPABILITY_CATALOG.some((capability) => capability.id === item)))]
    : [];
  return valid.length > 0 ? valid : (LEGACY_TYPE_MAP[legacyType] || ["Custom"]);
}

export function recommendedModules(capabilities: ExecutionCapability[]) {
  const normalized = normalizeCapabilities(capabilities);
  return PROTECTION_MODULE_CATALOG.filter((module) =>
    module.capabilities.some((capability) => normalized.includes(capability)));
}

export interface PolicyTemplateValues {
  maxTransaction: number;
  dailyLimit: number;
  approvalThreshold: number;
  trustedContracts: string[];
  blockedActions: string[];
  riskMode: "Conservative" | "Balanced" | "Aggressive";
}

export const POLICY_TEMPLATES: Record<string, PolicyTemplateValues> = {
  "Conservative Trading": { maxTransaction: 25, dailyLimit: 100, approvalThreshold: 15, trustedContracts: [], blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update"], riskMode: "Conservative" },
  "Balanced Trading": { maxTransaction: 75, dailyLimit: 300, approvalThreshold: 50, trustedContracts: [], blockedActions: ["RWA Proof Update", "Oracle Data Update"], riskMode: "Balanced" },
  "Wallet Safety": { maxTransaction: 30, dailyLimit: 120, approvalThreshold: 20, trustedContracts: [], blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update"], riskMode: "Conservative" },
  "Treasury Safe Mode": { maxTransaction: 250, dailyLimit: 1000, approvalThreshold: 100, trustedContracts: [], blockedActions: ["RWA Proof Update", "Oracle Data Update"], riskMode: "Conservative" },
  "DeFi Automation": { maxTransaction: 100, dailyLimit: 500, approvalThreshold: 75, trustedContracts: [], blockedActions: ["RWA Proof Update", "Oracle Data Update"], riskMode: "Balanced" },
  "Enterprise Controlled Automation": { maxTransaction: 150, dailyLimit: 600, approvalThreshold: 75, trustedContracts: [], blockedActions: ["Oracle Data Update"], riskMode: "Conservative" },
  Custom: { maxTransaction: 50, dailyLimit: 200, approvalThreshold: 40, trustedContracts: [], blockedActions: [], riskMode: "Balanced" },
};

export function recommendedPolicyTemplate(capabilities: ExecutionCapability[]) {
  if (capabilities.includes("Enterprise Automation")) return "Enterprise Controlled Automation";
  if (capabilities.includes("Treasury Operations")) return "Treasury Safe Mode";
  if (capabilities.includes("Trading") && capabilities.includes("dApp Interactions")) return "DeFi Automation";
  if (capabilities.includes("Trading")) return "Conservative Trading";
  if (capabilities.includes("Wallet Management")) return "Wallet Safety";
  if (capabilities.includes("dApp Interactions")) return "DeFi Automation";
  return "Custom";
}

export interface CoverageCheck {
  id: string;
  label: string;
  weight: number;
  passed: boolean;
  detail: string;
  recommendation?: string;
  page?: string;
}

export interface CoverageResult {
  score: number;
  label: string;
  checks: CoverageCheck[];
  recommendations: CoverageCheck[];
}

export function calculateSecurityCoverage(
  agent: {
    status?: string;
    type?: string;
    executionCapabilities?: ExecutionCapability[];
    apiKeyPreview?: string;
    onboardingStatus?: string;
    lastIntentAt?: string;
  },
  policy?: {
    status?: string;
    maxTransaction?: number;
    dailyLimit?: number;
    approvalThreshold?: number;
    trustedContracts?: string[];
    structuredRules?: Record<string, unknown>;
  },
  logs: Array<{ timestamp: string; decisionProofStatus?: string; moduleFindings?: ModuleFinding[] }> = [],
): CoverageResult {
  const capabilities = normalizeCapabilities(agent.executionCapabilities, agent.type);
  const destinationRelevant = capabilities.some((item) => ["Trading", "Wallet Management", "Treasury Operations", "Enterprise Automation"].includes(item));
  const contractRelevant = capabilities.some((item) => ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item));
  const reviewRelevant = capabilities.some((item) => ["Treasury Operations", "Enterprise Automation", "Trading"].includes(item));
  const lastIntent = agent.lastIntentAt || logs[0]?.timestamp || "";
  const recentGateway = lastIntent ? Date.now() - new Date(lastIntent).getTime() <= 30 * 24 * 60 * 60 * 1000 : false;
  const proofRecorded = logs.some((log) => log.decisionProofStatus === "recorded");
  const walletValidationObserved = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "Wallet Validation"));
  const contractValidationObserved = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "Contract Validation"));
  const executionPreflightRelevant = capabilities.some((item) => ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions"].includes(item));
  const executionPreflightObserved = logs.some((log) =>
    hasSubstantiveExecutionPreflightPass(log.moduleFindings || []));
  const threatIntelligenceMode = typeof policy?.structuredRules?.threatIntelligenceMode === "string"
    ? policy.structuredRules.threatIntelligenceMode
    : "";
  const threatIntelligenceConfigured = ["Observe", "Review", "Enforce"].includes(threatIntelligenceMode);
  const threatIntelligenceOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Threat Intelligence" &&
      finding.rule === "Threat feed availability" &&
      finding.status === "pass"));
  const requiredProtectionObserved = contractRelevant ? contractValidationObserved : walletValidationObserved;

  const checks: CoverageCheck[] = [
    { id: "capabilities", label: "Execution capabilities selected", weight: 10, passed: capabilities.length > 0, detail: `${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"} configured.`, recommendation: "Select at least one execution capability.", page: "connected-agents" },
    { id: "active-policy", label: "Active policy assigned", weight: 20, passed: policy?.status === "Active", detail: policy?.status === "Active" ? "An active policy controls gateway decisions." : "No active policy is assigned.", recommendation: "Create or activate a policy for this agent.", page: "policies" },
    { id: "spend-limits", label: "Spend limits configured", weight: 15, passed: Number(policy?.maxTransaction) > 0 && Number(policy?.dailyLimit) > 0, detail: policy ? `Maximum ${policy.maxTransaction} CSPR; daily ${policy.dailyLimit} CSPR.` : "Spend limits are unavailable without a policy.", recommendation: "Configure maximum transaction and daily spending limits.", page: "policies" },
    { id: "destination-controls", label: "Destination controls", weight: 8, passed: !destinationRelevant || Boolean(policy?.trustedContracts?.length), detail: !destinationRelevant ? "Not required by the selected capabilities." : policy?.trustedContracts?.length ? `${policy.trustedContracts.length} approved target${policy.trustedContracts.length === 1 ? "" : "s"}.` : "No approved destinations are configured.", recommendation: "Add approved wallet destinations or trusted targets.", page: "policies" },
    { id: "contract-controls", label: "Contract controls", weight: 8, passed: !contractRelevant || Boolean(policy?.trustedContracts?.length), detail: !contractRelevant ? "Not required by the selected capabilities." : policy?.trustedContracts?.length ? "Trusted contract controls are configured." : "No trusted contracts are configured.", recommendation: "Add approved contracts for dApp and trading interactions.", page: "policies" },
    { id: "review-threshold", label: "Human review threshold", weight: 8, passed: !reviewRelevant || Number(policy?.approvalThreshold) > 0, detail: !reviewRelevant ? "Not required by the selected capabilities." : Number(policy?.approvalThreshold) > 0 ? `Review required above ${policy?.approvalThreshold} CSPR.` : "No review threshold is configured.", recommendation: "Configure a review threshold for higher-value actions.", page: "policies" },
    { id: "credential", label: "API credential active", weight: 10, passed: agent.status === "Active" && Boolean(agent.apiKeyPreview), detail: agent.apiKeyPreview ? `Credential ${agent.apiKeyPreview} is active.` : "No active credential preview is available.", recommendation: "Rotate or issue an API credential.", page: "connected-agents" },
    { id: "gateway-activity", label: "Recent live protection activity", weight: 3, passed: recentGateway && requiredProtectionObserved, detail: recentGateway && requiredProtectionObserved ? `${contractRelevant ? "Contract Validation" : "Wallet Validation"} was evaluated on ${new Date(lastIntent).toLocaleString()}.` : lastIntent ? `A recent intent exists, but no ${contractRelevant ? "Contract Validation" : "Wallet Validation"} finding is visible yet.` : "No gateway request has been received.", recommendation: `Send a valid ${contractRelevant ? "contract" : "wallet"} intent through the Intent Playground to verify live protection.`, page: "intent-playground" },
    { id: "execution-preflight", label: "Execution preflight observed", weight: 5, passed: !executionPreflightRelevant || executionPreflightObserved, detail: !executionPreflightRelevant ? "Not required by the selected capabilities." : executionPreflightObserved ? "Deterministic transaction-construction preflight has been observed. Full stateful simulation remains unavailable." : "No successful Execution Simulation preflight finding is visible yet.", recommendation: "Send an intent with preflight payment, gas, TTL, timestamp, and action-specific bounds through the Intent Playground.", page: "intent-playground" },
    { id: "threat-intelligence", label: "Threat intelligence operational", weight: 5, passed: threatIntelligenceConfigured && threatIntelligenceOperational, detail: threatIntelligenceConfigured ? threatIntelligenceOperational ? `${threatIntelligenceMode} mode is configured and a fresh feed check has been observed.` : `${threatIntelligenceMode} mode is configured, but no fresh feed pass is visible yet.` : "Threat Intelligence policy mode is not configured for this policy.", recommendation: threatIntelligenceConfigured ? "Configure a fresh threat feed and submit a wallet or contract intent to verify screening." : "Choose Observe, Review, or Enforce behavior in the policy Threat Intelligence controls.", page: threatIntelligenceConfigured ? "intent-playground" : "policies" },
    { id: "casper-proof", label: "Casper proof recording observed", weight: 5, passed: proofRecorded, detail: proofRecorded ? "At least one decision proof is recorded." : "No recorded decision proof is visible for this agent yet.", recommendation: "Run a gateway test and verify the Casper proof service.", page: "audit-log" },
    { id: "agent-state", label: "Agent configuration complete", weight: 3, passed: agent.status === "Active" && agent.onboardingStatus !== "draft", detail: agent.status === "Active" ? "Agent is active and available to the gateway." : "Agent is not active.", recommendation: "Complete onboarding and ensure the agent is active.", page: "connected-agents" },
  ];

  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const label = score >= 85 ? "Strong foundation" : score >= 65 ? "Good coverage" : score >= 40 ? "Needs attention" : "Limited coverage";
  return { score, label, checks, recommendations: checks.filter((check) => !check.passed) };
}

export function deriveIntegrationHealth(
  agent: { status?: string; apiKeyPreview?: string; lastIntentAt?: string },
  policy: { status?: string } | undefined,
  logs: Array<{ timestamp: string; decision?: string; decisionProofStatus?: string; moduleFindings?: ModuleFinding[] }> = [],
  gatewayOnline = false,
) {
  const latest = logs[0];
  const proofState = latest?.decisionProofStatus || "not observed";
  const walletFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Wallet Validation") || [];
  const walletFailed = walletFindings.some((finding) => finding.status === "fail");
  const walletWarned = walletFindings.some((finding) => finding.status === "warning" || finding.status === "unavailable");
  const walletHealth = walletFindings.length === 0 ? "unknown" : walletFailed || walletWarned ? "attention" : "healthy";
  const contractFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Contract Validation") || [];
  const contractFailed = contractFindings.some((finding) => finding.status === "fail");
  const contractWarned = contractFindings.some((finding) => finding.status === "warning" || finding.status === "unavailable");
  const contractHealth = contractFindings.length === 0 ? "unknown" : contractFailed || contractWarned ? "attention" : "healthy";
  const simulationFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Execution Simulation") || [];
  const simulationFailed = simulationFindings.some((finding) => finding.status === "fail");
  const simulationPassed = hasSubstantiveExecutionPreflightPass(simulationFindings);
  const simulationHealth = simulationFindings.length === 0 ? "unknown" : simulationFailed ? "attention" : simulationPassed ? "observed" : "unknown";
  const threatFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Threat Intelligence") || [];
  const threatFailed = threatFindings.some((finding) => finding.status === "fail");
  const threatUnavailable = threatFindings.some((finding) => finding.status === "unavailable");
  const threatWarned = threatFindings.some((finding) => finding.status === "warning");
  const threatFeedPassed = threatFindings.some((finding) => finding.rule === "Threat feed availability" && finding.status === "pass");
  const threatHealth = threatFindings.length === 0 ? "unknown" : threatFailed || threatWarned ? "attention" : threatUnavailable ? "unavailable" : threatFeedPassed ? "observed" : "unknown";
  const checks = [
    { label: "Gateway connectivity", status: gatewayOnline ? "healthy" : "unavailable", detail: gatewayOnline ? "Backend health check succeeded." : "Backend health check is currently unavailable." },
    { label: "API credential", status: agent.status === "Active" && agent.apiKeyPreview ? "healthy" : "attention", detail: agent.apiKeyPreview || "No credential preview." },
    { label: "Active policy", status: policy?.status === "Active" ? "healthy" : "attention", detail: policy?.status === "Active" ? "Policy is active." : "No active policy." },
    { label: "Last received intent", status: agent.lastIntentAt || latest ? "observed" : "unknown", detail: agent.lastIntentAt || latest?.timestamp || "No intent received." },
    { label: "Last decision", status: latest ? "observed" : "unknown", detail: latest?.decision || "No decision recorded." },
    { label: "Wallet Validation", status: walletHealth, detail: walletFindings.length === 0 ? "No Wallet Validation finding is available yet." : walletFailed ? "The latest request failed one or more wallet checks." : walletWarned ? "The latest request needs attention before execution." : "The latest request passed the evaluated wallet checks." },
    { label: "Contract Validation", status: contractHealth, detail: contractFindings.length === 0 ? "No Contract Validation finding is available for the latest request." : contractFailed ? "The latest request failed one or more contract checks." : contractWarned ? "The latest contract request needs attention before execution." : "The latest request passed the evaluated contract checks." },
    { label: "Execution preflight", status: simulationHealth, detail: simulationFindings.length === 0 ? "No Execution Simulation finding is available for the latest request." : simulationFailed ? "The latest request failed deterministic transaction-construction preflight." : simulationPassed ? "Deterministic preflight was evaluated. Full stateful speculative execution remains unavailable." : "Full stateful simulation is unavailable and no preflight pass was recorded." },
    { label: "Threat Intelligence", status: threatHealth, detail: threatFindings.length === 0 ? "No Threat Intelligence finding is available for the latest request." : threatFailed ? "The latest request was blocked by an enforced threat indicator or fail-closed feed rule." : threatWarned ? "The latest request matched an observed or review-level threat signal." : threatUnavailable ? "The configured threat feed was unavailable or stale and did not count as a pass." : threatFeedPassed ? "A fresh configured feed screened the latest normalized identities." : "Threat Intelligence did not produce an operational feed result." },
    { label: "Casper proof service", status: proofState === "recorded" ? "healthy" : proofState === "failed" ? "attention" : "pending", detail: proofState },
    { label: "Audit synchronization", status: latest ? "healthy" : "unknown", detail: latest ? "Latest audit record is visible." : "No audit record is available." },
  ];
  const attention = checks.filter((check) => ["attention", "unavailable"].includes(check.status)).length;
  return { overall: attention === 0 ? "Healthy" : attention <= 2 ? "Needs attention" : "Degraded", checks };
}
