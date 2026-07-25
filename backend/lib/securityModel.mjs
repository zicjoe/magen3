export const EXECUTION_CAPABILITIES = [
  "Trading",
  "Wallet Management",
  "Treasury Operations",
  "dApp Interactions",
  "Enterprise Automation",
  "Custom",
];

export const CAPABILITY_DESCRIPTIONS = {
  Trading: "Autonomous swaps, routing, staking, yield actions, and trade execution.",
  "Wallet Management": "Transfers, wallet operations, destination management, and balance actions.",
  "Treasury Operations": "DAO or organization fund management, high-value actions, and approval-controlled execution.",
  "dApp Interactions": "Contract calls, DeFi protocols, vaults, staking, borrowing, bridging, and application workflows.",
  "Enterprise Automation": "Organization-grade workflows, internal permissions, compliance, and controlled automation.",
  Custom: "Developer-defined execution capability that does not fit a standard category.",
};

export const PROTECTION_MODULES = [
  {
    id: "agent-trust-access",
    name: "Agent Trust & Access",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "agent-authentication", name: "Agent authentication", status: "Live" },
      { id: "credential-lifecycle", name: "Credential rotation and revocation", status: "Live" },
      { id: "instruction-integrity", name: "Instruction Integrity", status: "Live" },
      { id: "tool-mcp-integrity", name: "Tool and MCP integrity", status: "Live" },
      { id: "delegation-session-keys", name: "Delegation and session permissions", status: "Foundation Available" },
    ],
  },
  {
    id: "policy-approval-controls",
    name: "Policy & Approval Controls",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "policy-enforcement", name: "Deterministic policy enforcement", status: "Live" },
      { id: "review-thresholds", name: "Review thresholds", status: "Live" },
      { id: "approval-quorum", name: "Human approval and quorum", status: "Foundation Available" },
      { id: "emergency-controls", name: "Emergency circuit breaker", status: "Live" },
    ],
  },
  {
    id: "wallet-asset-safety",
    name: "Wallet & Asset Safety",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "wallet-identity", name: "Wallet identity and destination validation", status: "Live" },
      { id: "wallet-spend-controls", name: "Wallet spending controls", status: "Live" },
      { id: "asset-identity", name: "Asset identity and network consistency", status: "Foundation Available" },
      { id: "token-risk", name: "Token behavior and economic risk", status: "Planned" },
    ],
  },
  {
    id: "contract-permission-safety",
    name: "Contract & Permission Safety",
    status: "Live",
    capabilities: ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"],
    controls: [
      { id: "contract-identity", name: "Contract identity and allowlists", status: "Live" },
      { id: "entry-point-controls", name: "Entry-point and package-version controls", status: "Live" },
      { id: "privileged-actions", name: "Privileged contract actions", status: "Live" },
      { id: "token-permissions", name: "Token approvals and permits", status: "Live" },
      { id: "contract-arguments", name: "Contract argument policies", status: "Live" },
      { id: "contract-upgrades", name: "Contract upgrade safety", status: "Live" },
    ],
  },
  {
    id: "execution-integrity",
    name: "Execution Integrity",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "transaction-preflight", name: "Transaction construction preflight", status: "Live" },
      { id: "lifecycle-replay", name: "Lifecycle and replay protection", status: "Live" },
      { id: "settlement-reconciliation", name: "Execution and settlement reconciliation", status: "Foundation Available" },
      { id: "stateful-simulation", name: "Stateful execution simulation", status: "Foundation Available" },
      { id: "rpc-integrity", name: "RPC and chain integrity", status: "Foundation Available" },
      { id: "gas-sponsorship", name: "Gas sponsorship and fee safety", status: "Planned" },
    ],
  },
  {
    id: "market-oracle-integrity",
    name: "Market & Oracle Integrity",
    status: "Live",
    capabilities: ["Trading", "dApp Interactions"],
    controls: [
      { id: "quote-bounds", name: "Slippage and output bounds", status: "Live" },
      { id: "oracle-integrity", name: "Oracle price integrity", status: "Foundation Available" },
      { id: "mev-quality", name: "MEV and execution quality", status: "Planned" },
      { id: "asset-market-risk", name: "Asset market-risk signals", status: "Planned" },
    ],
  },
  {
    id: "cross-chain-payment-controls",
    name: "Cross-chain & Payment Controls",
    status: "Foundation Available",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "bridge-routes", name: "Bridge route controls", status: "Foundation Available" },
      { id: "x402-authorization", name: "x402 exact-payment authorization", status: "Foundation Available" },
      { id: "x402-settlement", name: "x402 settlement reconciliation", status: "Foundation Available" },
      { id: "native-payment-adapters", name: "Additional native payment adapters", status: "Planned" },
    ],
  },
  {
    id: "threat-compliance",
    name: "Threat & Compliance",
    status: "Foundation Available",
    capabilities: EXECUTION_CAPABILITIES,
    controls: [
      { id: "threat-screening", name: "Threat-intelligence screening", status: "Foundation Available" },
      { id: "compliance-evidence", name: "Compliance evidence controls", status: "Foundation Available" },
      { id: "managed-risk-providers", name: "Managed provider adapters", status: "Planned" },
    ],
  },
];


