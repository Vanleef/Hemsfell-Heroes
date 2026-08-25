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

function failureExcerpt(output) {
  const lines = output.split("\n");
  const indexes = lines.flatMap((line, index) => /^not ok\b/.test(line.trim()) ? [index] : []);
  if (!indexes.length) return lines.slice(-220).join("\n");
  const chunks = indexes.map((index) => lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 48)).join("\n"));
  const summaryIndex = lines.findIndex((line) => /^# fail\s+[1-9]/.test(line.trim()));
  if (summaryIndex >= 0) chunks.push(lines.slice(Math.max(0, summaryIndex - 4), Math.min(lines.length, summaryIndex + 6)).join("\n"));
  return chunks.join("\n\n---\n\n");
}

for (const file of files) {
  const { code, output } = await run(file);
  if (code !== 0) {
    failures.push({ file, output: failureExcerpt(output) });
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
