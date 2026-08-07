import test from "node:test";
import assert from "node:assert/strict";
import { Magen3Client, Magen3Error, buildMagen3DelegationAttestationMessage, buildMagen3ProtectedParameters, createMagen3InstructionIntegrityBinding, getMagen3AgentMessage, hashMagen3ProtectedParameters, isMagen3ExecutionApproved, magen3ClientOptionsFromEnv, normalizeMagen3GatewayUrl } from "../dist/index.js";

test("checkIntent authenticates and injects agent identity", async () => {
  let captured;
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ ok: true, executionApproved: true, result: { decision: "Allowed", risk: "Low", riskScore: 5, reason: "ok", recommendedAction: "sign" }, gatewayRequest: {}, auditLog: {}, nextAction: "sign" }), { status: 201 });
  }});
  const result = await client.checkIntent({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 1, target: "01def" } });
  assert.equal(result.result.decision, "Allowed");
  assert.equal(captured.url, "https://api.example/api/agent-gateway/intents");
  assert.equal(captured.init.headers.get("x-magen3-agent-key"), "secret");
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.agentId, "MAG-1");
  assert.equal(payload.walletAddress, "01abc");
});


test("normalizes a legacy full Agent Gateway endpoint to the API base URL", async () => {
  let capturedUrl;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example/api/agent-gateway/intents",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  await client.verifyAgent();
  assert.equal(capturedUrl, "https://api.example/api/agent-gateway/me?agentId=MAG-1");
});

test("loads canonical environment variables", () => {
  const options = magen3ClientOptionsFromEnv({
    MAGEN3_GATEWAY_URL: "https://api.example",
    MAGEN3_AGENT_ID: "MAG-1",
    MAGEN3_API_KEY: "canonical-secret",
  });
  assert.equal(options.apiKey, "canonical-secret");
  assert.equal(normalizeMagen3GatewayUrl(options.gatewayUrl), "https://api.example");
});

test("accepts legacy API-key environment aliases during migration", () => {
  assert.equal(magen3ClientOptionsFromEnv({ MAGEN3_GATEWAY_URL: "https://api.example", MAGEN3_AGENT_ID: "MAG-1", MAGEN3_AGENT_KEY: "legacy-one" }).apiKey, "legacy-one");
  assert.equal(magen3ClientOptionsFromEnv({ MAGEN3_GATEWAY_URL: "https://api.example", MAGEN3_AGENT_ID: "MAG-1", MAGEN3_AGENT_API_KEY: "legacy-two" }).apiKey, "legacy-two");
});

test("Magen3Client.fromEnv uses the canonical variables", () => {
  const client = Magen3Client.fromEnv({
    MAGEN3_GATEWAY_URL: "https://api.example/api/agent-gateway/intents",
    MAGEN3_AGENT_ID: "MAG-1",
    MAGEN3_API_KEY: "secret",
  });
  assert.equal(typeof client.verifyAgent, "function");
  assert.equal(normalizeMagen3GatewayUrl("https://api.example/api/agent-gateway/me?agentId=MAG-1"), "https://api.example");
});

test("requireAllowed stops blocked execution", async () => {
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async () => new Response(JSON.stringify({ ok: true, executionApproved: false, result: { decision: "Blocked", risk: "High", riskScore: 80, reason: "limit exceeded", recommendedAction: "stop" }, gatewayRequest: {}, auditLog: {}, nextAction: "stop" }), { status: 201 }) });
  await assert.rejects(() => client.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 100, target: "01def" } }), Magen3Error);
});

test("requireAllowed fails closed when Allowed is not explicitly execution approved", async () => {
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      executionApproved: false,
      result: {
        decision: "Allowed",
        risk: "Low",
        riskScore: 5,
        reason: "Policy checks passed",
        recommendedAction: "Do not execute without explicit approval",
      },
      gatewayRequest: {},
      auditLog: {},
      nextAction: "Stop",
      agentMessage: "Magen3 did not explicitly authorize execution. Nothing was signed or sent.",
    }), { status: 201 }),
  });
  await assert.rejects(
    () => client.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 1, target: "01def" } }),
    /did not explicitly authorize execution/i,
  );
});

test("normalizes trailing gateway URL slashes without a regular expression", async () => {
  let capturedUrl;
  const client = new Magen3Client({
    gatewayUrl: `  https://api.example${"/".repeat(10_000)}  `,
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await client.verifyAgent();
  assert.equal(capturedUrl, "https://api.example/api/agent-gateway/me?agentId=MAG-1");
});


test("preserves contract validation metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 8, reason: "approved contract", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    targetChain: "casper-testnet",
    action: {
      type: "Contract Call",
      target: `contract-package-hash-${"a".repeat(64)}`,
      targetType: "Trusted Contract",
      contractIdentifierType: "Package Hash",
      entryPoint: "deposit",
      contractVersion: 1,
      chainName: "casper-test",
    },
  });

  assert.equal(captured.action.contractIdentifierType, "Package Hash");
  assert.equal(captured.action.entryPoint, "deposit");
  assert.equal(captured.action.contractVersion, 1);
  assert.equal(captured.action.chainName, "casper-test");
});


test("preserves execution preflight metadata without signing material", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 12, reason: "preflight passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Swap",
      amount: 10,
      target: "DEX_ROUTER",
      preflight: {
        paymentAmountMotes: "5000000000",
        gasPriceTolerance: 1,
        ttl: "30m",
        timestamp: "2026-07-22T10:00:00.000Z",
        slippageBps: 300,
        expectedOutput: 9.8,
        minimumReceived: 9.5,
      },
    },
  });

  assert.equal(captured.action.preflight.paymentAmountMotes, "5000000000");
  assert.equal(captured.action.preflight.gasPriceTolerance, 1);
  assert.equal(captured.action.preflight.slippageBps, 300);
  assert.equal(captured.action.preflight.minimumReceived, 9.5);
});

