import { readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const files = (await readdir("tests")).filter((name) => name.endsWith(".test.mjs")).sort();
const failures = [];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--test", `tests/${file}`], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

for (const file of files) {
  const { code, output } = await run(file);
  if (code !== 0) {
    failures.push({ file, output: output.split("\n").slice(-160).join("\n") });
    console.log(`FAIL ${file}`);
  } else {
    console.log(`PASS ${file}`);
  }
}

const report = failures.length
  ? failures.map(({ file, output }) => `===== ${file} =====\n${output}`).join("\n\n")
  : "ALL TEST FILES PASSED\n";
await writeFile("p1-test-diagnostic.txt", report);
if (failures.length) process.exitCode = 1;
