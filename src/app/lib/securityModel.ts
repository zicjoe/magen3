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

export interface ProtectionControl {
  id: string;
  name: string;
  description: string;
  status: ModuleAvailability;
  configurable: boolean;
}

export interface ProtectionArea {
  id: string;
  name: string;
  description: string;
  status: ModuleAvailability;
  capabilities: ExecutionCapability[];
  controls: ProtectionControl[];
  currentChecks: string[];
  futureChecks: string[];
  configurable: boolean;
}

const ALL_CAPABILITIES = EXECUTION_CAPABILITY_CATALOG.map((item) => item.id);

function areaSummaryStatus(controls: ProtectionControl[]): ModuleAvailability {
  if (controls.some((control) => control.status === "Live")) return "Live";
  if (controls.some((control) => control.status === "Foundation Available")) return "Foundation Available";
  if (controls.some((control) => control.status === "Preview")) return "Preview";
  return "Planned";
}

function protectionArea(area: Omit<ProtectionArea, "status" | "currentChecks" | "futureChecks" | "configurable">): ProtectionArea {
  return {
    ...area,
    status: areaSummaryStatus(area.controls),
    currentChecks: area.controls.filter((control) => control.status !== "Planned").map((control) => control.name),
    futureChecks: area.controls.filter((control) => control.status === "Planned").map((control) => control.name),
    configurable: area.controls.some((control) => control.configurable),
  };
}

