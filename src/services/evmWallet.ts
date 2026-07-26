import type { ChainId } from "../types/defi";

export const EVM_CHAINS = {
  base: { id: 8453, hex: "0x2105", name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org", symbol: "ETH" },
  arbitrum: { id: 42161, hex: "0xa4b1", name: "Arbitrum One", rpc: "https://arb1.arbitrum.io/rpc", explorer: "https://arbiscan.io", symbol: "ETH" },
} as const;

function provider() {
  if (!window.ethereum) throw new Error("No EVM wallet was detected. Install MetaMask, Coinbase Wallet, or another EIP-1193 wallet.");
  return window.ethereum;
}

export async function connectEvmWallet(chainId: Extract<ChainId, "base" | "arbitrum">) {
  const accounts = (await provider().request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts[0]) throw new Error("The EVM wallet did not return an account.");
  await switchEvmChain(chainId);
  return { address: accounts[0], chainId };
}

export async function switchEvmChain(chainId: Extract<ChainId, "base" | "arbitrum">) {
  const chain = EVM_CHAINS[chainId];
  try {
    await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.hex }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider().request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: chain.hex, chainName: chain.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [chain.rpc], blockExplorerUrls: [chain.explorer] }],
    });
  }
}

export async function readEvmBalance(address: string): Promise<string> {
  const raw = (await provider().request({ method: "eth_getBalance", params: [address, "latest"] })) as string;
  const value = BigInt(raw);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, 5).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

function rpcQuantity(value: unknown): unknown {
  if (typeof value !== "string" || value.startsWith("0x")) return value;
  if (!/^\d+$/.test(value)) return value;
  return `0x${BigInt(value).toString(16)}`;
}

export async function sendEvmTransaction(transaction: Record<string, unknown>): Promise<string> {
  const normalized = { ...transaction };
  for (const key of ["value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
    if (normalized[key] !== undefined) normalized[key] = rpcQuantity(normalized[key]);
  }
  return provider().request({ method: "eth_sendTransaction", params: [normalized] }) as Promise<string>;
}

export async function waitForEvmReceipt(transactionHash: string, timeoutMs = 180_000): Promise<"confirmed" | "failed"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await provider().request({ method: "eth_getTransactionReceipt", params: [transactionHash] }) as { status?: string } | null;
    if (receipt) return receipt.status === "0x0" ? "failed" : "confirmed";
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("The transaction was submitted but confirmation is still pending. Check the explorer or Activity view later.");
}
