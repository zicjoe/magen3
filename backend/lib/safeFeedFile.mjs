import { open } from "node:fs/promises";

export async function readUtf8FileLimited(filePath, { maxBytes, sourceLabel = "Configured feed" } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maxBytes must be a positive safe integer");
  }

  const handle = await open(filePath, "r");
  try {
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) {
      throw new Error(`${sourceLabel} must be a regular file`);
    }
    if (fileStats.size > maxBytes) {
      throw new Error(`${sourceLabel} exceeds the ${maxBytes}-byte safety limit`);
    }

    const raw = await handle.readFile({ encoding: "utf8" });
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw new Error(`${sourceLabel} exceeds the ${maxBytes}-byte safety limit`);
    }
    return raw;
  } finally {
    await handle.close().catch(() => {});
  }
}
