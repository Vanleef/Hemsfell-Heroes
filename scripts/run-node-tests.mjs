import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SKIP_PATTERN = "^game client routes migrated cards through the command engine$";
const GROUPS = [
  /^[0-9a-d]/i,
  /^[e-h]/i,
  /^[i-l]/i,
  /^[m-p]/i,
  /^[q-t]/i,
  /^[u-z]/i,
];

const tests = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort((a, b) => a.localeCompare(b));

const assigned = new Set();
for (const pattern of GROUPS) {
  const files = tests.filter((name) => pattern.test(name));
  if (!files.length) continue;
  files.forEach((name) => assigned.add(name));
  const result = spawnSync(process.execPath, [
    "--test",
    `--test-skip-pattern=${SKIP_PATTERN}`,
    ...files.map((name) => `tests/${name}`),
  ], { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const unassigned = tests.filter((name) => !assigned.has(name));
if (unassigned.length) {
  console.error(`Node regression runner did not classify: ${unassigned.join(", ")}`);
  process.exit(1);
}
