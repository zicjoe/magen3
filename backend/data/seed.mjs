export const protectionModules = [
  { id: "agent-trust-access", name: "Agent Trust & Access", group: "Agent Shield", status: "Live" },
  { id: "policy-approval-controls", name: "Policy & Approval Controls", group: "Agent Shield", status: "Live" },
  { id: "wallet-asset-safety", name: "Wallet & Asset Safety", group: "Agent Shield", status: "Live" },
  { id: "contract-permission-safety", name: "Contract & Permission Safety", group: "Agent Shield", status: "Live" },
  { id: "execution-integrity", name: "Execution Integrity", group: "Agent Shield", status: "Live" },
  { id: "market-oracle-integrity", name: "Market & Oracle Integrity", group: "Agent Shield", status: "Live" },
  { id: "cross-chain-payment-controls", name: "Cross-chain & Payment Controls", group: "Agent Shield", status: "Foundation Available" },
  { id: "threat-compliance", name: "Threat & Compliance", group: "Agent Shield", status: "Foundation Available" },
];

// Preserve the existing bootstrap response field for backward compatibility.
export const shieldModules = protectionModules;
