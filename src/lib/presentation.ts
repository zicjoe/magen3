import type { CapabilityId, ChainId, IntegrationDetail, StepStatus } from "@yieldbot/shared";

export const capabilityLabels: Record<CapabilityId, string> = {
  portfolio: "Portfolio",
  swap: "Swap",
  "liquid-staking": "Liquid staking",
  "native-staking": "Native staking",
  liquidity: "Liquidity",
  lend: "Supply",
  withdraw: "Withdraw",
  bridge: "Bridge",
};

export const chainLabels: Record<ChainId, string> = {
  casper: "Casper",
  base: "Base",
  arbitrum: "Arbitrum",
};

export const stepStatusLabels: Record<StepStatus, string> = {
  proposed: "Proposed",
  ready: "Ready",
  preparing: "Preparing",
  "review-required": "Review required",
  allowed: "Allowed",
  blocked: "Blocked",
  "awaiting-signature": "Awaiting signature",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
  "adapter-required": "Adapter required",
  skipped: "Skipped",
};

export function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function formatUnknown(value: unknown) {
  if (value === undefined || value === null) return "No data";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function integrationLabel(detail?: IntegrationDetail) {
  if (!detail) return "Checking…";
  if (detail.status === "ready") return "Connected";
  if (detail.status === "configured") return "Configured";
  if (detail.status === "unreachable") return "Unreachable";
  return "Missing";
}

export function relativeTime(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}
