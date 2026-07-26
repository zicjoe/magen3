const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

function getProvider() {
  if (!window.CasperWalletProvider) {
    throw new Error("Casper Wallet is not installed. Install the official browser extension, then refresh the page.");
  }
  return window.CasperWalletProvider({ timeout: REQUEST_TIMEOUT_MS });
}

export async function connectCasperWallet(): Promise<string> {
  const provider = getProvider();
  const connected = await provider.isConnected().catch(() => false);
  if (!connected) {
    const approved = await provider.requestConnection();
    if (!approved) throw new Error("Casper Wallet connection was not approved.");
  }
  return provider.getActivePublicKey();
}

export async function disconnectCasperWallet(): Promise<void> {
  const disconnected = await getProvider().disconnectFromSite();
  if (!disconnected) throw new Error("Casper Wallet could not be disconnected.");
}

export async function signCasperDeploy(unsignedDeploy: unknown, publicKey: string): Promise<unknown> {
  const provider = getProvider();
  return provider.sign(JSON.stringify(unsignedDeploy), publicKey);
}
