import { Magen3Client } from "../../packages/sdk-js/dist/index.js";

const required = [
  "MAGEN3_GATEWAY_URL",
  "MAGEN3_AGENT_ID",
  "MAGEN3_AGENT_KEY",
  "CASPER_EXECUTION_WALLET",
  "CASPER_BRIDGE_CONTRACT",
  "BRIDGE_DESTINATION_ADDRESS",
];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);

const now = Date.now();
const client = new Magen3Client({
  gatewayUrl: process.env.MAGEN3_GATEWAY_URL,
  agentId: process.env.MAGEN3_AGENT_ID,
  apiKey: process.env.MAGEN3_AGENT_KEY,
});

const response = await client.checkIntent({
  source: "Magen3 Bridge Controls JavaScript Example",
  targetChain: "casper-testnet",
  executionWalletAddress: process.env.CASPER_EXECUTION_WALLET,
  goal: "Validate a provider-supplied bridge route before signing",
  reason: "Bridge Controls SDK integration test",
  action: {
    type: "Bridge",
    amount: Number(process.env.BRIDGE_AMOUNT ?? "10"),
    asset: process.env.BRIDGE_ASSET ?? "CSPR",
    target: process.env.CASPER_BRIDGE_CONTRACT,
    targetType: "Bridge Contract",
    contractIdentifierType: process.env.CASPER_BRIDGE_CONTRACT.startsWith("contract-package-") ? "Package Hash" : "Contract Hash",
    chainName: process.env.CASPER_CHAIN_NAME ?? "casper-test",
    preflight: {
      paymentAmountMotes: process.env.BRIDGE_PAYMENT_MOTES ?? "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      timestamp: new Date(now).toISOString(),
    },
    bridge: {
      sourceChain: process.env.BRIDGE_SOURCE_CHAIN ?? "casper-test",
      destinationChain: process.env.BRIDGE_DESTINATION_CHAIN ?? "ethereum-sepolia",
      provider: process.env.BRIDGE_PROVIDER ?? "Reviewed Bridge Adapter",
      routeId: process.env.BRIDGE_ROUTE_ID ?? `route-${now}`,
      destinationAddress: process.env.BRIDGE_DESTINATION_ADDRESS,
      asset: process.env.BRIDGE_ASSET ?? "CSPR",
      feeBps: Number(process.env.BRIDGE_FEE_BPS ?? "50"),
      expectedOutput: Number(process.env.BRIDGE_EXPECTED_OUTPUT ?? "9.95"),
      minimumReceived: Number(process.env.BRIDGE_MINIMUM_RECEIVED ?? "9.8"),
      quoteTimestamp: new Date(now).toISOString(),
      quoteExpiresAt: new Date(now + 300_000).toISOString(),
      sourceConfirmations: Number(process.env.BRIDGE_SOURCE_CONFIRMATIONS ?? "2"),
      destinationConfirmations: Number(process.env.BRIDGE_DESTINATION_CONFIRMATIONS ?? "12"),
    },
  },
});

console.log(JSON.stringify({
  decision: response.result.decision,
  risk: response.result.risk,
  reason: response.result.primaryReason ?? response.result.reason,
  bridgeControlsContext: response.result.bridgeControlsContext,
  auditLogId: response.auditLog?.id,
  nextAction: response.nextAction,
}, null, 2));
