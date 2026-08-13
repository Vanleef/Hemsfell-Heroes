import test from "node:test";
import { readFile } from "node:fs/promises";

test("diagnose generated action decision fixture", async () => {
  try {
    const source = await readFile(new URL("./action-decision-parity.test.mjs", import.meta.url), "utf8");
    const lines = source.split(/\r?\n/);
    console.log("GENERATED ACTION DECISION PARITY TEST:\n" + lines.slice(0, 140).map((line, index) => `${index + 1}: ${line}`).join("\n"));
  } catch (error) {
    console.log("action-decision-parity.test.mjs unavailable before test execution:", error?.message || error);
  }
});
