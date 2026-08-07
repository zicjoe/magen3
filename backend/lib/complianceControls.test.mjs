import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateComplianceControls,
  getComplianceControlsSnapshot,
  normalizeComplianceFeed,
  resetComplianceControlsCache,
  summarizeComplianceControlsSnapshot,
} from "./complianceControls.mjs";
import { normalizeAgentGatewayIntent } from "./agentGateway.mjs";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const WALLET = `01${"1".repeat(64)}`;
const TARGET = `01${"2".repeat(64)}`;
const MATCHED = `01${"8".repeat(64)}`;

function policy(overrides = {}) {
  return {
    structuredRules: {
      complianceControlsEnabled: true,
      complianceControlMode: "Enforce",
      complianceUnavailableAction: "Review",
      complianceRequiredActions: ["Transfer"],
      complianceRequireOriginatorAttestation: true,
      complianceRequireBeneficiaryAttestation: true,
      complianceRequireTravelRule: true,
      complianceTravelRuleThreshold: 1,
      complianceRequireSanctionsScreening: true,
      complianceAllowedJurisdictions: ["NG", "US"],
      complianceBlockedJurisdictions: [],
      complianceReviewJurisdictions: [],
      complianceAllowedCounterpartyTypes: ["VASP", "Self-hosted Wallet"],
      complianceAcceptedProviders: ["Verified Provider"],
      complianceMaxAttestationAgeSeconds: 86400,
      complianceMaxScreeningAgeSeconds: 3600,
      complianceMaximumRiskRating: "Medium",
      ...overrides,
    },
  };
}

function request(overrides = {}) {
  return {
    actionType: "Transfer",
    amount: 5,
    executionWalletAddress: WALLET,
    target: TARGET,
    targetType: "Wallet Address",
    complianceOriginatorJurisdiction: "NG",
    complianceBeneficiaryJurisdiction: "US",
    complianceCounterpartyType: "VASP",
    complianceOriginatorAttestationStatus: "Verified",
    complianceOriginatorAttestationProvider: "Verified Provider",
    complianceOriginatorAttestationReference: "ORIGINATOR-001",
    complianceOriginatorAttestationIssuedAt: "2026-07-22T11:30:00.000Z",
    complianceOriginatorAttestationExpiresAt: "2026-07-23T12:00:00.000Z",
    complianceBeneficiaryAttestationStatus: "Verified",
    complianceBeneficiaryAttestationProvider: "Verified Provider",
    complianceBeneficiaryAttestationReference: "BENEFICIARY-001",
    complianceBeneficiaryAttestationIssuedAt: "2026-07-22T11:30:00.000Z",
    complianceBeneficiaryAttestationExpiresAt: "2026-07-23T12:00:00.000Z",
    complianceTravelRuleStatus: "Complete",
    complianceTravelRuleReference: "TRAVEL-RULE-001",
    complianceTravelRuleDataHash: "a".repeat(64),
    complianceScreeningStatus: "Clear",
    complianceScreeningProvider: "Verified Provider",
    complianceScreeningReference: "SCREEN-001",
    complianceScreenedAt: "2026-07-22T11:55:00.000Z",
    complianceRiskRating: "Low",
    complianceOriginatorVaspId: "VASP-NG-001",
    complianceBeneficiaryVaspId: "VASP-US-002",
    ...overrides,
  };
}

function feed(overrides = {}) {
  return normalizeComplianceFeed({
    source: "test compliance feed",
    generatedAt: NOW.toISOString(),
    indicators: [],
    restrictedJurisdictions: [],
    ...overrides,
  }, { now: NOW });
}

test("normalizes exact compliance indicators and jurisdiction restrictions", () => {
  const normalized = feed({
    indicators: [
      { value: MATCHED, action: "Review", label: "Review match" },
      { value: MATCHED, action: "Block", label: "Block match" },
    ],
    restrictedJurisdictions: [
      { code: "ZZ", action: "Review" },
      { code: "ZZ", action: "Block" },
    ],
  });

  assert.equal(normalized.indicatorCount, 1);
  assert.equal(normalized.indicators[0].action, "Block");
  assert.equal(normalized.jurisdictionCount, 1);
  assert.equal(normalized.restrictedJurisdictions[0].action, "Block");
});

test("skips Compliance Controls for legacy policies with no compliance configuration", () => {
  const result = evaluateComplianceControls({ request: { actionType: "Transfer", target: TARGET }, policy: {}, snapshot: {}, now: NOW });
  assert.equal(result.applicable, false);
  assert.equal(result.findings[0].status, "skipped");
});

test("allows complete non-sensitive compliance evidence with a fresh feed", () => {
  const result = evaluateComplianceControls({ request: request(), policy: policy(), snapshot: feed(), now: NOW });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, false);
  assert.equal(result.findings.some((item) => item.status === "fail" || item.status === "warning" || item.status === "unavailable"), false);
  assert.equal(result.context.travelRuleStatus, "Complete");
  assert.equal(result.context.screeningStatus, "Clear");
});

test("Review mode requires review when Travel Rule evidence is incomplete", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceTravelRuleStatus: "Incomplete", complianceTravelRuleReference: "" }),
    policy: policy({ complianceControlMode: "Review" }),
    snapshot: feed(),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Travel Rule evidence" && item.status === "warning"), true);
});

test("a rejected required attestation blocks regardless of Observe mode", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceBeneficiaryAttestationStatus: "Rejected" }),
    policy: policy({ complianceControlMode: "Observe" }),
    snapshot: feed(),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Beneficiary attestation" && item.status === "fail"), true);
});

