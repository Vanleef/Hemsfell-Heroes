import { readFile } from "node:fs/promises";

for (const path of ["tests/action-decision-parity.test.mjs", "tests/rules-engine.test.mjs"]) {
  try {
    const source = await readFile(path, "utf8");
    if (path.includes("action-decision")) {
      const lines = source.split(/\r?\n/);
      console.log("--- generated action-decision parity test (lines 1-140) ---");
      console.log(lines.slice(0, 140).map((line, index) => `${index + 1}: ${line}`).join("\n"));
    } else {
      const title = 'test("p46 TRANQUEIRA shares the same turnCardsPlayed counter with Sr. Goblin"';
      const start = source.indexOf(title);
      console.log("--- generated TRANQUEIRA legacy test ---");
      console.log(start >= 0 ? source.slice(start, source.indexOf("\n});", start) + 4) : "legacy TRANQUEIRA test not found");
    }
  } catch (error) {
    console.log(`Diagnostic file unavailable: ${path}: ${error?.message || error}`);
  }
}
