export const protectionModules = [
  { id: "identity-authentication", name: "Identity and Authentication", group: "Agent Shield", status: "Live" },
  { id: "policy-enforcement", name: "Policy Enforcement", group: "Agent Shield", status: "Live" },
  { id: "wallet-validation", name: "Wallet Validation", group: "Agent Shield", status: "Live" },
  { id: "contract-validation", name: "Contract Validation", group: "Agent Shield", status: "Live" },
  { id: "execution-simulation", name: "Execution Simulation", group: "Agent Shield", status: "Foundation Available" },
  { id: "threat-intelligence", name: "Threat Intelligence", group: "Agent Shield", status: "Foundation Available" },
  { id: "oracle-validation", name: "Oracle Validation", group: "Agent Shield", status: "Planned" },
  { id: "bridge-controls", name: "Bridge Controls", group: "Agent Shield", status: "Planned" },
  { id: "compliance-controls", name: "Compliance Controls", group: "Agent Shield", status: "Planned" },
  { id: "risk-assessment", name: "Risk Assessment", group: "Agent Shield", status: "Live" },
];

// Preserve the existing bootstrap response field for backward compatibility.
export const shieldModules = protectionModules;
