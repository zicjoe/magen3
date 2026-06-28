import CasperSdk from "casper-js-sdk";
import { getCasperWalletProvider } from "./casperWallet";

type RuntimeArgsMap = Record<string, unknown>;

type AuditLogForExecution = {
  id: string;
  shield?: string;
  agentId: string;
  action: string;
  amount: number;
  target: string;
  decision: string;
  risk: string;
  riskScore: number;
  policyUsed: string;
  walletAddress: string;
};

type CasperPayloadForExecution = {
  payloadHash?: string;
  casper?: {
    rpcUrl?: string;
    contractHash?: string;
    chainName?: string;
  };
  runtimeArgs?: RuntimeArgsMap;
};

type SignApprovedExecutionOptions = {
  auditLog: AuditLogForExecution;
  casperPayload?: CasperPayloadForExecution | null;
  walletAddress: string;
  contractHashFallback: string;
};

function normalizeRpcUrl(value?: string) {
  const rpcUrl = (value || "https://node.testnet.casper.network/rpc").trim();
  return rpcUrl.endsWith("/rpc") ? rpcUrl : `${rpcUrl.replace(/\/$/, "")}/rpc`;
}

function runtimeString(
  runtimeArgs: RuntimeArgsMap | undefined,
  key: string,
  fallback: string,
) {
  const value = runtimeArgs?.[key];
  return value === undefined || value === null ? fallback : String(value);
}

function runtimeNumber(
  runtimeArgs: RuntimeArgsMap | undefined,
  key: string,
  fallback: number,
) {
  const value = Number(runtimeArgs?.[key] ?? fallback);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function makeClientSideHash(value: unknown) {
  const input = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `0xexecution${hex}`;
}

export async function signApprovedExecutionProof({
  auditLog,
  casperPayload,
  walletAddress,
  contractHashFallback,
}: SignApprovedExecutionOptions) {
  const provider = getCasperWalletProvider();

  if (typeof provider.sign !== "function") {
    throw new Error(
      "Casper Wallet is connected, but this wallet/provider does not expose deploy signing. Update Casper Wallet or use the manual CLI fallback.",
    );
  }

  const {
    CasperClient,
    Contracts,
    RuntimeArgs,
    CLValueBuilder,
    CLPublicKey,
    DeployUtil,
  } = CasperSdk as any;

  const contractHash =
    casperPayload?.casper?.contractHash ||
    import.meta.env.VITE_MAGEN3_CONTRACT_HASH ||
    contractHashFallback;

  if (!contractHash || !String(contractHash).startsWith("hash-")) {
    throw new Error("Magen3 contract hash is missing. Configure MAGEN3_CONTRACT_HASH/VITE_MAGEN3_CONTRACT_HASH first.");
  }

  const rpcUrl = normalizeRpcUrl(
    casperPayload?.casper?.rpcUrl || import.meta.env.VITE_CASPER_RPC_URL,
  );
  const chainName = casperPayload?.casper?.chainName || "casper-test";
  const runtimeArgs = casperPayload?.runtimeArgs;
  const executionId = `${auditLog.id}-EXEC`;
  const executionPayloadHash = makeClientSideHash({
    auditLogId: auditLog.id,
    executionId,
    signer: walletAddress,
    action: auditLog.action,
    amount: auditLog.amount,
    target: auditLog.target,
    sourcePayloadHash: casperPayload?.payloadHash,
  });

  const casperClient = new CasperClient(rpcUrl);
  const contract = new Contracts.Contract(casperClient);
  contract.setContractHash(contractHash);

  const deployRuntimeArgs = RuntimeArgs.fromMap({
    decision_id: CLValueBuilder.string(executionId),
    wallet_address: CLValueBuilder.string(walletAddress),
    agent_id: CLValueBuilder.string(runtimeString(runtimeArgs, "agent_id", auditLog.agentId)),
    shield: CLValueBuilder.string(runtimeString(runtimeArgs, "shield", auditLog.shield || "Agent Shield")),
    action_type: CLValueBuilder.string(runtimeString(runtimeArgs, "action_type", auditLog.action)),
    decision: CLValueBuilder.string(runtimeString(runtimeArgs, "decision", auditLog.decision)),
    risk: CLValueBuilder.string(runtimeString(runtimeArgs, "risk", auditLog.risk)),
    risk_score: CLValueBuilder.u32(runtimeNumber(runtimeArgs, "risk_score", auditLog.riskScore || 0)),
    amount: CLValueBuilder.string(runtimeString(runtimeArgs, "amount", String(auditLog.amount || 0))),
    target: CLValueBuilder.string(runtimeString(runtimeArgs, "target", auditLog.target || "approved-execution")),
    policy_used: CLValueBuilder.string(runtimeString(runtimeArgs, "policy_used", auditLog.policyUsed || "Magen3 Policy")),
    reason_hash: CLValueBuilder.string(makeClientSideHash({ reason: "Approved execution signed by connected wallet", auditLogId: auditLog.id })),
    payload_hash: CLValueBuilder.string(executionPayloadHash),
  });

  const deploy = contract.callEntrypoint(
    "record_decision",
    deployRuntimeArgs,
    CLPublicKey.fromHex(walletAddress),
    chainName,
    "5000000000",
  );

  const deployJson = DeployUtil.deployToJson(deploy);
  const signedDeploy = await provider.sign(JSON.stringify(deployJson), walletAddress);

  return {
    signedDeploy,
    deployJson,
    executionId,
    rpcUrl,
    chainName,
    contractHash,
  };
}
