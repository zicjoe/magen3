import { createHash } from "node:crypto";

const TESTNETS = new Set(["eip155:84532"]);
const MAX_JSON_BYTES = 256_000;
const MAX_RESOURCE_BYTES = 1_000_000;

function clean(v) { return String(v ?? "").trim(); }
function hash(v) { return createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex"); }
function err(message, status = 400, code = "X402_INVALID") { const e = new Error(message); e.status = status; e.code = code; return e; }

export function x402FacilitatorConfig(env = process.env) {
  const base = clean(env.X402_TESTNET_FACILITATOR_URL || "https://x402.org/facilitator").replace(/\/+$/, "");
  const parsed = new URL(base);
  if (parsed.protocol !== "https:") throw err("X402_TESTNET_FACILITATOR_URL must use HTTPS", 500, "X402_CONFIG");
  return { baseUrl: base, verifyUrl: `${base}/verify`, settleUrl: `${base}/settle`, timeoutMs: Math.min(30_000, Math.max(1_000, Number(env.X402_FACILITATOR_TIMEOUT_MS || 12_000))) };
}

export function validateLiveX402Input({ auditLog, body = {} }) {
  if (!auditLog || auditLog.action !== "x402 Payment" || auditLog.decision !== "Allowed") throw err("Live x402 execution requires an Allowed x402 Payment audit", 409, "X402_NOT_ALLOWED");
  const x402 = auditLog.originalIntent?.action?.x402 || {};
  const network = clean(x402.network || x402.x402Network).toLowerCase();
  if (!TESTNETS.has(network)) throw err(`Live x402 settlement is testnet-only; unsupported network ${network || "missing"}`, 400, "X402_MAINNET_DISABLED");
  const expected = clean(x402.requestFingerprint).toLowerCase();
  if (!expected || expected !== clean(body.requestFingerprint).toLowerCase()) throw err("requestFingerprint does not match the authorized payment", 400, "X402_BINDING_MISMATCH");
  const paymentPayload = body.paymentPayload;
  if (!paymentPayload || typeof paymentPayload !== "object" || Array.isArray(paymentPayload)) throw err("paymentPayload is required after wallet signing", 400, "X402_PAYMENT_PAYLOAD_REQUIRED");
  const requirements = body.paymentRequirements || x402.paymentRequirements;
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) throw err("paymentRequirements are required", 400, "X402_REQUIREMENTS_REQUIRED");
  const requirementHash = hash(requirements);
  const expectedRequirementHash = clean(x402.paymentRequiredHash).replace(/^0x/, "").toLowerCase();
  if (expectedRequirementHash && requirementHash !== expectedRequirementHash) throw err("paymentRequirements changed after authorization", 400, "X402_REQUIREMENTS_MUTATED");
  const resourceUrl = clean(x402.resourceUrl);
  const method = clean(x402.httpMethod || "GET").toUpperCase();
  return { x402, network, expected, paymentPayload, requirements, resourceUrl, method, requirementHash };
}

async function postJson(url, payload, { timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal, redirect: "error" });
    const text = await response.text();
    if (text.length > MAX_JSON_BYTES) throw err("Facilitator response exceeded the configured bound", 502, "X402_PROVIDER_OVERSIZE");
    let json = {};
    try { json = text ? JSON.parse(text) : {}; } catch { throw err("Facilitator returned malformed JSON", 502, "X402_PROVIDER_MALFORMED"); }
    return { ok: response.ok, status: response.status, json };
  } finally { clearTimeout(timer); }
}

function assertResourceUrl(resourceUrl) {
  const url = new URL(resourceUrl);
  if (url.protocol !== "https:") throw err("Protected resource retry requires HTTPS", 400, "X402_RESOURCE_HTTPS_REQUIRED");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || /^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(host)) throw err("Private or local resource hosts are not permitted", 400, "X402_RESOURCE_SSRF_BLOCKED");
  return url;
}

export async function executeLiveX402({ auditLog, body = {}, fetchImpl = fetch, env = process.env }) {
  const input = validateLiveX402Input({ auditLog, body });
  const config = x402FacilitatorConfig(env);
  const facilitatorPayload = { x402Version: Number(input.x402.version || 2), paymentPayload: input.paymentPayload, paymentRequirements: input.requirements };
  const lifecycle = [{ state: "authorization_signed", at: new Date().toISOString(), evidenceHash: hash(input.paymentPayload) }];

  const verified = await postJson(config.verifyUrl, facilitatorPayload, { ...config, fetchImpl });
  lifecycle.push({ state: verified.ok && verified.json?.isValid !== false ? "authorization_verified" : "authorization_rejected", at: new Date().toISOString(), providerStatus: verified.status, reason: clean(verified.json?.invalidReason || verified.json?.errorReason) });
  if (!verified.ok || verified.json?.isValid === false) return { ok: false, phase: "verify", status: "failed", lifecycle, facilitator: { id: "x402.org", verify: verified.json }, settlement: null, resource: null };

  const settled = await postJson(config.settleUrl, facilitatorPayload, { ...config, fetchImpl });
  const txHash = clean(settled.json?.transaction || settled.json?.transactionHash || settled.json?.txHash);
  const settlementSuccess = settled.ok && settled.json?.success !== false;
  lifecycle.push({ state: settlementSuccess ? "payment_settled" : "payment_failed", at: new Date().toISOString(), providerStatus: settled.status, transactionHash: txHash, reason: clean(settled.json?.errorReason) });
  if (!settlementSuccess) return { ok: false, phase: "settle", status: settled.status >= 500 ? "uncertain" : "failed", lifecycle, facilitator: { id: "x402.org", verify: verified.json, settle: settled.json }, settlement: { transactionHash: txHash, network: input.network }, resource: null };

  const url = assertResourceUrl(input.resourceUrl);
  const requestHeaders = { ...(body.resourceHeaders && typeof body.resourceHeaders === "object" ? body.resourceHeaders : {}), "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(input.paymentPayload)).toString("base64") };
  delete requestHeaders.authorization; delete requestHeaders.Authorization; delete requestHeaders.cookie; delete requestHeaders.Cookie;
  const resourceResponse = await fetchImpl(url, { method: input.method, headers: requestHeaders, body: ["GET", "HEAD"].includes(input.method) ? undefined : clean(body.resourceBody), redirect: "error" });
  const resourceText = await resourceResponse.text();
  if (resourceText.length > MAX_RESOURCE_BYTES) throw err("Protected resource response exceeded the configured bound", 502, "X402_RESOURCE_OVERSIZE");
  const delivered = resourceResponse.ok;
  lifecycle.push({ state: "resource_requested_again", at: new Date().toISOString(), httpStatus: resourceResponse.status });
  lifecycle.push({ state: delivered ? "resource_delivered" : "resource_delivery_failed", at: new Date().toISOString(), httpStatus: resourceResponse.status, responseHash: hash(resourceText) });
  return {
    ok: delivered,
    phase: delivered ? "delivered" : "resource",
    status: "confirmed",
    lifecycle,
    facilitator: { id: "x402.org", verify: verified.json, settle: settled.json },
    settlement: { transactionHash: txHash, network: input.network, responseHeader: clean(resourceResponse.headers.get("PAYMENT-RESPONSE")) },
    resource: { delivered, status: resourceResponse.status, contentType: clean(resourceResponse.headers.get("content-type")), bodyHash: hash(resourceText), body: body.includeResourceBody === true ? resourceText : undefined },
  };
}
