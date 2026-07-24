import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");

test("MCP intent schema accepts bounded unsigned token-permission metadata", () => {
  assert.match(source, /tokenPermission:\s*tokenPermissionSchema\.optional\(\)/);
  assert.match(source, /permitSignatureHash:\s*z\.string\(\)\.regex/);
  assert.match(source, /batch:\s*z\.array\(tokenPermissionBatchItemSchema\)\.max\(100\)/);
  assert.doesNotMatch(source, /permitSignature:\s*z\./);
  assert.doesNotMatch(source, /signedPermit:\s*z\./);
});