test("preserves Oracle Validation price metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 10, reason: "oracle checks passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Swap",
      amount: 10,
      asset: "CSPR",
      outputAsset: "USD",
      target: "DEX_ROUTER",
      oracle: {
        baseAsset: "CSPR",
        quoteAsset: "USD",
        executionPrice: 0.025,
        quoteTimestamp: "2026-07-22T15:00:00.000Z",
      },
    },
  });

  assert.equal(captured.action.outputAsset, "USD");
  assert.equal(captured.action.oracle.baseAsset, "CSPR");
  assert.equal(captured.action.oracle.quoteAsset, "USD");
  assert.equal(captured.action.oracle.executionPrice, 0.025);
});

test("preserves Bridge Controls route metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 12, reason: "bridge route passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Bridge",
      amount: 10,
      asset: "CSPR",
      target: `contract-package-hash-${"a".repeat(64)}`,
      targetType: "Bridge Contract",
      contractIdentifierType: "Package Hash",
      chainName: "casper-test",
      bridge: {
        sourceChain: "casper-test",
        destinationChain: "ethereum-sepolia",
        provider: "Test Bridge",
        routeId: "route-001",
        destinationAddress: "0x0000000000000000000000000000000000000001",
        asset: "CSPR",
        feeBps: 50,
        expectedOutput: 9.95,
        minimumReceived: 9.8,
        quoteTimestamp: "2026-07-22T15:00:00.000Z",
        quoteExpiresAt: "2026-07-22T15:05:00.000Z",
        sourceConfirmations: 2,
        destinationConfirmations: 12,
      },
    },
  });

  assert.equal(captured.action.bridge.provider, "Test Bridge");
  assert.equal(captured.action.bridge.destinationChain, "ethereum-sepolia");
  assert.equal(captured.action.bridge.feeBps, 50);
  assert.equal(captured.action.bridge.destinationConfirmations, 12);
});

test("preserves non-sensitive Compliance Controls evidence in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 8, reason: "compliance checks passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Transfer",
      amount: 5,
      target: "01def",
      compliance: {
        originatorJurisdiction: "NG",
        beneficiaryJurisdiction: "US",
        counterpartyType: "VASP",
        originatorAttestation: { status: "Verified", provider: "Verified Provider", reference: "ORIGINATOR-001" },
        beneficiaryAttestation: { status: "Verified", provider: "Verified Provider", reference: "BENEFICIARY-001" },
        travelRule: { status: "Complete", reference: "TRAVEL-RULE-001", dataHash: "a".repeat(64) },
        screening: { status: "Clear", provider: "Verified Provider", reference: "SCREEN-001", screenedAt: "2026-07-22T15:00:00.000Z" },
        riskRating: "Low",
      },
    },
  });

  assert.equal(captured.action.compliance.travelRule.status, "Complete");
  assert.equal(captured.action.compliance.screening.status, "Clear");
  assert.equal(captured.action.compliance.originatorAttestation.reference, "ORIGINATOR-001");
});

test("preserves x402 authorization metadata and reports settlement without signed payment material", async () => {
  const calls = [];
  const fingerprint = "a".repeat(64);
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url, init) => {
      calls.push({ url, payload: JSON.parse(init.body) });
      if (String(url).endsWith("/api/agent-gateway/x402/settlements")) {
        return new Response(JSON.stringify({ ok: true, settlement: { status: "confirmed" } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: {
          decision: "Allowed",
          risk: "Low",
          riskScore: 8,
          reason: "x402 payment authorized",
          recommendedAction: "create PAYMENT-SIGNATURE outside Magen3",
          x402PaymentControlsContext: { requestFingerprint: fingerprint },
        },
        gatewayRequest: {},
        auditLog: { id: "AUDIT-X402-1" },
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "0x0000000000000000000000000000000000000002",
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
        validUntil: "2026-07-23T12:00:00.000Z",
        requestId: "request-001",
        paymentRequiredHash: "b".repeat(64),
        settlementStatus: "not_submitted",
        settlementAttempt: 0,
      },
    },
  });

  await client.reportX402Settlement({
    auditLogId: "AUDIT-X402-1",
    status: "confirmed",
    requestFingerprint: fingerprint,
    transactionHash: `0x${"c".repeat(64)}`,
    attempt: 1,
    resourceDelivered: true,
  });

  assert.equal(calls[0].payload.action.x402.scheme, "exact");
  assert.equal(calls[0].payload.action.x402.network, "eip155:84532");
  assert.equal(calls[0].payload.action.x402.amountAtomic, "1000000");
  assert.equal(calls[1].url, "https://api.example/api/agent-gateway/x402/settlements");
  assert.equal(calls[1].payload.agentId, "MAG-1");
  assert.equal(calls[1].payload.requestFingerprint, fingerprint);
  assert.equal(calls[1].payload.resourceDelivered, true);
  assert.equal("paymentSignature" in calls[1].payload, false);
});

test("reports authenticated execution reconciliation without signing material", async () => {
  const calls = [];
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers)), payload: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, reconciliation: { status: "confirmed", transactionHash: `0x${"d".repeat(64)}` } }), { status: 200 });
    },
  });

  const result = await client.reportExecutionReconciliation({
    auditLogId: "AUDIT-EXEC-1",
    status: "confirmed",
    transactionHash: `0x${"d".repeat(64)}`,
    attempt: 1,
    confirmations: 3,
    finalized: true,
    provider: "casper-rpc-primary",
    resourceDelivered: true,
  });

  assert.equal(calls[0].url, "https://api.example/api/agent-gateway/executions/reconcile");
  assert.equal(calls[0].headers["x-magen3-agent-key"], "secret");
  assert.equal(calls[0].payload.agentId, "MAG-1");
  assert.equal(calls[0].payload.auditLogId, "AUDIT-EXEC-1");
  assert.equal(calls[0].payload.confirmations, 3);
  assert.equal("signedTransaction" in calls[0].payload, false);
  assert.equal("privateKey" in calls[0].payload, false);
  assert.equal(result.reconciliation.status, "confirmed");
});

