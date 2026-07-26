export {};

declare global {
  interface Window {
    CasperWalletProvider?: (options?: { timeout?: number }) => {
      requestConnection(): Promise<boolean>;
      isConnected(): Promise<boolean>;
      getActivePublicKey(): Promise<string>;
      disconnectFromSite(): Promise<boolean>;
      sign(deployJson: string, publicKey: string): Promise<unknown>;
    };
    ethereum?: {
      request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
      on?(event: string, callback: (...args: unknown[]) => void): void;
      removeListener?(event: string, callback: (...args: unknown[]) => void): void;
    };
  }
}
