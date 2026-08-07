import assert from "node:assert/strict";
import test from "node:test";
import { screenThreatSubjectsWithProviders, getThreatIntelligenceProviderCapabilities, resetThreatIntelligenceProviderState } from "./threatIntelligenceProviders.mjs";
import { collectThreatSubjects, evaluateThreatIntelligence, getThreatIntelligenceSnapshot, resetThreatIntelligenceCache } from "./threatIntelligence.mjs";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const SAFE = "0x2222222222222222222222222222222222222222";

function response(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", ...headers } });
}

const env = {
  THREAT_INTELLIGENCE_PROVIDERS: "goplus",
  THREAT_INTELLIGENCE_PROVIDER_MAX_RETRIES: "0",
  THREAT_INTELLIGENCE_PROVIDER_CACHE_TTL_MS: "60000",
  THREAT_INTELLIGENCE_PROVIDER_TIMEOUT_MS: "1000",
};

test("collectThreatSubjects is chain-aware across EVM, x402, URL, and RPC subjects", () => {
  const subjects = collectThreatSubjects({
    executionNetwork: "eip155:84532",
    executionWalletAddress: SAFE,
    target: ADDRESS,
    targetType: "Contract",
    assetContractAddress: "0x3333333333333333333333333333333333333333",
    tradingRoute: { router: "0x4444444444444444444444444444444444444444" },
    rpcIntegrity: { endpoint: "https://sepolia.base.org" },
    x402: { network: "eip155:84532", payer: SAFE, payTo: ADDRESS, resource: "https://api.example.com/pay?private=ignored", merchant: "api.example.com" },
  });
  assert.ok(subjects.some((item) => item.canonical === `evm:84532:${ADDRESS}` && item.chainFamily === "evm"));
  assert.ok(subjects.some((item) => item.canonical === "url-origin:https://api.example.com"));
  assert.ok(subjects.some((item) => item.canonical === "url-origin:https://sepolia.base.org"));
  assert.ok(subjects.some((item) => item.canonical === "domain:api.example.com"));
});

test("GoPlus adapter normalizes malicious address evidence without accepting a provider URL from the request", async () => {
  resetThreatIntelligenceProviderState();
  let called = "";
  const result = await screenThreatSubjectsWithProviders([{ canonical: `evm:84532:${ADDRESS}`, normalized: ADDRESS, kind: "evm-address", subjectType: "payment_recipient", chainFamily: "evm", chainId: "84532" }], {
    env,
    fetchImpl: async (url) => {
      called = String(url);
      return response({ code: 1, message: "ok", result: { phishing_activities: "1", malicious_behavior: ["phishing_activities"] } });
    },
    now: new Date("2026-08-07T12:00:00.000Z"),
  });
  assert.match(called, /^https:\/\/api\.gopluslabs\.io\/api\/v1\/address_security\//);
  assert.match(called, /chain_id=84532/);
  assert.equal(result.status, "available");
  assert.equal(result.evidence[0].providerId, "goplus");
  assert.equal(result.evidence[0].providerVerdict, "malicious");
  assert.ok(result.evidence[0].indicatorCategory.includes("phishing"));
  assert.match(result.evidence[0].evidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(result.indicators[0].canonical, `evm:84532:${ADDRESS}`);
});

test("GoPlus adapter caches by provider, chain, and canonical subject", async () => {
  resetThreatIntelligenceProviderState();
  let calls = 0;
  const subject = { canonical: `evm:84532:${SAFE}`, normalized: SAFE, kind: "evm-address", subjectType: "wallet", chainFamily: "evm", chainId: "84532" };
  const fetchImpl = async () => { calls += 1; return response({ code: 1, result: {} }); };
  await screenThreatSubjectsWithProviders([subject], { env, fetchImpl, now: new Date("2026-08-07T12:00:00.000Z") });
  const second = await screenThreatSubjectsWithProviders([subject], { env, fetchImpl, now: new Date("2026-08-07T12:00:10.000Z") });
  assert.equal(calls, 1);
  assert.equal(second.evidence[0].cached, true);
});

test("unsupported chain families are explicit rather than represented as a clean result", async () => {
  resetThreatIntelligenceProviderState();
  const result = await screenThreatSubjectsWithProviders([{ canonical: "wallet:01abc", normalized: "01abc", kind: "ed25519-public-key", subjectType: "wallet", chainFamily: "casper", chainId: "casper-test" }], { env, fetchImpl: async () => { throw new Error("must not call"); } });
  assert.equal(result.status, "unsupported");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.providerStatuses[0].status, "unsupported");
});

test("malformed provider JSON becomes unavailable and never becomes an empty clean result", async () => {
  resetThreatIntelligenceProviderState();
  const result = await screenThreatSubjectsWithProviders([{ canonical: `evm:84532:${SAFE}`, normalized: SAFE, kind: "evm-address", subjectType: "wallet", chainFamily: "evm", chainId: "84532" }], {
    env,
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.evidence.length, 0);
  assert.ok(result.errors.some((item) => /malformed json/i.test(item)));
});

test("provider capability discovery reports fixed server-controlled GoPlus origin", () => {
  const capability = getThreatIntelligenceProviderCapabilities({ env }).find((item) => item.id === "goplus");
  assert.equal(capability.enabled, true);
  assert.equal(capability.serverControlledOrigin, "https://api.gopluslabs.io");
  assert.ok(capability.subjectTypes.includes("payment_recipient"));
});

test("request-scoped provider evidence feeds deterministic policy enforcement", async () => {
  resetThreatIntelligenceCache();
  const request = { executionNetwork: "eip155:84532", executionWalletAddress: SAFE, target: ADDRESS, targetType: "Contract", actionType: "Contract Interaction" };
  const snapshot = await getThreatIntelligenceSnapshot({
    request,
    force: true,
    env,
    fetchImpl: async () => response({ code: 1, result: { malicious_address: "1", malicious_behavior: ["stealing_attack"] } }),
    now: new Date("2026-08-07T12:00:00.000Z"),
  });
  const result = evaluateThreatIntelligence({
    request,
    policy: { structuredRules: { threatIntelligenceMode: "Enforce", threatIntelligenceMinConfidence: 70, threatIntelligenceRequired: true, threatIntelligenceAllowedProviders: ["goplus"], threatIntelligenceBlockedCategories: ["drainer_association"] } },
    snapshot,
    now: new Date("2026-08-07T12:00:01.000Z"),
  });
  assert.equal(result.hardBlock, true);
  assert.equal(result.context.availableProviderIds.includes("goplus"), true);
  assert.equal(result.context.matchedIndicators.some((item) => item.providerId === "goplus"), true);
  assert.equal(result.findings.some((item) => item.rule === "Blocked threat category"), true);
});

test("required provider absence follows configured deterministic fallback", () => {
  const result = evaluateThreatIntelligence({
    request: { executionNetwork: "eip155:84532", executionWalletAddress: SAFE, target: ADDRESS, targetType: "Contract" },
    policy: { structuredRules: { threatIntelligenceMode: "Enforce", threatIntelligenceRequired: true, threatIntelligenceAllowedProviders: ["goplus"], threatIntelligenceProviderUnavailableAction: "Review" } },
    snapshot: { status: "available", sourceName: "Operator feed", sourceType: "inline", generatedAt: "2026-08-07T12:00:00.000Z", fetchedAt: "2026-08-07T12:00:00.000Z", indicators: [], indicatorCount: 0, availableProviderIds: ["operator-feed"], configuredProviderIds: ["operator-feed", "goplus"] },
    now: new Date("2026-08-07T12:00:01.000Z"),
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Threat provider availability"), true);
});