test("requires an audit ID for execution reconciliation", async () => {
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async () => new Response("{}") });
  await assert.rejects(() => client.reportExecutionReconciliation({ status: "pending" }), /auditLogId is required/);
});

test("polls execution reconciliation through backend-configured providers", async () => {
  const calls = [];
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), payload: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, reconciliation: { status: "pending", provider: "configured-casper-rpc" } }), { status: 200 });
    },
  });
  const result = await client.pollExecutionReconciliation({ auditLogId: "AUDIT-POLL-1", chainFamily: "casper", chainName: "casper-test" });
  assert.equal(calls[0].url, "https://api.example/api/agent-gateway/executions/poll");
  assert.equal(calls[0].payload.agentId, "MAG-1");
  assert.equal(calls[0].payload.chainFamily, "casper");
  assert.equal("rpcUrl" in calls[0].payload, false);
  assert.equal(result.reconciliation.status, "pending");
});

test("rejects request-provided reconciliation RPC endpoints", async () => {
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async () => new Response("{}") });
  await assert.rejects(() => client.pollExecutionReconciliation({ auditLogId: "AUDIT-POLL-1", rpcUrl: "https://evil.example" }), /not accepted/);
});

test("preserves Execution Integrity lifecycle metadata in intent payloads", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 5, reason: "lifecycle passed", recommendedAction: "continue" },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Transfer",
      amount: 5,
      target: "01def",
      lifecycle: {
        intentId: "intent:sdk-0001",
        idempotencyKey: "idempotency:sdk-0001",
        sequence: 9,
        createdAt: "2026-07-23T10:00:00.000Z",
        expiresAt: "2026-07-23T10:10:00.000Z",
        attempt: 0,
      },
    },
  });

  assert.equal(captured.action.lifecycle.intentId, "intent:sdk-0001");
  assert.equal(captured.action.lifecycle.idempotencyKey, "idempotency:sdk-0001");
  assert.equal(captured.action.lifecycle.sequence, 9);
  assert.equal(captured.action.lifecycle.attempt, 0);
});

test("polls an exact-bound human approval by approval or audit ID", async () => {
  let capturedUrl = "";
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (url, init) => {
      capturedUrl = String(url);
      assert.equal(init.method, "GET");
      return new Response(JSON.stringify({
        ok: true,
        approval: {
          id: "APR-1",
          auditLogId: "AUDIT-1",
          agentId: "MAG-1",
          actionType: "Transfer",
          amount: 30,
          target: "01def",
          reviewStatus: "Approved",
          bindingHash: "a".repeat(64),
          requiredApprovals: 1,
          approvalsReceived: 1,
          verifiedApprovalsReceived: 1,
          verifiedResponses: 1,
          signatureRequired: true,
          signatureDomain: "magen3.approval-response.v1",
          signatureChainName: "casper-test",
          responses: [{ walletAddress: "01abc", response: "Approved", timestamp: "2026-07-23T11:00:00.000Z", signatureVerified: true, signatureAlgorithm: "Ed25519", signatureHash: "b".repeat(64) }],
          remainingApprovals: 0,
          expiresAt: "2026-07-23T12:00:00.000Z",
          mayProceedToSigning: true,
        },
      }), { status: 200 });
    },
  });

  const response = await client.getApproval("AUDIT-1");
  assert.match(capturedUrl, /\/api\/agent-gateway\/approvals\/AUDIT-1\?agentId=MAG-1$/);
  assert.equal(response.approval.reviewStatus, "Approved");
  assert.equal(response.approval.mayProceedToSigning, true);
  assert.equal(response.approval.signatureRequired, true);
  assert.equal(response.approval.verifiedApprovalsReceived, 1);
  assert.equal(response.approval.responses?.[0]?.signatureVerified, true);
  assert.equal(response.approval.responses?.[0]?.signatureAlgorithm, "Ed25519");
});

test("preserves unsigned Token Permission metadata without permit signatures", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: {
          decision: "Allowed",
          risk: "Low",
          riskScore: 8,
          reason: "token permission passed",
          recommendedAction: "continue",
          tokenPermissionControlsContext: { fingerprint: "a".repeat(64), replayStatus: "clear" },
        },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: {
      type: "Contract Interaction",
      amount: 10,
      asset: "TEST",
      target: `contract-${"2".repeat(64)}`,
      entryPoint: "permit",
      tokenPermission: {
        permissionType: "Permit Authorization",
        owner: `01${"1".repeat(64)}`,
        tokenContract: `contract-${"2".repeat(64)}`,
        tokenStandard: "CEP-18",
        spender: `01${"3".repeat(64)}`,
        approvalAmount: 10,
        intendedTransactionAmount: 10,
        nonce: "nonce-1",
        permitId: "permit-1",
        deadline: "2026-07-24T10:30:00.000Z",
        network: "casper-test",
      },
    },
  });

  assert.equal(captured.action.tokenPermission.permissionType, "Permit Authorization");
  assert.equal(captured.action.tokenPermission.spender, `01${"3".repeat(64)}`);
  assert.equal(captured.action.tokenPermission.nonce, "nonce-1");
  assert.equal(response.result.tokenPermissionControlsContext.replayStatus, "clear");
});


test("preserves unsigned Privileged Action metadata and response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: false,
        result: {
          decision: "Review Required",
          risk: "High",
          riskScore: 72,
          reason: "ownership transfer requires quorum",
          recommendedAction: "complete approval",
          privilegedActionControlsContext: {
            classifiedAction: "Ownership Transfer",
            parameterFingerprint: "b".repeat(64),
            approvalRequired: true,
            requiredApprovalCount: 2,
          },
        },
        gatewayRequest: {},
        auditLog: {},
        approvalRequest: { id: "APR-1" },
        nextAction: "review",
      }), { status: 201 });
    },
  });

  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: {
      type: "Contract Interaction",
      target: `contract-hash-${"2".repeat(64)}`,
      entryPoint: "transfer_ownership",
      chainName: "casper-test",
      privilegedAction: {
        classifiedAction: "Ownership Transfer",
        contract: `contract-hash-${"2".repeat(64)}`,
        entryPoint: "transfer_ownership",
        currentValue: `01${"1".repeat(64)}`,
        requestedValue: `01${"3".repeat(64)}`,
        recipient: `01${"3".repeat(64)}`,
        classifierSource: "sdk-test",
        classifierVersion: "1.0.0",
        network: "casper-test",
      },
    },
  });

  assert.equal(captured.action.privilegedAction.classifiedAction, "Ownership Transfer");
  assert.equal(captured.action.privilegedAction.recipient, `01${"3".repeat(64)}`);
  assert.equal(response.result.privilegedActionControlsContext.requiredApprovalCount, 2);
});

