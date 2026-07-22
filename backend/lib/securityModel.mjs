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
    id: "identity-authentication",
    name: "Identity and Authentication",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
  },
  {
    id: "policy-enforcement",
    name: "Policy Enforcement",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
  },
  {
    id: "wallet-validation",
    name: "Wallet Validation",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
  },
  {
    id: "contract-validation",
    name: "Contract Validation",
    status: "Foundation Available",
    capabilities: ["Trading", "Treasury Operations", "dApp Interactions", "Enterprise Automation"],
  },
  {
    id: "execution-simulation",
    name: "Execution Simulation",
    status: "Preview",
    capabilities: ["Trading", "dApp Interactions", "Treasury Operations"],
  },
  {
    id: "threat-intelligence",
    name: "Threat Intelligence",
    status: "Preview",
    capabilities: EXECUTION_CAPABILITIES,
  },
  {
    id: "oracle-validation",
    name: "Oracle Validation",
    status: "Planned",
    capabilities: ["Trading", "dApp Interactions"],
  },
  {
    id: "bridge-controls",
    name: "Bridge Controls",
    status: "Planned",
    capabilities: ["Trading", "Wallet Management", "dApp Interactions"],
  },
  {
    id: "compliance-controls",
    name: "Compliance Controls",
    status: "Planned",
    capabilities: ["Treasury Operations", "Enterprise Automation"],
  },
  {
    id: "risk-assessment",
    name: "Risk Assessment",
    status: "Live",
    capabilities: EXECUTION_CAPABILITIES,
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