const LEGACY_TYPE_CAPABILITY_MAP = {
  "DeFi Agent": ["Trading", "dApp Interactions"],
  "Trading Agent": ["Trading"],
  "Treasury Agent": ["Treasury Operations", "Wallet Management"],
  "RWA Agent": ["Enterprise Automation", "dApp Interactions"],
  "Oracle Agent": ["dApp Interactions"],
  "Custom Agent": ["Custom"],
};

const CAPABILITY_TO_LEGACY_TYPE = {
  Trading: "Trading Agent",
  "Wallet Management": "DeFi Agent",
  "Treasury Operations": "Treasury Agent",
  "dApp Interactions": "DeFi Agent",
  "Enterprise Automation": "Custom Agent",
  Custom: "Custom Agent",
};

export function normalizeExecutionCapabilities(value, legacyType = "Custom Agent") {
  const source = Array.isArray(value) ? value : [];
  const valid = [...new Set(source.map((item) => String(item || "").trim()).filter((item) => EXECUTION_CAPABILITIES.includes(item)))];
  if (valid.length > 0) return valid;
  return LEGACY_TYPE_CAPABILITY_MAP[legacyType] || ["Custom"];
}

export function legacyTypeFromCapabilities(capabilities = []) {
  const normalized = normalizeExecutionCapabilities(capabilities);
  return CAPABILITY_TO_LEGACY_TYPE[normalized[0]] || "Custom Agent";
}

export function recommendedModuleIds(capabilities = []) {
  const normalized = normalizeExecutionCapabilities(capabilities);
  return PROTECTION_MODULES
    .filter((module) => module.capabilities.some((capability) => normalized.includes(capability)))
    .map((module) => module.id);
}

export const POLICY_TEMPLATES = {
  "Conservative Trading": {
    riskMode: "Conservative",
    maxTransaction: 25,
    dailyLimit: 100,
    approvalThreshold: 15,
    trustedContracts: [],
    blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update"],
  },
  "Balanced Trading": {
    riskMode: "Balanced",
    maxTransaction: 75,
    dailyLimit: 300,
    approvalThreshold: 50,
    trustedContracts: [],
    blockedActions: ["RWA Proof Update", "Oracle Data Update"],
  },
  "Wallet Safety": {
    riskMode: "Conservative",
    maxTransaction: 30,
    dailyLimit: 120,
    approvalThreshold: 20,
    trustedContracts: [],
    blockedActions: ["DAO Treasury Payment", "RWA Proof Update", "Oracle Data Update"],
  },
  "Treasury Safe Mode": {
    riskMode: "Conservative",
    maxTransaction: 250,
    dailyLimit: 1000,
    approvalThreshold: 100,
    trustedContracts: [],
    blockedActions: ["RWA Proof Update", "Oracle Data Update"],
  },
  "DeFi Automation": {
    riskMode: "Balanced",
    maxTransaction: 100,
    dailyLimit: 500,
    approvalThreshold: 75,
    trustedContracts: [],
    blockedActions: ["RWA Proof Update", "Oracle Data Update"],
  },
  "Enterprise Controlled Automation": {
    riskMode: "Conservative",
    maxTransaction: 150,
    dailyLimit: 600,
    approvalThreshold: 75,
    trustedContracts: [],
    blockedActions: ["Oracle Data Update"],
  },
  Custom: {
    riskMode: "Balanced",
    maxTransaction: 50,
    dailyLimit: 200,
    approvalThreshold: 40,
    trustedContracts: [],
    blockedActions: [],
  },
};

export function recommendedPolicyTemplate(capabilities = []) {
  const normalized = normalizeExecutionCapabilities(capabilities);
  if (normalized.includes("Enterprise Automation")) return "Enterprise Controlled Automation";
  if (normalized.includes("Treasury Operations")) return "Treasury Safe Mode";
  if (normalized.includes("Trading") && normalized.includes("dApp Interactions")) return "DeFi Automation";
  if (normalized.includes("Trading")) return "Conservative Trading";
  if (normalized.includes("Wallet Management")) return "Wallet Safety";
  if (normalized.includes("dApp Interactions")) return "DeFi Automation";
  return "Custom";
}

export function makePipelineStages({ timestamp = new Date().toISOString(), decision = "Review Required", proofStatus = "queued" } = {}) {
  const decisionStatus = decision === "Blocked" ? "failed" : decision === "Review Required" ? "warning" : "completed";
  return [
    { id: "intent-received", label: "Intent received", status: "completed", timestamp },
    { id: "agent-authentication", label: "Agent authenticated", status: "completed", timestamp },
    { id: "agent-configuration", label: "Agent configuration loaded", status: "completed", timestamp },
    { id: "policy-loaded", label: "Policy loaded", status: "completed", timestamp },
    { id: "protection-checks", label: "Relevant protection checks completed", status: decisionStatus, timestamp },
    { id: "risk-assessment", label: "Risk assessment completed", status: decisionStatus, timestamp },
    { id: "decision", label: `Decision returned: ${decision}`, status: decisionStatus, timestamp },
    { id: "audit-stored", label: "Audit stored", status: "completed", timestamp },
    { id: "casper-proof", label: "Casper decision proof", status: proofStatus === "recorded" ? "completed" : proofStatus === "failed" ? "failed" : "pending", timestamp: "" },
  ];
}
