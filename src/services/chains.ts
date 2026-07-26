import type { ChainDefinition } from "../types/defi";

const casperExplorer = (import.meta.env.VITE_CASPER_EXPLORER_URL || "https://cspr.live").replace(/\/$/, "");

export const CHAINS: ChainDefinition[] = [
  {
    id: "casper", name: "Casper", family: "casper", nativeSymbol: "CSPR", status: "live-core",
    capabilities: ["portfolio", "swap", "liquid-staking", "native-staking", "liquidity"],
    explorer: casperExplorer,
  },
  {
    id: "base", name: "Base", family: "evm", nativeSymbol: "ETH", status: "live-core",
    capabilities: ["portfolio", "swap", "liquidity", "lend", "withdraw", "bridge"],
    explorer: "https://basescan.org",
  },
  {
    id: "arbitrum", name: "Arbitrum", family: "evm", nativeSymbol: "ETH", status: "live-core",
    capabilities: ["portfolio", "swap", "liquidity", "lend", "withdraw", "bridge"],
    explorer: "https://arbiscan.io",
  },
];