test("preserves Emergency Circuit Breaker response context and pause evidence", async () => {
  const pause = {
    id: "EPAUSE-1",
    ownerWalletAddress: `01${"1".repeat(64)}`,
    agentId: "MAG-1",
    scopeType: "Agent",
    scopeValue: "MAG-1",
    enforcementAction: "Blocked",
    triggerType: "Manual",
    triggerRule: "Operator emergency pause",
    reason: "Investigating repeated execution failures",
    status: "Active",
    createdAt: "2026-07-24T10:00:00.000Z",
    expiresAt: "2026-07-24T11:00:00.000Z",
    resumeRequiresApproval: false,
    resumeQuorum: 1,
  };
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      executionApproved: false,
      result: {
        decision: "Blocked",
        risk: "Critical",
        riskScore: 100,
        reason: "An active emergency pause blocks this execution.",
        recommendedAction: "Resolve the pause before retrying.",
        emergencyControlsContext: {
          evaluated: true,
          active: true,
          automatic: false,
          enforcementAction: "Blocked",
          matchingPauses: [pause],
          pause,
        },
      },
      gatewayRequest: {},
      auditLog: {},
      emergencyPause: pause,
      nextAction: "stop",
    }), { status: 201 }),
  });

  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: { type: "Transfer", amount: 1, target: `01${"2".repeat(64)}` },
  });

  assert.equal(response.result.emergencyControlsContext.active, true);
  assert.equal(response.result.emergencyControlsContext.pause.scopeType, "Agent");
  assert.equal(response.emergencyPause.id, "EPAUSE-1");
});


test("preserves organizational approval tier, group, escalation, and execution-window evidence", async () => {
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async () => new Response(JSON.stringify({
      ok: true,
      approval: {
        id: "APR-ORG",
        auditLogId: "AUD-ORG",
        agentId: "MAG-1",
        actionType: "Transfer",
        amount: 12000,
        target: "01def",
        decision: "Review Required",
        reviewStatus: "Approved",
        bindingHash: "a".repeat(64),
        requiredApprovals: 3,
        approvalsReceived: 3,
        remainingApprovals: 0,
        resolvedTier: { id: "high-value", name: "High Value Treasury", requiredApprovals: 3 },
        groupProgress: [
          { groupId: "treasury", groupName: "Treasury", required: 2, received: 2, remaining: 0, satisfied: true },
          { groupId: "security", groupName: "Security", required: 1, received: 1, remaining: 0, satisfied: true },
        ],
        escalationHistory: [{ id: "backup-after-15m", name: "Backup escalation", afterSeconds: 900, activatedAt: "2026-07-24T10:15:00.000Z" }],
        executionNotBefore: "2026-07-24T10:45:00.000Z",
        executionWindowEndsAt: "2026-07-24T11:00:00.000Z",
        executionWindowStatus: "delay",
        organizationalQuorum: { enabled: true, satisfied: true, activeGroupIds: ["treasury", "security"] },
        approverWallets: [],
        responses: [{ walletAddress: "01abc", response: "Approved", timestamp: "2026-07-24T10:30:00.000Z", memberGroupIds: ["treasury"], groupIds: ["treasury"] }],
        expiresAt: "2026-07-24T11:30:00.000Z",
        mayProceedToSigning: false,
      },
    }), { status: 200 }),
  });

  const response = await client.getApproval("APR-ORG");
  assert.equal(response.approval.resolvedTier.name, "High Value Treasury");
  assert.equal(response.approval.groupProgress[0].received, 2);
  assert.equal(response.approval.executionWindowStatus, "delay");
  assert.deepEqual(response.approval.responses[0].memberGroupIds, ["treasury"]);
});

test("preserves public runtime arguments and Contract Argument Policies response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: {
          decision: "Allowed",
          risk: "Low",
          riskScore: 9,
          reason: "runtime arguments satisfy the configured rule",
          recommendedAction: "continue",
          contractArgumentPoliciesContext: {
            target: `contract-package-hash-${"a".repeat(64)}`,
            entryPoint: "transfer",
            ruleId: "transfer-rule",
            argumentFingerprint: "c".repeat(64),
            evaluatedArguments: ["recipient", "amount"],
            requiredArguments: ["recipient", "amount"],
            allowedArguments: ["recipient", "amount"],
            violations: [],
          },
        },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "sign",
      }), { status: 201 });
    },
  });

  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: {
      type: "Contract Interaction",
      target: `contract-package-hash-${"a".repeat(64)}`,
      targetType: "Trusted Contract",
      contractIdentifierType: "Package Hash",
      entryPoint: "transfer",
      chainName: "casper-test",
      preflight: {
        runtimeArgs: {
          recipient: `01${"2".repeat(64)}`,
          amount: "25",
        },
      },
    },
  });

  assert.equal(captured.action.preflight.runtimeArgs.amount, "25");
  assert.equal(captured.action.preflight.runtimeArgs.recipient, `01${"2".repeat(64)}`);
  assert.equal(response.result.contractArgumentPoliciesContext.entryPoint, "transfer");
  assert.equal(response.result.contractArgumentPoliciesContext.violations.length, 0);
});

