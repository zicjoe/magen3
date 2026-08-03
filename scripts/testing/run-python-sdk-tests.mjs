import { delimiter } from "node:path";
import { spawnSync } from "node:child_process";

const args = ["-m", "unittest", "discover", "-s", "packages/sdk-python/tests", "-v"];
const candidates = process.platform === "win32"
  ? [["py", ["-3", ...args]], ["python", args], ["python3", args]]
  : [["python3", args], ["python", args]];

const env = {
  ...process.env,
  PYTHONPATH: ["packages/sdk-python/src", process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};

for (const [command, commandArgs] of candidates) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", env, shell: false });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

console.error("Python 3 was not found. Install Python 3 or make py/python/python3 available on PATH.");
process.exit(1);
