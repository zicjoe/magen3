import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootUrl = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("integration verifier validates Across URLs structurally instead of with an unsafe URL substring check", async () => {
  const source = await read("scripts/integration/verify-integration-contract.mjs");
  assert.equal(source.includes('bridgeProviderIntegrationSource.includes("https://app.across.to/api")'), false);
  assert.equal(/\.includes\(["'`]https?:\/\//.test(source), false);
  assert.match(source, /new URL\(bridgeBaseUrlMatch\[1\]\)/);
  assert.match(source, /bridgeBaseUrl\?\.hostname !== "testnet\.across\.to"/);
  assert.match(source, /parsedBridgeUrl\.hostname === "app\.across\.to"/);
});
