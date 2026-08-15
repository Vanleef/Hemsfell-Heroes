import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const engine = readFileSync(new URL("../app/rules-engine/engine-base.mjs", import.meta.url), "utf8");

test("activation UI does not read Home game state from module scope", () => {
  assert.doesNotMatch(page, /unit\.enteredRound===game\?\.round/);
  assert.match(page, /if\(auxiliary&&\(unit\.exhausted\|\|unit\.summoning\)\)return false/);
});

test("authoritative engine still rejects same-round auxiliary activations", () => {
  assert.match(engine, /source\.enteredRound === state\.round/);
});
