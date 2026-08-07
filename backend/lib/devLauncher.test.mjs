import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("default dev command launches the combined frontend/backend development runner", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.dev, "node scripts/dev/start-dev.mjs");
  const source = readFileSync(new URL("../../scripts/dev/start-dev.mjs", import.meta.url), "utf8");
  assert.match(source, /backend\/server\.mjs/);
  assert.match(source, /start\("frontend", "vite"/);
  assert.match(source, /ALLOW_MEMORY_STORE/);
  assert.match(source, /DATABASE_URL/);
});