test("preserves Agent Instruction Integrity metadata and response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: {
          decision: "Allowed", risk: "Low", riskScore: 6, reason: "goal binding passed", recommendedAction: "continue",
          instructionIntegrityContext: {
            metadataSupplied: true, enabled: true, mode: "Review", goalId: "goal:transfer-001", intentSource: "user",
            externalContentUsed: false, userConfirmed: true, currentParameterHash: "c".repeat(64), parametersChanged: false,
            originalPermissionScopes: ["wallet:transfer"], currentPermissionScopes: ["wallet:transfer"], violations: [],
          },
        },
        gatewayRequest: {}, auditLog: {}, nextAction: "sign",
      }), { status: 201 });
    },
  });

  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: {
      type: "Transfer", amount: 5, target: `01${"2".repeat(64)}`,
      instructionIntegrity: {
        goalId: "goal:transfer-001", originalUserGoalHash: "a".repeat(64), initiatedBy: "user", intentSource: "user",
        sourceDomains: [], externalContentUsed: false, userConfirmed: true, sourceTrustLevel: "trusted",
        originalPermissionScopes: ["wallet:transfer"], currentPermissionScopes: ["wallet:transfer"],
      },
    },
  });

  assert.equal(captured.action.instructionIntegrity.goalId, "goal:transfer-001");
  assert.deepEqual(captured.action.instructionIntegrity.currentPermissionScopes, ["wallet:transfer"]);
  assert.equal(response.result.instructionIntegrityContext.parametersChanged, false);
  assert.deepEqual(response.result.instructionIntegrityContext.violations, []);
});

test("preserves Tool & MCP Integrity metadata and response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, executionApproved: true, result: {
        decision: "Allowed", risk: "Low", riskScore: 5, reason: "tool passed", recommendedAction: "continue",
        toolMcpIntegrityContext: { metadataSupplied: true, serverId: "mcp-main", toolName: "wallet.transfer", approvedServer: true, approvedTool: true, permissionScopes: ["wallet:read"], violations: [] },
      }, gatewayRequest: {}, auditLog: {}, nextAction: "sign" }), { status: 201 });
    },
  });
  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: { type: "Transfer", amount: 1, target: `01${"2".repeat(64)}`, toolIntegrity: {
      mcpServerId: "mcp-main", mcpServerUrl: "https://mcp.example", toolName: "wallet.transfer", toolVersion: "1.0.0",
      manifestHash: "a".repeat(64), schemaHash: "b".repeat(64), descriptionHash: "c".repeat(64), permissionScopes: ["wallet:read"], credentialScope: "wallet-limited", tls: true, toolOrigin: "magen3-mcp",
    } },
  });
  assert.equal(captured.action.toolIntegrity.toolName, "wallet.transfer");
  assert.deepEqual(captured.action.toolIntegrity.permissionScopes, ["wallet:read"]);
  assert.equal(response.result.toolMcpIntegrityContext.approvedTool, true);
});

test("preserves Delegation & Session Key Safety metadata and sanitized response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, executionApproved: true, result: {
        decision: "Allowed", risk: "Low", riskScore: 5, reason: "delegation passed", recommendedAction: "continue",
        delegationSafetyContext: { delegationId: "dlg-sdk-001", delegate: `01${"2".repeat(64)}`, signatureVerified: true, signatureHash: "d".repeat(64), signatureAlgorithm: "Ed25519", allowedMethods: ["Transfer"], usedLastHour: 0, violations: [] },
      }, gatewayRequest: {}, auditLog: {}, nextAction: "sign" }), { status: 201 });
    },
  });
  const response = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: { type: "Transfer", amount: 1, asset: "CSPR", target: `01${"3".repeat(64)}`, delegation: {
      delegationId: "dlg-sdk-001", delegatingWallet: `01${"1".repeat(64)}`, delegate: `01${"2".repeat(64)}`, sessionKey: `01${"2".repeat(64)}`,
      allowedNetworks: ["casper-test"], allowedMethods: ["Transfer"], allowedAssets: ["CSPR"], maxTransactionAmount: 5, maxFrequency: 2,
      validFrom: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T01:00:00.000Z", revocationStatus: "Active", delegationDepth: 0, redelegationAllowed: false,
      nonce: "nonce-sdk-001", chainName: "casper-test", attestationHash: "a".repeat(64), attestationSignature: "b".repeat(128),
    } },
  });
  assert.equal(captured.action.delegation.delegationId, "dlg-sdk-001");
  assert.equal(captured.action.delegation.attestationSignature, "b".repeat(128));
  assert.equal(response.result.delegationSafetyContext.signatureVerified, true);
  assert.equal(response.result.delegationSafetyContext.signatureHash, "d".repeat(64));
});


test("builds the exact backend-compatible delegation attestation message", async () => {
  const delegation = {
    delegationId: "dlg-sdk-builder-001", agentId: "MAG-SDK-1", delegatingWallet: `01${"1".repeat(64)}`, delegate: "session-agent", sessionKey: `01${"2".repeat(64)}`,
    allowedNetworks: ["casper-test"], allowedContracts: ["contract-package-hash-example"], allowedMethods: ["Transfer"], allowedAssets: ["CSPR"],
    nativeAmountLimit: 25, tokenAmountLimits: { TEST: 10 }, maxTransactionAmount: 10, maxFrequency: 5, validFrom: "2026-07-25T00:00:00.000Z", expiresAt: "2026-07-25T01:00:00.000Z",
    revocationStatus: "Active", delegationDepth: 0, redelegationAllowed: false, nonce: "nonce-sdk-builder-001", chainName: "casper-test",
  };
  const { buildDelegationAttestationMessage } = await import("../../../backend/lib/delegationSafety.mjs");
  assert.equal(buildMagen3DelegationAttestationMessage(delegation), buildDelegationAttestationMessage(delegation));
  assert.match(buildMagen3DelegationAttestationMessage(delegation), /does not sign or submit a blockchain transaction/);
});


