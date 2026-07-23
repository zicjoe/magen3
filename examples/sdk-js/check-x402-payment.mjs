import { Magen3Client } from "@magen3/sdk";

const client = new Magen3Client({
  gatewayUrl: process.env.MAGEN3_GATEWAY_URL,
  agentId: process.env.MAGEN3_AGENT_ID,
  apiKey: process.env.MAGEN3_AGENT_KEY,
});

const requirementsReceivedAt = new Date().toISOString();
const decision = await client.checkIntent({
  executionWalletAddress: "0x2222222222222222222222222222222222222222",
  action: {
    type: "x402 Payment",
    amount: 1,
    asset: "USDC",
    target: "https://api.example.com/data",
    targetType: "x402 Merchant",
    x402: {
      version: 2,
      scheme: "exact",
      resourceUrl: "https://api.example.com/data",
      method: "GET",
      merchantDomain: "api.example.com",
      payTo: "0x1111111111111111111111111111111111111111",
      asset: "USDC",
      network: "eip155:84532",
      facilitator: "https://x402.org/facilitator",
      amountAtomic: "1000000",
      maxTimeoutSeconds: 300,
      requirementsReceivedAt,
      requestId: `sdk-${Date.now()}`,
      paymentRequiredHash: "b".repeat(64),
      settlementStatus: "not_submitted",
      settlementAttempt: 0,
    },
  },
});

console.log(JSON.stringify(decision, null, 2));

// Create PAYMENT-SIGNATURE only when decision.result.decision === "Allowed".
// After real settlement, call client.reportX402Settlement({...}).
