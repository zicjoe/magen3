import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function makePseudoHash(prefix) {
  return `${prefix}${randomBytes(12).toString("hex")}`;
}

export function makeApiKey() {
  return `magen3_live_${randomBytes(24).toString("base64url")}`;
}

export function hashSecret(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function secretMatches(value, expectedHash) {
  if (!value || !expectedHash) return false;
  const actual = Buffer.from(hashSecret(value), "hex");
  const expected = Buffer.from(String(expectedHash), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function apiKeyPreview(value) {
  const key = String(value || "");
  if (key.length <= 12) return key;
  return `${key.slice(0, 11)}...${key.slice(-6)}`;
}
