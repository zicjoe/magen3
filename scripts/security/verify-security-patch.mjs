import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const lockfile = await readFile(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");

const expectedOverrides = {
  postcss: "8.5.18",
  "fast-uri": "3.1.4",
};

for (const [name, version] of Object.entries(expectedOverrides)) {
  if (packageJson.pnpm?.overrides?.[name] !== version) {
    throw new Error(`package.json must override ${name} to ${version}`);
  }
  if (!lockfile.includes(`${name}: ${version}`) || !lockfile.includes(`${name}@${version}:`)) {
    throw new Error(`pnpm-lock.yaml is not pinned to ${name} ${version}`);
  }
}

for (const vulnerable of ["postcss@8.5.15", "postcss: 8.5.15", "fast-uri@3.1.3", "fast-uri: 3.1.3"]) {
  if (lockfile.includes(vulnerable)) {
    throw new Error(`pnpm-lock.yaml still contains vulnerable resolution ${vulnerable}`);
  }
}

const providerPaths = [
  "backend/lib/complianceControls.mjs",
  "backend/lib/oracleValidation.mjs",
  "backend/lib/threatIntelligence.mjs",
];

for (const path of providerPaths) {
  const source = await readFile(new URL(`../../${path}`, import.meta.url), "utf8");
  if (source.includes("credentialFingerprint") || source.includes('from "node:crypto"')) {
    throw new Error(`${path} still derives cache identity from provider credentials`);
  }
  if (!source.includes("readUtf8FileLimited")) {
    throw new Error(`${path} does not use the single-handle feed reader`);
  }
}

try {
  await access(new URL("../../examples/real-agent-client/index.mjs", import.meta.url), constants.F_OK);
  throw new Error("Obsolete examples/real-agent-client/index.mjs must be removed before commit");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Security patch verification passed.");