export const PROTECTION_MODULE_CATALOG: ProtectionArea[] = [
  protectionArea({
    id: "agent-trust-access",
    name: "Agent Trust & Access",
    description: "Confirms the approved agent, credentials, tools, and delegated authority behind every intent.",
    capabilities: ALL_CAPABILITIES,
    controls: [
      { id: "agent-authentication", name: "Agent authentication", description: "Agent ID, API-key hash, active status, and ownership checks.", status: "Live", configurable: true },
      { id: "credential-lifecycle", name: "Credential rotation and revocation", description: "One-time key issuance, rotation, preview, and revocation controls.", status: "Live", configurable: true },
      { id: "instruction-integrity", name: "Instruction Integrity", description: "Bind high-risk execution to a stable user goal, trusted provenance, exact protected parameters, and contained tool permissions.", status: "Live", configurable: true },
      { id: "tool-mcp-integrity", name: "Tool and MCP integrity", description: "Approved MCP servers, tool identity, version, manifest/schema/description hashes, TLS, origin, credential scope, and least-privilege permission checks.", status: "Live", configurable: true },
      { id: "delegation-session-keys", name: "Delegation and session permissions", description: "Verify Casper-signed, short-lived delegated authority and enforce exact network, contract, method, asset, amount, frequency, depth, and revocation scopes.", status: "Foundation Available", configurable: true },
    ],
  }),
  protectionArea({
    id: "policy-approval-controls",
    name: "Policy & Approval Controls",
    description: "Applies deterministic policy rules and routes exceptional actions into controlled human authorization.",
    capabilities: ALL_CAPABILITIES,
    controls: [
      { id: "policy-enforcement", name: "Deterministic policy enforcement", description: "Blocked actions, transaction limits, daily limits, target controls, and risk modes.", status: "Live", configurable: true },
      { id: "review-thresholds", name: "Review thresholds", description: "Escalates high-value or policy-sensitive requests to Review Required.", status: "Live", configurable: true },
      { id: "approval-quorum", name: "Human approval and quorum", description: "Bind one or more approvers to the exact reviewed intent before execution.", status: "Foundation Available", configurable: true },
      { id: "reviewer-signatures", name: "Cryptographic reviewer signatures", description: "Verify one-time Ed25519 or Secp256k1 Casper Wallet signatures bound to the exact approval response, reviewer, chain, nonce, and expiry.", status: "Foundation Available", configurable: true },
      { id: "organizational-approval", name: "Approval escalation and organizational quorum", description: "Resolve value-, capability-, action-, and contract-aware approval tiers with named role groups, timed backup escalation, execution delays, and signing windows.", status: "Live", configurable: true },
      { id: "emergency-controls", name: "Emergency circuit breaker", description: "Pause an agent, capability, action family, payment flow, or all execution with audited expiry and authorized resume.", status: "Live", configurable: true },
    ],
  }),
  protectionArea({
    id: "wallet-asset-safety",
    name: "Wallet & Asset Safety",
    description: "Protects execution wallets, destinations, spending boundaries, and the assets an agent is allowed to move.",
    capabilities: ALL_CAPABILITIES,
    controls: [
      { id: "wallet-identity", name: "Wallet identity and destination validation", description: "Casper public-key/account-hash structure, target classification, and self-transfer protection.", status: "Live", configurable: true },
      { id: "wallet-spend-controls", name: "Wallet spending controls", description: "Per-transaction, wallet-specific daily, destination, and review-threshold limits.", status: "Live", configurable: true },
      { id: "asset-identity", name: "Asset identity and network consistency", description: "Tracks submitted asset identity and prevents unsupported network assumptions.", status: "Foundation Available", configurable: true },
      { id: "token-risk", name: "Token behavior and economic risk", description: "Mint, pause, blacklist, fee-on-transfer, liquidity, concentration, and backing signals.", status: "Planned", configurable: true },
    ],
  }),
  protectionArea({
    id: "contract-permission-safety",
    name: "Contract & Permission Safety",
    description: "Validates the contract being called and the authority an agent exercises or grants through it.",
    capabilities: ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"],
    controls: [
      { id: "contract-identity", name: "Contract identity and allowlists", description: "Contract Hash, Package Hash, chain, target type, approved and blocked contract controls.", status: "Live", configurable: true },
      { id: "entry-point-controls", name: "Entry-point and package-version controls", description: "Entry-point structure, optional allowlists, and package-version semantics.", status: "Live", configurable: true },
      { id: "privileged-actions", name: "Privileged contract actions", description: "Classify and govern supported upgrade, ownership, admin, mint, pause, role, oracle, fee, validator, and treasury-sensitive calls.", status: "Live", configurable: true },
      { id: "contract-upgrades", name: "Contract upgrade safety", description: "Bind current and proposed implementations, code hashes, administrators, upgrade delays, and approval quorum before signing.", status: "Live", configurable: true },
      { id: "contract-arguments", name: "Contract argument policies", description: "Required and allowed arguments, types, numeric ranges, address rules, boolean restrictions, enum values, and exact runtime-argument binding.", status: "Live", configurable: true },
      { id: "token-permissions", name: "Token approvals and permits", description: "Bounded allowances, approved spenders, permit expiry, exact parameter binding, replay prevention, NFT operator, and batch controls.", status: "Live", configurable: true },
    ],
  }),
  protectionArea({
    id: "execution-integrity",
    name: "Execution Integrity",
    description: "Protects transaction construction, lifecycle, replay state, retries, settlement, and chain-data assumptions.",
    capabilities: ALL_CAPABILITIES,
    controls: [
      { id: "transaction-preflight", name: "Transaction construction preflight", description: "Payment budget, gas tolerance, TTL, timestamp, transaction hash, runtime arguments, and output bounds.", status: "Live", configurable: false },
      { id: "lifecycle-replay", name: "Lifecycle and replay protection", description: "Intent IDs, idempotency keys, fingerprints, expiry, sequence, duplicate detection, and retry safety.", status: "Live", configurable: true },
      { id: "settlement-reconciliation", name: "Execution and settlement reconciliation", description: "Authenticated post-authorization state transitions with transaction binding, attempt limits, unsafe-retry prevention, replacement links, confirmation/finality, delivery, refund, and audit history. Independent on-chain polling remains required for Live.", status: "Foundation Available", configurable: true },
      { id: "stateful-simulation", name: "Stateful execution simulation", description: "Speculative state changes, reverts, CLTypes, and verified cost estimation.", status: "Foundation Available", configurable: false },
      { id: "rpc-integrity", name: "RPC and chain integrity", description: "Network identity, synchronization, provider disagreement, failover, and state consistency.", status: "Foundation Available", configurable: true },
      { id: "gas-sponsorship", name: "Gas sponsorship and fee safety", description: "Bound network fees, approved relayers and Paymasters, expiry, scope, payer identity, sponsored budgets, operation counts, and repeated-failure limits.", status: "Foundation Available", configurable: true },
    ],
  }),
  protectionArea({
    id: "market-oracle-integrity",
    name: "Market & Oracle Integrity",
    description: "Checks whether price-sensitive execution uses sufficiently fresh, consistent, and policy-compatible market data.",
    capabilities: ["Trading", "dApp Interactions"],
    controls: [
      { id: "quote-bounds", name: "Slippage and output bounds", description: "Slippage structure, expected output, minimum received, and quote-bound consistency.", status: "Live", configurable: true },
      { id: "oracle-integrity", name: "Oracle price integrity", description: "Feed freshness, pair availability, source quorum, confidence, spread, and execution-price deviation.", status: "Foundation Available", configurable: true },
      { id: "mev-quality", name: "MEV and execution quality", description: "Price impact, route quality, sandwich risk, protected submission, and reserve-movement signals.", status: "Planned", configurable: true },
      { id: "asset-market-risk", name: "Asset market-risk signals", description: "Liquidity depth, concentration, volatility, and wrapped-asset backing evidence.", status: "Planned", configurable: true },
    ],
  }),
  protectionArea({
    id: "cross-chain-payment-controls",
    name: "Cross-chain & Payment Controls",
    description: "Protects bridge routes and autonomous machine payments without creating separate products or navigation clutter.",
    capabilities: ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation", "Custom"],
    controls: [
      { id: "bridge-routes", name: "Bridge route controls", description: "Provider, source/destination chain, asset, fee, quote, destination, and confirmation checks.", status: "Foundation Available", configurable: true },
      { id: "x402-authorization", name: "x402 exact-payment authorization", description: "Resource, merchant, recipient, network, asset, amount, expiry, binding, replay, and budget controls.", status: "Foundation Available", configurable: true },
      { id: "x402-settlement", name: "x402 settlement reconciliation", description: "Authenticated submitted, pending, confirmed, failed, uncertain, and delivery-state reporting.", status: "Foundation Available", configurable: true },
      { id: "native-payment-adapters", name: "Additional native payment adapters", description: "Chain-specific machine-payment schemes and facilitator integrations beyond the current foundation.", status: "Planned", configurable: true },
    ],
  }),
  protectionArea({
    id: "threat-compliance",
    name: "Threat & Compliance",
    description: "Combines external risk indicators with operator-defined compliance evidence and restrictions while keeping them distinguishable.",
    capabilities: ALL_CAPABILITIES,
    controls: [
      { id: "threat-screening", name: "Threat-intelligence screening", description: "Freshness-checked exact wallet, account-hash, Contract Hash, and Package Hash indicators.", status: "Foundation Available", configurable: true },
      { id: "compliance-evidence", name: "Compliance evidence controls", description: "Non-sensitive attestations, Travel Rule status, jurisdictions, counterparties, screening, and risk ratings.", status: "Foundation Available", configurable: true },
      { id: "managed-risk-providers", name: "Managed provider adapters", description: "Corroborated reputation, sanctions, exploit, and jurisdiction-specific rule sources.", status: "Planned", configurable: true },
    ],
  }),
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
  const lifecycleMode = typeof policy?.structuredRules?.lifecycleControlMode === "string"
    ? policy.structuredRules.lifecycleControlMode
    : "";
  const lifecycleConfigured = policy?.structuredRules?.lifecycleControlsEnabled === true &&
    ["Observe", "Review", "Enforce"].includes(lifecycleMode) &&
    policy?.structuredRules?.lifecycleRequireIntentId === true &&
    policy?.structuredRules?.lifecycleRequireIdempotencyKey === true &&
    policy?.structuredRules?.lifecycleRequireCreatedAt === true &&
    policy?.structuredRules?.lifecycleRequireExpiry === true &&
    policy?.structuredRules?.lifecyclePreventDuplicateFingerprint === true;
  const lifecycleOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Execution Integrity" &&
      finding.rule === "Intent ID replay prevention" &&
      finding.status === "pass"));
  const instructionIntegrityEnabled = policy?.structuredRules?.instructionIntegrityEnabled === true;
  const instructionIntegrityMode = typeof policy?.structuredRules?.instructionIntegrityMode === "string"
    ? policy.structuredRules.instructionIntegrityMode
    : "";
  const instructionGoalActions = Array.isArray(policy?.structuredRules?.requireGoalBindingForActions)
    ? policy.structuredRules.requireGoalBindingForActions as string[]
    : [];
  const instructionIntegrityConfigured = instructionIntegrityEnabled &&
    ["Observe", "Review", "Enforce"].includes(instructionIntegrityMode) &&
    instructionGoalActions.length > 0 &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.externalContentHighRiskAction || "")) &&
    Array.isArray(policy?.structuredRules?.allowedSourceDomains) &&
    Array.isArray(policy?.structuredRules?.blockedSourceDomains);
  const instructionIntegrityOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Agent Instruction Integrity" &&
      ["Valid instruction provenance", "Stable goal binding", "Protected parameter binding"].includes(finding.rule) &&
      finding.status === "pass"));
  const toolIntegrityEnabled = policy?.structuredRules?.toolIntegrityEnabled === true;
  const toolIntegrityMode = typeof policy?.structuredRules?.toolIntegrityMode === "string" ? policy.structuredRules.toolIntegrityMode : "";
  const toolIntegrityConfigured = toolIntegrityEnabled &&
    ["Observe", "Review", "Enforce"].includes(toolIntegrityMode) &&
    Array.isArray(policy?.structuredRules?.approvedMcpServers) && policy.structuredRules.approvedMcpServers.length > 0 &&
    Array.isArray(policy?.structuredRules?.approvedTools) && policy.structuredRules.approvedTools.length > 0 &&
    policy?.structuredRules?.requireTls !== false;
  const toolIntegrityOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "Tool & MCP Integrity" && ["Approved MCP server", "Approved tool", "Permission scope containment"].includes(finding.rule) && finding.status === "pass"));
  const delegationEnabled = policy?.structuredRules?.delegationControlsEnabled === true;
  const delegationMode = typeof policy?.structuredRules?.delegationMode === "string" ? policy.structuredRules.delegationMode : "";
  const delegationConfigured = delegationEnabled &&
    ["Observe", "Review", "Enforce"].includes(delegationMode) &&
    policy?.structuredRules?.requireExpiringDelegation !== false &&
    Number(policy?.structuredRules?.maximumDelegationLifetime || 0) >= 60 &&
    Number(policy?.structuredRules?.maximumDelegationDepth ?? -1) >= 0 &&
    Array.isArray(policy?.structuredRules?.approvedDelegates) &&
    Array.isArray(policy?.structuredRules?.blockedDelegates) &&
    Array.isArray(policy?.structuredRules?.revokedDelegationIds) &&
    policy?.structuredRules?.requireScopeBinding !== false &&
    policy?.structuredRules?.requireCryptographicDelegationAttestation !== false;
  const delegationOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "Delegation & Session Key Safety" && ["Cryptographic delegation attestation", "Delegating wallet binding", "Delegation lifetime"].includes(finding.rule) && finding.status === "pass"));
  const rpcIntegrityEnabled = policy?.structuredRules?.rpcIntegrityEnabled === true;
  const rpcIntegrityMode = typeof policy?.structuredRules?.rpcIntegrityMode === "string" ? policy.structuredRules.rpcIntegrityMode : "";
  const approvedRpcEndpoints = Array.isArray(policy?.structuredRules?.approvedRpcEndpoints) ? policy.structuredRules.approvedRpcEndpoints as unknown[] : [];
  const rpcIntegrityConfigured = rpcIntegrityEnabled &&
    ["Observe", "Review", "Enforce"].includes(rpcIntegrityMode) &&
    approvedRpcEndpoints.length > 0 &&
    Number(policy?.structuredRules?.rpcIntegrityMaximumBlockAgeSeconds || 0) >= 5 &&
    Number(policy?.structuredRules?.rpcIntegrityMinimumProviders || 0) >= 1 &&
    Number(policy?.structuredRules?.rpcIntegrityMaximumHeightDifference ?? -1) >= 0 &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.rpcIntegrityDisagreementAction || "")) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.rpcIntegrityUnavailableAction || ""));
  const rpcIntegrityOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "RPC & Chain Integrity" && ["Network identity binding", "Minimum RPC provider quorum", "RPC network agreement"].includes(finding.rule) && finding.status === "pass"));
  const feeSafetyEnabled = policy?.structuredRules?.feeSafetyEnabled === true;
  const feeSafetyMode = typeof policy?.structuredRules?.feeSafetyMode === "string" ? policy.structuredRules.feeSafetyMode : "";
  const approvedSponsors = Array.isArray(policy?.structuredRules?.feeSafetyApprovedSponsors) ? policy.structuredRules.feeSafetyApprovedSponsors as unknown[] : [];
  const approvedPaymasters = Array.isArray(policy?.structuredRules?.feeSafetyApprovedPaymasters) ? policy.structuredRules.feeSafetyApprovedPaymasters as unknown[] : [];
  const feeSafetyConfigured = feeSafetyEnabled &&
    ["Observe", "Review", "Enforce"].includes(feeSafetyMode) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.feeSafetySponsorshipUnavailableAction || "")) &&
    Number(policy?.structuredRules?.feeSafetyLookbackSeconds || 0) >= 60 &&
    Number(policy?.structuredRules?.feeSafetyMaximumFailedSponsoredOperations ?? -1) >= 0 &&
    (approvedSponsors.length > 0 || approvedPaymasters.length > 0 || Number(policy?.structuredRules?.feeSafetyMaximumNetworkFee || 0) > 0);
  const feeSafetyOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) => finding.module === "Gas Sponsorship & Fee Safety" && ["Maximum network fee", "Approved sponsor", "Approved Paymaster", "Expected payer"].includes(finding.rule) && finding.status === "pass"));
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
  const tokenPermissionRelevant = capabilities.some((item) => ["Trading", "Wallet Management", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item));
  const tokenPermissionEnabled = policy?.structuredRules?.tokenPermissionControlsEnabled === true;
  const tokenPermissionMode = typeof policy?.structuredRules?.tokenPermissionMode === "string"
    ? policy.structuredRules.tokenPermissionMode
    : "";
  const tokenPermissionApprovedSpenders = Array.isArray(policy?.structuredRules?.tokenPermissionApprovedSpenders)
    ? policy.structuredRules.tokenPermissionApprovedSpenders as string[]
    : [];
  const tokenPermissionBlockedSpenders = Array.isArray(policy?.structuredRules?.tokenPermissionBlockedSpenders)
    ? policy.structuredRules.tokenPermissionBlockedSpenders as string[]
    : [];
  const tokenPermissionConfigured = tokenPermissionEnabled &&
    ["Observe", "Review", "Enforce"].includes(tokenPermissionMode) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.tokenPermissionUnknownSpenderAction || "")) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.tokenPermissionUnlimitedApprovalAction || "")) &&
    Number(policy?.structuredRules?.tokenPermissionMaxApprovalToTransactionRatio) > 0 &&
    Number(policy?.structuredRules?.tokenPermissionMaxLifetimeSeconds) > 0 &&
    Number(policy?.structuredRules?.tokenPermissionMaximumBatchSize) > 0 &&
    tokenPermissionApprovedSpenders.length > 0 &&
    tokenPermissionBlockedSpenders.length >= 0;
  const tokenPermissionOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Token Permission Controls" &&
      finding.rule === "Supported permission classification" &&
      finding.status === "pass"));
  const privilegedActionRelevant = capabilities.some((item) => ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item));
  const privilegedActionEnabled = policy?.structuredRules?.privilegedActionControlsEnabled === true;
  const privilegedActionMode = typeof policy?.structuredRules?.privilegedActionMode === "string"
    ? policy.structuredRules.privilegedActionMode
    : "";
  const privilegedReviewActions = Array.isArray(policy?.structuredRules?.privilegedActionsRequiringReview)
    ? policy.structuredRules.privilegedActionsRequiringReview as string[]
    : [];
  const privilegedBlockedActions = Array.isArray(policy?.structuredRules?.privilegedActionsBlocked)
    ? policy.structuredRules.privilegedActionsBlocked as string[]
    : [];
  const privilegedQuorumRules = policy?.structuredRules?.privilegedActionQuorumRules;
  const privilegedActionConfigured = privilegedActionEnabled &&
    ["Observe", "Review", "Enforce"].includes(privilegedActionMode) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.unknownPrivilegedAction || "")) &&
    privilegedReviewActions.length > 0 &&
    privilegedBlockedActions.length >= 0 &&
    privilegedQuorumRules != null && typeof privilegedQuorumRules === "object" && !Array.isArray(privilegedQuorumRules);
  const privilegedActionOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Privileged Action Controls" &&
      finding.rule === "Supported privileged-action classification" &&
      finding.status === "pass"));
  const contractUpgradeRelevant = capabilities.some((item) => ["Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item));
  const contractUpgradeEnabled = policy?.structuredRules?.contractUpgradeControlsEnabled === true;
  const contractUpgradeMode = typeof policy?.structuredRules?.contractUpgradeMode === "string" ? policy.structuredRules.contractUpgradeMode : "";
  const contractUpgradeConfigured = contractUpgradeEnabled &&
    ["Observe", "Review", "Enforce"].includes(contractUpgradeMode) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.contractUpgradeUnknownImplementationAction || "")) &&
    Number(policy?.structuredRules?.contractUpgradeQuorum || 0) >= 1 &&
    Array.isArray(policy?.structuredRules?.contractUpgradeApprovedImplementations) &&
    Array.isArray(policy?.structuredRules?.contractUpgradeBlockedImplementations);
  const contractUpgradeOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Contract Upgrade Safety" &&
      ["Upgrade target binding", "Requested implementation format", "Approved implementation allowlist"].includes(finding.rule) &&
      finding.status === "pass"));
  const contractArgumentRelevant = capabilities.some((item) => ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"].includes(item));
  const contractArgumentEnabled = policy?.structuredRules?.contractArgumentControlsEnabled === true;
  const contractArgumentMode = typeof policy?.structuredRules?.contractArgumentMode === "string" ? policy.structuredRules.contractArgumentMode : "";
  const contractArgumentRules = Array.isArray(policy?.structuredRules?.contractArgumentRules) ? policy.structuredRules.contractArgumentRules as Array<Record<string, unknown>> : [];
  const contractArgumentConfigured = contractArgumentEnabled &&
    ["Observe", "Review", "Enforce"].includes(contractArgumentMode) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.contractArgumentUnknownRuleAction || "")) &&
    ["Warn", "Review", "Block"].includes(String(policy?.structuredRules?.contractArgumentUnknownArgumentAction || "")) &&
    contractArgumentRules.length > 0 &&
    contractArgumentRules.every((rule) => String(rule.contract || rule.target || "").trim() && String(rule.entryPoint || rule.entry_point || "").trim());
  const contractArgumentOperational = logs.some((log) =>
    log.moduleFindings?.some((finding) =>
      finding.module === "Contract Argument Policies" &&
      finding.rule === "Configured contract argument rule" &&
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
  const approvalEnabled = policy?.structuredRules?.approvalWorkflowEnabled === true;
  const approvalApprovers = Array.isArray(policy?.structuredRules?.approvalApproverWallets) ? policy.structuredRules.approvalApproverWallets as string[] : [];
  const approvalOwnerFallback = policy?.structuredRules?.approvalAllowOwnerFallback !== false;
  const approvalRequiredCount = Number(policy?.structuredRules?.approvalRequiredCount || 1);
  const approvalOrganizationalEnabled = policy?.structuredRules?.approvalOrganizationalQuorumEnabled === true;
  const approvalGroups = Array.isArray(policy?.structuredRules?.approvalGroups) ? policy.structuredRules.approvalGroups as Array<Record<string, unknown>> : [];
  const approvalTiers = Array.isArray(policy?.structuredRules?.approvalTiers) ? policy.structuredRules.approvalTiers as Array<Record<string, unknown>> : [];
  const approvalOrganizationDefaults = policy?.structuredRules?.approvalOrganizationDefaults && typeof policy.structuredRules.approvalOrganizationDefaults === "object" && !Array.isArray(policy.structuredRules.approvalOrganizationDefaults)
    ? policy.structuredRules.approvalOrganizationDefaults as Record<string, unknown>
    : {};
  const approvalGroupWallets = [...new Set(approvalGroups.flatMap((group) => Array.isArray(group.wallets) ? group.wallets.map((wallet) => String(wallet).trim()).filter(Boolean) : []))];
  const approvalGroupsValid = approvalGroups.length > 0 && approvalGroups.every((group) => String(group.id || group.name || group.role || "").trim() && Array.isArray(group.wallets) && group.wallets.length > 0);
  const approvalRulesPresent = approvalTiers.length > 0 || (Array.isArray(approvalOrganizationDefaults.requiredGroups) && approvalOrganizationDefaults.requiredGroups.length > 0);
  const approvalOrganizationalConfigured = approvalOrganizationalEnabled && approvalGroupsValid && approvalRulesPresent && approvalGroupWallets.length >= approvalRequiredCount;
  const approvalConfigured = approvalEnabled && approvalRequiredCount > 0 && (approvalOrganizationalEnabled ? approvalOrganizationalConfigured : approvalOwnerFallback || approvalApprovers.length >= approvalRequiredCount);
  const approvalOperational = logs.some((log) => log.moduleFindings?.some((finding) => finding.module === "Policy & Approval Controls" && finding.rule === "Human approval quorum"));
  const approvalSignatureRequired = policy?.structuredRules?.requireCryptographicReviewerSignature === true;
  const approvalSignatureOperational = logs.some((log) => log.moduleFindings?.some((finding) => finding.module === "Policy & Approval Controls" && finding.rule === "Cryptographic reviewer signature" && finding.status === "pass"));
  const approvalOrganizationalRelevant = capabilities.some((item) => ["Treasury Operations", "Enterprise Automation"].includes(item));
  const approvalOrganizationalOperational = logs.some((log) => log.moduleFindings?.some((finding) => finding.module === "Policy & Approval Controls" && finding.rule === "Organizational approval quorum" && finding.status === "pass"));
  const emergencyControlsEnabled = policy?.structuredRules?.emergencyControlsEnabled === true;
  const emergencyPauseAction = String(policy?.structuredRules?.emergencyAutomaticPauseAction || "Blocked");
  const emergencyControlsConfigured = emergencyControlsEnabled &&
    ["Blocked", "Review Required"].includes(emergencyPauseAction) &&
    Number(policy?.structuredRules?.emergencyPauseDurationSeconds || 3600) >= 60 &&
    Number(policy?.structuredRules?.emergencyResumeQuorum || 1) >= 1;
  const emergencyControlsOperational = logs.some((log) => log.moduleFindings?.some((finding) =>
    finding.module === "Emergency Circuit Breaker" &&
    finding.rule === "Active emergency pause" &&
    ["pass", "warning", "fail"].includes(finding.status)));
  const requiredProtectionObserved = contractRelevant ? contractValidationObserved : walletValidationObserved;

  const checks: CoverageCheck[] = [
    { id: "capabilities", label: "Execution capabilities selected", weight: 10, passed: capabilities.length > 0, detail: `${capabilities.length} capability${capabilities.length === 1 ? "" : "ies"} configured.`, recommendation: "Select at least one execution capability.", page: "connected-agents" },
    { id: "active-policy", label: "Active policy assigned", weight: 20, passed: policy?.status === "Active", detail: policy?.status === "Active" ? "An active policy controls gateway decisions." : "No active policy is assigned.", recommendation: "Create or activate a policy for this agent.", page: "policies" },
    { id: "spend-limits", label: "Spend limits configured", weight: 15, passed: Number(policy?.maxTransaction) > 0 && Number(policy?.dailyLimit) > 0, detail: policy ? `Maximum ${policy.maxTransaction} CSPR; daily ${policy.dailyLimit} CSPR.` : "Spend limits are unavailable without a policy.", recommendation: "Configure maximum transaction and daily spending limits.", page: "policies" },
    { id: "destination-controls", label: "Destination controls", weight: 8, passed: !destinationRelevant || Boolean(policy?.trustedContracts?.length), detail: !destinationRelevant ? "Not required by the selected capabilities." : policy?.trustedContracts?.length ? `${policy.trustedContracts.length} approved target${policy.trustedContracts.length === 1 ? "" : "s"}.` : "No approved destinations are configured.", recommendation: "Add approved wallet destinations or trusted targets.", page: "policies" },
    { id: "contract-controls", label: "Contract controls", weight: 8, passed: !contractRelevant || Boolean(policy?.trustedContracts?.length), detail: !contractRelevant ? "Not required by the selected capabilities." : policy?.trustedContracts?.length ? "Trusted contract controls are configured." : "No trusted contracts are configured.", recommendation: "Add approved contracts for dApp and trading interactions.", page: "policies" },
    { id: "review-threshold", label: "Human review threshold", weight: 8, passed: !reviewRelevant || Number(policy?.approvalThreshold) > 0, detail: !reviewRelevant ? "Not required by the selected capabilities." : Number(policy?.approvalThreshold) > 0 ? `Review required above ${policy?.approvalThreshold} CSPR.` : "No review threshold is configured.", recommendation: "Configure a review threshold for higher-value actions.", page: "policies" },
    { id: "approval-workflow", label: "Human approval workflow", weight: 6, passed: !reviewRelevant || (approvalConfigured && approvalOperational && (!approvalSignatureRequired || approvalSignatureOperational)), detail: !reviewRelevant ? "Not required by the selected capabilities." : approvalConfigured ? approvalOperational ? approvalSignatureRequired ? approvalSignatureOperational ? `Review Required decisions are bound to ${approvalRequiredCount} verified Casper Wallet signature${approvalRequiredCount === 1 ? "" : "s"}, and signed quorum evidence has been observed.` : `The workflow requires ${approvalRequiredCount} cryptographically verified approval${approvalRequiredCount === 1 ? "" : "s"}, but no verified reviewer signature has been observed yet.` : `Review Required decisions are bound to ${approvalRequiredCount} approval${approvalRequiredCount === 1 ? "" : "s"} and the workflow has been observed.` : `The workflow is configured for ${approvalRequiredCount} approval${approvalRequiredCount === 1 ? "" : "s"}, but no review request has been observed yet.` : "Review Required decisions do not yet have a complete approver and quorum configuration.", recommendation: approvalConfigured ? "Trigger a Review Required Playground request and resolve it in the Human Approval Queue." : "Enable Human Approval & Quorum and configure eligible approver wallets or owner-wallet fallback.", page: "policies" },
    { id: "organizational-approval", label: "Organizational approval rules", weight: 5, passed: !approvalOrganizationalRelevant || (approvalOrganizationalConfigured && approvalOrganizationalOperational), detail: !approvalOrganizationalRelevant ? "Not required by the selected capabilities." : approvalOrganizationalConfigured ? approvalOrganizationalOperational ? `${approvalGroups.length} named approver group${approvalGroups.length === 1 ? " is" : "s are"} configured and a resolved tier has satisfied its role quorum.` : `${approvalGroups.length} named approver group${approvalGroups.length === 1 ? " is" : "s are"} configured, but no successful tier and group-quorum evaluation is visible yet.` : "Treasury or enterprise automation does not yet have complete named groups and a tier or organization-default quorum rule.", recommendation: approvalOrganizationalConfigured ? "Submit a Review Required treasury or enterprise example and complete every required role in the Human Approval Queue." : "Enable Approval Escalation & Organizational Quorum, define named groups, and add at least one deterministic tier or organization-default role requirement.", page: approvalOrganizationalConfigured ? "human-approval" : "policies" },
    { id: "emergency-controls", label: "Emergency circuit breaker", weight: 6, passed: emergencyControlsConfigured && emergencyControlsOperational, detail: emergencyControlsConfigured ? emergencyControlsOperational ? "Scoped pause enforcement has been evaluated by the Gateway." : "Emergency Controls are configured, but no Gateway evaluation is visible yet." : "Emergency Controls are not fully configured with an enforcement action, expiry, and resume quorum.", recommendation: emergencyControlsConfigured ? "Send a normal Playground request to verify the no-active-pause check, then test a scoped pause safely." : "Enable Emergency Controls and configure pause duration, automatic behavior, and resume authority rules.", page: emergencyControlsConfigured ? "intent-playground" : "policies" },
    { id: "rpc-chain-integrity", label: "RPC and chain integrity", weight: 6, passed: rpcIntegrityConfigured && rpcIntegrityOperational, detail: rpcIntegrityConfigured ? rpcIntegrityOperational ? "Approved provider, network identity, freshness, and agreement checks have been observed." : "RPC and chain-integrity policy is configured, but no successful provider quorum has been observed yet." : "Approved provider, freshness, agreement, and failover policy is incomplete.", recommendation: rpcIntegrityConfigured ? "Submit an intent with trusted multi-provider observations to verify the configured chain boundary." : "Enable RPC & Chain Integrity and configure approved endpoints, freshness, provider quorum, disagreement, and unavailable behavior.", page: rpcIntegrityConfigured ? "intent-playground" : "policies" },
    { id: "gas-sponsorship-fee-safety", label: "Gas sponsorship and fee safety", weight: 5, passed: feeSafetyConfigured && feeSafetyOperational, detail: feeSafetyConfigured ? feeSafetyOperational ? `${feeSafetyMode} mode is configured and bounded fee or sponsorship evidence has passed.` : `${feeSafetyMode} mode is configured, but no successful fee or sponsorship evaluation is visible yet.` : "Fee bounds, sponsor or Paymaster allowlists, unavailable behavior, and rolling limits are incomplete.", recommendation: feeSafetyConfigured ? "Submit the bounded Casper relayer or EVM Paymaster example through the Intent Playground." : "Enable Gas Sponsorship & Fee Safety and configure fee limits, approved sponsors or Paymasters, expiry, evidence, budget, and operation limits.", page: feeSafetyConfigured ? "intent-playground" : "policies" },
    { id: "credential", label: "API credential active", weight: 10, passed: agent.status === "Active" && Boolean(agent.apiKeyPreview), detail: agent.apiKeyPreview ? `Credential ${agent.apiKeyPreview} is active.` : "No active credential preview is available.", recommendation: "Rotate or issue an API credential.", page: "connected-agents" },
    { id: "gateway-activity", label: "Recent live protection activity", weight: 3, passed: recentGateway && requiredProtectionObserved, detail: recentGateway && requiredProtectionObserved ? `${contractRelevant ? "Contract Validation" : "Wallet Validation"} was evaluated on ${new Date(lastIntent).toLocaleString()}.` : lastIntent ? `A recent intent exists, but no ${contractRelevant ? "Contract Validation" : "Wallet Validation"} finding is visible yet.` : "No gateway request has been received.", recommendation: `Send a valid ${contractRelevant ? "contract" : "wallet"} intent through the Intent Playground to verify live protection.`, page: "intent-playground" },
    { id: "execution-preflight", label: "Execution preflight observed", weight: 5, passed: !executionPreflightRelevant || executionPreflightObserved, detail: !executionPreflightRelevant ? "Not required by the selected capabilities." : executionPreflightObserved ? "Deterministic transaction-construction preflight has been observed. Full stateful simulation remains unavailable." : "No successful Execution Simulation preflight finding is visible yet.", recommendation: "Send an intent with preflight payment, gas, TTL, timestamp, and action-specific bounds through the Intent Playground.", page: "intent-playground" },
    { id: "lifecycle-replay", label: "Lifecycle and replay controls", weight: 6, passed: lifecycleConfigured && lifecycleOperational, detail: lifecycleConfigured ? lifecycleOperational ? `${lifecycleMode} mode is configured and a fresh unique intent ID has passed replay checks.` : `${lifecycleMode} mode is configured, but no successful lifecycle-bound request is visible yet.` : "Intent IDs, idempotency keys, creation time, expiry, and duplicate fingerprint prevention are not fully enabled.", recommendation: lifecycleConfigured ? "Submit the Fresh lifecycle-bound transfer example through the Intent Playground." : "Enable Lifecycle & Replay controls and require unique IDs, idempotency keys, creation time, expiry, and duplicate detection.", page: lifecycleConfigured ? "intent-playground" : "policies" },
    { id: "instruction-integrity", label: "Instruction Integrity configured", weight: 5, passed: instructionIntegrityConfigured && instructionIntegrityOperational, detail: instructionIntegrityConfigured ? instructionIntegrityOperational ? `${instructionIntegrityMode} mode is configured and a goal-bound provenance check has passed.` : `${instructionIntegrityMode} mode is configured, but no complete Instruction Integrity pass is visible yet.` : "Instruction Integrity needs an explicit mode, goal-bound action list, source-domain policy, and external-content handling.", recommendation: instructionIntegrityConfigured ? "Submit a trusted goal-bound intent through the Intent Playground." : "Enable Instruction Integrity and configure goal binding, source domains, external-content confirmation, parameter-change rules, and high-risk handling.", page: instructionIntegrityConfigured ? "intent-playground" : "policies" },
    { id: "tool-mcp-integrity", label: "Tool & MCP Integrity configured", weight: 5, passed: toolIntegrityConfigured && toolIntegrityOperational, detail: toolIntegrityConfigured ? toolIntegrityOperational ? `${toolIntegrityMode} mode is configured and an approved tool execution has passed.` : `${toolIntegrityMode} mode is configured, but no approved unchanged tool pass is visible yet.` : "Tool & MCP Integrity needs approved servers, approved tools, TLS, hashes, and explicit unknown-tool handling.", recommendation: toolIntegrityConfigured ? "Submit an approved MCP tool example through the Intent Playground." : "Enable Tool & MCP Integrity and configure exact server/tool bindings, hashes, TLS, origin, credential scopes, and permission scopes.", page: toolIntegrityConfigured ? "intent-playground" : "policies" },
    { id: "delegation-session-keys", label: "Delegation & Session Key Safety configured", weight: 5, passed: delegationConfigured && delegationOperational, detail: delegationConfigured ? delegationOperational ? `${delegationMode} mode is configured and a cryptographically verified bounded delegation has passed.` : `${delegationMode} mode is configured, but no complete signed delegation pass is visible yet.` : "Delegation Safety needs expiry, lifetime/depth limits, delegate lists, scope binding, and cryptographic attestation verification.", recommendation: delegationConfigured ? "Submit a valid Casper-signed delegated execution through the Agent Gateway." : "Enable Delegation & Session Key Safety and configure short-lived, least-privilege, revocable authority.", page: delegationConfigured ? "intent-playground" : "policies" },
    { id: "threat-intelligence", label: "Threat intelligence operational", weight: 5, passed: threatIntelligenceConfigured && threatIntelligenceOperational, detail: threatIntelligenceConfigured ? threatIntelligenceOperational ? `${threatIntelligenceMode} mode is configured and a fresh feed check has been observed.` : `${threatIntelligenceMode} mode is configured, but no fresh feed pass is visible yet.` : "Threat Intelligence policy mode is not configured for this policy.", recommendation: threatIntelligenceConfigured ? "Configure a fresh threat feed and submit a wallet or contract intent to verify screening." : "Choose Observe, Review, or Enforce behavior in the policy Threat Intelligence controls.", page: threatIntelligenceConfigured ? "intent-playground" : "policies" },
    { id: "oracle-validation", label: "Oracle validation operational", weight: 5, passed: !oracleRelevant || (oracleConfigured && oracleOperational), detail: !oracleRelevant ? "Not required by the selected capabilities." : oracleConfigured ? oracleOperational ? `${oracleMode} mode is configured and a fresh oracle feed check has been observed.` : `${oracleMode} mode is configured, but no fresh oracle validation pass is visible yet.` : "Oracle Validation policy mode is not configured for this policy.", recommendation: oracleConfigured ? "Configure a fresh oracle feed and submit a priced Swap example through the Intent Playground." : "Configure Oracle Validation limits in the active policy.", page: oracleConfigured ? "intent-playground" : "policies" },
    { id: "bridge-controls", label: "Bridge controls configured", weight: 5, passed: !bridgeRelevant || (bridgeConfigured && bridgeOperational), detail: !bridgeRelevant ? "Not required by the selected capabilities." : bridgeConfigured ? bridgeOperational ? `${bridgeMode} mode is configured and a complete bridge route has been evaluated.` : `${bridgeMode} mode is configured, but no complete Bridge Controls pass is visible yet.` : "Bridge provider, chain, and asset allowlists are not fully configured.", recommendation: bridgeConfigured ? "Submit a complete Bridge example through the Intent Playground to verify route controls." : "Configure approved bridge providers, chains, assets, fees, quote age, and finality requirements in the policy.", page: bridgeConfigured ? "intent-playground" : "policies" },
    { id: "token-permission-controls", label: "Token permission controls configured", weight: 5, passed: !tokenPermissionRelevant || (tokenPermissionConfigured && tokenPermissionOperational), detail: !tokenPermissionRelevant ? "Not required by the selected capabilities." : tokenPermissionConfigured ? tokenPermissionOperational ? `${tokenPermissionMode} mode is configured and a supported token permission has passed deterministic checks.` : `${tokenPermissionMode} mode is configured, but no successful Token Permission evaluation is visible yet.` : "Token Permission controls need an explicit mode, actions, limits, batch bound, and at least one approved spender.", recommendation: tokenPermissionConfigured ? "Submit the Bounded token approval example through the Intent Playground." : "Enable Token Permission Controls, configure approved spenders, and set amount, ratio, permit-lifetime, nonce, chain-binding, NFT, batch, and reset behavior.", page: tokenPermissionConfigured ? "intent-playground" : "policies" },
    { id: "privileged-action-controls", label: "Privileged action controls configured", weight: 5, passed: !privilegedActionRelevant || (privilegedActionConfigured && privilegedActionOperational), detail: !privilegedActionRelevant ? "Not required by the selected capabilities." : privilegedActionConfigured ? privilegedActionOperational ? `${privilegedActionMode} mode is configured and a supported privileged action has passed deterministic classification.` : `${privilegedActionMode} mode is configured, but no supported privileged-action evaluation is visible yet.` : "Privileged Action Controls need an explicit mode, unknown-action behavior, review matrix, and quorum-rule object.", recommendation: privilegedActionConfigured ? "Submit the Approved privileged mint or Ownership transfer requiring review example through the Intent Playground." : "Enable Privileged Action Controls and configure review classes, blocked classes, approved administrators, implementations, and optional per-action quorum.", page: privilegedActionConfigured ? "intent-playground" : "policies" },
    { id: "contract-upgrade-safety", label: "Contract upgrade safety configured", weight: 4, passed: !contractUpgradeRelevant || (contractUpgradeConfigured && contractUpgradeOperational), detail: !contractUpgradeRelevant ? "Not required by the selected capabilities." : contractUpgradeConfigured ? contractUpgradeOperational ? `${contractUpgradeMode} mode is configured and an implementation-bound upgrade check has passed.` : `${contractUpgradeMode} mode is configured, but no complete Contract Upgrade Safety pass is visible yet.` : "Contract Upgrade Safety needs an explicit mode, implementation policy, quorum, and unknown-implementation behavior.", recommendation: contractUpgradeConfigured ? "Submit an approved proxy-upgrade example through the Intent Playground." : "Enable Contract Upgrade Safety and configure approved or blocked implementations, upgrade administrators, code-hash behavior, delay, and quorum.", page: contractUpgradeConfigured ? "intent-playground" : "policies" },
    { id: "contract-argument-policies", label: "Contract argument policies configured", weight: 4, passed: !contractArgumentRelevant || (contractArgumentConfigured && contractArgumentOperational), detail: !contractArgumentRelevant ? "Not required by the selected capabilities." : contractArgumentConfigured ? contractArgumentOperational ? `${contractArgumentMode} mode is configured and an exact contract/entry-point argument rule has passed.` : `${contractArgumentMode} mode is configured, but no successful argument-policy evaluation is visible yet.` : "Contract Argument Policies need explicit handling modes and at least one exact contract and entry-point rule.", recommendation: contractArgumentConfigured ? "Submit the matching contract-argument example through the Intent Playground." : "Enable Contract Argument Policies and define required, allowed, type, numeric, address, boolean, or enum rules for an exact contract and entry point.", page: contractArgumentConfigured ? "intent-playground" : "policies" },
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
  logs: Array<{ timestamp: string; decision?: string; decisionProofStatus?: string; moduleFindings?: ModuleFinding[]; executionStatus?: string; resourceDeliveryStatus?: string; refundStatus?: string }> = [],
  gatewayOnline = false,
  emergencyPauses: Array<{ active?: boolean; status?: string; scopeType?: string; reason?: string; expiresAt?: string }> = [],
) {
  const latest = logs[0];
  const proofState = latest?.decisionProofStatus || "not observed";
  const instructionFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Agent Instruction Integrity") || [];
  const instructionFailed = instructionFindings.some((finding) => finding.status === "fail");
  const instructionWarned = instructionFindings.some((finding) => finding.status === "warning" || finding.status === "unavailable");
  const instructionPassed = instructionFindings.some((finding) => finding.status === "pass");
  const instructionHealth = instructionFindings.length === 0 ? "unknown" : instructionFailed || instructionWarned ? "attention" : instructionPassed ? "healthy" : "unknown";
  const toolIntegrityFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Tool & MCP Integrity") || [];
  const toolIntegrityFailed = toolIntegrityFindings.some((finding) => finding.status === "fail");
  const toolIntegrityWarned = toolIntegrityFindings.some((finding) => finding.status === "warning" || finding.status === "unavailable");
  const toolIntegrityPassed = toolIntegrityFindings.some((finding) => finding.status === "pass");
  const toolIntegrityHealth = toolIntegrityFindings.length === 0 ? "unknown" : toolIntegrityFailed || toolIntegrityWarned ? "attention" : toolIntegrityPassed ? "healthy" : "unknown";
  const delegationFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Delegation & Session Key Safety") || [];
  const delegationFailed = delegationFindings.some((finding) => finding.status === "fail");
  const delegationWarned = delegationFindings.some((finding) => finding.status === "warning" || finding.status === "unavailable");
  const delegationPassed = delegationFindings.some((finding) => finding.status === "pass");
  const delegationHealth = delegationFindings.length === 0 ? "unknown" : delegationFailed || delegationWarned ? "attention" : delegationPassed ? "healthy" : "unknown";
  const rpcIntegrityFindings = latest?.moduleFindings?.filter((finding) => finding.module === "RPC & Chain Integrity") || [];
  const rpcIntegrityFailed = rpcIntegrityFindings.some((finding) => finding.status === "fail");
  const rpcIntegrityUnavailable = rpcIntegrityFindings.some((finding) => finding.status === "unavailable");
  const rpcIntegrityWarned = rpcIntegrityFindings.some((finding) => finding.status === "warning");
  const rpcIntegrityPassed = rpcIntegrityFindings.some((finding) => ["Network identity binding", "Minimum RPC provider quorum", "RPC network agreement"].includes(finding.rule) && finding.status === "pass");
  const rpcIntegrityHealth = rpcIntegrityFindings.length === 0 ? "unknown" : rpcIntegrityFailed || rpcIntegrityWarned ? "attention" : rpcIntegrityUnavailable ? "unavailable" : rpcIntegrityPassed ? "healthy" : "observed";
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
  const lifecycleFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Execution Integrity") || [];
  const lifecycleFailed = lifecycleFindings.some((finding) => finding.status === "fail");
  const lifecycleUnavailable = lifecycleFindings.some((finding) => finding.status === "unavailable");
  const lifecycleWarned = lifecycleFindings.some((finding) => finding.status === "warning");
  const lifecyclePassed = lifecycleFindings.some((finding) => finding.rule === "Intent ID replay prevention" && finding.status === "pass");
  const lifecycleHealth = lifecycleFindings.length === 0 ? "unknown" : lifecycleFailed || lifecycleWarned ? "attention" : lifecycleUnavailable ? "unavailable" : lifecyclePassed ? "healthy" : "observed";
  const reconciliationFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Execution & Settlement Reconciliation") || [];
  const reconciliationState = String(latest?.executionStatus || "").toLowerCase().replace(/[\s-]+/g, "_");
  const reconciliationFailed = reconciliationFindings.some((finding) => finding.status === "fail") || ["failed", "uncertain", "replaced"].includes(reconciliationState);
  const reconciliationWarned = reconciliationFindings.some((finding) => finding.status === "warning");
  const reconciliationPending = ["submitted", "pending"].includes(reconciliationState) || latest?.resourceDeliveryStatus === "pending" || latest?.refundStatus === "pending";
  const reconciliationComplete = ["confirmed", "delivered", "refunded", "executed", "settled"].includes(reconciliationState) && latest?.resourceDeliveryStatus !== "pending" && latest?.refundStatus !== "pending";
  const reconciliationHealth = reconciliationFailed || reconciliationWarned ? "attention" : reconciliationPending ? "pending" : reconciliationComplete ? "healthy" : reconciliationFindings.length > 0 ? "observed" : "unknown";
  const approvalFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Policy & Approval Controls") || [];
  const approvalFailed = approvalFindings.some((finding) => finding.status === "fail");
  const approvalUnavailable = approvalFindings.some((finding) => finding.status === "unavailable");
  const approvalWarned = approvalFindings.some((finding) => finding.status === "warning");
  const approvalHealth = approvalFindings.length === 0 ? "unknown" : approvalFailed ? "attention" : approvalUnavailable ? "unavailable" : approvalWarned ? "pending" : "observed";
  const organizationalApprovalFindings = approvalFindings.filter((finding) => finding.rule === "Organizational approval quorum");
  const organizationalApprovalFailed = organizationalApprovalFindings.some((finding) => finding.status === "fail");
  const organizationalApprovalUnavailable = organizationalApprovalFindings.some((finding) => finding.status === "unavailable");
  const organizationalApprovalWarned = organizationalApprovalFindings.some((finding) => finding.status === "warning");
  const organizationalApprovalPassed = organizationalApprovalFindings.some((finding) => finding.status === "pass");
  const organizationalApprovalHealth = organizationalApprovalFindings.length === 0 ? "unknown" : organizationalApprovalFailed ? "attention" : organizationalApprovalUnavailable ? "unavailable" : organizationalApprovalWarned ? "pending" : organizationalApprovalPassed ? "healthy" : "unknown";
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
  const tokenPermissionFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Token Permission Controls") || [];
  const tokenPermissionFailed = tokenPermissionFindings.some((finding) => finding.status === "fail");
  const tokenPermissionUnavailable = tokenPermissionFindings.some((finding) => finding.status === "unavailable");
  const tokenPermissionWarned = tokenPermissionFindings.some((finding) => finding.status === "warning");
  const tokenPermissionPassed = tokenPermissionFindings.some((finding) => finding.rule === "Supported permission classification" && finding.status === "pass");
  const tokenPermissionHealth = tokenPermissionFindings.length === 0 ? "unknown" : tokenPermissionFailed || tokenPermissionWarned ? "attention" : tokenPermissionUnavailable ? "unavailable" : tokenPermissionPassed ? "healthy" : "observed";
  const privilegedActionFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Privileged Action Controls") || [];
  const privilegedActionFailed = privilegedActionFindings.some((finding) => finding.status === "fail");
  const privilegedActionUnavailable = privilegedActionFindings.some((finding) => finding.status === "unavailable");
  const privilegedActionWarned = privilegedActionFindings.some((finding) => finding.status === "warning");
  const privilegedActionPassed = privilegedActionFindings.some((finding) => finding.rule === "Supported privileged-action classification" && finding.status === "pass");
  const privilegedActionHealth = privilegedActionFindings.length === 0 ? "unknown" : privilegedActionFailed || privilegedActionWarned ? "attention" : privilegedActionUnavailable ? "unavailable" : privilegedActionPassed ? "healthy" : "observed";
  const contractUpgradeFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Contract Upgrade Safety") || [];
  const contractUpgradeFailed = contractUpgradeFindings.some((finding) => finding.status === "fail");
  const contractUpgradeUnavailable = contractUpgradeFindings.some((finding) => finding.status === "unavailable");
  const contractUpgradeWarned = contractUpgradeFindings.some((finding) => finding.status === "warning");
  const contractUpgradePassed = contractUpgradeFindings.some((finding) => finding.rule === "Upgrade target binding" && finding.status === "pass");
  const contractUpgradeHealth = contractUpgradeFindings.length === 0 ? "unknown" : contractUpgradeFailed || contractUpgradeWarned ? "attention" : contractUpgradeUnavailable ? "unavailable" : contractUpgradePassed ? "healthy" : "observed";
  const contractArgumentFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Contract Argument Policies") || [];
  const contractArgumentFailed = contractArgumentFindings.some((finding) => finding.status === "fail");
  const contractArgumentUnavailable = contractArgumentFindings.some((finding) => finding.status === "unavailable");
  const contractArgumentWarned = contractArgumentFindings.some((finding) => finding.status === "warning");
  const contractArgumentPassed = contractArgumentFindings.some((finding) => finding.rule === "Configured contract argument rule" && finding.status === "pass");
  const contractArgumentHealth = contractArgumentFindings.length === 0 ? "unknown" : contractArgumentFailed || contractArgumentWarned ? "attention" : contractArgumentUnavailable ? "unavailable" : contractArgumentPassed ? "healthy" : "observed";
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
  const emergencyFindings = latest?.moduleFindings?.filter((finding) => finding.module === "Emergency Circuit Breaker") || [];
  const activeEmergencyPauses = emergencyPauses.filter((pause) => pause.active === true || pause.status === "Active");
  const emergencyFailed = emergencyFindings.some((finding) => finding.status === "fail");
  const emergencyWarned = emergencyFindings.some((finding) => finding.status === "warning");
  const emergencyPassed = emergencyFindings.some((finding) => finding.rule === "Active emergency pause" && finding.status === "pass");
  const emergencyHealth = activeEmergencyPauses.length > 0 || emergencyFailed || emergencyWarned ? "attention" : emergencyPassed ? "healthy" : "unknown";
  const checks = [
    { label: "Gateway connectivity", status: gatewayOnline ? "healthy" : "unavailable", detail: gatewayOnline ? "Backend health check succeeded." : "Backend health check is currently unavailable." },
    { label: "API credential", status: agent.status === "Active" && agent.apiKeyPreview ? "healthy" : "attention", detail: agent.apiKeyPreview || "No credential preview." },
    { label: "Active policy", status: policy?.status === "Active" ? "healthy" : "attention", detail: policy?.status === "Active" ? "Policy is active." : "No active policy." },
    { label: "Emergency Circuit Breaker", status: emergencyHealth, detail: activeEmergencyPauses.length > 0 ? `${activeEmergencyPauses.length} active emergency pause${activeEmergencyPauses.length === 1 ? "" : "s"} require attention.` : emergencyFailed || emergencyWarned ? "The latest request was stopped or escalated by Emergency Controls." : emergencyPassed ? "The Gateway evaluated pause state and no active pause applied." : "No Emergency Circuit Breaker evaluation is visible yet." },
    { label: "Last received intent", status: agent.lastIntentAt || latest ? "observed" : "unknown", detail: agent.lastIntentAt || latest?.timestamp || "No intent received." },
    { label: "Last decision", status: latest ? "observed" : "unknown", detail: latest?.decision || "No decision recorded." },
    { label: "Instruction Integrity", status: instructionHealth, detail: instructionFindings.length === 0 ? "No Instruction Integrity finding is available for the latest request." : instructionFailed ? "The latest request failed provenance, goal binding, source-domain, protected-parameter, self-authorization, or permission-scope checks." : instructionWarned ? "The latest request requires review because provenance or confirmation is incomplete or high risk." : "The latest request passed its applicable deterministic provenance and goal-binding checks." },
    { label: "Tool & MCP Integrity", status: toolIntegrityHealth, detail: toolIntegrityFindings.length === 0 ? "No Tool & MCP Integrity finding is available for the latest request." : toolIntegrityFailed ? "The latest tool execution failed server, tool, hash, TLS, origin, credential-scope, permission-scope, or agent-capability checks." : toolIntegrityWarned ? "The latest tool execution requires review because its identity or approved scope is incomplete or materially changed." : "The latest MCP server and tool passed the applicable deterministic integrity checks." },
    { label: "Delegation & Session Key Safety", status: delegationHealth, detail: delegationFindings.length === 0 ? "No delegated-permission finding is available for the latest request." : delegationFailed ? "The latest delegated request failed signer, wallet, revocation, lifetime, scope, amount, frequency, depth, or redelegation checks." : delegationWarned ? "The latest delegated request requires review because signer evidence, delegate approval, or scope binding is incomplete." : "The latest signed delegation passed its applicable deterministic authority checks." },
    { label: "RPC & Chain Integrity", status: rpcIntegrityHealth, detail: rpcIntegrityFindings.length === 0 ? "No RPC & Chain Integrity finding is available for the latest request." : rpcIntegrityFailed ? "The latest request failed network identity, provider approval, freshness, synchronization, agreement, regression, state-consistency, or failover checks." : rpcIntegrityWarned ? "The latest RPC evidence requires review before signing." : rpcIntegrityUnavailable ? "Required provider observations or quorum were unavailable and did not count as a pass." : rpcIntegrityPassed ? "The latest request used approved provider evidence that matched the expected chain boundary." : "RPC & Chain Integrity was evaluated without a complete operational pass." },
    { label: "Wallet Validation", status: walletHealth, detail: walletFindings.length === 0 ? "No Wallet Validation finding is available yet." : walletFailed ? "The latest request failed one or more wallet checks." : walletWarned ? "The latest request needs attention before execution." : "The latest request passed the evaluated wallet checks." },
    { label: "Contract Validation", status: contractHealth, detail: contractFindings.length === 0 ? "No Contract Validation finding is available for the latest request." : contractFailed ? "The latest request failed one or more contract checks." : contractWarned ? "The latest contract request needs attention before execution." : "The latest request passed the evaluated contract checks." },
    { label: "Execution preflight", status: simulationHealth, detail: simulationFindings.length === 0 ? "No Execution Simulation finding is available for the latest request." : simulationFailed ? "The latest request failed deterministic transaction-construction preflight." : simulationPassed ? "Deterministic preflight was evaluated. Full stateful speculative execution remains unavailable." : "Full stateful simulation is unavailable and no preflight pass was recorded." },
    { label: "Lifecycle & replay", status: lifecycleHealth, detail: lifecycleFindings.length === 0 ? "No Execution Integrity lifecycle finding is available for the latest request." : lifecycleFailed ? "The latest request failed an intent ID, idempotency, expiry, sequence, duplicate, retry, or transaction-hash rule." : lifecycleWarned ? "The latest request has lifecycle metadata that requires attention." : lifecycleUnavailable ? "Required lifecycle metadata was unavailable and did not count as a pass." : lifecyclePassed ? "The latest intent used a fresh unique ID and passed the configured replay checks." : "Lifecycle controls were evaluated without a complete operational pass." },
    { label: "Execution reconciliation", status: reconciliationHealth, detail: reconciliationFailed || reconciliationWarned ? "The latest execution is failed, uncertain, replaced, or otherwise needs reconciliation before retry." : reconciliationPending ? "The latest execution or required delivery/refund remains unresolved. Do not submit a duplicate." : reconciliationComplete ? "The latest execution reached a reconciled terminal state." : "No post-authorization execution state has been reported yet." },
    { label: "Human approval workflow", status: approvalHealth, detail: approvalFindings.length === 0 ? "No approval workflow finding is available for the latest request." : approvalFailed ? "The latest reviewed request was rejected or expired." : approvalUnavailable ? "Review Required was returned without a usable approver configuration." : approvalWarned ? "The latest request is waiting for its configured approval quorum." : "The approval workflow was evaluated." },
    { label: "Organizational approval quorum", status: organizationalApprovalHealth, detail: organizationalApprovalFindings.length === 0 ? "No organizational tier or group-quorum finding is available for the latest request." : organizationalApprovalFailed ? "The latest organizational approval was rejected, cancelled, or expired before executable authorization." : organizationalApprovalUnavailable ? "The resolved tier references invalid groups, insufficient distinct reviewers, or an unusable execution schedule." : organizationalApprovalWarned ? "The latest request is waiting for required role groups, escalation, or its execution delay." : "The resolved approval tier satisfied its named role and total quorum requirements." },
    { label: "Threat Intelligence", status: threatHealth, detail: threatFindings.length === 0 ? "No Threat Intelligence finding is available for the latest request." : threatFailed ? "The latest request was blocked by an enforced threat indicator or fail-closed feed rule." : threatWarned ? "The latest request matched an observed or review-level threat signal." : threatUnavailable ? "The configured threat feed was unavailable or stale and did not count as a pass." : threatFeedPassed ? "A fresh configured feed screened the latest normalized identities." : "Threat Intelligence did not produce an operational feed result." },
    { label: "Oracle Validation", status: oracleHealth, detail: oracleFindings.length === 0 ? "No Oracle Validation finding is available for the latest request." : oracleFailed ? "The latest request failed an enforced oracle integrity rule." : oracleWarned ? "The latest price-sensitive request requires attention." : oracleUnavailable ? "The configured oracle feed was unavailable or stale and did not count as a pass." : oracleFeedPassed ? "A fresh configured oracle feed evaluated the latest priced intent." : "Oracle Validation did not produce an operational feed result." },
    { label: "Bridge Controls", status: bridgeHealth, detail: bridgeFindings.length === 0 ? "No Bridge Controls finding is available for the latest request." : bridgeFailed ? "The latest bridge route failed an enforced provider, chain, fee, quote, address, or finality rule." : bridgeWarned ? "The latest bridge route requires attention before signing." : bridgeUnavailable ? "Required bridge route metadata or policy configuration was unavailable and did not count as a pass." : bridgePassed ? "A complete provider-supplied bridge route was evaluated." : "Bridge Controls did not produce a complete route result." },
    { label: "Token Permission Controls", status: tokenPermissionHealth, detail: tokenPermissionFindings.length === 0 ? "No Token Permission finding is available for the latest request." : tokenPermissionFailed ? "The latest token authority failed an identity, spender, amount, expiry, replay, binding, NFT, batch, or reset rule." : tokenPermissionWarned ? "The latest token authority requires review before signing." : tokenPermissionUnavailable ? "Required Token Permission metadata was unavailable and did not count as a pass." : tokenPermissionPassed ? "The latest explicit token authority passed its applicable deterministic checks." : "Token Permission Controls were evaluated without a complete operational pass." },
    { label: "Privileged Action Controls", status: privilegedActionHealth, detail: privilegedActionFindings.length === 0 ? "No Privileged Action finding is available for the latest request." : privilegedActionFailed ? "The latest administrative call failed classification, target, network, administrator, implementation, parameter, or policy rules." : privilegedActionWarned ? "The latest privileged action requires configured Human Approval or operator attention." : privilegedActionUnavailable ? "Required privileged-action evidence was unavailable and did not count as a pass." : privilegedActionPassed ? "The latest supported administrative call passed deterministic classification and applicable policy checks." : "Privileged Action Controls were evaluated without a complete operational pass." },
    { label: "Contract Upgrade Safety", status: contractUpgradeHealth, detail: contractUpgradeFindings.length === 0 ? "No Contract Upgrade Safety finding is available for the latest request." : contractUpgradeFailed ? "The latest upgrade failed target, implementation, code-hash, administrator, delay, or policy checks." : contractUpgradeWarned ? "The latest contract upgrade requires Human Approval, a configured delay, or operator attention." : contractUpgradeUnavailable ? "Required contract-upgrade evidence was unavailable and did not count as a pass." : contractUpgradePassed ? "The latest upgrade was bound to its target and evaluated against implementation policy." : "Contract Upgrade Safety was evaluated without a complete operational pass." },
    { label: "Contract Argument Policies", status: contractArgumentHealth, detail: contractArgumentFindings.length === 0 ? "No Contract Argument Policies finding is available for the latest request." : contractArgumentFailed ? "The latest call failed a required, allowed, type, numeric, address, boolean, enum, or configuration rule." : contractArgumentWarned ? "The latest runtime arguments require review before signing." : contractArgumentUnavailable ? "Required argument-policy configuration was unavailable and did not count as a pass." : contractArgumentPassed ? "The latest contract call matched an exact argument rule and passed its applicable checks." : "Contract Argument Policies were evaluated without a complete operational pass." },
    { label: "x402 Payment Controls", status: x402Health, detail: x402Findings.length === 0 ? "No x402 Payment Controls finding is available for the latest request." : x402Failed ? "The latest x402 request failed an enforced merchant, recipient, network, amount, binding, replay, or settlement rule." : x402Warned ? "The latest x402 request requires review before payment signing." : x402Unavailable ? "Required x402 payment metadata was unavailable and did not count as a pass." : x402Bound ? "The latest x402 authorization was bound to a deterministic request fingerprint." : "x402 Payment Controls did not produce a complete authorization result." },
    { label: "Compliance Controls", status: complianceHealth, detail: complianceFindings.length === 0 ? "No Compliance Controls finding is available for the latest request." : complianceFailed ? "The latest request failed an enforced compliance, attestation, jurisdiction, screening, or exact-match rule." : complianceWarned ? "The latest controlled workflow requires authorized compliance review." : complianceUnavailable ? "Required screening evidence or the configured compliance feed was unavailable and did not count as a pass." : compliancePassed ? "Current non-sensitive screening evidence or a configured feed evaluated the latest request." : "Compliance Controls did not produce an operational screening result." },
    { label: "Casper proof service", status: proofState === "recorded" ? "healthy" : proofState === "failed" ? "attention" : "pending", detail: proofState },
    { label: "Audit synchronization", status: latest ? "healthy" : "unknown", detail: latest ? "Latest audit record is visible." : "No audit record is available." },
  ];
  const attention = checks.filter((check) => ["attention", "unavailable"].includes(check.status)).length;
  return { overall: attention === 0 ? "Healthy" : attention <= 2 ? "Needs attention" : "Degraded", checks };
}
