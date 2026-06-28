const REQUESTS_TIMEOUT_MS = 30 * 60 * 1000;

export type CasperWalletConnection = {
  publicKey: string;
  providerName: "Casper Wallet";
};

type CasperWalletProviderInstance = {
  requestConnection: () => Promise<boolean>;
  getActivePublicKey: () => Promise<string>;
  isConnected?: () => Promise<boolean>;
  disconnectFromSite?: () => Promise<boolean>;
  sign?: (deployJson: string, publicKey: string) => Promise<unknown>;
};

type CasperWalletProviderConstructor = (options?: {
  timeout?: number;
}) => CasperWalletProviderInstance;

declare global {
  interface Window {
    CasperWalletProvider?: CasperWalletProviderConstructor;
    CasperWalletEventTypes?: unknown;
  }
}

export function isCasperWalletInstalled() {
  return typeof window !== "undefined" && typeof window.CasperWalletProvider === "function";
}

export function getCasperWalletProvider() {
  if (!isCasperWalletInstalled() || !window.CasperWalletProvider) {
    throw new Error(
      "Casper Wallet extension is not installed or is not available in this browser. Install Casper Wallet, unlock it, then refresh Magen3."
    );
  }

  return window.CasperWalletProvider({
    timeout: REQUESTS_TIMEOUT_MS,
  });
}

export async function connectCasperWallet(): Promise<CasperWalletConnection> {
  const provider = getCasperWalletProvider();
  const connected = await provider.requestConnection();

  if (!connected) {
    throw new Error("Wallet connection was rejected or cancelled.");
  }

  const publicKey = await provider.getActivePublicKey();

  if (!publicKey) {
    throw new Error("Casper Wallet connected, but no active public key was returned.");
  }

  return {
    publicKey,
    providerName: "Casper Wallet",
  };
}

export async function restoreCasperWalletConnection(): Promise<CasperWalletConnection | null> {
  if (!isCasperWalletInstalled()) return null;

  const provider = getCasperWalletProvider();

  if (provider.isConnected) {
    const connected = await provider.isConnected();
    if (!connected) return null;
  }

  const publicKey = await provider.getActivePublicKey();
  if (!publicKey) return null;

  return {
    publicKey,
    providerName: "Casper Wallet",
  };
}

export async function disconnectCasperWallet() {
  const provider = getCasperWalletProvider();

  if (provider.disconnectFromSite) {
    await provider.disconnectFromSite();
  }
}
