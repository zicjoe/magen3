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
    description: "Compares price-sensitive intents with a configured freshness-checked multi-source oracle feed before signing.",
    status: "Foundation Available",
    capabilities: ["Trading", "dApp Interactions"],
    currentChecks: [
      "Asset-pair and execution-price metadata",
      "Feed freshness and requested-pair availability",
      "Independent source quorum and confidence",
      "Cross-source price spread",
      "Execution quote freshness",
      "Maximum deviation from the median reference price",
      "Observe, Review, and Enforce policy modes",
      "Warn, Review, or Block behavior when the feed is unavailable",
    ],
    futureChecks: ["Managed on-chain oracle adapters", "Cryptographic price attestations", "Protocol-specific oracle routing"],
    configurable: true,
  },
  {
    id: "bridge-controls",
    name: "Bridge Controls",
    description: "Evaluates provider-supplied bridge routes, destinations, quote bounds, fees, and finality requirements before signing.",
    status: "Foundation Available",
    capabilities: ["Trading", "Wallet Management", "dApp Interactions"],
    currentChecks: [
      "Required bridge route metadata",
      "Approved providers, source chains, destination chains, and assets",
      "Explicitly blocked destination chains",
      "Maximum bridge amount and fee",
      "Expected-output and minimum-received consistency",
      "Quote freshness and expiry",
      "Casper and EVM destination-address structure",
      "Source and destination confirmation requirements",
      "Observe, Review, and Enforce policy modes",
    ],
    futureChecks: ["Managed bridge-adapter registry", "Provider solvency and liquidity signals", "Cross-chain message-delivery verification"],
    configurable: true,
  },
  {
    id: "x402-payment-controls",
    name: "x402 Payment Controls",
    description: "Binds an HTTP 402 payment to the exact resource, merchant, recipient, asset, network, amount, and settlement state before an agent signs.",
    status: "Foundation Available",
    capabilities: ["Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation", "Custom"],
    currentChecks: [
      "x402 v2 and exact-scheme policy controls",
      "Canonical resource URL and merchant-domain binding",
      "CAIP-2 network and recipient-address structure",
      "Approved merchants, recipients, assets, networks, and facilitators",
      "Per-payment, daily, monthly, review, and hourly limits",
      "PAYMENT-REQUIRED, request-body, nonce, expiry, and fingerprint binding",
      "Replay and ambiguous-settlement retry prevention",
      "Authenticated settlement reconciliation and resource-delivery state",
    ],
    futureChecks: ["upto-scheme usage metering", "Managed merchant and facilitator reputation", "Casper-native x402 settlement adapters"],
    configurable: true,
  },
  {
    id: "compliance-controls",
    name: "Compliance Controls",
    description: "Evaluates non-sensitive compliance attestations, Travel Rule evidence, jurisdictions, counterparties, and configured screening data before signing.",
    status: "Foundation Available",
    capabilities: ["Treasury Operations", "Enterprise Automation"],
    currentChecks: [
      "Policy-scoped originator and beneficiary attestation status",
      "Travel Rule evidence references and hashes without raw personal data",
      "Jurisdiction allow, review, and block controls",
      "Counterparty type and compliance risk-rating limits",
      "Current screening-result evidence from accepted providers",
      "Exact configured wallet, account-hash, contract, package, VASP, and jurisdiction matches",
      "Warn, Review, or Block behavior when screening evidence is unavailable",
    ],
    futureChecks: ["Managed sanctions-provider adapters", "Travel Rule network adapters", "Jurisdiction-specific legal rule packs"],
    configurable: true,
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
  const oracleRelevant = capabilities.some((item) => ["Trading", "dApp Interactions"].includes(item));
  const oracleMode = typeof policy?.structuredRules?.oracleValidationMode === "string"
    ? policy.structuredRules.oracleValidationMode
    : "";
  const oracleConfigured = ["Observe", "Review", "Enforce"].includes(oracleMode);
  const oracleOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Oracle Validation" &&
      finding.rule === "Oracle feed availability" &&
      finding.status === "pass"));
  const bridgeRelevant = capabilities.some((item) => ["Trading", "Wallet Management", "dApp Interactions"].includes(item));
  const bridgeMode = typeof policy?.structuredRules?.bridgeControlMode === "string"
    ? policy.structuredRules.bridgeControlMode
    : "";
  const bridgeConfigured = ["Observe", "Review", "Enforce"].includes(bridgeMode) &&
    Array.isArray(policy?.structuredRules?.bridgeAllowedProviders) &&
    Array.isArray(policy?.structuredRules?.bridgeAllowedSourceChains) &&
    Array.isArray(policy?.structuredRules?.bridgeAllowedDestinationChains) &&
    Array.isArray(policy?.structuredRules?.bridgeAllowedAssets);
  const bridgeOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Bridge Controls" &&
      finding.rule === "Bridge route metadata" &&
      finding.status === "pass"));
  const x402Enabled = policy?.structuredRules?.x402ControlsEnabled === true;
  const x402Observed = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "x402 Payment Controls"),
  );
  // x402 is an optional payment protection module. Relevant capabilities recommend it during
  // onboarding, but coverage only requires it after the operator enables it or an x402 payment
  // has actually been observed. This avoids penalizing wallet-capable agents that never use x402.
  const x402Relevant = x402Enabled || x402Observed;
  const x402Mode = typeof policy?.structuredRules?.x402ControlMode === "string"
    ? policy.structuredRules.x402ControlMode
    : "";
  const x402Configured = x402Enabled && ["Observe", "Review", "Enforce"].includes(x402Mode) &&
    Array.isArray(policy?.structuredRules?.x402AllowedVersions) &&
    Array.isArray(policy?.structuredRules?.x402AllowedSchemes) &&
    policy?.structuredRules?.x402AssetDecimals != null &&
    typeof policy.structuredRules.x402AssetDecimals === "object" &&
    !Array.isArray(policy.structuredRules.x402AssetDecimals) &&
    Object.keys(policy.structuredRules.x402AssetDecimals as Record<string, unknown>).length > 0 &&
    Number(policy?.structuredRules?.x402MaxPayment) > 0;
  const x402Operational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "x402 Payment Controls" &&
      finding.rule === "Canonical request fingerprint" &&
      finding.status === "pass"));
  const complianceRelevant = capabilities.some((item) => ["Treasury Operations", "Enterprise Automation"].includes(item));
  const complianceEnabled = policy?.structuredRules?.complianceControlsEnabled === true;
  const complianceMode = typeof policy?.structuredRules?.complianceControlMode === "string"
    ? policy.structuredRules.complianceControlMode
    : "";
  const complianceConfigured = complianceEnabled && ["Observe", "Review", "Enforce"].includes(complianceMode) &&
    Array.isArray(policy?.structuredRules?.complianceRequiredActions) &&
    Array.isArray(policy?.structuredRules?.complianceAllowedCounterpartyTypes);
  const complianceOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Compliance Controls" &&
      ["Compliance feed availability", "Sanctions screening result"].includes(finding.rule) &&
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
    { id: "oracle-validation", label: "Oracle validation operational", weight: 5, passed: !oracleRelevant || (oracleConfigured && oracleOperational), detail: !oracleRelevant ? "Not required by the selected capabilities." : oracleConfigured ? oracleOperational ? `${oracleMode} mode is configured and a fresh oracle feed check has been observed.` : `${oracleMode} mode is configured, but no fresh oracle validation pass is visible yet.` : "Oracle Validation policy mode is not configured for this policy.", recommendation: oracleConfigured ? "Configure a fresh oracle feed and submit a priced Swap example through the Intent Playground." : "Configure Oracle Validation limits in the active policy.", page: oracleConfigured ? "intent-playground" : "policies" },
    { id: "bridge-controls", label: "Bridge controls configured", weight: 5, passed: !bridgeRelevant || (bridgeConfigured && bridgeOperational), detail: !bridgeRelevant ? "Not required by the selected capabilities." : bridgeConfigured ? bridgeOperational ? `${bridgeMode} mode is configured and a complete bridge route has been evaluated.` : `${bridgeMode} mode is configured, but no complete Bridge Controls pass is visible yet.` : "Bridge provider, chain, and asset allowlists are not fully configured.", recommendation: bridgeConfigured ? "Submit a complete Bridge example through the Intent Playground to verify route controls." : "Configure approved bridge providers, chains, assets, fees, quote age, and finality requirements in the policy.", page: bridgeConfigured ? "intent-playground" : "policies" },
    { id: "x402-payment-controls", label: "x402 payment controls configured", weight: 5, passed: !x402Relevant || (x402Configured && x402Operational), detail: !x402Relevant ? "Not required by the selected capabilities." : x402Configured ? x402Operational ? `${x402Mode} mode is configured and a bound x402 authorization has been evaluated.` : `${x402Mode} mode is configured, but no successful x402 authorization is visible yet.` : "x402 merchant, network, scheme, and payment limits are not fully configured.", recommendation: x402Configured ? "Submit an approved x402 Payment example through the Intent Playground and reconcile its settlement." : "Enable x402 Payment Controls and configure exact-scheme merchants, recipients, networks, assets, facilitators, and payment limits.", page: x402Configured ? "intent-playground" : "policies" },
    { id: "compliance-controls", label: "Compliance controls configured", weight: 5, passed: !complianceRelevant || (complianceConfigured && complianceOperational), detail: !complianceRelevant ? "Not required by the selected capabilities." : complianceConfigured ? complianceOperational ? `${complianceMode} mode is configured and current compliance screening evidence has been observed.` : `${complianceMode} mode is configured, but no current screening or configured-feed pass is visible yet.` : "Compliance Controls are not fully configured for this treasury or enterprise agent.", recommendation: complianceConfigured ? "Submit a complete compliance-evidence example through the Intent Playground." : "Configure required actions, attestation evidence, jurisdiction controls, screening behavior, and accepted providers in the policy.", page: complianceConfigured ? "intent-playground" : "policies" },
    { id: "casper-proof", label: "Casper proof recording observed", weight: 5, passed: proofRecorded, detail: proofRecorded ? "At least one decision proof is recorded." : "No recorded decision proof is visible for this agent yet.", recommendation: "Run a gateway test and verify the Casper proof service.", page: "audit-log" },
    { id: "agent-state", label: "Agent configuration complete", weight: 3, passed: agent.status === "Active" && agent.onboardingStatus !== "draft", detail: agent.status === "Active" ? "Agent is active and available to the gateway." : "Agent is not active.", recommendation: "Complete onboarding and ensure the agent is active.", page: "connected-agents" },
  ];

  const totalWeight = checks.reduce((total, check) => total + check.weight, 0);
  const earnedWeight = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
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
  const oracleFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Oracle Validation") || [];
  const oracleFailed = oracleFindings.some((finding) => finding.status === "fail");
  const oracleUnavailable = oracleFindings.some((finding) => finding.status === "unavailable");
  const oracleWarned = oracleFindings.some((finding) => finding.status === "warning");
  const oracleFeedPassed = oracleFindings.some((finding) => finding.rule === "Oracle feed availability" && finding.status === "pass");
  const oracleHealth = oracleFindings.length === 0 ? "unknown" : oracleFailed || oracleWarned ? "attention" : oracleUnavailable ? "unavailable" : oracleFeedPassed ? "observed" : "unknown";
  const bridgeFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Bridge Controls") || [];
  const bridgeFailed = bridgeFindings.some((finding) => finding.status === "fail");
  const bridgeUnavailable = bridgeFindings.some((finding) => finding.status === "unavailable");
  const bridgeWarned = bridgeFindings.some((finding) => finding.status === "warning");
  const bridgePassed = bridgeFindings.some((finding) => finding.rule === "Bridge route metadata" && finding.status === "pass");
  const bridgeHealth = bridgeFindings.length === 0 ? "unknown" : bridgeFailed || bridgeWarned ? "attention" : bridgeUnavailable ? "unavailable" : bridgePassed ? "observed" : "unknown";
  const x402Findings = latest?.moduleFindings?.filter((finding) => finding.module === "x402 Payment Controls") || [];
  const x402Failed = x402Findings.some((finding) => finding.status === "fail");
  const x402Unavailable = x402Findings.some((finding) => finding.status === "unavailable");
  const x402Warned = x402Findings.some((finding) => finding.status === "warning");
  const x402Bound = x402Findings.some((finding) => finding.rule === "Canonical request fingerprint" && finding.status === "pass");
  const x402Health = x402Findings.length === 0 ? "unknown" : x402Failed || x402Warned ? "attention" : x402Unavailable ? "unavailable" : x402Bound ? "observed" : "unknown";
  const complianceFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Compliance Controls") || [];
  const complianceFailed = complianceFindings.some((finding) => finding.status === "fail");
  const complianceUnavailable = complianceFindings.some((finding) => finding.status === "unavailable");
  const complianceWarned = complianceFindings.some((finding) => finding.status === "warning");
  const compliancePassed = complianceFindings.some((finding) => ["Compliance feed availability", "Sanctions screening result"].includes(finding.rule) && finding.status === "pass");
  const complianceHealth = complianceFindings.length === 0 ? "unknown" : complianceFailed || complianceWarned ? "attention" : complianceUnavailable ? "unavailable" : compliancePassed ? "observed" : "unknown";
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
    { label: "Oracle Validation", status: oracleHealth, detail: oracleFindings.length === 0 ? "No Oracle Validation finding is available for the latest request." : oracleFailed ? "The latest request failed an enforced oracle integrity rule." : oracleWarned ? "The latest price-sensitive request requires attention." : oracleUnavailable ? "The configured oracle feed was unavailable or stale and did not count as a pass." : oracleFeedPassed ? "A fresh configured oracle feed evaluated the latest priced intent." : "Oracle Validation did not produce an operational feed result." },
    { label: "Bridge Controls", status: bridgeHealth, detail: bridgeFindings.length === 0 ? "No Bridge Controls finding is available for the latest request." : bridgeFailed ? "The latest bridge route failed an enforced provider, chain, fee, quote, address, or finality rule." : bridgeWarned ? "The latest bridge route requires attention before signing." : bridgeUnavailable ? "Required bridge route metadata or policy configuration was unavailable and did not count as a pass." : bridgePassed ? "A complete provider-supplied bridge route was evaluated." : "Bridge Controls did not produce a complete route result." },
    { label: "x402 Payment Controls", status: x402Health, detail: x402Findings.length === 0 ? "No x402 Payment Controls finding is available for the latest request." : x402Failed ? "The latest x402 request failed an enforced merchant, recipient, network, amount, binding, replay, or settlement rule." : x402Warned ? "The latest x402 request requires review before payment signing." : x402Unavailable ? "Required x402 payment metadata was unavailable and did not count as a pass." : x402Bound ? "The latest x402 authorization was bound to a deterministic request fingerprint." : "x402 Payment Controls did not produce a complete authorization result." },
    { label: "Compliance Controls", status: complianceHealth, detail: complianceFindings.length === 0 ? "No Compliance Controls finding is available for the latest request." : complianceFailed ? "The latest request failed an enforced compliance, attestation, jurisdiction, screening, or exact-match rule." : complianceWarned ? "The latest controlled workflow requires authorized compliance review." : complianceUnavailable ? "Required screening evidence or the configured compliance feed was unavailable and did not count as a pass." : compliancePassed ? "Current non-sensitive screening evidence or a configured feed evaluated the latest request." : "Compliance Controls did not produce an operational screening result." },
    { label: "Casper proof service", status: proofState === "recorded" ? "healthy" : proofState === "failed" ? "attention" : "pending", detail: proofState },
    { label: "Audit synchronization", status: latest ? "healthy" : "unknown", detail: latest ? "Latest audit record is visible." : "No audit record is available." },
  ];
  const attention = checks.filter((check) => ["attention", "unavailable"].includes(check.status)).length;
  return { overall: attention === 0 ? "Healthy" : attention <= 2 ? "Needs attention" : "Degraded", checks };
}
