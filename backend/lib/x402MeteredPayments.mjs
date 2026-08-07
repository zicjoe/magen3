import { createHash } from "node:crypto";
import { buildReservedExposureSnapshot } from "./valueExposureLimits.mjs";

const MODES = new Set(["exact", "upto", "metered"]);
const STATES = new Set(["created", "active", "reserved", "partially_captured", "partially_settled", "fully_settled", "released", "expired", "revoked", "refunded", "disputed", "uncertain"]);
const EVENT_TYPES = new Set(["reserve", "capture", "settle", "release", "refund", "usage", "revoke", "dispute"]);
const HASH_32 = /^(?:0x)?[0-9a-f]{64}$/i;

function clean(v) { return String(v ?? "").trim(); }
function lower(v) { return clean(v).toLowerCase(); }
function positiveAtomic(v, field, { allowZero = false } = {}) {
  const s = clean(v);
  const rx = allowZero ? /^\d+$/ : /^[1-9]\d*$/;
  if (!rx.test(s)) throw error(`${field} must be a ${allowZero ? "non-negative" : "positive"} base-unit integer string`, "X402_AUTH_INVALID_AMOUNT");
  return BigInt(s);
}
function error(message, code, status = 400) { const e = new Error(message); e.code = code; e.status = status; return e; }
function hash(value) { return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function iso(value, field) { const ms = Date.parse(clean(value)); if (!Number.isFinite(ms)) throw error(`${field} must be a valid timestamp`, "X402_AUTH_INVALID_TIMESTAMP"); return new Date(ms).toISOString(); }
function safeRef(value, field, required = true) { const v = clean(value); if (required && !v) throw error(`${field} is required`, "X402_AUTH_MISSING_BINDING"); if (v.length > 160) throw error(`${field} exceeds 160 characters`, "X402_AUTH_INVALID_BINDING"); return v; }
function uniqueEvent(auth, eventId, idempotencyKey) {
  const events = Array.isArray(auth.events) ? auth.events : [];
  return events.find((e) => e.eventId === eventId || e.idempotencyKey === idempotencyKey) || null;
}
function normalizeMode(v) { const mode = lower(v || "exact"); if (!MODES.has(mode)) throw error(`Unsupported x402 payment mode ${mode || "missing"}`, "X402_AUTH_UNSUPPORTED_MODE"); return mode; }

export function deriveX402AuthorizationState(input = {}) {
  const maximum = BigInt(input.maximumAuthorizedAtomic || "0");
  const reserved = BigInt(input.reservedAtomic || "0");
  const captured = BigInt(input.capturedAtomic || "0");
  const settled = BigInt(input.settledAtomic || "0");
  const released = BigInt(input.releasedAtomic || "0");
  const refunded = BigInt(input.refundedAtomic || "0");
  if (input.revokedAt) return "revoked";
  if (input.disputedAt) return "disputed";
  if (input.expiredAt || (input.expiresAt && Date.parse(input.expiresAt) <= Date.now() && settled < maximum)) return "expired";
  if (refunded > 0n && refunded === settled) return "refunded";
  if (settled > 0n && settled === maximum) return "fully_settled";
  if (settled > 0n) return "partially_settled";
  if (captured > 0n) return "partially_captured";
  if (reserved > released && reserved > 0n) return "reserved";
  if (released > 0n && reserved === released) return "released";
  return input.activatedAt ? "active" : "created";
}

export function assertX402AccountingInvariants(auth = {}) {
  const maximum = positiveAtomic(auth.maximumAuthorizedAtomic, "maximumAuthorizedAtomic");
  const reserved = positiveAtomic(auth.reservedAtomic || "0", "reservedAtomic", { allowZero: true });
  const captured = positiveAtomic(auth.capturedAtomic || "0", "capturedAtomic", { allowZero: true });
  const settled = positiveAtomic(auth.settledAtomic || "0", "settledAtomic", { allowZero: true });
  const released = positiveAtomic(auth.releasedAtomic || "0", "releasedAtomic", { allowZero: true });
  const refunded = positiveAtomic(auth.refundedAtomic || "0", "refundedAtomic", { allowZero: true });
  if (reserved > maximum) throw error("reservedAmount exceeds maximumAuthorizedAmount", "X402_AUTH_OVER_RESERVE");
  if (captured > maximum || captured > reserved) throw error("capturedAmount exceeds reservedAmount or maximumAuthorizedAmount", "X402_AUTH_OVER_CAPTURE");
  if (settled > captured) throw error("settledAmount exceeds capturedAmount", "X402_AUTH_OVER_SETTLEMENT");
  if (refunded > settled) throw error("refundedAmount exceeds settledAmount", "X402_AUTH_OVER_REFUND");
  if (released > reserved) throw error("releasedAmount exceeds reservedAmount", "X402_AUTH_OVER_RELEASE");
  const remaining = maximum - captured;
  if (remaining < 0n) throw error("remainingAuthorization cannot be negative", "X402_AUTH_NEGATIVE_REMAINING");
  return { maximum, reserved, captured, settled, released, refunded, remaining };
}

export function createX402Authorization({ auditLog = {}, body = {}, policy = {}, now = new Date() } = {}) {
  if (auditLog.action !== "x402 Payment" || auditLog.decision !== "Allowed") throw error("A payment authorization can only be created from an Allowed x402 Payment audit", "X402_AUTH_NOT_ALLOWED");
  const x402 = auditLog.originalIntent?.action?.x402 || {};
  const mode = normalizeMode(body.mode || x402.mode || x402.scheme);
  if (mode === "exact") throw error("Exact payments use the Milestone 23 one-time settlement path", "X402_AUTH_EXACT_USES_DIRECT_SETTLEMENT");
  const policyModes = Array.isArray(policy?.structuredRules?.x402AllowedSchemes) ? policy.structuredRules.x402AllowedSchemes.map(lower) : ["exact"];
  if (!policyModes.includes(mode)) throw error(`x402 ${mode} payment mode is not permitted by the active policy`, "X402_AUTH_MODE_NOT_PERMITTED");
  const maxAtomic = clean(body.maximumAuthorizedAtomic || x402.maximumAuthorizedAtomic || x402.amountAtomic);
  positiveAtomic(maxAtomic, "maximumAuthorizedAtomic");
  const expiresAt = iso(body.expiresAt || x402.validUntil, "expiresAt");
  if (Date.parse(expiresAt) <= now.getTime()) throw error("Payment authorization is already expired", "X402_AUTH_EXPIRED");
  const unitPriceAtomic = mode === "metered" ? clean(body.unitPriceAtomic || x402.unitPriceAtomic) : "";
  if (mode === "metered") positiveAtomic(unitPriceAtomic, "unitPriceAtomic");
  const usageUnit = mode === "metered" ? safeRef(body.usageUnit || x402.usageUnit, "usageUnit") : "";
  const authorizationId = safeRef(body.authorizationId || `X402-AUTH-${hash([auditLog.id, x402.requestFingerprint, maxAtomic, mode, expiresAt].join("|"))}`, "authorizationId");
  const createdAt = now.toISOString();
  const auth = {
    authorizationId, auditLogId: auditLog.id, agentId: auditLog.agentId, mode,
    resourceId: safeRef(body.resourceId || x402.requestFingerprint, "resourceId"),
    providerId: safeRef(body.providerId || x402.merchantDomain, "providerId"),
    sessionId: safeRef(body.sessionId || x402.requestId || authorizationId, "sessionId"),
    requestFingerprint: safeRef(x402.requestFingerprint, "requestFingerprint"),
    paymentRequiredHash: HASH_32.test(clean(x402.paymentRequiredHash)) ? clean(x402.paymentRequiredHash).replace(/^0x/, "").toLowerCase() : "",
    network: safeRef(x402.network, "network"), asset: safeRef(x402.asset, "asset"), payTo: safeRef(x402.payTo, "payTo"),
    maximumAuthorizedAtomic: maxAtomic, reservedAtomic: "0", capturedAtomic: "0", settledAtomic: "0", releasedAtomic: "0", refundedAtomic: "0", remainingAuthorizationAtomic: maxAtomic,
    usageUnit, unitPriceAtomic, cumulativeUsage: "0", usageEventCount: 0,
    createdAt, activatedAt: createdAt, expiresAt, revokedAt: "", disputedAt: "", state: "active", events: [], version: 1,
  };
  assertX402AccountingInvariants(auth);
  auth.exposure = buildReservedExposureSnapshot({ maximumAtomic: auth.maximumAuthorizedAtomic, reservedAtomic: auth.reservedAtomic, capturedAtomic: auth.capturedAtomic, settledAtomic: auth.settledAtomic, releasedAtomic: auth.releasedAtomic, refundedAtomic: auth.refundedAtomic, asset: auth.asset, network: auth.network });
  return auth;
}

export function applyX402AuthorizationEvent(authInput = {}, eventInput = {}, { now = new Date() } = {}) {
  const auth = structuredClone(authInput);
  if (!auth.authorizationId) throw error("authorizationId is required", "X402_AUTH_NOT_FOUND");
  if (!STATES.has(lower(auth.state))) throw error("Stored authorization state is invalid", "X402_AUTH_INVALID_STATE", 409);
  const type = lower(eventInput.type);
  if (!EVENT_TYPES.has(type)) throw error(`Unsupported authorization event ${type || "missing"}`, "X402_AUTH_EVENT_UNSUPPORTED");
  const eventId = safeRef(eventInput.eventId, "eventId");
  const idempotencyKey = safeRef(eventInput.idempotencyKey, "idempotencyKey");
  const duplicate = uniqueEvent(auth, eventId, idempotencyKey);
  if (duplicate) return { authorization: auth, event: duplicate, duplicate: true };
  if (clean(eventInput.authorizationId) && clean(eventInput.authorizationId) !== auth.authorizationId) throw error("authorizationId does not match the bound authorization", "X402_AUTH_BINDING_MISMATCH");
  for (const [field, expected] of [["resourceId", auth.resourceId], ["providerId", auth.providerId], ["sessionId", auth.sessionId]]) {
    if (eventInput[field] !== undefined && clean(eventInput[field]) !== clean(expected)) throw error(`${field} does not match the authorization binding`, "X402_AUTH_BINDING_MISMATCH");
  }
  if (auth.revokedAt) throw error("Authorization has been revoked", "X402_AUTH_REVOKED", 409);
  if (Date.parse(auth.expiresAt) <= now.getTime()) throw error("Authorization has expired", "X402_AUTH_EXPIRED", 409);
  const before = assertX402AccountingInvariants(auth);
  let amount = 0n;
  let usageQuantity = 0n;
  let unitPrice = auth.unitPriceAtomic ? BigInt(auth.unitPriceAtomic) : 0n;
  if (["reserve", "capture", "settle", "release", "refund"].includes(type)) amount = positiveAtomic(eventInput.amountAtomic, "amountAtomic");
  if (type === "usage") {
    if (auth.mode !== "metered") throw error("Usage events require a metered authorization", "X402_AUTH_USAGE_MODE_REQUIRED");
    usageQuantity = positiveAtomic(eventInput.usageQuantity, "usageQuantity");
    if (eventInput.unitPriceAtomic !== undefined) {
      const supplied = positiveAtomic(eventInput.unitPriceAtomic, "unitPriceAtomic");
      if (supplied !== unitPrice) throw error("unitPriceAtomic does not match the authorization", "X402_AUTH_UNIT_PRICE_MISMATCH");
    }
    amount = usageQuantity * unitPrice;
  }
  let reserved = before.reserved, captured = before.captured, settled = before.settled, released = before.released, refunded = before.refunded;
  if (type === "reserve") reserved += amount;
  if (type === "capture" || type === "usage") captured += amount;
  if (type === "settle") settled += amount;
  if (type === "release") released += amount;
  if (type === "refund") refunded += amount;
  if ((type === "capture" || type === "usage") && captured > reserved) reserved = captured;
  if (type === "settle" && settled > captured) throw error("Settlement requires prior capture", "X402_AUTH_SETTLEMENT_WITHOUT_CAPTURE");
  if (type === "revoke") auth.revokedAt = now.toISOString();
  if (type === "dispute") auth.disputedAt = now.toISOString();
  auth.reservedAtomic = reserved.toString(); auth.capturedAtomic = captured.toString(); auth.settledAtomic = settled.toString(); auth.releasedAtomic = released.toString(); auth.refundedAtomic = refunded.toString();
  if (type === "usage") { auth.cumulativeUsage = (BigInt(auth.cumulativeUsage || "0") + usageQuantity).toString(); auth.usageEventCount = Number(auth.usageEventCount || 0) + 1; }
  const after = assertX402AccountingInvariants(auth);
  auth.remainingAuthorizationAtomic = after.remaining.toString();
  auth.state = deriveX402AuthorizationState(auth);
  auth.exposure = buildReservedExposureSnapshot({ maximumAtomic: auth.maximumAuthorizedAtomic, reservedAtomic: auth.reservedAtomic, capturedAtomic: auth.capturedAtomic, settledAtomic: auth.settledAtomic, releasedAtomic: auth.releasedAtomic, refundedAtomic: auth.refundedAtomic, asset: auth.asset, network: auth.network });
  const event = {
    eventId, idempotencyKey, type, amountAtomic: amount.toString(), usageQuantity: usageQuantity ? usageQuantity.toString() : "", unitPriceAtomic: unitPrice ? unitPrice.toString() : "",
    resourceId: auth.resourceId, providerId: auth.providerId, sessionId: auth.sessionId,
    resourceDeliveryReference: clean(eventInput.resourceDeliveryReference).slice(0, 256), providerAttestation: clean(eventInput.providerAttestation).slice(0, 512),
    evidenceHash: HASH_32.test(clean(eventInput.evidenceHash)) ? clean(eventInput.evidenceHash).replace(/^0x/, "").toLowerCase() : hash(eventInput.evidence || { eventId, type, amountAtomic: amount.toString() }),
    occurredAt: eventInput.occurredAt ? iso(eventInput.occurredAt, "occurredAt") : now.toISOString(), recordedAt: now.toISOString(),
  };
  auth.events = [...(Array.isArray(auth.events) ? auth.events : []), event].slice(-500);
  auth.updatedAt = now.toISOString(); auth.version = Number(auth.version || 1) + 1;
  return { authorization: auth, event, duplicate: false };
}

export function summarizeX402Authorization(auth = {}) {
  if (!auth?.authorizationId) return null;
  return {
    authorizationId: auth.authorizationId, mode: auth.mode, state: auth.state, network: auth.network, asset: auth.asset,
    maximumAuthorizedAtomic: auth.maximumAuthorizedAtomic, reservedAtomic: auth.reservedAtomic, capturedAtomic: auth.capturedAtomic, settledAtomic: auth.settledAtomic,
    releasedAtomic: auth.releasedAtomic, refundedAtomic: auth.refundedAtomic, remainingAuthorizationAtomic: auth.remainingAuthorizationAtomic,
    usageUnit: auth.usageUnit || "", unitPriceAtomic: auth.unitPriceAtomic || "", cumulativeUsage: auth.cumulativeUsage || "0", usageEventCount: Number(auth.usageEventCount || 0),
    expiresAt: auth.expiresAt, revokedAt: auth.revokedAt || "", exposure: auth.exposure || null, resourceId: auth.resourceId, providerId: auth.providerId, sessionId: auth.sessionId, updatedAt: auth.updatedAt || auth.createdAt,
  };
}