test("preserves RPC & Chain Integrity metadata and sanitized response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example", agentId: "MAG-RPC-1", apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true, executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 4, reason: "RPC evidence passed", recommendedAction: "continue", rpcChainIntegrityContext: { metadataSupplied: true, selectedProviderId: "primary", selectedEndpoint: "https://node.testnet.casper.network/rpc", usableProviderCount: 1, networkAgreement: true, transactionStatusAgreement: true, contractStateAgreement: true, automaticFailoverUsed: false, violations: [] } },
        gatewayRequest: {}, auditLog: {}, nextAction: "sign",
      }), { status: 201 });
    },
  });
  const result = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: { type: "Transfer", amount: 1, asset: "CSPR", target: `01${"2".repeat(64)}`, chainName: "casper-test", rpcIntegrity: {
      expectedChainName: "casper-test", expectedNetworkIdentifier: "casper-testnet", expectedGenesisHash: "a".repeat(64),
      selectedEndpoint: "https://node.testnet.casper.network/rpc", selectedProviderId: "primary",
      providerObservations: [{ providerId: "primary", endpoint: "https://node.testnet.casper.network/rpc", chainName: "casper-test", networkIdentifier: "casper-testnet", genesisHash: "a".repeat(64), tls: true, synced: true, latestBlockHeight: 125000, latestBlockTimestamp: "2026-07-25T00:00:00.000Z", responseTimestamp: "2026-07-25T00:00:05.000Z", timedOut: false, rateLimited: false, speculative: false, transactionStatusHash: "b".repeat(64), contractStateHash: "c".repeat(64) }],
      automaticFailoverUsed: false,
    } },
  });
  assert.equal(captured.action.rpcIntegrity.selectedProviderId, "primary");
  assert.equal(captured.action.rpcIntegrity.providerObservations[0].networkIdentifier, "casper-testnet");
  assert.equal(result.result.rpcChainIntegrityContext.networkAgreement, true);
  assert.equal(result.result.rpcChainIntegrityContext.violations.length, 0);
});

test("preserves Gas Sponsorship & Fee Safety metadata and sanitized response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example", agentId: "MAG-FEE-1", apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({ ok: true, executionApproved: true, result: {
        decision: "Allowed", risk: "Low", riskScore: 3, reason: "fee evidence passed", recommendedAction: "continue",
        gasSponsorshipFeeSafetyContext: { metadataSupplied: true, chainFamily: "Casper", sponsor: "magen3-relayer", networkFee: 1, payerMatches: true, fingerprint: "f".repeat(64), violations: [] },
      }, gatewayRequest: {}, auditLog: {}, nextAction: "sign" }), { status: 201 });
    },
  });
  const result = await client.checkIntent({
    executionWalletAddress: `01${"1".repeat(64)}`,
    action: { type: "Transfer", amount: 1, asset: "CSPR", target: `01${"2".repeat(64)}`, chainName: "casper-test", feeSafety: {
      chainFamily: "Casper", chainName: "casper-test", networkFee: 1, feeUnit: "CSPR", sponsor: "magen3-relayer",
      sponsorshipId: "sponsor-sdk-1", sponsorshipExpiry: "2026-07-25T03:00:00.000Z", sponsorshipScopes: ["Transfer"], sponsorSignatureHash: "a".repeat(64),
      expectedPayer: "magen3-relayer", actualPayer: "magen3-relayer", sponsored: true, sponsorshipAvailable: true,
    } },
  });
  assert.equal(captured.action.feeSafety.sponsor, "magen3-relayer");
  assert.equal(captured.action.feeSafety.sponsorSignatureHash, "a".repeat(64));
  assert.equal(result.result.gasSponsorshipFeeSafetyContext.payerMatches, true);
  assert.equal(result.result.gasSponsorshipFeeSafetyContext.violations.length, 0);
});


test("returns the Gateway-provided user-facing explanation", () => {
  const response = {
    ok: true,
    executionApproved: false,
    result: { decision: "Review Required", risk: "Medium", riskScore: 40, reason: "review", recommendedAction: "resubmit" },
    gatewayRequest: {},
    auditLog: {},
    nextAction: "resubmit",
    agentMessage: "Magen3 paused this action because RPC evidence is missing. No human approval is required yet.",
  };
  assert.match(getMagen3AgentMessage(response), /No human approval is required yet/i);
  assert.equal(isMagen3ExecutionApproved(response), false);
});

test("execution helper requires both Allowed and executionApproved", () => {
  const base = { ok: true, gatewayRequest: {}, auditLog: {}, nextAction: "continue" };
  assert.equal(isMagen3ExecutionApproved({ ...base, executionApproved: true, result: { decision: "Allowed", risk: "Low", riskScore: 1, reason: "ok", recommendedAction: "continue" } }), true);
  assert.equal(isMagen3ExecutionApproved({ ...base, executionApproved: true, result: { decision: "Review Required", risk: "Medium", riskScore: 50, reason: "review", recommendedAction: "stop" } }), false);
});


test("builds backend-compatible protected parameters and instruction binding", async () => {
  const intent = {
    source: "YieldBot",
    targetChain: "base-sepolia",
    executionWalletAddress: "0x1111111111111111111111111111111111111111",
    action: {
      type: "Transfer",
      amount: 5,
      asset: "USDC",
      target: "0x2222222222222222222222222222222222222222",
      targetType: "Wallet Address",
    },
  };
  const protectedParameters = buildMagen3ProtectedParameters(intent);
  assert.equal(protectedParameters.chainName, "base-sepolia");
  assert.equal(protectedParameters.destination, intent.action.target);
  const hash = await hashMagen3ProtectedParameters(protectedParameters);
  assert.match(hash, /^[0-9a-f]{64}$/);

  const binding = await createMagen3InstructionIntegrityBinding(intent, {
    goalId: "goal:yieldbot-transfer-1",
    originalUserRequest: "Send 5 USDC to 0x2222222222222222222222222222222222222222",
  });
  assert.equal(binding.originalParameterHash, binding.currentParameterHash);
  assert.deepEqual(binding.originalProtectedParameters, protectedParameters);
  assert.match(binding.originalUserGoalHash, /^[0-9a-f]{64}$/);
});

