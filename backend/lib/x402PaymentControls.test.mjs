import assert from "node:assert/strict";
import test from "node:test";
import { buildX402RequestFingerprint, canonicalizeX402ResourceUrl, classifyX402Recipient, evaluateX402PaymentControls, mergeX402SettlementTransition, normalizeX402SettlementUpdate } from "./x402PaymentControls.mjs";

const NOW = new Date("2026-07-23T12:00:00.000Z");
const PAY_TO = `0x${"a".repeat(40)}`;
const PAYMENT_REQUIRED_HASH = "b".repeat(64);

function policy(overrides = {}) {
  return {
    structuredRules: {
      x402ControlsEnabled: true,
      x402ControlMode: "Enforce",
      x402UnavailableAction: "Block",
      x402AllowedVersions: [2],
      x402AllowedSchemes: ["exact"],
      x402AllowedMethods: ["GET", "POST"],
      x402AllowedNetworks: ["eip155:84532"],
      x402AllowedAssets: ["USDC"],
      x402AllowedFacilitators: ["https://x402.org/facilitator"],
      x402AllowedMerchants: ["api.example.com"],
      x402BlockedMerchants: [],
      x402AllowedRecipients: [PAY_TO],
      x402MaxPayment: 5,
      x402DailyLimit: 25,
      x402MonthlyLimit: 100,
      x402ReviewThreshold: 3,
      x402MaxPaymentsPerHour: 5,
      x402MaxAuthorizationLifetimeSeconds: 600,
      x402RequireHttps: true,
      x402RequirePaymentRequiredHash: true,
      x402RequireBodyHashForUnsafeMethods: true,
      x402RequireRequestId: true,
      x402PreventAmbiguousRetry: true,
      x402MaxSettlementAttempts: 1,
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    agentId: "MAG-AGENT-x402",
    actionType: "x402 Payment",
    target: "https://api.example.com/data?b=2&a=1",
    targetType: "x402 Merchant",
    amount: 1,
    asset: "USDC",
    x402Version: "2",
    x402Scheme: "exact",
    x402ResourceUrl: "https://api.example.com/data?b=2&a=1",
    x402HttpMethod: "GET",
    x402MerchantDomain: "api.example.com",
    x402PayTo: PAY_TO,
    x402Asset: "USDC",
    x402Network: "eip155:84532",
    x402Facilitator: "https://x402.org/facilitator",
    x402AmountAtomic: "1000000",
    x402ValidUntil: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    x402RequestId: "pay-001",
    x402PaymentRequiredHash: PAYMENT_REQUIRED_HASH,
    x402RequestBodyHash: "",
    x402RequestFingerprint: "",
    x402SettlementStatus: "not_submitted",
    x402SettlementAttempt: 0,
    ...overrides,
  };
}

test("skips non-x402 intents", () => {
  const result = evaluateX402PaymentControls({ request: { actionType: "Transfer" }, policy: policy(), now: NOW });
  assert.equal(result.applicable, false);
  assert.equal(result.findings[0].status, "skipped");
});

test("canonicalizes paid resource URLs and validates supported recipients", () => {
  const resource = canonicalizeX402ResourceUrl("https://api.example.com/data?b=2&a=1#fragment");
  assert.equal(resource.valid, true);
  assert.equal(resource.canonical, "https://api.example.com/data?a=1&b=2");
  assert.equal(classifyX402Recipient(PAY_TO, "eip155:84532").valid, true);
  assert.equal(classifyX402Recipient("0x1234", "eip155:84532").valid, false);
});

test("allows a complete exact-scheme payment within policy", () => {
  const result = evaluateX402PaymentControls({ request: request(), policy: policy(), auditLogs: [], now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.context.scheme, "exact");
  assert.match(result.context.requestFingerprint, /^[0-9a-f]{64}$/);
  assert.ok(result.findings.some((item) => item.rule === "x402 replay prevention" && item.status === "pass"));
});

test("hard-blocks resource and merchant substitution", () => {
  const result = evaluateX402PaymentControls({ request: request({ x402MerchantDomain: "evil.example" }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Merchant-resource binding" && item.status === "fail"));
});

test("blocks unsupported schemes, networks, recipients, and expired requirements in Enforce mode", () => {
  const result = evaluateX402PaymentControls({
    request: request({
      x402Scheme: "upto",
      x402Network: "eip155:1",
      x402PayTo: "0x1234",
      x402ValidUntil: new Date(NOW.getTime() - 1_000).toISOString(),
    }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Allowed x402 payment schemes" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "x402 authorization expiry" && item.status === "fail"));
});

test("requires request-body binding for unsafe methods", () => {
  const result = evaluateX402PaymentControls({
    request: request({ x402HttpMethod: "POST", x402RequestBodyHash: "" }),
    policy: policy({ x402ControlMode: "Review", x402UnavailableAction: "Review" }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.ok(result.findings.some((item) => item.rule === "HTTP request-body binding" && item.status === "warning"));
});

test("enforces per-payment, daily, monthly, review, and hourly limits", () => {
  const auditLogs = [
    { id: "AUD-1", agentId: "MAG-AGENT-x402", action: "x402 Payment", decision: "Allowed", timestamp: NOW.toISOString(), amount: 4, originalIntent: {} },
    { id: "AUD-2", agentId: "MAG-AGENT-x402", action: "x402 Payment", decision: "Allowed", timestamp: NOW.toISOString(), amount: 4, originalIntent: {} },
  ];
  const result = evaluateX402PaymentControls({
    request: request({ amount: 6, x402AmountAtomic: "6000000" }),
    policy: policy({ x402MaxPayment: 5, x402DailyLimit: 10, x402MonthlyLimit: 10, x402MaxPaymentsPerHour: 2 }),
    auditLogs,
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Maximum x402 payment" && item.status === "fail"));
  assert.ok(result.findings.some((item) => item.rule === "x402 payment frequency" && item.status === "fail"));
});

test("hard-blocks a mismatched client fingerprint", () => {
  const result = evaluateX402PaymentControls({ request: request({ x402RequestFingerprint: "c".repeat(64) }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Client request fingerprint" && item.status === "fail"));
});

test("blocks ambiguous settlement retries", () => {
  const result = evaluateX402PaymentControls({ request: request({ x402SettlementStatus: "uncertain", x402SettlementAttempt: 1 }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Ambiguous-settlement retry prevention" && item.status === "fail"));
});

test("detects replayed fingerprints from prior audit records", () => {
  const current = request();
  const fingerprint = buildX402RequestFingerprint({
    version: current.x402Version,
    scheme: current.x402Scheme,
    method: current.x402HttpMethod,
    resourceUrl: current.x402ResourceUrl,
    merchantDomain: current.x402MerchantDomain,
    payTo: current.x402PayTo,
    asset: current.x402Asset,
    network: current.x402Network,
    amountAtomic: current.x402AmountAtomic,
    validUntil: current.x402ValidUntil,
    paymentRequiredHash: current.x402PaymentRequiredHash,
    requestId: current.x402RequestId,
  });
  const auditLogs = [{
    id: "AUD-prior",
    agentId: current.agentId,
    action: "x402 Payment",
    decision: "Allowed",
    timestamp: NOW.toISOString(),
    amount: 1,
    originalIntent: { action: { x402: { requestFingerprint: fingerprint, settlement: { status: "confirmed", transactionHash: `0x${"d".repeat(64)}` } } } },
  }];
  const result = evaluateX402PaymentControls({ request: current, policy: policy(), auditLogs, now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "x402 replay prevention" && item.status === "fail"));
});


test("blocks x402 payments unless the active policy explicitly enables the module", () => {
  const result = evaluateX402PaymentControls({
    request: request(),
    policy: { structuredRules: { x402ControlMode: "Enforce" } },
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "x402 controls enabled" && item.status === "fail"));
});

test("derives expiry from x402 v2 maxTimeoutSeconds and a stable PAYMENT-REQUIRED receipt time", () => {
  const result = evaluateX402PaymentControls({
    request: request({
      x402ValidUntil: "",
      x402MaxTimeoutSeconds: 300,
      x402RequirementsReceivedAt: NOW.toISOString(),
    }),
    policy: policy(),
    now: new Date(NOW.getTime() + 60_000),
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.context.maxTimeoutSeconds, 300);
  assert.equal(result.context.validUntil, new Date(NOW.getTime() + 300_000).toISOString());
});

test("does not invent a receipt timestamp for maxTimeoutSeconds", () => {
  const result = evaluateX402PaymentControls({
    request: request({ x402ValidUntil: "", x402MaxTimeoutSeconds: 300, x402RequirementsReceivedAt: "" }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "x402 authorization expiry" && item.status === "fail"));
});

test("hard-blocks atomic/display amount substitution", () => {
  const result = evaluateX402PaymentControls({ request: request({ amount: 2, x402AmountAtomic: "1000000" }), policy: policy(), now: NOW });
  assert.equal(result.hardBlock, true);
  assert.ok(result.findings.some((item) => item.rule === "Atomic/display amount consistency" && item.status === "fail"));
});

test("hard-blocks secret-bearing resource URLs and intent/resource substitution", () => {
  const secretUrl = "https://api.example.com/data?api_key=do-not-store";
  const secret = evaluateX402PaymentControls({
    request: request({ target: secretUrl, x402ResourceUrl: secretUrl }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(secret.hardBlock, true);
  assert.ok(secret.findings.some((item) => item.rule === "Secret-free paid resource URL" && item.status === "fail"));

  const substituted = evaluateX402PaymentControls({
    request: request({ target: "https://api.example.com/other" }),
    policy: policy(),
    now: NOW,
  });
  assert.equal(substituted.hardBlock, true);
  assert.ok(substituted.findings.some((item) => item.rule === "Intent-resource binding" && item.status === "fail"));
});

test("settlement normalization requires confirmed transaction evidence and confirmed delivery", () => {
  assert.throws(() => normalizeX402SettlementUpdate({ status: "confirmed", requestFingerprint: "a".repeat(64) }), /requires transactionHash/i);
  assert.throws(() => normalizeX402SettlementUpdate({ status: "pending", requestFingerprint: "a".repeat(64), resourceDelivered: true }), /only be true for a confirmed/i);
});

test("settlement transitions are monotonic and immutable", () => {
  const fingerprint = "a".repeat(64);
  const txHash = `0x${"d".repeat(64)}`;
  const first = normalizeX402SettlementUpdate({ status: "submitted", requestFingerprint: fingerprint, transactionHash: txHash, attempt: 1 });
  const submitted = mergeX402SettlementTransition({}, first);
  assert.equal(submitted.transactionHash, txHash);

  assert.throws(() => mergeX402SettlementTransition({ ...submitted, attempt: 2 }, normalizeX402SettlementUpdate({ status: "pending", requestFingerprint: fingerprint, attempt: 1 })), /cannot move backwards/i);
  assert.throws(() => mergeX402SettlementTransition(submitted, normalizeX402SettlementUpdate({ status: "pending", requestFingerprint: fingerprint, transactionHash: `0x${"e".repeat(64)}`, attempt: 1 })), /cannot be changed/i);

  const confirmed = mergeX402SettlementTransition(submitted, normalizeX402SettlementUpdate({ status: "confirmed", requestFingerprint: fingerprint, transactionHash: txHash, attempt: 1, resourceDelivered: true }));
  assert.equal(confirmed.resourceDelivered, true);
  assert.throws(() => mergeX402SettlementTransition(confirmed, normalizeX402SettlementUpdate({ status: "confirmed", requestFingerprint: fingerprint, transactionHash: txHash, attempt: 1, resourceDelivered: false })), /cannot be reverted/i);
});