test("an exact configured Block indicator stops execution", () => {
  const result = evaluateComplianceControls({
    request: request({ target: MATCHED }),
    policy: policy(),
    snapshot: feed({ indicators: [{ value: MATCHED, action: "Block", label: "Synthetic sanctions match", reference: "LIST-001" }] }),
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.equal(result.context.matchedIndicators.length, 1);
  assert.equal(result.findings.some((item) => item.rule === "Configured compliance indicator match" && item.status === "fail"), true);
});

test("a configured Review jurisdiction requires human review", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceBeneficiaryJurisdiction: "ZZ" }),
    policy: policy({ complianceAllowedJurisdictions: ["NG", "US", "ZZ"] }),
    snapshot: feed({ restrictedJurisdictions: [{ code: "ZZ", action: "Review", label: "Synthetic jurisdiction review" }] }),
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.context.matchedJurisdictions.length, 1);
});

test("required screening never silently passes when the feed and external result are unavailable", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceScreeningStatus: "Not Provided", complianceScreeningProvider: "", complianceScreeningReference: "", complianceScreenedAt: "" }),
    policy: policy({ complianceUnavailableAction: "Review" }),
    snapshot: { status: "unavailable", sourceType: "none", sourceName: "No feed", indicators: [], restrictedJurisdictions: [] },
    now: NOW,
  });
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Compliance feed availability" && item.status === "unavailable"), true);
  assert.equal(result.findings.some((item) => item.rule === "Compliance feed availability" && item.status === "pass"), false);
});

test("rejects raw personal identity fields at the Gateway boundary", () => {
  assert.throws(() => normalizeAgentGatewayIntent({
    agentId: "MAG-AGENT-PII",
    executionWalletAddress: WALLET,
    action: {
      type: "Transfer",
      amount: 1,
      target: TARGET,
      compliance: {
        originatorJurisdiction: "NG",
        fullName: "Do not persist this",
      },
    },
  }), /Raw personal identity data is not accepted/i);
});

test("a feed without generatedAt is stale rather than implicitly fresh", async () => {
  resetComplianceControlsCache();
  const loaded = await getComplianceControlsSnapshot({
    force: true,
    env: {
      COMPLIANCE_CONTROLS_FEED_JSON: JSON.stringify({ indicators: [{ value: MATCHED, action: "Block" }] }),
      COMPLIANCE_CONTROLS_CACHE_TTL_MS: "1000",
    },
    now: NOW,
  });
  assert.equal(loaded.status, "stale");
});

test("loads a local feed and sanitizes public file paths and errors", async () => {
  resetComplianceControlsCache();
  const dir = await mkdtemp(join(tmpdir(), "magen3-compliance-"));
  const path = join(dir, "feed.json");
  await writeFile(path, JSON.stringify({ generatedAt: NOW.toISOString(), indicators: [{ value: MATCHED, action: "Block" }] }));
  const loaded = await getComplianceControlsSnapshot({
    force: true,
    env: { COMPLIANCE_CONTROLS_FEED_PATH: path, COMPLIANCE_CONTROLS_CACHE_TTL_MS: "1000" },
    now: NOW,
  });
  const summary = summarizeComplianceControlsSnapshot({ ...loaded, error: `ENOENT ${path}` }, NOW);
  assert.equal(summary.sourceName, "Configured local feed");
  assert.equal(summary.error.includes(path), false);
  assert.equal("indicators" in summary, false);
});

test("provider-required policy follows configured provider-unavailable action", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceScreeningStatus: "Not Provided", complianceScreeningProvider: "", complianceScreeningReference: "", complianceScreenedAt: "" }),
    policy: policy({ complianceProviderRequired: true, complianceProviderUnavailableAction: "Block", complianceRequireSanctionsScreening: false }),
    snapshot: { status: "unavailable", sourceType: "none", indicators: [], restrictedJurisdictions: [], configuredProviderIds: ["ofac_api"], providerEvidence: [], providerStatuses: [{ providerId: "ofac_api", status: "authentication_unavailable" }] },
    now: NOW,
  });
  assert.equal(result.hardBlock, true);
  assert.equal(result.findings.some((item) => item.rule === "Compliance provider availability"), true);
});

test("provider sanctions claim requires review and never directly authorizes", () => {
  const result = evaluateComplianceControls({
    request: request({ complianceScreeningStatus: "Not Provided", complianceScreeningProvider: "", complianceScreeningReference: "", complianceScreenedAt: "" }),
    policy: policy({ complianceProviderRequired: true, complianceRequireSanctionsScreening: false, complianceAllowedProviders: ["ofac_api"], complianceMinimumProviderConfidence: 95 }),
    snapshot: { status: "available", sourceType: "provider", indicators: [], restrictedJurisdictions: [], configuredProviderIds: ["ofac_api"], providerStatuses: [{ providerId: "ofac_api", status: "available" }], providerEvidence: [{ providerId: "ofac_api", providerVersion: "v4-screen", subjectRole: "target", subjectType: "evm-address", providerVerdict: "match", riskCategories: ["sanctions-related"], providerSeverity: "High", providerConfidence: 99, providerClaim: "Potential match", evidenceTimestamp: NOW.toISOString(), evidenceExpiry: new Date(NOW.getTime()+3600000).toISOString(), evidenceHash: "a".repeat(64), cached: false }] },
    now: NOW,
  });
  assert.equal(result.hardBlock, false);
  assert.equal(result.needsReview, true);
  assert.equal(result.findings.some((item) => item.rule === "Compliance provider screening"), true);
});