test("preserves precise decision explanation diagnostics", () => {
  const response = {
    ok: true,
    executionApproved: false,
    result: {
      decision: "Blocked", risk: "High", riskScore: 90, reason: "blocked", recommendedAction: "retry",
      decisionExplanation: {
        decision: "Blocked", summary: "blocked", primaryReason: "The amount changed.", triggeredRule: "Protected parameter binding", suggestedResolution: "Use the original amount.", userMessage: "Magen3 blocked this action because the amount changed from 5 to 10. Nothing was signed or sent.", agentInstruction: "Stop.", humanActionRequired: false, reviewMode: "blocked", reviewState: "terminal", canAgentRetry: true, requiredActions: ["Use the original amount."], code: "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH", module: "Agent Instruction Integrity", field: "amount", expected: 5, received: 10, mismatchFields: ["amount"],
      },
    },
    gatewayRequest: {}, auditLog: {}, nextAction: "retry",
  };
  assert.match(getMagen3AgentMessage(response), /amount changed from 5 to 10/i);
  assert.equal(response.result.decisionExplanation.code, "INSTRUCTION_PROTECTED_PARAMETER_MISMATCH");
  assert.equal(response.result.decisionExplanation.field, "amount");
});

test("passes Trading Route Integrity metadata and response context through unchanged", async () => {
  let capturedPayload;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-ROUTE",
    apiKey: "secret",
    fetch: async (_url, init) => {
      capturedPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: false,
        result: {
          decision: "Review Required",
          risk: "Medium",
          riskScore: 40,
          reason: "route review",
          recommendedAction: "requote",
          tradingRouteIntegrityContext: { status: "review_required", routeFingerprint: "a".repeat(64) },
        },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "requote",
        tradingRouteIntegrity: { status: "review_required", routeFingerprint: "a".repeat(64) },
      }), { status: 201 });
    },
  });
  const response = await client.checkIntent({
    executionWalletAddress: "0x0000000000000000000000000000000000000001",
    action: {
      type: "Swap",
      amount: 10,
      asset: "USDC",
      outputAsset: "DAI",
      target: "0x1111111111111111111111111111111111111111",
      tradingRoute: {
        quoteProvider: "approved-aggregator",
        quoteId: "quote-1",
        router: "0x1111111111111111111111111111111111111111",
        tokenPath: ["USDC", "WETH", "DAI"],
        inputAsset: "USDC",
        outputAsset: "DAI",
        inputAmount: 10,
        expectedOutput: 9.9,
        minimumOutput: 9.8,
      },
    },
  });
  assert.equal(capturedPayload.action.tradingRoute.quoteId, "quote-1");
  assert.deepEqual(capturedPayload.action.tradingRoute.tokenPath, ["USDC", "WETH", "DAI"]);
  assert.equal(response.result.tradingRouteIntegrityContext.status, "review_required");
  assert.equal(response.tradingRouteIntegrity.routeFingerprint, "a".repeat(64));
});

test("preserves Market Risk Signals selectors and response context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-1",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: false,
        result: {
          decision: "Review Required",
          risk: "Medium",
          riskScore: 45,
          reason: "market evidence incomplete",
          recommendedAction: "refresh evidence",
          marketRiskSignalsContext: { schemaVersion: "magen3.market-risk-signals.v1", evaluatedAt: "2026-08-06T11:00:00.000Z", applicable: true, actionType: "Swap", requested: { pair: "USDC/DAI" }, snapshot: { status: "available", sourceType: "remote", sourceName: "provider", observationCount: 1, pairCount: 1, ageMs: 1000, maxAgeMs: 300000 }, sourceCount: 1, confidence: 80, newestObservationAt: "2026-08-06T11:00:00.000Z", metrics: {}, evidenceFingerprint: "a".repeat(64), status: "review_required", config: {} },
        },
        gatewayRequest: {},
        auditLog: {},
        nextAction: "refresh evidence",
        marketRiskSignals: { status: "review_required" },
      }), { status: 201 });
    },
  });
  const response = await client.checkIntent({
    executionWalletAddress: "01abc",
    action: {
      type: "Swap",
      amount: 10,
      asset: "USDC",
      outputAsset: "DAI",
      target: "0xrouter",
      marketRisk: { baseAsset: "USDC", quoteAsset: "DAI", network: "base-sepolia", venue: "aggregator-a", poolId: "pool-1" },
    },
  });
  assert.equal(captured.action.marketRisk.network, "base-sepolia");
  assert.equal(captured.action.marketRisk.poolId, "pool-1");
  assert.equal(response.result.marketRiskSignalsContext.status, "review_required");
});

test("preserves Across testnet bridge selectors and exact unsigned execution context", async () => {
  let captured;
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-BRIDGE",
    apiKey: "secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(JSON.stringify({
        ok: true,
        executionApproved: true,
        result: { decision: "Allowed", risk: "Low", riskScore: 10, reason: "allowed", recommendedAction: "sign", bridgeProviderIntegrationContext: { status: "passed", adapterId: "across-testnet", payloadHash: "a".repeat(64) } },
        gatewayRequest: {}, auditLog: {}, nextAction: "sign",
        bridgeProviderIntegration: { status: "passed", adapterId: "across-testnet", payloadHash: "a".repeat(64) },
        bridgeProviderExecution: { providerId: "across-testnet", routeFingerprint: "b".repeat(64), payloadHash: "a".repeat(64), approvals: [], transaction: { chainId: "11155420", to: "0x5555555555555555555555555555555555555555", data: "0x1234", value: "0" } },
      }), { status: 201 });
    },
  });
  const response = await client.checkIntent({
    executionWalletAddress: "0x1111111111111111111111111111111111111111",
    action: { type: "Bridge", amount: 1, asset: "USDC", target: "0x5555555555555555555555555555555555555555", bridge: { providerId: "across-testnet", sourceChainId: 11155420, destinationChainId: 84532, sourceToken: "0x3333333333333333333333333333333333333333", destinationToken: "0x4444444444444444444444444444444444444444", amountAtomic: "1000000", recipient: "0x2222222222222222222222222222222222222222", tradeType: "exactInput" } },
  });
  assert.equal(captured.action.bridge.providerId, "across-testnet");
  assert.equal(captured.action.bridge.amountAtomic, "1000000");
  assert.equal(response.bridgeProviderExecution.transaction.data, "0x1234");
});

