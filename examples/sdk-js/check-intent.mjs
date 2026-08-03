import { Magen3Client } from "../../packages/sdk-js/dist/index.js";

const required = ["MAGEN3_GATEWAY_URL", "MAGEN3_AGENT_ID", "MAGEN3_API_KEY", "CASPER_EXECUTION_WALLET"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);

const client = new Magen3Client({ gatewayUrl: process.env.MAGEN3_GATEWAY_URL, agentId: process.env.MAGEN3_AGENT_ID, apiKey: process.env.MAGEN3_API_KEY });
const response = await client.checkIntent({
  source: "Magen3 SDK JavaScript Example",
  targetChain: "casper-testnet",
  executionWalletAddress: process.env.CASPER_EXECUTION_WALLET,
  goal: "Validate an external agent intent before execution",
  reason: "SDK integration test",
  action: {
    type: "Transfer",
    amount: 2,
    asset: "CSPR",
    target: process.env.CASPER_TARGET ?? process.env.CASPER_EXECUTION_WALLET,
    targetType: "Wallet Address",
    preflight: {
      paymentAmountMotes: "5000000000",
      gasPriceTolerance: 1,
      ttl: "30m",
      timestamp: new Date().toISOString(),
    },
  },
});
console.log(JSON.stringify({ decision: response.result.decision, risk: response.result.risk, reason: response.result.reason, auditLogId: response.auditLog?.id, nextAction: response.nextAction }, null, 2));
