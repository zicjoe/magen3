import {
  Magen3Client,
  createMagen3InstructionIntegrityBinding,
  getMagen3AgentMessage,
  isMagen3ExecutionApproved,
} from "../../packages/sdk-js/dist/index.js";

const required = ["MAGEN3_GATEWAY_URL", "MAGEN3_AGENT_ID", "MAGEN3_API_KEY", "CASPER_EXECUTION_WALLET"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);

const client = Magen3Client.fromEnv(process.env);
const originalUserRequest = "Send 2 CSPR to the configured Casper Testnet target";
const intent = {
  source: "Magen3 SDK JavaScript Example",
  targetChain: "casper-testnet",
  executionWalletAddress: process.env.CASPER_EXECUTION_WALLET,
  goal: originalUserRequest,
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
};

intent.action.instructionIntegrity = await createMagen3InstructionIntegrityBinding(intent, {
  goalId: "goal:sdk-javascript-example-transfer",
  originalUserRequest,
});

const response = await client.checkIntent(intent);
console.log(JSON.stringify({
  decision: response.result.decision,
  executionApproved: isMagen3ExecutionApproved(response),
  message: getMagen3AgentMessage(response),
  diagnostic: response.decisionExplanation
    ? {
        code: response.decisionExplanation.code,
        field: response.decisionExplanation.field,
        expected: response.decisionExplanation.expected,
        received: response.decisionExplanation.received,
        mismatchFields: response.decisionExplanation.mismatchFields,
      }
    : undefined,
  auditLogId: response.auditLog?.id,
  nextAction: response.nextAction,
}, null, 2));