test("pollBridgeProvider uses the authenticated backend route and rejects provider credentials", async () => {
  let capturedUrl = "";
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-BRIDGE", apiKey: "secret", fetch: async (url) => { capturedUrl = String(url); return new Response(JSON.stringify({ ok: true, reconciliation: { status: "delivered" }, bridgeProviderObservation: { status: "delivered" } }), { status: 200 }); } });
  const response = await client.pollBridgeProvider({ auditLogId: "AUD-1", transactionHash: `0x${"a".repeat(64)}` });
  assert.match(capturedUrl, /\/api\/agent-gateway\/bridge\/poll$/);
  assert.equal(response.reconciliation.status, "delivered");
  await assert.rejects(() => client.pollBridgeProvider({ auditLogId: "AUD-1", providerUrl: "https://evil.example" }), /not accepted/);
});

test("bridge provider discovery and quote use authenticated server-controlled routes", async () => {
  const requests = [];
  const client = new Magen3Client({
    gatewayUrl: "https://api.example",
    agentId: "MAG-BRIDGE",
    apiKey: "secret",
    fetch: async (url, init = {}) => {
      requests.push({ url: String(url), init });
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/status")) return new Response(JSON.stringify({ ok: true, bridgeProviderIntegration: { status: "foundation_available", providerId: "across-testnet" } }), { status: 200 });
      if (path.endsWith("/chains")) return new Response(JSON.stringify({ ok: true, bridgeProviderIntegration: { status: "available", providerId: "across-testnet", chains: [{ chainId: 11155420 }] } }), { status: 200 });
      if (path.endsWith("/tokens")) return new Response(JSON.stringify({ ok: true, bridgeProviderIntegration: { status: "available", providerId: "across-testnet", chainId: "11155420", tokens: [] } }), { status: 200 });
      return new Response(JSON.stringify({
        ok: true,
        provider: { id: "across-testnet", name: "Across", environment: "testnet" },
        evidence: { schemaVersion: "magen3.bridge-provider-integration.v1", status: "succeeded", adapterId: "across-testnet", adapterVersion: "1.0.0", providerId: "across-testnet", environment: "testnet", requestBindingHash: "a".repeat(64), providerResponseHash: "b".repeat(64), quoteHash: "c".repeat(64), routeFingerprint: "d".repeat(64), payloadHash: "e".repeat(64), evidenceHash: "f".repeat(64), providerQuoteId: "quote-1", requestedAt: "2026-08-06T12:00:00.000Z", completedAt: "2026-08-06T12:00:01.000Z", expiresAt: "2026-08-06T12:05:00.000Z", sourceChainId: "11155420", destinationChainId: "84532", depositor: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", inputToken: "0x3333333333333333333333333333333333333333", outputToken: "0x4444444444444444444444444444444444444444", inputAmountAtomic: "1000000", outputAmountAtomic: "999000", approvalTransactions: [], sourceTransaction: { chainId: "11155420", to: "0x5555555555555555555555555555555555555555", data: "0x1234", value: "0" }, completeness: {} },
        protectedIntent: { actionType: "Bridge", bridge: {} },
        unsignedTransactions: { approvals: [], bridge: { chainId: "11155420", to: "0x5555555555555555555555555555555555555555", data: "0x1234", value: "0" } },
      }), { status: 200 });
    },
  });

  assert.equal((await client.getBridgeProviderStatus()).bridgeProviderIntegration.status, "foundation_available");
  assert.equal((await client.listBridgeProviderChains()).bridgeProviderIntegration.chains.length, 1);
  assert.equal((await client.listBridgeProviderTokens(11155420)).bridgeProviderIntegration.chainId, "11155420");
  const quote = await client.requestBridgeProviderQuote({ sourceChainId: 11155420, destinationChainId: 84532, inputToken: "0x3333333333333333333333333333333333333333", outputToken: "0x4444444444444444444444444444444444444444", amountAtomic: "1000000", depositor: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222" });
  assert.equal(quote.provider.id, "across-testnet");
  assert.match(requests.at(-1).url, /\/api\/bridge-provider-integration\/quotes$/);
  const body = JSON.parse(requests.at(-1).init.body);
  assert.equal(body.agentId, "MAG-BRIDGE");
  await assert.rejects(() => client.requestBridgeProviderQuote({ sourceChainId: 11155420, destinationChainId: 84532, inputToken: "0x3333333333333333333333333333333333333333", outputToken: "0x4444444444444444444444444444444444444444", amountAtomic: "1000000", depositor: "0x1111111111111111111111111111111111111111", recipient: "0x2222222222222222222222222222222222222222", providerUrl: "https://evil.example" }), /not accepted/);
});

test("creates bounded x402 authorization and applies metered event", async () => {
  const calls = [];
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); } });
  await client.createX402Authorization({ auditLogId: "AUD-1", mode: "metered", maximumAuthorizedAtomic: "1000000", usageUnit: "request", unitPriceAtomic: "100000" });
  await client.applyX402AuthorizationEvent({ auditLogId: "AUD-1", type: "usage", eventId: "usage-1", idempotencyKey: "usage-1", usageQuantity: "2", unitPriceAtomic: "100000" });
  assert.equal(calls[0].url, "https://api.example/api/agent-gateway/x402/authorizations");
  assert.equal(calls[0].body.agentId, "MAG-1");
  assert.equal(calls[1].url, "https://api.example/api/agent-gateway/x402/authorization-events");
  assert.equal(calls[1].body.idempotencyKey, "usage-1");
});
