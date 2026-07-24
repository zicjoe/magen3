import test from "node:test";
import assert from "node:assert/strict";
import { Magen3Client, Magen3Error } from "../dist/index.js";

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

test("requireAllowed stops blocked execution", async () => {
  const client = new Magen3Client({ gatewayUrl: "https://api.example", agentId: "MAG-1", apiKey: "secret", fetch: async () => new Response(JSON.stringify({ ok: true, executionApproved: false, result: { decision: "Blocked", risk: "High", riskScore: 80, reason: "limit exceeded", recommendedAction: "stop" }, gatewayRequest: {}, auditLog: {}, nextAction: "stop" }), { status: 201 }) });
  await assert.rejects(() => client.requireAllowed({ executionWalletAddress: "01abc", action: { type: "Transfer", amount: 100, target: "01def" } }), Magen3Error);
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
