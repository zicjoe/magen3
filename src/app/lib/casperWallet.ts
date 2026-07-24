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
  signMessage?: (message: string, publicKey: string) => Promise<{ cancelled?: boolean; signatureHex?: string; signature?: Uint8Array }>;
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


export async function signCasperWalletMessage(message: string, expectedPublicKey: string): Promise<string> {
  const provider = getCasperWalletProvider();
  if (!provider.signMessage) {
    throw new Error("This Casper Wallet version does not support message signing. Update the extension and try again.");
  }
  const activePublicKey = await provider.getActivePublicKey();
  if (!activePublicKey || activePublicKey.toLowerCase() !== expectedPublicKey.toLowerCase()) {
    throw new Error("The active Casper Wallet account does not match the authorized reviewer wallet.");
  }
  const response = await provider.signMessage(message, activePublicKey);
  if (response?.cancelled) throw new Error("Reviewer signature was cancelled in Casper Wallet.");
  const signatureHex = String(response?.signatureHex || "").replace(/^0x/i, "").trim();
  if (!signatureHex) throw new Error("Casper Wallet did not return a reviewer message signature.");
  return signatureHex;
}
