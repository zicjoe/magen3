import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providers = [
  "backend/lib/complianceControls.mjs",
  "backend/lib/oracleValidation.mjs",
  "backend/lib/threatIntelligence.mjs",
];

test("provider cache keys never hash or embed provider credentials", async () => {
  for (const path of providers) {
    const source = await readFile(path, "utf8");
    assert.equal(source.includes('from "node:crypto"'), false, `${path} must not import crypto for credential fingerprints`);
    assert.equal(source.includes("credentialFingerprint"), false, `${path} must not retain credential fingerprints`);
    assert.match(source, /authenticationMode/, `${path} should cache only the non-secret authentication mode`);
  }
});

test("provider file loaders use the shared single-handle reader", async () => {
  for (const path of providers) {
    const source = await readFile(path, "utf8");
    assert.match(source, /readUtf8FileLimited/, `${path} must use the race-safe file reader`);
    assert.equal(/\bstat\s*\(/.test(source), false, `${path} must not check a path and then reopen it`);
    assert.equal(/\breadFile\s*\(source\.value/.test(source), false, `${path} must not reopen a checked path`);
  }
});
