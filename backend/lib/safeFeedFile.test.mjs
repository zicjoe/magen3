import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readUtf8FileLimited } from "./safeFeedFile.mjs";

test("reads a configured feed through one open file handle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "magen3-safe-feed-"));
  const path = join(dir, "feed.json");
  await writeFile(path, '{"ok":true}', "utf8");
  assert.equal(await readUtf8FileLimited(path, { maxBytes: 1024, sourceLabel: "Test feed" }), '{"ok":true}');
});

test("rejects oversized configured feeds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "magen3-safe-feed-"));
  const path = join(dir, "feed.json");
  await writeFile(path, "x".repeat(33), "utf8");
  await assert.rejects(readUtf8FileLimited(path, { maxBytes: 32, sourceLabel: "Test feed" }), /exceeds the 32-byte safety limit/);
});

test("rejects directories and other non-regular feed paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "magen3-safe-feed-"));
  const child = join(dir, "feed-dir");
  await mkdir(child);
  await assert.rejects(readUtf8FileLimited(child, { maxBytes: 1024, sourceLabel: "Test feed" }), /must be a regular file/);
});
